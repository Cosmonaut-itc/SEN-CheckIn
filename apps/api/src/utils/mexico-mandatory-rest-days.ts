import { toDateKeyUtc } from './date-key.js';

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Computes the date key for the Nth occurrence of a weekday in a given month.
 *
 * Example: first Monday of February.
 *
 * @param args - Month/weekday selection parameters
 * @returns Date key in YYYY-MM-DD format (UTC)
 * @throws When the computed date falls outside the month (invalid occurrence)
 */
function getNthWeekdayOfMonthDateKey(args: {
	year: number;
	monthIndex: number; // 0=Jan..11=Dec
	weekday: Weekday; // 0=Sun..6=Sat
	occurrence: number; // 1=first, 2=second, ...
}): string {
	const { year, monthIndex, weekday, occurrence } = args;
	if (!Number.isInteger(occurrence) || occurrence < 1) {
		throw new Error(`Invalid weekday occurrence "${occurrence}". Expected integer >= 1.`);
	}

	const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
	const firstDow = firstOfMonth.getUTCDay() as Weekday;
	const offsetToWeekday = (weekday - firstDow + 7) % 7;
	const dayOfMonth = 1 + offsetToWeekday + 7 * (occurrence - 1);

	const candidate = new Date(Date.UTC(year, monthIndex, dayOfMonth, 0, 0, 0, 0));
	if (candidate.getUTCMonth() !== monthIndex) {
		throw new Error(
			`Invalid occurrence "${occurrence}" for weekday "${weekday}" in ${year}-${String(
				monthIndex + 1,
			).padStart(2, '0')}.`,
		);
	}

	return toDateKeyUtc(candidate);
}

/**
 * Determines whether a year is a presidential transition year (sexenio boundary).
 *
 * The 2024 reform changed the rest day from Dec 1 to Oct 1 every six years.
 * We model:
 * - years >= 2024 with (year - 2024) % 6 === 0 -> Oct 1
 * - years < 2024 with (year - 2018) % 6 === 0 -> Dec 1 (legacy behavior)
 *
 * @param year - Calendar year
 * @returns Transition date key (YYYY-MM-DD) or null when not a transition year
 */
function getPresidentialTransitionDateKey(year: number): string | null {
	if (!Number.isInteger(year)) {
		return null;
	}

	if (year >= 2024) {
		return (year - 2024) % 6 === 0 ? `${year}-10-01` : null;
	}

	return (year - 2018) % 6 === 0 ? `${year}-12-01` : null;
}

/**
 * Returns Mexico mandatory rest day date keys for a given year (LFT Art. 74).
 *
 * Included:
 * - Jan 1
 * - First Monday of February
 * - Third Monday of March
 * - May 1
 * - Sep 16
 * - Third Monday of November
 * - Presidential transition day (Oct 1 every 6 years starting 2024; Dec 1 legacy)
 * - Dec 25
 *
 * Not included:
 * - Election day (Art. 74 fr. IX) because it depends on federal/local election laws.
 *   This should be provided as a configurable date list per organization.
 *
 * @param year - Calendar year
 * @returns Set of YYYY-MM-DD date keys (UTC)
 */
export function getMexicoMandatoryRestDayKeysForYear(year: number): Set<string> {
	const keys = new Set<string>();

	// Fixed dates
	keys.add(`${year}-01-01`); // Año Nuevo
	keys.add(`${year}-05-01`); // Día del Trabajo
	keys.add(`${year}-09-16`); // Independencia
	keys.add(`${year}-12-25`); // Navidad

	// Move-to-Monday dates
	keys.add(
		getNthWeekdayOfMonthDateKey({
			year,
			monthIndex: 1, // Feb
			weekday: 1, // Monday
			occurrence: 1,
		}),
	); // Día de la Constitución (primer lunes de febrero)
	keys.add(
		getNthWeekdayOfMonthDateKey({
			year,
			monthIndex: 2, // Mar
			weekday: 1, // Monday
			occurrence: 3,
		}),
	); // Natalicio de Benito Juárez (tercer lunes de marzo)
	keys.add(
		getNthWeekdayOfMonthDateKey({
			year,
			monthIndex: 10, // Nov
			weekday: 1, // Monday
			occurrence: 3,
		}),
	); // Revolución Mexicana (tercer lunes de noviembre)

	const transition = getPresidentialTransitionDateKey(year);
	if (transition) {
		keys.add(transition);
	}

	return keys;
}

