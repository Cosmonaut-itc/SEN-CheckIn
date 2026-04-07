import { and, desc, eq, gte, ilike, isNull, lt, or, type SQL } from 'drizzle-orm';
import { inArray } from 'drizzle-orm/sql';
import { Elysia } from 'elysia';
import crypto from 'node:crypto';

import db from '../db/index.js';
import {
	attendanceRecord,
	employee,
	employeeAuditEvent,
	employeeDisciplinaryMeasure,
	employeeSchedule,
	employeeTerminationDraft,
	employeeTerminationSettlement,
	jobPosition,
	location,
	member,
	organization,
	payrollRun,
	payrollRunEmployee,
	payrollSetting,
	ptuHistory,
	scheduleException,
	scheduleTemplate,
	scheduleTemplateDay,
	user,
	vacationRequest,
	vacationRequestDay,
} from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { hasOrganizationAccess, resolveOrganizationId } from '../utils/organization.js';
import type { AuthSession } from '../plugins/auth.js';
import {
	createEmployeeSchema,
	employeeQuerySchema,
	idParamSchema,
	paginationSchema,
	updateEmployeeSchema,
} from '../schemas/crud.js';
import { ptuHistoryUpsertSchema } from '../schemas/extra-payments.js';
import {
	employeeTerminationSchema,
	type EmployeeTerminationInput,
} from '../schemas/termination.js';
import {
	employeeIdParamsSchema,
	imageBodySchema,
	type FaceEnrollmentResult,
	type UserCreationResult,
} from '../schemas/recognition.js';
import {
	buildEmployeeAuditSnapshot,
	createEmployeeAuditEvent,
	getEmployeeAuditChangedFields,
	resolveEmployeeAuditActor,
	setEmployeeAuditSkip,
} from '../services/employee-audit.js';
import { calculateEmployeeTerminationSettlement } from '../services/finiquito-calculation.js';
import {
	associateFaces,
	createUser,
	deleteFaces,
	deleteUser,
	disassociateFaces,
	indexFace,
	listFacesByExternalId,
} from '../services/rekognition.js';
import { buildEmployeeVacationBalance } from '../services/vacation-balance.js';
import { buildEmployeeDocumentProgressMap } from '../services/employee-documents.js';
import { addDaysToDateKey, toDateKeyUtc } from '../utils/date-key.js';
import { resolveMinimumWageRequirement, type MinimumWageZone } from '../utils/minimum-wage.js';
import {
	getUtcDateForZonedMidnight,
	isValidIanaTimeZone,
	toDateKeyInTimeZone,
} from '../utils/time-zone.js';
import type {
	EmployeeInsights,
	EmployeePayrollRunSummary,
	EmployeeScheduleExceptionSummary,
	EmployeeVacationRequestSummary,
} from '@sen-checkin/types';

/**
 * Employee routes for CRUD operations and face recognition enrollment.
 * Provides full CRUD operations plus Rekognition User Vectors enrollment flow.
 *
 * @module routes/employees
 */

/**
 * Decodes a base64 string to a Uint8Array for Rekognition API calls.
 *
 * @param base64String - The base64-encoded image string (without data URL prefix)
 * @returns Uint8Array containing the decoded image bytes
 */
