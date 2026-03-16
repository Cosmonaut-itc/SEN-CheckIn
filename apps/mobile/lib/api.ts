import { createApiClient, type ApiClient } from '@sen-checkin/api-contract';

import { ENV, envErrors, envIsValid } from '@/constants/env';
import { getAccessToken } from './auth-client';

/**
 * Base URL for the Sen CheckIn API.
 * Falls back to localhost for local development and to the production Railway
 * host for release builds if env injection fails.
 */
const LOCAL_DEV_API_BASE_URL = 'http://localhost:3000';
const PRODUCTION_API_BASE_URL = 'https://sen-checkin-production.up.railway.app';
const IS_DEVELOPMENT_RUNTIME =
	process.env.NODE_ENV === 'production'
		? false
		: typeof __DEV__ === 'boolean'
			? __DEV__
			: true;

export const API_BASE_URL: string = ENV.apiUrl
	? ENV.apiUrl
	: IS_DEVELOPMENT_RUNTIME
		? LOCAL_DEV_API_BASE_URL
		: PRODUCTION_API_BASE_URL;

const IS_RELEASE_FALLBACK = !ENV.apiUrl && !IS_DEVELOPMENT_RUNTIME;

if (envErrors) {
	console.warn('[env] Invalid mobile environment configuration detected.');
	console.warn(envErrors);
}

if (IS_RELEASE_FALLBACK) {
	console.warn(
		`[env] Missing or invalid EXPO_PUBLIC_API_URL in release build. Falling back to ${PRODUCTION_API_BASE_URL}.`,
	);
}

export const API_ENV_VALID = envIsValid || IS_RELEASE_FALLBACK;

/**
 * Custom fetch wrapper that injects Bearer token from device authorization.
 * Used by the Eden Treaty client for all API requests.
 * Also exported for direct use in cases where Eden Treaty doesn't support the route pattern.
 *
 * @param input - Request URL or Request object
 * @param init - Optional fetch init options
 * @returns Fetch response promise
 */
export async function authedFetchForEden(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	const headers = new Headers(init?.headers);

	// Add Bearer token if available from device authorization
	const accessToken = getAccessToken();
	if (accessToken) {
		headers.set('Authorization', `Bearer ${accessToken}`);
	}

	return fetch(input, {
		...init,
		credentials: 'include',
		mode: 'cors',
		headers,
	});
}

/**
 * Typed Eden Treaty client for communicating with the API.
 * Uses CORS + credentialed requests and includes Bearer token from device authorization.
 *
 * @see https://elysiajs.com/eden/treaty/config.html
 */
export const api: ApiClient = createApiClient(API_BASE_URL, {
	fetcher: authedFetchForEden,
});

export default api;
