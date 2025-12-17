import { differenceInMinutes, isAfter, isBefore } from 'date-fns';

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

export type AttendanceRow = {
	employeeId: string;
	timestamp: Date;
	type: 'CHECK_IN' | 'CHECK_OUT';
};

export type EmployeeAttendanceRow = {
	timestamp: Date;
	type: 'CHECK_IN' | 'CHECK_OUT';
};

export type ScheduleRow = {
	employeeId: string;
	dayOfWeek: number;
	startTime: string;
	endTime: string;
	isWorkingDay: boolean;
};

export type PayrollCalculationRow = {
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

export interface PayrollPeriodBounds {
	periodStartUtc: Date;
	periodEndInclusiveUtc: Date;
	periodEndExclusiveUtc: Date;
}

export interface PayrollEmployeeRow {
	id: string;
	firstName: string;
	lastName: string;
	dailyPay: number | string | null;
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | null;
	shiftType: 'DIURNA' | 'NOCTURNA' | 'MIXTA' | null;
	locationGeographicZone: keyof typeof MINIMUM_WAGES | null;
	locationTimeZone: string | null;
}

export interface CalculatePayrollFromDataArgs {
	employees: PayrollEmployeeRow[];
	schedules: ScheduleRow[];
	attendanceRows: AttendanceRow[];
	periodStartDateKey: string;
	periodEndDateKey: string;
	periodBounds: PayrollPeriodBounds;
	overtimeEnforcement: 'WARN' | 'BLOCK';
	weekStartDay: number;
	additionalMandatoryRestDays: string[];
	defaultTimeZone: string;
}

export interface CalculatePayrollFromDataResult {
	employees: PayrollCalculationRow[];
	totalAmount: number;
}

/**
 * Parses an HH:mm string into total minutes.
 *
 * @param timeString - Time string in HH:mm format
 * @returns Total minutes from midnight
 */
function parseTimeToMinutes(timeString: string): number {
	const [hours = 0, minutes = 0] = timeString.split(':').map(Number);
	return hours * 60 + minutes;
}

/**
 * Calculates expected hours for a period based on schedule entries.
 *
 * @param schedule - Weekly schedule entries
 * @param periodStartDateKey - Start date key (YYYY-MM-DD) of the period
 * @param periodEndDateKey - End date key (YYYY-MM-DD) of the period
 * @returns Expected hours in the period
 */
export function calculateExpectedHours(
	schedule: Omit<ScheduleRow, 'employeeId'>[],
	periodStartDateKey: string,
	periodEndDateKey: string,
): number {
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
			const minutesUntilMidnight = 24 * 60 - startMinutes;
			minutes += minutesUntilMidnight + endMinutes;
		}
		currentKey = addDaysToDateKey(currentKey, 1);
	}
	return minutes / 60;
}

/**
 * Adds worked minutes from a UTC segment into a map grouped by local calendar day (YYYY-MM-DD).
 *
 * @param dayMinutes - Map of date key string to worked minutes
 * @param segmentStart - Segment start instant (UTC)
 * @param segmentEnd - Segment end instant (UTC)
 * @param timeZone - IANA timezone used to cut day boundaries
 * @returns Nothing
 */
export function addWorkedMinutesByDateKey(
	dayMinutes: Map<string, number>,
	segmentStart: Date,
	segmentEnd: Date,
	timeZone: string,
): void {
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
}

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
export function getWeekStartKey(dateKey: string, weekStartDay: number): string {
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
}

/**
 * Computes UTC period bounds for payroll based on local date keys and an IANA timezone.
 *
 * @param args - Period boundary args
 * @returns Start (inclusive) and end (inclusive/exclusive) instants in UTC
 */
export function getPayrollPeriodBounds(args: {
	periodStartDateKey: string;
	periodEndDateKey: string;
	timeZone: string;
}): PayrollPeriodBounds {
	const { periodStartDateKey, periodEndDateKey, timeZone } = args;

	const periodStartUtc = getUtcDateForZonedMidnight(periodStartDateKey, timeZone);
	const periodEndExclusiveUtc = getUtcDateForZonedMidnight(
		addDaysToDateKey(periodEndDateKey, 1),
		timeZone,
	);
	const periodEndInclusiveUtc = new Date(periodEndExclusiveUtc.getTime() - 1);

	return {
		periodStartUtc,
		periodEndInclusiveUtc,
		periodEndExclusiveUtc,
	};
}

/**
 * Calculates payroll breakdowns for a set of employees with preloaded schedule and attendance data.
 *
 * @param args - Payroll calculation inputs
 * @returns Employee breakdowns and total amount for the period
 */
export function calculatePayrollFromData(args: CalculatePayrollFromDataArgs): CalculatePayrollFromDataResult {
	const {
		employees,
		schedules,
		attendanceRows,
		periodStartDateKey,
		periodEndDateKey,
		periodBounds,
		overtimeEnforcement,
		weekStartDay,
		additionalMandatoryRestDays,
		defaultTimeZone,
	} = args;

	const scheduleMap = new Map<string, Omit<ScheduleRow, 'employeeId'>[]>();
	for (const entry of schedules) {
		const current = scheduleMap.get(entry.employeeId) ?? [];
		current.push(entry);
		scheduleMap.set(entry.employeeId, current);
	}

	const attendanceByEmployeeId = new Map<string, EmployeeAttendanceRow[]>();
	for (const row of attendanceRows) {
		const current = attendanceByEmployeeId.get(row.employeeId) ?? [];
		current.push({ timestamp: row.timestamp, type: row.type });
		attendanceByEmployeeId.set(row.employeeId, current);
	}

	const additionalMandatoryRestDaySet = new Set<string>(additionalMandatoryRestDays);
	const mandatoryRestDayCache = new Map<number, Set<string>>();

	/**
	 * Retrieves Mexico mandatory rest day keys for a year with caching (LFT Art. 74).
	 *
	 * @param year - Calendar year
	 * @returns Set of YYYY-MM-DD date keys
	 */
	function getMandatoryRestDayKeysForYearCached(year: number): Set<string> {
		const cached = mandatoryRestDayCache.get(year);
		if (cached) {
			return cached;
		}
		const keys = getMexicoMandatoryRestDayKeysForYear(year);
		mandatoryRestDayCache.set(year, keys);
		return keys;
	}

	const results: PayrollCalculationRow[] = [];
	let totalAmount = 0;

	for (const emp of employees) {
		const attendance = attendanceByEmployeeId.get(emp.id) ?? [];

		const employeeTimeZoneCandidate = emp.locationTimeZone ?? defaultTimeZone;
		const employeeTimeZone = isValidIanaTimeZone(employeeTimeZoneCandidate)
			? employeeTimeZoneCandidate
			: defaultTimeZone;

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

			const segmentStart = isBefore(checkIn, periodBounds.periodStartUtc)
				? periodBounds.periodStartUtc
				: checkIn;
			const segmentEnd = isAfter(checkOut, periodBounds.periodEndExclusiveUtc)
				? periodBounds.periodEndExclusiveUtc
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
			mandatoryRestDaysWorkedCount > 0 ? mandatoryRestDaysWorkedCount * effectiveDailyPay * 2 : 0;

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

	return { employees: results, totalAmount };
}