function decodeBase64Image(base64String: string): Uint8Array {
	// Remove data URL prefix if present
	const cleanBase64 = base64String.replace(/^data:image\/\w+;base64,/, '');
	const binaryString = atob(cleanBase64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes;
}

/**
 * Validates daily pay against minimum wage requirements based on organization settings.
 *
 * @param args - Validation inputs
 * @param args.organizationId - Organization identifier
 * @param args.locationId - Location identifier (or null if not yet set)
 * @param args.dailyPay - Daily pay amount to validate
 * @param args.dateKey - Optional date key for minimum wage lookup (defaults to today)
 * @returns Validation result with error code (if BLOCK) or warnings (if WARN)
 */
export async function validateMinimumWage(args: {
	organizationId: string;
	locationId: string | null;
	dailyPay: number;
	dateKey?: string;
}): Promise<
	| { isValid: true; errorCode?: never; warnings?: never }
	| { isValid: false; errorCode: 'BELOW_MINIMUM_WAGE'; details: Record<string, unknown> }
	| {
			isValid: true;
			warnings: Array<{ code: 'BELOW_MINIMUM_WAGE'; details: Record<string, unknown> }>;
	  }
> {
	const { organizationId, locationId, dailyPay, dateKey = toDateKeyUtc(new Date()) } = args;

	// Fetch payroll settings to get overtimeEnforcement
	const payrollSettings = await db
		.select({ overtimeEnforcement: payrollSetting.overtimeEnforcement })
		.from(payrollSetting)
		.where(eq(payrollSetting.organizationId, organizationId))
		.limit(1);

	const overtimeEnforcement = payrollSettings[0]?.overtimeEnforcement ?? 'WARN';

	// Determine geographic zones from organization locations
	let zones: MinimumWageZone[] = ['GENERAL'];

	if (locationId) {
		// If location is provided, use its geographic zone
		const locationRecord = await db
			.select({ geographicZone: location.geographicZone })
			.from(location)
			.where(eq(location.id, locationId))
			.limit(1);

		if (locationRecord[0]?.geographicZone) {
			zones = [locationRecord[0].geographicZone as MinimumWageZone];
		}
	} else {
		// If no location yet, get all zones from organization's locations
		const organizationLocations = await db
			.select({ geographicZone: location.geographicZone })
			.from(location)
			.where(eq(location.organizationId, organizationId));

		if (organizationLocations.length > 0) {
			const uniqueZones = Array.from(
				new Set(organizationLocations.map((loc) => loc.geographicZone)),
			) as MinimumWageZone[];
			zones = uniqueZones.length > 0 ? uniqueZones : ['GENERAL'];
		}
	}

	// Calculate minimum required daily pay
	const requirement = resolveMinimumWageRequirement(zones, dateKey);

	if (dailyPay < requirement.minimumRequiredDailyPay) {
		const details = {
			dailyPay,
			minimumRequiredDailyPay: requirement.minimumRequiredDailyPay,
			zones: requirement.zones,
		};

		if (overtimeEnforcement === 'BLOCK') {
			return {
				isValid: false,
				errorCode: 'BELOW_MINIMUM_WAGE',
				details,
			};
		}

		// WARN mode: allow but return warning
		return {
			isValid: true,
			warnings: [
				{
					code: 'BELOW_MINIMUM_WAGE',
					details,
				},
			],
		};
	}

	return { isValid: true };
}

/**
 * Ensures the caller is an org admin/owner when linking a user to an employee.
 *
 * @param args - Authorization context and target organization
 * @param args.authType - Authentication type (session or apiKey)
 * @param args.session - Current session when authType is session
 * @param args.organizationId - Organization identifier
 * @param set - Elysia response setter for status codes
 * @returns True when the caller can link users, otherwise false
 */
async function ensureAdminRoleForLinking(
	args: { authType: 'session' | 'apiKey'; session: AuthSession | null; organizationId: string },
	set: { status?: number | string } & Record<string, unknown>,
): Promise<boolean> {
	const canManage = await hasOrganizationAdminRole(args);
	if (!canManage) {
		set.status = 403;
		return false;
	}

	return true;
}

/**
 * Checks whether the caller has admin privileges in the organization.
 *
 * @param args - Authorization context and organization
 * @param args.authType - Authentication type
 * @param args.session - Current auth session
 * @param args.organizationId - Organization identifier
 * @returns True when the caller is an admin or owner of the organization
 */
async function hasOrganizationAdminRole(args: {
	authType: 'session' | 'apiKey';
	session: AuthSession | null;
	organizationId: string;
}): Promise<boolean> {
	if (args.authType !== 'session' || !args.session) {
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
	return role === 'admin' || role === 'owner';
}

/**
 * Checks whether the caller can read fiscal compensation data for the organization.
 *
 * @param args - Authorization context and organization
 * @param args.authType - Authentication type
 * @param args.session - Current auth session
 * @param args.organizationId - Organization identifier
 * @returns True when the caller can read fiscal compensation fields
 */
async function canViewFiscalCompensation(args: {
	authType: 'session' | 'apiKey';
	session: AuthSession | null;
	organizationId: string;
}): Promise<boolean> {
	if (args.authType === 'apiKey') {
		return true;
	}

	return hasOrganizationAdminRole(args);
}

/**
 * Removes the fiscalDailyPay field from an employee-shaped payload.
 *
 * @param record - Employee payload that may include fiscalDailyPay
 * @returns The payload without fiscalDailyPay
 */
function omitFiscalDailyPay<T extends { fiscalDailyPay?: unknown }>(
	record: T,
): Omit<T, 'fiscalDailyPay'> {
	const { fiscalDailyPay, ...sanitizedRecord } = record;
	void fiscalDailyPay;
	return sanitizedRecord;
}

/**
 * Validates that a user belongs to the organization and is not linked to another employee.
 *
 * @param args - Target organization and user information
 * @param args.organizationId - Organization identifier
 * @param args.userId - User identifier to link
 * @param args.employeeId - Existing employee ID (for updates)
 * @param set - Elysia response setter for status codes
 * @returns True when the user can be linked, otherwise false
 */
async function validateEmployeeUserLink(
	args: { organizationId: string; userId: string; employeeId?: string },
	set: { status?: number | string } & Record<string, unknown>,
): Promise<boolean> {
	const membership = await db
		.select({ id: member.id })
		.from(member)
		.where(and(eq(member.userId, args.userId), eq(member.organizationId, args.organizationId)))
		.limit(1);

	if (!membership[0]) {
		set.status = 400;
		return false;
	}

	const existing = await db
		.select({ id: employee.id })
		.from(employee)
		.where(
			and(eq(employee.organizationId, args.organizationId), eq(employee.userId, args.userId)),
		)
		.limit(1);

	if (existing[0] && existing[0].id !== args.employeeId) {
		set.status = 409;
		return false;
	}

	return true;
}

type EmployeeInsightsRecord = Pick<
	typeof employee.$inferSelect,
	'id' | 'organizationId' | 'locationId' | 'hireDate' | 'scheduleTemplateId'
> & {
	timeZone: string | null;
};

type ScheduleDay = {
	dayOfWeek: number;
	isWorkingDay: boolean;
};

type ScheduleExceptionRow = {
	id: string;
	exceptionDate: Date;
	exceptionType: EmployeeScheduleExceptionSummary['exceptionType'];
	reason: string | null;
	startTime: string | null;
	endTime: string | null;
};

const INSIGHTS_PAST_DAYS = 90;
const INSIGHTS_KPI_30_DAYS = 30;
const INSIGHTS_KPI_90_DAYS = 90;
const INSIGHTS_FUTURE_DAYS = 90;
const INSIGHTS_VACATION_LIMIT = 10;
const INSIGHTS_PAYROLL_LIMIT = 6;
const INSIGHTS_STREAK_LOOKBACK_CHUNK_DAYS = 90;

/**
 * Builds a UTC range for a local date-key range (inclusive).
 *
 * @param startDateKey - Range start date key (YYYY-MM-DD)
 * @param endDateKey - Range end date key (YYYY-MM-DD)
 * @param timeZone - IANA timezone identifier
 * @returns Range start and end (exclusive) in UTC
 */
function buildUtcRangeFromDateKeys(
	startDateKey: string,
	endDateKey: string,
	timeZone: string,
): { startUtc: Date; endUtc: Date } {
	const startUtc = getUtcDateForZonedMidnight(startDateKey, timeZone);
	const endExclusiveKey = addDaysToDateKey(endDateKey, 1);
	const endUtc = getUtcDateForZonedMidnight(endExclusiveKey, timeZone);
	return { startUtc, endUtc };
}

/**
 * Loads base schedule days for an employee.
 *
 * @param args - Schedule lookup inputs
 * @param args.employeeId - Employee identifier
 * @param args.scheduleTemplateId - Optional schedule template ID
 * @returns Base schedule days
 */
async function loadEmployeeBaseScheduleDays(args: {
	employeeId: string;
	scheduleTemplateId: string | null;
}): Promise<ScheduleDay[]> {
	if (args.scheduleTemplateId) {
		const rows = await db
			.select({
				dayOfWeek: scheduleTemplateDay.dayOfWeek,
				isWorkingDay: scheduleTemplateDay.isWorkingDay,
			})
			.from(scheduleTemplateDay)
			.where(eq(scheduleTemplateDay.templateId, args.scheduleTemplateId));

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
		.where(eq(employeeSchedule.employeeId, args.employeeId));

	return rows.map((row) => ({
		dayOfWeek: row.dayOfWeek,
		isWorkingDay: row.isWorkingDay ?? true,
	}));
}

/**
 * Loads schedule exceptions for a date range.
 *
 * @param args - Exception filter inputs
 * @param args.employeeId - Employee identifier
 * @param args.startUtc - Range start (inclusive)
 * @param args.endUtc - Range end (exclusive)
 * @param args.exceptionType - Optional exception type filter
 * @returns Schedule exceptions for the range
 */
async function loadScheduleExceptionsForRange(args: {
	employeeId: string;
	startUtc: Date;
	endUtc: Date;
	exceptionType?: EmployeeScheduleExceptionSummary['exceptionType'];
}): Promise<ScheduleExceptionRow[]> {
	const conditions: [SQL<unknown>, ...SQL<unknown>[]] = [
		eq(scheduleException.employeeId, args.employeeId),
		gte(scheduleException.exceptionDate, args.startUtc),
		lt(scheduleException.exceptionDate, args.endUtc),
	];

	if (args.exceptionType) {
		conditions.push(eq(scheduleException.exceptionType, args.exceptionType));
	}

	return db
		.select({
			id: scheduleException.id,
			exceptionDate: scheduleException.exceptionDate,
			exceptionType: scheduleException.exceptionType,
			reason: scheduleException.reason,
			startTime: scheduleException.startTime,
			endTime: scheduleException.endTime,
		})
		.from(scheduleException)
		.where(and(...conditions)!)
		.orderBy(scheduleException.exceptionDate);
}

/**
 * Maps schedule exception rows to summary DTOs.
 *
 * @param rows - Schedule exception rows
 * @param timeZone - IANA timezone identifier
 * @returns Summary DTOs
 */
function buildScheduleExceptionSummaries(
	rows: ScheduleExceptionRow[],
	timeZone: string,
): EmployeeScheduleExceptionSummary[] {
	return rows.map((row) => ({
		id: row.id,
		dateKey: toDateKeyInTimeZone(row.exceptionDate, timeZone),
		exceptionType: row.exceptionType,
		reason: row.reason,
		startTime: row.startTime,
		endTime: row.endTime,
	}));
}

type AttendanceEvaluation = {
	absentDateKeys: string[];
	workingDateKeys: string[];
};

/**
 * Evaluates working and absent days for an employee in a date range.
 *
 * @param args - Evaluation inputs
 * @param args.employee - Employee record
 * @param args.timeZone - IANA timezone identifier
 * @param args.startDateKey - Range start date key
 * @param args.endDateKey - Range end date key
 * @returns Evaluated attendance date-key sets
 */
async function evaluateEmployeeAttendance(args: {
	employee: EmployeeInsightsRecord;
	timeZone: string;
	startDateKey: string;
	endDateKey: string;
}): Promise<AttendanceEvaluation> {
	const { startUtc, endUtc } = buildUtcRangeFromDateKeys(
		args.startDateKey,
		args.endDateKey,
		args.timeZone,
	);

	const [scheduleDays, exceptions, attendanceRows] = await Promise.all([
		loadEmployeeBaseScheduleDays({
			employeeId: args.employee.id,
			scheduleTemplateId: args.employee.scheduleTemplateId ?? null,
		}),
		loadScheduleExceptionsForRange({
			employeeId: args.employee.id,
			startUtc,
			endUtc,
		}),
		db
			.select({
				timestamp: attendanceRecord.timestamp,
				type: attendanceRecord.type,
				offsiteDateKey: attendanceRecord.offsiteDateKey,
			})
			.from(attendanceRecord)
			.where(
				and(
					eq(attendanceRecord.employeeId, args.employee.id),
					gte(attendanceRecord.timestamp, startUtc),
					lt(attendanceRecord.timestamp, endUtc),
				)!,
			),
	]);

	const scheduleMap = new Map<number, boolean>();
	for (const day of scheduleDays) {
		scheduleMap.set(day.dayOfWeek, day.isWorkingDay);
	}

	const exceptionMap = new Map<string, EmployeeScheduleExceptionSummary['exceptionType']>();
	for (const exception of exceptions) {
		const dateKey = toDateKeyInTimeZone(exception.exceptionDate, args.timeZone);
		exceptionMap.set(dateKey, exception.exceptionType);
	}

	const attendanceDateKeys = new Set(
		attendanceRows.map((row) =>
			row.type === 'WORK_OFFSITE' && row.offsiteDateKey
				? row.offsiteDateKey
				: toDateKeyInTimeZone(row.timestamp, args.timeZone),
		),
	);

	const hireDateKey = args.employee.hireDate
		? toDateKeyInTimeZone(args.employee.hireDate, args.timeZone)
		: null;

	const absentDateKeys: string[] = [];
	const workingDateKeys: string[] = [];

	let cursor = args.startDateKey;
	while (true) {
		if (!hireDateKey || cursor >= hireDateKey) {
			const exceptionType = exceptionMap.get(cursor);
			let isWorkingDay = false;

			if (exceptionType) {
				isWorkingDay = exceptionType !== 'DAY_OFF';
			} else {
				const dayOfWeek = new Date(`${cursor}T00:00:00Z`).getUTCDay();
				isWorkingDay = scheduleMap.get(dayOfWeek) ?? false;
			}

			if (isWorkingDay) {
				workingDateKeys.push(cursor);
				if (!attendanceDateKeys.has(cursor)) {
					absentDateKeys.push(cursor);
				}
			}
		}

		if (cursor === args.endDateKey) {
			break;
		}
		cursor = addDaysToDateKey(cursor, 1);
	}

	return { absentDateKeys, workingDateKeys };
}

/**
 * Groups date keys by month in reverse chronological order.
 *
 * @param dateKeys - Date keys in YYYY-MM-DD format
 * @returns Monthly grouped date-key summary
 */
function groupDateKeysByMonth(
	dateKeys: string[],
): NonNullable<EmployeeInsights['attendance']['absencesByMonth']> {
	const grouped = new Map<string, string[]>();

	for (const dateKey of [...dateKeys].sort((a, b) => b.localeCompare(a))) {
		const monthKey = dateKey.slice(0, 7);
		const monthDates = grouped.get(monthKey) ?? [];
		monthDates.push(dateKey);
		grouped.set(monthKey, monthDates);
	}

	return [...grouped.entries()]
		.sort(([monthA], [monthB]) => monthB.localeCompare(monthA))
		.map(([monthKey, monthDateKeys]) => ({
			monthKey,
			dateKeys: monthDateKeys,
			totalDays: monthDateKeys.length,
		}));
}

/**
 * Calculates attendance percentage for a working-day window.
 *
 * @param workingDays - Total working days in the window
 * @param absentDays - Total absent working days in the window
 * @returns Attendance percentage rounded to two decimals
 */
function calculateAttendanceRate(workingDays: number, absentDays: number): number {
	if (workingDays <= 0) {
		return 100;
	}

	const presentDays = Math.max(0, workingDays - absentDays);
	return Number(((presentDays / workingDays) * 100).toFixed(2));
}

/**
 * Calculates the current unjustified-absence streak inside a date range.
 *
 * The streak walks backwards from `endDateKey` and only counts working days.
 * Non-working days are skipped, and the streak stops at the first present
 * working day.
 *
 * @param args - Streak range and evaluated date-key sets
 * @param args.startDateKey - Inclusive range start date key
 * @param args.endDateKey - Inclusive range end date key
 * @param args.workingDateKeySet - Working-day date keys in the range
 * @param args.unjustifiedAbsentDateKeySet - Unjustified absent date keys in the range
 * @returns Current streak and whether it reached the range start without breaking
 */
function calculateCurrentAbsenceStreakInRange(args: {
	startDateKey: string;
	endDateKey: string;
	workingDateKeySet: Set<string>;
	unjustifiedAbsentDateKeySet: Set<string>;
}): { streakDays: number; reachedStartBoundary: boolean } {
	let streakDays = 0;
	let cursor = args.endDateKey;

	while (cursor >= args.startDateKey) {
		if (args.workingDateKeySet.has(cursor)) {
			if (args.unjustifiedAbsentDateKeySet.has(cursor)) {
				streakDays += 1;
			} else {
				return { streakDays, reachedStartBoundary: false };
			}
		}

		if (cursor === args.startDateKey) {
			return { streakDays, reachedStartBoundary: true };
		}

		cursor = addDaysToDateKey(cursor, -1);
	}

	return { streakDays, reachedStartBoundary: true };
}

/**
 * Calculates employee absences for a date-key range.
 *
 * @param args - Absence calculation inputs
 * @param args.employee - Employee record
 * @param args.timeZone - IANA timezone identifier
 * @param args.startDateKey - Range start date key
 * @param args.endDateKey - Range end date key
 * @returns Absence summary with evaluated date-key sets
 */
async function calculateEmployeeAbsences(args: {
	employee: EmployeeInsightsRecord;
	timeZone: string;
	startDateKey: string;
	endDateKey: string;
}): Promise<EmployeeInsights['attendance'] & AttendanceEvaluation> {
	const { absentDateKeys, workingDateKeys } = await evaluateEmployeeAttendance(args);

	return {
		absentDateKeys,
		totalAbsentDays: absentDateKeys.length,
		rangeStartDateKey: args.startDateKey,
		rangeEndDateKey: args.endDateKey,
		workingDateKeys,
	};
}

/**
 * Loads latest vacation request summaries for an employee.
 *
 * @param employeeId - Employee identifier
 * @param limit - Maximum number of requests
 * @returns Vacation request summaries
 */
async function loadVacationRequestSummaries(
	employeeId: string,
	limit: number,
): Promise<EmployeeVacationRequestSummary[]> {
	const requestRows = await db
		.select({
			id: vacationRequest.id,
			status: vacationRequest.status,
			startDateKey: vacationRequest.startDateKey,
			endDateKey: vacationRequest.endDateKey,
			requestedNotes: vacationRequest.requestedNotes,
			decisionNotes: vacationRequest.decisionNotes,
			createdAt: vacationRequest.createdAt,
		})
		.from(vacationRequest)
		.where(eq(vacationRequest.employeeId, employeeId))
		.orderBy(desc(vacationRequest.createdAt))
		.limit(limit);

	const requestIds = requestRows.map((row) => row.id);
	const dayRows =
		requestIds.length === 0
			? []
			: await db
					.select({
						requestId: vacationRequestDay.requestId,
						countsAsVacationDay: vacationRequestDay.countsAsVacationDay,
					})
					.from(vacationRequestDay)
					.where(inArray(vacationRequestDay.requestId, requestIds));

	const summaryByRequest = new Map<string, { totalDays: number; vacationDays: number }>();
	for (const day of dayRows) {
		const current = summaryByRequest.get(day.requestId) ?? { totalDays: 0, vacationDays: 0 };
		current.totalDays += 1;
		if (day.countsAsVacationDay) {
			current.vacationDays += 1;
		}
		summaryByRequest.set(day.requestId, current);
	}

	return requestRows.map((row) => {
		const summary = summaryByRequest.get(row.id) ?? { totalDays: 0, vacationDays: 0 };
		return {
			id: row.id,
			status: row.status,
			startDateKey: row.startDateKey,
			endDateKey: row.endDateKey,
			requestedNotes: row.requestedNotes ?? null,
			decisionNotes: row.decisionNotes ?? null,
			totalDays: summary.totalDays,
			vacationDays: summary.vacationDays,
			createdAt: row.createdAt,
		};
	});
}

/**
 * Loads latest payroll run summaries for an employee.
 *
 * @param employeeId - Employee identifier
 * @param limit - Maximum number of runs
 * @returns Payroll run summaries
 */
async function loadPayrollRunSummaries(
	employeeId: string,
	limit: number,
): Promise<EmployeePayrollRunSummary[]> {
	const rows = await db
		.select({
			payrollRunId: payrollRunEmployee.payrollRunId,
			totalPay: payrollRunEmployee.totalPay,
			periodStart: payrollRun.periodStart,
			periodEnd: payrollRun.periodEnd,
			paymentFrequency: payrollRun.paymentFrequency,
			status: payrollRun.status,
			createdAt: payrollRun.createdAt,
			processedAt: payrollRun.processedAt,
		})
		.from(payrollRunEmployee)
		.leftJoin(payrollRun, eq(payrollRunEmployee.payrollRunId, payrollRun.id))
		.where(eq(payrollRunEmployee.employeeId, employeeId))
		.orderBy(desc(payrollRun.periodEnd))
		.limit(limit);

	return rows
		.filter(
			(row) =>
				row.periodStart &&
				row.periodEnd &&
				row.paymentFrequency &&
				row.status &&
				row.createdAt,
		)
		.map((row) => ({
			payrollRunId: row.payrollRunId,
			periodStart: row.periodStart as Date,
			periodEnd: row.periodEnd as Date,
			paymentFrequency: row.paymentFrequency as EmployeePayrollRunSummary['paymentFrequency'],
			status: row.status as EmployeePayrollRunSummary['status'],
			totalPay: Number(row.totalPay ?? 0),
			createdAt: row.createdAt as Date,
			processedAt: (row.processedAt as Date | null) ?? null,
		}));
}

/**
 * Validates employee termination request and calculates settlement.
 * Shared logic between preview and confirm endpoints.
 *
 * @param args - Validation and calculation inputs
 * @param args.employeeId - Employee UUID
 * @param args.body - Termination request body
 * @param args.authType - Authentication type
 * @param args.session - User session
 * @param args.sessionOrganizationIds - Session organization IDs
 * @param args.apiKeyOrganizationIds - API key organization IDs
 * @returns Object containing employee record and calculated settlement, or error details
 */
async function validateAndCalculateTerminationSettlement({
	employeeId,
	body,
	authType,
	session,
	sessionOrganizationIds,
	apiKeyOrganizationIds,
}: {
	employeeId: string;
	body: EmployeeTerminationInput;
	authType: 'session' | 'apiKey';
	session: AuthSession | null;
	sessionOrganizationIds: string[];
	apiKeyOrganizationIds: string[];
}): Promise<
	| {
			success: true;
			employeeRecord: typeof employee.$inferSelect;
			calculation: ReturnType<typeof calculateEmployeeTerminationSettlement>;
	  }
	| {
			success: false;
			status: number;
			message: string;
			code?: string;
	  }
> {
	const employeeRows = await db
		.select()
		.from(employee)
		.where(eq(employee.id, employeeId))
		.limit(1);
	const employeeRecord = employeeRows[0];

	if (!employeeRecord) {
		return { success: false, status: 404, message: 'Employee not found' };
	}

	if (
		!hasOrganizationAccess(
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
			employeeRecord.organizationId,
		)
	) {
		return {
			success: false,
			status: 403,
			message: 'You do not have access to this employee',
		};
	}

	if (employeeRecord.status === 'INACTIVE' || employeeRecord.terminationDateKey) {
		return {
			success: false,
			status: 409,
			message: 'Employee already terminated',
			code: 'EMPLOYEE_ALREADY_TERMINATED',
		};
	}

	if (!employeeRecord.organizationId) {
		return {
			success: false,
			status: 400,
			message: 'Employee organization is required',
		};
	}

	if (!employeeRecord.hireDate) {
		return {
			success: false,
			status: 400,
			message: 'Employee hire date is required',
			code: 'MISSING_HIRE_DATE',
		};
	}

	const hireDateKey = toDateKeyUtc(employeeRecord.hireDate);
	if (body.terminationDateKey < hireDateKey) {
		return {
			success: false,
			status: 400,
			message: 'Termination date cannot be before hire date',
			code: 'INVALID_TERMINATION_DATE',
		};
	}

	const resolvedLastDayWorkedDateKey = body.lastDayWorkedDateKey ?? body.terminationDateKey;
	if (resolvedLastDayWorkedDateKey < hireDateKey) {
		return {
			success: false,
			status: 400,
			message: 'Last day worked cannot be before hire date',
			code: 'INVALID_LAST_DAY_WORKED_DATE',
		};
	}

	const locationRows = employeeRecord.locationId
		? await db
				.select({
					geographicZone: location.geographicZone,
					timeZone: location.timeZone,
				})
				.from(location)
				.where(eq(location.id, employeeRecord.locationId))
				.limit(1)
		: [];

	const locationRecord = locationRows[0];
	const timeZoneCandidate = locationRecord?.timeZone ?? 'America/Mexico_City';
	const timeZone = isValidIanaTimeZone(timeZoneCandidate)
		? timeZoneCandidate
		: 'America/Mexico_City';

	const settingsRows = await db
		.select({
			aguinaldoDays: payrollSetting.aguinaldoDays,
			vacationPremiumRate: payrollSetting.vacationPremiumRate,
		})
		.from(payrollSetting)
		.where(eq(payrollSetting.organizationId, employeeRecord.organizationId))
		.limit(1);
	const settingsRecord = settingsRows[0];

	const vacationBalance = await buildEmployeeVacationBalance({
		employeeId,
		organizationId: employeeRecord.organizationId,
		hireDate: employeeRecord.hireDate,
		timeZone,
		asOfDate: getUtcDateForZonedMidnight(body.terminationDateKey, timeZone),
	});

	const aguinaldoDaysPolicy = Number(
		employeeRecord.aguinaldoDaysOverride ??
			settingsRecord?.aguinaldoDays ??
			15,
	);

	const calculation = calculateEmployeeTerminationSettlement({
		employeeId,
		hireDate: employeeRecord.hireDate,
		dailyPay: Number(employeeRecord.dailyPay ?? 0),
		sbcDailyOverride:
			employeeRecord.sbcDailyOverride === null ||
			employeeRecord.sbcDailyOverride === undefined
				? null
				: Number(employeeRecord.sbcDailyOverride),
		terminationDateKey: body.terminationDateKey,
		lastDayWorkedDateKey: resolvedLastDayWorkedDateKey,
		terminationReason: body.terminationReason,
		contractType: body.contractType,
		unpaidDays: body.unpaidDays,
		otherDue: body.otherDue,
		vacationBalanceDays: body.vacationBalanceDays ?? null,
		vacationUsedDays: vacationBalance.usedDays,
		dailySalaryIndemnizacion: body.dailySalaryIndemnizacion ?? null,
		locationZone: (locationRecord?.geographicZone as MinimumWageZone | undefined) ?? 'GENERAL',
		aguinaldoDaysPolicy,
		vacationPremiumRatePolicy: Number(settingsRecord?.vacationPremiumRate ?? 0.25),
	});

	return { success: true, employeeRecord, calculation };
}

/**
 * Employee routes plugin for Elysia.
 * Provides CRUD operations and Rekognition face enrollment endpoints.
 */
export const employeeRoutes = new Elysia({ prefix: '/employees' })
	.use(combinedAuthPlugin)
	// =========================================================================
	// CRUD Operations
	// =========================================================================

	/**
	 * List all employees with pagination and optional filters.
	 *
	 * @route GET /employees
	 * @param query.limit - Maximum number of results (default: 50)
	 * @param query.offset - Number of results to skip (default: 0)
	 * @param query.locationId - Filter by location ID (optional)
	 * @param query.jobPositionId - Filter by job position ID (optional)
	 * @param query.status - Filter by employee status (optional)
	 * @param query.search - Search by name or code (optional)
	 * @returns Array of employee records with pagination info
	 */
	.get(
		'/',
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			set,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const {
				limit,
				offset,
				locationId,
				jobPositionId,
				status,
				search,
				organizationId: organizationIdQuery,
			} = query;

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: organizationIdQuery ?? null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}
			const canViewFiscalDailyPay = await canViewFiscalCompensation({
				authType,
				session,
				organizationId,
			});

			// Build conditions array
			const conditions: [SQL<unknown>, ...SQL<unknown>[]] = [
				eq(employee.organizationId, organizationId),
			];
			if (locationId) {
				conditions.push(eq(employee.locationId, locationId));
			}
			if (jobPositionId) {
				conditions.push(eq(employee.jobPositionId, jobPositionId));
			}
			if (status) {
				conditions.push(eq(employee.status, status));
			}
			if (search) {
				const searchClause = or(
					ilike(employee.firstName, `%${search}%`),
					ilike(employee.lastName, `%${search}%`),
					ilike(employee.code, `%${search}%`),
				)!;
				conditions.push(searchClause);
			}

			// Select employee fields and join job position to get the name
			let baseQuery = db
				.select({
					id: employee.id,
					code: employee.code,
					firstName: employee.firstName,
					lastName: employee.lastName,
					nss: employee.nss,
					rfc: employee.rfc,
					email: employee.email,
					phone: employee.phone,
					jobPositionId: employee.jobPositionId,
					jobPositionName: jobPosition.name,
					department: employee.department,
					status: employee.status,
					shiftType: employee.shiftType,
					hireDate: employee.hireDate,
					dailyPay: employee.dailyPay,
					fiscalDailyPay: employee.fiscalDailyPay,
					paymentFrequency: employee.paymentFrequency,
					employmentType: employee.employmentType,
					isTrustEmployee: employee.isTrustEmployee,
					isDirectorAdminGeneralManager: employee.isDirectorAdminGeneralManager,
					isDomesticWorker: employee.isDomesticWorker,
					isPlatformWorker: employee.isPlatformWorker,
					platformHoursYear: employee.platformHoursYear,
					ptuEligibilityOverride: employee.ptuEligibilityOverride,
					aguinaldoDaysOverride: employee.aguinaldoDaysOverride,
					sbcDailyOverride: employee.sbcDailyOverride,
					locationId: employee.locationId,
					organizationId: employee.organizationId,
					userId: employee.userId,
					rekognitionUserId: employee.rekognitionUserId,
					scheduleTemplateId: employee.scheduleTemplateId,
					scheduleTemplateName: scheduleTemplate.name,
					scheduleTemplateShiftType: scheduleTemplate.shiftType,
					lastPayrollDate: employee.lastPayrollDate,
					createdAt: employee.createdAt,
					updatedAt: employee.updatedAt,
				})
				.from(employee)
				.leftJoin(jobPosition, eq(employee.jobPositionId, jobPosition.id))
				.leftJoin(scheduleTemplate, eq(employee.scheduleTemplateId, scheduleTemplate.id));

			const whereClause = and(...conditions)!;
			baseQuery = baseQuery.where(whereClause) as typeof baseQuery;

			const results = await baseQuery
				.limit(limit)
				.offset(offset)
				.orderBy(employee.lastName, employee.firstName);

			const progressByEmployee = await buildEmployeeDocumentProgressMap(
				db,
				organizationId,
				results.map((row) => row.id),
			);
			const employeeIds = results.map((row) => row.id);
			const disciplinaryCountByEmployee = new Map<
				string,
				{ total: number; open: number }
			>();
			if (employeeIds.length > 0) {
				const disciplinaryRows = await db
					.select({
						employeeId: employeeDisciplinaryMeasure.employeeId,
						status: employeeDisciplinaryMeasure.status,
					})
					.from(employeeDisciplinaryMeasure)
					.where(
						and(
							eq(employeeDisciplinaryMeasure.organizationId, organizationId),
							inArray(employeeDisciplinaryMeasure.employeeId, employeeIds),
						),
					);

				for (const row of disciplinaryRows) {
					const current = disciplinaryCountByEmployee.get(row.employeeId) ?? {
						total: 0,
						open: 0,
					};
					current.total += 1;
					if (row.status !== 'CLOSED') {
						current.open += 1;
					}
					disciplinaryCountByEmployee.set(row.employeeId, current);
				}
			}

			const enrichedResults = results.map((row) => {
				const progress = progressByEmployee.get(row.id);
				const disciplinaryCounts = disciplinaryCountByEmployee.get(row.id);
				const enrichedRow = {
					...row,
					documentProgressPercent: progress?.documentProgressPercent ?? 0,
					documentMissingCount: progress?.documentMissingCount ?? 0,
					documentWorkflowStatus: progress?.documentWorkflowStatus ?? 'INCOMPLETE',
					disciplinaryMeasuresCount: disciplinaryCounts?.total ?? 0,
					disciplinaryOpenMeasuresCount: disciplinaryCounts?.open ?? 0,
				};
				if (canViewFiscalDailyPay) {
					return enrichedRow;
				}
				return omitFiscalDailyPay(enrichedRow);
			});

			// Get total count with same filters
			let countQuery = db.select().from(employee);
			const countWhere = and(...conditions)!;
			countQuery = countQuery.where(countWhere) as typeof countQuery;
			const countResult = await countQuery;
			const total = countResult.length;

			return {
				data: enrichedResults,
				pagination: {
					total,
					limit,
					offset,
					hasMore: offset + results.length < total,
				},
			};
		},
		{
			query: employeeQuerySchema,
		},
	)

	/**
	 * Get a single employee by ID.
	 *
	 * @route GET /employees/:id
	 * @param id - Employee UUID
	 * @returns Employee record or 404 error
	 */
	.get(
		'/:id',
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			const results = await db
				.select({
					id: employee.id,
					code: employee.code,
					firstName: employee.firstName,
					lastName: employee.lastName,
					nss: employee.nss,
					rfc: employee.rfc,
					email: employee.email,
					phone: employee.phone,
					jobPositionId: employee.jobPositionId,
					jobPositionName: jobPosition.name,
					department: employee.department,
					status: employee.status,
					shiftType: employee.shiftType,
					hireDate: employee.hireDate,
					dailyPay: employee.dailyPay,
					fiscalDailyPay: employee.fiscalDailyPay,
					paymentFrequency: employee.paymentFrequency,
					employmentType: employee.employmentType,
					isTrustEmployee: employee.isTrustEmployee,
					isDirectorAdminGeneralManager: employee.isDirectorAdminGeneralManager,
					isDomesticWorker: employee.isDomesticWorker,
					isPlatformWorker: employee.isPlatformWorker,
					platformHoursYear: employee.platformHoursYear,
					ptuEligibilityOverride: employee.ptuEligibilityOverride,
					aguinaldoDaysOverride: employee.aguinaldoDaysOverride,
					sbcDailyOverride: employee.sbcDailyOverride,
					locationId: employee.locationId,
					organizationId: employee.organizationId,
					userId: employee.userId,
					rekognitionUserId: employee.rekognitionUserId,
					scheduleTemplateId: employee.scheduleTemplateId,
					scheduleTemplateName: scheduleTemplate.name,
					scheduleTemplateShiftType: scheduleTemplate.shiftType,
					lastPayrollDate: employee.lastPayrollDate,
					createdAt: employee.createdAt,
					updatedAt: employee.updatedAt,
				})
				.from(employee)
				.leftJoin(jobPosition, eq(employee.jobPositionId, jobPosition.id))
				.leftJoin(scheduleTemplate, eq(employee.scheduleTemplateId, scheduleTemplate.id))
				.where(eq(employee.id, id))
				.limit(1);

			const record = results[0];
			if (!record) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					record.organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this employee', 403);
			}
			const canViewFiscalDailyPay = record.organizationId
				? await canViewFiscalCompensation({
						authType,
						session,
						organizationId: record.organizationId,
					})
				: false;

			const schedule = await db
				.select()
				.from(employeeSchedule)
				.where(eq(employeeSchedule.employeeId, id))
				.orderBy(employeeSchedule.dayOfWeek, employeeSchedule.startTime);

			if (canViewFiscalDailyPay) {
				return { data: { ...record, schedule } };
			}

			return { data: { ...omitFiscalDailyPay(record), schedule } };
		},
		{
			params: idParamSchema,
		},
	)

	/**
	 * Returns consolidated insights for the employee detail dialog.
	 *
	 * @route GET /employees/:id/insights
	 * @param id - Employee UUID
	 * @returns Employee insights payload
	 */
	.get(
		'/:id/insights',
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			const rows = await db
				.select({
					id: employee.id,
					organizationId: employee.organizationId,
					locationId: employee.locationId,
					hireDate: employee.hireDate,
					scheduleTemplateId: employee.scheduleTemplateId,
					timeZone: location.timeZone,
				})
				.from(employee)
				.leftJoin(location, eq(employee.locationId, location.id))
				.where(eq(employee.id, id))
				.limit(1);

			const employeeRecord = rows[0];
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					employeeRecord.organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this employee', 403);
			}

			if (!employeeRecord.organizationId) {
				set.status = 403;
				return buildErrorResponse('Organization is required or not permitted', 403);
			}

			const timeZoneCandidate = employeeRecord.timeZone ?? 'America/Mexico_City';
			const timeZone = isValidIanaTimeZone(timeZoneCandidate)
				? timeZoneCandidate
				: 'America/Mexico_City';
			const asOfDateKey = toDateKeyInTimeZone(new Date(), timeZone);
			const requiredPastDays = Math.max(INSIGHTS_PAST_DAYS, INSIGHTS_KPI_90_DAYS);

			const pastStartDateKey = addDaysToDateKey(asOfDateKey, -(requiredPastDays - 1));
			const pastEndDateKey = asOfDateKey;
			const futureStartDateKey = asOfDateKey;
			const futureEndDateKey = addDaysToDateKey(asOfDateKey, INSIGHTS_FUTURE_DAYS - 1);

			const pastRange = buildUtcRangeFromDateKeys(pastStartDateKey, pastEndDateKey, timeZone);
			const futureRange = buildUtcRangeFromDateKeys(
				futureStartDateKey,
				futureEndDateKey,
				timeZone,
			);

			const [attendanceSummary, leaveRows, exceptionRows, vacationRequests, payrollRuns] =
				await Promise.all([
					calculateEmployeeAbsences({
						employee: employeeRecord,
						timeZone,
						startDateKey: pastStartDateKey,
						endDateKey: pastEndDateKey,
					}),
					loadScheduleExceptionsForRange({
						employeeId: id,
						startUtc: pastRange.startUtc,
						endUtc: pastRange.endUtc,
						exceptionType: 'DAY_OFF',
					}),
					loadScheduleExceptionsForRange({
						employeeId: id,
						startUtc: futureRange.startUtc,
						endUtc: futureRange.endUtc,
					}),
					loadVacationRequestSummaries(id, INSIGHTS_VACATION_LIMIT),
					loadPayrollRunSummaries(id, INSIGHTS_PAYROLL_LIMIT),
				]);

			const leaves = buildScheduleExceptionSummaries(leaveRows, timeZone);
			const exceptions = buildScheduleExceptionSummaries(exceptionRows, timeZone);
			const last30StartDateKey = addDaysToDateKey(asOfDateKey, -(INSIGHTS_KPI_30_DAYS - 1));
			const last90StartDateKey = addDaysToDateKey(asOfDateKey, -(INSIGHTS_KPI_90_DAYS - 1));
			const leaveDateKeys = leaves.map((item) => item.dateKey);
			const leaveDateKeySet = new Set(leaveDateKeys);
			const unjustifiedAbsentDateKeys = attendanceSummary.absentDateKeys.filter(
				(dateKey) => !leaveDateKeySet.has(dateKey),
			);

			const unjustifiedAbsentDateKeySet = new Set(unjustifiedAbsentDateKeys);
			const workingDateKeySet = new Set(attendanceSummary.workingDateKeys);

			let unjustifiedAbsences30d = 0;
			let unjustifiedAbsences90d = 0;
			for (const dateKey of unjustifiedAbsentDateKeys) {
				if (dateKey >= last90StartDateKey) {
					unjustifiedAbsences90d += 1;
					if (dateKey >= last30StartDateKey) {
						unjustifiedAbsences30d += 1;
					}
				}
			}

			let justifiedLeaves30d = 0;
			let justifiedLeaves90d = 0;
			for (const dateKey of leaveDateKeys) {
				if (dateKey >= last90StartDateKey) {
					justifiedLeaves90d += 1;
					if (dateKey >= last30StartDateKey) {
						justifiedLeaves30d += 1;
					}
				}
			}

			let workingDays30d = 0;
			let workingDays90d = 0;
			for (const dateKey of attendanceSummary.workingDateKeys) {
				if (dateKey >= last90StartDateKey) {
					workingDays90d += 1;
					if (dateKey >= last30StartDateKey) {
						workingDays30d += 1;
					}
				}
			}

			const initialStreak = calculateCurrentAbsenceStreakInRange({
				startDateKey: pastStartDateKey,
				endDateKey: asOfDateKey,
				workingDateKeySet,
				unjustifiedAbsentDateKeySet,
			});
			let absenceStreakCurrentDays = initialStreak.streakDays;
			const hireDateKey = employeeRecord.hireDate
				? toDateKeyInTimeZone(employeeRecord.hireDate, timeZone)
				: null;

			// Only fetch additional history when the streak reaches the 90-day window boundary.
			if (
				initialStreak.reachedStartBoundary &&
				absenceStreakCurrentDays > 0 &&
				hireDateKey &&
				pastStartDateKey > hireDateKey
			) {
				const resolvedHireDateKey: string = hireDateKey;
				let chunkEndDateKey = addDaysToDateKey(pastStartDateKey, -1);
				let shouldContinueLookback = true;

				while (shouldContinueLookback && chunkEndDateKey >= resolvedHireDateKey) {
					const chunkStartCandidate = addDaysToDateKey(
						chunkEndDateKey,
						-(INSIGHTS_STREAK_LOOKBACK_CHUNK_DAYS - 1),
					);
					const chunkStartDateKey: string =
						chunkStartCandidate < resolvedHireDateKey
							? resolvedHireDateKey
							: chunkStartCandidate;
					const chunkRange = buildUtcRangeFromDateKeys(
						chunkStartDateKey,
						chunkEndDateKey,
						timeZone,
					);
					const [chunkAttendanceSummary, chunkLeaveRows] = await Promise.all([
						calculateEmployeeAbsences({
							employee: employeeRecord,
							timeZone,
							startDateKey: chunkStartDateKey,
							endDateKey: chunkEndDateKey,
						}),
						loadScheduleExceptionsForRange({
							employeeId: id,
							startUtc: chunkRange.startUtc,
							endUtc: chunkRange.endUtc,
							exceptionType: 'DAY_OFF',
						}),
					]);
					const chunkLeaveDateKeySet = new Set(
						chunkLeaveRows.map((item) => toDateKeyInTimeZone(item.exceptionDate, timeZone)),
					);
					const chunkUnjustifiedAbsentDateKeySet = new Set(
						chunkAttendanceSummary.absentDateKeys.filter(
							(dateKey) => !chunkLeaveDateKeySet.has(dateKey),
						),
					);
					const chunkStreak = calculateCurrentAbsenceStreakInRange({
						startDateKey: chunkStartDateKey,
						endDateKey: chunkEndDateKey,
						workingDateKeySet: new Set(chunkAttendanceSummary.workingDateKeys),
						unjustifiedAbsentDateKeySet: chunkUnjustifiedAbsentDateKeySet,
					});

					absenceStreakCurrentDays += chunkStreak.streakDays;
					if (
						!chunkStreak.reachedStartBoundary ||
						chunkStartDateKey === resolvedHireDateKey
					) {
						shouldContinueLookback = false;
					} else {
						chunkEndDateKey = addDaysToDateKey(chunkStartDateKey, -1);
					}
				}
			}

			const trend30d = [] as NonNullable<EmployeeInsights['attendance']['trend30d']>;
			let trendCursor = last30StartDateKey;
			while (trendCursor <= asOfDateKey) {
				if (leaveDateKeySet.has(trendCursor)) {
					trend30d.push({ dateKey: trendCursor, status: 'LEAVE' });
				} else if (workingDateKeySet.has(trendCursor)) {
					trend30d.push({
						dateKey: trendCursor,
						status: unjustifiedAbsentDateKeySet.has(trendCursor) ? 'ABSENT' : 'PRESENT',
					});
				} else {
					trend30d.push({ dateKey: trendCursor, status: 'DAY_OFF' });
				}
				if (trendCursor === asOfDateKey) {
					break;
				}
				trendCursor = addDaysToDateKey(trendCursor, 1);
			}

			const attendanceSummaryBase = {
				absentDateKeys: unjustifiedAbsentDateKeys,
				totalAbsentDays: unjustifiedAbsentDateKeys.length,
				rangeStartDateKey: attendanceSummary.rangeStartDateKey,
				rangeEndDateKey: attendanceSummary.rangeEndDateKey,
			};

			const vacationBalance = employeeRecord.hireDate
				? await buildEmployeeVacationBalance({
						employeeId: id,
						organizationId: employeeRecord.organizationId,
						hireDate: employeeRecord.hireDate,
						timeZone,
					})
				: null;

			const payload: EmployeeInsights = {
				employeeId: id,
				organizationId: employeeRecord.organizationId,
				timeZone,
				asOfDateKey,
				vacation: {
					balance: vacationBalance,
					requests: vacationRequests,
				},
				attendance: {
					...attendanceSummaryBase,
					kpis: {
						absenceStreakCurrentDays,
						unjustifiedAbsences30d,
						unjustifiedAbsences90d,
						justifiedLeaves30d,
						justifiedLeaves90d,
						attendanceRate30d: calculateAttendanceRate(
							workingDays30d,
							unjustifiedAbsences30d,
						),
						attendanceRate90d: calculateAttendanceRate(
							workingDays90d,
							unjustifiedAbsences90d,
						),
						lateArrivals30d: null,
						onTimeRate30d: null,
					},
					trend30d,
					absencesByMonth: groupDateKeysByMonth(attendanceSummaryBase.absentDateKeys),
					leavesByMonth: groupDateKeysByMonth(leaveDateKeys),
				},
				leaves: {
					items: leaves,
					total: leaves.length,
					rangeStartDateKey: pastStartDateKey,
					rangeEndDateKey: pastEndDateKey,
				},
				exceptions: {
					items: exceptions,
					total: exceptions.length,
					rangeStartDateKey: futureStartDateKey,
					rangeEndDateKey: futureEndDateKey,
				},
				payroll: {
					runs: payrollRuns,
					total: payrollRuns.length,
				},
			};

			return { data: payload };
		},
		{
			params: idParamSchema,
		},
	)
	/**
	 * Previews termination settlement for an employee (no persistence).
	 *
	 * @route POST /employees/:id/termination/preview
	 * @param id - Employee UUID
	 * @returns Termination settlement preview payload
	 */
	.post(
		'/:id/termination/preview',
		async ({
			params,
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			const result = await validateAndCalculateTerminationSettlement({
				employeeId: id,
				body,
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationIds,
			});

			if (!result.success) {
				set.status = result.status;
				return buildErrorResponse(result.message, result.status, {
					code: result.code,
				});
			}

			return { data: result.calculation };
		},
		{
			params: idParamSchema,
			body: employeeTerminationSchema,
		},
	)

	/**
	 * Confirms employee termination and persists settlement snapshot.
	 *
	 * @route POST /employees/:id/termination
	 * @param id - Employee UUID
	 * @returns Persisted settlement and employee summary
	 */
	.post(
		'/:id/termination',
		async ({
			params,
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			const validationResult = await validateAndCalculateTerminationSettlement({
				employeeId: id,
				body,
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationIds,
			});

			if (!validationResult.success) {
				set.status = validationResult.status;
				return buildErrorResponse(validationResult.message, validationResult.status, {
					code: validationResult.code,
				});
			}

				const { employeeRecord, calculation } = validationResult;
				if (!employeeRecord.organizationId) {
					set.status = 400;
					return buildErrorResponse('Employee organization is required', 400);
				}
				const employeeOrganizationId = employeeRecord.organizationId;
				const resolvedLastDayWorkedDateKey =
					body.lastDayWorkedDateKey ?? body.terminationDateKey;

			const auditActor = resolveEmployeeAuditActor(authType, session);
			const beforeSnapshot = buildEmployeeAuditSnapshot(employeeRecord);

			let result;
			try {
				result = await db.transaction(async (tx) => {
					await setEmployeeAuditSkip(tx);

					// Update only if still active to prevent duplicate terminations.
					const updatedRows = await tx
						.update(employee)
						.set({
							status: 'INACTIVE',
							terminationDateKey: body.terminationDateKey,
							lastDayWorkedDateKey: resolvedLastDayWorkedDateKey,
							terminationReason: body.terminationReason,
							contractType: body.contractType,
							terminationNotes: body.terminationNotes?.trim() || null,
						})
						.where(
							and(
								eq(employee.id, id),
								eq(employee.status, 'ACTIVE'),
								isNull(employee.terminationDateKey),
							),
						)
						.returning({ id: employee.id });

					if (updatedRows.length === 0) {
						throw new Error('EMPLOYEE_ALREADY_TERMINATED');
					}

					const settlementRows = await tx
						.insert(employeeTerminationSettlement)
						.values({
							employeeId: id,
							organizationId: employeeOrganizationId,
							calculation,
							totalsGross: calculation.totals.grossTotal.toFixed(2),
							finiquitoTotalGross: calculation.totals.finiquitoTotalGross.toFixed(2),
							liquidacionTotalGross:
								calculation.totals.liquidacionTotalGross.toFixed(2),
						})
						.returning({
							id: employeeTerminationSettlement.id,
							employeeId: employeeTerminationSettlement.employeeId,
							organizationId: employeeTerminationSettlement.organizationId,
							calculation: employeeTerminationSettlement.calculation,
							totalsGross: employeeTerminationSettlement.totalsGross,
							finiquitoTotalGross: employeeTerminationSettlement.finiquitoTotalGross,
							liquidacionTotalGross:
								employeeTerminationSettlement.liquidacionTotalGross,
							createdAt: employeeTerminationSettlement.createdAt,
						});

					await tx
						.update(employeeTerminationDraft)
						.set({
							status: 'CONSUMED',
							consumedAt: new Date(),
							updatedByUserId: auditActor.actorUserId ?? null,
						})
						.where(
							and(
								eq(employeeTerminationDraft.employeeId, id),
								eq(
									employeeTerminationDraft.organizationId,
									employeeOrganizationId,
								),
								eq(employeeTerminationDraft.status, 'ACTIVE'),
							),
						);

					const updatedRecord =
						(await tx.select().from(employee).where(eq(employee.id, id)).limit(1))[0] ??
						null;

					if (updatedRecord) {
						const afterSnapshot = buildEmployeeAuditSnapshot(updatedRecord);
						const changedFields = getEmployeeAuditChangedFields(
							beforeSnapshot,
							afterSnapshot,
						);

						await createEmployeeAuditEvent(tx, {
							employeeId: id,
							organizationId: updatedRecord.organizationId,
							action: 'terminated',
							actorType: auditActor.actorType,
							actorUserId: auditActor.actorUserId,
							before: beforeSnapshot,
							after: afterSnapshot,
							changedFields,
						});
					}

					return {
						settlement: settlementRows[0] ?? null,
						employee: updatedRecord,
					};
				});
			} catch (error) {
				if (error instanceof Error && error.message === 'EMPLOYEE_ALREADY_TERMINATED') {
					set.status = 409;
					return buildErrorResponse('Employee already terminated', 409, {
						code: 'EMPLOYEE_ALREADY_TERMINATED',
					});
				}
				throw error;
			}

			if (!result.settlement || !result.employee) {
				set.status = 500;
				return buildErrorResponse('Employee termination failed', 500);
			}

			return {
				data: {
					settlement: result.settlement,
					employee: {
						id: result.employee.id,
						status: result.employee.status,
						terminationDateKey: result.employee.terminationDateKey,
						lastDayWorkedDateKey: result.employee.lastDayWorkedDateKey,
						terminationReason: result.employee.terminationReason,
						contractType: result.employee.contractType,
						terminationNotes: result.employee.terminationNotes,
					},
				},
			};
		},
		{
			params: idParamSchema,
			body: employeeTerminationSchema,
		},
	)
	/**
	 * Fetches the active termination draft for an employee.
	 *
	 * @route GET /employees/:id/termination/draft
	 * @param id - Employee UUID
	 * @returns Active termination draft payload or null
	 */
	.get(
		'/:id/termination/draft',
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			const employeeRows = await db
				.select({ organizationId: employee.organizationId })
				.from(employee)
				.where(eq(employee.id, id))
				.limit(1);
			const employeeRecord = employeeRows[0];
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					employeeRecord.organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this employee', 403);
			}
			if (!employeeRecord.organizationId) {
				set.status = 400;
				return buildErrorResponse('Employee organization is required', 400);
			}

			const draftRows = await db
				.select()
				.from(employeeTerminationDraft)
				.where(
					and(
						eq(employeeTerminationDraft.employeeId, id),
						eq(employeeTerminationDraft.organizationId, employeeRecord.organizationId),
						eq(employeeTerminationDraft.status, 'ACTIVE'),
					),
				)
				.orderBy(desc(employeeTerminationDraft.createdAt))
				.limit(1);

			return { data: draftRows[0] ?? null };
		},
		{
			params: idParamSchema,
		},
	)
	/**
	 * Fetches the latest termination settlement for an employee.
	 *
	 * @route GET /employees/:id/termination/settlement
	 * @param id - Employee UUID
	 * @returns Latest termination settlement record
	 */
	.get(
		'/:id/termination/settlement',
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			const employeeRows = await db
				.select({ organizationId: employee.organizationId })
				.from(employee)
				.where(eq(employee.id, id))
				.limit(1);
			const employeeRecord = employeeRows[0];
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					employeeRecord.organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this employee', 403);
			}

			const settlementRows = await db
				.select({
					id: employeeTerminationSettlement.id,
					employeeId: employeeTerminationSettlement.employeeId,
					organizationId: employeeTerminationSettlement.organizationId,
					calculation: employeeTerminationSettlement.calculation,
					totalsGross: employeeTerminationSettlement.totalsGross,
					finiquitoTotalGross: employeeTerminationSettlement.finiquitoTotalGross,
					liquidacionTotalGross: employeeTerminationSettlement.liquidacionTotalGross,
					createdAt: employeeTerminationSettlement.createdAt,
				})
				.from(employeeTerminationSettlement)
				.where(eq(employeeTerminationSettlement.employeeId, id))
				.orderBy(desc(employeeTerminationSettlement.createdAt))
				.limit(1);

			const settlement = settlementRows[0];
			if (!settlement) {
				set.status = 404;
				return buildErrorResponse('Termination settlement not found', 404);
			}

			return { data: settlement };
		},
		{
			params: idParamSchema,
		},
	)
	/**
	 * Fetches the latest processed payroll run detail for an employee.
	 *
	 * @route GET /employees/:id/payroll/latest
	 * @param id - Employee UUID
	 * @returns Latest payroll run detail including tax breakdown
	 */
	.get(
		'/:id/payroll/latest',
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			const employeeRows = await db
				.select({ organizationId: employee.organizationId })
				.from(employee)
				.where(eq(employee.id, id))
				.limit(1);
			const employeeRecord = employeeRows[0];
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					employeeRecord.organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this employee', 403);
			}

			const payrollRows = await db
				.select({
					payrollRunId: payrollRunEmployee.payrollRunId,
					periodStart: payrollRun.periodStart,
					periodEnd: payrollRun.periodEnd,
					paymentFrequency: payrollRun.paymentFrequency,
					processedAt: payrollRun.processedAt,
					taxBreakdown: payrollRunEmployee.taxBreakdown,
					totalPay: payrollRunEmployee.totalPay,
				})
				.from(payrollRunEmployee)
				.leftJoin(payrollRun, eq(payrollRunEmployee.payrollRunId, payrollRun.id))
				.where(
					and(eq(payrollRunEmployee.employeeId, id), eq(payrollRun.status, 'PROCESSED')),
				)
				.orderBy(desc(payrollRun.processedAt), desc(payrollRun.periodEnd))
				.limit(1);

			const latestPayroll = payrollRows[0];
			if (!latestPayroll) {
				set.status = 404;
				return buildErrorResponse('Payroll run not found', 404);
			}

			return { data: latestPayroll };
		},
		{
			params: idParamSchema,
		},
	)
	/**
	 * Fetches PTU history records for an employee.
	 *
	 * @route GET /employees/:id/ptu-history
	 * @param id - Employee UUID
	 * @returns PTU history records ordered by fiscal year
	 */
	.get(
		'/:id/ptu-history',
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			const employeeRows = await db
				.select({ organizationId: employee.organizationId })
				.from(employee)
				.where(eq(employee.id, id))
				.limit(1);
			const employeeRecord = employeeRows[0];
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					employeeRecord.organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this employee', 403);
			}

			const historyRows = await db
				.select({
					id: ptuHistory.id,
					employeeId: ptuHistory.employeeId,
					organizationId: ptuHistory.organizationId,
					fiscalYear: ptuHistory.fiscalYear,
					amount: ptuHistory.amount,
					createdAt: ptuHistory.createdAt,
					updatedAt: ptuHistory.updatedAt,
				})
				.from(ptuHistory)
				.where(eq(ptuHistory.employeeId, id))
				.orderBy(desc(ptuHistory.fiscalYear));

			return { data: historyRows };
		},
		{
			params: idParamSchema,
		},
	)
	/**
	 * Upserts a PTU history record for an employee.
	 *
	 * @route POST /employees/:id/ptu-history
	 * @param id - Employee UUID
	 * @returns Updated PTU history record
	 */
	.post(
		'/:id/ptu-history',
		async ({
			params,
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			const employeeRows = await db
				.select({ organizationId: employee.organizationId })
				.from(employee)
				.where(eq(employee.id, id))
				.limit(1);
			const employeeRecord = employeeRows[0];
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					employeeRecord.organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this employee', 403);
			}

			if (!employeeRecord.organizationId) {
				set.status = 400;
				return buildErrorResponse('Employee organization is required', 400);
			}

			const amountValue = Number(body.amount ?? 0);
			const insertPayload: typeof ptuHistory.$inferInsert = {
				organizationId: employeeRecord.organizationId,
				employeeId: id,
				fiscalYear: body.fiscalYear,
				amount: amountValue.toFixed(2),
			};
			await db
				.insert(ptuHistory)
				.values(insertPayload)
				.onConflictDoUpdate({
					target: [ptuHistory.employeeId, ptuHistory.fiscalYear],
					set: {
						amount: amountValue.toFixed(2),
						updatedAt: new Date(),
					},
				});

			const historyRows = await db
				.select({
					id: ptuHistory.id,
					employeeId: ptuHistory.employeeId,
					organizationId: ptuHistory.organizationId,
					fiscalYear: ptuHistory.fiscalYear,
					amount: ptuHistory.amount,
					createdAt: ptuHistory.createdAt,
					updatedAt: ptuHistory.updatedAt,
				})
				.from(ptuHistory)
				.where(
					and(eq(ptuHistory.employeeId, id), eq(ptuHistory.fiscalYear, body.fiscalYear)),
				)
				.limit(1);

			const record = historyRows[0];
			if (!record) {
				set.status = 500;
				return buildErrorResponse('Failed to save PTU history', 500);
			}

			return { data: record };
		},
		{
			params: idParamSchema,
			body: ptuHistoryUpsertSchema,
		},
	)
	/**
	 * Upserts a PTU history record for an employee.
	 *
	 * @route PUT /employees/:id/ptu-history
	 * @param id - Employee UUID
	 * @returns Updated PTU history record
	 */
	.put(
		'/:id/ptu-history',
		async ({
			params,
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			const employeeRows = await db
				.select({ organizationId: employee.organizationId })
				.from(employee)
				.where(eq(employee.id, id))
				.limit(1);
			const employeeRecord = employeeRows[0];
			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					employeeRecord.organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this employee', 403);
			}

			if (!employeeRecord.organizationId) {
				set.status = 400;
				return buildErrorResponse('Employee organization is required', 400);
			}

			const amountValue = Number(body.amount ?? 0);
			const insertPayload: typeof ptuHistory.$inferInsert = {
				organizationId: employeeRecord.organizationId,
				employeeId: id,
				fiscalYear: body.fiscalYear,
				amount: amountValue.toFixed(2),
			};
			await db
				.insert(ptuHistory)
				.values(insertPayload)
				.onConflictDoUpdate({
					target: [ptuHistory.employeeId, ptuHistory.fiscalYear],
					set: {
						amount: amountValue.toFixed(2),
						updatedAt: new Date(),
					},
				});

			const historyRows = await db
				.select({
					id: ptuHistory.id,
					employeeId: ptuHistory.employeeId,
					organizationId: ptuHistory.organizationId,
					fiscalYear: ptuHistory.fiscalYear,
					amount: ptuHistory.amount,
					createdAt: ptuHistory.createdAt,
					updatedAt: ptuHistory.updatedAt,
				})
				.from(ptuHistory)
				.where(
					and(eq(ptuHistory.employeeId, id), eq(ptuHistory.fiscalYear, body.fiscalYear)),
				)
				.limit(1);

			const record = historyRows[0];
			if (!record) {
				set.status = 500;
				return buildErrorResponse('Failed to save PTU history', 500);
			}

			return { data: record };
		},
		{
			params: idParamSchema,
			body: ptuHistoryUpsertSchema,
		},
	)

	/**
	 * Returns audit events for an employee.
	 *
	 * @route GET /employees/:id/audit
	 * @param id - Employee UUID
	 * @returns Employee audit events with pagination
	 */
	.get(
		'/:id/audit',
		async ({
			params,
			query,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			const employeeRows = await db
				.select({ organizationId: employee.organizationId })
				.from(employee)
				.where(eq(employee.id, id))
				.limit(1);
			const employeeRecord = employeeRows[0];

			if (!employeeRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					employeeRecord.organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this employee', 403);
			}

			const rows = await db
				.select({
					id: employeeAuditEvent.id,
					employeeId: employeeAuditEvent.employeeId,
					organizationId: employeeAuditEvent.organizationId,
					action: employeeAuditEvent.action,
					actorType: employeeAuditEvent.actorType,
					actorUserId: employeeAuditEvent.actorUserId,
					actorName: user.name,
					actorEmail: user.email,
					before: employeeAuditEvent.before,
					after: employeeAuditEvent.after,
					changedFields: employeeAuditEvent.changedFields,
					createdAt: employeeAuditEvent.createdAt,
				})
				.from(employeeAuditEvent)
				.leftJoin(user, eq(employeeAuditEvent.actorUserId, user.id))
				.where(eq(employeeAuditEvent.employeeId, id))
				.orderBy(desc(employeeAuditEvent.createdAt))
				.limit(query.limit)
				.offset(query.offset);

			const total = (
				await db
					.select({ id: employeeAuditEvent.id })
					.from(employeeAuditEvent)
					.where(eq(employeeAuditEvent.employeeId, id))
			).length;

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
			params: idParamSchema,
			query: paginationSchema,
		},
	)

	/**
	 * Create a new employee.
	 *
	 * @route POST /employees
	 * @param body - Employee data (jobPositionId is required)
	 * @returns Created employee record
	 */
	.post(
		'/',
		async ({
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const {
				code,
				firstName,
				lastName,
				nss,
				rfc,
				email,
				phone,
				jobPositionId,
				department,
				status: empStatus,
				hireDate,
				dailyPay,
				paymentFrequency,
				employmentType,
				isTrustEmployee,
				isDirectorAdminGeneralManager,
				isDomesticWorker,
				isPlatformWorker,
				platformHoursYear,
				ptuEligibilityOverride,
				aguinaldoDaysOverride,
				sbcDailyOverride,
				locationId,
				organizationId: organizationIdInput,
				userId,
				schedule,
				shiftType,
				scheduleTemplateId,
			} = body;

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: organizationIdInput ?? null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			// Verify organization exists
			const organizationExists = await db
				.select()
				.from(organization)
				.where(eq(organization.id, organizationId))
				.limit(1);

			if (!organizationExists[0]) {
				set.status = 400;
				return buildErrorResponse('Organization not found', 400);
			}

			// Verify location exists and belongs to this organization
			const locationExists = await db
				.select()
				.from(location)
				.where(eq(location.id, locationId))
				.limit(1);
			if (!locationExists[0]) {
				set.status = 400;
				return buildErrorResponse('Location not found', 400);
			}

			if (
				locationExists[0].organizationId &&
				locationExists[0].organizationId !== organizationId
			) {
				set.status = 403;
				return buildErrorResponse('Location does not belong to this organization', 403);
			}

			// Verify job position exists (required for new employees)
			const positionExists = await db
				.select()
				.from(jobPosition)
				.where(eq(jobPosition.id, jobPositionId))
				.limit(1);
			if (!positionExists[0]) {
				set.status = 400;
				return buildErrorResponse('Job position not found', 400);
			}

			if (
				positionExists[0].organizationId &&
				positionExists[0].organizationId !== organizationId
			) {
				set.status = 403;
				return buildErrorResponse('Job position does not belong to this organization', 403);
			}

			const resolvedUserId = userId?.trim() ? userId.trim() : null;
			const resolvedNss = nss?.trim() ? nss.trim() : null;
			const resolvedRfc = rfc?.trim() ? rfc.trim() : null;
			if (resolvedUserId) {
				const canLink = await ensureAdminRoleForLinking(
					{ authType, session, organizationId },
					set,
				);
				if (!canLink) {
					const status = typeof set.status === 'number' ? set.status : 403;
					return buildErrorResponse(
						'Only organization admins can link users to employees',
						status,
					);
				}

				const linkValid = await validateEmployeeUserLink(
					{ organizationId, userId: resolvedUserId },
					set,
				);
				if (!linkValid) {
					const status = typeof set.status === 'number' ? set.status : 400;
					return buildErrorResponse('User is not eligible for linking', status);
				}
			}

			const auditActor = resolveEmployeeAuditActor(authType, session);

			// Check if code is unique
			const codeExists = await db
				.select()
				.from(employee)
				.where(eq(employee.code, code))
				.limit(1);
			if (codeExists[0]) {
				set.status = 409;
				return buildErrorResponse('Employee code already exists', 409);
			}

			if (schedule && scheduleTemplateId) {
				set.status = 400;
				return buildErrorResponse(
					'Provide either a scheduleTemplateId or a custom schedule, not both',
					400,
				);
			}

			let templateDays: {
				dayOfWeek: number;
				startTime: string;
				endTime: string;
				isWorkingDay: boolean | null;
			}[] = [];
			let selectedTemplate: typeof scheduleTemplate.$inferSelect | null = null;

			if (scheduleTemplateId) {
				const templateRecord = await db
					.select()
					.from(scheduleTemplate)
					.where(eq(scheduleTemplate.id, scheduleTemplateId))
					.limit(1);

				if (!templateRecord[0]) {
					set.status = 404;
					return buildErrorResponse('Schedule template not found', 404);
				}

				if (
					templateRecord[0].organizationId &&
					templateRecord[0].organizationId !== organizationId
				) {
					set.status = 403;
					return buildErrorResponse(
						'Schedule template does not belong to this organization',
						403,
					);
				}

				selectedTemplate = templateRecord[0] ?? null;

				templateDays = await db
					.select()
					.from(scheduleTemplateDay)
					.where(eq(scheduleTemplateDay.templateId, scheduleTemplateId))
					.orderBy(scheduleTemplateDay.dayOfWeek);
			}

			const id = crypto.randomUUID();

			const resolvedShiftType = shiftType ?? selectedTemplate?.shiftType ?? 'DIURNA';
			const normalizedDailyPay = Number(dailyPay);

			if (!Number.isFinite(normalizedDailyPay) || normalizedDailyPay <= 0) {
				set.status = 400;
				return buildErrorResponse('Daily pay must be greater than 0', 400);
			}

			// Validate minimum wage based on organization payroll settings
			const minWageValidation = await validateMinimumWage({
				organizationId,
				locationId,
				dailyPay: normalizedDailyPay,
			});

			if (!minWageValidation.isValid) {
				set.status = 400;
				return buildErrorResponse('Daily pay is below the minimum wage requirement', 400, {
					code: minWageValidation.errorCode,
					details: minWageValidation.details,
				});
			}

			if (aguinaldoDaysOverride !== undefined && aguinaldoDaysOverride !== null) {
				const payrollSettingsRows = await db
					.select({ aguinaldoDays: payrollSetting.aguinaldoDays })
					.from(payrollSetting)
					.where(eq(payrollSetting.organizationId, organizationId))
					.limit(1);
				const policyDays = Number(payrollSettingsRows[0]?.aguinaldoDays ?? 15);
				if (aguinaldoDaysOverride < 15 || aguinaldoDaysOverride < policyDays) {
					set.status = 400;
					return buildErrorResponse(
						'Aguinaldo override must be at least the policy value and >= 15',
						400,
						{
							code: 'AGUINALDO_OVERRIDE_INVALID',
							details: { policyDays },
						},
					);
				}
			}

			const newEmployee = {
				id,
				code,
				firstName,
				lastName,
				nss: resolvedNss,
				rfc: resolvedRfc,
				email: email ?? null,
				phone: phone ?? null,
				jobPositionId,
				department: department ?? null,
				status: empStatus,
				hireDate: hireDate ?? null,
				dailyPay: normalizedDailyPay.toFixed(2),
				paymentFrequency: paymentFrequency ?? 'MONTHLY',
				employmentType: employmentType ?? 'PERMANENT',
				isTrustEmployee: Boolean(isTrustEmployee ?? false),
				isDirectorAdminGeneralManager: Boolean(isDirectorAdminGeneralManager ?? false),
				isDomesticWorker: Boolean(isDomesticWorker ?? false),
				isPlatformWorker: Boolean(isPlatformWorker ?? false),
				platformHoursYear:
					platformHoursYear === null || platformHoursYear === undefined
						? '0'
						: Number(platformHoursYear).toFixed(2),
				ptuEligibilityOverride: ptuEligibilityOverride ?? 'DEFAULT',
				aguinaldoDaysOverride:
					aguinaldoDaysOverride === undefined ? null : aguinaldoDaysOverride,
				sbcDailyOverride:
					sbcDailyOverride === undefined || sbcDailyOverride === null
						? null
						: sbcDailyOverride.toFixed(2),
				locationId,
				organizationId,
				userId: resolvedUserId,
				shiftType: resolvedShiftType,
				scheduleTemplateId: scheduleTemplateId ?? null,
			};

			const selectedSchedule = schedule ?? templateDays;

			await db.transaction(async (tx) => {
				await setEmployeeAuditSkip(tx);
				await tx.insert(employee).values(newEmployee);

				if (selectedSchedule && selectedSchedule.length > 0) {
					const scheduleRows = selectedSchedule.map((entry) => ({
						employeeId: id,
						dayOfWeek: entry.dayOfWeek,
						startTime: entry.startTime,
						endTime: entry.endTime,
						isWorkingDay: entry.isWorkingDay ?? true,
					}));
					await tx.insert(employeeSchedule).values(scheduleRows);
				}

				const createdRows = await tx
					.select()
					.from(employee)
					.where(eq(employee.id, id))
					.limit(1);
				const created = createdRows[0];
				if (created) {
					await createEmployeeAuditEvent(tx, {
						employeeId: id,
						organizationId,
						action: 'created',
						actorType: auditActor.actorType,
						actorUserId: auditActor.actorUserId,
						before: null,
						after: buildEmployeeAuditSnapshot(created),
						changedFields: [],
					});
				}
			});

			set.status = 201;
			const response: {
				data: typeof newEmployee & {
					rekognitionUserId: null;
					createdAt: Date;
					updatedAt: Date;
					scheduleTemplateName: string | null;
					scheduleTemplateShiftType: string | null;
				};
				warnings?: Array<{ code: 'BELOW_MINIMUM_WAGE'; details: Record<string, unknown> }>;
			} = {
				data: {
					...newEmployee,
					rekognitionUserId: null,
					createdAt: new Date(),
					updatedAt: new Date(),
					scheduleTemplateName: selectedTemplate?.name ?? null,
					scheduleTemplateShiftType: selectedTemplate?.shiftType ?? null,
				},
			};

			if (minWageValidation.warnings) {
				response.warnings = minWageValidation.warnings;
			}

			return response;
		},
		{
			body: createEmployeeSchema,
		},
	)

	/**
	 * Update an existing employee.
	 *
	 * @route PUT /employees/:id
	 * @param id - Employee UUID
	 * @param body - Fields to update
	 * @returns Updated employee record
	 */
	.put(
		'/:id',
		async ({
			params,
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			// Check if employee exists
			const existing = await db.select().from(employee).where(eq(employee.id, id)).limit(1);
			const existingRecord = existing[0];
			if (!existingRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					existingRecord.organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this employee', 403);
			}

			const targetOrgId = existingRecord.organizationId ?? null;
			const resolvedOrganizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: targetOrgId,
			});

			if (!resolvedOrganizationId) {
				set.status = 403;
				return buildErrorResponse('Organization is required or not permitted', 403);
			}
			const auditActor = resolveEmployeeAuditActor(authType, session);
			const beforeSnapshot = buildEmployeeAuditSnapshot(existingRecord);
			const canManageFiscalDailyPay = await hasOrganizationAdminRole({
				authType,
				session,
				organizationId: resolvedOrganizationId,
			});
			const canViewFiscalDailyPay = await canViewFiscalCompensation({
				authType,
				session,
				organizationId: resolvedOrganizationId,
			});

			// Verify location exists if being updated
			if (body.locationId) {
				const locationExists = await db
					.select()
					.from(location)
					.where(eq(location.id, body.locationId))
					.limit(1);
				if (!locationExists[0]) {
					set.status = 400;
					return buildErrorResponse('Location not found', 400);
				}

				if (
					resolvedOrganizationId &&
					locationExists[0].organizationId &&
					locationExists[0].organizationId !== resolvedOrganizationId
				) {
					set.status = 403;
					return buildErrorResponse('Location does not belong to this organization', 403);
				}
			}

			// Verify job position exists if being updated
			if (body.jobPositionId) {
				const positionExists = await db
					.select()
					.from(jobPosition)
					.where(eq(jobPosition.id, body.jobPositionId))
					.limit(1);
				if (!positionExists[0]) {
					set.status = 400;
					return buildErrorResponse('Job position not found', 400);
				}

				if (
					resolvedOrganizationId &&
					positionExists[0].organizationId &&
					positionExists[0].organizationId !== resolvedOrganizationId
				) {
					set.status = 403;
					return buildErrorResponse(
						'Job position does not belong to this organization',
						403,
					);
				}
			}

			const resolvedUserId =
				body.userId === undefined
					? undefined
					: body.userId?.trim()
						? body.userId.trim()
						: null;
			if (resolvedUserId !== undefined) {
				const canLink = await ensureAdminRoleForLinking(
					{ authType, session, organizationId: resolvedOrganizationId },
					set,
				);
				if (!canLink) {
					const status = typeof set.status === 'number' ? set.status : 403;
					return buildErrorResponse(
						'Only organization admins can link users to employees',
						status,
					);
				}

				if (resolvedUserId) {
					const linkValid = await validateEmployeeUserLink(
						{
							organizationId: resolvedOrganizationId,
							userId: resolvedUserId,
							employeeId: id,
						},
						set,
					);
					if (!linkValid) {
						const status = typeof set.status === 'number' ? set.status : 400;
						return buildErrorResponse('User is not eligible for linking', status);
					}
				}
			}

			// Only update if there are fields to update
			if (Object.keys(body).length === 0) {
				if (canManageFiscalDailyPay) {
					return { data: existingRecord };
				}
				return { data: omitFiscalDailyPay(existingRecord) };
			}

			if (body.schedule && body.scheduleTemplateId) {
				set.status = 400;
				return buildErrorResponse(
					'Provide either a scheduleTemplateId or a custom schedule, not both',
					400,
				);
			}

			let templateDays: {
				dayOfWeek: number;
				startTime: string;
				endTime: string;
				isWorkingDay: boolean | null;
			}[] = [];
			let selectedTemplate: typeof scheduleTemplate.$inferSelect | null = null;

			if (body.scheduleTemplateId) {
				const templateRecord = await db
					.select()
					.from(scheduleTemplate)
					.where(eq(scheduleTemplate.id, body.scheduleTemplateId))
					.limit(1);

				if (!templateRecord[0]) {
					set.status = 404;
					return buildErrorResponse('Schedule template not found', 404);
				}

				if (
					templateRecord[0].organizationId &&
					templateRecord[0].organizationId !== resolvedOrganizationId
				) {
					set.status = 403;
					return buildErrorResponse(
						'Schedule template does not belong to this organization',
						403,
					);
				}

				selectedTemplate = templateRecord[0] ?? null;

				templateDays = await db
					.select()
					.from(scheduleTemplateDay)
					.where(eq(scheduleTemplateDay.templateId, body.scheduleTemplateId))
					.orderBy(scheduleTemplateDay.dayOfWeek);
			}

			// Extract schedule updates separately to avoid passing to employee table
			const {
				schedule,
				scheduleTemplateId,
				sbcDailyOverride,
				userId: userIdInput,
				code: _code,
				dailyPay: dailyPayInput,
				fiscalDailyPay,
				nss,
				rfc,
				platformHoursYear,
				aguinaldoDaysOverride,
				...employeeUpdate
			} = body;
			void _code;
			const updatePayload: Partial<typeof employee.$inferInsert> = {
				...employeeUpdate,
			};
			if (nss !== undefined) {
				updatePayload.nss = nss?.trim() ? nss.trim() : null;
			}
			if (rfc !== undefined) {
				updatePayload.rfc = rfc?.trim() ? rfc.trim() : null;
			}

			// Store minimum wage validation result for potential warnings in response
			let minWageValidation:
				| { isValid: true; errorCode?: never; warnings?: never }
				| {
						isValid: false;
						errorCode: 'BELOW_MINIMUM_WAGE';
						details: Record<string, unknown>;
				  }
				| {
						isValid: true;
						warnings: Array<{
							code: 'BELOW_MINIMUM_WAGE';
							details: Record<string, unknown>;
						}>;
				  } = {
				isValid: true,
			};

			if (dailyPayInput !== undefined) {
				const normalizedDailyPay = Number(dailyPayInput);
				if (!Number.isFinite(normalizedDailyPay) || normalizedDailyPay <= 0) {
					set.status = 400;
					return buildErrorResponse('Daily pay must be greater than 0', 400);
				}

				// Validate minimum wage based on organization payroll settings
				// Use the new locationId if being updated, otherwise use existing employee's locationId
				const effectiveLocationId = body.locationId ?? existingRecord.locationId ?? null;
				minWageValidation = await validateMinimumWage({
					organizationId: resolvedOrganizationId,
					locationId: effectiveLocationId,
					dailyPay: normalizedDailyPay,
				});

				if (!minWageValidation.isValid) {
					set.status = 400;
					return buildErrorResponse(
						'Daily pay is below the minimum wage requirement',
						400,
						{
							code: minWageValidation.errorCode,
							details: minWageValidation.details,
						},
					);
				}

				updatePayload.dailyPay = normalizedDailyPay.toFixed(2);
			}

			if (fiscalDailyPay !== undefined && !canManageFiscalDailyPay) {
				set.status = 403;
				return buildErrorResponse(
					'Only organization admins can manage fiscalDailyPay',
					403,
				);
			}
			const payrollSettingsRows = await db
				.select({
					aguinaldoDays: payrollSetting.aguinaldoDays,
					enableDualPayroll: payrollSetting.enableDualPayroll,
				})
				.from(payrollSetting)
				.where(eq(payrollSetting.organizationId, resolvedOrganizationId))
				.limit(1);
			const payrollSettingsRow = payrollSettingsRows[0];
			const isDualPayrollEnabled = Boolean(payrollSettingsRow?.enableDualPayroll);

			const nextDailyPay = Number(
				dailyPayInput !== undefined ? dailyPayInput : existingRecord.dailyPay ?? 0,
			);
			const existingFiscalDailyPay =
				existingRecord.fiscalDailyPay === null ||
				existingRecord.fiscalDailyPay === undefined
					? null
					: Number(existingRecord.fiscalDailyPay);
				const shouldClearHiddenFiscalDailyPay =
					fiscalDailyPay === undefined &&
					dailyPayInput !== undefined &&
					existingFiscalDailyPay !== null &&
					existingFiscalDailyPay >= nextDailyPay &&
					canManageFiscalDailyPay &&
					!isDualPayrollEnabled;
				const nextFiscalDailyPay =
					shouldClearHiddenFiscalDailyPay
						? null
						: (fiscalDailyPay !== undefined ? fiscalDailyPay : existingFiscalDailyPay);

				if (
					!canManageFiscalDailyPay &&
					fiscalDailyPay === undefined &&
					dailyPayInput !== undefined &&
					existingFiscalDailyPay !== null &&
					existingFiscalDailyPay >= nextDailyPay
				) {
					set.status = 403;
					return buildErrorResponse('Only organization admins can manage fiscalDailyPay', 403);
				}

				if (
					nextFiscalDailyPay !== null &&
					nextFiscalDailyPay !== undefined &&
					Number(nextFiscalDailyPay) >= nextDailyPay
				) {
				set.status = 400;
				return buildErrorResponse('Fiscal daily pay must be lower than dailyPay', 400);
			}

			if (aguinaldoDaysOverride !== undefined) {
				if (aguinaldoDaysOverride === null) {
					updatePayload.aguinaldoDaysOverride = null;
				} else {
					const policyDays = Number(payrollSettingsRow?.aguinaldoDays ?? 15);
					if (aguinaldoDaysOverride < 15 || aguinaldoDaysOverride < policyDays) {
						set.status = 400;
						return buildErrorResponse(
							'Aguinaldo override must be at least the policy value and >= 15',
							400,
							{
								code: 'AGUINALDO_OVERRIDE_INVALID',
								details: { policyDays },
							},
						);
					}
					updatePayload.aguinaldoDaysOverride = aguinaldoDaysOverride;
				}
			}

			if (platformHoursYear !== undefined) {
				updatePayload.platformHoursYear =
					platformHoursYear === null ? '0' : Number(platformHoursYear).toFixed(2);
			}

			if (sbcDailyOverride !== undefined) {
				updatePayload.sbcDailyOverride =
					sbcDailyOverride === null ? null : sbcDailyOverride.toFixed(2);
			}

			if (fiscalDailyPay !== undefined) {
				updatePayload.fiscalDailyPay =
					fiscalDailyPay === null ? null : fiscalDailyPay.toFixed(4);
			} else if (shouldClearHiddenFiscalDailyPay) {
				updatePayload.fiscalDailyPay = null;
			}

			if (userIdInput !== undefined) {
				updatePayload.userId = resolvedUserId ?? null;
			}

			if (scheduleTemplateId !== undefined) {
				updatePayload.scheduleTemplateId = scheduleTemplateId;
			}
			if (
				scheduleTemplateId !== undefined &&
				scheduleTemplateId !== null &&
				employeeUpdate.shiftType === undefined &&
				selectedTemplate
			) {
				updatePayload.shiftType = selectedTemplate.shiftType;
			}

			let nextSchedule: NonNullable<typeof schedule> | typeof templateDays | undefined =
				undefined;

			if (schedule !== undefined) {
				nextSchedule = schedule;
			} else if (scheduleTemplateId !== undefined && scheduleTemplateId !== null) {
				nextSchedule = templateDays;
			}

			const scheduleChanged = nextSchedule !== undefined;

			const result = await db.transaction(async (tx) => {
				await setEmployeeAuditSkip(tx);
				await tx.update(employee).set(updatePayload).where(eq(employee.id, id));

				if (nextSchedule !== undefined) {
					await tx.delete(employeeSchedule).where(eq(employeeSchedule.employeeId, id));
					if (nextSchedule.length > 0) {
						const scheduleRows = nextSchedule.map((entry) => ({
							employeeId: id,
							dayOfWeek: entry.dayOfWeek,
							startTime: entry.startTime,
							endTime: entry.endTime,
							isWorkingDay: entry.isWorkingDay ?? true,
						}));
						await tx.insert(employeeSchedule).values(scheduleRows);
					}
				}

				// Fetch updated record
				const updated = await tx
					.select({
						id: employee.id,
						code: employee.code,
						firstName: employee.firstName,
						lastName: employee.lastName,
						nss: employee.nss,
						rfc: employee.rfc,
						email: employee.email,
						phone: employee.phone,
						jobPositionId: employee.jobPositionId,
						department: employee.department,
						status: employee.status,
						terminationDateKey: employee.terminationDateKey,
						lastDayWorkedDateKey: employee.lastDayWorkedDateKey,
						terminationReason: employee.terminationReason,
						contractType: employee.contractType,
						terminationNotes: employee.terminationNotes,
						shiftType: employee.shiftType,
						hireDate: employee.hireDate,
						dailyPay: employee.dailyPay,
						fiscalDailyPay: employee.fiscalDailyPay,
						paymentFrequency: employee.paymentFrequency,
						employmentType: employee.employmentType,
						isTrustEmployee: employee.isTrustEmployee,
						isDirectorAdminGeneralManager: employee.isDirectorAdminGeneralManager,
						isDomesticWorker: employee.isDomesticWorker,
						isPlatformWorker: employee.isPlatformWorker,
						platformHoursYear: employee.platformHoursYear,
						ptuEligibilityOverride: employee.ptuEligibilityOverride,
						aguinaldoDaysOverride: employee.aguinaldoDaysOverride,
						sbcDailyOverride: employee.sbcDailyOverride,
						locationId: employee.locationId,
						importBatchId: employee.importBatchId,
						organizationId: employee.organizationId,
						userId: employee.userId,
						scheduleTemplateId: employee.scheduleTemplateId,
						scheduleTemplateName: scheduleTemplate.name,
						scheduleTemplateShiftType: scheduleTemplate.shiftType,
						rekognitionUserId: employee.rekognitionUserId,
						lastPayrollDate: employee.lastPayrollDate,
						createdAt: employee.createdAt,
						updatedAt: employee.updatedAt,
					})
					.from(employee)
					.leftJoin(
						scheduleTemplate,
						eq(employee.scheduleTemplateId, scheduleTemplate.id),
					)
					.where(eq(employee.id, id))
					.limit(1);
				const updatedSchedule = await tx
					.select()
					.from(employeeSchedule)
					.where(eq(employeeSchedule.employeeId, id))
					.orderBy(employeeSchedule.dayOfWeek, employeeSchedule.startTime);

				const updatedRecord = updated[0];
				if (updatedRecord) {
					const afterSnapshot = buildEmployeeAuditSnapshot(updatedRecord);
					const changedFields = getEmployeeAuditChangedFields(
						beforeSnapshot,
						afterSnapshot,
					);
					if (scheduleChanged && !changedFields.includes('schedule')) {
						changedFields.push('schedule');
					}

					if (changedFields.length > 0) {
						await createEmployeeAuditEvent(tx, {
							employeeId: id,
							organizationId: updatedRecord.organizationId,
							action: 'updated',
							actorType: auditActor.actorType,
							actorUserId: auditActor.actorUserId,
							before: beforeSnapshot,
							after: afterSnapshot,
							changedFields,
						});
					}
				}

				return { updatedRecord, updatedSchedule };
			});

			if (!result.updatedRecord) {
				set.status = 500;
				return buildErrorResponse('Employee update failed', 500);
			}

			const response: {
				data:
					| (typeof result.updatedRecord & { schedule: typeof result.updatedSchedule })
					| (Omit<typeof result.updatedRecord, 'fiscalDailyPay'> & {
							schedule: typeof result.updatedSchedule;
					  });
				warnings?: Array<{ code: 'BELOW_MINIMUM_WAGE'; details: Record<string, unknown> }>;
				} = {
					data: canViewFiscalDailyPay
						? { ...result.updatedRecord, schedule: result.updatedSchedule }
						: { ...omitFiscalDailyPay(result.updatedRecord), schedule: result.updatedSchedule },
				};

			if (minWageValidation.warnings) {
				response.warnings = minWageValidation.warnings;
			}

			return response;
		},
		{
			params: idParamSchema,
			body: updateEmployeeSchema,
		},
	)

	/**
	 * Delete an employee.
	 *
	 * @route DELETE /employees/:id
	 * @param id - Employee UUID
	 * @returns Success message
	 */
	.delete(
		'/:id',
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			// Check if employee exists
			const existing = await db.select().from(employee).where(eq(employee.id, id)).limit(1);
			const existingRecord = existing[0];
			if (!existingRecord) {
				set.status = 404;
				return buildErrorResponse('Employee not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					existingRecord.organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this employee', 403);
			}

			const auditActor = resolveEmployeeAuditActor(authType, session);
			const beforeSnapshot = buildEmployeeAuditSnapshot(existingRecord);

			// If employee has Rekognition user, clean up first
			if (existingRecord.rekognitionUserId) {
				const facesResult = await listFacesByExternalId(id);
				if (facesResult.success && facesResult.faceIds.length > 0) {
					await disassociateFaces(existingRecord.rekognitionUserId, facesResult.faceIds);
					await deleteFaces(facesResult.faceIds);
				}
				await deleteUser(existingRecord.rekognitionUserId);
			}

			await db.transaction(async (tx) => {
				await setEmployeeAuditSkip(tx);
				await createEmployeeAuditEvent(tx, {
					employeeId: id,
					organizationId: existingRecord.organizationId,
					action: 'deleted',
					actorType: auditActor.actorType,
					actorUserId: auditActor.actorUserId,
					before: beforeSnapshot,
					after: null,
					changedFields: [],
				});
				await tx.delete(employee).where(eq(employee.id, id));
			});

			return { message: 'Employee deleted successfully' };
		},
		{
			params: idParamSchema,
		},
	)

	// =========================================================================
	// Rekognition Face Enrollment Operations
	// =========================================================================

	/**
	 * Creates a Rekognition user for an employee.
	 * This must be called before enrolling faces for the employee.
	 *
	 * @route POST /employees/:id/create-rekognition-user
	 * @param id - Employee UUID from path parameters
	 * @returns UserCreationResult with success status and user ID
	 */
	.post(
		'/:id/create-rekognition-user',
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}): Promise<UserCreationResult> => {
			const { id: employeeId } = params;

			// Verify employee exists in database
			const existingEmployee = await db
				.select()
				.from(employee)
				.where(eq(employee.id, employeeId))
				.limit(1);

			if (existingEmployee.length === 0) {
				set.status = 404;
				return {
					success: false,
					userId: null,
					employeeId,
					message: 'Employee not found',
					errorCode: 'EMPLOYEE_NOT_FOUND',
				};
			}

			const employeeRecord = existingEmployee[0]!;

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					employeeRecord.organizationId,
				)
			) {
				set.status = 403;
				return {
					success: false,
					userId: null,
					employeeId,
					message: 'You do not have access to this employee',
					errorCode: 'EMPLOYEE_FORBIDDEN',
				};
			}

			// Check if employee already has a Rekognition user
			if (employeeRecord?.rekognitionUserId) {
				set.status = 409;
				return {
					success: false,
					userId: employeeRecord.rekognitionUserId,
					employeeId,
					message: 'Employee already has a Rekognition user',
					errorCode: 'REKOGNITION_USER_EXISTS',
				};
			}

			// Create user in Rekognition
			const result = await createUser(employeeId);

			if (!result.success) {
				set.status = 500;
				return {
					success: false,
					userId: null,
					employeeId,
					message: result.message ?? 'Failed to create Rekognition user',
					errorCode: 'REKOGNITION_USER_CREATE_FAILED',
				};
			}

			const auditActor = resolveEmployeeAuditActor(authType, session);
			const beforeSnapshot = buildEmployeeAuditSnapshot(employeeRecord);

			// Update employee record with Rekognition user ID
			await db.transaction(async (tx) => {
				await setEmployeeAuditSkip(tx);
				await tx
					.update(employee)
					.set({ rekognitionUserId: employeeId })
					.where(eq(employee.id, employeeId));

				const updatedRows = await tx
					.select()
					.from(employee)
					.where(eq(employee.id, employeeId))
					.limit(1);
				const updatedRecord = updatedRows[0];
				if (updatedRecord) {
					const afterSnapshot = buildEmployeeAuditSnapshot(updatedRecord);
					const changedFields = getEmployeeAuditChangedFields(
						beforeSnapshot,
						afterSnapshot,
					);
					if (!changedFields.includes('rekognitionUserId')) {
						changedFields.push('rekognitionUserId');
					}
					await createEmployeeAuditEvent(tx, {
						employeeId,
						organizationId: employeeRecord.organizationId,
						action: 'rekognition_created',
						actorType: auditActor.actorType,
						actorUserId: auditActor.actorUserId,
						before: beforeSnapshot,
						after: afterSnapshot,
						changedFields,
					});
				}
			});

			return {
				success: true,
				userId: result.userId,
				employeeId,
				message: 'Rekognition user created successfully',
			};
		},
		{
			params: employeeIdParamsSchema,
		},
	)

	/**
	 * Enrolls a face for an employee by indexing and associating it with their Rekognition user.
	 * The employee must have a Rekognition user created first.
	 *
	 * @route POST /employees/:id/enroll-face
	 * @param id - Employee UUID from path parameters
	 * @param body.image - Base64-encoded image (without data URL prefix)
	 * @returns FaceEnrollmentResult with face ID and association status
	 */
	.post(
		'/:id/enroll-face',
		async ({
			params,
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}): Promise<FaceEnrollmentResult> => {
			const { id: employeeId } = params;
			const { image } = body;

			// Verify employee exists and has a Rekognition user
			const existingEmployee = await db
				.select()
				.from(employee)
				.where(eq(employee.id, employeeId))
				.limit(1);

			if (existingEmployee.length === 0) {
				set.status = 404;
				return {
					success: false,
					faceId: null,
					employeeId,
					associated: false,
					message: 'Employee not found',
					errorCode: 'EMPLOYEE_NOT_FOUND',
				};
			}

			const enrollEmployee = existingEmployee[0]!;

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					enrollEmployee.organizationId,
				)
			) {
				set.status = 403;
				return {
					success: false,
					faceId: null,
					employeeId,
					associated: false,
					message: 'You do not have access to this employee',
					errorCode: 'EMPLOYEE_FORBIDDEN',
				};
			}

			if (!enrollEmployee?.rekognitionUserId) {
				set.status = 400;
				return {
					success: false,
					faceId: null,
					employeeId,
					associated: false,
					message: 'Employee does not have a Rekognition user. Create one first.',
					errorCode: 'REKOGNITION_USER_MISSING',
				};
			}

			// Decode base64 image to bytes
			let imageBytes: Uint8Array;
			try {
				imageBytes = decodeBase64Image(image);
			} catch {
				set.status = 400;
				return {
					success: false,
					faceId: null,
					employeeId,
					associated: false,
					message: 'Invalid base64 image data',
					errorCode: 'INVALID_IMAGE_BASE64',
				};
			}

			// Index the face in Rekognition
			const indexResult = await indexFace(imageBytes, employeeId);

			const indexedFace = indexResult.faces[0];
			if (!indexResult.success || !indexedFace) {
				set.status = 400;
				return {
					success: false,
					faceId: null,
					employeeId,
					associated: false,
					message: indexResult.message ?? 'Failed to index face',
					errorCode: 'REKOGNITION_INDEX_FAILED',
				};
			}

			const faceId = indexedFace.faceId;

			// Associate the face with the user
			const associateResult = await associateFaces(enrollEmployee.rekognitionUserId, [
				faceId,
			]);

			return {
				success: true,
				faceId,
				employeeId,
				associated: associateResult.success,
				message: associateResult.success
					? 'Face enrolled and associated successfully'
					: `Face indexed but association failed: ${associateResult.message}`,
			};
		},
		{
			params: employeeIdParamsSchema,
			body: imageBodySchema,
		},
	)

	/**
	 * Deletes a Rekognition user and all associated faces for an employee.
	 * This cleans up all face recognition data for the employee.
	 *
	 * @route DELETE /employees/:id/rekognition-user
	 * @param id - Employee UUID from path parameters
	 * @returns Object with success status and message
	 */
	.delete(
		'/:id/rekognition-user',
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}): Promise<{ success: boolean; message: string; errorCode?: string }> => {
			const { id: employeeId } = params;

			// Verify employee exists
			const existingEmployee = await db
				.select()
				.from(employee)
				.where(eq(employee.id, employeeId))
				.limit(1);

			const deleteEmployeeRecord = existingEmployee[0];
			if (!deleteEmployeeRecord) {
				set.status = 404;
				return {
					success: false,
					message: 'Employee not found',
					errorCode: 'EMPLOYEE_NOT_FOUND',
				};
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					deleteEmployeeRecord.organizationId,
				)
			) {
				set.status = 403;
				return {
					success: false,
					message: 'You do not have access to this employee',
					errorCode: 'EMPLOYEE_FORBIDDEN',
				};
			}

			const auditActor = resolveEmployeeAuditActor(authType, session);
			const beforeSnapshot = buildEmployeeAuditSnapshot(deleteEmployeeRecord);

			const rekognitionUserId = deleteEmployeeRecord.rekognitionUserId;

			if (!rekognitionUserId) {
				set.status = 400;
				return {
					success: false,
					message: 'Employee does not have a Rekognition user',
					errorCode: 'REKOGNITION_USER_MISSING',
				};
			}

			// List all faces for this employee to disassociate and delete them
			const facesResult = await listFacesByExternalId(employeeId);

			if (facesResult.success && facesResult.faceIds.length > 0) {
				// Disassociate faces from user
				await disassociateFaces(rekognitionUserId, facesResult.faceIds);

				// Delete the faces from the collection
				await deleteFaces(facesResult.faceIds);
			}

			// Delete the user from Rekognition
			const deleteResult = await deleteUser(rekognitionUserId);

			if (!deleteResult.success) {
				set.status = 500;
				return {
					success: false,
					message: deleteResult.message ?? 'Failed to delete Rekognition user',
					errorCode: 'REKOGNITION_USER_DELETE_FAILED',
				};
			}

			// Clear the Rekognition user ID from the employee record
			await db.transaction(async (tx) => {
				await setEmployeeAuditSkip(tx);
				await tx
					.update(employee)
					.set({ rekognitionUserId: null })
					.where(eq(employee.id, employeeId));

				const updatedRows = await tx
					.select()
					.from(employee)
					.where(eq(employee.id, employeeId))
					.limit(1);
				const updatedRecord = updatedRows[0];
				if (updatedRecord) {
					const afterSnapshot = buildEmployeeAuditSnapshot(updatedRecord);
					const changedFields = getEmployeeAuditChangedFields(
						beforeSnapshot,
						afterSnapshot,
					);
					if (!changedFields.includes('rekognitionUserId')) {
						changedFields.push('rekognitionUserId');
					}
					await createEmployeeAuditEvent(tx, {
						employeeId,
						organizationId: deleteEmployeeRecord.organizationId,
						action: 'rekognition_deleted',
						actorType: auditActor.actorType,
						actorUserId: auditActor.actorUserId,
						before: beforeSnapshot,
						after: afterSnapshot,
						changedFields,
					});
				}
			});

			return {
				success: true,
				message: 'Rekognition user and associated faces deleted successfully',
			};
		},
		{
			params: employeeIdParamsSchema,
		},
	);
