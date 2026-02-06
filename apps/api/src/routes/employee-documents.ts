import crypto from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { z } from 'zod';

import db from '../db/index.js';
import {
	employee,
	employeeDocumentVersion,
	employeeLegalGeneration,
	jobPosition,
	legalDocumentKind,
	member,
	organizationDocumentRequirement,
	organizationDocumentWorkflowConfig,
	organizationLegalBranding,
	organizationLegalTemplate,
	location,
} from '../db/schema.js';
import { combinedAuthPlugin, type AuthSession } from '../plugins/auth.js';
import {
	documentWorkflowConfigUpdateSchema,
	employeeDocumentConfirmSchema,
	employeeDocumentHistoryQuerySchema,
	employeeDocumentPresignSchema,
	employeeDocumentRequirementKeyEnum,
	employeeDocumentReviewSchema,
	legalBrandingConfirmSchema,
	legalBrandingPresignSchema,
	legalDigitalSignConfirmSchema,
	legalDocumentKindEnum,
	legalGenerationCreateSchema,
	legalPhysicalSignConfirmSchema,
	legalTemplateDraftSchema,
	legalTemplateUpdateSchema,
	MAX_EMPLOYEE_DOCUMENT_SIZE_BYTES,
} from '../schemas/employee-documents.js';
import {
	calculateEmployeeDocumentProgress,
	ensureDocumentWorkflowSetup,
	type EmployeeDocumentProgressSummary,
	type EmployeeDocumentRequirementKeyValue,
} from '../services/employee-documents.js';
import {
	createRailwayPresignedGetUrl,
	createRailwayPresignedPost,
	getRailwayBucketConfig,
	headRailwayObject,
	putRailwayObject,
} from '../services/railway-bucket.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { resolveOrganizationId } from '../utils/organization.js';

const ALLOWED_CONTENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbClient = typeof db | DbTransaction;

type MemberRole = 'owner' | 'admin' | 'member';

type EmployeeAccessContext = {
	organizationId: string;
	userId: string;
	role: MemberRole;
};

type EmployeeRecord = {
	id: string;
	organizationId: string | null;
	firstName: string;
	lastName: string;
	code: string;
	rfc: string | null;
	nss: string | null;
	hireDate: Date | null;
	jobPositionName: string | null;
	locationName: string | null;
};

const LEGAL_REQUIREMENT_BY_KIND: Record<
	(typeof legalDocumentKind.enumValues)[number],
	EmployeeDocumentRequirementKeyValue
> = {
	CONTRACT: 'SIGNED_CONTRACT',
	NDA: 'SIGNED_NDA',
};

const LEGAL_KIND_BY_REQUIREMENT: Partial<
	Record<EmployeeDocumentRequirementKeyValue, (typeof legalDocumentKind.enumValues)[number]>
> = {
	SIGNED_CONTRACT: 'CONTRACT',
	SIGNED_NDA: 'NDA',
};

const DEFAULT_TEMPLATE_VARIABLES: Record<string, unknown> = {
	employee: {
		fullName: 'string',
		code: 'string',
		rfc: 'string|null',
		nss: 'string|null',
		jobPositionName: 'string|null',
		locationName: 'string|null',
		hireDate: 'string|null',
	},
	document: {
		generatedDate: 'string',
	},
};

/**
 * Sanitizes file names to prevent path traversal and unsafe key values.
 *
 * @param fileName - Original file name
 * @returns Sanitized file name
 */
function sanitizeFileName(fileName: string): string {
	return fileName
		.replace(/[\\/]+/g, '_')
		.replace(/\s+/g, '_')
		.replace(/[^a-zA-Z0-9._-]/g, '_')
		.slice(0, 200);
}

/**
 * Checks whether bucket dependency errors are caused by missing AWS SDK modules.
 *
 * @param error - Unknown error value
 * @returns True when dependencies are missing
 */
function isBucketDependencyError(error: unknown): boolean {
	return error instanceof Error && error.message.includes('@aws-sdk');
}

/**
 * Resolves the signed requirement key for a legal kind.
 *
 * @param kind - Legal document kind
 * @returns Requirement key used in employee document versions
 */
function resolveRequirementKeyForKind(
	kind: (typeof legalDocumentKind.enumValues)[number],
): EmployeeDocumentRequirementKeyValue {
	return LEGAL_REQUIREMENT_BY_KIND[kind];
}

/**
 * Resolves legal kind for signed requirement keys.
 *
 * @param requirementKey - Requirement key
 * @returns Matching legal kind or null when not legal
 */
function resolveKindForRequirement(
	requirementKey: EmployeeDocumentRequirementKeyValue,
): (typeof legalDocumentKind.enumValues)[number] | null {
	return LEGAL_KIND_BY_REQUIREMENT[requirementKey] ?? null;
}

/**
 * Builds a deterministic SHA-256 digest for string content.
 *
 * @param value - Content to hash
 * @returns SHA-256 hex digest
 */
function sha256Hex(value: string): string {
	return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Builds the object key prefix used by employee requirement uploads.
 *
 * @param args - Key parts
 * @returns Bucket key prefix
 */
function buildEmployeeRequirementPrefix(args: {
	organizationId: string;
	employeeId: string;
	requirementKey: EmployeeDocumentRequirementKeyValue;
}): string {
	return `org/${args.organizationId}/employees/${args.employeeId}/documents/${args.requirementKey}/`;
}

/**
 * Builds object key for employee requirement documents.
 *
 * @param args - Key parts
 * @returns Full object key
 */
function buildEmployeeRequirementObjectKey(args: {
	organizationId: string;
	employeeId: string;
	requirementKey: EmployeeDocumentRequirementKeyValue;
	docVersionId: string;
	fileName: string;
}): string {
	const prefix = buildEmployeeRequirementPrefix(args);
	return `${prefix}${args.docVersionId}-${sanitizeFileName(args.fileName)}`;
}

/**
 * Builds the object key prefix used by legal branding uploads.
 *
 * @param organizationId - Organization identifier
 * @returns Branding object key prefix
 */
function buildLegalBrandingPrefix(organizationId: string): string {
	return `org/${organizationId}/document-workflow/branding/`;
}

/**
 * Builds an object key for legal branding logo uploads.
 *
 * @param args - Branding key parts
 * @returns Branding object key
 */
function buildLegalBrandingObjectKey(args: {
	organizationId: string;
	fileName: string;
}): string {
	const safeName = sanitizeFileName(args.fileName);
	const logoId = crypto.randomUUID();
	return `${buildLegalBrandingPrefix(args.organizationId)}${logoId}-${safeName}`;
}

/**
 * Builds the object key prefix used by digitally signed legal artifacts.
 *
 * @param args - Key parts
 * @returns Prefix string
 */
function buildDigitalSignedPrefix(args: {
	organizationId: string;
	employeeId: string;
	kind: (typeof legalDocumentKind.enumValues)[number];
}): string {
	return `org/${args.organizationId}/employees/${args.employeeId}/legal/${args.kind}/digital/`;
}

/**
 * Builds an object key for a digitally signed legal artifact.
 *
 * @param args - Key parts
 * @returns Full bucket object key
 */
function buildDigitalSignedObjectKey(args: {
	organizationId: string;
	employeeId: string;
	kind: (typeof legalDocumentKind.enumValues)[number];
	generationId: string;
}): string {
	const suffix = `${args.generationId}-${Date.now()}.json`;
	return `${buildDigitalSignedPrefix(args)}${suffix}`;
}

/**
 * Parses and validates API content types for document uploads.
 *
 * @param contentType - MIME type from request body
 * @returns True when supported
 */
function isAllowedDocumentContentType(contentType: string): boolean {
	return ALLOWED_CONTENT_TYPES.has(contentType);
}

/**
 * Resolves the active organization and session membership role for the caller.
 *
 * @param args - Auth context
 * @param set - Elysia status setter
 * @returns Access context when authorized, otherwise null
 */
async function resolveEmployeeAccessContext(
	args: {
		authType: 'session' | 'apiKey';
		session: AuthSession | null;
		sessionOrganizationIds: string[];
		apiKeyOrganizationId: string | null;
		apiKeyOrganizationIds: string[];
		requestedOrganizationId?: string | null;
	},
	set: { status?: number | string } & Record<string, unknown>,
): Promise<EmployeeAccessContext | null> {
	const organizationId = resolveOrganizationId({
		authType: args.authType,
		session: args.session,
		sessionOrganizationIds: args.sessionOrganizationIds,
		apiKeyOrganizationId: args.apiKeyOrganizationId,
		apiKeyOrganizationIds: args.apiKeyOrganizationIds,
		requestedOrganizationId: args.requestedOrganizationId ?? null,
	});

	if (!organizationId) {
		const status = args.authType === 'apiKey' ? 403 : 400;
		set.status = status;
		return null;
	}

	if (args.authType !== 'session' || !args.session) {
		set.status = 403;
		return null;
	}

	const membershipRows = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(
				eq(member.organizationId, organizationId),
				eq(member.userId, args.session.userId),
			),
		)
		.limit(1);

	const role = membershipRows[0]?.role;
	if (role !== 'owner' && role !== 'admin' && role !== 'member') {
		set.status = 403;
		return null;
	}

	return {
		organizationId,
		userId: args.session.userId,
		role,
	};
}

