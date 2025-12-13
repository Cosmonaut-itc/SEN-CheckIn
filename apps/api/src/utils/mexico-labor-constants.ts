/**
 * Constants for Mexican labor law (LFT) and CONASAMI 2025 minimum wages.
 */
export const MINIMUM_WAGES = {
	GENERAL: 278.8,
	ZLFN: 419.88,
} as const;

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

