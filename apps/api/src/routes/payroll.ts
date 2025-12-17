import { Elysia } from 'elysia';
import crypto from 'node:crypto';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { addDays, differenceInMinutes, isAfter, isBefore } from 'date-fns';

import db from '../db/index.js';
import {
	attendanceRecord,
	employee,
	employeeSchedule,
	jobPosition,
	location,
	payrollRun,
	payrollRunEmployee,
	payrollSetting,
} from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { resolveOrganizationId } from '../utils/organization.js';
import {
	payrollCalculateSchema,
	payrollProcessSchema,
	payrollRunQuerySchema,
} from '../schemas/payroll.js';
import {
	MINIMUM_WAGES,
	OVERTIME_LIMITS,
	SHIFT_LIMITS,
	SUNDAY_PREMIUM_RATE,
} from '../utils/mexico-labor-constants.js';
import { addDaysToDateKey } from '../utils/date-key.js';
import { getMexicoMandatoryRestDayKeysForYear } from '../utils/mexico-mandatory-rest-days.js';
import {
	getUtcDateForZonedMidnight,
	isValidIanaTimeZone,
	toDateKeyInTimeZone,
} from '../utils/time-zone.js';

type AttendanceRow = {
	employeeId: string;
	timestamp: Date;
	type: 'CHECK_IN' | 'CHECK_OUT';
};

type EmployeeAttendanceRow = {
	timestamp: Date;
	type: 'CHECK_IN' | 'CHECK_OUT';
};

type ScheduleRow = {
	employeeId: string;
	dayOfWeek: number;
	startTime: string;
	endTime: string;
	isWorkingDay: boolean;
};

type PayrollCalculationRow = {
	employeeId: string;
	name: string;
	shiftType: 'DIURNA' | 'NOCTURNA' | 'MIXTA';
	dailyPay: number;
	hourlyPay: number;
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	hoursWorked: number;
	expectedHours: number;
	normalHours: number;
	overtimeDoubleHours: number;
	overtimeTripleHours: number;
	sundayHoursWorked: number;
	mandatoryRestDaysWorkedCount: number;
	normalPay: number;
	overtimeDoublePay: number;
	overtimeTriplePay: number;
	sundayPremiumAmount: number;
	mandatoryRestDayPremiumAmount: number;
	totalPay: number;
	warnings: {
		type:
			| 'OVERTIME_DAILY_EXCEEDED'
			| 'OVERTIME_WEEKLY_EXCEEDED'
			| 'OVERTIME_WEEKLY_DAYS_EXCEEDED'
			| 'BELOW_MINIMUM_WAGE';
		message: string;
		severity: 'warning' | 'error';
	}[];
};

/**
 * Parses an HH:mm string into total minutes.
 *
 * @param timeString - Time string in HH:mm format
 * @returns Total minutes from midnight
 */
const parseTimeToMinutes = (timeString: string): number => {
	const [hours = 0, minutes = 0] = timeString.split(':').map(Number);
	return hours * 60 + minutes;
};

/**
 * Calculates expected hours for a period based on schedule entries.
 *
 * @param schedule - Weekly schedule entries
 * @param periodStartDateKey - Start date key (YYYY-MM-DD) of the period
 * @param periodEndDateKey - End date key (YYYY-MM-DD) of the period
 * @returns Expected hours in the period
 */
const calculateExpectedHours = (
	schedule: ScheduleRow[],
	periodStartDateKey: string,
	periodEndDateKey: string,
): number => {
	let minutes = 0;
	let currentKey = periodStartDateKey;
	for (let i = 0; i < 400 && currentKey <= periodEndDateKey; i += 1) {
		const dayDate = new Date(`${currentKey}T00:00:00Z`);
		const dayOfWeek = dayDate.getUTCDay();
		const entry = schedule.find((s) => s.dayOfWeek === dayOfWeek);
		if (!entry || !entry.isWorkingDay) {
			currentKey = addDaysToDateKey(currentKey, 1);
			continue;
		}
		const startMinutes = parseTimeToMinutes(entry.startTime);
		const endMinutes = parseTimeToMinutes(entry.endTime);
		if (endMinutes > startMinutes) {
			minutes += endMinutes - startMinutes;
		} else if (endMinutes < startMinutes) {
			// Overnight shift that crosses midnight (e.g., 22:00–06:00)
			const minutesUntilMidnight = 24 * 60 - startMinutes;
			minutes += minutesUntilMidnight + endMinutes;
		}
		currentKey = addDaysToDateKey(currentKey, 1);
	}
	return minutes / 60;
};