/**
 * Ensures the caller is owner/admin.
 *
 * @param access - Access context
 * @param set - Elysia status setter
 * @returns True when caller can perform privileged actions
 */
function ensureAdminOrOwner(
	access: EmployeeAccessContext,
	set: { status?: number | string } & Record<string, unknown>,
): boolean {
	if (access.role === 'owner' || access.role === 'admin') {
		return true;
	}
	set.status = 403;
	return false;
}

/**
 * Ensures the caller can upload the next version for a requirement.
 *
 * Rules:
 * - owner/admin can always upload
 * - member can only upload when no previous version exists for that requirement
 *
 * @param args - Access context and requirement scope
 * @param set - Elysia status setter
 * @returns True when upload is allowed
 */
async function ensureCanUploadRequirementVersion(
	args: {
		access: EmployeeAccessContext;
		organizationId: string;
		employeeId: string;
		requirementKey: EmployeeDocumentRequirementKeyValue;
	},
	set: { status?: number | string } & Record<string, unknown>,
): Promise<boolean> {
	if (args.access.role === 'owner' || args.access.role === 'admin') {
		return true;
	}

	if (args.access.role !== 'member') {
		set.status = 403;
		return false;
	}

	const existing = await db
		.select({ id: employeeDocumentVersion.id })
		.from(employeeDocumentVersion)
		.where(
			and(
				eq(employeeDocumentVersion.organizationId, args.organizationId),
				eq(employeeDocumentVersion.employeeId, args.employeeId),
				eq(employeeDocumentVersion.requirementKey, args.requirementKey),
			),
		)
		.limit(1);

	if (existing.length > 0) {
		set.status = 403;
		return false;
	}

	return true;
}

/**
 * Loads an employee record ensuring it belongs to the active organization.
 *
 * @param organizationId - Organization identifier
 * @param employeeId - Employee identifier
 * @returns Employee details or null when not found
 */
async function fetchEmployeeRecord(
	organizationId: string,
	employeeId: string,
): Promise<EmployeeRecord | null> {
	const rows = await db
		.select({
			id: employee.id,
			organizationId: employee.organizationId,
			firstName: employee.firstName,
			lastName: employee.lastName,
			code: employee.code,
			rfc: employee.rfc,
			nss: employee.nss,
			hireDate: employee.hireDate,
			jobPositionName: jobPosition.name,
			locationName: location.name,
		})
		.from(employee)
		.leftJoin(jobPosition, eq(employee.jobPositionId, jobPosition.id))
		.leftJoin(location, eq(employee.locationId, location.id))
		.where(and(eq(employee.id, employeeId), eq(employee.organizationId, organizationId)))
		.limit(1);

	return rows[0] ?? null;
}

/**
 * Validates an upload payload against global file constraints.
 *
 * @param body - Upload payload
 * @param set - Elysia status setter
 * @returns True when valid
 */
function validateUploadPayload(
	body: { contentType: string; sizeBytes: number },
	set: { status?: number | string } & Record<string, unknown>,
): boolean {
	if (!isAllowedDocumentContentType(body.contentType)) {
		set.status = 400;
		return false;
	}

	if (body.sizeBytes > MAX_EMPLOYEE_DOCUMENT_SIZE_BYTES) {
		set.status = 400;
		return false;
	}

	return true;
}

/**
 * Validates content details against bucket object metadata.
 *
 * @param body - Request payload containing file metadata
 * @param objectHead - HeadObject result
 * @returns True when object metadata matches request expectations
 */
function objectMatchesRequest(
	body: { contentType: string; sizeBytes: number },
	objectHead: { ContentLength?: number; ContentType?: string },
): boolean {
	const contentLength = objectHead.ContentLength ?? 0;
	if (contentLength !== body.sizeBytes) {
		return false;
	}

	if (contentLength > MAX_EMPLOYEE_DOCUMENT_SIZE_BYTES) {
		return false;
	}

	if (objectHead.ContentType && objectHead.ContentType !== body.contentType) {
		return false;
	}

	return true;
}

/**
 * Extracts a comparable date key for generated legal variables.
 *
 * @returns Date key in YYYY-MM-DD format
 */
function getTodayDateKey(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * Converts nullable date values into date keys.
 *
 * @param value - Date value
 * @returns Date key or null
 */
function toDateKey(value: Date | null): string | null {
	if (!value) {
		return null;
	}
	return value.toISOString().slice(0, 10);
}

/**
 * Builds template replacement variables from employee data.
 *
 * @param employeeRecord - Employee row
 * @returns Variable payload used for legal template rendering
 */
function buildLegalVariablesSnapshot(employeeRecord: EmployeeRecord): Record<string, unknown> {
	return {
		employee: {
			fullName: `${employeeRecord.firstName} ${employeeRecord.lastName}`.trim(),
			code: employeeRecord.code,
			rfc: employeeRecord.rfc,
			nss: employeeRecord.nss,
			jobPositionName: employeeRecord.jobPositionName,
			locationName: employeeRecord.locationName,
			hireDate: toDateKey(employeeRecord.hireDate),
		},
		document: {
			generatedDate: getTodayDateKey(),
		},
	};
}

/**
 * Escapes HTML-sensitive characters to prevent markup/script injection in template output.
 *
 * @param value - Raw text value
 * @returns HTML-escaped value
 */
function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

/**
 * Flattens nested variable snapshots into template token/value pairs.
 *
 * @param snapshot - Variables snapshot object
 * @returns Token map using template token notation
 */
function flattenTemplateVariables(snapshot: Record<string, unknown>): Record<string, string> {
	const values: Record<string, string> = {};

	/**
	 * Recursive walker for nested variable records.
	 *
	 * @param prefix - Key prefix path
	 * @param value - Current nested value
	 * @returns Nothing
	 */
	const walk = (prefix: string, value: unknown): void => {
		if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
			for (const [nestedKey, nestedValue] of Object.entries(
				value as Record<string, unknown>,
			)) {
				const nextPrefix = prefix ? `${prefix}.${nestedKey}` : nestedKey;
				walk(nextPrefix, nestedValue);
			}
			return;
		}

		values[`{{${prefix}}}`] =
			value === null || value === undefined ? '' : escapeHtml(String(value));
	};

	walk('', snapshot);
	return values;
}

/**
 * Renders legal HTML by replacing known template tokens.
 *
 * @param htmlContent - Raw template HTML content
 * @param variables - Variables snapshot
 * @returns Rendered HTML output
 */
