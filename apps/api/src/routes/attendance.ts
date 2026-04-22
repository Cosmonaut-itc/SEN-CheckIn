import { Elysia } from 'elysia';
import crypto from 'node:crypto';
import { eq, and, count, desc, gte, ilike, inArray, lte, lt, ne, sql, type SQL } from 'drizzle-orm';
import { startOfDay, endOfDay } from 'date-fns';
import { z } from 'zod';

import db from '../db/index.js';
import {
	attendanceRecord,
	device,
	employee,
	employeeSchedule,
	employeeIncapacity,
	location,
	member,
	payrollRun,
	payrollSetting,
	scheduleException,
	vacationRequest,
	vacationRequestDay,
} from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import type { AuthSession } from '../plugins/auth.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { hasOrganizationAccess, resolveOrganizationId } from '../utils/organization.js';
import { addDaysToDateKey, parseDateKey } from '../utils/date-key.js';
import {
	getUtcDateForZonedMidnight,
	isValidIanaTimeZone,
	toDateKeyInTimeZone,
} from '../utils/time-zone.js';
import {
	idParamSchema,
	attendanceQuerySchema,
	attendancePresentQuerySchema,
	attendanceOffsiteTodayQuerySchema,
	createAttendanceSchema,
	updateOffsiteAttendanceSchema,
	employeeIdParamSchema,
} from '../schemas/crud.js';

/**
 * Attendance routes for managing check-in/check-out records.
 * Provides endpoints for creating and querying attendance records.
 *
 * @module routes/attendance
 */

/**
 * Attendance routes plugin for Elysia.
 */
const OFFSITE_MAX_RETRO_DAYS = 7;
const OFFSITE_VIRTUAL_DEVICE_PREFIX = 'VIRTUAL-RH-OFFSITE';
const OFFSITE_EMPLOYEE_DATE_UNIQUE_INDEX = 'attendance_record_offsite_employee_date_uniq';

/**
 * Builds a deterministic virtual device code used for RH offsite records.
 *
 * @param organizationId - Organization identifier
 * @returns Stable device code for the organization
 */
function buildOffsiteVirtualDeviceCode(organizationId: string): string {
	return `${OFFSITE_VIRTUAL_DEVICE_PREFIX}-${organizationId}`;
}

/**
 * Ensures the caller has organization admin permissions.
 *
 * @param args - Auth and organization context
 * @param set - Elysia response setter
 * @returns True when caller is authorized
 */
async function ensureAdminRole(
	args: { authType: 'session' | 'apiKey'; session: AuthSession | null; organizationId: string },
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

	if (role !== 'admin' && role !== 'owner') {
		set.status = 403;
		return false;
	}

	return true;
}

/**
 * Resolves the organization payroll timezone, with Mexico City fallback.
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
	const candidate = settingsRows[0]?.timeZone ?? 'America/Mexico_City';
	return isValidIanaTimeZone(candidate) ? candidate : 'America/Mexico_City';
}

/**
 * Builds an inclusive UTC day window for a local date key in the provided timezone.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @param timeZone - IANA timezone
 * @returns UTC range bounds
 */
function buildUtcBoundsForDateKey(
	dateKey: string,
	timeZone: string,
): {
	startUtc: Date;
	endExclusiveUtc: Date;
} {
	const startUtc = getUtcDateForZonedMidnight(dateKey, timeZone);
	const endExclusiveUtc = getUtcDateForZonedMidnight(addDaysToDateKey(dateKey, 1), timeZone);
	return { startUtc, endExclusiveUtc };
}

const attendanceTimelineQuerySchema = z.object({
	fromDate: z.coerce.date().optional(),
	toDate: z.coerce.date().optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
	offset: z.coerce.number().int().min(0).default(0),
	kind: z.enum(['in', 'late', 'offsite']).optional(),
});

const attendanceHourlyQuerySchema = z.object({
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.refine((value) => {
			try {
				parseDateKey(value);
				return true;
			} catch {
				return false;
			}
		}, 'Invalid date key')
		.optional(),
});

const WEEKDAY_INDEX_BY_SHORT_NAME: Record<string, number> = {
	Sun: 0,
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6,
};

type TimelineKind = z.infer<typeof attendanceTimelineQuerySchema>['kind'];

type TimelineScheduleEntry = {
	dayOfWeek: number;
	startTime: string;
	isWorkingDay: boolean;
};

/**
 * Resolves the default UTC range for the organization's current local day.
 *
 * @param timeZone - Organization IANA timezone
 * @returns Inclusive start and exclusive end bounds
 */
function buildDefaultTodayBounds(timeZone: string): { startUtc: Date; endExclusiveUtc: Date } {
	const todayDateKey = toDateKeyInTimeZone(new Date(), timeZone);
	return buildUtcBoundsForDateKey(todayDateKey, timeZone);
}

/**
 * Extracts local weekday and time parts for a UTC instant in an organization timezone.
 *
 * @param timestamp - UTC instant
 * @param timeZone - IANA timezone
 * @returns Local weekday/hour/minute tuple
 */
function getLocalTimeParts(
	timestamp: Date,
	timeZone: string,
): { dayOfWeek: number; hour: number; minute: number } {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		weekday: 'short',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(timestamp);
	const weekday = parts.find((part) => part.type === 'weekday')?.value;
	const hour = parts.find((part) => part.type === 'hour')?.value;
	const minute = parts.find((part) => part.type === 'minute')?.value;

	if (!weekday || !hour || !minute) {
		throw new Error(`Failed to resolve local time parts for timezone "${timeZone}".`);
	}
	const dayOfWeek = WEEKDAY_INDEX_BY_SHORT_NAME[weekday];
	if (dayOfWeek === undefined) {
		throw new Error(`Unsupported weekday token "${weekday}" for timezone "${timeZone}".`);
	}

	return {
		dayOfWeek,
		hour: Number(hour),
		minute: Number(minute),
	};
}

/**
 * Converts an HH:MM[:SS] time string into minutes since midnight.
 *
 * @param timeValue - Time string from the schedule tables
 * @returns Minutes since midnight
 */
function toMinutesSinceMidnight(timeValue: string): number {
	const [hourPart, minutePart] = timeValue.split(':');
	if (hourPart === undefined || minutePart === undefined) {
		throw new Error(`Invalid time value "${timeValue}".`);
	}

	const hour = Number(hourPart);
	const minute = Number(minutePart);
	return hour * 60 + minute;
}

/**
 * Determines whether a CHECK_IN event is late relative to the employee schedule.
 *
 * @param args - Attendance event context and schedule map
 * @returns True when the event is late, otherwise false
 */
