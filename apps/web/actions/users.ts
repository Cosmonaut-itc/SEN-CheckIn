'use server';

/**
 * Server actions for user management operations via better-auth admin.
 *
 * These actions are called from client components via useMutation
 * and execute on the server with full access to the auth client.
 *
 * All actions forward the caller's session headers to the auth API
 * for proper authentication.
 *
 * @module actions/users
 */

import { createServerApiClient } from '@/lib/server-api';
import { getServerFetchOptions, serverAuthClient } from '@/lib/server-auth-client';
import { headers } from 'next/headers';

/**
 * User role type.
 */
export type UserRole = 'user' | 'admin';

/**
 * Input data for setting a user's role.
 */
export interface SetUserRoleInput {
	/** The user ID */
	userId: string;
	/** The new role to assign */
	role: UserRole;
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
 * Input data for creating a user and assigning them to an organization.
 */
export interface CreateOrganizationUserInput {
	name: string;
	email: string;
	username: string;
	password: string;
	role: 'admin' | 'member';
	organizationId: string;
}

/**
 * Input data for assigning an existing user to an organization.
 */
export interface AddOrganizationMemberInput {
	/** The user ID to assign */
	userId: string;
	/** Target organization ID */
	organizationId: string;
	/** Role to assign within the organization */
	role: 'admin' | 'member';
}

/**
 * Creates a new user and assigns them to an organization.
 *
 * @param input - User details and organization assignment
 * @returns A promise resolving to the mutation result
 */
export async function createOrganizationUser(
	input: CreateOrganizationUserInput,
): Promise<MutationResult<{ userId: string }>> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api.organization['provision-user'].post({
			name: input.name,
			email: input.email,
			username: input.username,
			password: input.password,
			role: input.role,
			organizationId: input.organizationId,
		});

		if (response.error) {
			return {
				success: false,
				error: 'Failed to create user',
			};
		}

		const createdUserId = response.data?.data?.userId ?? null;

		if (!createdUserId) {
			return {
				success: false,
				error: 'Failed to create user',
			};
		}

		return {
			success: true,
			data: { userId: createdUserId },
		};
	} catch (error) {
		console.error('Failed to create organization user:', error);
		return {
			success: false,
			error: 'Failed to create user',
		};
	}
}

/**
 * Assigns an existing user to an organization.
 *
 * @param input - User and organization assignment data
 * @returns A promise resolving to the mutation result
 */
export async function addOrganizationMember(
	input: AddOrganizationMemberInput,
): Promise<MutationResult<{ memberId?: string | null }>> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api.organization['add-member-direct'].post({
			userId: input.userId,
			organizationId: input.organizationId,
			role: input.role,
		});

		if (response.error) {
			return {
				success: false,
				error: 'Failed to assign user to organization',
			};
		}

		return {
			success: true,
			data: {
				memberId: response.data?.data?.memberId ?? null,
			},
		};
	} catch (error) {
		console.error('Failed to assign user to organization:', error);
		return {
			success: false,
			error: 'Failed to assign user to organization',
		};
	}
}

/**
 * Sets a user's role.
 *
 * @param input - The user ID and new role
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await setUserRole({
 *   userId: 'user-id',
 *   role: 'admin',
 * });
 * ```
 */
export async function setUserRole(input: SetUserRoleInput): Promise<MutationResult> {
	try {
		const fetchOptions = await getServerFetchOptions();
		const response = await serverAuthClient.admin.setRole(
			{
				userId: input.userId,
				role: input.role,
			},
			fetchOptions,
		);

		if (response.error) {
			return {
				success: false,
				error: 'Failed to update user role',
			};
		}

		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		console.error('Failed to update user role:', error);
		return {
			success: false,
			error: 'Failed to update user role',
		};
	}
}

/**
 * Bans a user.
 *
 * @param userId - The user ID to ban
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await banUser('user-id');
 * ```
 */
export async function banUser(userId: string): Promise<MutationResult> {
	try {
		const fetchOptions = await getServerFetchOptions();
		const response = await serverAuthClient.admin.banUser(
			{
				userId,
			},
			fetchOptions,
		);

		if (response.error) {
			return {
				success: false,
				error: 'Failed to ban user',
			};
		}

		return {
			success: true,
		};
	} catch (error) {
		console.error('Failed to ban user:', error);
		return {
			success: false,
			error: 'Failed to ban user',
		};
	}
}

/**
 * Unbans a user.
 *
 * @param userId - The user ID to unban
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await unbanUser('user-id');
 * ```
 */
export async function unbanUser(userId: string): Promise<MutationResult> {
	try {
		const fetchOptions = await getServerFetchOptions();
		const response = await serverAuthClient.admin.unbanUser(
			{
				userId,
			},
			fetchOptions,
		);

		if (response.error) {
			return {
				success: false,
				error: 'Failed to unban user',
			};
		}

		return {
			success: true,
		};
	} catch (error) {
		console.error('Failed to unban user:', error);
		return {
			success: false,
			error: 'Failed to unban user',
		};
	}
}
