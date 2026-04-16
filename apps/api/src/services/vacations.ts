import { addDaysToDateKey, parseDateKey, toDateKeyUtc } from '../utils/date-key.js';
import { getMexicoMandatoryRestDayKeysForYear } from '../utils/mexico-mandatory-rest-days.js';
import { getVacationDaysForYears } from './mexico-payroll-taxes.js';

export type VacationDayType =
	| 'SCHEDULED_WORKDAY'
	| 'SCHEDULED_REST_DAY'
	| 'EXCEPTION_WORKDAY'
	| 'EXCEPTION_DAY_OFF'
	| 'MANDATORY_REST_DAY'
	| 'INCAPACITY';

export type VacationScheduleExceptionType = 'DAY_OFF' | 'MODIFIED' | 'EXTRA_DAY';

export interface VacationScheduleDay {
	dayOfWeek: number;
	isWorkingDay: boolean;
}

export interface VacationScheduleException {
	exceptionDate: Date;
	exceptionType: VacationScheduleExceptionType;
}

export interface VacationDayDetail {
	dateKey: string;
	countsAsVacationDay: boolean;
	dayType: VacationDayType;
	serviceYearNumber: number | null;
}

export interface VacationDayBreakdown {
	days: VacationDayDetail[];
	vacationDays: number;
	vacationDaysByServiceYear: Map<number, number>;
}

/**
 * Computes completed years of service for a given date key.
 *
 * @param hireDate - Employee hire date
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Completed years of service, or null when unavailable
 */
export function getServiceYearNumber(
	hireDate: Date | null | undefined,
	dateKey: string,
): number | null {
	if (!hireDate) {
		return null;
	}

	try {
		parseDateKey(dateKey);
	} catch {
		return null;
	}

	const normalizedHireDate = new Date(
		Date.UTC(hireDate.getUTCFullYear(), hireDate.getUTCMonth(), hireDate.getUTCDate()),
	);
	const targetDate = new Date(`${dateKey}T00:00:00Z`);

	if (Number.isNaN(targetDate.getTime())) {
		return null;
	}

	if (targetDate < normalizedHireDate) {
		return 0;
	}

	let years = targetDate.getUTCFullYear() - normalizedHireDate.getUTCFullYear();
	const anniversary = new Date(
		Date.UTC(
			targetDate.getUTCFullYear(),
			normalizedHireDate.getUTCMonth(),
			normalizedHireDate.getUTCDate(),
		),
	);

	if (targetDate < anniversary) {
		years -= 1;
	}

	return Math.max(0, years);
}

/**
 * Resolves the start date key for a service year.
 *
 * @param hireDate - Employee hire date
 * @param serviceYearNumber - Completed years of service (>=1)
 * @returns Date key for the service year start or null when unavailable
 */
export function getServiceYearStartDateKey(
	hireDate: Date | null | undefined,
	serviceYearNumber: number,
): string | null {
	if (!hireDate || serviceYearNumber <= 0) {
		return null;
	}

	const startDate = new Date(
		Date.UTC(
			hireDate.getUTCFullYear() + serviceYearNumber,
			hireDate.getUTCMonth(),
			hireDate.getUTCDate(),
		),
	);

	return toDateKeyUtc(startDate);
}

/**
 * Resolves the end date key for a service year.
 *
 * @param hireDate - Employee hire date
 * @param serviceYearNumber - Completed years of service (>=1)
 * @returns Date key for the service year end or null when unavailable
 */
export function getServiceYearEndDateKey(
	hireDate: Date | null | undefined,
	serviceYearNumber: number,
): string | null {
	const nextStartKey = getServiceYearStartDateKey(hireDate, serviceYearNumber + 1);
	if (!nextStartKey) {
		return null;
	}
	return addDaysToDateKey(nextStartKey, -1);
}

/**
 * Calculates the inclusive number of days between two date keys.
 *
 * @param startDateKey - Start date key (YYYY-MM-DD)
 * @param endDateKey - End date key (YYYY-MM-DD)
 * @returns Inclusive day count (>=0)
 */
