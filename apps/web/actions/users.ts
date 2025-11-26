'use server';

/**
 * Server actions for user management operations via better-auth admin.
 *
 * These actions are called from client components via useMutation
 * and execute on the server with full access to the auth client.
 *
 * @module actions/users
 */

import { authClient } from '@/lib/auth-client';

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
export async function setUserRole(
	input: SetUserRoleInput,
): Promise<MutationResult> {
	try {
		const response = await authClient.admin.setRole({
			userId: input.userId,
			role: input.role,
		});

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
		const response = await authClient.admin.banUser({
			userId,
		});

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
		const response = await authClient.admin.unbanUser({
			userId,
		});

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

