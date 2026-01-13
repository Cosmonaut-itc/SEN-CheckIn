/**
 * Constants for Mexican labor law (LFT) and CONASAMI minimum wages by year.
 */
export const MINIMUM_WAGE_BY_YEAR = {
	2025: {
		GENERAL: 278.8,
		ZLFN: 419.88,
	},
	2026: {
		GENERAL: 315.04,
		ZLFN: 440.87,
	},
} as const;

/**
 * Default minimum wage values (latest configured year).
 */
export const MINIMUM_WAGES = MINIMUM_WAGE_BY_YEAR[2026];

/**
 * Shift hour limits per Mexican labor law.
 */
export const SHIFT_LIMITS = {
	DIURNA: { dailyHours: 8, weeklyHours: 48, divisor: 8 },
	NOCTURNA: { dailyHours: 7, weeklyHours: 42, divisor: 7 },
	MIXTA: { dailyHours: 7.5, weeklyHours: 45, divisor: 7.5 },
} as const;

/**
 * Overtime limits and multipliers.
 */
export const OVERTIME_LIMITS = {
	MAX_DAILY_HOURS: 3,
	MAX_WEEKLY_HOURS: 9,
	DOUBLE_RATE_MULTIPLIER: 2,
	TRIPLE_RATE_MULTIPLIER: 3,
} as const;

/**
 * Sunday premium rate (prima dominical).
 */
export const SUNDAY_PREMIUM_RATE = 0.25;