function getInclusiveDayCount(startDateKey: string, endDateKey: string): number {
	if (endDateKey < startDateKey) {
		return 0;
	}
	let count = 0;
	let cursor = startDateKey;
	for (let i = 0; i < 400 && cursor <= endDateKey; i += 1) {
		count += 1;
		if (cursor === endDateKey) {
			break;
		}
		cursor = addDaysToDateKey(cursor, 1);
	}
	return count;
}

/**
 * Calculates accrued vacation days for a service year using full entitlement.
 *
 * @param args - Accrual inputs
 * @param args.hireDate - Employee hire date
 * @param args.serviceYearNumber - Completed years of service for the vacation year
 * @param args.asOfDateKey - Date key used as accrual cutoff (YYYY-MM-DD)
 * @returns Accrual snapshot for the requested service year
 */
export function calculateVacationAccrual(args: {
	hireDate: Date;
	serviceYearNumber: number;
	asOfDateKey: string;
}): {
	entitledDays: number;
	accruedDays: number;
	serviceYearStartDateKey: string | null;
	serviceYearEndDateKey: string | null;
	daysElapsed: number;
	daysInServiceYear: number;
} {
	const { hireDate, serviceYearNumber, asOfDateKey } = args;
	const serviceYearStartDateKey = getServiceYearStartDateKey(hireDate, serviceYearNumber);
	const serviceYearEndDateKey = getServiceYearEndDateKey(hireDate, serviceYearNumber);
	const entitledDays = serviceYearNumber > 0 ? getVacationDaysForYears(serviceYearNumber) : 0;

	if (!serviceYearStartDateKey || !serviceYearEndDateKey || entitledDays <= 0) {
		return {
			entitledDays,
			accruedDays: 0,
			serviceYearStartDateKey,
			serviceYearEndDateKey,
			daysElapsed: 0,
			daysInServiceYear: 0,
		};
	}

	const daysInServiceYear = getInclusiveDayCount(serviceYearStartDateKey, serviceYearEndDateKey);
	if (asOfDateKey < serviceYearStartDateKey) {
		return {
			entitledDays,
			accruedDays: 0,
			serviceYearStartDateKey,
			serviceYearEndDateKey,
			daysElapsed: 0,
			daysInServiceYear,
		};
	}

	const clampedAsOfDateKey =
		asOfDateKey > serviceYearEndDateKey
				? serviceYearEndDateKey
				: asOfDateKey;
	const daysElapsed = getInclusiveDayCount(serviceYearStartDateKey, clampedAsOfDateKey);
	const accruedDays = entitledDays;

	return {
		entitledDays,
		accruedDays,
		serviceYearStartDateKey,
		serviceYearEndDateKey,
		// Keep period metrics available for callers that need service-year context.
		daysElapsed,
		daysInServiceYear,
	};
}

/**
 * Calculates available vacation days based on accrued days and usage.
 *
 * @param args - Availability inputs
 * @param args.accruedDays - Accrued vacation days to date
 * @param args.usedDays - Approved vacation days already used
 * @param args.pendingDays - Pending vacation days
 * @returns Available vacation days (clamped to zero)
 */
export function calculateAvailableVacationDays(args: {
	accruedDays: number;
	usedDays: number;
	pendingDays: number;
}): number {
	const available = Math.floor(args.accruedDays) - args.usedDays - args.pendingDays;
	return Math.max(0, available);
}

/**
 * Builds a set of mandatory rest day keys for the requested date range.
 *
 * @param startDateKey - Start date key (YYYY-MM-DD)
 * @param endDateKey - End date key (YYYY-MM-DD)
 * @param additionalMandatoryRestDays - Additional rest day keys from settings
 * @returns Set of mandatory rest date keys
 */
export function buildMandatoryRestDayKeys(
	startDateKey: string,
	endDateKey: string,
	additionalMandatoryRestDays: string[],
): Set<string> {
	const startYear = parseDateKey(startDateKey).year;
	const endYear = parseDateKey(endDateKey).year;
	const restDays = new Set<string>(additionalMandatoryRestDays);

	for (let year = startYear; year <= endYear; year += 1) {
		const yearKeys = getMexicoMandatoryRestDayKeysForYear(year);
		for (const key of yearKeys) {
			restDays.add(key);
		}
	}

	return restDays;
}

