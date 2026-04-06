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
	 */
	constructor(config: RateLimitConfig) {
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
}
