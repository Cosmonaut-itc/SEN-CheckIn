import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { Elysia } from 'elysia';

import db from '../db/index.js';
import { employee, employeeDeduction, member } from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import type { AuthSession } from '../plugins/auth.js';
import {
	type EmployeeDeductionCreateInput,
	employeeDeductionCreateSchema,
	employeeDeductionDetailParamsSchema,
	employeeDeductionListQuerySchema,
	employeeDeductionParamsSchema,
	employeeDeductionUpdateSchema,
	organizationDeductionListQuerySchema,
} from '../schemas/employee-deductions.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { resolveOrganizationId } from '../utils/organization.js';

type DeductionType = EmployeeDeductionCreateInput['type'];
type DeductionCalculationMethod = EmployeeDeductionCreateInput['calculationMethod'];
type DeductionFrequency = EmployeeDeductionCreateInput['frequency'];
type DeductionStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
type DeductionMutationInput = {
	label?: string;
	value?: number;
	frequency?: DeductionFrequency;
	totalInstallments?: number | null;
	totalAmount?: number | null;
	remainingAmount?: number | null;
	status?: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
	startDateKey?: string;
	endDateKey?: string | null;
	referenceNumber?: string | null;
	satDeductionCode?: string | null;
	notes?: string | null;
};

