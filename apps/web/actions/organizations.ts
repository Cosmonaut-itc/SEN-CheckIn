'use server';

/**
 * Server actions for organization operations via better-auth.
 *
 * These actions are called from client components via useMutation
 * and execute on the server with full access to the auth client.
 *
 * All actions forward the caller's session headers to the auth API
 * for proper authentication.
 *
 * @module actions/organizations
 */

import { serverAuthClient, getServerFetchOptions } from '@/lib/server-auth-client';

/**
 * Input data for creating a new organization.
 */
export interface CreateOrganizationInput {
	/** Organization name */
	name: string;
	/** URL-friendly slug */
	slug: string;
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
 * Creates a new organization.
 *
 * @param input - The organization data to create
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await createOrganization({
 *   name: 'Acme Corp',
 *   slug: 'acme-corp',
 * });
 * ```
 */
export async function createOrganization(input: CreateOrganizationInput): Promise<MutationResult> {
	try {
		const fetchOptions = await getServerFetchOptions();
		const response = await serverAuthClient.organization.create(
			{
				name: input.name,
				slug: input.slug,
			},
			fetchOptions,
		);

		if (response.error) {
			return {
				success: false,
				error: 'Failed to create organization',
			};
		}

		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		console.error('Failed to create organization:', error);
		return {
			success: false,
			error: 'Failed to create organization',
		};
	}
}

/**
 * Deletes an organization.
 *
 * @param organizationId - The organization ID to delete
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await deleteOrganization('organization-id');
 * ```
 */
export async function deleteOrganization(organizationId: string): Promise<MutationResult> {
	try {
		const fetchOptions = await getServerFetchOptions();
		const response = await serverAuthClient.organization.delete(
			{
				organizationId,
			},
			fetchOptions,
		);

		if (response.error) {
			return {
				success: false,
				error: 'Failed to delete organization',
			};
		}

		return {
			success: true,
		};
	} catch (error) {
		console.error('Failed to delete organization:', error);
		return {
			success: false,
			error: 'Failed to delete organization',
		};
	}
}
