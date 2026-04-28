import { and, eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { z } from 'zod';

import db from '../db/index.js';
import { member, organizationFiscalProfile } from '../db/schema.js';
import { combinedAuthPlugin, type AuthSession } from '../plugins/auth.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { resolveOrganizationId } from '../utils/organization.js';

type AuthType = 'session' | 'apiKey';
type FiscalRole = string | null;

export const organizationFiscalProfileBodySchema = z.object({
	legalName: z.string().max(255).optional(),
	rfc: z.string().max(13).optional(),
	fiscalRegimeCode: z.string().max(10).optional(),
	expeditionPostalCode: z.string().max(5).optional(),
	employerRegistrationNumber: z.string().max(30).nullable().optional(),
	defaultFederalEntityCode: z.string().max(3).nullable().optional(),
	payrollCfdiSeries: z.string().max(20).nullable().optional(),
	payrollStampingMode: z
		.enum(['PER_RUN', 'MONTHLY_CONSOLIDATED_DISABLED'])
		.default('PER_RUN')
		.optional(),
	csdCertificateSerial: z.string().max(80).nullable().optional(),
	csdCertificateValidFrom: z.string().max(10).nullable().optional(),
	csdCertificateValidTo: z.string().max(10).nullable().optional(),
	csdSecretRef: z.string().max(255).nullable().optional(),
	pacProvider: z.string().max(80).nullable().optional(),
	pacCredentialsSecretRef: z.string().max(255).nullable().optional(),
});

export const employeeFiscalProfileBodySchema = z.object({
	satName: z.string().max(255).optional(),
	rfc: z.string().max(13).optional(),
	curp: z.string().max(18).optional(),
	fiscalPostalCode: z.string().max(5).optional(),
	fiscalRegimeCode: z.string().max(10).default('605').optional(),
	cfdiUseCode: z.string().max(10).default('CN01').optional(),
	socialSecurityNumber: z.string().max(20).nullable().optional(),
	employmentStartDateKey: z.string().max(10).optional(),
	contractTypeCode: z.string().max(10).optional(),
	unionized: z.enum(['Sí', 'No']).nullable().optional(),
	workdayTypeCode: z.string().max(10).optional(),
	payrollRegimeTypeCode: z.string().max(10).optional(),
	employeeNumber: z.string().max(50).optional(),
	department: z.string().max(100).nullable().optional(),
	position: z.string().max(100).nullable().optional(),
	riskPositionCode: z.string().max(10).nullable().optional(),
	paymentFrequencyCode: z.string().max(10).optional(),
	bankAccount: z.string().max(30).nullable().optional(),
	salaryBaseContribution: z.string().max(30).nullable().optional(),
	integratedDailySalary: z.string().max(30).nullable().optional(),
	federalEntityCode: z.string().max(3).nullable().optional(),
});

/**
 * Checks whether an auth context can access payroll fiscal profiles.
 *
 * @param args - Auth type and membership role
 * @returns True when the caller can access fiscal profile endpoints
 */
export function canAccessPayrollFiscalProfiles(args: {
	authType: AuthType;
	role: FiscalRole;
}): boolean {
	if (args.authType === 'apiKey') {
		return true;
	}

	return args.role === 'owner' || args.role === 'admin' || args.role === 'payroll-fiscal';
}

/**
 * Checks whether an auth context can see sensitive fiscal fields.
 *
 * @param args - Auth type and membership role
 * @returns True when sensitive fields may be returned unmasked
 */
export function canRevealPayrollFiscalSensitiveData(args: {
	authType: AuthType;
	role: FiscalRole;
}): boolean {
	if (args.authType === 'apiKey') {
		return true;
	}

	return args.role === 'owner' || args.role === 'admin';
}

/**
 * Masks a bank account by preserving only the last four characters.
 *
 * @param value - Bank account value
 * @returns Masked account, original short value, or null when missing
 */
export function maskBankAccount(value: string | null): string | null {
	if (!value || value.trim().length === 0) {
		return null;
	}

	const normalized = value.trim();
	if (normalized.length <= 4) {
		return normalized;
	}

	return `${'*'.repeat(normalized.length - 4)}${normalized.slice(-4)}`;
}

/**
 * Resolves the caller's organization role.
 *
 * @param args - Session auth context and organization target
 * @returns Membership role, or null for API keys/non-members
 */
async function resolveFiscalRole(args: {
	authType: AuthType;
	session: AuthSession | null;
	organizationId: string;
}): Promise<FiscalRole> {
	if (args.authType !== 'session' || !args.session) {
		return null;
	}

	const rows = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(
				eq(member.userId, args.session.userId),
				eq(member.organizationId, args.organizationId),
			),
		)
		.limit(1);

	return rows[0]?.role ?? null;
}

/**
 * Resolves and verifies payroll fiscal endpoint access for an organization.
 *
 * @param args - Auth context and organization target
 * @returns Access decision and role
 */
