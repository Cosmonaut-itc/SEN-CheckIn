import { describe, expect, it } from 'bun:test';

import { completeTourBodySchema, tourIdParamSchema } from './tours.js';

describe('tour schemas', () => {
	it('requires a non-empty tourId path parameter', () => {
		const result = tourIdParamSchema.safeParse({ tourId: '' });

		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error('Expected tourIdParamSchema to reject an empty tourId.');
		}

		expect(result.error.issues[0]?.message).toBe('tourId is required');
	});

	it('accepts completed and skipped as valid completion states', () => {
		expect(completeTourBodySchema.safeParse({ status: 'completed' }).success).toBe(true);
		expect(completeTourBodySchema.safeParse({ status: 'skipped' }).success).toBe(true);
	});

	it('rejects unsupported completion states', () => {
		const result = completeTourBodySchema.safeParse({ status: 'pending' });

		expect(result.success).toBe(false);
		if (result.success) {
			throw new Error('Expected completeTourBodySchema to reject invalid statuses.');
		}

		expect(result.error.issues[0]?.message).toContain('completed');
		expect(result.error.issues[0]?.message).toContain('skipped');
	});
});
