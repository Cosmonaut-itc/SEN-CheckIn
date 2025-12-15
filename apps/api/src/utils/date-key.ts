/**
 * Utilities for working with YYYY-MM-DD "date keys" in UTC.
 *
 * Date keys are treated as calendar dates (no time). All computations use UTC
 * to avoid local-machine timezone differences.
 */

export type ParsedDateKey = {
	year: number;
	month: number;
	day: number;
};

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

	// Validate round-trip to catch values like 2025-02-31.
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
	// Validate first
	parseDateKey(dateKey);

	const base = new Date(`${dateKey}T00:00:00Z`);
	base.setUTCDate(base.getUTCDate() + days);
	return toDateKeyUtc(base);
}
