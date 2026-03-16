import { differenceInMinutes, isAfter, isBefore } from 'date-fns';

import {
	MINIMUM_WAGES,
	OVERTIME_LIMITS,
	SHIFT_LIMITS,
	SUNDAY_PREMIUM_RATE,
} from '../utils/mexico-labor-constants.js';
import { addDaysToDateKey } from '../utils/date-key.js';
import { getMexicoMandatoryRestDayKeysForYear } from '../utils/mexico-mandatory-rest-days.js';
import { resolveMinimumWageDaily } from '../utils/minimum-wage.js';
import { fromCents, roundCurrency, toCents } from '../utils/money.js';
import {
	getUtcDateForZonedMidnight,
	isValidIanaTimeZone,
	toDateKeyInTimeZone,
} from '../utils/time-zone.js';
import {
	calculateMexicoPayrollTaxes,
	getSbcDaily,
	type MexicoPayrollTaxResult,
	type MexicoPayrollTaxSettings,
} from './mexico-payroll-taxes.js';
import {
	calculateIncapacitySummary,
	type IncapacityRecordInput,
	type IncapacitySummary,
} from './incapacities.js';

export type AttendanceRow = {
	employeeId: string;
	timestamp: Date;
	type: 'CHECK_IN' | 'CHECK_OUT' | 'CHECK_OUT_AUTHORIZED' | 'WORK_OFFSITE';
	checkOutReason?: 'REGULAR' | 'LUNCH_BREAK' | 'PERSONAL' | null;
	offsiteDateKey?: string | null;
	offsiteDayKind?: 'LABORABLE' | 'NO_LABORABLE' | null;
};

export type EmployeeAttendanceRow = {
	timestamp: Date;
	type: 'CHECK_IN' | 'CHECK_OUT' | 'CHECK_OUT_AUTHORIZED' | 'WORK_OFFSITE';
	checkOutReason?: 'REGULAR' | 'LUNCH_BREAK' | 'PERSONAL' | null;
	offsiteDateKey?: string | null;
	offsiteDayKind?: 'LABORABLE' | 'NO_LABORABLE' | null;
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
	fiscalDailyPay: number | null;
	hourlyPay: number;
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	seventhDayPay: number;
	hoursWorked: number;
	expectedHours: number;
	normalHours: number;
	overtimeDoubleHours: number;
	overtimeTripleHours: number;
	payableOvertimeDoubleHours: number;
	payableOvertimeTripleHours: number;
	authorizedOvertimeHours: number;
	unauthorizedOvertimeHours: number;
	sundayHoursWorked: number;
	mandatoryRestDaysWorkedCount: number;
	mandatoryRestDayDateKeys: string[];
	normalPay: number;
	overtimeDoublePay: number;
	overtimeTriplePay: number;
	sundayPremiumAmount: number;
	mandatoryRestDayPremiumAmount: number;
	vacationDaysPaid: number;
	vacationPayAmount: number;
	vacationPremiumAmount: number;
	lunchBreakAutoDeductedDays: number;
	lunchBreakAutoDeductedMinutes: number;
	totalPay: number;
	fiscalGrossPay: number | null;
	complementPay: number | null;
	totalRealPay: number | null;
	grossPay: number;
	bases: MexicoPayrollTaxResult['bases'];
	employeeWithholdings: MexicoPayrollTaxResult['employeeWithholdings'];
	employerCosts: MexicoPayrollTaxResult['employerCosts'];
	informationalLines: MexicoPayrollTaxResult['informationalLines'];
	netPay: number;
	companyCost: number;
	incapacitySummary: PayrollIncapacitySummary;
	warnings: {
		type:
			| 'OVERTIME_DAILY_EXCEEDED'
			| 'OVERTIME_WEEKLY_EXCEEDED'
			| 'OVERTIME_WEEKLY_DAYS_EXCEEDED'
			| 'LUNCH_BREAK_AUTO_DEDUCTED'
			| 'OVERTIME_NOT_AUTHORIZED'
			| 'OVERTIME_EXCEEDED_AUTHORIZATION'
			| 'BELOW_MINIMUM_WAGE';
		message: string;
		severity: 'warning' | 'error';
	}[];
};

export interface OvertimeAuthorizationRow {
	employeeId: string;
	dateKey: string;
	authorizedHours: number | string;
	status: 'PENDING' | 'ACTIVE' | 'CANCELLED';
}

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
	fiscalDailyPay?: number | string | null;
	hireDate?: Date | null;
	sbcDailyOverride?: number | string | null;
	aguinaldoDaysOverride?: number | string | null;
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | null;
	shiftType: 'DIURNA' | 'NOCTURNA' | 'MIXTA' | null;
	locationGeographicZone: keyof typeof MINIMUM_WAGES | null;
	locationTimeZone: string | null;
}

export interface CalculatePayrollFromDataArgs {
	employees: PayrollEmployeeRow[];
	schedules: ScheduleRow[];
	attendanceRows: AttendanceRow[];
	overtimeAuthorizations?: OvertimeAuthorizationRow[];
	periodStartDateKey: string;
	periodEndDateKey: string;
	periodBounds: PayrollPeriodBounds;
	overtimeEnforcement: 'WARN' | 'BLOCK';
	weekStartDay: number;
	additionalMandatoryRestDays: string[];
	defaultTimeZone: string;
	payrollSettings?: Partial<MexicoPayrollTaxSettings> & {
		enableSeventhDayPay?: boolean;
		enableDualPayroll?: boolean;
		autoDeductLunchBreak?: boolean;
		lunchBreakMinutes?: number;
		lunchBreakThresholdHours?: number;
		countSaturdayAsWorkedForSeventhDay?: boolean;
	};
	vacationDayCounts?: Record<string, number>;
	incapacityRecordsByEmployee?: Record<string, IncapacityRecordInput[]>;
}

