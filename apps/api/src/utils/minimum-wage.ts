import { MINIMUM_WAGES } from './mexico-labor-constants.js';

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
 * Resolves the minimum wage requirement for a set of zones.
 *
 * @param zones - Geographic zones to evaluate
 * @returns Minimum wage requirement details
 */
export function resolveMinimumWageRequirement(zones: MinimumWageZone[]): MinimumWageRequirement {
	const normalizedZones =
		zones.length > 0 ? Array.from(new Set(zones)) : (['GENERAL'] as MinimumWageZone[]);
	const minimumRequiredDailyPay = Math.max(
		...normalizedZones.map((zone) => MINIMUM_WAGES[zone]),
	);
	return {
		zones: normalizedZones,
		minimumRequiredDailyPay,
	};
}
