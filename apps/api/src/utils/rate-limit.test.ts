import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { RateLimiter } from './rate-limit.js';

describe('RateLimiter', () => {
	let limiter: RateLimiter;
	const originalDateNow = Date.now;
	let currentTime = 1_000;

	beforeEach(() => {
		currentTime = 1_000;
		Date.now = (): number => currentTime;
		limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000 });
	});

	afterEach(() => {
		Date.now = originalDateNow;
	});

	it('allows requests under the limit', () => {
		expect(limiter.check('user-1').allowed).toBe(true);
		expect(limiter.check('user-1').allowed).toBe(true);
		expect(limiter.check('user-1').allowed).toBe(true);
	});

	it('blocks requests over the limit', () => {
		limiter.check('user-1');
		limiter.check('user-1');
		limiter.check('user-1');

		const result = limiter.check('user-1');

		expect(result.allowed).toBe(false);
		expect(result.remaining).toBe(0);
	});

	it('tracks users independently', () => {
		limiter.check('user-1');
		limiter.check('user-1');
		limiter.check('user-1');

		expect(limiter.check('user-1').allowed).toBe(false);
		expect(limiter.check('user-2').allowed).toBe(true);
	});

	it('returns remaining count', () => {
		const firstResult = limiter.check('user-1');
		const secondResult = limiter.check('user-1');
		const thirdResult = limiter.check('user-1');

		expect(firstResult.remaining).toBe(2);
		expect(secondResult.remaining).toBe(1);
		expect(thirdResult.remaining).toBe(0);
	});

	it('allows requests again after the window expires', () => {
		limiter.check('user-1');
		limiter.check('user-1');
		limiter.check('user-1');

		currentTime += 60_001;

		const result = limiter.check('user-1');

		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(2);
	});

	it('rejects invalid constructor configuration', () => {
		expect(() => new RateLimiter({ maxRequests: 0, windowMs: 60_000 })).toThrow(
			'maxRequests must be a positive integer.',
		);
		expect(() => new RateLimiter({ maxRequests: 3, windowMs: 0 })).toThrow(
			'windowMs must be a positive number.',
		);
	});
});
