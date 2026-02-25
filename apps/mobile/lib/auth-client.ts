import { expoClient } from '@better-auth/expo/client';
import type { BetterAuthClientPlugin } from 'better-auth/client';
import {
	deviceAuthorizationClient,
	organizationClient,
	usernameClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

import { API_BASE_URL } from './api';

const AUTH_BASE_URL = API_BASE_URL.endsWith('/api/auth')
	? API_BASE_URL
	: `${API_BASE_URL}/api/auth`;
const AUTH_ORIGIN = new URL(AUTH_BASE_URL).origin;
const STORAGE_PREFIX = 'sen-checkin';

/** SecureStore key for persisting the device authorization access token */
const ACCESS_TOKEN_KEY = `${STORAGE_PREFIX}_access_token`;
const ACCESS_TOKEN_EXPIRES_AT_KEY = `${STORAGE_PREFIX}_access_token_expires_at`;
const REFRESH_TOKEN_KEY = `${STORAGE_PREFIX}_refresh_token`;

/**
 * In-memory cache for auth storage values.
 * SecureStore is async but the expoClient plugin sometimes reads synchronously.
 */
const secureCache: Record<string, string> = {};
let bootstrapPromise: Promise<void> | null = null;

/**
 * In-memory cache for the device authorization access token.
 * Used by authedFetch to include the token in API requests.
 */
let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiresAt: number | null = null;
let cachedRefreshToken: string | null = null;

/**
 * Preload BetterAuth cookie/session values from SecureStore into a synchronous cache.
 * Expo's SecureStore is async, but the Expo client plugin reads synchronously in a few places.
 * Also loads the device authorization access token for API requests.
 *
 * @returns Promise that resolves when storage is primed
 */
export function primeAuthStorage(): Promise<void> {
	if (bootstrapPromise) {
		return bootstrapPromise;
	}

	bootstrapPromise = (async () => {
		try {
			const isAvailable = (await SecureStore.isAvailableAsync?.()) ?? true;
			if (!isAvailable) {
				console.warn('[auth-client] SecureStore not available');
				return;
			}

			// Load all keys that might have been stored by expoClient
			// The plugin uses: {storagePrefix}_cookie and {storagePrefix}_session_data
			const keysToLoad = [`${STORAGE_PREFIX}_cookie`, `${STORAGE_PREFIX}_session_data`];

			for (const key of keysToLoad) {
				const value = await SecureStore.getItemAsync(key);
				if (value !== null) {
					secureCache[key] = value;
					console.log(`[auth-client] Loaded ${key} from SecureStore`);
				}
			}

			// Load the access token for device authorization flow
			const storedToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
			if (storedToken) {
				cachedAccessToken = storedToken;
				console.log('[auth-client] Loaded access token from SecureStore');
			}

			const storedExpiresAt = await SecureStore.getItemAsync(ACCESS_TOKEN_EXPIRES_AT_KEY);
			if (storedExpiresAt) {
				const parsed = Number(storedExpiresAt);
				cachedAccessTokenExpiresAt = Number.isFinite(parsed) ? parsed : null;
			}

			const storedRefreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
			if (storedRefreshToken) {
				cachedRefreshToken = storedRefreshToken;
			}
		} catch (error) {
			console.warn('[auth-client] Failed to prime auth storage', error);
		}
	})();

	return bootstrapPromise;
}

/**
 * Clear the auth storage cache and SecureStore.
 * Useful for logout or debugging.
 *
 * @returns Promise that resolves when storage is cleared
 */
export async function clearAuthStorage(): Promise<void> {
	const keysToClear = [
		`${STORAGE_PREFIX}_cookie`,
		`${STORAGE_PREFIX}_session_data`,
		ACCESS_TOKEN_KEY,
		ACCESS_TOKEN_EXPIRES_AT_KEY,
		REFRESH_TOKEN_KEY,
	];

	for (const key of keysToClear) {
		delete secureCache[key];
		try {
			await SecureStore.deleteItemAsync(key);
		} catch {
			// Ignore errors during clear
		}
	}

	// Also clear the in-memory access token cache
	cachedAccessToken = null;
	cachedAccessTokenExpiresAt = null;
	cachedRefreshToken = null;
	console.log('[auth-client] Auth storage cleared');
}

/**
 * Store the device authorization access token for API requests.
 * The token is persisted in SecureStore and cached in memory for performance.
 *
 * @param token - The access token received from device authorization flow
 * @param options - Optional metadata to persist alongside the token
 * @returns Promise that resolves when the token is stored
 */
export async function saveAccessToken(
	token: string,
	options?: {
		expiresIn?: number;
		refreshToken?: string;
	},
): Promise<void> {
	cachedAccessToken = token;
	try {
		await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
		console.log('[auth-client] Access token saved to SecureStore');
		if (typeof options?.expiresIn === 'number' && options.expiresIn > 0) {
			const expiresAt = Date.now() + options.expiresIn * 1000;
			cachedAccessTokenExpiresAt = expiresAt;
			await SecureStore.setItemAsync(ACCESS_TOKEN_EXPIRES_AT_KEY, String(expiresAt));
		} else {
			cachedAccessTokenExpiresAt = null;
			await SecureStore.deleteItemAsync(ACCESS_TOKEN_EXPIRES_AT_KEY);
		}
		if (options?.refreshToken) {
			cachedRefreshToken = options.refreshToken;
			await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, options.refreshToken);
		} else {
			cachedRefreshToken = null;
			await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
		}
	} catch (error) {
		console.warn('[auth-client] Failed to persist access token:', error);
	}
}

/**
 * Update the stored access token expiry timestamp.
 * Keeps the in-memory cache and SecureStore value in sync.
 *
 * @param expiresAt - Expiration timestamp in ms (or seconds) since epoch
 * @returns Nothing
 */