export interface CalculatePayrollFromDataResult {
	employees: PayrollCalculationRow[];
	totalAmount: number;
	taxSummary: PayrollTaxSummary;
}

export interface PayrollTaxSummary {
	grossTotal: number;
	employeeWithholdingsTotal: number;
	employerCostsTotal: number;
	netPayTotal: number;
	companyCostTotal: number;
}

export interface PayrollIncapacitySummary {
	daysIncapacityTotal: number;
	expectedImssSubsidyAmount: number;
	byType: IncapacitySummary['byType'];
}

const DEFAULT_TAX_SETTINGS: MexicoPayrollTaxSettings & {
	enableSeventhDayPay: boolean;
	enableDualPayroll: boolean;
	autoDeductLunchBreak: boolean;
	lunchBreakMinutes: number;
	lunchBreakThresholdHours: number;
	countSaturdayAsWorkedForSeventhDay: boolean;
} = {
	riskWorkRate: 0,
	statePayrollTaxRate: 0,
	absorbImssEmployeeShare: false,
	absorbIsr: false,
	aguinaldoDays: 15,
	vacationPremiumRate: 0.25,
	enableSeventhDayPay: false,
	enableDualPayroll: false,
	autoDeductLunchBreak: false,
	lunchBreakMinutes: 60,
	lunchBreakThresholdHours: 6,
	countSaturdayAsWorkedForSeventhDay: false,
};

interface ResolvedDualPayrollPay {
	realDailyPay: number;
	taxDailyPay: number;
	fiscalDailyPayUsed: number | null;
	dailyComplement: number;
}

/**
 * Resolves which daily pay should be used for fiscal calculations vs real payment.
 *
 * @param args - Dual payroll inputs
 * @param args.dailyPay - Employee real daily pay
 * @param args.fiscalDailyPay - Optional fiscal daily pay override
 * @param args.enableDualPayroll - Whether dual payroll is enabled
 * @returns Real/fiscal daily pay split and daily complement
 */
function resolveDualPayrollPay(args: {
	dailyPay: number;
	fiscalDailyPay: number | string | null | undefined;
	enableDualPayroll: boolean;
}): ResolvedDualPayrollPay {
	const realDailyPay = Number(args.dailyPay);
	const rawFiscalDailyPay =
		args.fiscalDailyPay === null || args.fiscalDailyPay === undefined
			? null
			: Number(args.fiscalDailyPay);
	const fiscalDailyPayIsUsable =
		args.enableDualPayroll &&
		rawFiscalDailyPay !== null &&
		Number.isFinite(rawFiscalDailyPay) &&
		rawFiscalDailyPay > 0;

	if (!fiscalDailyPayIsUsable) {
		return {
			realDailyPay,
			taxDailyPay: realDailyPay,
			fiscalDailyPayUsed: null,
			dailyComplement: 0,
		};
	}

	const fiscalDailyPayUsed = Math.min(realDailyPay, rawFiscalDailyPay);

	return {
		realDailyPay,
		taxDailyPay: fiscalDailyPayUsed,
		fiscalDailyPayUsed,
		dailyComplement: roundCurrency(Math.max(realDailyPay - fiscalDailyPayUsed, 0)),
	};
}

/**
 * Parses an HH:mm or HH:mm:ss string into total minutes.
 *
 * @param timeString - Time string in HH:mm or HH:mm:ss format
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
 * Calculates the inclusive number of days between two date keys.
 *
 * @param periodStartDateKey - Period start date key (YYYY-MM-DD)
 * @param periodEndDateKey - Period end date key (YYYY-MM-DD)
 * @returns Inclusive day count
 */
function getInclusiveDayCount(periodStartDateKey: string, periodEndDateKey: string): number {
	if (periodEndDateKey < periodStartDateKey) {
		return 0;
	}
	let count = 0;
	let cursor = periodStartDateKey;
	for (let i = 0; i < 400 && cursor <= periodEndDateKey; i += 1) {
		count += 1;
		if (cursor === periodEndDateKey) {
			break;
		}
		cursor = addDaysToDateKey(cursor, 1);
	}
	return count;
}

/**
 * Computes scheduled working date keys for a period based on a weekly schedule.
 *
 * @param schedule - Weekly schedule entries
 * @param periodStartDateKey - Period start date key (YYYY-MM-DD)
 * @param periodEndDateKey - Period end date key (YYYY-MM-DD)
 * @returns Sorted list of scheduled working date keys
 */
