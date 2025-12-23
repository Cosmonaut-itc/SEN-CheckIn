/**
 * Time zone utilities for the web app.
 *
 * This module intentionally avoids adding heavyweight timezone dependencies and uses
 * the Intl APIs available in modern runtimes.
 *
 * @module time-zone
 */

export interface ParsedDateKey {
	year: number;
	month: number;
	day: number;
}

/**
 * Checks whether a value is a valid IANA timezone identifier.
 *
 * @param timeZone - IANA timezone (e.g., "America/Mexico_City")
 * @returns True when the timezone is supported by the runtime
 */
export function isValidIanaTimeZone(timeZone: string): boolean {
	try {
		const formatter = new Intl.DateTimeFormat('en-US', { timeZone });
		formatter.format(0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Extracts local date parts for a UTC instant in a given timezone.
 *
 * @param timestamp - UTC instant
 * @param timeZone - IANA timezone identifier
 * @returns Parsed date key parts (year/month/day) in the given timezone
 * @throws When the timezone is invalid or date parts cannot be extracted
 */
export function getDatePartsInTimeZone(timestamp: Date, timeZone: string): ParsedDateKey {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(timestamp);

	const yearPart = parts.find((p) => p.type === 'year')?.value;
	const monthPart = parts.find((p) => p.type === 'month')?.value;
	const dayPart = parts.find((p) => p.type === 'day')?.value;

	if (!yearPart || !monthPart || !dayPart) {
		throw new Error(`Failed to format date parts for timezone "${timeZone}".`);
	}

	return {
		year: Number(yearPart),
		month: Number(monthPart),
		day: Number(dayPart),
	};
}

/**
 * Formats a UTC instant as a YYYY-MM-DD date key in a given timezone.
 *
 * @param timestamp - UTC instant
 * @param timeZone - IANA timezone identifier
 * @returns Date key in YYYY-MM-DD format (local to timezone)
 */
export function toDateKeyInTimeZone(timestamp: Date, timeZone: string): string {
	const { year, month, day } = getDatePartsInTimeZone(timestamp, timeZone);
	const monthString = String(month).padStart(2, '0');
	const dayString = String(day).padStart(2, '0');
	return `${year}-${monthString}-${dayString}`;
}
