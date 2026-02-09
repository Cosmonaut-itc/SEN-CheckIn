import crypto from 'node:crypto';
import { and, countDistinct, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';

import db from '../db/index.js';
import {
	employee,
	employeeDisciplinaryAttachment,
	employeeDisciplinaryDocumentVersion,
	employeeDisciplinaryMeasure,
	employeeLegalGeneration,
	employeeTerminationDraft,
	jobPosition,
	location,
	member,
	organizationLegalTemplate,
	payrollSetting,
} from '../db/schema.js';
import { combinedAuthPlugin, type AuthSession } from '../plugins/auth.js';
import {
	MAX_DISCIPLINARY_ATTACHMENT_BYTES,
	disciplinaryAttachmentConfirmSchema,
	disciplinaryAttachmentDeleteParamsSchema,
	disciplinaryCloseSchema,
	disciplinaryDocumentUrlParamsSchema,
	disciplinaryFilePresignSchema,
	disciplinaryGenerateActaSchema,
	disciplinaryGenerateRefusalSchema,
	disciplinaryKpisQuerySchema,
	disciplinaryMeasureCreateSchema,
	disciplinaryMeasureIdParamsSchema,
	disciplinaryMeasuresQuerySchema,
	disciplinaryMeasureUpdateSchema,
	disciplinaryRefusalConfirmSchema,
	disciplinarySignedActaConfirmSchema,
} from '../schemas/disciplinary-measures.js';
import {
	cancelTerminationDraftForMeasure,
	createNextDisciplinaryFolio,
	ensureTerminationDraftForMeasure,
	validateSuspensionRange,
} from '../services/disciplinary-measures.js';
import {
	buildDefaultLegalVariablesSnapshot,
	renderLegalHtml,
	sha256Hex,
} from '../services/legal-document-rendering.js';
import {
	createRailwayPresignedGetUrl,
	createRailwayPresignedPost,
	getRailwayBucketConfig,
	headRailwayObject,
} from '../services/railway-bucket.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { resolveOrganizationId } from '../utils/organization.js';

const MAX_ATTACHMENTS_PER_MEASURE = 5;
const ALLOWED_CONTENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type MemberRole = 'owner' | 'admin' | 'member';

type DisciplinaryAccessContext = {
	organizationId: string;
	userId: string;
	role: MemberRole;
};

/**
 * Sanitizes a file name to avoid path traversal and unsupported characters.
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
 * Builds disciplinary object key prefix for signed documents.
 *
 * @param args - Prefix arguments
 * @returns Prefix for storage objects
 */
function buildDisciplinaryDocumentPrefix(args: {
	organizationId: string;
	employeeId: string;
	measureId: string;
	kind: 'ACTA_ADMINISTRATIVA' | 'CONSTANCIA_NEGATIVA_FIRMA';
}): string {
	return `org/${args.organizationId}/employees/${args.employeeId}/disciplinary/${args.measureId}/documents/${args.kind}/`;
}

/**
 * Builds disciplinary object key prefix for evidence attachments.
 *
 * @param args - Prefix arguments
 * @returns Prefix for storage objects
 */
function buildDisciplinaryAttachmentPrefix(args: {
	organizationId: string;
	employeeId: string;
	measureId: string;
}): string {
	return `org/${args.organizationId}/employees/${args.employeeId}/disciplinary/${args.measureId}/attachments/`;
}

/**
 * Builds object key for signed disciplinary documents.
 *
 * @param args - Key components
 * @returns Object key
 */
function buildDisciplinaryDocumentObjectKey(args: {
	organizationId: string;
	employeeId: string;
	measureId: string;
	kind: 'ACTA_ADMINISTRATIVA' | 'CONSTANCIA_NEGATIVA_FIRMA';
	documentId: string;
	fileName: string;
}): string {
	return `${buildDisciplinaryDocumentPrefix(args)}${args.documentId}-${sanitizeFileName(args.fileName)}`;
}

/**
 * Builds object key for disciplinary attachments.
 *
 * @param args - Key components
 * @returns Object key
 */
function buildDisciplinaryAttachmentObjectKey(args: {
	organizationId: string;
	employeeId: string;
	measureId: string;
	attachmentId: string;
	fileName: string;
}): string {
	return `${buildDisciplinaryAttachmentPrefix(args)}${args.attachmentId}-${sanitizeFileName(args.fileName)}`;
}

/**
 * Checks whether upload payload meets type and size constraints.
 *
 * @param body - Upload payload
 * @returns True when payload is valid
 */
function isValidUploadPayload(body: { contentType: string; sizeBytes: number }): boolean {
	if (!ALLOWED_CONTENT_TYPES.has(body.contentType)) {
		return false;
	}
	if (body.sizeBytes > MAX_DISCIPLINARY_ATTACHMENT_BYTES) {
		return false;
	}
	return true;
}

/**
 * Ensures uploaded object metadata matches expected payload.
 *
 * @param args - Expected payload and object metadata
 * @returns True when metadata matches
 */
function objectMatchesRequest(args: {
	expectedContentType: string;
	expectedSizeBytes: number;
	contentType?: string;
	contentLength?: number;
}): boolean {
	if ((args.contentLength ?? 0) !== args.expectedSizeBytes) {
		return false;
	}
	if ((args.contentLength ?? 0) > MAX_DISCIPLINARY_ATTACHMENT_BYTES) {
		return false;
	}
	if (args.contentType && args.contentType !== args.expectedContentType) {
		return false;
	}
	return true;
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
 * Checks whether bucket lookup errors correspond to missing objects.
 *
 * @param error - Unknown error value
 * @returns True when the bucket object was not found
 */
function isBucketObjectNotFoundError(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false;
	}
	const candidate = error as {
		name?: string;
		code?: string;
		Code?: string;
		$metadata?: { httpStatusCode?: number };
	};
	const code = candidate.code ?? candidate.Code ?? candidate.name;
	return code === 'NotFound' || code === 'NoSuchKey' || candidate.$metadata?.httpStatusCode === 404;
}

/**
 * Resolves signed suspension range text for template variables.
 *
 * @param startDateKey - Suspension start date key
 * @param endDateKey - Suspension end date key
 * @returns Formatted date range or null
 */
function buildSuspensionRangeLabel(
	startDateKey: string | null,
	endDateKey: string | null,
): string | null {
	if (!startDateKey || !endDateKey) {
		return null;
	}
	return `${startDateKey} al ${endDateKey}`;
}

/**
 * Resolves Spanish label for disciplinary outcomes in legal templates.
 *
 * @param outcome - Outcome enum value
 * @returns Human-readable outcome label
 */
function buildOutcomeLabel(
	outcome: typeof employeeDisciplinaryMeasure.$inferSelect.outcome,
): string {
	switch (outcome) {
		case 'warning':
			return 'Amonestación';
		case 'suspension':
			return 'Suspensión';
		case 'termination_process':
			return 'Escalación a terminación';
		case 'no_action':
		default:
			return 'Sin acción';
	}
}

/**
 * Resolves access context for disciplinary operations.
 *
 * @param args - Auth context
 * @param args.authType - Authentication type
 * @param args.session - Authenticated session
 * @param args.sessionOrganizationIds - Allowed organizations for session auth
 * @param args.apiKeyOrganizationId - API key active organization
 * @param args.apiKeyOrganizationIds - API key allowed organizations
 * @param args.requestedOrganizationId - Optional organization override
 * @param set - Elysia status setter
 * @returns Access context when authorized, otherwise null
 */
async function resolveDisciplinaryAccessContext(
	args: {
		authType: 'session' | 'apiKey';
		session: AuthSession | null;
		sessionOrganizationIds: string[];
		apiKeyOrganizationId: string | null;
		apiKeyOrganizationIds: string[];
		requestedOrganizationId?: string | null;
	},
	set: { status?: number | string } & Record<string, unknown>,
): Promise<DisciplinaryAccessContext | null> {
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
			and(eq(member.organizationId, organizationId), eq(member.userId, args.session.userId)),
		)
		.limit(1);

	const role = membershipRows[0]?.role;
	if (role !== 'owner' && role !== 'admin') {
		set.status = 403;
		return null;
	}

	const settingsRows = await db
		.select({ enableDisciplinaryMeasures: payrollSetting.enableDisciplinaryMeasures })
		.from(payrollSetting)
		.where(eq(payrollSetting.organizationId, organizationId))
		.limit(1);

	if (!settingsRows[0]?.enableDisciplinaryMeasures) {
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
 * Loads a disciplinary measure scoped to an organization.
 *
 * @param organizationId - Organization identifier
 * @param measureId - Measure identifier
 * @returns Measure row or null
 */
async function fetchMeasureById(
	organizationId: string,
	measureId: string,
): Promise<typeof employeeDisciplinaryMeasure.$inferSelect | null> {
	const rows = await db
		.select()
		.from(employeeDisciplinaryMeasure)
		.where(
			and(
				eq(employeeDisciplinaryMeasure.id, measureId),
				eq(employeeDisciplinaryMeasure.organizationId, organizationId),
			),
		)
		.limit(1);

	return rows[0] ?? null;
}

/**
 * Ensures measure can still be edited/uploaded.
 *
 * @param measure - Measure row
 * @returns True when mutable
 */
function isMeasureMutable(measure: typeof employeeDisciplinaryMeasure.$inferSelect): boolean {
	return measure.status !== 'CLOSED';
}

/**
 * Resolves latest published template for a legal kind.
 *
 * @param organizationId - Organization identifier
 * @param kind - Legal template kind
 * @returns Published template or null
 */
async function fetchLatestPublishedTemplate(
	organizationId: string,
	kind: 'ACTA_ADMINISTRATIVA' | 'CONSTANCIA_NEGATIVA_FIRMA',
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
 * Resolves a legal template by id and optional kind.
 *
 * @param args - Lookup arguments
 * @returns Template row or null
 */
async function fetchTemplateById(args: {
	organizationId: string;
	templateId: string;
	kind: 'ACTA_ADMINISTRATIVA' | 'CONSTANCIA_NEGATIVA_FIRMA';
}): Promise<typeof organizationLegalTemplate.$inferSelect | null> {
	const rows = await db
		.select()
		.from(organizationLegalTemplate)
		.where(
			and(
				eq(organizationLegalTemplate.id, args.templateId),
				eq(organizationLegalTemplate.organizationId, args.organizationId),
				eq(organizationLegalTemplate.kind, args.kind),
			),
		)
		.limit(1);

	return rows[0] ?? null;
}

/**
 * Ensures generation belongs to organization/employee and matches expected kind.
 *
 * @param args - Lookup arguments
 * @returns Generation row or null
 */
async function requireLegalGeneration(args: {
	organizationId: string;
	employeeId: string;
	generationId: string;
	kind: 'ACTA_ADMINISTRATIVA' | 'CONSTANCIA_NEGATIVA_FIRMA';
}): Promise<typeof employeeLegalGeneration.$inferSelect | null> {
	const rows = await db
		.select()
		.from(employeeLegalGeneration)
		.where(
			and(
				eq(employeeLegalGeneration.id, args.generationId),
				eq(employeeLegalGeneration.organizationId, args.organizationId),
				eq(employeeLegalGeneration.employeeId, args.employeeId),
				eq(employeeLegalGeneration.kind, args.kind),
			),
		)
		.limit(1);

	return rows[0] ?? null;
}

/**
 * Generates the next disciplinary document version and marks previous current rows as historical.
 *
 * @param tx - Database transaction
 * @param measureId - Disciplinary measure identifier
 * @param kind - Disciplinary document kind
 * @returns Next version number
 */
async function prepareNextDisciplinaryDocumentVersion(
	tx: DbTransaction,
	measureId: string,
	kind: 'ACTA_ADMINISTRATIVA' | 'CONSTANCIA_NEGATIVA_FIRMA',
): Promise<number> {
	const latestRows = await tx
		.select({ versionNumber: employeeDisciplinaryDocumentVersion.versionNumber })
		.from(employeeDisciplinaryDocumentVersion)
		.where(
			and(
				eq(employeeDisciplinaryDocumentVersion.measureId, measureId),
				eq(employeeDisciplinaryDocumentVersion.kind, kind),
			),
		)
		.orderBy(desc(employeeDisciplinaryDocumentVersion.versionNumber))
		.limit(1);

	await tx
		.update(employeeDisciplinaryDocumentVersion)
		.set({ isCurrent: false })
		.where(
			and(
				eq(employeeDisciplinaryDocumentVersion.measureId, measureId),
				eq(employeeDisciplinaryDocumentVersion.kind, kind),
				eq(employeeDisciplinaryDocumentVersion.isCurrent, true),
			),
		);

	return (latestRows[0]?.versionNumber ?? 0) + 1;
}

/**
 * Counts persisted attachments for a measure.
 *
 * @param measureId - Measure identifier
 * @returns Attachment count
 */
async function countMeasureAttachments(measureId: string): Promise<number> {
	const rows = await db
		.select({ count: countDistinct(employeeDisciplinaryAttachment.id) })
		.from(employeeDisciplinaryAttachment)
		.where(eq(employeeDisciplinaryAttachment.measureId, measureId));

	return Number(rows[0]?.count ?? 0);
}

/**
 * Builds disciplinary-specific template variables.
 *
 * @param args - Variable source records
 * @returns Variables snapshot used by rendering pipeline
 */
function buildDisciplinaryVariablesSnapshot(args: {
	employeeRecord: {
		firstName: string;
		lastName: string;
		code: string;
		rfc: string | null;
		nss: string | null;
		jobPositionName: string | null;
		locationName: string | null;
		hireDate: Date | null;
	};
	measure: typeof employeeDisciplinaryMeasure.$inferSelect;
}): Record<string, unknown> {
	const baseSnapshot = buildDefaultLegalVariablesSnapshot(args.employeeRecord);
	const suspensionRange = buildSuspensionRangeLabel(
		args.measure.suspensionStartDateKey,
		args.measure.suspensionEndDateKey,
	);

	return {
		...baseSnapshot,
		disciplinary: {
			folio: args.measure.folio,
			incidentDate: args.measure.incidentDateKey,
			reason: args.measure.reason,
			outcome: buildOutcomeLabel(args.measure.outcome),
			policyReference: args.measure.policyReference,
			suspensionRange,
		},
	};
}

/**
 * Disciplinary measures routes.
 */
export const disciplinaryMeasuresRoutes = new Elysia({ prefix: '/disciplinary-measures' })
	.use(combinedAuthPlugin)
	.get(
		'/',
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveDisciplinaryAccessContext(
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
				return buildErrorResponse('Not authorized for disciplinary measures', status);
			}

			const conditions: [SQL<unknown>, ...SQL<unknown>[]] = [
				eq(employeeDisciplinaryMeasure.organizationId, access.organizationId),
			];
			if (query.employeeId) {
				conditions.push(eq(employeeDisciplinaryMeasure.employeeId, query.employeeId));
			}
			if (query.status) {
				conditions.push(eq(employeeDisciplinaryMeasure.status, query.status));
			}
			if (query.outcome) {
				conditions.push(eq(employeeDisciplinaryMeasure.outcome, query.outcome));
			}
			if (query.fromDateKey) {
				conditions.push(
					gte(employeeDisciplinaryMeasure.incidentDateKey, query.fromDateKey),
				);
			}
			if (query.toDateKey) {
				conditions.push(lte(employeeDisciplinaryMeasure.incidentDateKey, query.toDateKey));
			}
			if (query.search) {
				conditions.push(
					or(
						ilike(
							sql<string>`${employeeDisciplinaryMeasure.folio}::text`,
							`%${query.search}%`,
						),
						ilike(employee.firstName, `%${query.search}%`),
						ilike(employee.lastName, `%${query.search}%`),
						ilike(employee.code, `%${query.search}%`),
						ilike(employeeDisciplinaryMeasure.reason, `%${query.search}%`),
					)!,
				);
			}

			const whereClause = and(...conditions)!;
			const rows = await db
				.select({
					id: employeeDisciplinaryMeasure.id,
					organizationId: employeeDisciplinaryMeasure.organizationId,
					employeeId: employeeDisciplinaryMeasure.employeeId,
					folio: employeeDisciplinaryMeasure.folio,
					status: employeeDisciplinaryMeasure.status,
					incidentDateKey: employeeDisciplinaryMeasure.incidentDateKey,
					reason: employeeDisciplinaryMeasure.reason,
					policyReference: employeeDisciplinaryMeasure.policyReference,
					notes: employeeDisciplinaryMeasure.notes,
					outcome: employeeDisciplinaryMeasure.outcome,
					suspensionStartDateKey: employeeDisciplinaryMeasure.suspensionStartDateKey,
					suspensionEndDateKey: employeeDisciplinaryMeasure.suspensionEndDateKey,
					signatureStatus: employeeDisciplinaryMeasure.signatureStatus,
					closedAt: employeeDisciplinaryMeasure.closedAt,
					createdAt: employeeDisciplinaryMeasure.createdAt,
					updatedAt: employeeDisciplinaryMeasure.updatedAt,
					employeeCode: employee.code,
					employeeFirstName: employee.firstName,
					employeeLastName: employee.lastName,
				})
				.from(employeeDisciplinaryMeasure)
				.leftJoin(employee, eq(employeeDisciplinaryMeasure.employeeId, employee.id))
				.where(whereClause)
				.orderBy(
					desc(employeeDisciplinaryMeasure.incidentDateKey),
					desc(employeeDisciplinaryMeasure.createdAt),
				)
				.limit(query.limit)
				.offset(query.offset);

			const countRows = await db
				.select({ count: countDistinct(employeeDisciplinaryMeasure.id) })
				.from(employeeDisciplinaryMeasure)
				.leftJoin(employee, eq(employeeDisciplinaryMeasure.employeeId, employee.id))
				.where(whereClause);

			const total = Number(countRows[0]?.count ?? 0);

			return {
				data: rows,
				pagination: {
					total,
					limit: query.limit,
					offset: query.offset,
					hasMore: query.offset + rows.length < total,
				},
			};
		},
		{
			query: disciplinaryMeasuresQuerySchema,
		},
	)
	.get(
		'/kpis',
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveDisciplinaryAccessContext(
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
				return buildErrorResponse('Not authorized for disciplinary measures', status);
			}

			const baseConditions: [SQL<unknown>, ...SQL<unknown>[]] = [
				eq(employeeDisciplinaryMeasure.organizationId, access.organizationId),
			];
			if (query.fromDateKey) {
				baseConditions.push(
					gte(employeeDisciplinaryMeasure.incidentDateKey, query.fromDateKey),
				);
			}
			if (query.toDateKey) {
				baseConditions.push(
					lte(employeeDisciplinaryMeasure.incidentDateKey, query.toDateKey),
				);
			}

			const whereClause = and(...baseConditions)!;
			const [
				employeesWithMeasures,
				totalMeasures,
				activeSuspensions,
				escalations,
				openMeasures,
			] = await Promise.all([
				db
					.select({ count: countDistinct(employeeDisciplinaryMeasure.employeeId) })
					.from(employeeDisciplinaryMeasure)
					.where(whereClause),
				db
					.select({ count: countDistinct(employeeDisciplinaryMeasure.id) })
					.from(employeeDisciplinaryMeasure)
					.where(whereClause),
				db
					.select({ count: countDistinct(employeeDisciplinaryMeasure.id) })
					.from(employeeDisciplinaryMeasure)
					.where(
						and(
							whereClause,
							eq(employeeDisciplinaryMeasure.outcome, 'suspension'),
							or(
								eq(employeeDisciplinaryMeasure.status, 'DRAFT'),
								eq(employeeDisciplinaryMeasure.status, 'GENERATED'),
							),
						),
					),
				db
					.select({ count: countDistinct(employeeDisciplinaryMeasure.id) })
					.from(employeeDisciplinaryMeasure)
					.where(
						and(
							whereClause,
							eq(employeeDisciplinaryMeasure.outcome, 'termination_process'),
						),
					),
				db
					.select({ count: countDistinct(employeeDisciplinaryMeasure.id) })
					.from(employeeDisciplinaryMeasure)
					.where(
						and(
							whereClause,
							or(
								eq(employeeDisciplinaryMeasure.status, 'DRAFT'),
								eq(employeeDisciplinaryMeasure.status, 'GENERATED'),
							),
						),
					),
			]);

			return {
				data: {
					employeesWithMeasures: Number(employeesWithMeasures[0]?.count ?? 0),
					measuresInPeriod: Number(totalMeasures[0]?.count ?? 0),
					activeSuspensions: Number(activeSuspensions[0]?.count ?? 0),
					terminationEscalations: Number(escalations[0]?.count ?? 0),
					openMeasures: Number(openMeasures[0]?.count ?? 0),
				},
			};
		},
		{
			query: disciplinaryKpisQuerySchema,
		},
	)
	.post(
		'/',
		async ({
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveDisciplinaryAccessContext(
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
				return buildErrorResponse('Not authorized for disciplinary measures', status);
			}

			const employeeRows = await db
				.select({ id: employee.id })
				.from(employee)
				.where(
					and(
						eq(employee.id, body.employeeId),
						eq(employee.organizationId, access.organizationId),
					),
				)
				.limit(1);
			if (!employeeRows[0]) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			if (body.outcome === 'suspension') {
				const validation = validateSuspensionRange({
					startDateKey: body.suspensionStartDateKey as string,
					endDateKey: body.suspensionEndDateKey as string,
				});
				if (!validation.isValid) {
					set.status = 400;
					return buildErrorResponse(validation.message, 400);
				}
			}

			const folio = await createNextDisciplinaryFolio(access.organizationId);
			const rows = await db
				.insert(employeeDisciplinaryMeasure)
				.values({
					organizationId: access.organizationId,
					employeeId: body.employeeId,
					folio,
					status: 'DRAFT',
					incidentDateKey: body.incidentDateKey,
					reason: body.reason,
					policyReference: body.policyReference?.trim() || null,
					outcome: body.outcome,
					suspensionStartDateKey:
						body.outcome === 'suspension'
							? (body.suspensionStartDateKey ?? null)
							: null,
					suspensionEndDateKey:
						body.outcome === 'suspension' ? (body.suspensionEndDateKey ?? null) : null,
					createdByUserId: access.userId,
					updatedByUserId: access.userId,
				})
				.returning();

			const createdMeasure = rows[0];
			if (!createdMeasure) {
				set.status = 500;
				return buildErrorResponse('Failed to create disciplinary measure', 500);
			}

			if (createdMeasure.outcome === 'termination_process') {
				await ensureTerminationDraftForMeasure({
					organizationId: createdMeasure.organizationId,
					employeeId: createdMeasure.employeeId,
					measureId: createdMeasure.id,
					actorUserId: access.userId,
					payload: {
						measureId: createdMeasure.id,
						folio: createdMeasure.folio,
						incidentDateKey: createdMeasure.incidentDateKey,
						reason: createdMeasure.reason,
					},
				});
			}

			set.status = 201;
			return { data: createdMeasure };
		},
		{
			body: disciplinaryMeasureCreateSchema,
		},
	)
	.get(
		'/:id',
		async ({
			params,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveDisciplinaryAccessContext(
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
				return buildErrorResponse('Not authorized for disciplinary measures', status);
			}

			const measureRows = await db
				.select({
					id: employeeDisciplinaryMeasure.id,
					organizationId: employeeDisciplinaryMeasure.organizationId,
					employeeId: employeeDisciplinaryMeasure.employeeId,
					folio: employeeDisciplinaryMeasure.folio,
					status: employeeDisciplinaryMeasure.status,
					incidentDateKey: employeeDisciplinaryMeasure.incidentDateKey,
					reason: employeeDisciplinaryMeasure.reason,
					policyReference: employeeDisciplinaryMeasure.policyReference,
					notes: employeeDisciplinaryMeasure.notes,
					outcome: employeeDisciplinaryMeasure.outcome,
					suspensionStartDateKey: employeeDisciplinaryMeasure.suspensionStartDateKey,
					suspensionEndDateKey: employeeDisciplinaryMeasure.suspensionEndDateKey,
					signatureStatus: employeeDisciplinaryMeasure.signatureStatus,
					generatedActaGenerationId:
						employeeDisciplinaryMeasure.generatedActaGenerationId,
					generatedRefusalGenerationId:
						employeeDisciplinaryMeasure.generatedRefusalGenerationId,
					closedAt: employeeDisciplinaryMeasure.closedAt,
					createdAt: employeeDisciplinaryMeasure.createdAt,
					updatedAt: employeeDisciplinaryMeasure.updatedAt,
					employeeCode: employee.code,
					employeeFirstName: employee.firstName,
					employeeLastName: employee.lastName,
				})
				.from(employeeDisciplinaryMeasure)
				.leftJoin(employee, eq(employeeDisciplinaryMeasure.employeeId, employee.id))
				.where(
					and(
						eq(employeeDisciplinaryMeasure.id, params.id),
						eq(employeeDisciplinaryMeasure.organizationId, access.organizationId),
					),
				)
				.limit(1);

			const measure = measureRows[0];
			if (!measure) {
				set.status = 404;
				return buildErrorResponse('Disciplinary measure not found', 404);
			}

			const [documents, attachments, draftRows] = await Promise.all([
				db
					.select()
					.from(employeeDisciplinaryDocumentVersion)
					.where(eq(employeeDisciplinaryDocumentVersion.measureId, params.id))
					.orderBy(
						desc(employeeDisciplinaryDocumentVersion.kind),
						desc(employeeDisciplinaryDocumentVersion.versionNumber),
					),
				db
					.select()
					.from(employeeDisciplinaryAttachment)
					.where(eq(employeeDisciplinaryAttachment.measureId, params.id))
					.orderBy(desc(employeeDisciplinaryAttachment.createdAt)),
				db
					.select()
					.from(employeeTerminationDraft)
					.where(eq(employeeTerminationDraft.measureId, params.id))
					.orderBy(desc(employeeTerminationDraft.createdAt))
					.limit(1),
			]);

			return {
				data: {
					...measure,
					documents,
					attachments,
					terminationDraft: draftRows[0] ?? null,
				},
			};
		},
		{
			params: disciplinaryMeasureIdParamsSchema,
		},
	)
	.put(
		'/:id',
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
			const access = await resolveDisciplinaryAccessContext(
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
				return buildErrorResponse('Not authorized for disciplinary measures', status);
			}

			const existingMeasure = await fetchMeasureById(access.organizationId, params.id);
			if (!existingMeasure) {
				set.status = 404;
				return buildErrorResponse('Disciplinary measure not found', 404);
			}
			if (!isMeasureMutable(existingMeasure)) {
				set.status = 409;
				return buildErrorResponse('Closed disciplinary measures cannot be modified', 409);
			}

			const nextOutcome = body.outcome ?? existingMeasure.outcome;
			const nextSuspensionStartDateKey =
				nextOutcome === 'suspension'
					? body.suspensionStartDateKey === undefined
						? existingMeasure.suspensionStartDateKey
						: body.suspensionStartDateKey
					: null;
			const nextSuspensionEndDateKey =
				nextOutcome === 'suspension'
					? body.suspensionEndDateKey === undefined
						? existingMeasure.suspensionEndDateKey
						: body.suspensionEndDateKey
					: null;

			if (
				nextOutcome === 'suspension' &&
				nextSuspensionStartDateKey &&
				nextSuspensionEndDateKey
			) {
				const validation = validateSuspensionRange({
					startDateKey: nextSuspensionStartDateKey,
					endDateKey: nextSuspensionEndDateKey,
				});
				if (!validation.isValid) {
					set.status = 400;
					return buildErrorResponse(validation.message, 400);
				}
			}

			const updatedRows = await db
				.update(employeeDisciplinaryMeasure)
				.set({
					incidentDateKey: body.incidentDateKey ?? existingMeasure.incidentDateKey,
					reason: body.reason ?? existingMeasure.reason,
					policyReference:
						body.policyReference === undefined
							? existingMeasure.policyReference
							: body.policyReference,
					outcome: nextOutcome,
					suspensionStartDateKey: nextSuspensionStartDateKey,
					suspensionEndDateKey: nextSuspensionEndDateKey,
					updatedByUserId: access.userId,
				})
				.where(eq(employeeDisciplinaryMeasure.id, existingMeasure.id))
				.returning();

			const updatedMeasure = updatedRows[0];
			if (!updatedMeasure) {
				set.status = 500;
				return buildErrorResponse('Failed to update disciplinary measure', 500);
			}

			if (updatedMeasure.outcome === 'termination_process') {
				await ensureTerminationDraftForMeasure({
					organizationId: updatedMeasure.organizationId,
					employeeId: updatedMeasure.employeeId,
					measureId: updatedMeasure.id,
					actorUserId: access.userId,
					payload: {
						measureId: updatedMeasure.id,
						folio: updatedMeasure.folio,
						incidentDateKey: updatedMeasure.incidentDateKey,
						reason: updatedMeasure.reason,
					},
				});
			} else if (existingMeasure.outcome === 'termination_process') {
				await cancelTerminationDraftForMeasure({
					measureId: updatedMeasure.id,
					actorUserId: access.userId,
				});
			}

			return { data: updatedMeasure };
		},
		{
			params: disciplinaryMeasureIdParamsSchema,
			body: disciplinaryMeasureUpdateSchema,
		},
	)
	.post(
		'/:id/generate-acta',
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
			const access = await resolveDisciplinaryAccessContext(
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
				return buildErrorResponse('Not authorized for disciplinary measures', status);
			}

			const measure = await fetchMeasureById(access.organizationId, params.id);
			if (!measure) {
				set.status = 404;
				return buildErrorResponse('Disciplinary measure not found', 404);
			}
			if (!isMeasureMutable(measure)) {
				set.status = 409;
				return buildErrorResponse('Closed disciplinary measures cannot be modified', 409);
			}

			const employeeRows = await db
				.select({
					firstName: employee.firstName,
					lastName: employee.lastName,
					code: employee.code,
					rfc: employee.rfc,
					nss: employee.nss,
					jobPositionName: jobPosition.name,
					locationName: location.name,
					hireDate: employee.hireDate,
				})
				.from(employee)
				.leftJoin(jobPosition, eq(employee.jobPositionId, jobPosition.id))
				.leftJoin(location, eq(employee.locationId, location.id))
				.where(eq(employee.id, measure.employeeId))
				.limit(1);
			const employeeRecord = employeeRows[0];
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			let template: typeof organizationLegalTemplate.$inferSelect | null = null;
			if (body.templateId) {
				template = await fetchTemplateById({
					organizationId: access.organizationId,
					templateId: body.templateId,
					kind: 'ACTA_ADMINISTRATIVA',
				});
				if (!template) {
					set.status = 404;
					return buildErrorResponse('Template not found for disciplinary acta', 404);
				}
				if (template.status !== 'PUBLISHED') {
					set.status = 400;
					return buildErrorResponse('Template must be published before generation', 400);
				}
			} else {
				template = await fetchLatestPublishedTemplate(
					access.organizationId,
					'ACTA_ADMINISTRATIVA',
				);
				if (!template) {
					set.status = 404;
					return buildErrorResponse('No published acta template found', 404);
				}
			}

			const variablesSnapshot = buildDisciplinaryVariablesSnapshot({
				employeeRecord,
				measure,
			});
			const renderedHtml = renderLegalHtml(template.htmlContent, variablesSnapshot);
			const generatedHtmlHash = sha256Hex(renderedHtml);

			const generationRows = await db
				.insert(employeeLegalGeneration)
				.values({
					organizationId: access.organizationId,
					employeeId: measure.employeeId,
					kind: 'ACTA_ADMINISTRATIVA',
					templateId: template.id,
					templateVersionNumber: template.versionNumber,
					generatedHtmlHash,
					variablesSnapshot,
					generatedByUserId: access.userId,
				})
				.returning();
			const generation = generationRows[0];
			if (!generation) {
				set.status = 500;
				return buildErrorResponse('Failed to generate disciplinary acta', 500);
			}

			await db
				.update(employeeDisciplinaryMeasure)
				.set({
					status: 'GENERATED',
					generatedActaGenerationId: generation.id,
					updatedByUserId: access.userId,
				})
				.where(eq(employeeDisciplinaryMeasure.id, measure.id));

			return {
				data: {
					generation,
					template,
					renderedHtml,
				},
			};
		},
		{
			params: disciplinaryMeasureIdParamsSchema,
			body: disciplinaryGenerateActaSchema,
		},
	)
	.post(
		'/:id/signed-acta/presign',
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
			if (!isValidUploadPayload(body)) {
				set.status = 400;
				return buildErrorResponse('Invalid file type or size for signed acta', 400);
			}

			const access = await resolveDisciplinaryAccessContext(
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
				return buildErrorResponse('Not authorized for disciplinary measures', status);
			}

			const measure = await fetchMeasureById(access.organizationId, params.id);
			if (!measure) {
				set.status = 404;
				return buildErrorResponse('Disciplinary measure not found', 404);
			}
			if (!isMeasureMutable(measure)) {
				set.status = 409;
				return buildErrorResponse('Closed disciplinary measures cannot be modified', 409);
			}
			if (!measure.generatedActaGenerationId) {
				set.status = 400;
				return buildErrorResponse('Generate acta before uploading a signed version', 400);
			}

			let bucketConfig: ReturnType<typeof getRailwayBucketConfig>;
			try {
				bucketConfig = getRailwayBucketConfig();
			} catch (error) {
				if (isBucketDependencyError(error)) {
					set.status = 503;
					return buildErrorResponse('Bucket service dependencies are not installed', 503);
				}
				throw error;
			}

			const docVersionId = crypto.randomUUID();
			const objectKey = buildDisciplinaryDocumentObjectKey({
				organizationId: access.organizationId,
				employeeId: measure.employeeId,
				measureId: measure.id,
				kind: 'ACTA_ADMINISTRATIVA',
				documentId: docVersionId,
				fileName: body.fileName,
			});

			const presigned = await createRailwayPresignedPost({
				key: objectKey,
				contentType: body.contentType,
				expiresInSeconds: 300,
				maxSizeBytes: MAX_DISCIPLINARY_ATTACHMENT_BYTES,
			});

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
			params: disciplinaryMeasureIdParamsSchema,
			body: disciplinaryFilePresignSchema,
		},
	)
	.post(
		'/:id/signed-acta/confirm',
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
			if (!isValidUploadPayload(body)) {
				set.status = 400;
				return buildErrorResponse('Invalid file type or size for signed acta', 400);
			}

			const access = await resolveDisciplinaryAccessContext(
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
				return buildErrorResponse('Not authorized for disciplinary measures', status);
			}

			const measure = await fetchMeasureById(access.organizationId, params.id);
			if (!measure) {
				set.status = 404;
				return buildErrorResponse('Disciplinary measure not found', 404);
			}
			if (!isMeasureMutable(measure)) {
				set.status = 409;
				return buildErrorResponse('Closed disciplinary measures cannot be modified', 409);
			}
			if (!measure.generatedActaGenerationId) {
				set.status = 400;
				return buildErrorResponse('Generate acta before uploading a signed version', 400);
			}
			if (body.generationId !== measure.generatedActaGenerationId) {
				set.status = 400;
				return buildErrorResponse('Invalid acta generation reference', 400);
			}

			const generation = await requireLegalGeneration({
				organizationId: access.organizationId,
				employeeId: measure.employeeId,
				generationId: body.generationId,
				kind: 'ACTA_ADMINISTRATIVA',
			});
			if (!generation) {
				set.status = 400;
				return buildErrorResponse('Invalid acta generation reference', 400);
			}

			const expectedObjectKeyPrefix = `${buildDisciplinaryDocumentPrefix({
				organizationId: access.organizationId,
				employeeId: measure.employeeId,
				measureId: measure.id,
				kind: 'ACTA_ADMINISTRATIVA',
			})}${body.docVersionId}-`;
			if (!body.objectKey.startsWith(expectedObjectKeyPrefix)) {
				set.status = 400;
				return buildErrorResponse('Invalid signed acta object key', 400);
			}

			let bucketConfig: ReturnType<typeof getRailwayBucketConfig>;
			try {
				bucketConfig = getRailwayBucketConfig();
				} catch (error) {
					if (isBucketDependencyError(error)) {
						set.status = 503;
						return buildErrorResponse('Bucket service dependencies are not installed', 503);
					}
					throw error;
				}
				let objectHead: Awaited<ReturnType<typeof headRailwayObject>> | null = null;
				try {
					objectHead = await headRailwayObject({
						key: body.objectKey,
					});
				} catch (error) {
					if (isBucketDependencyError(error)) {
						set.status = 503;
						return buildErrorResponse('Bucket service dependencies are not installed', 503);
					}
					if (isBucketObjectNotFoundError(error)) {
						set.status = 404;
						return buildErrorResponse('Uploaded object not found', 404);
					}
					throw error;
				}
				if (!objectHead) {
					set.status = 404;
					return buildErrorResponse('Uploaded object not found', 404);
				}
			if (
				!objectMatchesRequest({
					expectedContentType: body.contentType,
					expectedSizeBytes: body.sizeBytes,
					contentType: objectHead.ContentType,
					contentLength: objectHead.ContentLength,
				})
			) {
				set.status = 400;
				return buildErrorResponse('Uploaded object metadata does not match request', 400);
			}

			const inserted = await db.transaction(async (tx) => {
				const versionNumber = await prepareNextDisciplinaryDocumentVersion(
					tx,
					measure.id,
					'ACTA_ADMINISTRATIVA',
				);

				const rows = await tx
					.insert(employeeDisciplinaryDocumentVersion)
					.values({
						id: body.docVersionId,
						organizationId: access.organizationId,
						employeeId: measure.employeeId,
						measureId: measure.id,
						kind: 'ACTA_ADMINISTRATIVA',
						versionNumber,
						isCurrent: true,
						generationId: generation.id,
						signedAtDateKey: body.signedAtDateKey ?? null,
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

			if (!inserted) {
				set.status = 500;
				return buildErrorResponse('Failed to persist signed acta', 500);
			}

			return { data: inserted };
		},
		{
			params: disciplinaryMeasureIdParamsSchema,
			body: disciplinarySignedActaConfirmSchema,
		},
	)
	.post(
		'/:id/refusal/generate',
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
			const access = await resolveDisciplinaryAccessContext(
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
				return buildErrorResponse('Not authorized for disciplinary measures', status);
			}

			const measure = await fetchMeasureById(access.organizationId, params.id);
			if (!measure) {
				set.status = 404;
				return buildErrorResponse('Disciplinary measure not found', 404);
			}
			if (!isMeasureMutable(measure)) {
				set.status = 409;
				return buildErrorResponse('Closed disciplinary measures cannot be modified', 409);
			}

			const employeeRows = await db
				.select({
					firstName: employee.firstName,
					lastName: employee.lastName,
					code: employee.code,
					rfc: employee.rfc,
					nss: employee.nss,
					jobPositionName: jobPosition.name,
					locationName: location.name,
					hireDate: employee.hireDate,
				})
				.from(employee)
				.leftJoin(jobPosition, eq(employee.jobPositionId, jobPosition.id))
				.leftJoin(location, eq(employee.locationId, location.id))
				.where(eq(employee.id, measure.employeeId))
				.limit(1);
			const employeeRecord = employeeRows[0];
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			let template: typeof organizationLegalTemplate.$inferSelect | null = null;
			if (body.templateId) {
				template = await fetchTemplateById({
					organizationId: access.organizationId,
					templateId: body.templateId,
					kind: 'CONSTANCIA_NEGATIVA_FIRMA',
				});
				if (!template) {
					set.status = 404;
					return buildErrorResponse('Template not found for refusal certificate', 404);
				}
				if (template.status !== 'PUBLISHED') {
					set.status = 400;
					return buildErrorResponse('Template must be published before generation', 400);
				}
			} else {
				template = await fetchLatestPublishedTemplate(
					access.organizationId,
					'CONSTANCIA_NEGATIVA_FIRMA',
				);
				if (!template) {
					set.status = 404;
					return buildErrorResponse('No published refusal template found', 404);
				}
			}

			const variablesSnapshot = {
				...buildDisciplinaryVariablesSnapshot({
					employeeRecord,
					measure,
				}),
				refusal: {
					reason: body.refusalReason ?? null,
				},
			};
			const renderedHtml = renderLegalHtml(template.htmlContent, variablesSnapshot);
			const generatedHtmlHash = sha256Hex(renderedHtml);

			const generationRows = await db
				.insert(employeeLegalGeneration)
				.values({
					organizationId: access.organizationId,
					employeeId: measure.employeeId,
					kind: 'CONSTANCIA_NEGATIVA_FIRMA',
					templateId: template.id,
					templateVersionNumber: template.versionNumber,
					generatedHtmlHash,
					variablesSnapshot,
					generatedByUserId: access.userId,
				})
				.returning();
			const generation = generationRows[0];
			if (!generation) {
				set.status = 500;
				return buildErrorResponse('Failed to generate refusal certificate', 500);
			}

			await db
				.update(employeeDisciplinaryMeasure)
				.set({
					generatedRefusalGenerationId: generation.id,
					updatedByUserId: access.userId,
				})
				.where(eq(employeeDisciplinaryMeasure.id, measure.id));

			return {
				data: {
					generation,
					template,
					renderedHtml,
				},
			};
		},
		{
			params: disciplinaryMeasureIdParamsSchema,
			body: disciplinaryGenerateRefusalSchema,
		},
	)
	.post(
		'/:id/refusal/presign',
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
			if (!isValidUploadPayload(body)) {
				set.status = 400;
				return buildErrorResponse('Invalid file type or size for refusal document', 400);
			}

			const access = await resolveDisciplinaryAccessContext(
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
				return buildErrorResponse('Not authorized for disciplinary measures', status);
			}

			const measure = await fetchMeasureById(access.organizationId, params.id);
			if (!measure) {
				set.status = 404;
				return buildErrorResponse('Disciplinary measure not found', 404);
			}
			if (!isMeasureMutable(measure)) {
				set.status = 409;
				return buildErrorResponse('Closed disciplinary measures cannot be modified', 409);
			}
			if (!measure.generatedRefusalGenerationId) {
				set.status = 400;
				return buildErrorResponse(
					'Generate refusal certificate before uploading signed file',
					400,
				);
			}

			let bucketConfig: ReturnType<typeof getRailwayBucketConfig>;
			try {
				bucketConfig = getRailwayBucketConfig();
			} catch (error) {
				if (isBucketDependencyError(error)) {
					set.status = 503;
					return buildErrorResponse('Bucket service dependencies are not installed', 503);
				}
				throw error;
			}

			const docVersionId = crypto.randomUUID();
			const objectKey = buildDisciplinaryDocumentObjectKey({
				organizationId: access.organizationId,
				employeeId: measure.employeeId,
				measureId: measure.id,
				kind: 'CONSTANCIA_NEGATIVA_FIRMA',
				documentId: docVersionId,
				fileName: body.fileName,
			});

			const presigned = await createRailwayPresignedPost({
				key: objectKey,
				contentType: body.contentType,
				expiresInSeconds: 300,
				maxSizeBytes: MAX_DISCIPLINARY_ATTACHMENT_BYTES,
			});

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
			params: disciplinaryMeasureIdParamsSchema,
			body: disciplinaryFilePresignSchema,
		},
	)
	.post(
		'/:id/refusal/confirm',
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
			if (!isValidUploadPayload(body)) {
				set.status = 400;
				return buildErrorResponse('Invalid file type or size for refusal document', 400);
			}

			const access = await resolveDisciplinaryAccessContext(
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
				return buildErrorResponse('Not authorized for disciplinary measures', status);
			}

			const measure = await fetchMeasureById(access.organizationId, params.id);
			if (!measure) {
				set.status = 404;
				return buildErrorResponse('Disciplinary measure not found', 404);
			}
			if (!isMeasureMutable(measure)) {
				set.status = 409;
				return buildErrorResponse('Closed disciplinary measures cannot be modified', 409);
			}
			if (!measure.generatedRefusalGenerationId) {
				set.status = 400;
				return buildErrorResponse(
					'Generate refusal certificate before uploading signed file',
					400,
				);
			}
			if (body.generationId !== measure.generatedRefusalGenerationId) {
				set.status = 400;
				return buildErrorResponse('Invalid refusal generation reference', 400);
			}

			const generation = await requireLegalGeneration({
				organizationId: access.organizationId,
				employeeId: measure.employeeId,
				generationId: body.generationId,
				kind: 'CONSTANCIA_NEGATIVA_FIRMA',
			});
			if (!generation) {
				set.status = 400;
				return buildErrorResponse('Invalid refusal generation reference', 400);
			}

			const expectedObjectKeyPrefix = `${buildDisciplinaryDocumentPrefix({
				organizationId: access.organizationId,
				employeeId: measure.employeeId,
				measureId: measure.id,
				kind: 'CONSTANCIA_NEGATIVA_FIRMA',
			})}${body.docVersionId}-`;
			if (!body.objectKey.startsWith(expectedObjectKeyPrefix)) {
				set.status = 400;
				return buildErrorResponse('Invalid refusal object key', 400);
			}

			let bucketConfig: ReturnType<typeof getRailwayBucketConfig>;
			try {
				bucketConfig = getRailwayBucketConfig();
				} catch (error) {
					if (isBucketDependencyError(error)) {
						set.status = 503;
						return buildErrorResponse('Bucket service dependencies are not installed', 503);
					}
					throw error;
				}
				let objectHead: Awaited<ReturnType<typeof headRailwayObject>> | null = null;
				try {
					objectHead = await headRailwayObject({
						key: body.objectKey,
					});
				} catch (error) {
					if (isBucketDependencyError(error)) {
						set.status = 503;
						return buildErrorResponse('Bucket service dependencies are not installed', 503);
					}
					if (isBucketObjectNotFoundError(error)) {
						set.status = 404;
						return buildErrorResponse('Uploaded object not found', 404);
					}
					throw error;
				}
				if (!objectHead) {
					set.status = 404;
					return buildErrorResponse('Uploaded object not found', 404);
				}
			if (
				!objectMatchesRequest({
					expectedContentType: body.contentType,
					expectedSizeBytes: body.sizeBytes,
					contentType: objectHead.ContentType,
					contentLength: objectHead.ContentLength,
				})
			) {
				set.status = 400;
				return buildErrorResponse('Uploaded object metadata does not match request', 400);
			}

			const inserted = await db.transaction(async (tx) => {
				const versionNumber = await prepareNextDisciplinaryDocumentVersion(
					tx,
					measure.id,
					'CONSTANCIA_NEGATIVA_FIRMA',
				);

				const rows = await tx
					.insert(employeeDisciplinaryDocumentVersion)
					.values({
						id: body.docVersionId,
						organizationId: access.organizationId,
						employeeId: measure.employeeId,
						measureId: measure.id,
						kind: 'CONSTANCIA_NEGATIVA_FIRMA',
						versionNumber,
						isCurrent: true,
						generationId: generation.id,
						signedAtDateKey: body.signedAtDateKey ?? null,
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

			if (!inserted) {
				set.status = 500;
				return buildErrorResponse('Failed to persist refusal certificate', 500);
			}

			return { data: inserted };
		},
		{
			params: disciplinaryMeasureIdParamsSchema,
			body: disciplinaryRefusalConfirmSchema,
		},
	)
	.post(
		'/:id/attachments/presign',
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
			if (!isValidUploadPayload(body)) {
				set.status = 400;
				return buildErrorResponse('Invalid file type or size for evidence attachment', 400);
			}

			const access = await resolveDisciplinaryAccessContext(
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
				return buildErrorResponse('Not authorized for disciplinary measures', status);
			}

			const measure = await fetchMeasureById(access.organizationId, params.id);
			if (!measure) {
				set.status = 404;
				return buildErrorResponse('Disciplinary measure not found', 404);
			}
			if (!isMeasureMutable(measure)) {
				set.status = 409;
				return buildErrorResponse('Closed disciplinary measures cannot be modified', 409);
			}

			const attachmentCount = await countMeasureAttachments(measure.id);
			if (attachmentCount >= MAX_ATTACHMENTS_PER_MEASURE) {
				set.status = 400;
				return buildErrorResponse('Maximum attachment limit reached for measure', 400);
			}

			let bucketConfig: ReturnType<typeof getRailwayBucketConfig>;
			try {
				bucketConfig = getRailwayBucketConfig();
			} catch (error) {
				if (isBucketDependencyError(error)) {
					set.status = 503;
					return buildErrorResponse('Bucket service dependencies are not installed', 503);
				}
				throw error;
			}
			const attachmentId = crypto.randomUUID();
			const objectKey = buildDisciplinaryAttachmentObjectKey({
				organizationId: access.organizationId,
				employeeId: measure.employeeId,
				measureId: measure.id,
				attachmentId,
				fileName: body.fileName,
			});

			const presigned = await createRailwayPresignedPost({
				key: objectKey,
				contentType: body.contentType,
				expiresInSeconds: 300,
				maxSizeBytes: MAX_DISCIPLINARY_ATTACHMENT_BYTES,
			});

			return {
				data: {
					url: presigned.url,
					fields: presigned.fields,
					attachmentId,
					objectKey,
					bucket: bucketConfig.bucket,
				},
			};
		},
		{
			params: disciplinaryMeasureIdParamsSchema,
			body: disciplinaryFilePresignSchema,
		},
	)
	.post(
		'/:id/attachments/confirm',
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
			if (!isValidUploadPayload(body)) {
				set.status = 400;
				return buildErrorResponse('Invalid file type or size for evidence attachment', 400);
			}

			const access = await resolveDisciplinaryAccessContext(
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
				return buildErrorResponse('Not authorized for disciplinary measures', status);
			}

			const measure = await fetchMeasureById(access.organizationId, params.id);
			if (!measure) {
				set.status = 404;
				return buildErrorResponse('Disciplinary measure not found', 404);
			}
			if (!isMeasureMutable(measure)) {
				set.status = 409;
				return buildErrorResponse('Closed disciplinary measures cannot be modified', 409);
			}

			const attachmentCount = await countMeasureAttachments(measure.id);
			if (attachmentCount >= MAX_ATTACHMENTS_PER_MEASURE) {
				set.status = 400;
				return buildErrorResponse('Maximum attachment limit reached for measure', 400);
			}

			const expectedObjectKeyPrefix = `${buildDisciplinaryAttachmentPrefix({
				organizationId: access.organizationId,
				employeeId: measure.employeeId,
				measureId: measure.id,
			})}${body.attachmentId}-`;
			if (!body.objectKey.startsWith(expectedObjectKeyPrefix)) {
				set.status = 400;
				return buildErrorResponse('Invalid attachment object key', 400);
			}

			let bucketConfig: ReturnType<typeof getRailwayBucketConfig>;
			try {
				bucketConfig = getRailwayBucketConfig();
				} catch (error) {
					if (isBucketDependencyError(error)) {
						set.status = 503;
						return buildErrorResponse('Bucket service dependencies are not installed', 503);
					}
					throw error;
				}
				let objectHead: Awaited<ReturnType<typeof headRailwayObject>> | null = null;
				try {
					objectHead = await headRailwayObject({
						key: body.objectKey,
					});
				} catch (error) {
					if (isBucketDependencyError(error)) {
						set.status = 503;
						return buildErrorResponse('Bucket service dependencies are not installed', 503);
					}
					if (isBucketObjectNotFoundError(error)) {
						set.status = 404;
						return buildErrorResponse('Uploaded object not found', 404);
					}
					throw error;
				}
				if (!objectHead) {
					set.status = 404;
					return buildErrorResponse('Uploaded object not found', 404);
				}
			if (
				!objectMatchesRequest({
					expectedContentType: body.contentType,
					expectedSizeBytes: body.sizeBytes,
					contentType: objectHead.ContentType,
					contentLength: objectHead.ContentLength,
				})
			) {
				set.status = 400;
				return buildErrorResponse('Uploaded object metadata does not match request', 400);
			}

			const insertedRows = await db
				.insert(employeeDisciplinaryAttachment)
				.values({
					id: body.attachmentId,
					organizationId: access.organizationId,
					employeeId: measure.employeeId,
					measureId: measure.id,
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

			return { data: insertedRows[0] ?? null };
		},
		{
			params: disciplinaryMeasureIdParamsSchema,
			body: disciplinaryAttachmentConfirmSchema,
		},
	)
	.delete(
		'/:id/attachments/:attachmentId',
		async ({
			params,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveDisciplinaryAccessContext(
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
				return buildErrorResponse('Not authorized for disciplinary measures', status);
			}

			const measure = await fetchMeasureById(access.organizationId, params.id);
			if (!measure) {
				set.status = 404;
				return buildErrorResponse('Disciplinary measure not found', 404);
			}
			if (!isMeasureMutable(measure)) {
				set.status = 409;
				return buildErrorResponse('Closed disciplinary measures cannot be modified', 409);
			}

			const deletedRows = await db
				.delete(employeeDisciplinaryAttachment)
				.where(
					and(
						eq(employeeDisciplinaryAttachment.id, params.attachmentId),
						eq(employeeDisciplinaryAttachment.measureId, measure.id),
					),
				)
				.returning({ id: employeeDisciplinaryAttachment.id });

			if (!deletedRows[0]) {
				set.status = 404;
				return buildErrorResponse('Attachment not found', 404);
			}

			return { data: { id: deletedRows[0].id } };
		},
		{
			params: disciplinaryAttachmentDeleteParamsSchema,
		},
	)
	.post(
		'/:id/close',
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
			const access = await resolveDisciplinaryAccessContext(
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
				return buildErrorResponse('Not authorized for disciplinary measures', status);
			}

			const measure = await fetchMeasureById(access.organizationId, params.id);
			if (!measure) {
				set.status = 404;
				return buildErrorResponse('Disciplinary measure not found', 404);
			}
			if (!isMeasureMutable(measure)) {
				set.status = 409;
				return buildErrorResponse('Disciplinary measure is already closed', 409);
			}

			const currentActaRows = await db
				.select({ id: employeeDisciplinaryDocumentVersion.id })
				.from(employeeDisciplinaryDocumentVersion)
				.where(
					and(
						eq(employeeDisciplinaryDocumentVersion.measureId, measure.id),
						eq(employeeDisciplinaryDocumentVersion.kind, 'ACTA_ADMINISTRATIVA'),
						eq(employeeDisciplinaryDocumentVersion.isCurrent, true),
					),
				)
				.limit(1);

			const currentRefusalRows = await db
				.select({ id: employeeDisciplinaryDocumentVersion.id })
				.from(employeeDisciplinaryDocumentVersion)
				.where(
					and(
						eq(employeeDisciplinaryDocumentVersion.measureId, measure.id),
						eq(employeeDisciplinaryDocumentVersion.kind, 'CONSTANCIA_NEGATIVA_FIRMA'),
						eq(employeeDisciplinaryDocumentVersion.isCurrent, true),
					),
				)
				.limit(1);

			if (body.signatureStatus === 'signed_physical' && !currentActaRows[0]) {
				set.status = 400;
				return buildErrorResponse('Signed acta document is required before closing', 400);
			}

			if (body.signatureStatus === 'refused_to_sign' && !currentRefusalRows[0]) {
				set.status = 400;
				return buildErrorResponse(
					'Refusal certificate is required before closing a refusal-to-sign measure',
					400,
				);
			}

			const updatedRows = await db
				.update(employeeDisciplinaryMeasure)
				.set({
					status: 'CLOSED',
					signatureStatus: body.signatureStatus,
					notes: body.notes ?? null,
					closedAt: new Date(),
					closedByUserId: access.userId,
					updatedByUserId: access.userId,
				})
				.where(eq(employeeDisciplinaryMeasure.id, measure.id))
				.returning();

			return { data: updatedRows[0] ?? null };
		},
		{
			params: disciplinaryMeasureIdParamsSchema,
			body: disciplinaryCloseSchema,
		},
	)
	.get(
		'/:id/documents/:documentVersionId/url',
		async ({
			params,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveDisciplinaryAccessContext(
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
				return buildErrorResponse('Not authorized for disciplinary measures', status);
			}

			const measure = await fetchMeasureById(access.organizationId, params.id);
			if (!measure) {
				set.status = 404;
				return buildErrorResponse('Disciplinary measure not found', 404);
			}

			const documentRows = await db
				.select({
					bucket: employeeDisciplinaryDocumentVersion.bucket,
					objectKey: employeeDisciplinaryDocumentVersion.objectKey,
				})
				.from(employeeDisciplinaryDocumentVersion)
				.where(
					and(
						eq(employeeDisciplinaryDocumentVersion.id, params.documentVersionId),
						eq(employeeDisciplinaryDocumentVersion.measureId, measure.id),
					),
				)
				.limit(1);

			const documentVersion = documentRows[0];
			if (!documentVersion) {
				set.status = 404;
				return buildErrorResponse('Disciplinary document version not found', 404);
			}

			let url: string;
			try {
				url = await createRailwayPresignedGetUrl({
					key: documentVersion.objectKey,
					expiresInSeconds: 300,
				});
			} catch (error) {
				if (isBucketDependencyError(error)) {
					set.status = 503;
					return buildErrorResponse('Bucket service dependencies are not installed', 503);
				}
				throw error;
			}

			return { data: { url } };
		},
		{
			params: disciplinaryDocumentUrlParamsSchema,
		},
	);
