import { and, eq, gte, lte, ne, type SQL } from 'drizzle-orm';
import { inArray } from 'drizzle-orm/sql';
import { Elysia } from 'elysia';
import crypto from 'node:crypto';

import db from '../db/index.js';
import {
	employee,
	employeeIncapacity,
	employeeSchedule,
	member,
	payrollSetting,
	scheduleException,
	scheduleTemplateDay,
	vacationRequest,
	vacationRequestDay,
} from '../db/schema.js';
import type { AuthSession } from '../plugins/auth.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { idParamSchema } from '../schemas/crud.js';
import { addDaysToDateKey, parseDateKey, toDateKeyUtc } from '../utils/date-key.js';
import {
	vacationRequestCreateSchema,
	vacationRequestDecisionSchema,
	vacationRequestQuerySchema,
	type VacationRequestStatus,
} from '../schemas/vacations.js';
import {
	buildMandatoryRestDayKeys,
	buildVacationDayBreakdown,
	calculateVacationAccrual,
	type VacationDayDetail,
	type VacationScheduleDay,
	type VacationScheduleException,
} from '../services/vacations.js';
import { resolveOrganizationId } from '../utils/organization.js';
import { isValidIanaTimeZone } from '../utils/time-zone.js';
import {
	buildEmployeeVacationBalance,
	getVacationUsageByServiceYear,
} from '../services/vacation-balance.js';

type VacationRequestRow = typeof vacationRequest.$inferSelect;

type VacationRequestDayRow = {
	dateKey: string;
	countsAsVacationDay: boolean;
	dayType: VacationDayDetail['dayType'];
	serviceYearNumber: number | null;
};

type VacationRequestSummary = {
	totalDays: number;
	vacationDays: number;
};

type VacationRequestResponse = VacationRequestRow & {
	employeeName: string | null;
	employeeLastName: string | null;
	days: VacationRequestDayRow[];
	summary: VacationRequestSummary;
};

/**
 * Converts a date key to a UTC boundary Date for database range queries.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @param endOfDay - When true, returns the last millisecond of the UTC day
 * @returns UTC Date aligned to the requested boundary
 */
function getUtcBoundaryDate(dateKey: string, endOfDay = false): Date {
	const { year, month, day } = parseDateKey(dateKey);

	return new Date(
		Date.UTC(
			year,
			month - 1,
			day,
			endOfDay ? 23 : 0,
			endOfDay ? 59 : 0,
			endOfDay ? 59 : 0,
			endOfDay ? 999 : 0,
		),
	);
}

const VACATION_ERROR_CODES = {
	EMPLOYEE_REQUIRED: 'VACATION_EMPLOYEE_REQUIRED',
	EMPLOYEE_NOT_FOUND: 'VACATION_EMPLOYEE_NOT_FOUND',
	INVALID_STATUS: 'VACATION_INVALID_STATUS',
	HIRE_DATE_REQUIRED: 'VACATION_HIRE_DATE_REQUIRED',
	INVALID_RANGE: 'VACATION_INVALID_RANGE',
	SERVICE_YEAR_INCOMPLETE: 'VACATION_SERVICE_YEAR_INCOMPLETE',
	INSUFFICIENT_BALANCE: 'VACATION_INSUFFICIENT_BALANCE',
	OVERLAP: 'VACATION_OVERLAP',
} as const;

/**
 * Ensures the caller is an organization admin or owner.
 *
 * @param args - Auth context and organization identifier
 * @param args.authType - Authentication type
 * @param args.session - Session info when authType is session
 * @param args.organizationId - Organization identifier
 * @param set - Elysia response setter
 * @returns True when authorized
 */
async function ensureAdminRole(
	args: { authType: 'session' | 'apiKey'; session: AuthSession | null; organizationId: string },
	set: { status?: number | string } & Record<string, unknown>,
): Promise<boolean> {
	if (args.authType !== 'session' || !args.session) {
		set.status = 403;
		return false;
	}

	const membership = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(
				eq(member.userId, args.session.userId),
				eq(member.organizationId, args.organizationId),
			),
		)
		.limit(1);

	const role = membership[0]?.role ?? null;
	if (!role || (role !== 'admin' && role !== 'owner')) {
		set.status = 403;
		return false;
	}

	return true;
}

/**
 * Resolves the employee record linked to a session user.
 *
 * @param organizationId - Organization identifier
 * @param session - Auth session
 * @param set - Elysia response setter
 * @returns Employee record when found
 */
async function getEmployeeForSession(
	organizationId: string,
	session: AuthSession,
	set: { status?: number | string } & Record<string, unknown>,
): Promise<typeof employee.$inferSelect | null> {
	const rows = await db
		.select()
		.from(employee)
		.where(
			and(eq(employee.organizationId, organizationId), eq(employee.userId, session.userId)),
		)
		.limit(1);

	if (!rows[0]) {
		set.status = 404;
		return null;
	}

	return rows[0];
}

/**
 * Loads base schedule days for an employee.
 *
 * @param employeeRecord - Employee record
 * @returns Schedule days (template or manual)
 */