function renderLegalHtml(htmlContent: string, variables: Record<string, unknown>): string {
	const flattened = flattenTemplateVariables(variables);
	let rendered = htmlContent;

	for (const [token, value] of Object.entries(flattened)) {
		rendered = rendered.split(token).join(value);
	}

	return rendered;
}

/**
 * Returns current document rows for an employee.
 *
 * @param tx - Database client
 * @param organizationId - Organization identifier
 * @param employeeId - Employee identifier
 * @returns Current document rows
 */
async function fetchCurrentDocumentRows(
	tx: DbClient,
	organizationId: string,
	employeeId: string,
): Promise<
	Pick<
		typeof employeeDocumentVersion.$inferSelect,
		'id' | 'employeeId' | 'requirementKey' | 'reviewStatus'
	>[]
> {
	return await tx
		.select({
			id: employeeDocumentVersion.id,
			employeeId: employeeDocumentVersion.employeeId,
			requirementKey: employeeDocumentVersion.requirementKey,
			reviewStatus: employeeDocumentVersion.reviewStatus,
		})
		.from(employeeDocumentVersion)
		.where(
			and(
				eq(employeeDocumentVersion.organizationId, organizationId),
				eq(employeeDocumentVersion.employeeId, employeeId),
				eq(employeeDocumentVersion.isCurrent, true),
			),
		);
}

/**
 * Computes workflow progress summary for an employee.
 *
 * @param tx - Database client
 * @param organizationId - Organization identifier
 * @param employeeId - Employee identifier
 * @returns Workflow config, requirements and calculated progress
 */
async function fetchEmployeeWorkflowSummary(
	tx: DbClient,
	organizationId: string,
	employeeId: string,
): Promise<{
	config: typeof organizationDocumentWorkflowConfig.$inferSelect;
	requirements: (typeof organizationDocumentRequirement.$inferSelect)[];
	progress: EmployeeDocumentProgressSummary;
}> {
	const { config, requirements } = await ensureDocumentWorkflowSetup(tx, organizationId);
	const currentRows = await fetchCurrentDocumentRows(tx, organizationId, employeeId);
	const progress = calculateEmployeeDocumentProgress(
		requirements,
		config.baseApprovedThresholdForLegal,
		currentRows,
	);
	return { config, requirements, progress };
}

/**
 * Ensures legal stage is unlocked for the employee.
 *
 * @param tx - Database client
 * @param organizationId - Organization identifier
 * @param employeeId - Employee identifier
 * @returns Progress summary
 * @throws Error when legal gate is locked
 */
async function requireLegalGateUnlocked(
	tx: DbClient,
	organizationId: string,
	employeeId: string,
): Promise<EmployeeDocumentProgressSummary> {
	const summary = await fetchEmployeeWorkflowSummary(tx, organizationId, employeeId);
	if (!summary.progress.gateUnlocked) {
		throw new Error('LEGAL_GATE_LOCKED');
	}
	return summary.progress;
}

/**
 * Loads the latest generation per legal kind for an employee.
 *
 * @param organizationId - Organization identifier
 * @param employeeId - Employee identifier
 * @returns Map keyed by legal kind
 */
async function fetchLatestGenerationByKind(
	organizationId: string,
	employeeId: string,
): Promise<
	Partial<
		Record<
			(typeof legalDocumentKind.enumValues)[number],
			typeof employeeLegalGeneration.$inferSelect
		>
	>
> {
	const rows = await db
		.select()
		.from(employeeLegalGeneration)
		.where(
			and(
				eq(employeeLegalGeneration.organizationId, organizationId),
				eq(employeeLegalGeneration.employeeId, employeeId),
			),
		)
		.orderBy(desc(employeeLegalGeneration.generatedAt));

	const latest: Partial<
		Record<
			(typeof legalDocumentKind.enumValues)[number],
			typeof employeeLegalGeneration.$inferSelect
		>
	> = {};

	for (const row of rows) {
		if (!latest[row.kind]) {
			latest[row.kind] = row;
		}
	}

	return latest;
}

/**
 * Resolves the next document version number and deactivates current row.
 *
 * @param tx - Database transaction
 * @param organizationId - Organization identifier
 * @param employeeId - Employee identifier
 * @param requirementKey - Requirement key
 * @returns Next version number
 */
async function prepareNextDocumentVersion(
	tx: DbTransaction,
	organizationId: string,
	employeeId: string,
	requirementKey: EmployeeDocumentRequirementKeyValue,
): Promise<number> {
	const latestVersion = await tx
		.select({ versionNumber: employeeDocumentVersion.versionNumber })
		.from(employeeDocumentVersion)
		.where(
			and(
				eq(employeeDocumentVersion.organizationId, organizationId),
				eq(employeeDocumentVersion.employeeId, employeeId),
				eq(employeeDocumentVersion.requirementKey, requirementKey),
			),
		)
		.orderBy(desc(employeeDocumentVersion.versionNumber))
		.limit(1);

	await tx
		.update(employeeDocumentVersion)
		.set({ isCurrent: false })
		.where(
			and(
				eq(employeeDocumentVersion.organizationId, organizationId),
				eq(employeeDocumentVersion.employeeId, employeeId),
				eq(employeeDocumentVersion.requirementKey, requirementKey),
				eq(employeeDocumentVersion.isCurrent, true),
			),
		);

	const nextVersion = (latestVersion[0]?.versionNumber ?? 0) + 1;
	return nextVersion;
}

/**
 * Validates requirement-specific payload fields.
 *
 * @param requirementKey - Requirement key
 * @param body - Confirm payload
 * @returns Error message when invalid, otherwise null
 */
function validateRequirementSpecificPayload(
	requirementKey: EmployeeDocumentRequirementKeyValue,
	body: {
		generationId?: string;
		identificationSubtype?: string;
		employmentProfileSubtype?: string;
	},
): string | null {
	if (requirementKey === 'IDENTIFICATION' && !body.identificationSubtype) {
		return 'identificationSubtype is required for IDENTIFICATION documents';
	}
	if (requirementKey === 'EMPLOYMENT_PROFILE' && !body.employmentProfileSubtype) {
		return 'employmentProfileSubtype is required for EMPLOYMENT_PROFILE documents';
	}
	if (
		(requirementKey === 'SIGNED_CONTRACT' || requirementKey === 'SIGNED_NDA') &&
		!body.generationId
	) {
		return 'generationId is required for signed legal documents';
	}
	return null;
}

/**
 * Ensures legal generation belongs to employee, organization and required kind.
 *
 * @param args - Generation lookup arguments
 * @returns Generation record when valid
 */
async function requireLegalGeneration(args: {
	organizationId: string;
	employeeId: string;
	generationId: string;
	kind?: (typeof legalDocumentKind.enumValues)[number];
}): Promise<typeof employeeLegalGeneration.$inferSelect | null> {
	const rows = await db
		.select()
		.from(employeeLegalGeneration)
		.where(
			and(
				eq(employeeLegalGeneration.id, args.generationId),
				eq(employeeLegalGeneration.organizationId, args.organizationId),
				eq(employeeLegalGeneration.employeeId, args.employeeId),
			),
		)
		.limit(1);

	const generation = rows[0] ?? null;
	if (!generation) {
		return null;
	}

	if (args.kind && generation.kind !== args.kind) {
		return null;
	}

	return generation;
}

/**
 * Resolves latest published template for a legal kind.
 *
 * @param organizationId - Organization identifier
 * @param kind - Legal document kind
 * @returns Published template or null
 */
async function fetchLatestPublishedTemplate(
	organizationId: string,
	kind: (typeof legalDocumentKind.enumValues)[number],
): Promise<typeof organizationLegalTemplate.$inferSelect | null> {
	const rows = await db
		.select()
		.from(organizationLegalTemplate)
		.where(
			and(
				eq(organizationLegalTemplate.organizationId, organizationId),
				eq(organizationLegalTemplate.kind, kind),
				eq(organizationLegalTemplate.status, 'PUBLISHED'),
			),
		)
		.orderBy(desc(organizationLegalTemplate.versionNumber))
		.limit(1);

	return rows[0] ?? null;
}

