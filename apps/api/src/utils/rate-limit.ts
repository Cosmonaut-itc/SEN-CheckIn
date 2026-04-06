/**
 * Rate limiter configuration.
 */
interface RateLimitConfig {
	/** Maximum number of requests allowed in the window. */
	maxRequests: number;
	/** Time window in milliseconds. */
	windowMs: number;
}

/**
 * Result returned after evaluating a rate-limited request.
 */
interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetMs: number;
}

/**
 * Simple in-memory sliding window rate limiter keyed by user identifier.
 */
export class RateLimiter {
	private readonly config: RateLimitConfig;
	private readonly timestamps: Map<string, number[]> = new Map();

	/**
	 * Creates a new rate limiter instance.
	 *
	 * @param config - Rate limiter thresholds and window size
	 * @returns RateLimiter instance
	 * @throws {RangeError} When the configuration values are invalid
	 */
	constructor(config: RateLimitConfig) {
		validateRateLimitConfig(config);
		this.config = config;
	}

	/**
	 * Evaluates whether a request for the given key is allowed.
	 *
	 * @param key - Stable identifier for the subject being rate-limited
	 * @returns Rate limit decision with remaining quota and reset time
	 */
	check(key: string): RateLimitResult {
		const now = Date.now();
		const windowStart = now - this.config.windowMs;

		this.pruneExpiredKeys(windowStart);

		const existingTimestamps = this.timestamps.get(key) ?? [];
		const recentTimestamps = existingTimestamps.filter((timestamp) => timestamp > windowStart);

		if (recentTimestamps.length >= this.config.maxRequests) {
			const oldestTimestamp = recentTimestamps[0] ?? now;
			return {
				allowed: false,
				remaining: 0,
				resetMs: oldestTimestamp + this.config.windowMs - now,
			};
		}

		recentTimestamps.push(now);
		this.timestamps.set(key, recentTimestamps);

		const resetTimestamp = recentTimestamps[0] ?? now;
		return {
			allowed: true,
			remaining: this.config.maxRequests - recentTimestamps.length,
			resetMs: resetTimestamp + this.config.windowMs - now,
		};
	}

	/**
	 * Clears all tracked timestamps. Intended for deterministic tests.
	 *
	 * @returns Nothing
	 */
	reset(): void {
		this.timestamps.clear();
	}

	/**
	 * Removes entries whose full request history has already expired.
	 *
	 * @param windowStart - Inclusive lower bound for timestamps still inside the window
	 * @returns Nothing
	 */
	private pruneExpiredKeys(windowStart: number): void {
		for (const [key, timestamps] of this.timestamps.entries()) {
			const recentTimestamps = timestamps.filter((timestamp) => timestamp > windowStart);
			if (recentTimestamps.length === 0) {
				this.timestamps.delete(key);
				continue;
			}

			if (recentTimestamps.length !== timestamps.length) {
				this.timestamps.set(key, recentTimestamps);
			}
		}
	}
}

/**
 * Validates rate-limiter configuration before the limiter is constructed.
 *
 * @param config - Rate limiter thresholds and window size
 * @returns Nothing
 * @throws {RangeError} When any configuration value is invalid
 */
function validateRateLimitConfig(config: RateLimitConfig): void {
	if (!Number.isInteger(config.maxRequests) || config.maxRequests <= 0) {
		throw new RangeError('maxRequests must be a positive integer.');
	}

	if (!Number.isFinite(config.windowMs) || config.windowMs <= 0) {
		throw new RangeError('windowMs must be a positive number.');
	}
}