async function resolveFiscalAccess(args: {
	authType: AuthType;
	session: AuthSession | null;
	sessionOrganizationIds: string[];
	apiKeyOrganizationId: string | null;
	apiKeyOrganizationIds: string[];
	organizationId: string;
}): Promise<{ ok: true; role: FiscalRole } | { ok: false; status: number; message: string }> {
	const resolvedOrganizationId = resolveOrganizationId({
		authType: args.authType,
		session: args.session,
		sessionOrganizationIds: args.sessionOrganizationIds,
		apiKeyOrganizationId: args.apiKeyOrganizationId,
		apiKeyOrganizationIds: args.apiKeyOrganizationIds,
		requestedOrganizationId: args.organizationId,
	});

	if (!resolvedOrganizationId || resolvedOrganizationId !== args.organizationId) {
		return { ok: false, status: 404, message: 'Organization not found' };
	}

	const role = await resolveFiscalRole({
		authType: args.authType,
		session: args.session,
		organizationId: args.organizationId,
	});

	if (!canAccessPayrollFiscalProfiles({ authType: args.authType, role })) {
		return { ok: false, status: 403, message: 'Payroll fiscal access required' };
	}

	return { ok: true, role };
}

/**
 * Resolves a fiscal profile completion status from required values.
 *
 * @param values - Required field values
 * @returns COMPLETE when all values have text, otherwise INCOMPLETE
 */
function resolveProfileStatus(values: Array<string | null | undefined>): 'COMPLETE' | 'INCOMPLETE' {
	return values.every((value) => typeof value === 'string' && value.trim().length > 0)
		? 'COMPLETE'
		: 'INCOMPLETE';
}

/**
 * Builds the API response for an organization fiscal profile.
 *
 * @param row - Organization fiscal profile row
 * @returns Organization fiscal profile payload with completion status
 */
export function buildOrganizationFiscalProfileResponse(
	row: typeof organizationFiscalProfile.$inferSelect,
): Record<string, unknown> {
	return {
		...row,
		status: resolveProfileStatus([
			row.legalName,
			row.rfc,
			row.fiscalRegimeCode,
			row.expeditionPostalCode,
			row.employerRegistrationNumber,
		]),
	};
}

/**
 * Routes for organization fiscal profiles.
 */
export const organizationFiscalRoutes = new Elysia({
	name: 'organization-fiscal-routes',
	prefix: '/organizations',
})
	.use(combinedAuthPlugin)
	.get(
		'/:organizationId/fiscal-profile',
		async ({
			params,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const access = await resolveFiscalAccess({
				authType,
				session: session ?? null,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				organizationId: params.organizationId,
			});
			if (!access.ok) {
				set.status = access.status;
				return buildErrorResponse(access.message, access.status);
			}

			const rows = await db
				.select()
				.from(organizationFiscalProfile)
				.where(eq(organizationFiscalProfile.organizationId, params.organizationId))
				.limit(1);
			const profile = rows[0] ?? null;

			return {
				data: profile ? buildOrganizationFiscalProfileResponse(profile) : null,
			};
		},
	)
	.put(
		'/:organizationId/fiscal-profile',
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
			const access = await resolveFiscalAccess({
				authType,
				session: session ?? null,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				organizationId: params.organizationId,
			});
			if (!access.ok) {
				set.status = access.status;
				return buildErrorResponse(access.message, access.status);
			}

			const now = new Date();
			const payload: typeof organizationFiscalProfile.$inferInsert = {
				organizationId: params.organizationId,
				legalName: body.legalName ?? '',
				rfc: body.rfc ?? '',
				fiscalRegimeCode: body.fiscalRegimeCode ?? '',
				expeditionPostalCode: body.expeditionPostalCode ?? '',
				employerRegistrationNumber: body.employerRegistrationNumber ?? null,
				defaultFederalEntityCode: body.defaultFederalEntityCode ?? null,
				payrollCfdiSeries: body.payrollCfdiSeries ?? null,
				payrollStampingMode: body.payrollStampingMode ?? 'PER_RUN',
				csdCertificateSerial: body.csdCertificateSerial ?? null,
				csdCertificateValidFrom: body.csdCertificateValidFrom ?? null,
				csdCertificateValidTo: body.csdCertificateValidTo ?? null,
				csdSecretRef: body.csdSecretRef ?? null,
				pacProvider: body.pacProvider ?? null,
				pacCredentialsSecretRef: body.pacCredentialsSecretRef ?? null,
				updatedAt: now,
			};
			const [saved] = await db
				.insert(organizationFiscalProfile)
				.values(payload)
				.onConflictDoUpdate({
					target: organizationFiscalProfile.organizationId,
					set: {
						...payload,
						updatedAt: now,
					},
				})
				.returning();

			return {
				data: saved ? buildOrganizationFiscalProfileResponse(saved) : null,
			};
		},
		{ body: organizationFiscalProfileBodySchema },
	);
