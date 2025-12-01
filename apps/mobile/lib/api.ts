import { createApiClient } from '@sen-checkin/api-contract';

/**
 * Base URL for the Sen CheckIn API.
 * Falls back to localhost for local development.
 */
export const API_BASE_URL: string = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Typed Eden Treaty client for communicating with the API.
 * Uses CORS + credentialed requests so BetterAuth cookies flow correctly.
 */
export const api = createApiClient(API_BASE_URL, {
  $fetch: {
    credentials: 'include',
    mode: 'cors',
  },
});

export default api;