/**
 * Adds worked minutes from a UTC segment into a map grouped by local calendar day (YYYY-MM-DD).
 *
 * @param dayMinutes - Map of date key string to worked minutes
 * @param segmentStart - Segment start instant (UTC)
 * @param segmentEnd - Segment end instant (UTC)
 * @param timeZone - IANA timezone used to cut day boundaries
 * @returns Nothing
 */
const addWorkedMinutesByDateKey = (
	dayMinutes: Map<string, number>,
	segmentStart: Date,
	segmentEnd: Date,
	timeZone: string,
): void => {
	const resolvedTimeZone = isValidIanaTimeZone(timeZone) ? timeZone : 'UTC';
	if (!isAfter(segmentEnd, segmentStart)) {
		return;
	}

	let cursor = segmentStart;
	while (isAfter(segmentEnd, cursor)) {
		const currentDayKey = toDateKeyInTimeZone(cursor, resolvedTimeZone);
		const nextDayKey = addDaysToDateKey(currentDayKey, 1);
		const nextMidnight = getUtcDateForZonedMidnight(nextDayKey, resolvedTimeZone);
		const chunkEnd = isBefore(segmentEnd, nextMidnight) ? segmentEnd : nextMidnight;

		if (chunkEnd.getTime() === cursor.getTime()) {
			break;
		}

		const segmentMinutes = differenceInMinutes(chunkEnd, cursor);
		if (segmentMinutes > 0) {
			const current = dayMinutes.get(currentDayKey) ?? 0;
			dayMinutes.set(currentDayKey, current + segmentMinutes);
		}

		cursor = chunkEnd;
	}
};

/**
 * Computes the week start key (YYYY-MM-DD) for a given UTC day key.
 *
 * Weeks are cut using the configured `weekStartDay` (0 = Sunday … 6 = Saturday) and
 * UTC day boundaries. This is used to reset weekly overtime limits inside a pay period.
 *
 * @param dateKey - Date key in YYYY-MM-DD format (UTC)
 * @param weekStartDay - Week start day index (0=Sunday..6=Saturday)
 * @returns Week start date key in YYYY-MM-DD format (UTC)
 * @throws When `dateKey` is invalid or `weekStartDay` is outside 0..6
 */
const getWeekStartKey = (dateKey: string, weekStartDay: number): string => {
	if (!Number.isInteger(weekStartDay) || weekStartDay < 0 || weekStartDay > 6) {
		throw new Error(`Invalid weekStartDay "${weekStartDay}". Expected an integer 0..6.`);
	}

	const dayDate = new Date(`${dateKey}T00:00:00Z`);
	if (Number.isNaN(dayDate.getTime())) {
		throw new Error(`Invalid dateKey "${dateKey}". Expected format YYYY-MM-DD.`);
	}

	const dayOfWeek = dayDate.getUTCDay();
	const diff = (dayOfWeek - weekStartDay + 7) % 7;
	const weekStart = new Date(dayDate);
	weekStart.setUTCDate(weekStart.getUTCDate() - diff);
	return weekStart.toISOString().slice(0, 10);
};

/**
 * Calculates payroll for employees within the organization and period.
 *
 * @param args - Organization and period parameters
 * @returns Employees with hours/expected hours and total amount
 */
