/**
 * Request/Response logger plugin for Elysia.
 * Automatically logs all incoming requests and outgoing responses with timing information.
 *
 * @module plugins/logger
 */

import { Elysia } from 'elysia';

import { logger } from '../logger/index.js';

/**
 * Map to store request start times by request URL.
 * Uses WeakMap-like pattern with request objects for automatic cleanup.
 */
const requestTimings = new Map<string, number>();

/**
 * Generates a unique key for a request.
 *
 * @param request - The request object
 * @returns Unique identifier for the request
 */
function getRequestKey(request: Request): string {
	return `${request.method}:${request.url}:${Date.now()}:${Math.random()}`;
}

/**
 * Elysia plugin that provides automatic request/response logging.
 *
 * Features:
 * - Logs all incoming requests with method, path, and query params
 * - Logs all responses with status code and duration
 * - Excludes noisy endpoints (health checks, OpenAPI docs)
 * - Configurable through environment variables
 *
 * @example
 * ```typescript
 * import { Elysia } from 'elysia';
 * import { loggerPlugin } from './plugins/logger.js';
 *
 * const app = new Elysia()
 *   .use(loggerPlugin)
 *   .get('/', () => 'Hello World');
 * ```
 */
export const loggerPlugin = new Elysia({ name: 'request-logger' })
	// Store request start time and add timing key to context - use 'scoped' to apply to parent and descendants
	.derive({ as: 'scoped' }, ({ request }) => {
		const requestKey = getRequestKey(request);
		requestTimings.set(requestKey, performance.now());
		return { requestKey };
	})
	// Log incoming requests - use 'scoped' to apply to parent and descendants
	.onBeforeHandle({ as: 'scoped' }, ({ request }) => {
		const url = new URL(request.url);
		const path = url.pathname;

		// Skip logging for noisy endpoints
		if (shouldSkipLogging(path)) {
			return;
		}

		const method = request.method;
		const queryParams = Object.fromEntries(url.searchParams.entries());

		logger.request(method, path, {
			...(Object.keys(queryParams).length > 0 && { query: queryParams }),
		});
	})
	// Log responses - use 'scoped' to apply to parent and descendants
	.onAfterResponse({ as: 'scoped' }, ({ request, set, requestKey }) => {
		const url = new URL(request.url);
		const path = url.pathname;

		// Skip logging for noisy endpoints
		if (shouldSkipLogging(path)) {
			// Clean up timing entry
			requestTimings.delete(requestKey);
			return;
		}

		const method = request.method;
		const status = typeof set.status === 'number' ? set.status : 200;

		// Calculate request duration
		const startTime = requestTimings.get(requestKey);
		const durationMs = startTime ? performance.now() - startTime : 0;

		// Clean up timing entry
		requestTimings.delete(requestKey);

		logger.response(method, path, status, durationMs);
	});

/**
 * Paths that should be excluded from logging.
 * These are typically high-frequency or internal endpoints.
 */
const SKIP_PATHS: string[] = [
	'/health',
	'/healthz',
	'/ready',
	'/readyz',
	'/live',
	'/livez',
	'/metrics',
	'/openapi.json',
	'/swagger',
	'/swagger.json',
	'/docs',
];

/**
 * Path prefixes that should be excluded from logging.
 */
const SKIP_PATH_PREFIXES: string[] = ['/swagger/', '/docs/'];

/**
 * Determines if a request path should skip logging.
 *
 * @param path - Request path to check
 * @returns Whether to skip logging for this path
 */
function shouldSkipLogging(path: string): boolean {
	// Check exact matches
	if (SKIP_PATHS.includes(path)) {
		return true;
	}

	// Check prefix matches
	for (const prefix of SKIP_PATH_PREFIXES) {
		if (path.startsWith(prefix)) {
			return true;
		}
	}

	return false;
}

export default loggerPlugin;
