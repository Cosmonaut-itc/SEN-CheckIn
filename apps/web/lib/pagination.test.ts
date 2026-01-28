import { describe, expect, it } from 'vitest';

import {
	MAX_PAGINATION_LIMIT,
	clampPaginationLimit,
	clampPaginationOffset,
} from '@/lib/pagination';

describe('pagination helpers', () => {
	it('clamps limits to API bounds', () => {
		expect(clampPaginationLimit(undefined)).toBe(MAX_PAGINATION_LIMIT);
		expect(clampPaginationLimit(MAX_PAGINATION_LIMIT + 50)).toBe(MAX_PAGINATION_LIMIT);
		expect(clampPaginationLimit(1)).toBe(1);
		expect(clampPaginationLimit(0)).toBe(1);
		expect(clampPaginationLimit(-10)).toBe(1);
	});

	it('normalizes limit values', () => {
		expect(clampPaginationLimit(10.9)).toBe(10);
		expect(clampPaginationLimit(undefined, 25)).toBe(25);
		expect(clampPaginationLimit(undefined, 250)).toBe(MAX_PAGINATION_LIMIT);
	});

	it('normalizes offsets', () => {
		expect(clampPaginationOffset(undefined)).toBe(0);
		expect(clampPaginationOffset(-5)).toBe(0);
		expect(clampPaginationOffset(3.7)).toBe(3);
		expect(clampPaginationOffset(12)).toBe(12);
	});
});
