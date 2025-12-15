/**
 * Date formatting helpers for deterministic SSR + hydration output.
 *
 * We intentionally use a fixed locale (`es-MX`) and timezone (`UTC`) so server
 * and client render the same strings regardless of the user's browser locale
 * or timezone.
 *
 * @module date-format
 */

const MONTH_DAY_UTC = new Intl.DateTimeFormat('es-MX', {
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC',
});

const SHORT_DATE_UTC = new Intl.DateTimeFormat('es-MX', {
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC',
});

/**
 * Formats a date as `d MMM` (e.g., "8 dic") in UTC.
 *
 * @param date - Date instance to format
 * @returns Formatted date string
 */
export function formatMonthDayUtc(date: Date): string {
	return MONTH_DAY_UTC.format(date);
}

/**
 * Formats a date as `d MMM yyyy` (e.g., "8 dic 2025") in UTC.
 *
 * @param date - Date instance to format
 * @returns Formatted date string
 */
export function formatShortDateUtc(date: Date): string {
	return SHORT_DATE_UTC.format(date);
}

/**
 * Formats a date range as `d MMM yyyy – d MMM yyyy` in UTC.
 *
 * @param start - Range start date
 * @param end - Range end date
 * @returns Formatted date range string
 */
export function formatDateRangeUtc(start: Date, end: Date): string {
	return `${formatShortDateUtc(start)} – ${formatShortDateUtc(end)}`;
}