const calculatePayroll = async (args: {
	organizationId: string;
	periodStartDateKey: string;
	periodEndDateKey: string;
	paymentFrequency?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
}): Promise<{
	employees: PayrollCalculationRow[];
	totalAmount: number;
	overtimeEnforcement: 'WARN' | 'BLOCK';
	timeZone: string;
	periodStartUtc: Date;
	periodEndInclusiveUtc: Date;
	periodEndExclusiveUtc: Date;
}> => {
	const { organizationId, periodStartDateKey, periodEndDateKey, paymentFrequency } = args;

	const orgSettings = await db
		.select()
		.from(payrollSetting)
		.where(eq(payrollSetting.organizationId, organizationId))
		.limit(1);
	const overtimeEnforcement = orgSettings[0]?.overtimeEnforcement ?? 'WARN';
	const weekStartDay = orgSettings[0]?.weekStartDay ?? 1;
	const additionalMandatoryRestDays = orgSettings[0]?.additionalMandatoryRestDays ?? [];
	const additionalMandatoryRestDaySet = new Set<string>(additionalMandatoryRestDays);
	const resolvedTimeZone = orgSettings[0]?.timeZone ?? 'America/Mexico_City';
	const timeZone = isValidIanaTimeZone(resolvedTimeZone)
		? resolvedTimeZone
		: 'America/Mexico_City';

	const periodStartUtc = getUtcDateForZonedMidnight(periodStartDateKey, timeZone);
	const periodEndExclusiveUtc = getUtcDateForZonedMidnight(
		addDaysToDateKey(periodEndDateKey, 1),
		timeZone,
	);
	const periodEndInclusiveUtc = new Date(periodEndExclusiveUtc.getTime() - 1);

	const employees = await db
		.select({
			id: employee.id,
			firstName: employee.firstName,
			lastName: employee.lastName,
			jobPositionId: employee.jobPositionId,
			lastPayrollDate: employee.lastPayrollDate,
			dailyPay: jobPosition.dailyPay,
			paymentFrequency: jobPosition.paymentFrequency,
			shiftType: employee.shiftType,
			locationGeographicZone: location.geographicZone,
			locationTimeZone: location.timeZone,
		})
		.from(employee)
		.leftJoin(jobPosition, eq(employee.jobPositionId, jobPosition.id))
		.leftJoin(location, eq(employee.locationId, location.id))
		.where(eq(employee.organizationId, organizationId));

	const filteredEmployees = employees.filter((emp) => {
		if (paymentFrequency && emp.paymentFrequency !== paymentFrequency) {
			return false;
		}
		if (emp.lastPayrollDate && !isBefore(emp.lastPayrollDate, periodStartUtc)) {
			return false;
		}
		return true;
	});

	const employeeIds = filteredEmployees.map((emp) => emp.id);

	const schedules =
		employeeIds.length === 0
			? []
			: await db
					.select()
					.from(employeeSchedule)
					.where(inArray(employeeSchedule.employeeId, employeeIds));

	const scheduleMap = new Map<string, ScheduleRow[]>();
	for (const entry of schedules) {
		const current = scheduleMap.get(entry.employeeId) ?? [];
		current.push(entry as ScheduleRow);
		scheduleMap.set(entry.employeeId, current);
	}

	const attendanceRangeStart = addDays(periodStartUtc, -2);
	const attendanceRangeEnd = addDays(periodEndExclusiveUtc, 2);
	const attendanceRows: AttendanceRow[] =
		employeeIds.length === 0
			? []
			: await db
					.select({
						employeeId: attendanceRecord.employeeId,
						timestamp: attendanceRecord.timestamp,
						type: attendanceRecord.type,
					})
					.from(attendanceRecord)
					.where(
						and(
							inArray(attendanceRecord.employeeId, employeeIds),
							gte(attendanceRecord.timestamp, attendanceRangeStart),
							lte(attendanceRecord.timestamp, attendanceRangeEnd),
						),
					)
					.orderBy(attendanceRecord.employeeId, attendanceRecord.timestamp);

	const attendanceByEmployeeId = new Map<string, EmployeeAttendanceRow[]>();
	for (const row of attendanceRows) {
		const current = attendanceByEmployeeId.get(row.employeeId) ?? [];
		current.push({ timestamp: row.timestamp, type: row.type });
		attendanceByEmployeeId.set(row.employeeId, current);
	}

	const results: PayrollCalculationRow[] = [];
	let totalAmount = 0;

	const mandatoryRestDayCache = new Map<number, Set<string>>();

	/**
	 * Retrieves Mexico mandatory rest day keys for a year with caching (LFT Art. 74).
	 *
	 * @param year - Calendar year
	 * @returns Set of YYYY-MM-DD date keys
	 */
	const getMandatoryRestDayKeysForYearCached = (year: number): Set<string> => {
		const cached = mandatoryRestDayCache.get(year);
		if (cached) {
			return cached;
		}
		const keys = getMexicoMandatoryRestDayKeysForYear(year);
		mandatoryRestDayCache.set(year, keys);
		return keys;
	};

	for (const emp of filteredEmployees) {
		const attendance = attendanceByEmployeeId.get(emp.id) ?? [];

		const employeeTimeZoneCandidate = emp.locationTimeZone ?? timeZone;
		const employeeTimeZone = isValidIanaTimeZone(employeeTimeZoneCandidate)
			? employeeTimeZoneCandidate
			: timeZone;

		const shiftKey = (emp.shiftType ?? 'DIURNA') as keyof typeof SHIFT_LIMITS;
		const shiftLimits = SHIFT_LIMITS[shiftKey];

		const expectedHours = calculateExpectedHours(
			scheduleMap.get(emp.id) ?? [],
			periodStartDateKey,
			periodEndDateKey,
		);

		const calendarDayMinutes = new Map<string, number>();
		const workdayMinutes = new Map<
			string,
			{
				normalMinutes: number;
				overtimeMinutes: number;
			}
		>();
		let workedMinutesTotal = 0;

		const sortedAttendance = [...attendance].sort(
			(a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
		);
		let openCheckIn: Date | null = null;

		for (const record of sortedAttendance) {
			if (record.type === 'CHECK_IN') {
				openCheckIn = record.timestamp;
				continue;
			}

			if (record.type !== 'CHECK_OUT' || !openCheckIn) {
				continue;
			}

			const checkIn = openCheckIn;
			const checkOut = record.timestamp;
			openCheckIn = null;

			if (!isAfter(checkOut, checkIn)) {
				continue;
			}

			const segmentStart = isBefore(checkIn, periodStartUtc) ? periodStartUtc : checkIn;
			const segmentEnd = isAfter(checkOut, periodEndExclusiveUtc)
				? periodEndExclusiveUtc
				: checkOut;

			if (!isAfter(segmentEnd, segmentStart)) {
				continue;
			}

			addWorkedMinutesByDateKey(
				calendarDayMinutes,
				segmentStart,
				segmentEnd,
				employeeTimeZone,
			);

			const segmentMinutes = differenceInMinutes(segmentEnd, segmentStart);
			if (segmentMinutes <= 0) {
				continue;
			}

			workedMinutesTotal += segmentMinutes;

			const sessionTotalMinutes = differenceInMinutes(checkOut, checkIn);
			if (sessionTotalMinutes <= 0) {
				continue;
			}

			const dailyLimitMinutes = shiftLimits.dailyHours * 60;
			const sessionNormalMinutes = Math.min(sessionTotalMinutes, dailyLimitMinutes);
			const offsetMinutes = Math.max(0, differenceInMinutes(segmentStart, checkIn));
			const remainingNormalMinutes = sessionNormalMinutes - offsetMinutes;
			const normalSegmentMinutes =
				remainingNormalMinutes <= 0 ? 0 : Math.min(segmentMinutes, remainingNormalMinutes);
			const overtimeSegmentMinutes = Math.max(0, segmentMinutes - normalSegmentMinutes);

			const workdayKey = toDateKeyInTimeZone(checkIn, employeeTimeZone);
			const bucket = workdayMinutes.get(workdayKey) ?? {
				normalMinutes: 0,
				overtimeMinutes: 0,
			};
			bucket.normalMinutes += normalSegmentMinutes;
			bucket.overtimeMinutes += overtimeSegmentMinutes;
			workdayMinutes.set(workdayKey, bucket);
		}

		const hoursWorked = workedMinutesTotal / 60;

		type WeeklyOvertimeBucket = {
			normalMinutes: number;
			overtimeFromDailyMinutes: number;
			overtimeDayKeys: Set<string>;
		};

		const weeklyBuckets = new Map<string, WeeklyOvertimeBucket>();
		let sundayHoursWorked = 0;
		const sundayDateKeys = new Set<string>();
		const mandatoryRestDayDateKeys = new Set<string>();
		const warnings: PayrollCalculationRow['warnings'] = [];

		for (const [dateKey, minutes] of calendarDayMinutes.entries()) {
			if (minutes <= 0) {
				continue;
			}

			const dayDate = new Date(`${dateKey}T00:00:00Z`);
			const dayOfWeek = dayDate.getUTCDay();
			if (dayOfWeek === 0) {
				sundayHoursWorked += minutes / 60;
				sundayDateKeys.add(dateKey);
			}

			const year = dayDate.getUTCFullYear();
			const isMandatoryRestDay =
				additionalMandatoryRestDaySet.has(dateKey) ||
				getMandatoryRestDayKeysForYearCached(year).has(dateKey);
			if (isMandatoryRestDay) {
				mandatoryRestDayDateKeys.add(dateKey);
			}
		}

		for (const [workdayKey, bucket] of workdayMinutes.entries()) {
			const dayOvertimeHours = bucket.overtimeMinutes / 60;
			if (dayOvertimeHours > OVERTIME_LIMITS.MAX_DAILY_HOURS) {
				warnings.push({
					type: 'OVERTIME_DAILY_EXCEEDED',
					message: `Las horas extra del día exceden el máximo legal (${workdayKey}: ${dayOvertimeHours.toFixed(2)}h > ${OVERTIME_LIMITS.MAX_DAILY_HOURS}h).`,
					severity: overtimeEnforcement === 'BLOCK' ? 'error' : 'warning',
				});
			}

			const weekKey = getWeekStartKey(workdayKey, weekStartDay);
			const current = weeklyBuckets.get(weekKey) ?? {
				normalMinutes: 0,
				overtimeFromDailyMinutes: 0,
				overtimeDayKeys: new Set<string>(),
			};
			current.normalMinutes += bucket.normalMinutes;
			current.overtimeFromDailyMinutes += bucket.overtimeMinutes;
			if (bucket.overtimeMinutes > 0) {
				current.overtimeDayKeys.add(workdayKey);
			}
			weeklyBuckets.set(weekKey, current);
		}

		const sundaysWorkedCount = sundayDateKeys.size;
		const mandatoryRestDaysWorkedCount = mandatoryRestDayDateKeys.size;

		let adjustedNormalHours = 0;
		let overtimeDoubleHours = 0;
		let overtimeTripleHours = 0;

		const sortedWeeks = Array.from(weeklyBuckets.entries()).sort(([a], [b]) =>
			a.localeCompare(b),
		);

		for (const [weekKey, bucket] of sortedWeeks) {
			const weeklyNormalExcessMinutes = Math.max(
				0,
				bucket.normalMinutes - shiftLimits.weeklyHours * 60,
			);
			const weekAdjustedNormalMinutes = bucket.normalMinutes - weeklyNormalExcessMinutes;
			const weekTotalOvertimeMinutes =
				bucket.overtimeFromDailyMinutes + weeklyNormalExcessMinutes;

			adjustedNormalHours += weekAdjustedNormalMinutes / 60;
			const doubleMinutes = Math.min(
				weekTotalOvertimeMinutes,
				OVERTIME_LIMITS.MAX_WEEKLY_HOURS * 60,
			);
			const tripleMinutes = Math.max(
				0,
				weekTotalOvertimeMinutes - OVERTIME_LIMITS.MAX_WEEKLY_HOURS * 60,
			);
			overtimeDoubleHours += doubleMinutes / 60;
			overtimeTripleHours += tripleMinutes / 60;

			const overtimeDays = bucket.overtimeDayKeys.size;
			if (overtimeDays > 3) {
				warnings.push({
					type: 'OVERTIME_WEEKLY_DAYS_EXCEEDED',
					message: `La frecuencia de horas extra excede el máximo semanal (semana ${weekKey}: ${overtimeDays} días > 3).`,
					severity: overtimeEnforcement === 'BLOCK' ? 'error' : 'warning',
				});
			}

			const weekTotalOvertimeHours = weekTotalOvertimeMinutes / 60;
			if (weekTotalOvertimeHours > OVERTIME_LIMITS.MAX_WEEKLY_HOURS) {
				warnings.push({
					type: 'OVERTIME_WEEKLY_EXCEEDED',
					message: `Las horas extra exceden el máximo legal semanal (semana ${weekKey}: ${weekTotalOvertimeHours.toFixed(2)}h > ${OVERTIME_LIMITS.MAX_WEEKLY_HOURS}h).`,
					severity: overtimeEnforcement === 'BLOCK' ? 'error' : 'warning',
				});
			}
		}

		const divisor = shiftLimits.divisor || 8;
		const effectiveDailyPay = Number(emp.dailyPay ?? 0);
		const hourlyRate = divisor > 0 ? effectiveDailyPay / divisor : 0;

		const normalPay = adjustedNormalHours * hourlyRate;
		const overtimeDoublePay =
			overtimeDoubleHours * hourlyRate * OVERTIME_LIMITS.DOUBLE_RATE_MULTIPLIER;
		const overtimeTriplePay =
			overtimeTripleHours * hourlyRate * OVERTIME_LIMITS.TRIPLE_RATE_MULTIPLIER;
		const sundayPremiumAmount =
			sundaysWorkedCount > 0
				? sundaysWorkedCount * effectiveDailyPay * SUNDAY_PREMIUM_RATE
				: 0;
		const mandatoryRestDayPremiumAmount =
			mandatoryRestDaysWorkedCount > 0
				? mandatoryRestDaysWorkedCount * effectiveDailyPay * 2
				: 0;

		const totalPay =
			normalPay +
			overtimeDoublePay +
			overtimeTriplePay +
			sundayPremiumAmount +
			mandatoryRestDayPremiumAmount;
		totalAmount += totalPay;

		const zone = (emp.locationGeographicZone ?? 'GENERAL') as keyof typeof MINIMUM_WAGES;
		if (effectiveDailyPay < MINIMUM_WAGES[zone]) {
			warnings.push({
				type: 'BELOW_MINIMUM_WAGE',
				message: `El salario diario ${effectiveDailyPay.toFixed(
					2,
				)} está por debajo del salario mínimo para ${zone} (${MINIMUM_WAGES[zone]}).`,
				severity: 'warning',
			});
		}

		results.push({
			employeeId: emp.id,
			name: `${emp.firstName} ${emp.lastName}`,
			shiftType: shiftKey,
			dailyPay: effectiveDailyPay,
			hourlyPay: hourlyRate,
			paymentFrequency: emp.paymentFrequency ?? 'MONTHLY',
			hoursWorked,
			expectedHours,
			normalHours: adjustedNormalHours,
			overtimeDoubleHours,
			overtimeTripleHours,
			sundayHoursWorked,
			mandatoryRestDaysWorkedCount,
			normalPay,
			overtimeDoublePay,
			overtimeTriplePay,
			sundayPremiumAmount,
			mandatoryRestDayPremiumAmount,
			totalPay,
			warnings,
		});
	}

	return {
		employees: results,
		totalAmount,
		overtimeEnforcement,
		timeZone,
		periodStartUtc,
		periodEndInclusiveUtc,
		periodEndExclusiveUtc,
	};
};

/**
 * Payroll routes for calculation and processing.
 */
export const payrollRoutes = new Elysia({ prefix: '/payroll' })
	.use(combinedAuthPlugin)
	/**
	 * Calculate payroll for a period (preview only).
	 */
	.post(
		'/calculate',
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
				requestedOrganizationId: body.organizationId ?? null,
			});

			if (!organizationId) {
				set.status = authType === 'apiKey' ? 403 : 400;
				return { error: 'Organization is required or not permitted' };
			}

			const { employees, totalAmount, overtimeEnforcement, timeZone } =
				await calculatePayroll({
					organizationId,
					periodStartDateKey: body.periodStartDateKey,
					periodEndDateKey: body.periodEndDateKey,
					paymentFrequency: body.paymentFrequency,
				});

			return {
				data: {
					employees,
					totalAmount,
					periodStartDateKey: body.periodStartDateKey,
					periodEndDateKey: body.periodEndDateKey,
					overtimeEnforcement,
					timeZone,
				},
			};
		},
		{
			body: payrollCalculateSchema,
		},
	)
	/**
	 * Process payroll (persist run, mark employees paid).
	 */
	.post(
		'/process',
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
				requestedOrganizationId: body.organizationId ?? null,
			});

			if (!organizationId) {
				set.status = authType === 'apiKey' ? 403 : 400;
				return { error: 'Organization is required or not permitted' };
			}

			const calculation = await calculatePayroll({
				organizationId,
				periodStartDateKey: body.periodStartDateKey,
				periodEndDateKey: body.periodEndDateKey,
				paymentFrequency: body.paymentFrequency,
			});

			const hasBlockingWarnings =
				calculation.overtimeEnforcement === 'BLOCK' &&
				calculation.employees.some((emp) =>
					emp.warnings.some((w) => w.severity === 'error'),
				);

			if (hasBlockingWarnings) {
				set.status = 400;
				return {
					error: 'Overtime limits exceeded. Resolve errors to process payroll.',
					data: calculation,
				};
			}

			const runResult = await db.transaction(async (tx) => {
				const runId = crypto.randomUUID();

				await tx.insert(payrollRun).values({
					id: runId,
					organizationId,
					periodStart: calculation.periodStartUtc,
					periodEnd: calculation.periodEndInclusiveUtc,
					paymentFrequency: body.paymentFrequency ?? 'MONTHLY',
					status: 'PROCESSED',
					totalAmount: calculation.totalAmount.toFixed(2),
					employeeCount: calculation.employees.length,
					processedAt: new Date(),
				});

				if (calculation.employees.length > 0) {
					const rows = calculation.employees.map((row) => ({
						payrollRunId: runId,
						employeeId: row.employeeId,
						hoursWorked: row.hoursWorked.toFixed(2),
						hourlyPay: row.hourlyPay.toFixed(2),
						totalPay: row.totalPay.toFixed(2),
						normalHours: row.normalHours.toFixed(2),
						normalPay: row.normalPay.toFixed(2),
						overtimeDoubleHours: row.overtimeDoubleHours.toFixed(2),
						overtimeDoublePay: row.overtimeDoublePay.toFixed(2),
						overtimeTripleHours: row.overtimeTripleHours.toFixed(2),
						overtimeTriplePay: row.overtimeTriplePay.toFixed(2),
						sundayPremiumAmount: row.sundayPremiumAmount.toFixed(2),
						mandatoryRestDayPremiumAmount: row.mandatoryRestDayPremiumAmount.toFixed(2),
						periodStart: calculation.periodStartUtc,
						periodEnd: calculation.periodEndInclusiveUtc,
					}));
					await tx.insert(payrollRunEmployee).values(rows);

					await tx
						.update(employee)
						.set({ lastPayrollDate: calculation.periodEndExclusiveUtc })
						.where(
							inArray(
								employee.id,
								calculation.employees.map((e) => e.employeeId),
							),
						);
				}

				const savedRun = await tx
					.select()
					.from(payrollRun)
					.where(eq(payrollRun.id, runId))
					.limit(1);

				return savedRun[0];
			});

			return { data: { run: runResult, calculation } };
		},
		{
			body: payrollProcessSchema,
		},
	)
	/**
	 * List payroll runs.
	 */
	.get(
		'/runs',
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
				set.status = authType === 'apiKey' ? 403 : 400;
				return { error: 'Organization is required or not permitted' };
			}

			const runs = await db
				.select()
				.from(payrollRun)
				.where(eq(payrollRun.organizationId, organizationId))
				.limit(query.limit)
				.offset(query.offset)
				.orderBy(payrollRun.createdAt);

			return { data: runs };
		},
		{
			query: payrollRunQuerySchema,
		},
	)
	/**
	 * Get payroll run detail with employees.
	 */
	.get(
		'/runs/:id',
		async ({
			params,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const { id } = params;

			const run = await db.select().from(payrollRun).where(eq(payrollRun.id, id)).limit(1);
			const record = run[0];
			if (!record) {
				set.status = 404;
				return { error: 'Payroll run not found' };
			}

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: record.organizationId,
			});

			if (!organizationId || organizationId !== record.organizationId) {
				set.status = 403;
				return { error: 'You do not have access to this payroll run' };
			}

			const lines = await db
				.select()
				.from(payrollRunEmployee)
				.where(eq(payrollRunEmployee.payrollRunId, id));

			return { data: { run: record, employees: lines } };
		},
	);