function resolveIsLate(args: {
	employeeId: string;
	timestamp: Date;
	type: 'CHECK_IN' | 'CHECK_OUT' | 'CHECK_OUT_AUTHORIZED' | 'WORK_OFFSITE';
	timeZone: string;
	scheduleEntriesByEmployeeId: Map<string, Map<number, TimelineScheduleEntry>>;
}): boolean {
	if (args.type !== 'CHECK_IN') {
		return false;
	}

	const localTimeParts = getLocalTimeParts(args.timestamp, args.timeZone);
	const scheduleEntry = args.scheduleEntriesByEmployeeId
		.get(args.employeeId)
		?.get(localTimeParts.dayOfWeek);
	if (!scheduleEntry || !scheduleEntry.isWorkingDay) {
		return false;
	}

	const actualMinutes =
		localTimeParts.hour * 60 + localTimeParts.minute;
	const scheduledMinutes = toMinutesSinceMidnight(scheduleEntry.startTime);
	return actualMinutes > scheduledMinutes;
}

/**
 * Applies the dashboard timeline kind filter to an enriched attendance event.
 *
 * @param args - Event kind filter context
 * @returns True when the event should be included
 */
function matchesTimelineKind(args: {
	kind: TimelineKind;
	type: 'CHECK_IN' | 'CHECK_OUT' | 'CHECK_OUT_AUTHORIZED' | 'WORK_OFFSITE';
	isLate: boolean;
}): boolean {
	switch (args.kind) {
		case 'in':
			return args.type === 'CHECK_IN';
		case 'late':
			return args.isLate;
		case 'offsite':
			return args.type === 'WORK_OFFSITE';
		default:
			return true;
	}
}

/**
 * Pushes timeline type filtering into SQL when the filter does not depend on schedule enrichment.
 *
 * @param kind - Requested timeline filter
 * @returns SQL condition for attendance type when applicable
 */
function buildTimelineTypeCondition(kind: TimelineKind): SQL<unknown> | undefined {
	switch (kind) {
		case 'in':
		case 'late':
			return eq(attendanceRecord.type, 'CHECK_IN');
		case 'offsite':
			return eq(attendanceRecord.type, 'WORK_OFFSITE');
		default:
			return undefined;
	}
}

/**
 * Checks whether a date key is valid for new offsite registrations.
 *
 * @param dateKey - Date key to validate
 * @param timeZone - Organization timezone
 * @returns True when date key is within allowed creation window
 */
function isValidCreateWindow(dateKey: string, timeZone: string): boolean {
	const todayKey = toDateKeyInTimeZone(new Date(), timeZone);
	const earliestAllowedDateKey = addDaysToDateKey(todayKey, -OFFSITE_MAX_RETRO_DAYS);
	return dateKey >= earliestAllowedDateKey && dateKey <= todayKey;
}

/**
 * Checks whether an existing offsite record can be edited/deleted.
 *
 * @param dateKey - Existing offsite date key
 * @param timeZone - Organization timezone
 * @returns True when date key is still mutable
 */
function isWithinEditableWindow(dateKey: string, timeZone: string): boolean {
	const todayKey = toDateKeyInTimeZone(new Date(), timeZone);
	const earliestEditableDateKey = addDaysToDateKey(todayKey, -OFFSITE_MAX_RETRO_DAYS);
	return dateKey >= earliestEditableDateKey && dateKey <= todayKey;
}

/**
 * Detects whether the target date belongs to a processed payroll run.
 *
 * @param args - Organization/date context
 * @returns True when the date overlaps with a processed payroll period
 */
async function hasProcessedPayrollOverlap(args: {
	organizationId: string;
	dateKey: string;
	timeZone: string;
}): Promise<boolean> {
	const { startUtc, endExclusiveUtc } = buildUtcBoundsForDateKey(args.dateKey, args.timeZone);
	const overlaps = await db
		.select({ id: payrollRun.id })
		.from(payrollRun)
		.where(
			and(
				eq(payrollRun.organizationId, args.organizationId),
				eq(payrollRun.status, 'PROCESSED'),
				lte(payrollRun.periodStart, new Date(endExclusiveUtc.getTime() - 1)),
				gte(payrollRun.periodEnd, startUtc),
			),
		)
		.limit(1);
	return Boolean(overlaps[0]);
}

/**
 * Detects whether a database error is a unique-constraint violation for a target index.
 *
 * @param error - Unknown database error
 * @param constraintName - Constraint/index name
 * @returns True when the error matches a unique violation for the given constraint
 */
function isUniqueConstraintViolation(error: unknown, constraintName: string): boolean {
	if (!error || typeof error !== 'object') {
		return false;
	}

	const code = (error as { code?: unknown }).code;
	const constraint = (error as { constraint?: unknown }).constraint;
	return code === '23505' && constraint === constraintName;
}

/**
 * Validates offsite conflicts against check events, leaves, vacations, and incapacities.
 *
 * @param args - Conflict-check arguments
 * @returns Null when valid, otherwise user-facing error message
 */
async function validateOffsiteConflicts(args: {
	employeeId: string;
	organizationId: string;
	dateKey: string;
	timeZone: string;
	excludeAttendanceId?: string;
}): Promise<string | null> {
	const { startUtc, endExclusiveUtc } = buildUtcBoundsForDateKey(args.dateKey, args.timeZone);
	const excludingCurrent = args.excludeAttendanceId
		? ne(attendanceRecord.id, args.excludeAttendanceId)
		: undefined;

	const checkEventConditions: SQL<unknown>[] = [
		eq(attendanceRecord.employeeId, args.employeeId),
		gte(attendanceRecord.timestamp, startUtc),
		lt(attendanceRecord.timestamp, endExclusiveUtc),
		sql`${attendanceRecord.type} IN ('CHECK_IN', 'CHECK_OUT', 'CHECK_OUT_AUTHORIZED')`,
	];
	if (excludingCurrent) {
		checkEventConditions.push(excludingCurrent);
	}

	const checkEvents = await db
		.select({ id: attendanceRecord.id })
		.from(attendanceRecord)
		.where(and(...checkEventConditions))
		.limit(1);

	if (checkEvents[0]) {
		return 'Cannot register offsite attendance when check events already exist for that date.';
	}

	const dayOffRows = await db
		.select({ id: scheduleException.id })
		.from(scheduleException)
		.where(
			and(
				eq(scheduleException.employeeId, args.employeeId),
				eq(scheduleException.exceptionType, 'DAY_OFF'),
				gte(scheduleException.exceptionDate, startUtc),
				lt(scheduleException.exceptionDate, endExclusiveUtc),
			),
		)
		.limit(1);

	if (dayOffRows[0]) {
		return 'Cannot register offsite attendance on a date marked as day off/permission.';
	}

	const vacationRows = await db
		.select({ id: vacationRequestDay.id })
		.from(vacationRequestDay)
		.leftJoin(vacationRequest, eq(vacationRequestDay.requestId, vacationRequest.id))
		.where(
			and(
				eq(vacationRequestDay.employeeId, args.employeeId),
				eq(vacationRequestDay.dateKey, args.dateKey),
				eq(vacationRequestDay.countsAsVacationDay, true),
				eq(vacationRequest.organizationId, args.organizationId),
				eq(vacationRequest.status, 'APPROVED'),
			),
		)
		.limit(1);

	if (vacationRows[0]) {
		return 'Cannot register offsite attendance on a date with approved vacation.';
	}

	const incapacityRows = await db
		.select({ id: employeeIncapacity.id })
		.from(employeeIncapacity)
		.where(
			and(
				eq(employeeIncapacity.organizationId, args.organizationId),
				eq(employeeIncapacity.employeeId, args.employeeId),
				eq(employeeIncapacity.status, 'ACTIVE'),
				lte(employeeIncapacity.startDateKey, args.dateKey),
				gte(employeeIncapacity.endDateKey, args.dateKey),
			),
		)
		.limit(1);

	if (incapacityRows[0]) {
		return 'Cannot register offsite attendance on a date with active incapacity.';
	}

	return null;
}

