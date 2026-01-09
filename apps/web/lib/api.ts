import { createApiClient } from '@sen-checkin/api-contract';

/**
 * Environment variable for the API base URL.
 * Falls back to localhost for local development.
 */
const FALLBACK_API_ORIGIN: string = (
	process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'
).replace(/\/$/, '');

/**
 * Resolves the API base URL for browser requests.
 *
 * Uses the web origin proxy (`/api`) when available to ensure session cookies
 * are sent on same-origin requests. Falls back to the API origin for non-browser
 * environments without a configured web URL.
 *
 * @returns Resolved API base URL
 */
function resolveApiBaseUrl(): string {
	if (typeof window !== 'undefined' && window.location?.origin) {
		return `${window.location.origin}/api`;
	}

	const envWebUrl = process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, '');
	if (envWebUrl) {
		return `${envWebUrl}/api`;
	}

	return FALLBACK_API_ORIGIN;
}

const API_BASE_URL: string = resolveApiBaseUrl();

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
