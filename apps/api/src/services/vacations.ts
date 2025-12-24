import { format } from 'date-fns';

import { addDaysToDateKey, parseDateKey, toDateKeyUtc } from '../utils/date-key.js';
import { getMexicoMandatoryRestDayKeysForYear } from '../utils/mexico-mandatory-rest-days.js';

export type VacationDayType =
	| 'SCHEDULED_WORKDAY'
	| 'SCHEDULED_REST_DAY'
	| 'EXCEPTION_WORKDAY'
	| 'EXCEPTION_DAY_OFF'
	| 'MANDATORY_REST_DAY';

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
 * @param serviceYearNumber - Service year number (>=1)
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
			hireDate.getUTCFullYear() + serviceYearNumber - 1,
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
 * @param serviceYearNumber - Service year number (>=1)
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
	hireDate?: Date | null;
}): VacationDayBreakdown {
	const { startDateKey, endDateKey, scheduleDays, exceptions, mandatoryRestDayKeys, hireDate } =
		args;

	const scheduleMap = new Map<number, boolean>();
	for (const day of scheduleDays) {
		scheduleMap.set(day.dayOfWeek, day.isWorkingDay);
	}

	const exceptionMap = new Map<string, VacationScheduleExceptionType>();
	for (const exception of exceptions) {
		const key = format(exception.exceptionDate, 'yyyy-MM-dd');
		exceptionMap.set(key, exception.exceptionType);
	}

	const days: VacationDayDetail[] = [];
	const vacationDaysByServiceYear = new Map<number, number>();
	let vacationDays = 0;

	let cursor = startDateKey;
	for (let i = 0; i < 2000 && cursor <= endDateKey; i += 1) {
		const dayDate = new Date(`${cursor}T00:00:00Z`);
		const dayOfWeek = dayDate.getUTCDay();
		const serviceYearNumber = getServiceYearNumber(hireDate ?? null, cursor);

		let dayType: VacationDayType = 'SCHEDULED_REST_DAY';
		let countsAsVacationDay = false;

		if (mandatoryRestDayKeys.has(cursor)) {
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