function getScheduledWorkingDateKeys(
	schedule: Omit<ScheduleRow, 'employeeId'>[],
	periodStartDateKey: string,
	periodEndDateKey: string,
): string[] {
	const scheduled: string[] = [];
	let currentKey = periodStartDateKey;
	for (let i = 0; i < 400 && currentKey <= periodEndDateKey; i += 1) {
		const dayDate = new Date(`${currentKey}T00:00:00Z`);
		const dayOfWeek = dayDate.getUTCDay();
		const entry = schedule.find((s) => s.dayOfWeek === dayOfWeek);
		if (entry && entry.isWorkingDay) {
			scheduled.push(currentKey);
		}
		if (currentKey === periodEndDateKey) {
			break;
		}
		currentKey = addDaysToDateKey(currentKey, 1);
	}
	return scheduled;
}

/**
 * Calculates seventh day pay for weekly periods based on schedule and attendance.
 *
 * @param args - Seventh day inputs
 * @returns Seventh day pay amount
 */
function calculateSeventhDayPay(args: {
	enabled: boolean;
	countSaturdayAsWorkedForSeventhDay: boolean;
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	periodStartDateKey: string;
	periodEndDateKey: string;
	schedule: Omit<ScheduleRow, 'employeeId'>[];
	workedDayKeys: Set<string>;
	dailyPay: number;
}): number {
	const {
		enabled,
		countSaturdayAsWorkedForSeventhDay,
		paymentFrequency,
		periodStartDateKey,
		periodEndDateKey,
		schedule,
		workedDayKeys,
		dailyPay,
	} = args;
	if (!enabled || paymentFrequency !== 'WEEKLY') {
		return 0;
	}
	const daysInPeriod = getInclusiveDayCount(periodStartDateKey, periodEndDateKey);
	if (daysInPeriod !== 7) {
		return 0;
	}
	const scheduledKeys = getScheduledWorkingDateKeys(
		schedule,
		periodStartDateKey,
		periodEndDateKey,
	);
	if (scheduledKeys.length === 0) {
		return 0;
	}
	const resolvedWorkedDayKeys = new Set(workedDayKeys);
	const saturdayDate = getDateKeyForDayOfWeekInPeriod({
		periodStartDateKey,
		periodEndDateKey,
		targetDayOfWeek: 6,
	});
	const saturdayIsScheduled = scheduledKeys.includes(saturdayDate ?? '');
	const requiredWorkedDayKeys = [...scheduledKeys];
	if (
		countSaturdayAsWorkedForSeventhDay &&
		saturdayDate &&
		!saturdayIsScheduled
	) {
		requiredWorkedDayKeys.push(saturdayDate);
		resolvedWorkedDayKeys.add(saturdayDate);
	}
	const completedAllScheduledDays = requiredWorkedDayKeys.every((key) =>
		resolvedWorkedDayKeys.has(key),
	);
	return completedAllScheduledDays ? roundCurrency(dailyPay) : 0;
}

/**
 * Finds the date key for a target weekday inside the payroll period.
 *
 * @param args - Period bounds and weekday to locate
 * @returns Matching date key or null when absent from the period
 */
