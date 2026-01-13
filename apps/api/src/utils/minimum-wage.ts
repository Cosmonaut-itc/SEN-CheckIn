import { MINIMUM_WAGE_BY_YEAR, MINIMUM_WAGES } from './mexico-labor-constants.js';
import { toDateKeyUtc } from './date-key.js';

/**
 * Valid geographic zones for minimum wage validation.
 */
export type MinimumWageZone = keyof typeof MINIMUM_WAGES;

/**
 * Minimum wage requirement details for a set of zones.
 */
export interface MinimumWageRequirement {
	/** Zones considered when validating minimum wage */
	zones: MinimumWageZone[];
	/** Maximum daily minimum wage across the zones */
	minimumRequiredDailyPay: number;
}

/**
 * Resolves the minimum wage daily value for a date key and zone.
 *
 * @param args - Minimum wage lookup inputs
 * @param args.dateKey - Date key (YYYY-MM-DD)
 * @param args.zone - Geographic zone identifier
 * @returns Minimum wage daily value
 */
export function resolveMinimumWageDaily(args: {
	dateKey: string;
	zone: MinimumWageZone;
}): number {
	const { dateKey, zone } = args;
	const effectiveYear = dateKey >= '2026-01-01' ? 2026 : 2025;
	return MINIMUM_WAGE_BY_YEAR[effectiveYear][zone];
}

/**
 * Resolves the minimum wage requirement for a set of zones.
 *
 * @param zones - Geographic zones to evaluate
 * @param dateKey - Optional date key to resolve the effective wage (defaults to today)
 * @returns Minimum wage requirement details
 */
export function resolveMinimumWageRequirement(
	zones: MinimumWageZone[],
	dateKey: string = toDateKeyUtc(new Date()),
): MinimumWageRequirement {
	const normalizedZones =
		zones.length > 0 ? Array.from(new Set(zones)) : (['GENERAL'] as MinimumWageZone[]);
	const minimumRequiredDailyPay = Math.max(
		...normalizedZones.map((zone) =>
			resolveMinimumWageDaily({ dateKey, zone }),
		),
	);
	return {
		zones: normalizedZones,
		minimumRequiredDailyPay,
	};
}
