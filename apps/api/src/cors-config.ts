import { cors } from '@elysiajs/cors';

import { buildCorsOriginAllowlist, isOriginAllowed } from './utils/origin-allowlist.js';

export const API_CORS_ALLOWED_HEADERS = [
	'Content-Type',
	'Authorization',
	'x-api-key',
	'x-internal-token',
	'x-client-platform',
	'x-client-network-type',
	'x-image-payload-bytes',
] as const;

export const API_CORS_EXPOSED_HEADERS = ['x-request-id', 'server-timing'] as const;

/**
 * Builds the API CORS plugin with the repo's allowlist and exposed diagnostic headers.
 *
 * @returns Configured Elysia CORS plugin
 */
export function createApiCorsPlugin(): ReturnType<typeof cors> {
	const corsAllowedOrigins = buildCorsOriginAllowlist({
		authBaseUrl: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
		corsOrigin: process.env.CORS_ORIGIN,
	});

	return cors({
		origin: (request: Request) =>
			isOriginAllowed(request.headers.get('origin'), {
				configuredOrigins: corsAllowedOrigins,
				nodeEnv: process.env.NODE_ENV,
			}),
		methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
		credentials: true,
		allowedHeaders: [...API_CORS_ALLOWED_HEADERS],
		exposeHeaders: [...API_CORS_EXPOSED_HEADERS],
	});
}