export const MAX_VACATION_RANGE_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calculates the inclusive day span for a date-key range and validates limits.
 *
 * @param startDateKey - Range start in YYYY-MM-DD format
 * @param endDateKey - Range end in YYYY-MM-DD format
 * @returns Inclusive number of days in the range
 * @throws RangeError When the range is invalid or exceeds supported limits
 */
function getValidatedRangeDays(startDateKey: string, endDateKey: string): number {
	const startParts = parseDateKey(startDateKey);
	const endParts = parseDateKey(endDateKey);
	const startDate = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
	const endDate = Date.UTC(endParts.year, endParts.month - 1, endParts.day);

	if (endDate < startDate) {
		throw new RangeError('Invalid vacation date range');
	}

	const diffDays = Math.floor((endDate - startDate) / MS_PER_DAY) + 1;
	if (diffDays > MAX_VACATION_RANGE_DAYS) {
		throw new RangeError(`Vacation date range exceeds ${MAX_VACATION_RANGE_DAYS} days`);
	}

	return diffDays;
}

/**
 * Builds per-day vacation breakdown for a date range.
 *
 * @param args - Schedule, exceptions, and date inputs
 * @returns Day-by-day breakdown with service year counts
 */
export function buildVacationDayBreakdown(args: {
	startDateKey: string;
	endDateKey: string;
	scheduleDays: VacationScheduleDay[];
	exceptions: VacationScheduleException[];
	mandatoryRestDayKeys: Set<string>;
	incapacityDateKeys?: Set<string>;
	hireDate?: Date | null;
}): VacationDayBreakdown {
	const {
		startDateKey,
		endDateKey,
		scheduleDays,
		exceptions,
		mandatoryRestDayKeys,
		incapacityDateKeys,
		hireDate,
	} = args;

	const scheduleMap = new Map<number, boolean>();
	for (const day of scheduleDays) {
		scheduleMap.set(day.dayOfWeek, day.isWorkingDay);
	}

	const exceptionMap = new Map<string, VacationScheduleExceptionType>();
	for (const exception of exceptions) {
		const key = toDateKeyUtc(exception.exceptionDate);
		exceptionMap.set(key, exception.exceptionType);
	}

	const requestedDays = getValidatedRangeDays(startDateKey, endDateKey);
	const days: VacationDayDetail[] = [];
	const vacationDaysByServiceYear = new Map<number, number>();
	let vacationDays = 0;

	let cursor = startDateKey;
	for (let i = 0; i < requestedDays; i += 1) {
		const dayDate = new Date(`${cursor}T00:00:00Z`);
		const dayOfWeek = dayDate.getUTCDay();
		const serviceYearNumber = getServiceYearNumber(hireDate ?? null, cursor);

		let dayType: VacationDayType = 'SCHEDULED_REST_DAY';
		let countsAsVacationDay = false;

		if (incapacityDateKeys?.has(cursor)) {
			dayType = 'INCAPACITY';
		} else if (mandatoryRestDayKeys.has(cursor)) {
			dayType = 'MANDATORY_REST_DAY';
		} else {
			const exceptionType = exceptionMap.get(cursor);
			if (exceptionType) {
				if (exceptionType === 'DAY_OFF') {
					dayType = 'EXCEPTION_DAY_OFF';
				} else {
					dayType = 'EXCEPTION_WORKDAY';
					countsAsVacationDay = true;
				}
			} else {
				const isWorkingDay = scheduleMap.get(dayOfWeek) ?? false;
				if (isWorkingDay) {
					dayType = 'SCHEDULED_WORKDAY';
					countsAsVacationDay = true;
				}
			}
		}

		if (countsAsVacationDay) {
			vacationDays += 1;
			if (serviceYearNumber && serviceYearNumber > 0) {
				const current = vacationDaysByServiceYear.get(serviceYearNumber) ?? 0;
				vacationDaysByServiceYear.set(serviceYearNumber, current + 1);
			}
		}

		days.push({
			dateKey: cursor,
			countsAsVacationDay,
			dayType,
			serviceYearNumber,
		});

		if (cursor === endDateKey) {
			break;
		}
		cursor = addDaysToDateKey(cursor, 1);
	}

	return { days, vacationDays, vacationDaysByServiceYear };
}