/**
 * Checks whether an employee already has a WORK_OFFSITE record for a date key.
 *
 * @param args - Employee/date context
 * @returns True when an offsite record already exists
 */
async function hasOffsiteRecordForDate(args: {
	employeeId: string;
	dateKey: string;
	excludeAttendanceId?: string;
}): Promise<boolean> {
	const conditions: SQL<unknown>[] = [
		eq(attendanceRecord.employeeId, args.employeeId),
		eq(attendanceRecord.type, 'WORK_OFFSITE'),
		eq(attendanceRecord.offsiteDateKey, args.dateKey),
	];
	if (args.excludeAttendanceId) {
		conditions.push(ne(attendanceRecord.id, args.excludeAttendanceId));
	}

	const offsiteRows = await db
		.select({ id: attendanceRecord.id })
		.from(attendanceRecord)
		.where(and(...conditions))
		.limit(1);
	return Boolean(offsiteRows[0]);
}

/**
 * Resolves or creates a virtual RH device for offsite manual records.
 *
 * @param organizationId - Organization identifier
 * @returns Device id
 */
async function getOrCreateOffsiteVirtualDevice(organizationId: string): Promise<string> {
	const code = buildOffsiteVirtualDeviceCode(organizationId);
	const existing = await db
		.select({ id: device.id })
		.from(device)
		.where(and(eq(device.organizationId, organizationId), eq(device.code, code)))
		.limit(1)
		.then((rows) => rows[0]);
	if (existing) {
		return existing.id;
	}

	const candidateId = crypto.randomUUID();
	await db
		.insert(device)
		.values({
			id: candidateId,
			code,
			name: 'Registro RH Fuera de oficina',
			deviceType: 'VIRTUAL_RH_OFFSITE',
			status: 'ONLINE',
			locationId: null,
			organizationId,
		})
		.onConflictDoNothing({
			target: device.code,
		});

	const resolved = await db
		.select({ id: device.id })
		.from(device)
		.where(and(eq(device.organizationId, organizationId), eq(device.code, code)))
		.limit(1)
		.then((rows) => rows[0]);
	if (!resolved) {
		throw new Error('Unable to resolve offsite virtual device');
	}

	return resolved.id;
}

/**
 * Loads an attendance record joined with employee organization context.
 *
 * @param id - Attendance id
 * @returns Joined record or null
 */
async function getAttendanceRecordById(id: string): Promise<{
	id: string;
	employeeId: string;
	employeeFirstName: string | null;
	employeeLastName: string | null;
	deviceId: string;
	deviceLocationId: string | null;
	deviceLocationName: string | null;
	timestamp: Date;
	type: 'CHECK_IN' | 'CHECK_OUT' | 'CHECK_OUT_AUTHORIZED' | 'WORK_OFFSITE';
	checkOutReason: 'REGULAR' | 'LUNCH_BREAK' | 'PERSONAL' | null;
	offsiteDateKey: string | null;
	offsiteDayKind: 'LABORABLE' | 'NO_LABORABLE' | null;
	offsiteReason: string | null;
	offsiteCreatedByUserId: string | null;
	offsiteUpdatedByUserId: string | null;
	offsiteUpdatedAt: Date | null;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
	updatedAt: Date;
	employeeOrgId: string | null;
} | null> {
	const rows = await db
		.select({
			id: attendanceRecord.id,
			employeeId: attendanceRecord.employeeId,
			employeeFirstName: employee.firstName,
			employeeLastName: employee.lastName,
			deviceId: attendanceRecord.deviceId,
			deviceLocationId: device.locationId,
			deviceLocationName: location.name,
			timestamp: attendanceRecord.timestamp,
			type: attendanceRecord.type,
			checkOutReason: attendanceRecord.checkOutReason,
			offsiteDateKey: attendanceRecord.offsiteDateKey,
			offsiteDayKind: attendanceRecord.offsiteDayKind,
			offsiteReason: attendanceRecord.offsiteReason,
			offsiteCreatedByUserId: attendanceRecord.offsiteCreatedByUserId,
			offsiteUpdatedByUserId: attendanceRecord.offsiteUpdatedByUserId,
			offsiteUpdatedAt: attendanceRecord.offsiteUpdatedAt,
			metadata: attendanceRecord.metadata,
			createdAt: attendanceRecord.createdAt,
			updatedAt: attendanceRecord.updatedAt,
			employeeOrgId: employee.organizationId,
		})
		.from(attendanceRecord)
		.innerJoin(employee, eq(attendanceRecord.employeeId, employee.id))
		.innerJoin(device, eq(attendanceRecord.deviceId, device.id))
		.leftJoin(location, eq(device.locationId, location.id))
		.where(eq(attendanceRecord.id, id))
		.limit(1);

	return rows[0] ?? null;
}