export interface EmployeeDeductionRecord {
	id: string;
	organizationId: string;
	employeeId: string;
	type: DeductionType;
	label: string;
	calculationMethod: DeductionCalculationMethod;
	value: number;
	frequency: DeductionFrequency;
	totalInstallments: number | null;
	completedInstallments: number;
	totalAmount: number | null;
	remainingAmount: number | null;
	status: DeductionStatus;
	startDateKey: string;
	endDateKey: string | null;
	referenceNumber: string | null;
	satDeductionCode: string | null;
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
function normalizeDeductionRow(
	row: {
		id: string;
		organizationId: string;
		employeeId: string;
		type: DeductionType;
		label: string;
		calculationMethod: DeductionCalculationMethod;
		value: number | string;
		frequency: DeductionFrequency;
		totalInstallments: number | null;
		completedInstallments: number;
		totalAmount: number | string | null;
		remainingAmount: number | string | null;
		status: DeductionStatus;
		startDateKey: string;
		endDateKey: string | null;
		referenceNumber: string | null;
		satDeductionCode: string | null;
		notes: string | null;
		createdByUserId: string;
		createdAt: Date;
		updatedAt: Date;
	},
	employeeName?: string,
): EmployeeDeductionRecord {
	return {
		id: row.id,
		organizationId: row.organizationId,
		employeeId: row.employeeId,
		type: row.type,
		label: row.label,
		calculationMethod: row.calculationMethod,
		value: Number(row.value ?? 0),
		frequency: row.frequency,
		totalInstallments: row.totalInstallments,
		completedInstallments: row.completedInstallments,
		totalAmount: row.totalAmount === null ? null : Number(row.totalAmount),
		remainingAmount: row.remainingAmount === null ? null : Number(row.remainingAmount),
		status: row.status,
		startDateKey: row.startDateKey,
		endDateKey: row.endDateKey,
		referenceNumber: row.referenceNumber,
		satDeductionCode: row.satDeductionCode,
		notes: row.notes,
		createdByUserId: row.createdByUserId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		employeeName,
	};
}

/**
 * Validates business rules driven by deduction type and configuration.
 *
 * @param args - Deduction business input
 * @returns Error message when invalid, otherwise null
 */
export function validateDeductionBusinessRules(args: {
	type: DeductionType;
	calculationMethod: DeductionCalculationMethod;
	frequency: DeductionFrequency;
	totalInstallments?: number | null;
	totalAmount?: number | null;
	remainingAmount?: number | null;
}): string | null {
	const infonavitMethods = new Set<DeductionCalculationMethod>([
		'PERCENTAGE_SBC',
		'FIXED_AMOUNT',
		'VSM_FACTOR',
	]);
	const alimonyMethods = new Set<DeductionCalculationMethod>([
		'PERCENTAGE_NET',
		'FIXED_AMOUNT',
	]);
	if (args.type === 'INFONAVIT' && !infonavitMethods.has(args.calculationMethod)) {
		return 'INFONAVIT deductions only allow PERCENTAGE_SBC, FIXED_AMOUNT, or VSM_FACTOR';
	}
	if (args.type === 'ALIMONY' && !alimonyMethods.has(args.calculationMethod)) {
		return 'ALIMONY deductions only allow PERCENTAGE_NET or FIXED_AMOUNT';
	}
	if (
		(args.type === 'LOAN' || args.type === 'ADVANCE') &&
		args.frequency !== 'INSTALLMENTS' &&
		args.frequency !== 'ONE_TIME'
	) {
		return 'LOAN and ADVANCE deductions only allow INSTALLMENTS or ONE_TIME';
	}
	if (args.frequency === 'INSTALLMENTS' && (!args.totalInstallments || args.totalInstallments < 1)) {
		return 'INSTALLMENTS deductions require totalInstallments greater than 0';
	}
	if (
		args.totalAmount !== undefined &&
		args.totalAmount !== null &&
		args.remainingAmount !== undefined &&
		args.remainingAmount !== null &&
		args.remainingAmount > args.totalAmount
	) {
		return 'remainingAmount cannot be greater than totalAmount';
	}

	return null;
}

/**
 * Validates a deduction status transition.
 *
 * @param currentStatus - Current persisted status
 * @param nextStatus - Requested next status
 * @returns True when the transition is allowed
 */
export function isValidDeductionStatusTransition(
	currentStatus: DeductionStatus,
	nextStatus: 'ACTIVE' | 'PAUSED' | 'CANCELLED',
): boolean {
	if (currentStatus === nextStatus) {
		return true;
	}
	if (nextStatus === 'CANCELLED') {
		return true;
	}
	if (currentStatus === 'ACTIVE' && nextStatus === 'PAUSED') {
		return true;
	}
	if (currentStatus === 'PAUSED' && nextStatus === 'ACTIVE') {
		return true;
	}
	return false;
}

/**
 * Resolves an employee within the requested organization.
 *
 * @param organizationId - Organization identifier
 * @param employeeId - Employee identifier
 * @returns Employee row when found, otherwise null
 */
async function getScopedEmployee(
	organizationId: string,
	employeeId: string,
): Promise<{ id: string; firstName: string; lastName: string } | null> {
	const rows = await db
		.select({
			id: employee.id,
			firstName: employee.firstName,
			lastName: employee.lastName,
		})
		.from(employee)
		.where(and(eq(employee.id, employeeId), eq(employee.organizationId, organizationId)))
		.limit(1);
	return rows[0] ?? null;
}

/**
 * Normalizes create/update payload into DB write values.
 *
 * @param payload - Mutation payload
 * @returns Write-safe partial object
 */
function buildDeductionMutationValues(
	payload: DeductionMutationInput,
): Record<string, unknown> {
	const hasTotalAmount = 'totalAmount' in payload;
	const hasRemainingAmount = 'remainingAmount' in payload;
	const shouldClearTotalInstallments =
		payload.frequency !== undefined && payload.frequency !== 'INSTALLMENTS';
	const totalAmount = hasTotalAmount ? (payload.totalAmount ?? null) : undefined;
	const remainingAmount = hasRemainingAmount
		? (payload.remainingAmount ?? null)
		: undefined;

	return {
		...(payload.label !== undefined ? { label: payload.label } : {}),
		...(payload.value !== undefined ? { value: payload.value.toFixed(4) } : {}),
		...(payload.frequency !== undefined ? { frequency: payload.frequency } : {}),
		...(payload.totalInstallments !== undefined || shouldClearTotalInstallments
			? {
					totalInstallments: shouldClearTotalInstallments
						? null
						: payload.totalInstallments,
				}
			: {}),
		...(totalAmount !== undefined
			? { totalAmount: totalAmount === null ? null : totalAmount.toFixed(2) }
			: {}),
		...(remainingAmount !== undefined
			? { remainingAmount: remainingAmount === null ? null : remainingAmount.toFixed(2) }
			: {}),
		...(payload.status !== undefined ? { status: payload.status } : {}),
		...(payload.startDateKey !== undefined ? { startDateKey: payload.startDateKey } : {}),
		...(payload.endDateKey !== undefined ? { endDateKey: payload.endDateKey } : {}),
		...(payload.referenceNumber !== undefined
			? { referenceNumber: payload.referenceNumber }
			: {}),
		...(payload.satDeductionCode !== undefined
			? { satDeductionCode: payload.satDeductionCode }
			: {}),
		...(payload.notes !== undefined ? { notes: payload.notes } : {}),
	};
}

/**
 * Employee deduction CRUD routes.
 */
export const employeeDeductionRoutes = new Elysia({ prefix: '/organizations/:organizationId' })
	.use(combinedAuthPlugin)
	.post(
		'/employees/:employeeId/deductions',
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
				return buildErrorResponse('Only owner/admin can manage employee deductions', 403);
			}

