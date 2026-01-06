'use server';

/**
 * Server actions for location CRUD operations.
 *
 * These actions are called from client components via useMutation
 * and execute on the server with full access to the API.
 *
 * All actions forward the caller's session cookies to the API
 * for proper authentication.
 *
 * @module actions/locations
 */

import { headers } from 'next/headers';
import { createServerApiClient } from '@/lib/server-api';

/**
 * Input data for creating a new location.
 */
export interface CreateLocationInput {
	/** Location name */
	name: string;
	/** Unique location code */
	code: string;
	/** Location address */
	address?: string;
	/** Latitude coordinate (WGS84) */
	latitude?: number | null;
	/** Longitude coordinate (WGS84) */
	longitude?: number | null;
	/** Geographic zone (CONASAMI) */
	geographicZone?: 'GENERAL' | 'ZLFN';
	/** Location timezone (IANA) */
	timeZone?: string;
	/** Optional organization override for API key flows (defaults to active org) */
	organizationId?: string;
}

/**
 * Input data for updating an existing location.
 */
export interface UpdateLocationInput {
	/** The location ID to update */
	id: string;
	/** Location name */
	name: string;
	/** Unique location code */
	code: string;
	/** Location address */
	address?: string;
	/** Latitude coordinate (WGS84) */
	latitude?: number | null;
	/** Longitude coordinate (WGS84) */
	longitude?: number | null;
	/** Geographic zone (CONASAMI) */
	geographicZone?: 'GENERAL' | 'ZLFN';
	/** Location timezone (IANA) */
	timeZone?: string;
}

/**
 * Error codes for location mutations.
 */
export type LocationMutationErrorCode =
	| 'BAD_REQUEST'
	| 'FORBIDDEN'
	| 'NOT_FOUND'
	| 'CONFLICT'
	| 'UNKNOWN';

/**
 * Result of a mutation operation.
 */
export interface MutationResult<T = unknown> {
	/** Whether the operation was successful */
	success: boolean;
	/** The data returned from the operation */
	data?: T;
	/** Error code if the operation failed */
	errorCode?: LocationMutationErrorCode;
}

/**
 * Maps HTTP status codes to location mutation error codes.
 *
 * @param status - HTTP status code from the API response.
 * @returns Normalized error code for UI handling.
 */
function resolveErrorCode(status?: number): LocationMutationErrorCode {
	switch (status) {
		case 400:
			return 'BAD_REQUEST';
		case 403:
			return 'FORBIDDEN';
		case 404:
			return 'NOT_FOUND';
		case 409:
			return 'CONFLICT';
		default:
			return 'UNKNOWN';
	}
}

/**
 * Validates that latitude and longitude are provided together or both omitted.
 *
 * @param latitude - Latitude value (may be undefined, null, or number)
 * @param longitude - Longitude value (may be undefined, null, or number)
 * @returns Error code if validation fails, undefined if valid
 */
function validateCoordinatePair(
	latitude: number | null | undefined,
	longitude: number | null | undefined,
): LocationMutationErrorCode | undefined {
	const hasLatitude = latitude !== null && latitude !== undefined;
	const hasLongitude = longitude !== null && longitude !== undefined;

	if (hasLatitude && !hasLongitude) {
		return 'BAD_REQUEST';
	}

	if (hasLongitude && !hasLatitude) {
		return 'BAD_REQUEST';
	}

	return undefined;
}

/**
 * Creates a new location.
 *
 * @param input - The location data to create
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await createLocation({
 *   name: 'Main Office',
 *   code: 'LOC001',
 *   address: '123 Main St',
 * });
 * ```
 */
export async function createLocation(input: CreateLocationInput): Promise<MutationResult> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		// Validate coordinate pair before proceeding
		const coordError = validateCoordinatePair(input.latitude, input.longitude);
		if (coordError) {
			return {
				success: false,
				errorCode: coordError,
			};
		}

		const payload: {
			name: string;
			code: string;
			address?: string;
			latitude?: number | null;
			longitude?: number | null;
			geographicZone?: 'GENERAL' | 'ZLFN';
			timeZone?: string;
			organizationId?: string;
		} = {
			name: input.name,
			code: input.code,
			address: input.address || undefined,
			geographicZone: input.geographicZone,
			timeZone: input.timeZone,
			organizationId: input.organizationId,
		};

		// Only include coordinates if both are provided (or both omitted)
		if (input.latitude !== undefined && input.longitude !== undefined) {
			payload.latitude = input.latitude;
			payload.longitude = input.longitude;
		} else if (input.latitude === null && input.longitude === null) {
			// Explicitly set both to null to clear coordinates
			payload.latitude = null;
			payload.longitude = null;
		}

		const response = await api.locations.post(payload);

		if (response.error) {
			return {
				success: false,
				errorCode: resolveErrorCode(response.status),
			};
		}

		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		console.error('Failed to create location:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
		};
	}
}

/**
 * Updates an existing location.
 *
 * @param input - The location data to update
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await updateLocation({
 *   id: 'location-id',
 *   name: 'Main Office',
 *   code: 'LOC001',
 *   address: '456 New St',
 * });
 * ```
 */
export async function updateLocation(input: UpdateLocationInput): Promise<MutationResult> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		// Validate coordinate pair before proceeding
		const coordError = validateCoordinatePair(input.latitude, input.longitude);
		if (coordError) {
			return {
				success: false,
				errorCode: coordError,
			};
		}

		const payload: {
			name: string;
			code: string;
			address?: string;
			latitude?: number | null;
			longitude?: number | null;
			geographicZone?: 'GENERAL' | 'ZLFN';
			timeZone?: string;
		} = {
			name: input.name,
			code: input.code,
			address: input.address || undefined,
			geographicZone: input.geographicZone,
			timeZone: input.timeZone,
		};

		// Only include coordinates if both are provided (or both omitted)
		if (input.latitude !== undefined && input.longitude !== undefined) {
			payload.latitude = input.latitude;
			payload.longitude = input.longitude;
		} else if (input.latitude === null && input.longitude === null) {
			// Explicitly set both to null to clear coordinates
			payload.latitude = null;
			payload.longitude = null;
		}

		const response = await api.locations[input.id].put(payload);

		if (response.error) {
			return {
				success: false,
				errorCode: resolveErrorCode(response.status),
			};
		}

		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		console.error('Failed to update location:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
		};
	}
}

/**
 * Deletes a location.
 *
 * @param id - The location ID to delete
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await deleteLocation('location-id');
 * ```
 */
export async function deleteLocation(id: string): Promise<MutationResult> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api.locations[id].delete();

		if (response.error) {
			return {
				success: false,
				errorCode: resolveErrorCode(response.status),
			};
		}

		return {
			success: true,
		};
	} catch (error) {
		console.error('Failed to delete location:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
		};
	}
}