export const attendanceRoutes = new Elysia({ prefix: '/attendance' })
	.use(combinedAuthPlugin)
	/**
	 * List attendance records with pagination and optional filters.
	 *
	 * @route GET /attendance
	 * @param query.limit - Maximum number of results (default: 50)
	 * @param query.offset - Number of results to skip (default: 0)
	 * @param query.employeeId - Filter by employee ID (optional)
	 * @param query.deviceId - Filter by device ID (optional)
	 * @param query.type - Filter by attendance type (optional)
	 * @param query.fromDate - Filter records from this date (optional)
	 * @param query.toDate - Filter records until this date (optional)
	 * @param query.search - Search by employee ID (optional)
	 * @param query.deviceLocationId - Filter by device location ID (optional)
	 * @returns Array of attendance records with pagination info
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
				employeeId,
				deviceId,
				type,
				offsiteDayKind,
				fromDate,
				toDate,
				search,
				deviceLocationId,
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

			// Build conditions array
			const conditions: SQL<unknown>[] = [eq(employee.organizationId, organizationId)];
			if (employeeId) {
				conditions.push(eq(attendanceRecord.employeeId, employeeId));
			}
			if (deviceId) {
				conditions.push(eq(attendanceRecord.deviceId, deviceId));
			}
			if (type) {
				conditions.push(eq(attendanceRecord.type, type));
			}
			if (offsiteDayKind) {
				conditions.push(eq(attendanceRecord.offsiteDayKind, offsiteDayKind));
			}
			if (fromDate) {
				conditions.push(gte(attendanceRecord.timestamp, fromDate));
			}
			if (toDate) {
				conditions.push(lte(attendanceRecord.timestamp, toDate));
			}
			if (deviceLocationId) {
				conditions.push(eq(device.locationId, deviceLocationId));
			}
			const normalizedSearch = search?.trim();
			if (normalizedSearch) {
				conditions.push(ilike(attendanceRecord.employeeId, `%${normalizedSearch}%`));
			}

			let baseQuery = db
				.select({
					id: attendanceRecord.id,
					employeeId: attendanceRecord.employeeId,
					employeeFirstName: employee.firstName,
					employeeLastName: employee.lastName,
					deviceId: attendanceRecord.deviceId,
					deviceLocationId: device.locationId,
					deviceLocationName: location.name,
					timestamp: attendanceRecord.timestamp,
					type: attendanceRecord.type,
					checkOutReason: attendanceRecord.checkOutReason,
					offsiteDateKey: attendanceRecord.offsiteDateKey,
					offsiteDayKind: attendanceRecord.offsiteDayKind,
					offsiteReason: attendanceRecord.offsiteReason,
					offsiteCreatedByUserId: attendanceRecord.offsiteCreatedByUserId,
					offsiteUpdatedByUserId: attendanceRecord.offsiteUpdatedByUserId,
					offsiteUpdatedAt: attendanceRecord.offsiteUpdatedAt,
					metadata: attendanceRecord.metadata,
					createdAt: attendanceRecord.createdAt,
					updatedAt: attendanceRecord.updatedAt,
				})
				.from(attendanceRecord)
				.innerJoin(employee, eq(attendanceRecord.employeeId, employee.id))
				.innerJoin(device, eq(attendanceRecord.deviceId, device.id))
				.leftJoin(location, eq(device.locationId, location.id));

			if (conditions.length > 0) {
				baseQuery = baseQuery.where(and(...conditions)) as typeof baseQuery;
			}

			const results = await baseQuery
				.limit(limit)
				.offset(offset)
				.orderBy(attendanceRecord.timestamp);

			const formattedResults = results.map(
				({ employeeFirstName, employeeLastName, ...rest }) => ({
					...rest,
					employeeName: `${employeeFirstName ?? ''} ${employeeLastName ?? ''}`
						.trim()
						.replace(/\s+/g, ' '),
				}),
			);

			// Get total count with same filters
			let countQuery = db
				.select({
					id: attendanceRecord.id,
				})
				.from(attendanceRecord)
				.innerJoin(employee, eq(attendanceRecord.employeeId, employee.id))
				.innerJoin(device, eq(attendanceRecord.deviceId, device.id));
			if (conditions.length > 0) {
				countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
			}
			const countResult = await countQuery;
			const total = countResult.length;

			return {
				data: formattedResults,
				pagination: {
					total,
					limit,
					offset,
					hasMore: offset + results.length < total,
				},
			};
		},
		{
			query: attendanceQuerySchema,
		},
	)

	/**
	 * Get today's WORK_OFFSITE records for dashboard monitoring.
	 *
	 * @route GET /attendance/offsite/today
	 * @param query.organizationId - Optional organization id
	 * @returns Date key, count and record list for today's offsite events
	 */
	.get(
		'/offsite/today',
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			set,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const { organizationId: organizationIdQuery } = query;
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

			const timeZone = await resolveOrganizationTimeZone(organizationId);
			const todayDateKey = toDateKeyInTimeZone(new Date(), timeZone);

			const results = await db
				.select({
					id: attendanceRecord.id,
					employeeId: attendanceRecord.employeeId,
					employeeFirstName: employee.firstName,
					employeeLastName: employee.lastName,
					deviceId: attendanceRecord.deviceId,
					deviceLocationId: device.locationId,
					deviceLocationName: location.name,
					timestamp: attendanceRecord.timestamp,
					type: attendanceRecord.type,
					checkOutReason: attendanceRecord.checkOutReason,
					offsiteDateKey: attendanceRecord.offsiteDateKey,
					offsiteDayKind: attendanceRecord.offsiteDayKind,
					offsiteReason: attendanceRecord.offsiteReason,
					offsiteCreatedByUserId: attendanceRecord.offsiteCreatedByUserId,
					offsiteUpdatedByUserId: attendanceRecord.offsiteUpdatedByUserId,
					offsiteUpdatedAt: attendanceRecord.offsiteUpdatedAt,
					metadata: attendanceRecord.metadata,
					createdAt: attendanceRecord.createdAt,
					updatedAt: attendanceRecord.updatedAt,
				})
				.from(attendanceRecord)
				.innerJoin(employee, eq(attendanceRecord.employeeId, employee.id))
				.innerJoin(device, eq(attendanceRecord.deviceId, device.id))
				.leftJoin(location, eq(device.locationId, location.id))
				.where(
					and(
						eq(employee.organizationId, organizationId),
						eq(attendanceRecord.type, 'WORK_OFFSITE'),
						eq(attendanceRecord.offsiteDateKey, todayDateKey),
					),
				)
				.orderBy(employee.firstName, employee.lastName);

			const formattedResults = results.map(
				({ employeeFirstName, employeeLastName, ...rest }) => ({
					...rest,
					employeeName: `${employeeFirstName ?? ''} ${employeeLastName ?? ''}`
						.trim()
						.replace(/\s+/g, ' '),
				}),
			);

			return {
				dateKey: todayDateKey,
				count: formattedResults.length,
				data: formattedResults,
			};
		},
		{
			query: attendanceOffsiteTodayQuerySchema,
		},
	)

	/**
	 * Get latest "present" attendance records per employee for a date range.
	 *
	 * Returns the most recent event within the provided range for each employee,
	 * filtered to only those whose latest event is CHECK_IN.
	 *
	 * @route GET /attendance/present
	 * @param query.fromDate - Start date for filtering records (required)
	 * @param query.toDate - End date for filtering records (required)
	 * @param query.organizationId - Filter by organization ID (optional)
	 * @returns Array of present attendance entries grouped by employee
	 */
	.get(
		'/present',
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			set,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const { fromDate, toDate, organizationId: organizationIdQuery } = query;

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

			const rangeConditions: SQL<unknown>[] = [
				eq(employee.organizationId, organizationId),
				gte(attendanceRecord.timestamp, fromDate),
				lte(attendanceRecord.timestamp, toDate),
			];

			const latestAttendance = db
				.select({
					employeeId: attendanceRecord.employeeId,
					lastTimestamp: sql<Date>`max(${attendanceRecord.timestamp})`.as(
						'lastTimestamp',
					),
				})
				.from(attendanceRecord)
				.innerJoin(employee, eq(attendanceRecord.employeeId, employee.id))
				.where(and(...rangeConditions))
				.groupBy(attendanceRecord.employeeId)
				.as('latest_attendance');

			const results = await db
				.select({
					employeeId: attendanceRecord.employeeId,
					employeeFirstName: employee.firstName,
					employeeLastName: employee.lastName,
					employeeCode: employee.code,
					deviceId: attendanceRecord.deviceId,
					locationId: device.locationId,
					locationName: location.name,
					checkedInAt: attendanceRecord.timestamp,
				})
				.from(attendanceRecord)
				.innerJoin(
					latestAttendance,
					and(
						eq(attendanceRecord.employeeId, latestAttendance.employeeId),
						eq(attendanceRecord.timestamp, latestAttendance.lastTimestamp),
					),
				)
				.innerJoin(employee, eq(attendanceRecord.employeeId, employee.id))
				.innerJoin(device, eq(attendanceRecord.deviceId, device.id))
				.leftJoin(location, eq(device.locationId, location.id))
				.where(eq(attendanceRecord.type, 'CHECK_IN'))
				.orderBy(attendanceRecord.timestamp);

			const formattedResults = results.map(
				({ employeeFirstName, employeeLastName, ...rest }) => ({
					...rest,
					employeeName: `${employeeFirstName ?? ''} ${employeeLastName ?? ''}`
						.trim()
						.replace(/\s+/g, ' '),
				}),
			);

			return {
				data: formattedResults,
			};
		},
		{
			query: attendancePresentQuerySchema,
		},
	)

	/**
	 * Returns a real-time timeline of attendance activity for the dashboard.
	 *
	 * @route GET /attendance/timeline
	 * @param query.fromDate - Optional UTC lower bound
	 * @param query.toDate - Optional UTC upper bound
	 * @param query.limit - Maximum records after filtering
	 * @param query.offset - Offset after filtering
	 * @param query.kind - Optional dashboard filter kind
	 * @returns Timeline rows plus pagination metadata
	 */
	.get(
		'/timeline',
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			set,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const { fromDate, toDate, limit, offset, kind } = query;

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

			const timeZone = await resolveOrganizationTimeZone(organizationId);
			const defaultBounds = buildDefaultTodayBounds(timeZone);
			const startBound = fromDate ?? defaultBounds.startUtc;
			const endBound = toDate ?? new Date(defaultBounds.endExclusiveUtc.getTime() - 1);

			const timelineConditions: SQL<unknown>[] = [
				eq(employee.organizationId, organizationId),
				gte(attendanceRecord.timestamp, startBound),
				lte(attendanceRecord.timestamp, endBound),
			];
			const timelineTypeCondition = buildTimelineTypeCondition(kind);
			if (timelineTypeCondition) {
				timelineConditions.push(timelineTypeCondition);
			}
			const shouldPaginateInSql = kind !== 'late';

			const rows = shouldPaginateInSql
				? await db
						.select({
							id: attendanceRecord.id,
							employeeId: attendanceRecord.employeeId,
							employeeFirstName: employee.firstName,
							employeeLastName: employee.lastName,
							employeeCode: employee.code,
							locationId: employee.locationId,
							locationName: location.name,
							timestamp: attendanceRecord.timestamp,
							type: attendanceRecord.type,
						})
						.from(attendanceRecord)
						.innerJoin(employee, eq(attendanceRecord.employeeId, employee.id))
						.leftJoin(location, eq(employee.locationId, location.id))
						.where(and(...timelineConditions))
						.orderBy(desc(attendanceRecord.timestamp))
						.limit(limit)
						.offset(offset)
				: await db
						.select({
							id: attendanceRecord.id,
							employeeId: attendanceRecord.employeeId,
							employeeFirstName: employee.firstName,
							employeeLastName: employee.lastName,
							employeeCode: employee.code,
							locationId: employee.locationId,
							locationName: location.name,
							timestamp: attendanceRecord.timestamp,
							type: attendanceRecord.type,
						})
						.from(attendanceRecord)
						.innerJoin(employee, eq(attendanceRecord.employeeId, employee.id))
						.leftJoin(location, eq(employee.locationId, location.id))
						.where(and(...timelineConditions))
						.orderBy(desc(attendanceRecord.timestamp));
			const lateCountRows = shouldPaginateInSql
				? await db
						.select({
							employeeId: attendanceRecord.employeeId,
							timestamp: attendanceRecord.timestamp,
							type: attendanceRecord.type,
						})
						.from(attendanceRecord)
						.innerJoin(employee, eq(attendanceRecord.employeeId, employee.id))
						.where(
							and(
								eq(employee.organizationId, organizationId),
								gte(attendanceRecord.timestamp, startBound),
								lte(attendanceRecord.timestamp, endBound),
								eq(attendanceRecord.type, 'CHECK_IN'),
							),
						)
				: rows;

			const employeeIds = Array.from(
				new Set([
					...rows.map((row) => row.employeeId),
					...lateCountRows.map((row) => row.employeeId),
				]),
			);
			const scheduleRows =
				employeeIds.length > 0
					? await db
							.select({
								employeeId: employeeSchedule.employeeId,
								dayOfWeek: employeeSchedule.dayOfWeek,
								startTime: employeeSchedule.startTime,
								isWorkingDay: employeeSchedule.isWorkingDay,
							})
							.from(employeeSchedule)
							.where(inArray(employeeSchedule.employeeId, employeeIds))
					: [];

			const scheduleEntriesByEmployeeId = new Map<
				string,
				Map<number, TimelineScheduleEntry>
			>();
			for (const row of scheduleRows) {
				const scheduleByDay =
					scheduleEntriesByEmployeeId.get(row.employeeId) ??
					new Map<number, TimelineScheduleEntry>();
				scheduleByDay.set(row.dayOfWeek, {
					dayOfWeek: row.dayOfWeek,
					startTime: row.startTime,
					isWorkingDay: row.isWorkingDay,
				});
				scheduleEntriesByEmployeeId.set(row.employeeId, scheduleByDay);
			}

			const enrichedRows = rows
				.map((row) => {
					const employeeName = `${row.employeeFirstName ?? ''} ${row.employeeLastName ?? ''}`
						.trim()
						.replace(/\s+/g, ' ');
					const isLate = resolveIsLate({
						employeeId: row.employeeId,
						timestamp: row.timestamp,
						type: row.type,
						timeZone,
						scheduleEntriesByEmployeeId,
					});

					return {
						id: row.id,
						employeeId: row.employeeId,
						employeeName,
						employeeCode: row.employeeCode,
						locationId: row.locationId,
						locationName: row.locationName,
						timestamp: row.timestamp,
						type: row.type,
						isLate,
					};
				})
				.filter((row) =>
					shouldPaginateInSql
						? true
						: matchesTimelineKind({
								kind,
								type: row.type,
								isLate: row.isLate,
							}),
				);
			const totalCount = shouldPaginateInSql
				? (await db
						.select({ count: count() })
						.from(attendanceRecord)
						.innerJoin(employee, eq(attendanceRecord.employeeId, employee.id))
						.where(and(...timelineConditions)))[0]?.count ?? 0
				: enrichedRows.length;
			const lateTotal = shouldPaginateInSql
				? lateCountRows.filter((row) =>
						resolveIsLate({
							employeeId: row.employeeId,
							timestamp: row.timestamp,
							type: row.type,
							timeZone,
							scheduleEntriesByEmployeeId,
						}),
					).length
				: totalCount;
			const paginatedRows = shouldPaginateInSql
				? enrichedRows
				: enrichedRows.slice(offset, offset + limit);

			return {
				data: paginatedRows,
				pagination: {
					total: totalCount,
					limit,
					offset,
					hasMore: offset + paginatedRows.length < totalCount,
				},
				summary: {
					lateTotal,
				},
			};
		},
		{
			query: attendanceTimelineQuerySchema,
		},
	)

	/**
	 * Returns check-in counts bucketed by local hour for a dashboard date.
	 *
	 * @route GET /attendance/hourly
	 * @param query.date - Local date key (YYYY-MM-DD)
	 * @returns Hour buckets from 0 to 23
	 */
	.get(
		'/hourly',
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			set,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const { date } = query;

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

			const timeZone = await resolveOrganizationTimeZone(organizationId);
			const dateKey = date ?? toDateKeyInTimeZone(new Date(), timeZone);
			const { startUtc, endExclusiveUtc } = buildUtcBoundsForDateKey(dateKey, timeZone);

			const localHourSql = sql<number>`CAST(EXTRACT(HOUR FROM (${attendanceRecord.timestamp} AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}) AS integer)`;
			const aggregatedRows = await db
				.select({
					hour: localHourSql,
					count: sql<number>`CAST(COUNT(*) AS integer)`,
				})
				.from(attendanceRecord)
				.innerJoin(employee, eq(attendanceRecord.employeeId, employee.id))
				.where(
					and(
						eq(employee.organizationId, organizationId),
						eq(attendanceRecord.type, 'CHECK_IN'),
						gte(attendanceRecord.timestamp, startUtc),
						lt(attendanceRecord.timestamp, endExclusiveUtc),
					),
				)
				.groupBy(sql.raw('1'))
				.orderBy(sql.raw('1'));

			const buckets = Array.from({ length: 24 }, (_, hour) => ({
				hour,
				count: 0,
			}));

			for (const row of aggregatedRows) {
				if (row.hour >= 0 && row.hour <= 23) {
					buckets[row.hour]!.count = row.count;
				}
			}

			return {
				data: buckets,
				date: dateKey,
			};
		},
		{
			query: attendanceHourlyQuerySchema,
		},
	)

	/**
	 * Updates an existing WORK_OFFSITE attendance record.
	 *
	 * @route PUT /attendance/:id/offsite
	 * @param id - Attendance record UUID
	 * @returns Updated attendance record
	 */
	.put(
		'/:id/offsite',
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
			const record = await getAttendanceRecordById(id);
			if (!record) {
				set.status = 404;
				return buildErrorResponse('Attendance record not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					record.employeeOrgId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this attendance record', 403);
			}

			if (record.type !== 'WORK_OFFSITE') {
				set.status = 400;
				return buildErrorResponse('Only WORK_OFFSITE records can be updated here', 400);
			}

			if (!record.employeeOrgId) {
				set.status = 400;
				return buildErrorResponse('Attendance organization context is required', 400);
			}

			const canManageOffsite = await ensureAdminRole(
				{ authType, session, organizationId: record.employeeOrgId },
				set,
			);
			if (!canManageOffsite) {
				return buildErrorResponse('Only owner/admin can manage offsite attendance', 403);
			}
			const sessionUserId = session?.userId;
			if (!sessionUserId) {
				set.status = 403;
				return buildErrorResponse('Only owner/admin can manage offsite attendance', 403);
			}

			const existingDateKey = record.offsiteDateKey;
			if (!existingDateKey) {
				set.status = 400;
				return buildErrorResponse('Offsite record is missing date key', 400);
			}

			const timeZone = await resolveOrganizationTimeZone(record.employeeOrgId);
			if (!isWithinEditableWindow(existingDateKey, timeZone)) {
				set.status = 409;
				return buildErrorResponse('Offsite record is outside editable window', 409);
			}

			try {
				parseDateKey(body.offsiteDateKey);
			} catch {
				set.status = 400;
				return buildErrorResponse('Invalid offsite date key', 400);
			}

			if (!isValidCreateWindow(body.offsiteDateKey, timeZone)) {
				set.status = 400;
				return buildErrorResponse(
					'Offsite date is outside the allowed retroactive window',
					400,
				);
			}

			const [currentDateHasProcessed, nextDateHasProcessed] = await Promise.all([
				hasProcessedPayrollOverlap({
					organizationId: record.employeeOrgId,
					dateKey: existingDateKey,
					timeZone,
				}),
				hasProcessedPayrollOverlap({
					organizationId: record.employeeOrgId,
					dateKey: body.offsiteDateKey,
					timeZone,
				}),
			]);

			if (currentDateHasProcessed || nextDateHasProcessed) {
				set.status = 409;
				return buildErrorResponse(
					'Cannot edit offsite attendance in a processed payroll period',
					409,
				);
			}

			const duplicateRows = await db
				.select({ id: attendanceRecord.id })
				.from(attendanceRecord)
				.where(
					and(
						eq(attendanceRecord.employeeId, record.employeeId),
						eq(attendanceRecord.type, 'WORK_OFFSITE'),
						eq(attendanceRecord.offsiteDateKey, body.offsiteDateKey),
						ne(attendanceRecord.id, record.id),
					),
				)
				.limit(1);
			if (duplicateRows[0]) {
				set.status = 409;
				return buildErrorResponse(
					'An offsite attendance record already exists for that date',
					409,
				);
			}

			const conflictMessage = await validateOffsiteConflicts({
				employeeId: record.employeeId,
				organizationId: record.employeeOrgId,
				dateKey: body.offsiteDateKey,
				timeZone,
				excludeAttendanceId: record.id,
			});
			if (conflictMessage) {
				set.status = 409;
				return buildErrorResponse(conflictMessage, 409);
			}

			const normalizedTimestamp = getUtcDateForZonedMidnight(body.offsiteDateKey, timeZone);
			const now = new Date();

			try {
				await db
					.update(attendanceRecord)
					.set({
						timestamp: normalizedTimestamp,
						offsiteDateKey: body.offsiteDateKey,
						offsiteDayKind: body.offsiteDayKind,
						offsiteReason: body.offsiteReason,
						offsiteUpdatedByUserId: sessionUserId,
						offsiteUpdatedAt: now,
					})
					.where(eq(attendanceRecord.id, record.id));
			} catch (error) {
				if (isUniqueConstraintViolation(error, OFFSITE_EMPLOYEE_DATE_UNIQUE_INDEX)) {
					set.status = 409;
					return buildErrorResponse(
						'An offsite attendance record already exists for that date',
						409,
					);
				}
				throw error;
			}

			const updatedRecord = await getAttendanceRecordById(record.id);
			if (!updatedRecord) {
				set.status = 404;
				return buildErrorResponse('Attendance record not found', 404);
			}

			const { employeeOrgId, employeeFirstName, employeeLastName, ...rest } = updatedRecord;
			void employeeOrgId;
			return {
				data: {
					...rest,
					employeeName: `${employeeFirstName ?? ''} ${employeeLastName ?? ''}`
						.trim()
						.replace(/\s+/g, ' '),
				},
			};
		},
		{
			params: idParamSchema,
			body: updateOffsiteAttendanceSchema,
		},
	)

	/**
	 * Deletes an existing WORK_OFFSITE attendance record.
	 *
	 * @route DELETE /attendance/:id/offsite
	 * @param id - Attendance record UUID
	 * @returns Deletion confirmation payload
	 */
	.delete(
		'/:id/offsite',
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;
			const record = await getAttendanceRecordById(id);
			if (!record) {
				set.status = 404;
				return buildErrorResponse('Attendance record not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					record.employeeOrgId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this attendance record', 403);
			}

			if (record.type !== 'WORK_OFFSITE') {
				set.status = 400;
				return buildErrorResponse('Only WORK_OFFSITE records can be deleted here', 400);
			}

			if (!record.employeeOrgId || !record.offsiteDateKey) {
				set.status = 400;
				return buildErrorResponse('Offsite record context is invalid', 400);
			}

			const canManageOffsite = await ensureAdminRole(
				{ authType, session, organizationId: record.employeeOrgId },
				set,
			);
			if (!canManageOffsite) {
				return buildErrorResponse('Only owner/admin can manage offsite attendance', 403);
			}

			const timeZone = await resolveOrganizationTimeZone(record.employeeOrgId);
			if (!isWithinEditableWindow(record.offsiteDateKey, timeZone)) {
				set.status = 409;
				return buildErrorResponse('Offsite record is outside editable window', 409);
			}

			const hasProcessedPayroll = await hasProcessedPayrollOverlap({
				organizationId: record.employeeOrgId,
				dateKey: record.offsiteDateKey,
				timeZone,
			});
			if (hasProcessedPayroll) {
				set.status = 409;
				return buildErrorResponse(
					'Cannot delete offsite attendance in a processed payroll period',
					409,
				);
			}

			await db.delete(attendanceRecord).where(eq(attendanceRecord.id, record.id));
			return {
				data: {
					id: record.id,
					deleted: true,
				},
			};
		},
		{
			params: idParamSchema,
		},
	)

	/**
	 * Get a single attendance record by ID.
	 *
	 * @route GET /attendance/:id
	 * @param id - Attendance record UUID
	 * @returns Attendance record or 404 error
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
			const record = await getAttendanceRecordById(id);
			if (!record) {
				set.status = 404;
				return buildErrorResponse('Attendance record not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					record.employeeOrgId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this attendance record', 403);
			}

			const {
				employeeOrgId: _employeeOrgId,
				employeeFirstName,
				employeeLastName,
				...rest
			} = record;
			void _employeeOrgId;

			return {
				data: {
					...rest,
					employeeName: `${employeeFirstName ?? ''} ${employeeLastName ?? ''}`
						.trim()
						.replace(/\s+/g, ' '),
				},
			};
		},
		{
			params: idParamSchema,
		},
	)

	/**
	 * Create a new attendance record.
	 *
	 * @route POST /attendance
	 * @param body.employeeId - Employee UUID
	 * @param body.deviceId - Device UUID
	 * @param body.timestamp - Record timestamp (defaults to now)
	 * @param body.type - CHECK_IN or CHECK_OUT
	 * @param body.metadata - Additional metadata (optional)
	 * @returns Created attendance record
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
				employeeId,
				deviceId,
				timestamp,
				type,
				checkOutReason,
				metadata,
				offsiteDateKey,
				offsiteDayKind,
				offsiteReason,
			} = body;
			const eventTimestamp = timestamp ?? new Date();

			// Verify employee exists
			const employeeExists = await db
				.select()
				.from(employee)
				.where(eq(employee.id, employeeId))
				.limit(1);
			const existingEmployee = employeeExists[0];
			if (!existingEmployee) {
				set.status = 400;
				return buildErrorResponse('Employee not found', 400);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					existingEmployee.organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse(
					'Employee does not belong to an allowed organization',
					403,
				);
			}

			if (type === 'WORK_OFFSITE') {
				if (authType !== 'session' || !session) {
					set.status = 403;
					return buildErrorResponse(
						'Offsite attendance can only be managed by authenticated sessions',
						403,
					);
				}

				if (existingEmployee.status !== 'ACTIVE') {
					set.status = 400;
					return buildErrorResponse(
						'Offsite attendance is only allowed for active employees',
						400,
					);
				}

				const organizationId = existingEmployee.organizationId;
				if (!organizationId) {
					set.status = 400;
					return buildErrorResponse('Employee organization is required', 400);
				}

				const canManageOffsite = await ensureAdminRole(
					{ authType, session, organizationId },
					set,
				);
				if (!canManageOffsite) {
					return buildErrorResponse(
						'Only owner/admin can manage offsite attendance',
						403,
					);
				}

				if (!offsiteDateKey || !offsiteDayKind || !offsiteReason) {
					set.status = 400;
					return buildErrorResponse('Missing required offsite payload fields', 400);
				}

				try {
					parseDateKey(offsiteDateKey);
				} catch {
					set.status = 400;
					return buildErrorResponse('Invalid offsite date key', 400);
				}

				const timeZone = await resolveOrganizationTimeZone(organizationId);
				if (!isValidCreateWindow(offsiteDateKey, timeZone)) {
					set.status = 400;
					return buildErrorResponse(
						'Offsite date is outside the allowed retroactive window',
						400,
					);
				}

				const hasProcessedPayroll = await hasProcessedPayrollOverlap({
					organizationId,
					dateKey: offsiteDateKey,
					timeZone,
				});
				if (hasProcessedPayroll) {
					set.status = 409;
					return buildErrorResponse(
						'Cannot register offsite attendance for a processed payroll period',
						409,
					);
				}

				const duplicateRows = await db
					.select({ id: attendanceRecord.id })
					.from(attendanceRecord)
					.where(
						and(
							eq(attendanceRecord.employeeId, employeeId),
							eq(attendanceRecord.type, 'WORK_OFFSITE'),
							eq(attendanceRecord.offsiteDateKey, offsiteDateKey),
						),
					)
					.limit(1);
				if (duplicateRows[0]) {
					set.status = 409;
					return buildErrorResponse(
						'An offsite attendance record already exists for that date',
						409,
					);
				}

				const conflictMessage = await validateOffsiteConflicts({
					employeeId,
					organizationId,
					dateKey: offsiteDateKey,
					timeZone,
				});
				if (conflictMessage) {
					set.status = 409;
					return buildErrorResponse(conflictMessage, 409);
				}

				const offsiteDeviceId = await getOrCreateOffsiteVirtualDevice(organizationId);
				const normalizedTimestamp = getUtcDateForZonedMidnight(offsiteDateKey, timeZone);
				const id = crypto.randomUUID();
				const now = new Date();

				const newRecord = {
					id,
					employeeId,
					deviceId: offsiteDeviceId,
					timestamp: normalizedTimestamp,
					type,
					offsiteDateKey,
					offsiteDayKind,
					offsiteReason,
					offsiteCreatedByUserId: session.userId,
					offsiteUpdatedByUserId: session.userId,
					offsiteUpdatedAt: now,
					metadata: metadata ?? null,
				};

				try {
					await db.insert(attendanceRecord).values(newRecord);
				} catch (error) {
					if (isUniqueConstraintViolation(error, OFFSITE_EMPLOYEE_DATE_UNIQUE_INDEX)) {
						set.status = 409;
						return buildErrorResponse(
							'An offsite attendance record already exists for that date',
							409,
						);
					}
					throw error;
				}
				set.status = 201;
				return {
					data: {
						...newRecord,
						createdAt: now,
						updatedAt: now,
						employeeName:
							`${existingEmployee.firstName ?? ''} ${existingEmployee.lastName ?? ''}`
								.trim()
								.replace(/\s+/g, ' '),
					},
				};
			}

			if (!deviceId) {
				set.status = 400;
				return buildErrorResponse('Device ID is required for attendance event', 400);
			}

			// Verify device exists
			const deviceExists = await db
				.select()
				.from(device)
				.where(eq(device.id, deviceId))
				.limit(1);
			const existingDevice = deviceExists[0];
			if (!existingDevice) {
				set.status = 400;
				return buildErrorResponse('Device not found', 400);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					existingDevice.organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse('Device does not belong to an allowed organization', 403);
			}

			const resolvedOrganizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId:
					existingEmployee.organizationId ?? existingDevice.organizationId ?? null,
			});

			if (!resolvedOrganizationId) {
				set.status = 403;
				return buildErrorResponse('Organization is required or not permitted', 403);
			}

			if (
				existingDevice.organizationId &&
				existingDevice.organizationId !== resolvedOrganizationId
			) {
				set.status = 403;
				return buildErrorResponse(
					'Device does not belong to the resolved organization',
					403,
				);
			}

			const employeeOrganizationId =
				existingEmployee.organizationId ?? resolvedOrganizationId;
			if (!employeeOrganizationId) {
				set.status = 400;
				return buildErrorResponse('Employee organization is required', 400);
			}

			const timeZone = await resolveOrganizationTimeZone(employeeOrganizationId);
			const recordDateKey = toDateKeyInTimeZone(eventTimestamp, timeZone);
			const hasOffsiteForDate = await hasOffsiteRecordForDate({
				employeeId,
				dateKey: recordDateKey,
			});
			if (hasOffsiteForDate) {
				set.status = 409;
				return buildErrorResponse(
					'Cannot register check punches when an offsite attendance record already exists for that date.',
					409,
				);
			}

			const id = crypto.randomUUID();

			const newRecord = {
				id,
				employeeId,
				deviceId: deviceId,
				timestamp: eventTimestamp,
				type,
				checkOutReason: checkOutReason ?? null,
				metadata: metadata ?? null,
			};

			await db.insert(attendanceRecord).values(newRecord);

			set.status = 201;
			return {
				data: {
					...newRecord,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			};
		},
		{
			body: createAttendanceSchema,
		},
	)

	/**
	 * Get today's attendance records for a specific employee.
	 *
	 * @route GET /attendance/employee/:employeeId/today
	 * @param employeeId - Employee UUID
	 * @returns Array of today's attendance records for the employee
	 */
	.get(
		'/employee/:employeeId/today',
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { employeeId } = params;

			// Verify employee exists
			const employeeExists = await db
				.select()
				.from(employee)
				.where(eq(employee.id, employeeId))
				.limit(1);
			const employeeRecord = employeeExists[0];
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

			const today = new Date();
			const dayStart = startOfDay(today);
			const dayEnd = endOfDay(today);

			const results = await db
				.select()
				.from(attendanceRecord)
				.where(
					and(
						eq(attendanceRecord.employeeId, employeeId),
						gte(attendanceRecord.timestamp, dayStart),
						lte(attendanceRecord.timestamp, dayEnd),
					),
				)
				.orderBy(attendanceRecord.timestamp);

			return {
				data: results,
				date: today.toISOString().split('T')[0],
				employeeId,
			};
		},
		{
			params: employeeIdParamSchema,
		},
	);
