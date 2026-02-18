/**
 * Time zone utilities for the web app.
 *
 * This module intentionally avoids adding heavyweight timezone dependencies and uses
 * the Intl APIs available in modern runtimes.
 *
 * @module time-zone
 */

import { addDaysToDateKey, parseDateKey } from '@/lib/date-key';

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

/**
 * Computes the timezone offset (ms) for a given UTC instant and timezone.
 *
 * This uses the "format-to-parts" technique:
 * - format the UTC instant as local parts in `timeZone`
 * - interpret those parts as if they were UTC
 * - difference between "parts-as-UTC" and the original instant is the offset
 *
 * @param timestamp - UTC instant
 * @param timeZone - IANA timezone identifier
 * @returns Offset in milliseconds (can be negative)
 */
export function getTimeZoneOffsetMs(timestamp: Date, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(timestamp);

	const yearPart = parts.find((p) => p.type === 'year')?.value;
	const monthPart = parts.find((p) => p.type === 'month')?.value;
	const dayPart = parts.find((p) => p.type === 'day')?.value;
	const hourPart = parts.find((p) => p.type === 'hour')?.value;
	const minutePart = parts.find((p) => p.type === 'minute')?.value;
	const secondPart = parts.find((p) => p.type === 'second')?.value;

	if (!yearPart || !monthPart || !dayPart || !hourPart || !minutePart || !secondPart) {
		throw new Error(`Failed to format time parts for timezone "${timeZone}".`);
	}

	const asUtcMs = Date.UTC(
		Number(yearPart),
		Number(monthPart) - 1,
		Number(dayPart),
		Number(hourPart),
		Number(minutePart),
		Number(secondPart),
	);

	return asUtcMs - timestamp.getTime();
}

/**
 * Converts a local midnight (YYYY-MM-DD 00:00:00) in a timezone into its UTC instant.
 *
 * @param dateKey - Local date key in YYYY-MM-DD format
 * @param timeZone - IANA timezone identifier
 * @returns Date representing the UTC instant of local midnight
 * @throws When the date key or timezone is invalid
 */
export function getUtcDateForZonedMidnight(dateKey: string, timeZone: string): Date {
	const { year, month, day } = parseDateKey(dateKey);

	const baseUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
	let guessUtcMs = baseUtcMs;

	for (let i = 0; i < 4; i += 1) {
		const offsetMs = getTimeZoneOffsetMs(new Date(guessUtcMs), timeZone);
		const candidateUtcMs = baseUtcMs - offsetMs;
		if (candidateUtcMs === guessUtcMs) {
			break;
		}
		guessUtcMs = candidateUtcMs;
	}

	return new Date(guessUtcMs);
}

/**
 * Builds an inclusive UTC day range for a local date key in a timezone.
 *
 * @param dateKey - Local date key in YYYY-MM-DD format
 * @param timeZone - IANA timezone identifier
 * @returns UTC start and end instants for the local day
 */
export function getUtcDayRangeFromDateKey(
	dateKey: string,
	timeZone: string,
): { startUtc: Date; endUtc: Date } {
	const startUtc = getUtcDateForZonedMidnight(dateKey, timeZone);
	const endExclusiveUtc = getUtcDateForZonedMidnight(addDaysToDateKey(dateKey, 1), timeZone);
	return {
		startUtc,
		endUtc: new Date(endExclusiveUtc.getTime() - 1),
	};
}
