/**
 * Converts a currency amount to integer cents using standard rounding.
 *
 * @param value - Amount in currency units (e.g., pesos)
 * @returns Rounded integer cents
 */
export function toCents(value: number): number {
	return Math.round((value + Number.EPSILON) * 100);
}

/**
 * Converts integer cents back to a currency amount with two decimals.
 *
 * @param cents - Amount in cents
 * @returns Currency amount rounded to two decimals
 */
export function fromCents(cents: number): number {
	return Number((cents / 100).toFixed(2));
}

/**
 * Rounds a currency amount to two decimals.
 *
 * @param value - Amount in currency units
 * @returns Rounded amount with two decimals
 */
export function roundCurrency(value: number): number {
	return fromCents(toCents(value));
}

/**
 * Sums currency amounts and returns a two-decimal result.
 *
 * @param values - Array of currency amounts
 * @returns Rounded sum with two decimals
 */
export function sumMoney(values: number[]): number {
	const totalCents = values.reduce((sum, value) => sum + toCents(value), 0);
	return fromCents(totalCents);
}
