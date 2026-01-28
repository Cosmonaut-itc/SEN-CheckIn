/**
 * Shared pagination helpers for web client/server queries.
 *
 * @module pagination
 */

/**
 * Maximum page size accepted by the API.
 */
export const MAX_PAGINATION_LIMIT = 100;

/**
 * Ensures pagination limits stay within API bounds.
 *
 * @param limit - Requested limit
 * @param fallback - Fallback limit when the input is invalid
 * @returns Clamped limit between 1 and MAX_PAGINATION_LIMIT
 */
export function clampPaginationLimit(
	limit: number | undefined,
	fallback: number = MAX_PAGINATION_LIMIT,
): number {
	const resolvedLimit = Number.isFinite(limit) ? Math.floor(limit as number) : fallback;
	const normalizedFallback = Number.isFinite(fallback)
		? Math.floor(fallback)
		: MAX_PAGINATION_LIMIT;
	const normalized = Number.isFinite(resolvedLimit) ? resolvedLimit : normalizedFallback;

	return Math.min(MAX_PAGINATION_LIMIT, Math.max(1, normalized));
}

/**
 * Ensures pagination offsets stay within valid bounds.
 *
 * @param offset - Requested offset
 * @returns Non-negative offset (integer)
 */
export function clampPaginationOffset(offset: number | undefined): number {
	const resolvedOffset = Number.isFinite(offset) ? Math.floor(offset as number) : 0;
	return Math.max(0, resolvedOffset);
}
