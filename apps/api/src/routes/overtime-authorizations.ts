import { and, count, desc, eq, gte, lte } from 'drizzle-orm';
import { Elysia } from 'elysia';

import db from '../db/index.js';
import { employee, member, overtimeAuthorization, payrollSetting, user } from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import type { AuthSession } from '../plugins/auth.js';
import {
	overtimeAuthorizationCreateSchema,
	overtimeAuthorizationListQuerySchema,
	overtimeAuthorizationOrganizationParamsSchema,
	overtimeAuthorizationParamsSchema,
	overtimeAuthorizationUpdateSchema,
	type OvertimeAuthorizationUpdateInput,
} from '../schemas/overtime-authorizations.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { toDateKeyInTimeZone } from '../utils/time-zone.js';
import { resolveOrganizationId } from '../utils/organization.js';

const OVERTIME_AUTHORIZATION_UNIQUE_INDEX = 'overtime_authorization_employee_date_uniq';
const OVERTIME_LEGAL_WARNING =
	'Las horas autorizadas exceden el limite diario de 3 horas establecido por la LFT. Horas superiores a 3 se pagan a tasa triple.';

export interface OvertimeAuthorizationRecord {
	id: string;
	organizationId: string;
	employeeId: string;
	dateKey: string;
	authorizedHours: number;
	authorizedByUserId: string | null;
	status: 'PENDING' | 'ACTIVE' | 'CANCELLED';
	notes: string | null;
	createdAt: Date;
	updatedAt: Date;
	employeeName?: string;
	authorizedByName?: string | null;
}

/**
 * Resolves the organization-scoped request target.
 *
 * @param args - Auth and route params context
 * @returns Organization identifier when permitted, otherwise null
 */
function resolveRequestedOrganization(args: {
	authType: 'session' | 'apiKey';
	session: AuthSession | null;
	sessionOrganizationIds: string[];
	apiKeyOrganizationId: string | null;
	apiKeyOrganizationIds: string[];
	organizationId: string;
}): string | null {
	return resolveOrganizationId({
		authType: args.authType,
		session: args.session,
		sessionOrganizationIds: args.sessionOrganizationIds,
		apiKeyOrganizationId: args.apiKeyOrganizationId,
		apiKeyOrganizationIds: args.apiKeyOrganizationIds,
		requestedOrganizationId: args.organizationId,
	});
}

/**
 * Checks whether the caller is owner/admin for the requested organization.
 *
 * @param args - Auth context
 * @param set - Elysia status setter
 * @returns True when access is allowed
 */
async function ensureOrganizationAdmin(
	args: {
		authType: 'session' | 'apiKey';
		session: AuthSession | null;
		organizationId: string;
	},
	set: { status?: number | string } & Record<string, unknown>,
): Promise<boolean> {
	if (args.authType !== 'session' || !args.session) {
		set.status = 403;
		return false;
	}

	const membershipRows = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(
				eq(member.userId, args.session.userId),
				eq(member.organizationId, args.organizationId),
			),
		)
		.limit(1);
	const role = membershipRows[0]?.role ?? null;
	if (role !== 'owner' && role !== 'admin') {
		set.status = 403;
		return false;
	}

	return true;
}

/**
 * Resolves the organization payroll timezone with Mexico City fallback.
 *
 * @param organizationId - Organization identifier
 * @returns IANA timezone string
 */
async function resolveOrganizationTimeZone(organizationId: string): Promise<string> {
	const settingsRows = await db
		.select({ timeZone: payrollSetting.timeZone })
		.from(payrollSetting)
		.where(eq(payrollSetting.organizationId, organizationId))
		.limit(1);
	return settingsRows[0]?.timeZone ?? 'America/Mexico_City';
}

/**
 * Checks whether the authorization date is still editable.
 *
 * @param dateKey - Target authorization date
 * @param organizationId - Organization identifier
 * @returns True when the date is today or in the future
 */
async function isEditableAuthorizationDate(
	dateKey: string,
	organizationId: string,
): Promise<boolean> {
	const timeZone = await resolveOrganizationTimeZone(organizationId);
	const todayKey = toDateKeyInTimeZone(new Date(), timeZone);
	return dateKey >= todayKey;
}

/**
 * Normalizes a route row with numeric overtime hours and joined labels.
 *
 * @param row - Database row
 * @returns API-safe overtime authorization payload
 */
function normalizeAuthorizationRow(row: {
	id: string;
	organizationId: string;
	employeeId: string;
	dateKey: string;
	authorizedHours: number | string;
	authorizedByUserId: string | null;
	status: 'PENDING' | 'ACTIVE' | 'CANCELLED';
	notes: string | null;
	createdAt: Date;
	updatedAt: Date;
	employeeFirstName?: string | null;
	employeeLastName?: string | null;
	authorizedByName?: string | null;
}): OvertimeAuthorizationRecord {
	return {
		id: row.id,
		organizationId: row.organizationId,
		employeeId: row.employeeId,
		dateKey: row.dateKey,
		authorizedHours: Number(row.authorizedHours ?? 0),
		authorizedByUserId: row.authorizedByUserId,
		status: row.status,
		notes: row.notes,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		employeeName: `${row.employeeFirstName ?? ''} ${row.employeeLastName ?? ''}`.trim(),
		authorizedByName: row.authorizedByName ?? null,
	};
}

