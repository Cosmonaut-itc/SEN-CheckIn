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

import { getServerFetchOptions, serverAuthClient } from '@/lib/server-auth-client';

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
 * Creates a new user and assigns them to an organization.
 *
 * @param input - User details and organization assignment
 */
export async function createOrganizationUser(
	input: CreateOrganizationUserInput,
): Promise<MutationResult<{ userId: string }>> {
	try {
		const fetchOptions = await getServerFetchOptions();
		const createResponse = await serverAuthClient.admin.createUser(
			{
				email: input.email,
				password: input.password,
				name: input.name,
				data: { username: input.username },
			},
			fetchOptions,
		);

		const createdUserId = createResponse.data?.user?.id;

		if (createResponse.error || !createdUserId) {
			return {
				success: false,
				error: 'Failed to create user',
			};
		}

		// Type definitions for the organization client omit addMember; narrow with a local type.
		const orgClient = serverAuthClient.organization as typeof serverAuthClient.organization & {
			addMember: (
				params: { userId: string; organizationId: string; role: string },
				options: { fetchOptions: { headers: Headers } },
			) => Promise<{ error?: unknown; data?: unknown }>;
		};

		const addMemberResponse = await orgClient.addMember(
			{
				userId: createdUserId,
				organizationId: input.organizationId,
				role: input.role,
			},
			{ fetchOptions },
		);

		if (addMemberResponse.error) {
			// Fallback: call the endpoint directly to avoid any baseURL/path mismatch.
			const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
			const url = apiOrigin.endsWith('/api/auth')
				? `${apiOrigin}/organization/add-member`
				: `${apiOrigin}/api/auth/organization/add-member`;

			const direct = await fetch(url, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					...(fetchOptions.headers ?? {}),
				},
				body: JSON.stringify({
					userId: createdUserId,
					organizationId: input.organizationId,
					role: input.role,
				}),
				credentials: 'include',
			});

			if (!direct.ok) {
				const bodyText = await direct.text();
				console.error('addMember direct call failed', direct.status, direct.statusText, bodyText);
				return {
					success: false,
					error: `Failed to add user to organization (status ${direct.status}): ${bodyText || direct.statusText}`,
				};
			}
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
