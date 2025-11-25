import { createApiClient } from '@sen-checkin/api-contract';

/**
 * Environment variable for the API base URL.
 * Falls back to localhost for local development.
 */
const API_BASE_URL: string =
	process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Typed Eden Treaty client for communicating with the Sen CheckIn API.
 * Provides full type safety for all API endpoints.
 *
 * Configured with credentials: 'include' to ensure BetterAuth session cookies
 * are sent with cross-origin requests when the API runs on a different origin/port
 * than the Next.js admin UI.
 */
export const api = createApiClient(API_BASE_URL, {
	$fetch: {
		credentials: 'include',
		mode: 'cors',
	},
});

export { API_BASE_URL };