/**
 * Resolves a legal template by id, organization and optional kind.
 *
 * @param args - Template lookup args
 * @returns Template record or null
 */
async function fetchTemplateById(args: {
	organizationId: string;
	templateId: string;
	kind?: (typeof legalDocumentKind.enumValues)[number];
}): Promise<typeof organizationLegalTemplate.$inferSelect | null> {
	const rows = await db
		.select()
		.from(organizationLegalTemplate)
		.where(
			and(
				eq(organizationLegalTemplate.id, args.templateId),
				eq(organizationLegalTemplate.organizationId, args.organizationId),
			),
		)
		.limit(1);

	const template = rows[0] ?? null;
	if (!template) {
		return null;
	}
	if (args.kind && template.kind !== args.kind) {
		return null;
	}
	return template;
}

const employeeIdParamsSchema = z.object({
	id: z.string().uuid(),
});

const employeeRequirementReferenceParamsSchema = z.object({
	id: z.string().uuid(),
	documentRef: employeeDocumentRequirementKeyEnum,
});

const employeeDocumentVersionReferenceParamsSchema = z.object({
	id: z.string().uuid(),
	documentRef: z.string().uuid(),
});

const employeeLegalKindParamsSchema = z.object({
	id: z.string().uuid(),
	kind: legalDocumentKindEnum,
});

const workflowTemplateKindRefParamsSchema = z.object({
	templateRef: legalDocumentKindEnum,
});

const workflowTemplateIdRefParamsSchema = z.object({
	templateRef: z.string().uuid(),
});

/**
 * Employee document workflow routes.
 */
