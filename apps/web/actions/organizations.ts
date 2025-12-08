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

import { getServerFetchOptions, serverAuthClient } from '@/lib/server-auth-client';

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
 * Input data for updating an organization.
 */
export interface UpdateOrganizationInput {
	/** Organization ID to update */
	organizationId: string;
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
			console.error('[organizations:create] BetterAuth error:', response.error);
			return {
				success: false,
				error:
					(typeof response.error === 'object' &&
						'message' in response.error &&
						typeof response.error.message === 'string'
						? response.error.message
						: 'Failed to create organization'),
			};
		}

		const createdOrganizationId =
			typeof response.data === 'object' && response.data && 'id' in response.data
				? (response.data as { id?: unknown }).id
				: null;

		if (typeof createdOrganizationId === 'string') {
			try {
				await serverAuthClient.organization.setActive(
					{ organizationId: createdOrganizationId },
					fetchOptions,
				);
			} catch (error) {
				console.error('[organizations:create] Failed to set active organization', error);
			}
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
 * Updates an existing organization.
 *
 * @param input - The organization data to update
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await updateOrganization({
 *   organizationId: 'org-123',
 *   name: 'Updated Corp',
 *   slug: 'updated-corp',
 * });
 * ```
 */
export async function updateOrganization(input: UpdateOrganizationInput): Promise<MutationResult> {
	try {
		const fetchOptions = await getServerFetchOptions();
		const response = await serverAuthClient.organization.update(
			{
				organizationId: input.organizationId,
				data: {
					name: input.name,
					slug: input.slug,
				},
			},
			fetchOptions,
		);

		if (response.error) {
			console.error('[organizations:update] BetterAuth error:', response.error);
			return {
				success: false,
				error:
					(typeof response.error === 'object' &&
						'message' in response.error &&
						typeof response.error.message === 'string'
						? response.error.message
						: 'Failed to update organization'),
			};
		}

		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		console.error('Failed to update organization:', error);
		return {
			success: false,
			error: 'Failed to update organization',
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
			console.error('[organizations:delete] BetterAuth error:', response.error);
			return {
				success: false,
				error:
					(typeof response.error === 'object' &&
						'message' in response.error &&
						typeof response.error.message === 'string'
						? response.error.message
						: 'Failed to delete organization'),
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