export function updateAccessTokenExpiry(expiresAt: number): void {
	const normalizedExpiresAt =
		expiresAt < 1_000_000_000_000 ? expiresAt * 1000 : expiresAt;

	if (!Number.isFinite(normalizedExpiresAt) || normalizedExpiresAt <= 0) {
		return;
	}

	cachedAccessTokenExpiresAt = normalizedExpiresAt;
	void SecureStore.setItemAsync(
		ACCESS_TOKEN_EXPIRES_AT_KEY,
		String(normalizedExpiresAt),
	).catch((error) => {
		console.warn('[auth-client] Failed to persist access token expiry:', error);
	});
}

/**
 * Retrieve the cached access token for API requests.
 * Returns the in-memory cached value for performance.
 *
 * @returns The cached access token or null if not available
 */
export function getAccessToken(): string | null {
	return cachedAccessToken;
}

/**
 * Retrieve the access token expiration timestamp (ms since epoch).
 *
 * @returns Expiration timestamp or null when unavailable
 */
export function getAccessTokenExpiresAt(): number | null {
	return cachedAccessTokenExpiresAt;
}

/**
 * Retrieve the cached refresh token for future renewal flows.
 *
 * @returns Cached refresh token or null when not available
 */
export function getRefreshToken(): string | null {
	return cachedRefreshToken;
}

/**
 * Storage adapter that bridges async SecureStore with sync in-memory cache.
 * The expoClient plugin uses this for cookie/session storage.
 */
const storageAdapter = {
	/**
	 * Get an item from the cache.
	 *
	 * @param key - Storage key
	 * @returns Cached value or null
	 */
	getItem: (key: string): string | null => {
		const value = secureCache[key] ?? null;
		return value;
	},

	/**
	 * Set an item in both cache and SecureStore.
	 *
	 * @param key - Storage key
	 * @param value - Value to store
	 */
	setItem: (key: string, value: string): void => {
		console.log(`[auth-client] setItem called: ${key}`);
		secureCache[key] = value;
		void SecureStore.setItemAsync(key, value).catch((err) => {
			console.warn(`[auth-client] Failed to persist ${key}:`, err);
		});
	},
};

export const authClient = createAuthClient({
	baseURL: AUTH_BASE_URL,
	fetchOptions: {
		credentials: 'include',
		mode: 'cors',
		headers: {
			Origin: AUTH_ORIGIN,
		},
		onRequest: (context) => {
			const token = getAccessToken();
			const expiresAt = getAccessTokenExpiresAt();
			const hasExpiry = typeof expiresAt === 'number';
			const isExpired = hasExpiry && expiresAt <= Date.now();
			const shouldAttachToken = Boolean(token) && (!hasExpiry || !isExpired);

			if (shouldAttachToken && token) {
				context.headers.set('authorization', `Bearer ${token}`);
			}
			return context;
		},
	},
	plugins: [
		expoClient({
			scheme: 'sen-checkin',
			storagePrefix: STORAGE_PREFIX,
			storage: storageAdapter,
		}) as unknown as BetterAuthClientPlugin,
		organizationClient(),
		usernameClient(),
		deviceAuthorizationClient(),
	],
});

export const { useSession, signIn, signOut } = authClient;

/**
 * Force a fresh session fetch from the server.
 * Useful after device authorization to ensure session state is up-to-date.
 *
 * @param accessToken - Optional Bearer token to include in the request
 * @returns The session result from the server
 */
export async function refreshSession(
	accessToken?: string,
): Promise<ReturnType<typeof authClient.getSession>> {
	const headers: Record<string, string> = {};
	if (accessToken) {
		headers.Authorization = `Bearer ${accessToken}`;
	}

	return authClient.getSession({
		query: {
			disableCookieCache: true,
		},
		fetchOptions: {
			headers,
		},
	});
}

/**
 * Fetch helper that includes authentication for API requests.
 * Automatically adds the Bearer token from device authorization flow if available.
 * Also includes credentials for cookie-based auth as fallback.
 *
 * @param input - URL or Request object
 * @param init - Optional fetch init options
 * @returns Fetch response
 */
export async function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	// Extract headers from init to merge properly (don't let ...rest overwrite)
	const { headers: initHeaders, ...restInit } = init ?? {};

	const headers: Record<string, string> = {
		Origin: AUTH_ORIGIN,
	};

	// Add Bearer token only when expiry is unknown or not yet expired.
	const accessToken = getAccessToken();
	const expiresAt = getAccessTokenExpiresAt();
	const hasExpiry = typeof expiresAt === 'number';
	const isExpired = hasExpiry && expiresAt <= Date.now();
	const shouldAttachToken = Boolean(accessToken) && (!hasExpiry || !isExpired);

	if (shouldAttachToken && accessToken) {
		headers.Authorization = `Bearer ${accessToken}`;
		console.log('[authedFetch] Including Bearer token in request');
	} else {
		console.warn('[authedFetch] No valid access token available for request');
	}

	// Merge headers: our auth headers first, then caller's headers
	const mergedHeaders: Record<string, string> = {
		...headers,
	};

	// Handle initHeaders which could be Headers, array, or object
	if (initHeaders) {
		if (initHeaders instanceof Headers) {
			initHeaders.forEach((value, key) => {
				mergedHeaders[key] = value;
			});
		} else if (Array.isArray(initHeaders)) {
			for (const [key, value] of initHeaders) {
				mergedHeaders[key] = value;
			}
		} else {
			Object.assign(mergedHeaders, initHeaders);
		}
	}

	return fetch(input, {
		credentials: 'include',
		...restInit,
		headers: mergedHeaders,
	});
}
