const NEGATIVE_TIMESTAMP_PATTERN = /negative time stamp/i;

/**
 * Determines whether a thrown error matches the negative timestamp
 * failure from Performance.measure.
 *
 * @param error - Error thrown by Performance.measure
 * @returns True when the error should be ignored
 */
function isNegativeTimestampError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	return NEGATIVE_TIMESTAMP_PATTERN.test(error.message);
}

/**
 * Installs a guard that prevents known Performance.measure negative
 * timestamp errors from crashing the client runtime.
 *
 * @returns Nothing
 */
export function installPerformanceMeasureGuard(): void {
	if (typeof performance === 'undefined' || typeof performance.measure !== 'function') {
		return;
	}

	const existing = performance.measure as Performance['measure'] & {
		__senCheckinGuarded?: boolean;
	};

	if (existing.__senCheckinGuarded) {
		return;
	}

	const originalMeasure = existing.bind(performance);
	const guardedMeasure = ((name, startOrMeasureOptions, endMark) => {
		try {
			return originalMeasure(name, startOrMeasureOptions as never, endMark as never);
		} catch (error) {
			if (isNegativeTimestampError(error)) {
				return undefined;
			}
			throw error;
		}
	}) as Performance['measure'] & { __senCheckinGuarded?: boolean };

	guardedMeasure.__senCheckinGuarded = true;
	performance.measure = guardedMeasure;
}

installPerformanceMeasureGuard();
