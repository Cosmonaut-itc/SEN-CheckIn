'use server';

/**
 * Server actions for API key operations via better-auth.
 *
 * These actions are called from client components via useMutation
 * and execute on the server with full access to the auth client.
 *
 * @module actions/api-keys
 */

import { authClient } from '@/lib/auth-client';

/**
 * Input data for creating a new API key.
 */
export interface CreateApiKeyInput {
	/** Optional name for the API key */
	name?: string;
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
 * Result of creating an API key.
 */
export interface CreateApiKeyResult {
	/** The full API key (only shown once) */
	key: string;
	/** The API key ID */
	id: string;
}

/**
 * Creates a new API key.
 *
 * @param input - The API key data to create
 * @returns A promise resolving to the mutation result with the new key
 *
 * @example
 * ```ts
 * const result = await createApiKey({ name: 'My API Key' });
 * if (result.success && result.data) {
 *   console.log('New key:', result.data.key);
 * }
 * ```
 */
export async function createApiKey(
	input: CreateApiKeyInput,
): Promise<MutationResult<CreateApiKeyResult>> {
	try {
		const response = await authClient.apiKey.create({
			name: input.name || undefined,
		});

		if (response.error) {
			return {
				success: false,
				error: 'Failed to create API key',
			};
		}

		if (!response.data?.key) {
			return {
				success: false,
				error: 'API key was not returned',
			};
		}

		return {
			success: true,
			data: {
				key: response.data.key,
				id: response.data.id,
			},
		};
	} catch (error) {
		console.error('Failed to create API key:', error);
		return {
			success: false,
			error: 'Failed to create API key',
		};
	}
}

/**
 * Deletes an API key.
 *
 * @param keyId - The API key ID to delete
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await deleteApiKey('api-key-id');
 * ```
 */
export async function deleteApiKey(keyId: string): Promise<MutationResult> {
	try {
		const response = await authClient.apiKey.delete({ keyId });

		if (response.error) {
			return {
				success: false,
				error: 'Failed to delete API key',
			};
		}

		return {
			success: true,
		};
	} catch (error) {
		console.error('Failed to delete API key:', error);
		return {
			success: false,
			error: 'Failed to delete API key',
		};
	}
}

