import { parseDateKey } from './date-key.js';

/**
 * Resolves days in the calendar year for a given date key.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Days in year (365 or 366)
 */
export function resolveYearDaysFromDateKey(dateKey: string): number {
	const { year } = parseDateKey(dateKey);
	const leapCandidate = new Date(Date.UTC(year, 1, 29));
	return leapCandidate.getUTCMonth() === 1 ? 366 : 365;
}

/**
 * Resolves days in the calendar year for a given year number.
 *
 * @param year - Calendar year
 * @returns Days in year (365 or 366)
 */
export function resolveYearDays(year: number): number {
	const leapCandidate = new Date(Date.UTC(year, 1, 29));
	return leapCandidate.getUTCMonth() === 1 ? 366 : 365;
}
