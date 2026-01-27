import { afterEach, describe, expect, it, vi } from 'vitest';

import { installPerformanceMeasureGuard } from './instrumentation-client';

const baseMeasure = performance.measure;

afterEach(() => {
	performance.measure = baseMeasure;
	vi.restoreAllMocks();
});

describe('instrumentation-client', () => {
	it('swallows negative timestamp errors from performance.measure', () => {
		const error = new Error('LoginPage cannot have a negative time stamp');
		const measureMock = vi.fn(() => {
			throw error;
		});

		performance.measure = measureMock as unknown as Performance['measure'];
		installPerformanceMeasureGuard();

		expect(() => performance.measure('LoginPage')).not.toThrow();
		expect(measureMock).toHaveBeenCalled();
	});

	it('rethrows non-negative timestamp errors', () => {
		const error = new Error('Unexpected measure error');
		const measureMock = vi.fn(() => {
			throw error;
		});

		performance.measure = measureMock as unknown as Performance['measure'];
		installPerformanceMeasureGuard();

		expect(() => performance.measure('LoginPage')).toThrow(error);
	});
});