export const employeeDocumentRoutes = new Elysia()
	.use(combinedAuthPlugin)
	/**
	 * Returns employee document progress summary and active requirement states.
	 */
	.get(
		'/employees/:id/documents/summary',
		async ({
			params,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!ensureAdminOrOwner(access, set)) {
				return buildErrorResponse('Not authorized', 403);
			}

			const employeeRecord = await fetchEmployeeRecord(access.organizationId, params.id);
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			const summary = await fetchEmployeeWorkflowSummary(db, access.organizationId, params.id);
			const latestGenerations = await fetchLatestGenerationByKind(access.organizationId, params.id);

			const currentRows = await db
				.select()
				.from(employeeDocumentVersion)
				.where(
					and(
						eq(employeeDocumentVersion.organizationId, access.organizationId),
						eq(employeeDocumentVersion.employeeId, params.id),
						eq(employeeDocumentVersion.isCurrent, true),
					),
				);

			const currentByRequirement = new Map(
				currentRows.map((row) => [row.requirementKey, row] as const),
			);

			return {
				data: {
					employeeId: params.id,
					employeeName: `${employeeRecord.firstName} ${employeeRecord.lastName}`.trim(),
					baseApprovedThresholdForLegal:
						summary.config.baseApprovedThresholdForLegal,
					gateUnlocked: summary.progress.gateUnlocked,
					baseApprovedCount: summary.progress.baseApprovedCount,
					documentProgressPercent: summary.progress.documentProgressPercent,
					documentMissingCount: summary.progress.documentMissingCount,
					documentWorkflowStatus: summary.progress.documentWorkflowStatus,
					approvedRequiredActive: summary.progress.approvedRequiredActive,
					totalRequiredActive: summary.progress.totalRequiredActive,
					requirements: summary.requirements.map((requirement) => ({
						requirementKey: requirement.requirementKey,
						isRequired: requirement.isRequired,
						displayOrder: requirement.displayOrder,
						activationStage: requirement.activationStage,
						isActive: summary.progress.activeRequiredKeys.includes(
							requirement.requirementKey,
						),
						currentVersion:
							currentByRequirement.get(requirement.requirementKey) ?? null,
					})),
					latestGenerations,
				},
			};
		},
		{
			params: employeeIdParamsSchema,
		},
	)
	/**
	 * Returns current employee documents and paginated version history.
	 */
	.get(
		'/employees/:id/documents',
		async ({
			params,
			query,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!ensureAdminOrOwner(access, set)) {
				return buildErrorResponse('Not authorized', 403);
			}

			const employeeRecord = await fetchEmployeeRecord(access.organizationId, params.id);
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			const historyWhere = [
				eq(employeeDocumentVersion.organizationId, access.organizationId),
				eq(employeeDocumentVersion.employeeId, params.id),
			] as const;

			const filterByRequirement = query.requirementKey
				? eq(employeeDocumentVersion.requirementKey, query.requirementKey)
				: null;

			const fullWhere = filterByRequirement
				? and(...historyWhere, filterByRequirement)
				: and(...historyWhere);

			const current = await db
				.select()
				.from(employeeDocumentVersion)
				.where(and(...historyWhere, eq(employeeDocumentVersion.isCurrent, true)))
				.orderBy(asc(employeeDocumentVersion.requirementKey));

			const history = await db
				.select()
				.from(employeeDocumentVersion)
				.where(fullWhere)
				.orderBy(desc(employeeDocumentVersion.uploadedAt))
				.limit(query.limit)
				.offset(query.offset);

			const historyCountRows = await db
				.select({ id: employeeDocumentVersion.id })
				.from(employeeDocumentVersion)
				.where(fullWhere);

			return {
				data: {
					current,
					history,
				},
				pagination: {
					total: historyCountRows.length,
					limit: query.limit,
					offset: query.offset,
					hasMore: query.offset + history.length < historyCountRows.length,
				},
			};
		},
		{
			params: employeeIdParamsSchema,
			query: employeeDocumentHistoryQuerySchema,
		},
	)
	/**
	 * Creates a presigned POST payload for employee requirement uploads.
	 */
	.post(
		'/employees/:id/documents/:documentRef/presign',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!validateUploadPayload(body, set)) {
				return buildErrorResponse('Invalid document upload payload', 400);
			}

			const employeeRecord = await fetchEmployeeRecord(access.organizationId, params.id);
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			if (
				!(
					await ensureCanUploadRequirementVersion(
						{
							access,
							organizationId: access.organizationId,
							employeeId: params.id,
							requirementKey: params.documentRef,
						},
						set,
					)
				)
			) {
				return buildErrorResponse(
					'Only admin/owner can upload a new version when a document already exists',
					403,
				);
			}

			let bucketConfig: ReturnType<typeof getRailwayBucketConfig>;
			try {
				bucketConfig = getRailwayBucketConfig();
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Bucket not configured',
					400,
					{ code: 'EMPLOYEE_DOCUMENT_BUCKET_NOT_CONFIGURED' },
				);
			}

			const docVersionId = crypto.randomUUID();
			const objectKey = buildEmployeeRequirementObjectKey({
				organizationId: access.organizationId,
				employeeId: params.id,
				requirementKey: params.documentRef,
				docVersionId,
				fileName: body.fileName,
			});

			let presigned: Awaited<ReturnType<typeof createRailwayPresignedPost>>;
			try {
				presigned = await createRailwayPresignedPost({
					key: objectKey,
					contentType: body.contentType,
					maxSizeBytes: MAX_EMPLOYEE_DOCUMENT_SIZE_BYTES,
				});
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Bucket not configured',
					400,
					{ code: 'EMPLOYEE_DOCUMENT_BUCKET_NOT_CONFIGURED' },
				);
			}

			return {
				data: {
					url: presigned.url,
					fields: presigned.fields,
					docVersionId,
					objectKey,
					bucket: bucketConfig.bucket,
				},
			};
		},
		{
			params: employeeRequirementReferenceParamsSchema,
			body: employeeDocumentPresignSchema,
		},
	)
	/**
	 * Confirms a previously uploaded requirement document and stores a new version.
	 */
	.post(
		'/employees/:id/documents/:documentRef/confirm',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!validateUploadPayload(body, set)) {
				return buildErrorResponse('Invalid document upload payload', 400);
			}

			const employeeRecord = await fetchEmployeeRecord(access.organizationId, params.id);
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			if (
				!(
					await ensureCanUploadRequirementVersion(
						{
							access,
							organizationId: access.organizationId,
							employeeId: params.id,
							requirementKey: params.documentRef,
						},
						set,
					)
				)
			) {
				return buildErrorResponse(
					'Only admin/owner can upload a new version when a document already exists',
					403,
				);
			}

				const requirementValidationError = validateRequirementSpecificPayload(
					params.documentRef,
					body,
				);
				if (requirementValidationError) {
					set.status = 400;
					return buildErrorResponse(requirementValidationError, 400);
				}

				if (body.source === 'DIGITAL_SIGNATURE') {
					set.status = 400;
					return buildErrorResponse(
						'DIGITAL_SIGNATURE source is only allowed through legal sign-digital confirmation',
						400,
					);
				}

			const expectedPrefix = buildEmployeeRequirementPrefix({
				organizationId: access.organizationId,
				employeeId: params.id,
				requirementKey: params.documentRef,
			});

			if (!body.objectKey.startsWith(expectedPrefix)) {
				set.status = 400;
				return buildErrorResponse('Invalid document object key', 400);
			}

			let bucketConfig: ReturnType<typeof getRailwayBucketConfig>;
			try {
				bucketConfig = getRailwayBucketConfig();
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Bucket not configured',
					400,
					{ code: 'EMPLOYEE_DOCUMENT_BUCKET_NOT_CONFIGURED' },
				);
			}

			let objectHead: Awaited<ReturnType<typeof headRailwayObject>>;
			try {
				objectHead = await headRailwayObject({ key: body.objectKey });
			} catch (error) {
				set.status = 400;
				if (isBucketDependencyError(error)) {
					return buildErrorResponse(
						error instanceof Error ? error.message : 'Bucket not configured',
						400,
						{ code: 'EMPLOYEE_DOCUMENT_BUCKET_NOT_CONFIGURED' },
					);
				}
				return buildErrorResponse('Document not found in bucket', 400, {
					code: 'EMPLOYEE_DOCUMENT_NOT_FOUND',
				});
			}

			if (!objectMatchesRequest(body, objectHead)) {
				set.status = 400;
				return buildErrorResponse('Document content mismatch', 400, {
					code: 'EMPLOYEE_DOCUMENT_INVALID',
				});
			}

			if (body.generationId) {
				const expectedKind = resolveKindForRequirement(params.documentRef);
				if (expectedKind) {
					const generation = await requireLegalGeneration({
						organizationId: access.organizationId,
						employeeId: params.id,
						generationId: body.generationId,
						kind: expectedKind,
					});
					if (!generation) {
						set.status = 400;
						return buildErrorResponse('Invalid legal generation reference', 400);
					}
				}
			}

				const source =
					body.source === 'PHYSICAL_SIGNED_UPLOAD' ? 'PHYSICAL_SIGNED_UPLOAD' : 'UPLOAD';

			const inserted = await db.transaction(async (tx) => {
				const versionNumber = await prepareNextDocumentVersion(
					tx,
					access.organizationId,
					params.id,
					params.documentRef,
				);

				const row = await tx
					.insert(employeeDocumentVersion)
					.values({
						id: body.docVersionId,
						organizationId: access.organizationId,
						employeeId: params.id,
							requirementKey: params.documentRef,
							versionNumber,
							isCurrent: true,
							reviewStatus: 'PENDING_REVIEW',
							reviewComment: null,
							reviewedByUserId: null,
							reviewedAt: null,
							source,
							generationId: body.generationId ?? null,
							identificationSubtype: body.identificationSubtype ?? null,
							employmentProfileSubtype: body.employmentProfileSubtype ?? null,
							signedAtDateKey: body.signedAtDateKey ?? null,
							verifiedByUserId: null,
							bucket: bucketConfig.bucket,
							objectKey: body.objectKey,
							fileName: body.fileName,
						contentType: body.contentType,
						sizeBytes: body.sizeBytes,
						sha256: body.sha256,
						uploadedByUserId: access.userId,
						metadata: body.metadata ?? null,
					})
					.returning();

				return row[0] ?? null;
			});

			if (!inserted) {
				set.status = 500;
				return buildErrorResponse('Unable to confirm document', 500);
			}

			return { data: inserted };
		},
		{
			params: employeeRequirementReferenceParamsSchema,
			body: employeeDocumentConfirmSchema,
		},
	)
	/**
	 * Returns a presigned GET URL for an employee document version.
	 */
	.get(
		'/employees/:id/documents/:documentRef/url',
		async ({
			params,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!ensureAdminOrOwner(access, set)) {
				return buildErrorResponse('Not authorized', 403);
			}

			const rows = await db
				.select({
					id: employeeDocumentVersion.id,
					employeeId: employeeDocumentVersion.employeeId,
					objectKey: employeeDocumentVersion.objectKey,
				})
				.from(employeeDocumentVersion)
				.where(
					and(
						eq(employeeDocumentVersion.id, params.documentRef),
						eq(employeeDocumentVersion.organizationId, access.organizationId),
					),
				)
				.limit(1);

			const documentRow = rows[0] ?? null;
			if (!documentRow || documentRow.employeeId !== params.id) {
				set.status = 404;
				return buildErrorResponse('Document not found', 404);
			}

			try {
				const url = await createRailwayPresignedGetUrl({ key: documentRow.objectKey });
				return { data: { url } };
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Bucket not configured',
					400,
					{ code: 'EMPLOYEE_DOCUMENT_BUCKET_NOT_CONFIGURED' },
				);
			}
		},
		{
			params: employeeDocumentVersionReferenceParamsSchema,
		},
	)
	/**
	 * Approves or rejects a current employee document version.
	 */
	.post(
		'/employees/:id/documents/:documentRef/review',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!ensureAdminOrOwner(access, set)) {
				return buildErrorResponse('Not authorized', 403);
			}

			const rows = await db
				.select()
				.from(employeeDocumentVersion)
				.where(
					and(
						eq(employeeDocumentVersion.id, params.documentRef),
						eq(employeeDocumentVersion.organizationId, access.organizationId),
						eq(employeeDocumentVersion.employeeId, params.id),
					),
				)
				.limit(1);

				const currentDocument = rows[0] ?? null;
				if (!currentDocument) {
					set.status = 404;
					return buildErrorResponse('Document not found', 404);
				}

				if (!currentDocument.isCurrent) {
					set.status = 409;
					return buildErrorResponse('Only current document versions can be reviewed', 409);
				}

				const [updated] = await db
					.update(employeeDocumentVersion)
				.set({
					reviewStatus: body.reviewStatus,
					reviewComment:
						body.reviewStatus === 'REJECTED'
							? (body.reviewComment ?? null)
							: null,
						reviewedByUserId: access.userId,
						reviewedAt: new Date(),
					})
					.where(
						and(
							eq(employeeDocumentVersion.id, currentDocument.id),
							eq(employeeDocumentVersion.isCurrent, true),
						),
					)
					.returning();

				if (!updated) {
					set.status = 409;
					return buildErrorResponse('Only current document versions can be reviewed', 409);
				}

				return { data: updated ?? null };
		},
		{
			params: employeeDocumentVersionReferenceParamsSchema,
			body: employeeDocumentReviewSchema,
		},
	)
	/**
	 * Generates a legal document instance from the latest published template.
	 */
	.post(
		'/employees/:id/legal-documents/:kind/generations',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!ensureAdminOrOwner(access, set)) {
				return buildErrorResponse('Not authorized', 403);
			}

			const employeeRecord = await fetchEmployeeRecord(access.organizationId, params.id);
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			try {
				await requireLegalGateUnlocked(db, access.organizationId, params.id);
			} catch {
				set.status = 409;
				return buildErrorResponse('Legal document gate is locked for this employee', 409);
			}

			let template: typeof organizationLegalTemplate.$inferSelect | null = null;
			if (body.templateId) {
				template = await fetchTemplateById({
					organizationId: access.organizationId,
					templateId: body.templateId,
					kind: params.kind,
				});
				if (!template) {
					set.status = 404;
					return buildErrorResponse('Template not found', 404);
				}
				if (template.status !== 'PUBLISHED') {
					set.status = 400;
					return buildErrorResponse('Template must be published before generation', 400);
				}
			} else {
				template = await fetchLatestPublishedTemplate(access.organizationId, params.kind);
				if (!template) {
					set.status = 404;
					return buildErrorResponse('No published template found for this kind', 404);
				}
			}

			const variablesSnapshot = buildLegalVariablesSnapshot(employeeRecord);
			const renderedHtml = renderLegalHtml(template.htmlContent, variablesSnapshot);
			const generatedHtmlHash = sha256Hex(renderedHtml);

			const inserted = await db
				.insert(employeeLegalGeneration)
				.values({
					organizationId: access.organizationId,
					employeeId: params.id,
					kind: params.kind,
					templateId: template.id,
					templateVersionNumber: template.versionNumber,
					generatedHtmlHash,
					generatedPdfHash: null,
					variablesSnapshot,
					generatedByUserId: access.userId,
				})
				.returning();

			return {
				data: {
					generation: inserted[0] ?? null,
					template,
					renderedHtml,
					variablesSnapshot,
				},
			};
		},
		{
			params: employeeLegalKindParamsSchema,
			body: legalGenerationCreateSchema,
		},
	)
	/**
	 * Confirms a digital legal signature and stores an auto-approved signed document.
	 */
	.post(
		'/employees/:id/legal-documents/:kind/sign-digital/confirm',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!ensureAdminOrOwner(access, set)) {
				return buildErrorResponse('Not authorized', 403);
			}

			const employeeRecord = await fetchEmployeeRecord(access.organizationId, params.id);
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			try {
				await requireLegalGateUnlocked(db, access.organizationId, params.id);
			} catch {
				set.status = 409;
				return buildErrorResponse('Legal document gate is locked for this employee', 409);
			}

			const generation = await requireLegalGeneration({
				organizationId: access.organizationId,
				employeeId: params.id,
				generationId: body.generationId,
				kind: params.kind,
			});
			if (!generation) {
				set.status = 400;
				return buildErrorResponse('Invalid legal generation reference', 400);
			}

			let bucketConfig: ReturnType<typeof getRailwayBucketConfig>;
			try {
				bucketConfig = getRailwayBucketConfig();
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Bucket not configured',
					400,
					{ code: 'EMPLOYEE_DOCUMENT_BUCKET_NOT_CONFIGURED' },
				);
			}

			const digitalPayload = {
				generationId: generation.id,
				kind: params.kind,
				signedAtDateKey: body.signedAtDateKey ?? getTodayDateKey(),
				signatureDataUrl: body.signatureDataUrl ?? null,
				metadata: body.metadata ?? null,
			};
			const digitalPayloadString = JSON.stringify(digitalPayload);
			const objectKey = buildDigitalSignedObjectKey({
				organizationId: access.organizationId,
				employeeId: params.id,
				kind: params.kind,
				generationId: generation.id,
			});

			try {
				await putRailwayObject({
					key: objectKey,
					contentType: 'application/json',
					body: digitalPayloadString,
				});
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Unable to store digital signed artifact',
					400,
					{ code: 'EMPLOYEE_DOCUMENT_BUCKET_NOT_CONFIGURED' },
				);
			}

			const requirementKey = resolveRequirementKeyForKind(params.kind);
			const inserted = await db.transaction(async (tx) => {
				const versionNumber = await prepareNextDocumentVersion(
					tx,
					access.organizationId,
					params.id,
					requirementKey,
				);

				const rows = await tx
					.insert(employeeDocumentVersion)
					.values({
						organizationId: access.organizationId,
						employeeId: params.id,
						requirementKey,
						versionNumber,
						isCurrent: true,
						reviewStatus: 'APPROVED',
						reviewComment: null,
						reviewedByUserId: access.userId,
						reviewedAt: new Date(),
						source: 'DIGITAL_SIGNATURE',
						generationId: generation.id,
						signedAtDateKey: body.signedAtDateKey ?? getTodayDateKey(),
						verifiedByUserId: access.userId,
						bucket: bucketConfig.bucket,
						objectKey,
						fileName: `${params.kind.toLowerCase()}-firma-digital.json`,
						contentType: 'application/json',
						sizeBytes: Buffer.byteLength(digitalPayloadString),
						sha256: sha256Hex(digitalPayloadString),
						uploadedByUserId: access.userId,
						metadata: {
							...(body.metadata ?? {}),
							signatureDataUrl: body.signatureDataUrl ?? null,
							digitalSignedAt: new Date().toISOString(),
						},
					})
					.returning();

				return rows[0] ?? null;
			});

			return { data: inserted };
		},
		{
			params: employeeLegalKindParamsSchema,
			body: legalDigitalSignConfirmSchema,
		},
	)
	/**
	 * Creates presigned POST payload for physically signed legal documents.
	 */
	.post(
		'/employees/:id/legal-documents/:kind/sign-physical/presign',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!ensureAdminOrOwner(access, set)) {
				return buildErrorResponse('Not authorized', 403);
			}

			if (!validateUploadPayload(body, set)) {
				return buildErrorResponse('Invalid document upload payload', 400);
			}

			const employeeRecord = await fetchEmployeeRecord(access.organizationId, params.id);
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			try {
				await requireLegalGateUnlocked(db, access.organizationId, params.id);
			} catch {
				set.status = 409;
				return buildErrorResponse('Legal document gate is locked for this employee', 409);
			}

			let bucketConfig: ReturnType<typeof getRailwayBucketConfig>;
			try {
				bucketConfig = getRailwayBucketConfig();
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Bucket not configured',
					400,
					{ code: 'EMPLOYEE_DOCUMENT_BUCKET_NOT_CONFIGURED' },
				);
			}

			const docVersionId = crypto.randomUUID();
			const requirementKey = resolveRequirementKeyForKind(params.kind);
			const objectKey = buildEmployeeRequirementObjectKey({
				organizationId: access.organizationId,
				employeeId: params.id,
				requirementKey,
				docVersionId,
				fileName: body.fileName,
			});

			let presigned: Awaited<ReturnType<typeof createRailwayPresignedPost>>;
			try {
				presigned = await createRailwayPresignedPost({
					key: objectKey,
					contentType: body.contentType,
					maxSizeBytes: MAX_EMPLOYEE_DOCUMENT_SIZE_BYTES,
				});
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Bucket not configured',
					400,
					{ code: 'EMPLOYEE_DOCUMENT_BUCKET_NOT_CONFIGURED' },
				);
			}

			return {
				data: {
					url: presigned.url,
					fields: presigned.fields,
					docVersionId,
					objectKey,
					bucket: bucketConfig.bucket,
				},
			};
		},
		{
			params: employeeLegalKindParamsSchema,
			body: employeeDocumentPresignSchema,
		},
	)
	/**
	 * Confirms a physically signed legal document upload.
	 */
	.post(
		'/employees/:id/legal-documents/:kind/sign-physical/confirm',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!ensureAdminOrOwner(access, set)) {
				return buildErrorResponse('Not authorized', 403);
			}

			if (!validateUploadPayload(body, set)) {
				return buildErrorResponse('Invalid document upload payload', 400);
			}

			const employeeRecord = await fetchEmployeeRecord(access.organizationId, params.id);
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			try {
				await requireLegalGateUnlocked(db, access.organizationId, params.id);
			} catch {
				set.status = 409;
				return buildErrorResponse('Legal document gate is locked for this employee', 409);
			}

			const generation = await requireLegalGeneration({
				organizationId: access.organizationId,
				employeeId: params.id,
				generationId: body.generationId,
				kind: params.kind,
			});
			if (!generation) {
				set.status = 400;
				return buildErrorResponse('Invalid legal generation reference', 400);
			}

			let bucketConfig: ReturnType<typeof getRailwayBucketConfig>;
			try {
				bucketConfig = getRailwayBucketConfig();
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Bucket not configured',
					400,
					{ code: 'EMPLOYEE_DOCUMENT_BUCKET_NOT_CONFIGURED' },
				);
			}

			const requirementKey = resolveRequirementKeyForKind(params.kind);
			const expectedPrefix = buildEmployeeRequirementPrefix({
				organizationId: access.organizationId,
				employeeId: params.id,
				requirementKey,
			});
			if (!body.objectKey.startsWith(expectedPrefix)) {
				set.status = 400;
				return buildErrorResponse('Invalid document object key', 400);
			}

			let objectHead: Awaited<ReturnType<typeof headRailwayObject>>;
			try {
				objectHead = await headRailwayObject({ key: body.objectKey });
			} catch (error) {
				set.status = 400;
				if (isBucketDependencyError(error)) {
					return buildErrorResponse(
						error instanceof Error ? error.message : 'Bucket not configured',
						400,
						{ code: 'EMPLOYEE_DOCUMENT_BUCKET_NOT_CONFIGURED' },
					);
				}
				return buildErrorResponse('Document not found in bucket', 400, {
					code: 'EMPLOYEE_DOCUMENT_NOT_FOUND',
				});
			}

			if (!objectMatchesRequest(body, objectHead)) {
				set.status = 400;
				return buildErrorResponse('Document content mismatch', 400, {
					code: 'EMPLOYEE_DOCUMENT_INVALID',
				});
			}

			const inserted = await db.transaction(async (tx) => {
				const versionNumber = await prepareNextDocumentVersion(
					tx,
					access.organizationId,
					params.id,
					requirementKey,
				);

				const rows = await tx
					.insert(employeeDocumentVersion)
					.values({
						id: body.docVersionId,
						organizationId: access.organizationId,
						employeeId: params.id,
						requirementKey,
						versionNumber,
						isCurrent: true,
						reviewStatus: 'PENDING_REVIEW',
						reviewComment: null,
						reviewedByUserId: null,
						reviewedAt: null,
						source: 'PHYSICAL_SIGNED_UPLOAD',
						generationId: generation.id,
						signedAtDateKey: body.signedAtDateKey ?? null,
						verifiedByUserId: null,
						bucket: bucketConfig.bucket,
						objectKey: body.objectKey,
						fileName: body.fileName,
						contentType: body.contentType,
						sizeBytes: body.sizeBytes,
						sha256: body.sha256,
						uploadedByUserId: access.userId,
						metadata: body.metadata ?? null,
					})
					.returning();

				return rows[0] ?? null;
			});

			return { data: inserted };
		},
		{
			params: employeeLegalKindParamsSchema,
			body: legalPhysicalSignConfirmSchema,
		},
	)
	/**
	 * Returns document workflow configuration for the active organization.
	 */
	.get(
		'/document-workflow/config',
		async ({
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!ensureAdminOrOwner(access, set)) {
				return buildErrorResponse('Not authorized', 403);
			}

			const { config, requirements } = await ensureDocumentWorkflowSetup(
				db,
				access.organizationId,
			);

			return {
				data: {
					config,
					requirements,
				},
			};
		},
	)
	/**
	 * Updates workflow configuration for the active organization.
	 */
	.put(
		'/document-workflow/config',
		async ({
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!ensureAdminOrOwner(access, set)) {
				return buildErrorResponse('Not authorized', 403);
			}

			await db.transaction(async (tx) => {
				await ensureDocumentWorkflowSetup(tx, access.organizationId);

				if (body.baseApprovedThresholdForLegal !== undefined) {
					await tx
						.update(organizationDocumentWorkflowConfig)
						.set({
							baseApprovedThresholdForLegal: body.baseApprovedThresholdForLegal,
						})
						.where(
							eq(organizationDocumentWorkflowConfig.organizationId, access.organizationId),
						);
				}

				if (body.requirements && body.requirements.length > 0) {
					for (const requirement of body.requirements) {
						await tx
							.update(organizationDocumentRequirement)
							.set({
								isRequired: requirement.isRequired,
								displayOrder: requirement.displayOrder,
								activationStage: requirement.activationStage,
							})
							.where(
								and(
									eq(
										organizationDocumentRequirement.organizationId,
										access.organizationId,
									),
									eq(
										organizationDocumentRequirement.requirementKey,
										requirement.requirementKey,
									),
								),
							);
					}
				}
			});

			const { config, requirements } = await ensureDocumentWorkflowSetup(db, access.organizationId);
			return {
				data: {
					config,
					requirements,
				},
			};
		},
		{
			body: documentWorkflowConfigUpdateSchema,
		},
	)
	/**
	 * Lists templates for the requested legal kind.
	 */
	.get(
		'/document-workflow/templates/:templateRef',
		async ({
			params,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!ensureAdminOrOwner(access, set)) {
				return buildErrorResponse('Not authorized', 403);
			}

			const templates = await db
				.select()
				.from(organizationLegalTemplate)
				.where(
					and(
						eq(organizationLegalTemplate.organizationId, access.organizationId),
							eq(organizationLegalTemplate.kind, params.templateRef),
						),
					)
				.orderBy(desc(organizationLegalTemplate.versionNumber));

			return { data: templates };
		},
		{
			params: workflowTemplateKindRefParamsSchema,
		},
	)
	/**
	 * Creates a new draft template version.
	 */
	.post(
		'/document-workflow/templates/:templateRef/draft',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!ensureAdminOrOwner(access, set)) {
				return buildErrorResponse('Not authorized', 403);
			}

			const latest = await db
				.select({ versionNumber: organizationLegalTemplate.versionNumber })
				.from(organizationLegalTemplate)
				.where(
					and(
						eq(organizationLegalTemplate.organizationId, access.organizationId),
							eq(organizationLegalTemplate.kind, params.templateRef),
						),
					)
				.orderBy(desc(organizationLegalTemplate.versionNumber))
				.limit(1);

			const branding = await db
				.select()
				.from(organizationLegalBranding)
				.where(eq(organizationLegalBranding.organizationId, access.organizationId))
				.limit(1);

			const inserted = await db
				.insert(organizationLegalTemplate)
				.values({
					organizationId: access.organizationId,
						kind: params.templateRef,
					versionNumber: (latest[0]?.versionNumber ?? 0) + 1,
					status: 'DRAFT',
					htmlContent: body.htmlContent,
					variablesSchemaSnapshot: body.variablesSchemaSnapshot ?? DEFAULT_TEMPLATE_VARIABLES,
					brandingSnapshot: branding[0] ?? null,
					createdByUserId: access.userId,
				})
				.returning();

			return { data: inserted[0] ?? null };
		},
		{
			params: workflowTemplateKindRefParamsSchema,
			body: legalTemplateDraftSchema,
		},
	)
	/**
	 * Updates an existing legal template.
	 */
	.put(
		'/document-workflow/templates/:templateRef',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!ensureAdminOrOwner(access, set)) {
				return buildErrorResponse('Not authorized', 403);
			}

			const template = await fetchTemplateById({
				organizationId: access.organizationId,
					templateId: params.templateRef,
				});
			if (!template) {
				set.status = 404;
				return buildErrorResponse('Template not found', 404);
			}

			const updated = await db
				.update(organizationLegalTemplate)
				.set({
					htmlContent: body.htmlContent ?? template.htmlContent,
					status: body.status ?? template.status,
					variablesSchemaSnapshot:
						body.variablesSchemaSnapshot ?? template.variablesSchemaSnapshot,
				})
				.where(eq(organizationLegalTemplate.id, template.id))
				.returning();

			return { data: updated[0] ?? null };
		},
		{
			params: workflowTemplateIdRefParamsSchema,
			body: legalTemplateUpdateSchema,
		},
	)
	/**
	 * Publishes a legal template and marks previous versions as drafts.
	 */
	.post(
		'/document-workflow/templates/:templateRef/publish',
		async ({
			params,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!ensureAdminOrOwner(access, set)) {
				return buildErrorResponse('Not authorized', 403);
			}

			const template = await fetchTemplateById({
				organizationId: access.organizationId,
					templateId: params.templateRef,
				});
			if (!template) {
				set.status = 404;
				return buildErrorResponse('Template not found', 404);
			}

			await db
				.update(organizationLegalTemplate)
				.set({ status: 'DRAFT' })
				.where(
					and(
						eq(organizationLegalTemplate.organizationId, access.organizationId),
						eq(organizationLegalTemplate.kind, template.kind),
						eq(organizationLegalTemplate.status, 'PUBLISHED'),
					),
				);

			const published = await db
				.update(organizationLegalTemplate)
				.set({
					status: 'PUBLISHED',
					publishedByUserId: access.userId,
					publishedAt: new Date(),
				})
				.where(eq(organizationLegalTemplate.id, template.id))
				.returning();

			return { data: published[0] ?? null };
		},
		{
			params: workflowTemplateIdRefParamsSchema,
		},
	)
	/**
	 * Creates a presigned POST for legal branding logo upload.
	 */
	.post(
		'/document-workflow/branding/presign',
		async ({
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!ensureAdminOrOwner(access, set)) {
				return buildErrorResponse('Not authorized', 403);
			}

			if (!validateUploadPayload(body, set)) {
				return buildErrorResponse('Invalid branding upload payload', 400);
			}

			let bucketConfig: ReturnType<typeof getRailwayBucketConfig>;
			try {
				bucketConfig = getRailwayBucketConfig();
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Bucket not configured',
					400,
					{ code: 'EMPLOYEE_DOCUMENT_BUCKET_NOT_CONFIGURED' },
				);
			}

			const objectKey = buildLegalBrandingObjectKey({
				organizationId: access.organizationId,
				fileName: body.fileName,
			});

			let presigned: Awaited<ReturnType<typeof createRailwayPresignedPost>>;
			try {
				presigned = await createRailwayPresignedPost({
					key: objectKey,
					contentType: body.contentType,
					maxSizeBytes: MAX_EMPLOYEE_DOCUMENT_SIZE_BYTES,
				});
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Bucket not configured',
					400,
					{ code: 'EMPLOYEE_DOCUMENT_BUCKET_NOT_CONFIGURED' },
				);
			}

			return {
				data: {
					url: presigned.url,
					fields: presigned.fields,
					objectKey,
					bucket: bucketConfig.bucket,
				},
			};
		},
		{
			body: legalBrandingPresignSchema,
		},
	)
	/**
	 * Confirms legal branding logo upload and updates branding metadata.
	 */
	.post(
		'/document-workflow/branding/confirm',
		async ({
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!ensureAdminOrOwner(access, set)) {
				return buildErrorResponse('Not authorized', 403);
			}

			let existing = await db
				.select()
				.from(organizationLegalBranding)
				.where(eq(organizationLegalBranding.organizationId, access.organizationId))
				.limit(1);

			let logoBucket = existing[0]?.logoBucket ?? null;
			let logoObjectKey = existing[0]?.logoObjectKey ?? null;
			let logoFileName = existing[0]?.logoFileName ?? null;
			let logoContentType = existing[0]?.logoContentType ?? null;
			let logoSizeBytes = existing[0]?.logoSizeBytes ?? null;
			let logoSha256 = existing[0]?.logoSha256 ?? null;

			if (body.objectKey) {
				if (!body.contentType || body.sizeBytes === undefined || !body.sha256) {
					set.status = 400;
					return buildErrorResponse(
						'contentType, sizeBytes and sha256 are required when objectKey is provided',
						400,
					);
				}

				const prefix = buildLegalBrandingPrefix(access.organizationId);
				if (!body.objectKey.startsWith(prefix)) {
					set.status = 400;
					return buildErrorResponse('Invalid branding object key', 400);
				}

				if (!validateUploadPayload({ contentType: body.contentType, sizeBytes: body.sizeBytes }, set)) {
					return buildErrorResponse('Invalid branding upload payload', 400);
				}

				let bucketConfig: ReturnType<typeof getRailwayBucketConfig>;
				try {
					bucketConfig = getRailwayBucketConfig();
				} catch (error) {
					set.status = 400;
					return buildErrorResponse(
						error instanceof Error ? error.message : 'Bucket not configured',
						400,
						{ code: 'EMPLOYEE_DOCUMENT_BUCKET_NOT_CONFIGURED' },
					);
				}

				let objectHead: Awaited<ReturnType<typeof headRailwayObject>>;
				try {
					objectHead = await headRailwayObject({ key: body.objectKey });
				} catch (error) {
					set.status = 400;
					if (isBucketDependencyError(error)) {
						return buildErrorResponse(
							error instanceof Error ? error.message : 'Bucket not configured',
							400,
							{ code: 'EMPLOYEE_DOCUMENT_BUCKET_NOT_CONFIGURED' },
						);
					}
					return buildErrorResponse('Branding logo not found in bucket', 400, {
						code: 'EMPLOYEE_DOCUMENT_NOT_FOUND',
					});
				}

				if (!objectMatchesRequest({ contentType: body.contentType, sizeBytes: body.sizeBytes }, objectHead)) {
					set.status = 400;
					return buildErrorResponse('Branding logo content mismatch', 400);
				}

				logoBucket = bucketConfig.bucket;
				logoObjectKey = body.objectKey;
				logoFileName = body.fileName ?? sanitizeFileName(body.objectKey.split('/').pop() ?? 'logo');
				logoContentType = body.contentType;
				logoSizeBytes = body.sizeBytes;
				logoSha256 = body.sha256;
			}

			if (existing[0]) {
				await db
					.update(organizationLegalBranding)
					.set({
						displayName: body.displayName ?? existing[0].displayName,
						headerText: body.headerText ?? existing[0].headerText,
						logoBucket,
						logoObjectKey,
						logoFileName,
						logoContentType,
						logoSizeBytes,
						logoSha256,
					})
					.where(eq(organizationLegalBranding.organizationId, access.organizationId));
			} else {
				await db.insert(organizationLegalBranding).values({
					organizationId: access.organizationId,
					displayName: body.displayName ?? null,
					headerText: body.headerText ?? null,
					logoBucket,
					logoObjectKey,
					logoFileName,
					logoContentType,
					logoSizeBytes,
					logoSha256,
				});
			}

			existing = await db
				.select()
				.from(organizationLegalBranding)
				.where(eq(organizationLegalBranding.organizationId, access.organizationId))
				.limit(1);

			return { data: existing[0] ?? null };
		},
		{
			body: legalBrandingConfirmSchema,
		},
	)
	/**
	 * Returns branding metadata plus optional presigned logo URL.
	 */
	.get(
		'/document-workflow/branding/url',
		async ({
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveEmployeeAccessContext(
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationId,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!access) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!ensureAdminOrOwner(access, set)) {
				return buildErrorResponse('Not authorized', 403);
			}

			const brandingRows = await db
				.select()
				.from(organizationLegalBranding)
				.where(eq(organizationLegalBranding.organizationId, access.organizationId))
				.limit(1);

			const branding = brandingRows[0] ?? null;
			if (!branding || !branding.logoObjectKey) {
				return { data: { branding, url: null } };
			}

			try {
				const url = await createRailwayPresignedGetUrl({ key: branding.logoObjectKey });
				return {
					data: {
						branding,
						url,
					},
				};
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Bucket not configured',
					400,
					{ code: 'EMPLOYEE_DOCUMENT_BUCKET_NOT_CONFIGURED' },
				);
			}
		},
	);
