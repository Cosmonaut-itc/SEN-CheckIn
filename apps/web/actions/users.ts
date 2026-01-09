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
 * Error codes for organization user provisioning failures.
 */
export type CreateOrganizationUserErrorCode =
	| 'PASSWORD_TOO_SHORT'
	| 'PASSWORD_TOO_LONG'
	| 'PASSWORD_REQUIRED'
	| 'INVALID_EMAIL'
	| 'EMAIL_REQUIRED'
	| 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
	| 'USERNAME_IS_ALREADY_TAKEN'
	| 'USERNAME_IS_INVALID'
	| 'INVALID_USERNAME'
	| 'USERNAME_TOO_SHORT'
	| 'USERNAME_TOO_LONG'
	| 'NAME_REQUIRED'
	| 'USERNAME_REQUIRED'
	| 'ORGANIZATION_REQUIRED'
	| 'ORGANIZATION_MEMBERSHIP_REQUIRED'
	| 'ORGANIZATION_ADMIN_REQUIRED'
	| 'USER_SIGNUP_FAILED'
	| 'ADD_MEMBER_FAILED'
	| 'PROVISION_USER_FAILED'
	| 'UNKNOWN';

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
	/** Error code if the operation failed */
	errorCode?: CreateOrganizationUserErrorCode;
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

type ApiValidationDetail = {
	summary?: string;
};

type ApiValidationDetails = {
	errors?: ApiValidationDetail[];
};

type ApiErrorPayload = {
	error?: { message?: string; code?: string; details?: ApiValidationDetails } | string;
	code?: string;
	details?: ApiValidationDetails;
};

const CREATE_USER_ERROR_CODES = new Set<CreateOrganizationUserErrorCode>([
	'PASSWORD_TOO_SHORT',
	'PASSWORD_TOO_LONG',
	'PASSWORD_REQUIRED',
	'INVALID_EMAIL',
	'EMAIL_REQUIRED',
	'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
	'USERNAME_IS_ALREADY_TAKEN',
	'USERNAME_IS_INVALID',
	'INVALID_USERNAME',
	'USERNAME_TOO_SHORT',
	'USERNAME_TOO_LONG',
	'NAME_REQUIRED',
	'USERNAME_REQUIRED',
	'ORGANIZATION_REQUIRED',
	'ORGANIZATION_MEMBERSHIP_REQUIRED',
	'ORGANIZATION_ADMIN_REQUIRED',
	'USER_SIGNUP_FAILED',
	'ADD_MEMBER_FAILED',
	'PROVISION_USER_FAILED',
	'UNKNOWN',
]);

/**
 * Normalizes raw error codes into a known create-user error code.
 *
 * @param value - Raw error code or message string
 * @returns Normalized error code or null when unknown
 */
function normalizeCreateUserErrorCode(value: string): CreateOrganizationUserErrorCode | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	const normalized = trimmed
		.replace(/[^a-zA-Z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.toUpperCase();
	if (CREATE_USER_ERROR_CODES.has(normalized as CreateOrganizationUserErrorCode)) {
		return normalized as CreateOrganizationUserErrorCode;
	}

	return null;
}

/**
 * Extracts the first validation summary string from API error details.
 *
 * @param details - Validation details payload
 * @returns Validation summary or null when unavailable
 */
function extractValidationSummary(details: unknown): string | null {
	if (!details || typeof details !== 'object') {
		return null;
	}

	const errors = (details as { errors?: unknown }).errors;
	if (!Array.isArray(errors) || errors.length === 0) {
		return null;
	}

	const first = errors[0] as { summary?: unknown } | undefined;
	if (!first || typeof first !== 'object') {
		return null;
	}

	const summary = (first as { summary?: unknown }).summary;
	return typeof summary === 'string' ? summary : null;
}

/**
 * Resolves a create-user error code from an API error payload.
 *
 * @param error - Error payload from the API response
 * @returns Normalized error code or null when not available
 */
function resolveCreateUserErrorCode(error: unknown): CreateOrganizationUserErrorCode | null {
	const payload = error as { value?: ApiErrorPayload } | null;
	const value = payload?.value;

	if (!value || typeof value !== 'object') {
		return null;
	}

	const errorObject =
		typeof value.error === 'object' && value.error ? value.error : null;
	const candidateCodes: Array<string | null> = [];

	if (errorObject && typeof errorObject === 'object') {
		const code = (errorObject as { code?: unknown }).code;
		const message = (errorObject as { message?: unknown }).message;
		if (typeof code === 'string') {
			candidateCodes.push(code);
		}
		if (typeof message === 'string') {
			candidateCodes.push(message);
		}

		const details = (errorObject as { details?: unknown }).details;
		const summary = extractValidationSummary(details);
		if (summary) {
			candidateCodes.push(summary);
		}
	}

	if (typeof value.error === 'string') {
		candidateCodes.push(value.error);
	}

	const topLevelSummary = extractValidationSummary((value as { details?: unknown }).details);
	if (topLevelSummary) {
		candidateCodes.push(topLevelSummary);
	}

	const topLevelCode = (value as { code?: unknown }).code;
	if (typeof topLevelCode === 'string') {
		candidateCodes.push(topLevelCode);
	}

	for (const candidate of candidateCodes) {
		if (!candidate) {
			continue;
		}
		const normalized = normalizeCreateUserErrorCode(candidate);
		if (normalized) {
			return normalized;
		}
	}

	return null;
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
			const errorCode = resolveCreateUserErrorCode(response.error) ?? 'UNKNOWN';
			return {
				success: false,
				error: 'Failed to create user',
				errorCode,
			};
		}

		const createdUserId = response.data?.data?.userId ?? null;

		if (!createdUserId) {
			return {
				success: false,
				error: 'Failed to create user',
				errorCode: 'UNKNOWN',
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
			errorCode: 'UNKNOWN',
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
