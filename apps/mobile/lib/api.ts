import { createApiClient } from '@sen-checkin/api-contract';
import { ENV, envErrors, envIsValid } from '@/constants/env';

/**
 * Base URL for the Sen CheckIn API.
 * Falls back to localhost for local development.
 */
export const API_BASE_URL: string =
  ENV.apiUrl ?? 'http://localhost:3000'; // fallback only for dev visibility

if (envErrors) {
  console.warn('[env] Missing or invalid EXPO_PUBLIC_API_URL. Device login will be disabled.');
  console.warn(envErrors.format());
}

export const API_ENV_VALID = envIsValid;

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
