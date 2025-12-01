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
const storageKeys = [`${STORAGE_PREFIX}_cookie`, `${STORAGE_PREFIX}_session_data`];

const secureCache: Record<string, string> = {};
let bootstrapPromise: Promise<void> | null = null;

/**
 * Preload BetterAuth cookie/session values from SecureStore into a synchronous cache.
 * Expo's SecureStore is async, but the Expo client plugin reads synchronously in a few places.
 */
export function primeAuthStorage(): Promise<void> {
	if (bootstrapPromise) {
		return bootstrapPromise;
	}

	bootstrapPromise = (async () => {
		try {
			const isAvailable = (await SecureStore.isAvailableAsync?.()) ?? true;
			if (!isAvailable) {
				return;
			}

			for (const key of storageKeys) {
				const value = await SecureStore.getItemAsync(key);
				if (value !== null) {
					secureCache[key] = value;
				}
			}
		} catch (error) {
			console.warn('Failed to prime auth storage', error);
		}
	})();

	return bootstrapPromise;
}

const storageAdapter = {
	getItem: (key: string) => secureCache[key] ?? null,
	setItem: (key: string, value: string) => {
		secureCache[key] = value;
		void SecureStore.setItemAsync(key, value);
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
 * Fetch helper that always includes credentials for BetterAuth session cookies.
 * Falls back to global fetch; caller can still override init properties.
 */
export async function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	return fetch(input, {
		credentials: 'include',
		headers: {
			Origin: AUTH_ORIGIN,
			...init?.headers,
		},
		...init,
	});
}
