import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { Elysia } from 'elysia';

import db from '../db/index.js';
import { employee, employeeGratification, member } from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import type { AuthSession } from '../plugins/auth.js';
import {
	employeeGratificationCreateSchema,
	employeeGratificationDetailParamsSchema,
	employeeGratificationListQuerySchema,
	employeeGratificationParamsSchema,
	employeeGratificationUpdateSchema,
	hasValidGratificationDateRange,
	organizationGratificationListQuerySchema,
	validateGratificationBusinessRules,
	type EmployeeGratificationCreateInput,
} from '../schemas/employee-gratifications.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { resolveOrganizationId } from '../utils/organization.js';

type GratificationPeriodicity = EmployeeGratificationCreateInput['periodicity'];
type GratificationApplicationMode = EmployeeGratificationCreateInput['applicationMode'];
type GratificationStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

type GratificationMutationInput = {
	concept?: string;
	amount?: number;
	periodicity?: GratificationPeriodicity;
	applicationMode?: GratificationApplicationMode;
	status?: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
	startDateKey?: string;
	endDateKey?: string | null;
	notes?: string | null;
};

export interface EmployeeGratificationRecord {
	id: string;
	organizationId: string;
	employeeId: string;
	concept: string;
	amount: number;
	periodicity: GratificationPeriodicity;
	applicationMode: GratificationApplicationMode;
	status: GratificationStatus;
	startDateKey: string;
	endDateKey: string | null;
	notes: string | null;
	createdByUserId: string;
	createdAt: Date;
	updatedAt: Date;
	employeeName?: string;
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
 * Normalizes numeric/text DB fields into API-safe values.
 *
 * @param row - Database row
 * @param employeeName - Optional employee display name
 * @returns Normalized API payload
 */
function normalizeGratificationRow(
	row: {
		id: string;
		organizationId: string;
		employeeId: string;
		concept: string;
		amount: number | string;
		periodicity: GratificationPeriodicity;
		applicationMode: GratificationApplicationMode;
		status: GratificationStatus;
		startDateKey: string;
		endDateKey: string | null;
		notes: string | null;
		createdByUserId: string;
		createdAt: Date;
		updatedAt: Date;
	},
	employeeName?: string,
): EmployeeGratificationRecord {
	return {
		id: row.id,
		organizationId: row.organizationId,
		employeeId: row.employeeId,
		concept: row.concept,
		amount: Number(row.amount ?? 0),
		periodicity: row.periodicity,
		applicationMode: row.applicationMode,
		status: row.status,
		startDateKey: row.startDateKey,
		endDateKey: row.endDateKey,
		notes: row.notes,
		createdByUserId: row.createdByUserId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		employeeName,
	};
}

/**
 * Validates a gratification status transition.
 *
 * @param currentStatus - Current persisted status
 * @param nextStatus - Requested status
 * @returns True when the transition is allowed
 */
function isValidGratificationStatusTransition(
	currentStatus: GratificationStatus,
	nextStatus: 'ACTIVE' | 'PAUSED' | 'CANCELLED',
): boolean {
	if (currentStatus === 'COMPLETED' || currentStatus === 'CANCELLED') {
		return false;
	}

	if (currentStatus === nextStatus) {
		return true;
	}

	if (currentStatus === 'ACTIVE') {
		return nextStatus === 'PAUSED' || nextStatus === 'CANCELLED';
	}

	if (currentStatus === 'PAUSED') {
		return nextStatus === 'ACTIVE' || nextStatus === 'CANCELLED';
	}

	return false;
}

/**
 * Builds update payload values for gratification mutations.
 *
 * @param payload - Partial gratification mutation payload
 * @returns Column values for insert/update
 */
function buildGratificationMutationValues(payload: GratificationMutationInput): Record<string, unknown> {
	return {
		...(payload.concept !== undefined ? { concept: payload.concept } : {}),
		...(payload.amount !== undefined ? { amount: payload.amount.toFixed(2) } : {}),
		...(payload.periodicity !== undefined ? { periodicity: payload.periodicity } : {}),
		...(payload.applicationMode !== undefined
			? { applicationMode: payload.applicationMode }
			: {}),
		...(payload.status !== undefined ? { status: payload.status } : {}),
		...(payload.startDateKey !== undefined ? { startDateKey: payload.startDateKey } : {}),
		...(payload.endDateKey !== undefined ? { endDateKey: payload.endDateKey } : {}),
		...(payload.notes !== undefined ? { notes: payload.notes } : {}),
	};
}

/**
 * Employee gratification CRUD routes.
 */
export const employeeGratificationRoutes = new Elysia({ prefix: '/organizations/:organizationId' })
	.use(combinedAuthPlugin)
	.post(
		'/employees/:employeeId/gratifications',
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

			const isAdmin = await ensureOrganizationAdmin({ authType, session, organizationId }, set);
			if (!isAdmin) {
				return buildErrorResponse('Only owner/admin can manage employee gratifications', 403);
			}

			const employeeRows = await db
				.select({
					id: employee.id,
					firstName: employee.firstName,
					lastName: employee.lastName,
				})
				.from(employee)
				.where(
					and(
						eq(employee.id, params.employeeId),
						eq(employee.organizationId, organizationId),
					),
				)
				.limit(1);
			const employeeRecord = employeeRows[0] ?? null;
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			const validationError = validateGratificationBusinessRules({
				periodicity: body.periodicity,
				applicationMode: body.applicationMode,
			});
			if (validationError) {
				set.status = 400;
				return buildErrorResponse(validationError, 400);
			}

			const [createdRow] = await db
				.insert(employeeGratification)
				.values({
					organizationId,
					employeeId: params.employeeId,
					concept: body.concept,
					amount: body.amount.toFixed(2),
					periodicity: body.periodicity,
					applicationMode: body.applicationMode,
					startDateKey: body.startDateKey,
					endDateKey: body.endDateKey ?? null,
					notes: body.notes ?? null,
					createdByUserId: session?.userId ?? '',
					status: 'ACTIVE',
				})
				.returning();
			if (!createdRow) {
				set.status = 500;
				return buildErrorResponse('Failed to create employee gratification', 500);
			}

			set.status = 201;
			return {
				data: normalizeGratificationRow(
					createdRow,
					`${employeeRecord.firstName} ${employeeRecord.lastName}`.trim(),
				),
			};
		},
		{
			params: employeeGratificationParamsSchema,
			body: employeeGratificationCreateSchema,
		},
	)
	.get(
		'/employees/:employeeId/gratifications',
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

			const employeeRows = await db
				.select({
					id: employee.id,
					firstName: employee.firstName,
					lastName: employee.lastName,
				})
				.from(employee)
				.where(
					and(
						eq(employee.id, params.employeeId),
						eq(employee.organizationId, organizationId),
					),
				)
				.limit(1);
			const employeeRecord = employeeRows[0] ?? null;
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			const conditions = [
				eq(employeeGratification.organizationId, organizationId),
				eq(employeeGratification.employeeId, params.employeeId),
			];
			if (query.status) {
				conditions.push(eq(employeeGratification.status, query.status));
			}
			if (query.periodicity) {
				conditions.push(eq(employeeGratification.periodicity, query.periodicity));
			}
			if (query.applicationMode) {
				conditions.push(eq(employeeGratification.applicationMode, query.applicationMode));
			}

			const rows = await db
				.select()
				.from(employeeGratification)
				.where(and(...conditions))
				.orderBy(desc(employeeGratification.createdAt));

			return {
				data: rows.map((row) =>
					normalizeGratificationRow(
						row,
						`${employeeRecord.firstName} ${employeeRecord.lastName}`.trim(),
					),
				),
			};
		},
		{
			params: employeeGratificationParamsSchema,
			query: employeeGratificationListQuerySchema,
		},
	)
	.put(
		'/employees/:employeeId/gratifications/:id',
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

			const isAdmin = await ensureOrganizationAdmin({ authType, session, organizationId }, set);
			if (!isAdmin) {
				return buildErrorResponse('Only owner/admin can manage employee gratifications', 403);
			}

			const employeeRows = await db
				.select({
					id: employee.id,
					firstName: employee.firstName,
					lastName: employee.lastName,
				})
				.from(employee)
				.where(
					and(
						eq(employee.id, params.employeeId),
						eq(employee.organizationId, organizationId),
					),
				)
				.limit(1);
			const employeeRecord = employeeRows[0] ?? null;
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			const gratificationRows = await db
				.select()
				.from(employeeGratification)
				.where(
					and(
						eq(employeeGratification.id, params.id),
						eq(employeeGratification.organizationId, organizationId),
						eq(employeeGratification.employeeId, params.employeeId),
					),
				)
				.limit(1);
			const existing = gratificationRows[0] ?? null;
			if (!existing) {
				set.status = 404;
				return buildErrorResponse('Employee gratification not found', 404);
			}

			if (body.status && !isValidGratificationStatusTransition(existing.status, body.status)) {
				set.status = 400;
				return buildErrorResponse(
					`Invalid status transition from ${existing.status} to ${body.status}`,
					400,
				);
			}

			const resolvedPeriodicity = body.periodicity ?? existing.periodicity;
			const resolvedApplicationMode = body.applicationMode ?? existing.applicationMode;
			const resolvedStartDateKey = body.startDateKey ?? existing.startDateKey;
			const resolvedEndDateKey =
				body.endDateKey !== undefined ? body.endDateKey : existing.endDateKey;

			if (!hasValidGratificationDateRange(resolvedStartDateKey, resolvedEndDateKey)) {
				set.status = 400;
				return buildErrorResponse('endDateKey must be greater than or equal to startDateKey', 400);
			}

			const validationError = validateGratificationBusinessRules({
				periodicity: resolvedPeriodicity,
				applicationMode: resolvedApplicationMode,
			});
			if (validationError) {
				set.status = 400;
				return buildErrorResponse(validationError, 400);
			}

			const [updatedRow] = await db
				.update(employeeGratification)
				.set(buildGratificationMutationValues(body))
				.where(
					and(
						eq(employeeGratification.id, params.id),
						eq(employeeGratification.organizationId, organizationId),
						eq(employeeGratification.employeeId, params.employeeId),
					),
				)
				.returning();
			if (!updatedRow) {
				set.status = 404;
				return buildErrorResponse('Employee gratification not found', 404);
			}

			return {
				data: normalizeGratificationRow(
					updatedRow,
					`${employeeRecord.firstName} ${employeeRecord.lastName}`.trim(),
				),
			};
		},
		{
			params: employeeGratificationDetailParamsSchema,
			body: employeeGratificationUpdateSchema,
		},
	)
	.delete(
		'/employees/:employeeId/gratifications/:id',
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

			const isAdmin = await ensureOrganizationAdmin({ authType, session, organizationId }, set);
			if (!isAdmin) {
				return buildErrorResponse('Only owner/admin can manage employee gratifications', 403);
			}

			const gratificationRows = await db
				.select()
				.from(employeeGratification)
				.where(
					and(
						eq(employeeGratification.id, params.id),
						eq(employeeGratification.organizationId, organizationId),
						eq(employeeGratification.employeeId, params.employeeId),
					),
				)
				.limit(1);
			const existing = gratificationRows[0] ?? null;
			if (!existing) {
				set.status = 404;
				return buildErrorResponse('Employee gratification not found', 404);
			}

			const [updatedRow] = await db
				.update(employeeGratification)
				.set({ status: 'CANCELLED' })
				.where(
					and(
						eq(employeeGratification.id, params.id),
						eq(employeeGratification.organizationId, organizationId),
						eq(employeeGratification.employeeId, params.employeeId),
					),
				)
				.returning();
			if (!updatedRow) {
				set.status = 404;
				return buildErrorResponse('Employee gratification not found', 404);
			}

			return {
				data: normalizeGratificationRow(updatedRow),
			};
		},
		{
			params: employeeGratificationDetailParamsSchema,
		},
	)
	.get(
		'/gratifications',
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

			const isAdmin = await ensureOrganizationAdmin({ authType, session, organizationId }, set);
			if (!isAdmin) {
				return buildErrorResponse('Only owner/admin can manage employee gratifications', 403);
			}

			const conditions = [eq(employeeGratification.organizationId, organizationId)];
			if (query.status) {
				conditions.push(eq(employeeGratification.status, query.status));
			}
			if (query.periodicity) {
				conditions.push(eq(employeeGratification.periodicity, query.periodicity));
			}
			if (query.applicationMode) {
				conditions.push(eq(employeeGratification.applicationMode, query.applicationMode));
			}
			if (query.employeeId) {
				conditions.push(eq(employeeGratification.employeeId, query.employeeId));
			}

			const whereClause = and(...conditions);
			const [countRow] = await db
				.select({ count: count() })
				.from(employeeGratification)
				.where(whereClause);

			const rows = await db
				.select()
				.from(employeeGratification)
				.where(whereClause)
				.orderBy(desc(employeeGratification.createdAt))
				.limit(query.limit)
				.offset(query.offset);

			const employeeIds = Array.from(new Set(rows.map((row) => row.employeeId)));
			const employeeRows =
				employeeIds.length === 0
					? []
					: await db
							.select({
								id: employee.id,
								firstName: employee.firstName,
								lastName: employee.lastName,
							})
							.from(employee)
							.where(
								and(
									eq(employee.organizationId, organizationId),
									inArray(employee.id, employeeIds),
								),
							);
			const employeeNameById = new Map(
				employeeRows.map((row) => [row.id, `${row.firstName} ${row.lastName}`.trim()]),
			);

			return {
				data: rows.map((row) =>
					normalizeGratificationRow(row, employeeNameById.get(row.employeeId)),
				),
				pagination: {
					limit: query.limit,
					offset: query.offset,
					total: countRow?.count ?? 0,
				},
			};
		},
		{
			params: employeeGratificationParamsSchema.pick({ organizationId: true }),
			query: organizationGratificationListQuerySchema,
		},
	);