async function loadBaseScheduleDays(
	employeeRecord: typeof employee.$inferSelect,
): Promise<VacationScheduleDay[]> {
	if (employeeRecord.scheduleTemplateId) {
		const rows = await db
			.select({
				dayOfWeek: scheduleTemplateDay.dayOfWeek,
				isWorkingDay: scheduleTemplateDay.isWorkingDay,
			})
			.from(scheduleTemplateDay)
			.where(eq(scheduleTemplateDay.templateId, employeeRecord.scheduleTemplateId));
		return rows.map((row) => ({
			dayOfWeek: row.dayOfWeek,
			isWorkingDay: row.isWorkingDay ?? true,
		}));
	}

	const rows = await db
		.select({
			dayOfWeek: employeeSchedule.dayOfWeek,
			isWorkingDay: employeeSchedule.isWorkingDay,
		})
		.from(employeeSchedule)
		.where(eq(employeeSchedule.employeeId, employeeRecord.id));

	return rows.map((row) => ({
		dayOfWeek: row.dayOfWeek,
		isWorkingDay: row.isWorkingDay ?? true,
	}));
}

/**
 * Loads schedule exceptions for an employee within a date key range.
 *
 * @param employeeId - Employee identifier
 * @param startDateKey - Start date key (YYYY-MM-DD)
 * @param endDateKey - End date key (YYYY-MM-DD)
 * @returns Schedule exceptions for the range
 */
async function loadScheduleExceptionsForRange(
	employeeId: string,
	startDateKey: string,
	endDateKey: string,
): Promise<VacationScheduleException[]> {
	const rangeStart = getUtcBoundaryDate(startDateKey);
	const rangeEnd = getUtcBoundaryDate(endDateKey, true);

	const rows = await db
		.select({
			exceptionDate: scheduleException.exceptionDate,
			exceptionType: scheduleException.exceptionType,
		})
		.from(scheduleException)
		.where(
			and(
				eq(scheduleException.employeeId, employeeId),
				gte(scheduleException.exceptionDate, rangeStart),
				lte(scheduleException.exceptionDate, rangeEnd),
			)!,
		);

	return rows.map((row) => ({
		exceptionDate: row.exceptionDate,
		exceptionType: row.exceptionType,
	}));
}

/**
 * Finds active incapacity overlaps for a date range.
 *
 * @param organizationId - Organization identifier
 * @param employeeId - Employee identifier
 * @param startDateKey - Range start date key (YYYY-MM-DD)
 * @param endDateKey - Range end date key (YYYY-MM-DD)
 * @returns Overlapping incapacity ranges
 */
async function findIncapacityOverlaps(args: {
	organizationId: string;
	employeeId: string;
	startDateKey: string;
	endDateKey: string;
}): Promise<{ startDateKey: string; endDateKey: string; type: string }[]> {
	return await db
		.select({
			startDateKey: employeeIncapacity.startDateKey,
			endDateKey: employeeIncapacity.endDateKey,
			type: employeeIncapacity.type,
		})
		.from(employeeIncapacity)
		.where(
			and(
				eq(employeeIncapacity.organizationId, args.organizationId),
				eq(employeeIncapacity.employeeId, args.employeeId),
				eq(employeeIncapacity.status, 'ACTIVE'),
				lte(employeeIncapacity.startDateKey, args.endDateKey),
				gte(employeeIncapacity.endDateKey, args.startDateKey),
			)!,
		);
}

/**
 * Expands active incapacity ranges into a per-day date key set.
 *
 * @param args - Range lookup inputs
 * @returns Set of date keys covered by active incapacity records
 */
async function loadActiveIncapacityDateKeys(args: {
	organizationId: string;
	employeeId: string;
	startDateKey: string;
	endDateKey: string;
}): Promise<Set<string>> {
	const overlaps = await findIncapacityOverlaps(args);
	const dateKeys = new Set<string>();

	for (const overlap of overlaps) {
		let cursor =
			overlap.startDateKey < args.startDateKey ? args.startDateKey : overlap.startDateKey;
		const rangeEnd =
			overlap.endDateKey > args.endDateKey ? args.endDateKey : overlap.endDateKey;

		for (let i = 0; i < 400 && cursor <= rangeEnd; i += 1) {
			dateKeys.add(cursor);
			if (cursor === rangeEnd) {
				break;
			}
			cursor = addDaysToDateKey(cursor, 1);
		}
	}

	return dateKeys;
}

/**
 * Builds vacation request day breakdown using schedule and rest day policies.
 *
 * @param employeeRecord - Employee record
 * @param startDateKey - Start date key (YYYY-MM-DD)
 * @param endDateKey - End date key (YYYY-MM-DD)
 * @param additionalMandatoryRestDays - Organization additional rest day keys
 * @returns Vacation day breakdown
 */
async function buildVacationRequestDays(
	employeeRecord: typeof employee.$inferSelect,
	startDateKey: string,
	endDateKey: string,
	additionalMandatoryRestDays: string[],
): Promise<ReturnType<typeof buildVacationDayBreakdown>> {
	const [scheduleDays, exceptions, incapacityDateKeys] = await Promise.all([
		loadBaseScheduleDays(employeeRecord),
		loadScheduleExceptionsForRange(employeeRecord.id, startDateKey, endDateKey),
		loadActiveIncapacityDateKeys({
			organizationId: employeeRecord.organizationId ?? '',
			employeeId: employeeRecord.id,
			startDateKey,
			endDateKey,
		}),
	]);

	const mandatoryRestDayKeys = buildMandatoryRestDayKeys(
		startDateKey,
		endDateKey,
		additionalMandatoryRestDays,
	);

	return buildVacationDayBreakdown({
		startDateKey,
		endDateKey,
		scheduleDays,
		exceptions,
		mandatoryRestDayKeys,
		incapacityDateKeys,
		hireDate: employeeRecord.hireDate ?? null,
	});
}