function getDateKeyForDayOfWeekInPeriod(args: {
	periodStartDateKey: string;
	periodEndDateKey: string;
	targetDayOfWeek: number;
}): string | null {
	const { periodStartDateKey, periodEndDateKey, targetDayOfWeek } = args;
	let currentKey = periodStartDateKey;
	for (let i = 0; i < 400 && currentKey <= periodEndDateKey; i += 1) {
		const dayOfWeek = new Date(`${currentKey}T00:00:00Z`).getUTCDay();
		if (dayOfWeek === targetDayOfWeek) {
			return currentKey;
		}
		if (currentKey === periodEndDateKey) {
			break;
		}
		currentKey = addDaysToDateKey(currentKey, 1);
	}
	return null;
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
export function calculatePayrollFromData(
	args: CalculatePayrollFromDataArgs,
): CalculatePayrollFromDataResult {
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
		payrollSettings,
		vacationDayCounts,
	} = args;

	const resolvedTaxSettings = {
		...DEFAULT_TAX_SETTINGS,
		...payrollSettings,
	};

	const scheduleMap = new Map<string, Omit<ScheduleRow, 'employeeId'>[]>();
	for (const entry of schedules) {
		const current = scheduleMap.get(entry.employeeId) ?? [];
		current.push(entry);
		scheduleMap.set(entry.employeeId, current);
	}

	const attendanceByEmployeeId = new Map<string, EmployeeAttendanceRow[]>();
	for (const row of attendanceRows) {
		const current = attendanceByEmployeeId.get(row.employeeId) ?? [];
		current.push({
			timestamp: row.timestamp,
			type: row.type,
			checkOutReason: row.checkOutReason ?? null,
			offsiteDateKey: row.offsiteDateKey ?? null,
			offsiteDayKind: row.offsiteDayKind ?? null,
		});
		attendanceByEmployeeId.set(row.employeeId, current);
	}

	const overtimeAuthorizationMinutesByEmployeeId = new Map<string, Map<string, number>>();
	for (const authorization of args.overtimeAuthorizations ?? []) {
		if (
			authorization.status !== 'ACTIVE' ||
			authorization.dateKey < periodStartDateKey ||
			authorization.dateKey > periodEndDateKey
		) {
			continue;
		}

		const employeeId = authorization.employeeId;
		const current =
			overtimeAuthorizationMinutesByEmployeeId.get(employeeId) ?? new Map<string, number>();
		current.set(
			authorization.dateKey,
			Math.max(0, Number(authorization.authorizedHours ?? 0) * 60),
		);
		overtimeAuthorizationMinutesByEmployeeId.set(employeeId, current);
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
	let grossTotalCents = 0;
	let employeeWithholdingsCents = 0;
	let employerCostsCents = 0;
	let netPayCents = 0;
	let companyCostCents = 0;

	for (const emp of employees) {
		const attendance = attendanceByEmployeeId.get(emp.id) ?? [];

		const employeeTimeZoneCandidate = emp.locationTimeZone ?? defaultTimeZone;
		const employeeTimeZone = isValidIanaTimeZone(employeeTimeZoneCandidate)
			? employeeTimeZoneCandidate
			: defaultTimeZone;

		const shiftKey = (emp.shiftType ?? 'DIURNA') as keyof typeof SHIFT_LIMITS;
		const shiftLimits = SHIFT_LIMITS[shiftKey];
		const dailyLimitMinutes = shiftLimits.dailyHours * 60;

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

		const sortedAttendance = [...attendance].sort(
			(a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
		);
		let openCheckIn: Date | null = null;
		let paidExitStart: Date | null = null;
		let pendingUnpaidBreak: {
			start: Date;
			checkOutDateKey: string;
			isLegacyWithoutReason: boolean;
			qualifiesForLunchDeductionBypass: boolean;
			spansTouchedDateKeys: boolean;
		} | null = null;
		const offsiteDateKeys = new Set<string>();
		const explicitUnpaidBreakDateKeys = new Set<string>();
		const lunchBreakCheckoutDateKeys = new Set<string>();
		const forcedMandatoryRestDayDateKeys = new Set<string>();
		const standardShiftMinutes = Math.round(shiftLimits.dailyHours * 60);

		/**
		 * Applies a paid segment to the totals, clipping to the payroll period.
		 *
		 * @param segmentStart - Segment start timestamp
		 * @param segmentEnd - Segment end timestamp
		 * @returns void
		 */
		const applyPaidSegment = (segmentStart: Date, segmentEnd: Date): void => {
			const clippedStart = isBefore(segmentStart, periodBounds.periodStartUtc)
				? periodBounds.periodStartUtc
				: segmentStart;
			const clippedEnd = isAfter(segmentEnd, periodBounds.periodEndExclusiveUtc)
				? periodBounds.periodEndExclusiveUtc
				: segmentEnd;

			if (!isAfter(clippedEnd, clippedStart)) {
				return;
			}

			const segmentDayMinutes = new Map<string, number>();
			addWorkedMinutesByDateKey(
				segmentDayMinutes,
				clippedStart,
				clippedEnd,
				employeeTimeZone,
			);

			for (const [dateKey, minutes] of segmentDayMinutes.entries()) {
				if (offsiteDateKeys.has(dateKey) || minutes <= 0) {
					continue;
				}
				const current = calendarDayMinutes.get(dateKey) ?? 0;
				calendarDayMinutes.set(dateKey, current + minutes);
			}
		};

		/**
		 * Marks every local date key touched by an explicit unpaid break interval.
		 *
		 * @param breakStart - Checkout timestamp that started the break
		 * @param breakEnd - Check-in timestamp that ended the break
		 * @returns void
		 */
		const markExplicitBreakDateKeys = (breakStart: Date, breakEnd: Date): void => {
			if (!isAfter(breakEnd, breakStart)) {
				return;
			}

			const breakDayMinutes = new Map<string, number>();
			addWorkedMinutesByDateKey(breakDayMinutes, breakStart, breakEnd, employeeTimeZone);

			for (const [dateKey, minutes] of breakDayMinutes.entries()) {
				if (minutes > 0) {
					explicitUnpaidBreakDateKeys.add(dateKey);
				}
			}
		};

		for (const record of sortedAttendance) {
			if (record.type === 'WORK_OFFSITE') {
				if (paidExitStart) {
					applyPaidSegment(paidExitStart, record.timestamp);
					paidExitStart = null;
				}
				pendingUnpaidBreak = null;
				openCheckIn = null;

				const offsiteDateKey =
					record.offsiteDateKey ??
					toDateKeyInTimeZone(record.timestamp, employeeTimeZone);
				if (offsiteDateKey < periodStartDateKey || offsiteDateKey > periodEndDateKey) {
					continue;
				}

				calendarDayMinutes.set(offsiteDateKey, standardShiftMinutes);
				offsiteDateKeys.add(offsiteDateKey);

				if (record.offsiteDayKind === 'NO_LABORABLE') {
					forcedMandatoryRestDayDateKeys.add(offsiteDateKey);
				}
				continue;
			}

			if (
				record.checkOutReason === 'LUNCH_BREAK' &&
				(record.type === 'CHECK_OUT' || record.type === 'CHECK_OUT_AUTHORIZED')
			) {
				lunchBreakCheckoutDateKeys.add(
					toDateKeyInTimeZone(record.timestamp, employeeTimeZone),
				);
			}

			if (record.type === 'CHECK_IN') {
				if (pendingUnpaidBreak) {
					const checkInDateKey = toDateKeyInTimeZone(record.timestamp, employeeTimeZone);
					const crossDateBypassApplies =
						pendingUnpaidBreak.qualifiesForLunchDeductionBypass &&
						pendingUnpaidBreak.checkOutDateKey !== checkInDateKey &&
						differenceInMinutes(record.timestamp, pendingUnpaidBreak.start) <=
							resolvedTaxSettings.lunchBreakMinutes &&
						(pendingUnpaidBreak.spansTouchedDateKeys ||
							pendingUnpaidBreak.isLegacyWithoutReason);
					if (
						pendingUnpaidBreak.qualifiesForLunchDeductionBypass &&
						crossDateBypassApplies
					) {
						markExplicitBreakDateKeys(pendingUnpaidBreak.start, record.timestamp);
					} else if (
						pendingUnpaidBreak.qualifiesForLunchDeductionBypass &&
						pendingUnpaidBreak.checkOutDateKey === checkInDateKey
					) {
						explicitUnpaidBreakDateKeys.add(checkInDateKey);
					}
				}
				pendingUnpaidBreak = null;

				if (paidExitStart) {
					applyPaidSegment(paidExitStart, record.timestamp);
					paidExitStart = null;
				}
				openCheckIn = record.timestamp;
				continue;
			}

			if (record.type === 'CHECK_OUT_AUTHORIZED') {
				pendingUnpaidBreak = null;

				if (!openCheckIn) {
					continue;
				}

				const checkIn = openCheckIn;
				const checkOutAuthorized = record.timestamp;
				openCheckIn = null;

				if (!isAfter(checkOutAuthorized, checkIn)) {
					continue;
				}

				applyPaidSegment(checkIn, checkOutAuthorized);
				paidExitStart = record.timestamp;
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

			applyPaidSegment(checkIn, checkOut);
			pendingUnpaidBreak = {
				start: checkOut,
				checkOutDateKey: toDateKeyInTimeZone(checkOut, employeeTimeZone),
				isLegacyWithoutReason: record.checkOutReason == null,
				// Legacy records can still omit the reason, so only null and LUNCH_BREAK
				// are treated as evidence that the unpaid break already covered comida.
				qualifiesForLunchDeductionBypass:
					record.checkOutReason == null || record.checkOutReason === 'LUNCH_BREAK',
				spansTouchedDateKeys: record.checkOutReason === 'LUNCH_BREAK',
			};
		}

		const overtimeAuthorizationMinutesByDate =
			overtimeAuthorizationMinutesByEmployeeId.get(emp.id) ?? new Map<string, number>();
		type WeeklyOvertimeBucket = {
			normalMinutes: number;
			overtimeFromDailyMinutes: number;
			overtimeDayKeys: Set<string>;
			dayKeys: string[];
		};

		const weeklyBuckets = new Map<string, WeeklyOvertimeBucket>();
		let sundayHoursWorked = 0;
		const sundayDateKeys = new Set<string>();
		const mandatoryRestDayDateKeys = new Set<string>();
		const warnings: PayrollCalculationRow['warnings'] = [];
		let lunchBreakAutoDeductedDays = 0;
		let lunchBreakAutoDeductedMinutes = 0;

		if (resolvedTaxSettings.autoDeductLunchBreak && resolvedTaxSettings.lunchBreakMinutes > 0) {
			const lunchBreakThresholdMinutes = resolvedTaxSettings.lunchBreakThresholdHours * 60;

			for (const [dateKey, minutes] of calendarDayMinutes.entries()) {
				if (
					minutes <= lunchBreakThresholdMinutes ||
					offsiteDateKeys.has(dateKey) ||
					explicitUnpaidBreakDateKeys.has(dateKey) ||
					lunchBreakCheckoutDateKeys.has(dateKey)
				) {
					continue;
				}

				const deductedMinutes = Math.min(
					minutes,
					Math.max(0, resolvedTaxSettings.lunchBreakMinutes),
				);
				if (deductedMinutes <= 0) {
					continue;
				}

				calendarDayMinutes.set(dateKey, Math.max(0, minutes - deductedMinutes));
				lunchBreakAutoDeductedDays += 1;
				lunchBreakAutoDeductedMinutes += deductedMinutes;
				warnings.push({
					type: 'LUNCH_BREAK_AUTO_DEDUCTED',
					message: `Se descontaron ${deductedMinutes} minutos de comida automáticamente en ${dateKey}.`,
					severity: 'warning',
				});
			}
		}

		const workedMinutesTotal = Array.from(calendarDayMinutes.values()).reduce(
			(total, minutes) => total + Math.max(0, minutes),
			0,
		);
		const hoursWorked = workedMinutesTotal / 60;
		const unauthorizedOvertimeDayKeys = new Set<string>();
		const exceededAuthorizationDayKeys = new Set<string>();
		let authorizedOvertimeMinutesTotal = 0;
		let unauthorizedOvertimeMinutesTotal = 0;
		let payableOvertimeDoubleHours = 0;
		let payableOvertimeTripleHours = 0;

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
				forcedMandatoryRestDayDateKeys.has(dateKey) ||
				additionalMandatoryRestDaySet.has(dateKey) ||
				getMandatoryRestDayKeysForYearCached(year).has(dateKey);
			if (isMandatoryRestDay) {
				mandatoryRestDayDateKeys.add(dateKey);
			}

			const normalMinutes = Math.min(minutes, dailyLimitMinutes);
			const overtimeMinutes = Math.max(0, minutes - normalMinutes);
			workdayMinutes.set(dateKey, {
				normalMinutes,
				overtimeMinutes,
			});
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
				dayKeys: [],
			};
			current.normalMinutes += bucket.normalMinutes;
			current.overtimeFromDailyMinutes += bucket.overtimeMinutes;
			if (bucket.overtimeMinutes > 0) {
				current.overtimeDayKeys.add(workdayKey);
			}
			current.dayKeys.push(workdayKey);
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
			let remainingWeeklyNormalAllowance = shiftLimits.weeklyHours * 60;
			let weekAdjustedNormalMinutes = 0;
			let weekTotalOvertimeMinutes = 0;
			let weekProcessedOvertimeMinutes = 0;
			let weekPayableDoubleMinutes = 0;
			let weekPayableTripleMinutes = 0;

			for (const dayKey of [...bucket.dayKeys].sort((a, b) => a.localeCompare(b))) {
				const dayBucket = workdayMinutes.get(dayKey);
				if (!dayBucket) {
					continue;
				}

				const dayNormalMinutesWithinWeeklyLimit = Math.min(
					dayBucket.normalMinutes,
					Math.max(0, remainingWeeklyNormalAllowance),
				);
				const dayWeeklyExcessMinutes =
					dayBucket.normalMinutes - dayNormalMinutesWithinWeeklyLimit;
				remainingWeeklyNormalAllowance = Math.max(
					0,
					remainingWeeklyNormalAllowance - dayBucket.normalMinutes,
				);

				const dayTotalOvertimeMinutes = dayBucket.overtimeMinutes + dayWeeklyExcessMinutes;
				const dayAuthorizedMinutes = overtimeAuthorizationMinutesByDate.get(dayKey) ?? 0;
				const dayAuthorizedPaidMinutes = Math.min(
					dayTotalOvertimeMinutes,
					Math.max(0, dayAuthorizedMinutes),
				);
				const dayUnauthorizedMinutes = Math.max(
					0,
					dayTotalOvertimeMinutes - dayAuthorizedPaidMinutes,
				);
				const dayWeeklyDoubleRemaining = Math.max(
					0,
					OVERTIME_LIMITS.MAX_WEEKLY_HOURS * 60 - weekProcessedOvertimeMinutes,
				);
				const dayDoubleMinutes = Math.min(dayTotalOvertimeMinutes, dayWeeklyDoubleRemaining);
				const dayTripleMinutes = Math.max(0, dayTotalOvertimeMinutes - dayDoubleMinutes);
				const dayPayableDoubleMinutes = Math.min(dayDoubleMinutes, dayAuthorizedPaidMinutes);
				const dayPayableTripleMinutes = Math.min(
					dayTripleMinutes,
					Math.max(0, dayAuthorizedPaidMinutes - dayDoubleMinutes),
				);

				weekAdjustedNormalMinutes += dayNormalMinutesWithinWeeklyLimit;
				weekTotalOvertimeMinutes += dayTotalOvertimeMinutes;
				weekProcessedOvertimeMinutes += dayTotalOvertimeMinutes;
				weekPayableDoubleMinutes += dayPayableDoubleMinutes;
				weekPayableTripleMinutes += dayPayableTripleMinutes;
				authorizedOvertimeMinutesTotal += dayAuthorizedPaidMinutes;
				unauthorizedOvertimeMinutesTotal += dayUnauthorizedMinutes;

				if (dayTotalOvertimeMinutes > 0) {
					bucket.overtimeDayKeys.add(dayKey);
				}

				if (dayTotalOvertimeMinutes > 0 && dayAuthorizedPaidMinutes === 0) {
					unauthorizedOvertimeDayKeys.add(dayKey);
				} else if (dayUnauthorizedMinutes > 0) {
					exceededAuthorizationDayKeys.add(dayKey);
				}
			}

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
			payableOvertimeDoubleHours += weekPayableDoubleMinutes / 60;
			payableOvertimeTripleHours += weekPayableTripleMinutes / 60;

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

		const sortedUnauthorizedDayKeys = [...unauthorizedOvertimeDayKeys].sort((a, b) =>
			a.localeCompare(b),
		);
		if (sortedUnauthorizedDayKeys.length > 0) {
			warnings.push({
				type: 'OVERTIME_NOT_AUTHORIZED',
				message: `Las horas extra no están autorizadas para ${sortedUnauthorizedDayKeys.join(', ')}. Se registran pero no se pagan.`,
				severity: 'warning',
			});
		}

		const sortedExceededAuthorizationDayKeys = [...exceededAuthorizationDayKeys].sort((a, b) =>
			a.localeCompare(b),
		);
		if (sortedExceededAuthorizationDayKeys.length > 0) {
			warnings.push({
				type: 'OVERTIME_EXCEEDED_AUTHORIZATION',
				message: `Las horas extra de ${sortedExceededAuthorizationDayKeys.join(', ')} exceden la autorización aprobada y el excedente no se paga.`,
				severity: 'warning',
			});
		}

		const divisor = shiftLimits.divisor || 8;
		const resolvedDualPayrollPay = resolveDualPayrollPay({
			dailyPay: Number(emp.dailyPay ?? 0),
			fiscalDailyPay: emp.fiscalDailyPay ?? null,
			enableDualPayroll: Boolean(resolvedTaxSettings.enableDualPayroll),
		});
		const realDailyPay = resolvedDualPayrollPay.realDailyPay;
		const taxDailyPay = resolvedDualPayrollPay.taxDailyPay;
		const dualPayrollApplied = resolvedDualPayrollPay.fiscalDailyPayUsed !== null;
		const hourlyRate = divisor > 0 ? taxDailyPay / divisor : 0;
		const realHourlyRate = divisor > 0 ? realDailyPay / divisor : 0;

		const normalPay = roundCurrency(adjustedNormalHours * hourlyRate);
		const overtimeDoublePay = roundCurrency(
			payableOvertimeDoubleHours * hourlyRate * OVERTIME_LIMITS.DOUBLE_RATE_MULTIPLIER,
		);
		const overtimeTriplePay = roundCurrency(
			payableOvertimeTripleHours * hourlyRate * OVERTIME_LIMITS.TRIPLE_RATE_MULTIPLIER,
		);
		const sundayPremiumAmount =
			sundaysWorkedCount > 0
				? roundCurrency(sundaysWorkedCount * taxDailyPay * SUNDAY_PREMIUM_RATE)
				: 0;
		const mandatoryRestDayPremiumAmount =
			mandatoryRestDaysWorkedCount > 0
				? roundCurrency(mandatoryRestDaysWorkedCount * taxDailyPay * 2)
				: 0;
		const vacationDaysPaid = Math.max(0, vacationDayCounts?.[emp.id] ?? 0);
		const vacationPayAmount =
			vacationDaysPaid > 0 ? roundCurrency(vacationDaysPaid * taxDailyPay) : 0;
		const vacationPremiumAmount =
			vacationPayAmount > 0
				? roundCurrency(vacationPayAmount * resolvedTaxSettings.vacationPremiumRate)
				: 0;
		const realNormalPay = roundCurrency(adjustedNormalHours * realHourlyRate);
		const realOvertimeDoublePay = roundCurrency(
			payableOvertimeDoubleHours *
				realHourlyRate *
				OVERTIME_LIMITS.DOUBLE_RATE_MULTIPLIER,
		);
		const realOvertimeTriplePay = roundCurrency(
			payableOvertimeTripleHours *
				realHourlyRate *
				OVERTIME_LIMITS.TRIPLE_RATE_MULTIPLIER,
		);
		const realSundayPremiumAmount =
			sundaysWorkedCount > 0
				? roundCurrency(sundaysWorkedCount * realDailyPay * SUNDAY_PREMIUM_RATE)
				: 0;
		const realMandatoryRestDayPremiumAmount =
			mandatoryRestDaysWorkedCount > 0
				? roundCurrency(mandatoryRestDaysWorkedCount * realDailyPay * 2)
				: 0;
		const realVacationPayAmount =
			vacationDaysPaid > 0 ? roundCurrency(vacationDaysPaid * realDailyPay) : 0;
		const realVacationPremiumAmount =
			realVacationPayAmount > 0
				? roundCurrency(realVacationPayAmount * resolvedTaxSettings.vacationPremiumRate)
				: 0;

		const workedDayKeys = new Set(
			Array.from(calendarDayMinutes.entries())
				.filter(([, minutes]) => minutes > 0)
				.map(([dateKey]) => dateKey),
		);
		const seventhDayPay = calculateSeventhDayPay({
			enabled: Boolean(resolvedTaxSettings.enableSeventhDayPay),
			countSaturdayAsWorkedForSeventhDay: Boolean(
				resolvedTaxSettings.countSaturdayAsWorkedForSeventhDay,
			),
			paymentFrequency: emp.paymentFrequency ?? 'MONTHLY',
			periodStartDateKey,
			periodEndDateKey,
			schedule: scheduleMap.get(emp.id) ?? [],
			workedDayKeys,
			dailyPay: taxDailyPay,
		});
		const realSeventhDayPay = calculateSeventhDayPay({
			enabled: Boolean(resolvedTaxSettings.enableSeventhDayPay),
			countSaturdayAsWorkedForSeventhDay: Boolean(
				resolvedTaxSettings.countSaturdayAsWorkedForSeventhDay,
			),
			paymentFrequency: emp.paymentFrequency ?? 'MONTHLY',
			periodStartDateKey,
			periodEndDateKey,
			schedule: scheduleMap.get(emp.id) ?? [],
			workedDayKeys,
			dailyPay: realDailyPay,
		});

		const fiscalGrossPay = roundCurrency(
			normalPay +
				overtimeDoublePay +
				overtimeTriplePay +
				sundayPremiumAmount +
				mandatoryRestDayPremiumAmount +
				seventhDayPay +
				vacationPayAmount +
				vacationPremiumAmount,
		);
		const realGrossPay = roundCurrency(
			realNormalPay +
				realOvertimeDoublePay +
				realOvertimeTriplePay +
				realSundayPremiumAmount +
				realMandatoryRestDayPremiumAmount +
				realSeventhDayPay +
				realVacationPayAmount +
				realVacationPremiumAmount,
		);
		const complementPay = dualPayrollApplied
			? roundCurrency(Math.max(realGrossPay - fiscalGrossPay, 0))
			: null;
		const totalRealPay = dualPayrollApplied
			? roundCurrency(fiscalGrossPay + (complementPay ?? 0))
			: fiscalGrossPay;
		const totalPay = totalRealPay;
		const grossPay = totalRealPay;

		const zone = (emp.locationGeographicZone ?? 'GENERAL') as keyof typeof MINIMUM_WAGES;
		const minimumWageDaily = resolveMinimumWageDaily({
			dateKey: periodEndDateKey,
			zone,
		});
			if (realDailyPay < minimumWageDaily) {
				warnings.push({
					type: 'BELOW_MINIMUM_WAGE',
					message: `El salario diario ${realDailyPay.toFixed(
						2,
					)} está por debajo del salario mínimo para ${zone} (${minimumWageDaily.toFixed(2)}).`,
					severity: 'warning',
				});
			}

		const resolvedAguinaldoDays =
			typeof emp.aguinaldoDaysOverride === 'string'
				? Number(emp.aguinaldoDaysOverride)
				: (emp.aguinaldoDaysOverride ?? resolvedTaxSettings.aguinaldoDays);

		const sbcDaily = getSbcDaily({
			dailyPay: taxDailyPay,
			hireDate: emp.hireDate ?? null,
			sbcDailyOverride:
				typeof emp.sbcDailyOverride === 'string'
					? Number(emp.sbcDailyOverride)
					: (emp.sbcDailyOverride ?? null),
			aguinaldoDays: resolvedAguinaldoDays,
			vacationPremiumRate: resolvedTaxSettings.vacationPremiumRate,
			periodEndDateKey,
		});

		const incapacityResult = calculateIncapacitySummary({
			periodStartDateKey,
			periodEndDateKey,
			sbcDaily,
			incapacityRecords: args.incapacityRecordsByEmployee?.[emp.id] ?? [],
		});

		const taxBreakdown = calculateMexicoPayrollTaxes({
			dailyPay: taxDailyPay,
			grossPay: fiscalGrossPay,
			paymentFrequency: emp.paymentFrequency ?? 'MONTHLY',
			periodStartDateKey,
			periodEndDateKey,
			hireDate: emp.hireDate ?? null,
			sbcDailyOverride:
				typeof emp.sbcDailyOverride === 'string'
					? Number(emp.sbcDailyOverride)
					: (emp.sbcDailyOverride ?? null),
			locationGeographicZone: emp.locationGeographicZone ?? 'GENERAL',
			settings: {
				...resolvedTaxSettings,
				aguinaldoDays: resolvedAguinaldoDays,
			},
			imssExemptDateKeys: incapacityResult.imssExemptDateKeys,
		});
		const netPay = roundCurrency(totalRealPay - taxBreakdown.employeeWithholdings.total);
		const companyCost = roundCurrency(totalRealPay + taxBreakdown.employerCosts.total);

		grossTotalCents += toCents(grossPay);
		employeeWithholdingsCents += toCents(taxBreakdown.employeeWithholdings.total);
		employerCostsCents += toCents(taxBreakdown.employerCosts.total);
		netPayCents += toCents(netPay);
		companyCostCents += toCents(companyCost);

		results.push({
			employeeId: emp.id,
			name: `${emp.firstName} ${emp.lastName}`,
			shiftType: shiftKey,
			dailyPay: realDailyPay,
			fiscalDailyPay: resolvedDualPayrollPay.fiscalDailyPayUsed,
			hourlyPay: realHourlyRate,
			paymentFrequency: emp.paymentFrequency ?? 'MONTHLY',
			seventhDayPay,
			hoursWorked,
			expectedHours,
			normalHours: adjustedNormalHours,
			overtimeDoubleHours,
			overtimeTripleHours,
			payableOvertimeDoubleHours,
			payableOvertimeTripleHours,
			authorizedOvertimeHours: authorizedOvertimeMinutesTotal / 60,
			unauthorizedOvertimeHours: unauthorizedOvertimeMinutesTotal / 60,
			sundayHoursWorked,
			mandatoryRestDaysWorkedCount,
			mandatoryRestDayDateKeys: Array.from(mandatoryRestDayDateKeys).sort((a, b) =>
				a.localeCompare(b),
			),
			normalPay,
			overtimeDoublePay,
			overtimeTriplePay,
			sundayPremiumAmount,
			mandatoryRestDayPremiumAmount,
			vacationDaysPaid,
			vacationPayAmount,
			vacationPremiumAmount,
			lunchBreakAutoDeductedDays,
			lunchBreakAutoDeductedMinutes,
			totalPay,
			fiscalGrossPay: dualPayrollApplied ? fiscalGrossPay : null,
			complementPay,
			totalRealPay: dualPayrollApplied ? totalRealPay : null,
			grossPay,
			bases: taxBreakdown.bases,
			employeeWithholdings: taxBreakdown.employeeWithholdings,
			employerCosts: taxBreakdown.employerCosts,
			informationalLines: taxBreakdown.informationalLines,
			netPay,
			companyCost,
			incapacitySummary: {
				daysIncapacityTotal: incapacityResult.incapacitySummary.daysIncapacityTotal,
				expectedImssSubsidyAmount: incapacityResult.imssSubsidy.expectedSubsidyAmount,
				byType: incapacityResult.incapacitySummary.byType,
			},
			warnings,
		});
	}

	const taxSummary: PayrollTaxSummary = {
		grossTotal: fromCents(grossTotalCents),
		employeeWithholdingsTotal: fromCents(employeeWithholdingsCents),
		employerCostsTotal: fromCents(employerCostsCents),
		netPayTotal: fromCents(netPayCents),
		companyCostTotal: fromCents(companyCostCents),
	};

	return { employees: results, totalAmount: taxSummary.grossTotal, taxSummary };
}
