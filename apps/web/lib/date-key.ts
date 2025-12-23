/**
 * Utilities for working with YYYY-MM-DD "date keys".
 *
 * Date keys represent calendar dates without time. All computations use UTC math to avoid
 * local-machine timezone differences.
 *
 * @module date-key
 */

export interface ParsedDateKey {
	year: number;
	month: number;
	day: number;
}

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a YYYY-MM-DD date key into numeric components.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Parsed date parts
 * @throws When the date key is not valid or represents an invalid calendar date
 */
export function parseDateKey(dateKey: string): ParsedDateKey {
	if (!DATE_KEY_REGEX.test(dateKey)) {
		throw new Error(`Invalid dateKey "${dateKey}". Expected format YYYY-MM-DD.`);
	}

	const [yearString, monthString, dayString] = dateKey.split('-');
	const year = Number(yearString);
	const month = Number(monthString);
	const day = Number(dayString);

	if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
		throw new Error(`Invalid dateKey "${dateKey}". Expected numeric YYYY-MM-DD.`);
	}

	const utc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
	if (Number.isNaN(utc.getTime())) {
		throw new Error(`Invalid dateKey "${dateKey}". Date is not a valid calendar day.`);
	}

	const roundTrip = utc.toISOString().slice(0, 10);
	if (roundTrip !== dateKey) {
		throw new Error(`Invalid dateKey "${dateKey}". Date is not a valid calendar day.`);
	}

	return { year, month, day };
}

/**
 * Formats a Date into a YYYY-MM-DD key using UTC.
 *
 * @param date - Date instance
 * @returns Date key in YYYY-MM-DD format (UTC)
 */
export function toDateKeyUtc(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/**
 * Adds calendar days to a date key (UTC-safe).
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @param days - Number of days to add (can be negative)
 * @returns Resulting date key in YYYY-MM-DD format
 * @throws When the input date key is invalid
 */
export function addDaysToDateKey(dateKey: string, days: number): string {
	parseDateKey(dateKey);
	const base = new Date(`${dateKey}T00:00:00Z`);
	base.setUTCDate(base.getUTCDate() + days);
	return toDateKeyUtc(base);
}

/**
 * Returns the UTC day-of-week index for a date key.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Day index (0=Sunday..6=Saturday)
 * @throws When the input date key is invalid
 */
export function getDayOfWeekFromDateKey(dateKey: string): number {
	parseDateKey(dateKey);
	const utc = new Date(`${dateKey}T00:00:00Z`);
	return utc.getUTCDay();
}

/**
 * Computes the week start key (YYYY-MM-DD) for a given date key.
 *
 * Weeks are cut using the configured `weekStartDay` (0 = Sunday … 6 = Saturday).
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @param weekStartDay - Week start day index (0=Sunday..6=Saturday)
 * @returns Week start date key in YYYY-MM-DD format
 * @throws When `dateKey` is invalid or `weekStartDay` is outside 0..6
 */
export function getWeekStartDateKey(dateKey: string, weekStartDay: number): string {
	if (!Number.isInteger(weekStartDay) || weekStartDay < 0 || weekStartDay > 6) {
		throw new Error(`Invalid weekStartDay "${weekStartDay}". Expected an integer 0..6.`);
	}

	parseDateKey(dateKey);
	const utc = new Date(`${dateKey}T00:00:00Z`);
	const dayOfWeek = utc.getUTCDay();
	const diff = (dayOfWeek - weekStartDay + 7) % 7;
	utc.setUTCDate(utc.getUTCDate() - diff);
	return toDateKeyUtc(utc);
}

/**
 * Returns the first day of the month for a given date key.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns YYYY-MM-DD for the first day of the month
 * @throws When the input date key is invalid
 */
export function getStartOfMonthDateKey(dateKey: string): string {
	const { year, month } = parseDateKey(dateKey);
	const monthString = String(month).padStart(2, '0');
	return `${year}-${monthString}-01`;
}

/**
 * Returns the last day of the month for a given date key.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns YYYY-MM-DD for the last day of the month
 * @throws When the input date key is invalid
 */
export function getEndOfMonthDateKey(dateKey: string): string {
	const { year, month } = parseDateKey(dateKey);
	const lastDay = new Date(Date.UTC(year, month, 0));
	return toDateKeyUtc(lastDay);
}