			const employeeRecord = await getScopedEmployee(organizationId, params.employeeId);
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			const validationError = validateDeductionBusinessRules({
				type: body.type,
				calculationMethod: body.calculationMethod,
				frequency: body.frequency,
				totalInstallments: body.totalInstallments,
				totalAmount: body.totalAmount,
				remainingAmount: body.remainingAmount,
			});
			if (validationError) {
				set.status = 400;
				return buildErrorResponse(validationError, 400);
			}

			const [createdRow] = await db
				.insert(employeeDeduction)
				.values({
					organizationId,
					employeeId: params.employeeId,
					type: body.type,
					label: body.label,
					calculationMethod: body.calculationMethod,
					value: body.value.toFixed(4),
					frequency: body.frequency,
					totalInstallments:
						body.frequency === 'INSTALLMENTS' ? (body.totalInstallments ?? null) : null,
					totalAmount:
						body.totalAmount === undefined ? null : body.totalAmount.toFixed(2),
					remainingAmount:
						body.remainingAmount === undefined
							? body.totalAmount === undefined
								? null
								: body.totalAmount.toFixed(2)
							: body.remainingAmount.toFixed(2),
					startDateKey: body.startDateKey,
					endDateKey: body.endDateKey ?? null,
					referenceNumber: body.referenceNumber ?? null,
					satDeductionCode: body.satDeductionCode ?? null,
					notes: body.notes ?? null,
					completedInstallments: 0,
					createdByUserId: session?.userId ?? '',
					status: 'ACTIVE',
				})
				.returning();
			if (!createdRow) {
				set.status = 500;
				return buildErrorResponse('Failed to create employee deduction', 500);
			}