/**
 * Validates that requested days fit within available balances.
 *
 * @param args - Balance validation inputs
 * @param args.organizationId - Organization identifier
 * @param args.employeeId - Employee identifier
 * @param args.requestedDaysByServiceYear - Map of requested days by service year
 * @param args.requestEndDateKey - Request end date key (YYYY-MM-DD)
 * @param args.hireDate - Employee hire date
 * @param args.excludeRequestId - Optional request ID to exclude
 * @param set - Elysia response setter
 * @returns True when balance is sufficient
 */
async function validateVacationBalance(
	args: {
		organizationId: string;
		employeeId: string;
		requestedDaysByServiceYear: Map<number, number>;
		requestEndDateKey: string;
		hireDate: Date;
		excludeRequestId?: string;
	},
	set: { status?: number | string } & Record<string, unknown>,
): Promise<boolean> {
	const usedDays = await getVacationUsageByServiceYear({
		organizationId: args.organizationId,
		employeeId: args.employeeId,
		statuses: ['SUBMITTED', 'APPROVED'],
		excludeRequestId: args.excludeRequestId,
	});

	for (const [serviceYearNumber, requestedDays] of args.requestedDaysByServiceYear.entries()) {
		if (serviceYearNumber <= 0) {
			set.status = 400;
			return false;
		}

		const accrual = calculateVacationAccrual({
			hireDate: args.hireDate,
			serviceYearNumber,
			asOfDateKey: args.requestEndDateKey,
		});
		const alreadyUsed = usedDays.get(serviceYearNumber) ?? 0;
		const availableDays = Math.max(0, Math.floor(accrual.accruedDays) - alreadyUsed);
		if (requestedDays > availableDays) {
			set.status = 409;
			return false;
		}
	}

	return true;
}

/**
 * Fetches vacation requests with days and summary data.
 *
 * @param args - Query filters and pagination
 * @returns Requests list and total count
 */
async function fetchVacationRequests(args: {
	organizationId: string;
	employeeId?: string;
	status?: VacationRequestStatus;
	from?: string;
	to?: string;
	limit: number;
	offset: number;
}): Promise<{ data: VacationRequestResponse[]; total: number }> {
	const conditions: [SQL<unknown>, ...SQL<unknown>[]] = [
		eq(vacationRequest.organizationId, args.organizationId),
	];

	if (args.employeeId) {
		conditions.push(eq(vacationRequest.employeeId, args.employeeId));
	}
	if (args.status) {
		conditions.push(eq(vacationRequest.status, args.status));
	}
	if (args.from && args.to) {
		conditions.push(lte(vacationRequest.startDateKey, args.to));
		conditions.push(gte(vacationRequest.endDateKey, args.from));
	} else if (args.from) {
		conditions.push(gte(vacationRequest.endDateKey, args.from));
	} else if (args.to) {
		conditions.push(lte(vacationRequest.startDateKey, args.to));
	}

	const whereClause = and(...conditions)!;

	const requestRows = await db
		.select({
			id: vacationRequest.id,
			organizationId: vacationRequest.organizationId,
			employeeId: vacationRequest.employeeId,
			requestedByUserId: vacationRequest.requestedByUserId,
			status: vacationRequest.status,
			startDateKey: vacationRequest.startDateKey,
			endDateKey: vacationRequest.endDateKey,
			requestedNotes: vacationRequest.requestedNotes,
			decisionNotes: vacationRequest.decisionNotes,
			approvedByUserId: vacationRequest.approvedByUserId,
			approvedAt: vacationRequest.approvedAt,
			rejectedByUserId: vacationRequest.rejectedByUserId,
			rejectedAt: vacationRequest.rejectedAt,
			cancelledByUserId: vacationRequest.cancelledByUserId,
			cancelledAt: vacationRequest.cancelledAt,
			createdAt: vacationRequest.createdAt,
			updatedAt: vacationRequest.updatedAt,
			employeeName: employee.firstName,
			employeeLastName: employee.lastName,
		})
		.from(vacationRequest)
		.leftJoin(employee, eq(vacationRequest.employeeId, employee.id))
		.where(whereClause)
		.limit(args.limit)
		.offset(args.offset)
		.orderBy(vacationRequest.createdAt);

	const total = (
		await db.select({ id: vacationRequest.id }).from(vacationRequest).where(whereClause)
	).length;

	const requestIds = requestRows.map((row) => row.id);
	const dayRows =
		requestIds.length === 0
			? []
			: await db
					.select({
						requestId: vacationRequestDay.requestId,
						dateKey: vacationRequestDay.dateKey,
						countsAsVacationDay: vacationRequestDay.countsAsVacationDay,
						dayType: vacationRequestDay.dayType,
						serviceYearNumber: vacationRequestDay.serviceYearNumber,
					})
					.from(vacationRequestDay)
					.where(inArray(vacationRequestDay.requestId, requestIds))
					.orderBy(vacationRequestDay.dateKey);

	const daysByRequestId = new Map<string, VacationRequestDayRow[]>();
	for (const day of dayRows) {
		const current = daysByRequestId.get(day.requestId) ?? [];
		current.push({
			dateKey: day.dateKey,
			countsAsVacationDay: day.countsAsVacationDay,
			dayType: day.dayType,
			serviceYearNumber: day.serviceYearNumber ?? null,
		});
		daysByRequestId.set(day.requestId, current);
	}

	const data: VacationRequestResponse[] = requestRows.map((row) => {
		const days = daysByRequestId.get(row.id) ?? [];
		const summary: VacationRequestSummary = {
			totalDays: days.length,
			vacationDays: days.filter((day) => day.countsAsVacationDay).length,
		};

		return {
			...row,
			days,
			summary,
		};
	});

	return { data, total };
}

