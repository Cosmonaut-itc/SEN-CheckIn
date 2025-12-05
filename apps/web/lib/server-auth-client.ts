/**
 * Server-side auth client factory for Next.js Server Actions.
 *
 * This module provides a function to create BetterAuth clients that include
 * forwarded headers from the incoming request, enabling authenticated
 * server-side auth operations in server actions.
 *
 * @module server-auth-client
 */

import {
	adminClient,
	apiKeyClient,
	deviceAuthorizationClient,
	organizationClient,
	usernameClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { headers } from 'next/headers';

/**
 * Environment variable for the API base URL.
 * Falls back to localhost for local development.
 */
const API_ORIGIN: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
/**
 * Base URL for BetterAuth API endpoints.
 * Exported for use in server actions that need to make direct HTTP requests.
 */
export const API_BASE_URL: string = API_ORIGIN.endsWith('/api/auth')
	? API_ORIGIN
	: `${API_ORIGIN}/api/auth`;

/**
 * Server auth client for use in server actions.
 *
 * This is the same client as the browser auth client, configured with
 * Admin, Organization, and API Key plugins. When used in server actions,
 * you must pass the result of `getServerFetchOptions()` as the second
 * argument to any method that makes HTTP requests.
 *
 * @example
 * ```ts
 * // In a server action
 * const fetchOptions = await getServerFetchOptions();
 * const response = await serverAuthClient.apiKey.create(
 *   { name: 'My API Key' },
 *   fetchOptions
 * );
 * ```
 */
export const serverAuthClient = createAuthClient({
	baseURL: API_BASE_URL,
	plugins: [
		apiKeyClient(),
		adminClient(),
		organizationClient(),
		usernameClient(),
		deviceAuthorizationClient(),
	],
});

/**
 * Type for the server auth client instance.
 */
export type ServerAuthClient = typeof serverAuthClient;

/**
 * Gets the forwarded headers from the incoming request as fetch options.
 *
 * This reads the headers from the Next.js request context and returns
 * them as fetch options that can be passed to auth client methods.
 *
 * @returns A promise resolving to fetch options with forwarded headers
 *
 * @example
 * ```ts
 * const fetchOptions = await getServerFetchOptions();
 * const response = await authClient.apiKey.create({ name: 'key' }, fetchOptions);
 * ```
 */
export async function getServerFetchOptions(): Promise<{ headers: Headers }> {
	const incomingHeaders = await headers();
	const filtered = new Headers();

	// Only forward session/referer/origin context headers. Do NOT forward
	// content-type/content-length from the server action request (Next uses
	// multipart for server actions), or BetterAuth will reject the JSON body
	// as invalid.
	const allowList = new Set([
		'cookie',
		'authorization',
		'origin',
		'referer',
		'user-agent',
		'accept-language',
		'x-forwarded-for',
		'x-forwarded-proto',
		'x-forwarded-host',
		'x-real-ip',
	]);

	incomingHeaders.forEach((value, key) => {
		const lower = key.toLowerCase();
		if (!allowList.has(lower)) {
			return;
		}
		filtered.set(lower, value);
	});

	return { headers: filtered };
}