			set.status = 201;
			return {
				data: normalizeDeductionRow(
					createdRow,
					`${employeeRecord.firstName} ${employeeRecord.lastName}`.trim(),
				),
			};
		},
		{
			params: employeeDeductionParamsSchema,
			body: employeeDeductionCreateSchema,
		},
	)
	.get(
		'/employees/:employeeId/deductions',
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

			const employeeRecord = await getScopedEmployee(organizationId, params.employeeId);
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			const conditions = [
				eq(employeeDeduction.organizationId, organizationId),
				eq(employeeDeduction.employeeId, params.employeeId),
			];
			if (query.status) {
				conditions.push(eq(employeeDeduction.status, query.status));
			}
			if (query.type) {
				conditions.push(eq(employeeDeduction.type, query.type));
			}

			const rows = await db
				.select()
				.from(employeeDeduction)
				.where(and(...conditions))
				.orderBy(desc(employeeDeduction.createdAt));

			return {
				data: rows.map((row) =>
					normalizeDeductionRow(
						row,
						`${employeeRecord.firstName} ${employeeRecord.lastName}`.trim(),
					),
				),
			};
		},
		{
			params: employeeDeductionParamsSchema,
			query: employeeDeductionListQuerySchema,
		},
	)
	.put(
		'/employees/:employeeId/deductions/:id',
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
				return buildErrorResponse('Only owner/admin can manage employee deductions', 403);
			}

			const employeeRecord = await getScopedEmployee(organizationId, params.employeeId);
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			const employeeRows = await db
				.select()
				.from(employeeDeduction)
				.where(
					and(
						eq(employeeDeduction.id, params.id),
						eq(employeeDeduction.organizationId, organizationId),
						eq(employeeDeduction.employeeId, params.employeeId),
					),
				)
				.limit(1);
			const existing = employeeRows[0] ?? null;
			if (!existing) {
				set.status = 404;
				return buildErrorResponse('Employee deduction not found', 404);
			}

			if (
				body.status &&
				!isValidDeductionStatusTransition(existing.status, body.status)
			) {
				set.status = 400;
				return buildErrorResponse(
					`Invalid status transition from ${existing.status} to ${body.status}`,
					400,
				);
			}

			const resolvedFrequency = body.frequency ?? existing.frequency;
			const resolvedTotalInstallments =
				body.totalInstallments !== undefined
					? body.totalInstallments
					: existing.totalInstallments;
			const resolvedTotalAmount =
				body.totalAmount !== undefined
					? body.totalAmount
					: existing.totalAmount === null
						? null
						: Number(existing.totalAmount);
			const resolvedRemainingAmount =
				body.remainingAmount !== undefined
					? body.remainingAmount
					: existing.remainingAmount === null
						? null
						: Number(existing.remainingAmount);

			const validationError = validateDeductionBusinessRules({
				type: existing.type,
				calculationMethod: existing.calculationMethod,
				frequency: resolvedFrequency,
				totalInstallments: resolvedTotalInstallments,
				totalAmount: resolvedTotalAmount,
				remainingAmount: resolvedRemainingAmount,
			});
			if (validationError) {
				set.status = 400;
				return buildErrorResponse(validationError, 400);
			}

			const [updatedRow] = await db
				.update(employeeDeduction)
				.set(buildDeductionMutationValues(body))
				.where(
					and(
						eq(employeeDeduction.id, params.id),
						eq(employeeDeduction.organizationId, organizationId),
						eq(employeeDeduction.employeeId, params.employeeId),
					),
				)
				.returning();
			if (!updatedRow) {
				set.status = 404;
				return buildErrorResponse('Employee deduction not found', 404);
			}

			return {
				data: normalizeDeductionRow(
					updatedRow,
					`${employeeRecord.firstName} ${employeeRecord.lastName}`.trim(),
				),
			};
		},
		{
			params: employeeDeductionDetailParamsSchema,
			body: employeeDeductionUpdateSchema,
		},
	)
	.get(
		'/deductions',
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
				return buildErrorResponse('Only owner/admin can manage employee deductions', 403);
			}

			const conditions = [eq(employeeDeduction.organizationId, organizationId)];
			if (query.status) {
				conditions.push(eq(employeeDeduction.status, query.status));
			}
			if (query.type) {
				conditions.push(eq(employeeDeduction.type, query.type));
			}
			if (query.employeeId) {
				conditions.push(eq(employeeDeduction.employeeId, query.employeeId));
			}

			const whereClause = and(...conditions);
			const [countRow] = await db
				.select({ count: count() })
				.from(employeeDeduction)
				.where(whereClause);

			const rows = await db
				.select()
				.from(employeeDeduction)
				.where(whereClause)
				.orderBy(desc(employeeDeduction.createdAt))
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
					normalizeDeductionRow(row, employeeNameById.get(row.employeeId)),
				),
				pagination: {
					limit: query.limit,
					offset: query.offset,
					total: countRow?.count ?? 0,
				},
			};
		},
		{
			params: employeeDeductionParamsSchema.pick({ organizationId: true }),
			query: organizationDeductionListQuerySchema,
		},
	);