/**
 * Fetches a single vacation request with days and summary.
 *
 * @param requestId - Vacation request identifier
 * @returns Request response or null when missing
 */
async function fetchVacationRequestDetail(
	requestId: string,
): Promise<VacationRequestResponse | null> {
	const rows = await db
		.select({
			id: vacationRequest.id,
			organizationId: vacationRequest.organizationId,
			employeeId: vacationRequest.employeeId,
			requestedByUserId: vacationRequest.requestedByUserId,
			status: vacationRequest.status,
			startDateKey: vacationRequest.startDateKey,
			endDateKey: vacationRequest.endDateKey,
			requestedNotes: vacationRequest.requestedNotes,
			decisionNotes: vacationRequest.decisionNotes,
			approvedByUserId: vacationRequest.approvedByUserId,
			approvedAt: vacationRequest.approvedAt,
			rejectedByUserId: vacationRequest.rejectedByUserId,
			rejectedAt: vacationRequest.rejectedAt,
			cancelledByUserId: vacationRequest.cancelledByUserId,
			cancelledAt: vacationRequest.cancelledAt,
			createdAt: vacationRequest.createdAt,
			updatedAt: vacationRequest.updatedAt,
			employeeName: employee.firstName,
			employeeLastName: employee.lastName,
		})
		.from(vacationRequest)
		.leftJoin(employee, eq(vacationRequest.employeeId, employee.id))
		.where(eq(vacationRequest.id, requestId))
		.limit(1);

	if (!rows[0]) {
		return null;
	}

	const dayRows = await db
		.select({
			requestId: vacationRequestDay.requestId,
			dateKey: vacationRequestDay.dateKey,
			countsAsVacationDay: vacationRequestDay.countsAsVacationDay,
			dayType: vacationRequestDay.dayType,
			serviceYearNumber: vacationRequestDay.serviceYearNumber,
		})
		.from(vacationRequestDay)
		.where(eq(vacationRequestDay.requestId, requestId))
		.orderBy(vacationRequestDay.dateKey);

	const days: VacationRequestDayRow[] = dayRows.map((day) => ({
		dateKey: day.dateKey,
		countsAsVacationDay: day.countsAsVacationDay,
		dayType: day.dayType,
		serviceYearNumber: day.serviceYearNumber ?? null,
	}));

	return {
		...rows[0],
		days,
		summary: {
			totalDays: days.length,
			vacationDays: days.filter((day) => day.countsAsVacationDay).length,
		},
	};
}

/**
 * Vacation routes for HR/admin management and self-service access.
 */
