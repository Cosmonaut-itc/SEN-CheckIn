import { createApiClient } from '@sen-checkin/api-contract';

import { ENV, envErrors, envIsValid } from '@/constants/env';
import { getAccessToken } from './auth-client';

/**
 * Base URL for the Sen CheckIn API.
 * Falls back to localhost for local development.
 */
export const API_BASE_URL: string = ENV.apiUrl ?? 'http://localhost:3000'; // fallback only for dev visibility

if (envErrors) {
	console.warn('[env] Missing or invalid EXPO_PUBLIC_API_URL. Device login will be disabled.');
	console.warn(envErrors.format());
}

export const API_ENV_VALID = envIsValid;

/**
 * Custom fetch wrapper that injects Bearer token from device authorization.
 * Used by the Eden Treaty client for all API requests.
 *
 * @param input - Request URL or Request object
 * @param init - Optional fetch init options
 * @returns Fetch response promise
 */
async function authedFetchForEden(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
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
export const api = createApiClient(API_BASE_URL, {
	fetcher: authedFetchForEden,
});

export default api;
