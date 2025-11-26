'use server';

/**
 * Server actions for location CRUD operations.
 *
 * These actions are called from client components via useMutation
 * and execute on the server with full access to the API.
 *
 * @module actions/locations
 */

import { api } from '@/lib/api';

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
	/** Client ID this location belongs to */
	clientId: string;
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
}

/**
 * Result of a mutation operation.
 */
export interface MutationResult<T = unknown> {
	/** Whether the operation was successful */
	success: boolean;
	/** The data returned from the operation */
	data?: T;
	/** Error message if the operation failed */
	error?: string;
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
 *   clientId: 'client-id',
 * });
 * ```
 */
export async function createLocation(
	input: CreateLocationInput,
): Promise<MutationResult> {
	try {
		const response = await api.locations.post({
			name: input.name,
			code: input.code,
			address: input.address || undefined,
			clientId: input.clientId,
		});

		if (response.error) {
			return {
				success: false,
				error: 'Failed to create location',
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
			error: 'Failed to create location',
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
export async function updateLocation(
	input: UpdateLocationInput,
): Promise<MutationResult> {
	try {
		const response = await api.locations[input.id].put({
			name: input.name,
			code: input.code,
			address: input.address || undefined,
		});

		if (response.error) {
			return {
				success: false,
				error: 'Failed to update location',
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
			error: 'Failed to update location',
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
		const response = await api.locations[id].delete();

		if (response.error) {
			return {
				success: false,
				error: 'Failed to delete location',
			};
		}

		return {
			success: true,
		};
	} catch (error) {
		console.error('Failed to delete location:', error);
		return {
			success: false,
			error: 'Failed to delete location',
		};
	}
}