export const vacationRoutes = new Elysia({ prefix: '/vacations' })
	.use(combinedAuthPlugin)
	/**
	 * Returns vacation balance for the current employee (self-service).
	 */
	.get(
		'/me/balance',
		async ({
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			if (authType !== 'session' || !session) {
				set.status = 403;
				return buildErrorResponse('Session authentication required', 403);
			}

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});

			if (!organizationId) {
				set.status = 400;
				return buildErrorResponse('Organization is required or not permitted', 400);
			}

			const employeeRecord = await getEmployeeForSession(organizationId, session, set);
			if (!employeeRecord) {
				const status = typeof set.status === 'number' ? set.status : 404;
				return buildErrorResponse('Employee not found for this user', status);
			}

			if (!employeeRecord.hireDate) {
				set.status = 400;
				return buildErrorResponse(
					'Employee hire date is required for vacation balance',
					400,
				);
			}

			const settings = await db
				.select({ timeZone: payrollSetting.timeZone })
				.from(payrollSetting)
				.where(eq(payrollSetting.organizationId, organizationId))
				.limit(1);

			const timeZoneCandidate = settings[0]?.timeZone ?? 'America/Mexico_City';
			const timeZone = isValidIanaTimeZone(timeZoneCandidate)
				? timeZoneCandidate
				: 'America/Mexico_City';
			const balance = await buildEmployeeVacationBalance({
				employeeId: employeeRecord.id,
				organizationId,
				hireDate: employeeRecord.hireDate,
				timeZone,
			});

			return {
				data: balance,
			};
		},
	)
	/**
	 * Lists vacation requests for the current employee (self-service).
	 */
	.get(
		'/me/requests',
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			if (authType !== 'session' || !session) {
				set.status = 403;
				return buildErrorResponse('Session authentication required', 403);
			}

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});

			if (!organizationId) {
				set.status = 400;
				return buildErrorResponse('Organization is required or not permitted', 400);
			}

			const employeeRecord = await getEmployeeForSession(organizationId, session, set);
			if (!employeeRecord) {
				const status = typeof set.status === 'number' ? set.status : 404;
				return buildErrorResponse('Employee not found for this user', status);
			}

			const result = await fetchVacationRequests({
				organizationId,
				employeeId: employeeRecord.id,
				status: query.status,
				from: query.from,
				to: query.to,
				limit: query.limit,
				offset: query.offset,
			});

			return {
				data: result.data,
				pagination: {
					total: result.total,
					limit: query.limit,
					offset: query.offset,
					hasMore: query.offset + result.data.length < result.total,
				},
			};
		},
		{
			query: vacationRequestQuerySchema,
		},
	)
	/**
	 * Creates a vacation request for the current employee (self-service).
	 */
	.post(
		'/me/requests',
		async ({
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			if (authType !== 'session' || !session) {
				set.status = 403;
				return buildErrorResponse('Session authentication required', 403);
			}

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});

			if (!organizationId) {
				set.status = 400;
				return buildErrorResponse('Organization is required or not permitted', 400);
			}

			const employeeRecord = await getEmployeeForSession(organizationId, session, set);
			if (!employeeRecord) {
				const status = typeof set.status === 'number' ? set.status : 404;
				return buildErrorResponse('Employee not found for this user', status, {
					code: VACATION_ERROR_CODES.EMPLOYEE_NOT_FOUND,
				});
			}
			if (!employeeRecord.hireDate) {
				set.status = 400;
				return buildErrorResponse(
					'Employee hire date is required for vacation requests',
					400,
					{ code: VACATION_ERROR_CODES.HIRE_DATE_REQUIRED },
				);
			}

			const settings = await db
				.select({ additionalMandatoryRestDays: payrollSetting.additionalMandatoryRestDays })
				.from(payrollSetting)
				.where(eq(payrollSetting.organizationId, organizationId))
				.limit(1);

			let breakdown: Awaited<ReturnType<typeof buildVacationRequestDays>>;
			try {
				breakdown = await buildVacationRequestDays(
					employeeRecord,
					body.startDateKey,
					body.endDateKey,
					settings[0]?.additionalMandatoryRestDays ?? [],
				);
			} catch (error) {
				if (error instanceof RangeError) {
					set.status = 400;
					return buildErrorResponse(error.message, 400, {
						code: VACATION_ERROR_CODES.INVALID_RANGE,
					});
				}
				throw error;
			}

			const invalidServiceDays = breakdown.days.some(
				(day) =>
					day.countsAsVacationDay &&
					(!day.serviceYearNumber || day.serviceYearNumber <= 0),
			);
			if (invalidServiceDays) {
				set.status = 400;
				return buildErrorResponse(
					'Vacation days cannot be requested before completing a year of service',
					400,
					{ code: VACATION_ERROR_CODES.SERVICE_YEAR_INCOMPLETE },
				);
			}

			const balanceOk = await validateVacationBalance(
				{
					organizationId,
					employeeId: employeeRecord.id,
					requestedDaysByServiceYear: breakdown.vacationDaysByServiceYear,
					requestEndDateKey: body.endDateKey,
					hireDate: employeeRecord.hireDate,
				},
				set,
			);
			if (!balanceOk) {
				const status = typeof set.status === 'number' ? set.status : 409;
				return buildErrorResponse('Insufficient vacation balance', status, {
					code: VACATION_ERROR_CODES.INSUFFICIENT_BALANCE,
				});
			}

			const overlap = await db
				.select({ id: vacationRequest.id })
				.from(vacationRequest)
				.where(
					and(
						eq(vacationRequest.organizationId, organizationId),
						eq(vacationRequest.employeeId, employeeRecord.id),
						eq(vacationRequest.status, 'APPROVED'),
						lte(vacationRequest.startDateKey, body.endDateKey),
						gte(vacationRequest.endDateKey, body.startDateKey),
					)!,
				)
				.limit(1);

			if (overlap[0]) {
				set.status = 409;
				return buildErrorResponse('Vacation request overlaps an approved request', 409, {
					code: VACATION_ERROR_CODES.OVERLAP,
				});
			}

			const requestId = crypto.randomUUID();
			const notes = body.requestedNotes?.trim() ? body.requestedNotes.trim() : undefined;

			await db.transaction(async (tx) => {
				await tx.insert(vacationRequest).values({
					id: requestId,
					organizationId,
					employeeId: employeeRecord.id,
					requestedByUserId: session.userId,
					status: 'SUBMITTED',
					startDateKey: body.startDateKey,
					endDateKey: body.endDateKey,
					requestedNotes: notes,
				});

				if (breakdown.days.length > 0) {
					await tx.insert(vacationRequestDay).values(
						breakdown.days.map((day) => ({
							requestId,
							employeeId: employeeRecord.id,
							dateKey: day.dateKey,
							countsAsVacationDay: day.countsAsVacationDay,
							dayType: day.dayType,
							serviceYearNumber: day.serviceYearNumber ?? null,
						})),
					);
				}
			});

			const detail = await fetchVacationRequestDetail(requestId);
			return { data: detail };
		},
		{
			body: vacationRequestCreateSchema,
		},
	)
	/**
	 * Cancels a vacation request for the current employee (self-service).
	 */
	.post(
		'/me/requests/:id/cancel',
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
			if (authType !== 'session' || !session) {
				set.status = 403;
				return buildErrorResponse('Session authentication required', 403);
			}

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});

			if (!organizationId) {
				set.status = 400;
				return buildErrorResponse('Organization is required or not permitted', 400);
			}

			const employeeRecord = await getEmployeeForSession(organizationId, session, set);
			if (!employeeRecord) {
				const status = typeof set.status === 'number' ? set.status : 404;
				return buildErrorResponse('Employee not found for this user', status);
			}

			const requestRows = await db
				.select()
				.from(vacationRequest)
				.where(
					and(
						eq(vacationRequest.id, params.id),
						eq(vacationRequest.employeeId, employeeRecord.id),
					),
				)
				.limit(1);
			const request = requestRows[0];
			if (!request) {
				set.status = 404;
				return buildErrorResponse('Vacation request not found', 404);
			}

			if (request.status === 'CANCELLED' || request.status === 'REJECTED') {
				set.status = 400;
				return buildErrorResponse('Vacation request cannot be cancelled', 400);
			}

			await db.transaction(async (tx) => {
				if (request.status === 'APPROVED') {
					await tx
						.delete(scheduleException)
						.where(eq(scheduleException.vacationRequestId, request.id));
				}

				await tx
					.update(vacationRequest)
					.set({
						status: 'CANCELLED',
						decisionNotes: body.decisionNotes?.trim()
							? body.decisionNotes.trim()
							: undefined,
						cancelledByUserId: session.userId,
						cancelledAt: new Date(),
					})
					.where(eq(vacationRequest.id, request.id));
			});

			const detail = await fetchVacationRequestDetail(request.id);
			return { data: detail };
		},
		{
			params: idParamSchema,
			body: vacationRequestDecisionSchema,
		},
	)
	/**
	 * Lists vacation requests for HR/admin.
	 */
	.get(
		'/requests',
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: query.organizationId ?? null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const authorized = await ensureAdminRole({ authType, session, organizationId }, set);
			if (!authorized) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Not authorized', status);
			}

			const result = await fetchVacationRequests({
				organizationId,
				employeeId: query.employeeId,
				status: query.status,
				from: query.from,
				to: query.to,
				limit: query.limit,
				offset: query.offset,
			});

			return {
				data: result.data,
				pagination: {
					total: result.total,
					limit: query.limit,
					offset: query.offset,
					hasMore: query.offset + result.data.length < result.total,
				},
			};
		},
		{
			query: vacationRequestQuerySchema,
		},
	)
	/**
	 * Creates a vacation request for an employee (HR/admin).
	 */
	.post(
		'/requests',
		async ({
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const authorized = await ensureAdminRole({ authType, session, organizationId }, set);
			if (!authorized) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Not authorized', status);
			}

			if (!body.employeeId) {
				set.status = 400;
				return buildErrorResponse('employeeId is required', 400, {
					code: VACATION_ERROR_CODES.EMPLOYEE_REQUIRED,
				});
			}

			const employeeRows = await db
				.select()
				.from(employee)
				.where(
					and(
						eq(employee.id, body.employeeId),
						eq(employee.organizationId, organizationId),
					),
				)
				.limit(1);
			const employeeRecord = employeeRows[0];
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404, {
					code: VACATION_ERROR_CODES.EMPLOYEE_NOT_FOUND,
				});
			}

			const status = body.status ?? 'SUBMITTED';
			const hireDate = employeeRecord.hireDate ?? null;
			if (status !== 'DRAFT' && status !== 'SUBMITTED') {
				set.status = 400;
				return buildErrorResponse('Invalid status for vacation request', 400, {
					code: VACATION_ERROR_CODES.INVALID_STATUS,
				});
			}
			if (status === 'SUBMITTED' && !hireDate) {
				set.status = 400;
				return buildErrorResponse(
					'Employee hire date is required for vacation requests',
					400,
					{ code: VACATION_ERROR_CODES.HIRE_DATE_REQUIRED },
				);
			}

			const settings = await db
				.select({ additionalMandatoryRestDays: payrollSetting.additionalMandatoryRestDays })
				.from(payrollSetting)
				.where(eq(payrollSetting.organizationId, organizationId))
				.limit(1);

			let breakdown: Awaited<ReturnType<typeof buildVacationRequestDays>>;
			try {
				breakdown = await buildVacationRequestDays(
					employeeRecord,
					body.startDateKey,
					body.endDateKey,
					settings[0]?.additionalMandatoryRestDays ?? [],
				);
			} catch (error) {
				if (error instanceof RangeError) {
					set.status = 400;
					return buildErrorResponse(error.message, 400, {
						code: VACATION_ERROR_CODES.INVALID_RANGE,
					});
				}
				throw error;
			}

			const invalidServiceDays = breakdown.days.some(
				(day) =>
					day.countsAsVacationDay &&
					(!day.serviceYearNumber || day.serviceYearNumber <= 0),
			);
			if (status === 'SUBMITTED' && invalidServiceDays) {
				set.status = 400;
				return buildErrorResponse(
					'Vacation days cannot be requested before completing a year of service',
					400,
					{ code: VACATION_ERROR_CODES.SERVICE_YEAR_INCOMPLETE },
				);
			}

			if (status === 'SUBMITTED' && hireDate) {
				const balanceOk = await validateVacationBalance(
					{
						organizationId,
						employeeId: employeeRecord.id,
						requestedDaysByServiceYear: breakdown.vacationDaysByServiceYear,
						requestEndDateKey: body.endDateKey,
						hireDate,
					},
					set,
				);
				if (!balanceOk) {
					const statusCode = typeof set.status === 'number' ? set.status : 409;
					return buildErrorResponse('Insufficient vacation balance', statusCode, {
						code: VACATION_ERROR_CODES.INSUFFICIENT_BALANCE,
					});
				}

				const overlap = await db
					.select({ id: vacationRequest.id })
					.from(vacationRequest)
					.where(
						and(
							eq(vacationRequest.organizationId, organizationId),
							eq(vacationRequest.employeeId, employeeRecord.id),
							eq(vacationRequest.status, 'APPROVED'),
							lte(vacationRequest.startDateKey, body.endDateKey),
							gte(vacationRequest.endDateKey, body.startDateKey),
						)!,
					)
					.limit(1);

				if (overlap[0]) {
					set.status = 409;
					return buildErrorResponse(
						'Vacation request overlaps an approved request',
						409,
						{ code: VACATION_ERROR_CODES.OVERLAP },
					);
				}
			}

			const requestId = crypto.randomUUID();
			const notes = body.requestedNotes?.trim() ? body.requestedNotes.trim() : undefined;

			await db.transaction(async (tx) => {
				await tx.insert(vacationRequest).values({
					id: requestId,
					organizationId,
					employeeId: employeeRecord.id,
					requestedByUserId: session?.userId ?? null,
					status,
					startDateKey: body.startDateKey,
					endDateKey: body.endDateKey,
					requestedNotes: notes,
				});

				if (breakdown.days.length > 0) {
					await tx.insert(vacationRequestDay).values(
						breakdown.days.map((day) => ({
							requestId,
							employeeId: employeeRecord.id,
							dateKey: day.dateKey,
							countsAsVacationDay: day.countsAsVacationDay,
							dayType: day.dayType,
							serviceYearNumber: day.serviceYearNumber ?? null,
						})),
					);
				}
			});

			const detail = await fetchVacationRequestDetail(requestId);
			return { data: detail };
		},
		{
			body: vacationRequestCreateSchema,
		},
	)
	/**
	 * Approves a vacation request (HR/admin).
	 */
	.post(
		'/requests/:id/approve',
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
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const authorized = await ensureAdminRole({ authType, session, organizationId }, set);
			if (!authorized) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Not authorized', status);
			}

			const rows = await db
				.select()
				.from(vacationRequest)
				.where(
					and(
						eq(vacationRequest.id, params.id),
						eq(vacationRequest.organizationId, organizationId),
					),
				)
				.limit(1);
			const request = rows[0];
			if (!request) {
				set.status = 404;
				return buildErrorResponse('Vacation request not found', 404);
			}

			if (request.status === 'APPROVED') {
				set.status = 400;
				return buildErrorResponse('Vacation request is already approved', 400);
			}

			if (request.status === 'CANCELLED' || request.status === 'REJECTED') {
				set.status = 400;
				return buildErrorResponse('Vacation request cannot be approved', 400);
			}

			const settings = await db
				.select({ additionalMandatoryRestDays: payrollSetting.additionalMandatoryRestDays })
				.from(payrollSetting)
				.where(eq(payrollSetting.organizationId, organizationId))
				.limit(1);

			const employeeRows = await db
				.select()
				.from(employee)
				.where(
					and(
						eq(employee.id, request.employeeId),
						eq(employee.organizationId, organizationId),
					),
				)
				.limit(1);
			const employeeRecord = employeeRows[0] ?? null;
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			const breakdown = await buildVacationRequestDays(
				employeeRecord,
				request.startDateKey,
				request.endDateKey,
				settings[0]?.additionalMandatoryRestDays ?? [],
			);
			const requestedDaysByServiceYear = new Map<number, number>();
			const invalidServiceDays = breakdown.days.some(
				(day) =>
					day.countsAsVacationDay &&
					(!day.serviceYearNumber || day.serviceYearNumber <= 0),
			);
			if (invalidServiceDays) {
				set.status = 400;
				return buildErrorResponse(
					'Vacation days cannot be requested before completing a year of service',
					400,
				);
			}

			for (const day of breakdown.days) {
				if (!day.countsAsVacationDay) {
					continue;
				}
				const year = day.serviceYearNumber ?? 0;
				if (year > 0) {
					requestedDaysByServiceYear.set(
						year,
						(requestedDaysByServiceYear.get(year) ?? 0) + 1,
					);
				}
			}

			const hireDate = employeeRecord.hireDate ?? null;
			if (!hireDate) {
				set.status = 400;
				return buildErrorResponse(
					'Employee hire date is required for vacation requests',
					400,
				);
			}

			const balanceOk = await validateVacationBalance(
				{
					organizationId,
					employeeId: request.employeeId,
					requestedDaysByServiceYear,
					requestEndDateKey: request.endDateKey,
					hireDate,
					excludeRequestId: request.id,
				},
				set,
			);
			if (!balanceOk) {
				const statusCode = typeof set.status === 'number' ? set.status : 409;
				return buildErrorResponse('Insufficient vacation balance', statusCode);
			}

			const overlap = await db
				.select({ id: vacationRequest.id })
				.from(vacationRequest)
				.where(
					and(
						eq(vacationRequest.organizationId, organizationId),
						eq(vacationRequest.employeeId, request.employeeId),
						eq(vacationRequest.status, 'APPROVED'),
						ne(vacationRequest.id, request.id),
						lte(vacationRequest.startDateKey, request.endDateKey),
						gte(vacationRequest.endDateKey, request.startDateKey),
					)!,
				)
				.limit(1);

			if (overlap[0]) {
				set.status = 409;
				return buildErrorResponse('Vacation request overlaps an approved request', 409);
			}

			const exceptionDates = breakdown.days
				.filter((day) => day.countsAsVacationDay)
				.map((day) => new Date(`${day.dateKey}T00:00:00`));

			if (exceptionDates.length > 0) {
				const existingExceptions = await db
					.select({ exceptionDate: scheduleException.exceptionDate })
					.from(scheduleException)
					.where(
						and(
							eq(scheduleException.employeeId, request.employeeId),
							inArray(scheduleException.exceptionDate, exceptionDates),
						)!,
					);

				if (existingExceptions.length > 0) {
					set.status = 409;
					return buildErrorResponse(
						'Schedule exceptions already exist for the requested dates',
						409,
						{
								code: 'SCHEDULE_EXCEPTION_CONFLICT',
								details: {
									conflicts: existingExceptions.map((row) =>
										toDateKeyUtc(row.exceptionDate),
									),
								},
							},
						);
				}
			}

			await db.transaction(async (tx) => {
				await tx
					.delete(vacationRequestDay)
					.where(eq(vacationRequestDay.requestId, request.id));

				if (breakdown.days.length > 0) {
					await tx.insert(vacationRequestDay).values(
						breakdown.days.map((day) => ({
							requestId: request.id,
							employeeId: request.employeeId,
							dateKey: day.dateKey,
							countsAsVacationDay: day.countsAsVacationDay,
							dayType: day.dayType,
							serviceYearNumber: day.serviceYearNumber ?? null,
						})),
					);
				}

				if (exceptionDates.length > 0) {
					const exceptionType: (typeof scheduleException.$inferInsert)['exceptionType'] =
						'DAY_OFF';
					await tx.insert(scheduleException).values(
						exceptionDates.map((exceptionDate) => ({
							employeeId: request.employeeId,
							exceptionDate,
							exceptionType,
							reason: 'Vacaciones',
							vacationRequestId: request.id,
						})),
					);
				}

				await tx
					.update(vacationRequest)
					.set({
						status: 'APPROVED',
						decisionNotes: body.decisionNotes?.trim()
							? body.decisionNotes.trim()
							: undefined,
						approvedByUserId: session?.userId ?? null,
						approvedAt: new Date(),
					})
					.where(eq(vacationRequest.id, request.id));
			});

			const detail = await fetchVacationRequestDetail(request.id);
			return { data: detail };
		},
		{
			params: idParamSchema,
			body: vacationRequestDecisionSchema,
		},
	)
	/**
	 * Rejects a vacation request (HR/admin).
	 */
	.post(
		'/requests/:id/reject',
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
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const authorized = await ensureAdminRole({ authType, session, organizationId }, set);
			if (!authorized) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Not authorized', status);
			}

			const rows = await db
				.select()
				.from(vacationRequest)
				.where(
					and(
						eq(vacationRequest.id, params.id),
						eq(vacationRequest.organizationId, organizationId),
					),
				)
				.limit(1);
			const request = rows[0];
			if (!request) {
				set.status = 404;
				return buildErrorResponse('Vacation request not found', 404);
			}

			if (request.status !== 'SUBMITTED') {
				set.status = 400;
				return buildErrorResponse('Only submitted requests can be rejected', 400);
			}

			await db
				.update(vacationRequest)
				.set({
					status: 'REJECTED',
					decisionNotes: body.decisionNotes?.trim()
						? body.decisionNotes.trim()
						: undefined,
					rejectedByUserId: session?.userId ?? null,
					rejectedAt: new Date(),
				})
				.where(eq(vacationRequest.id, request.id));

			const detail = await fetchVacationRequestDetail(request.id);
			return { data: detail };
		},
		{
			params: idParamSchema,
			body: vacationRequestDecisionSchema,
		},
	)
	/**
	 * Cancels a vacation request (HR/admin).
	 */
	.post(
		'/requests/:id/cancel',
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
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const authorized = await ensureAdminRole({ authType, session, organizationId }, set);
			if (!authorized) {
				const status = typeof set.status === 'number' ? set.status : 403;
				return buildErrorResponse('Not authorized', status);
			}

			const rows = await db
				.select()
				.from(vacationRequest)
				.where(
					and(
						eq(vacationRequest.id, params.id),
						eq(vacationRequest.organizationId, organizationId),
					),
				)
				.limit(1);
			const request = rows[0];
			if (!request) {
				set.status = 404;
				return buildErrorResponse('Vacation request not found', 404);
			}

			if (request.status === 'CANCELLED' || request.status === 'REJECTED') {
				set.status = 400;
				return buildErrorResponse('Vacation request cannot be cancelled', 400);
			}

			await db.transaction(async (tx) => {
				if (request.status === 'APPROVED') {
					await tx
						.delete(scheduleException)
						.where(eq(scheduleException.vacationRequestId, request.id));
				}

				await tx
					.update(vacationRequest)
					.set({
						status: 'CANCELLED',
						decisionNotes: body.decisionNotes?.trim()
							? body.decisionNotes.trim()
							: undefined,
						cancelledByUserId: session?.userId ?? null,
						cancelledAt: new Date(),
					})
					.where(eq(vacationRequest.id, request.id));
			});

			const detail = await fetchVacationRequestDetail(request.id);
			return { data: detail };
		},
		{
			params: idParamSchema,
			body: vacationRequestDecisionSchema,
		},
	);
