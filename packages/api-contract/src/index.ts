import { edenTreaty } from '@elysiajs/eden';
import type { App as ElysiaApp } from '@sen-checkin/api';

export type AppType = ElysiaApp;

export const API_BASE_URL = 'http://localhost:3000';

/**
 * Builds a fully typed Eden Treaty client pointed at the Sen Checkin API.
 * Defaults to the local dev server (http://localhost:3000).
 */
export const createApiClient = (baseUrl = API_BASE_URL) => edenTreaty<AppType>(baseUrl);

/**
 * Ready-to-use client instance for typical local development.
 */
export const apiClient = createApiClient();
