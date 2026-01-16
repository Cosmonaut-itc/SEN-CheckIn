/**
 * Shared helpers for API response payloads.
 *
 * @module api-response
 */

/**
 * Standardized error payload shape returned by the API.
 */
export type ApiErrorPayload = {
	error: {
		message: string;
		code: string;
		details?: Record<string, unknown>;
	};
};

/**
 * Generic API response wrapper shape.
 */
export type ApiResponse<T> = {
	data?: T | null;
	error?: unknown | null;
};

/**
 * Determines whether a payload matches the standardized error payload shape.
 *
 * @param value - Payload value to validate
 * @returns True when the payload is a standardized error response
 */
export function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
	if (!value || typeof value !== 'object') {
		return false;
	}
	if (!('error' in value)) {
		return false;
	}

	const errorValue = (value as { error?: unknown }).error;
	if (!errorValue || typeof errorValue !== 'object') {
		return false;
	}

	const message = (errorValue as { message?: unknown }).message;
	const code = (errorValue as { code?: unknown }).code;
	return typeof message === 'string' && typeof code === 'string';
}

/**
 * Extracts a typed response payload when the response is successful.
 *
 * @param response - API response wrapper
 * @returns The payload when present and not an error payload, otherwise null
 */
export function getApiResponseData<T>(
	response: ApiResponse<T>,
): Exclude<T, ApiErrorPayload> | null {
	if (response.error) {
		return null;
	}
	if (response.data === undefined || response.data === null) {
		return null;
	}
	if (isApiErrorPayload(response.data)) {
		return null;
	}
	return response.data as Exclude<T, ApiErrorPayload>;
}

/**
 * Extracts a typed response payload or throws when the response is invalid.
 *
 * @param response - API response wrapper
 * @param message - Error message to throw when data is missing
 * @returns The payload when present and not an error payload
 * @throws Error when the response is missing data or includes an error payload
 */
export function requireApiResponseData<T>(
	response: ApiResponse<T>,
	message: string,
): Exclude<T, ApiErrorPayload> {
	const payload = getApiResponseData(response);
	if (!payload) {
		throw new Error(message);
	}
	return payload;
}
