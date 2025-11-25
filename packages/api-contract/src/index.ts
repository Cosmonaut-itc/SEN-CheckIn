import { edenTreaty } from '@elysiajs/eden';
import type { App as ElysiaApp } from '@sen-checkin/api';

export type AppType = ElysiaApp;

export const API_BASE_URL = 'http://localhost:3000';

/**
 * Configuration options for the Eden Treaty client.
 */
export type ApiClientOptions = Parameters<typeof edenTreaty<AppType>>[1];

/**
 * Builds a fully typed Eden Treaty client pointed at the Sen Checkin API.
 * Defaults to the local dev server (http://localhost:3000).
 *
 * @param baseUrl - The base URL for the API server
 * @param options - Optional configuration options for the Eden Treaty client (e.g., fetch options, headers)
 * @returns A fully typed Eden Treaty client instance
 */
export const createApiClient = (
	baseUrl = API_BASE_URL,
	options?: ApiClientOptions,
): ReturnType<typeof edenTreaty<AppType>> => edenTreaty<AppType>(baseUrl, options);

/**
 * Ready-to-use client instance for typical local development.
 */
export const apiClient = createApiClient();