/**
 * Detects a duplicate authorization unique-constraint error.
 *
 * @param error - Unknown database error
 * @returns True when the error matches the overtime unique index
 */
function isDuplicateAuthorizationError(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false;
	}

	const wrappedCause = (error as { cause?: unknown }).cause;
	const code =
		(error as { code?: unknown }).code ??
		(wrappedCause && typeof wrappedCause === 'object'
			? (wrappedCause as { code?: unknown }).code
			: undefined);
	const constraint =
		(error as { constraint?: unknown }).constraint ??
		(wrappedCause && typeof wrappedCause === 'object'
			? (wrappedCause as { constraint?: unknown }).constraint
			: undefined);

	return code === '23505' && constraint === OVERTIME_AUTHORIZATION_UNIQUE_INDEX;
}

/**
 * Overtime authorization CRUD routes.
 */
export const overtimeAuthorizationRoutes = new Elysia({
	prefix: '/organizations/:organizationId/overtime-authorizations',
})
	.use(combinedAuthPlugin)
	/**
	 * Creates a new overtime authorization for an employee/date pair.
	 */
	.post(
		'/',
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
			const organizationId = resolveRequestedOrganization({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				organizationId: params.organizationId,
			});
			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const isAdmin = await ensureOrganizationAdmin(
				{ authType, session, organizationId },
				set,
			);
			if (!isAdmin) {
				return buildErrorResponse(
					'Only owner/admin can manage overtime authorizations',
					403,
				);
			}

			const isEditable = await isEditableAuthorizationDate(body.dateKey, organizationId);
			if (!isEditable) {
				set.status = 400;
				return buildErrorResponse('dateKey must be today or a future date', 400);
			}

			const employeeRows = await db
				.select({ id: employee.id })
				.from(employee)
				.where(
					and(
						eq(employee.id, body.employeeId),
						eq(employee.organizationId, organizationId),
					),
				)
				.limit(1);
			if (!employeeRows[0]) {
				set.status = 404;
				return buildErrorResponse('Employee not found for this organization', 404);
			}

			try {
				const insertedRows = await db
					.insert(overtimeAuthorization)
					.values({
						organizationId,
						employeeId: body.employeeId,
						dateKey: body.dateKey,
						authorizedHours: body.authorizedHours.toFixed(2),
						authorizedByUserId: session?.userId ?? null,
						status: 'ACTIVE',
						notes: body.notes?.trim() ? body.notes.trim() : null,
					})
					.returning();

				const inserted = insertedRows[0];
				if (!inserted) {
					set.status = 500;
					return buildErrorResponse('Failed to create overtime authorization', 500);
				}

				set.status = 201;
				return {
					data: {
						...inserted,
						authorizedHours: Number(inserted.authorizedHours ?? 0),
						employeeName: null,
						authorizedByName: null,
					},
					...(body.authorizedHours > 3 ? { warning: OVERTIME_LEGAL_WARNING } : {}),
				};
			} catch (error) {
				if (isDuplicateAuthorizationError(error)) {
					set.status = 409;
					return buildErrorResponse(
						'An overtime authorization already exists for this employee and date',
						409,
					);
				}

				throw error;
			}
		},
		{
			params: overtimeAuthorizationOrganizationParamsSchema,
			body: overtimeAuthorizationCreateSchema,
		},
	)
	/**
	 * Lists overtime authorizations with filters and pagination.
	 */
	.get(
		'/',
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
			const organizationId = resolveRequestedOrganization({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				organizationId: params.organizationId,
			});
			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const isAdmin = await ensureOrganizationAdmin(
				{ authType, session, organizationId },
				set,
			);
			if (!isAdmin) {
				return buildErrorResponse(
					'Only owner/admin can manage overtime authorizations',
					403,
				);
			}

			const filters = [eq(overtimeAuthorization.organizationId, organizationId)];
			if (query.employeeId) {
				filters.push(eq(overtimeAuthorization.employeeId, query.employeeId));
			}
			if (query.status) {
				filters.push(eq(overtimeAuthorization.status, query.status));
			}
			if (query.startDate) {
				filters.push(gte(overtimeAuthorization.dateKey, query.startDate));
			}
			if (query.endDate) {
				filters.push(lte(overtimeAuthorization.dateKey, query.endDate));
			}

			const whereClause = and(...filters);
			const rows = await db
				.select({
					id: overtimeAuthorization.id,
					organizationId: overtimeAuthorization.organizationId,
					employeeId: overtimeAuthorization.employeeId,
					dateKey: overtimeAuthorization.dateKey,
					authorizedHours: overtimeAuthorization.authorizedHours,
					authorizedByUserId: overtimeAuthorization.authorizedByUserId,
					status: overtimeAuthorization.status,
					notes: overtimeAuthorization.notes,
					createdAt: overtimeAuthorization.createdAt,
					updatedAt: overtimeAuthorization.updatedAt,
					employeeFirstName: employee.firstName,
					employeeLastName: employee.lastName,
					authorizedByName: user.name,
				})
				.from(overtimeAuthorization)
				.leftJoin(employee, eq(overtimeAuthorization.employeeId, employee.id))
				.leftJoin(user, eq(overtimeAuthorization.authorizedByUserId, user.id))
				.where(whereClause)
				.orderBy(desc(overtimeAuthorization.dateKey), desc(overtimeAuthorization.createdAt))
				.limit(query.limit)
				.offset(query.offset);

			const totalRows = await db
				.select({ value: count() })
				.from(overtimeAuthorization)
				.where(whereClause);
			const total = Number(totalRows[0]?.value ?? 0);

			return {
				data: rows.map((row) => normalizeAuthorizationRow(row)),
				pagination: {
					total,
					limit: query.limit,
					offset: query.offset,
				},
			};
		},
		{
			params: overtimeAuthorizationOrganizationParamsSchema,
			query: overtimeAuthorizationListQuerySchema,
		},
	)
	/**
	 * Updates an existing overtime authorization.
	 */
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
			const organizationId = resolveRequestedOrganization({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				organizationId: params.organizationId,
			});
			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const isAdmin = await ensureOrganizationAdmin(
				{ authType, session, organizationId },
				set,
			);
			if (!isAdmin) {
				return buildErrorResponse(
					'Only owner/admin can manage overtime authorizations',
					403,
				);
			}

			const existingRows = await db
				.select()
				.from(overtimeAuthorization)
				.where(
					and(
						eq(overtimeAuthorization.id, params.id),
						eq(overtimeAuthorization.organizationId, organizationId),
					),
				)
				.limit(1);
			const existing = existingRows[0];
			if (!existing) {
				set.status = 404;
				return buildErrorResponse('Overtime authorization not found', 404);
			}

			const isEditable = await isEditableAuthorizationDate(existing.dateKey, organizationId);
			if (!isEditable) {
				set.status = 400;
				return buildErrorResponse(
					'Overtime authorizations can only be modified before the authorized date passes',
					400,
				);
			}

			const updatePayload = buildUpdatePayload(body);
			const updatedRows = await db
				.update(overtimeAuthorization)
				.set(updatePayload)
				.where(eq(overtimeAuthorization.id, existing.id))
				.returning();

			return {
				data: {
					...updatedRows[0],
					authorizedHours: Number(updatedRows[0]?.authorizedHours ?? 0),
				},
			};
		},
		{
			params: overtimeAuthorizationParamsSchema,
			body: overtimeAuthorizationUpdateSchema,
		},
	)
	/**
	 * Cancels an overtime authorization without deleting the record.
	 */
	.delete(
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
			const organizationId = resolveRequestedOrganization({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				organizationId: params.organizationId,
			});
			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const isAdmin = await ensureOrganizationAdmin(
				{ authType, session, organizationId },
				set,
			);
			if (!isAdmin) {
				return buildErrorResponse(
					'Only owner/admin can manage overtime authorizations',
					403,
				);
			}

			const existingRows = await db
				.select()
				.from(overtimeAuthorization)
				.where(
					and(
						eq(overtimeAuthorization.id, params.id),
						eq(overtimeAuthorization.organizationId, organizationId),
					),
				)
				.limit(1);
			const existing = existingRows[0];
			if (!existing) {
				set.status = 404;
				return buildErrorResponse('Overtime authorization not found', 404);
			}

			const isEditable = await isEditableAuthorizationDate(existing.dateKey, organizationId);
			if (!isEditable) {
				set.status = 400;
				return buildErrorResponse(
					'Overtime authorizations can only be modified before the authorized date passes',
					400,
				);
			}

			const updatedRows = await db
				.update(overtimeAuthorization)
				.set({
					status: 'CANCELLED',
					updatedAt: new Date(),
				})
				.where(eq(overtimeAuthorization.id, existing.id))
				.returning();

			return {
				data: {
					...updatedRows[0],
					authorizedHours: Number(updatedRows[0]?.authorizedHours ?? 0),
				},
			};
		},
		{
			params: overtimeAuthorizationParamsSchema,
		},
	);

/**
 * Builds a safe update payload for overtime authorizations.
 *
 * @param body - Update request body
 * @returns Partial update payload
 */
function buildUpdatePayload(
	body: OvertimeAuthorizationUpdateInput,
): Partial<typeof overtimeAuthorization.$inferInsert> {
	const payload: Partial<typeof overtimeAuthorization.$inferInsert> = {
		updatedAt: new Date(),
	};

	if (body.authorizedHours !== undefined) {
		payload.authorizedHours = body.authorizedHours.toFixed(2);
	}
	if (body.status !== undefined) {
		payload.status = body.status;
	}
	if (body.notes !== undefined) {
		payload.notes = body.notes.trim() ? body.notes.trim() : null;
	}

	return payload;
}
