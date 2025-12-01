/**
 * Normalize a user code by removing non-alphanumeric characters and uppercasing.
 *
 * @param value - Raw user-entered code (may include dashes/spaces)
 * @returns Normalized code string
 */
export function normalizeUserCode(value: string): string {
	return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Format a normalized user code into XXXX-XXXX blocks for readability.
 *
 * @param value - Raw or normalized code
 * @returns Formatted user code
 */
export function formatUserCode(value: string): string {
	const normalized = normalizeUserCode(value);
	return normalized.match(/.{1,4}/g)?.join('-') ?? normalized;
}
