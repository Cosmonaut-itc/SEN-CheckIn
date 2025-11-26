'use server';

/**
 * Server actions for client CRUD operations.
 *
 * These actions are called from client components via useMutation
 * and execute on the server with full access to the API.
 *
 * All actions forward the caller's session cookies to the API
 * for proper authentication.
 *
 * @module actions/clients
 */

import { cookies } from 'next/headers';
import { createServerApiClient } from '@/lib/server-api';

/**
 * Input data for creating a new client.
 */
export interface CreateClientInput {
	/** Client name */
	name: string;
}

/**
 * Input data for updating an existing client.
 */
export interface UpdateClientInput {
	/** The client ID to update */
	id: string;
	/** Client name */
	name: string;
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
 * Creates a new client.
 *
 * @param input - The client data to create
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await createClient({
 *   name: 'Acme Corp',
 * });
 * ```
 */
export async function createClient(input: CreateClientInput): Promise<MutationResult> {
	try {
		const cookieStore = await cookies();
		const cookieHeader = cookieStore.toString();
		const api = createServerApiClient(cookieHeader);

		const response = await api.clients.post({
			name: input.name,
		});

		if (response.error) {
			return {
				success: false,
				error: 'Failed to create client',
			};
		}

		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		console.error('Failed to create client:', error);
		return {
			success: false,
			error: 'Failed to create client',
		};
	}
}

/**
 * Updates an existing client.
 *
 * @param input - The client data to update
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await updateClient({
 *   id: 'client-id',
 *   name: 'Acme Corporation',
 * });
 * ```
 */
export async function updateClient(input: UpdateClientInput): Promise<MutationResult> {
	try {
		const cookieStore = await cookies();
		const cookieHeader = cookieStore.toString();
		const api = createServerApiClient(cookieHeader);

		const response = await api.clients[input.id].put({
			name: input.name,
		});

		if (response.error) {
			return {
				success: false,
				error: 'Failed to update client',
			};
		}

		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		console.error('Failed to update client:', error);
		return {
			success: false,
			error: 'Failed to update client',
		};
	}
}

/**
 * Deletes a client.
 *
 * @param id - The client ID to delete
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await deleteClient('client-id');
 * ```
 */
export async function deleteClient(id: string): Promise<MutationResult> {
	try {
		const cookieStore = await cookies();
		const cookieHeader = cookieStore.toString();
		const api = createServerApiClient(cookieHeader);

		const response = await api.clients[id].delete();

		if (response.error) {
			return {
				success: false,
				error: 'Failed to delete client',
			};
		}

		return {
			success: true,
		};
	} catch (error) {
		console.error('Failed to delete client:', error);
		return {
			success: false,
			error: 'Failed to delete client',
		};
	}
}
