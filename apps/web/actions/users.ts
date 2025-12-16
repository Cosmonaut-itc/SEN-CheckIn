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

import { API_BASE_URL, getServerFetchOptions, serverAuthClient } from '@/lib/server-auth-client';

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

		// Compute API root (BetterAuth base strips /api/auth)
		const apiRoot = API_BASE_URL.replace(/\/api\/auth$/, '');

		// Add the user as a member of the organization via API (server-only BetterAuth bridge)
		const headers = new Headers(fetchOptions.headers);
		headers.set('content-type', 'application/json');

		const addMemberResponse = await fetch(`${apiRoot}/organization/add-member-direct`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				userId: createdUserId,
				organizationId: input.organizationId,
				role: input.role,
			}),
		});

		if (!addMemberResponse.ok) {
			let errorMessage = 'Failed to add user to organization';
			try {
				const body = (await addMemberResponse.json()) as { error?: string };
				console.log('addMemberResponse', body);
				if (body?.error) {
					errorMessage = body.error;
				}
			} catch {
				// ignore parse errors
			}
			console.error('Failed to add user to organization:', errorMessage);

			// Best-effort rollback to avoid orphaned users
			try {
				const deleteFn = (
					serverAuthClient.admin as {
						deleteUser?: (
							args: { userId: string },
							opts: typeof fetchOptions,
						) => Promise<unknown>;
					}
				).deleteUser;
				if (typeof deleteFn === 'function') {
					await deleteFn({ userId: createdUserId }, fetchOptions);
				}
			} catch (rollbackError) {
				console.error('Rollback (delete user) failed:', rollbackError);
			}

			return {
				success: false,
				error: errorMessage,
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
