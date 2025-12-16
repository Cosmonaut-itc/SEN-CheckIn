/**
 * Server-side API client factory for Next.js Server Components.
 *
 * This module provides a function to create API clients that include
 * forwarded cookies from the incoming request, enabling authenticated
 * server-side data fetching.
 *
 * @module server-api
 */

import { createApiClient, type ApiClientOptions } from '@sen-checkin/api-contract';

/**
 * Environment variable for the API base URL.
 * Falls back to localhost for local development.
 */
const API_BASE_URL: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Creates a server-side API client with forwarded cookies.
 *
 * In Next.js Server Components, the browser's cookie jar is not available.
 * This function creates an API client that includes the provided cookie
 * header string, enabling authenticated requests from the server.
 *
 * @param cookieHeader - The cookie header string from the incoming request
 * @returns A typed Eden Treaty client with cookies attached
 *
 * @example
 * ```tsx
 * // In a Server Component
 * import { cookies } from 'next/headers';
 *
 * export default async function Page() {
 *   const cookieStore = await cookies();
 *   const cookieHeader = cookieStore.toString();
 *   const api = createServerApiClient(cookieHeader);
 *
 *   const response = await api.employees.get({ $query: { limit: 10 } });
 * }
 * ```
 */
export function createServerApiClient(cookieHeader: string): ReturnType<typeof createApiClient> {
	const options: ApiClientOptions = {
		$fetch: {
			credentials: 'include',
			mode: 'cors',
			headers: {
				Cookie: cookieHeader,
			},
		},
	};

	return createApiClient(API_BASE_URL, options);
}

/**
 * Type alias for the server API client return type.
 */
export type ServerApiClient = ReturnType<typeof createServerApiClient>;

export { API_BASE_URL };
