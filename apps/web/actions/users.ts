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

import { headers } from 'next/headers';

import { getApiResponseData } from '@/lib/api-response';
import { createServerApiClient } from '@/lib/server-api';
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
 * Error codes for organization member role updates.
 */
export type UpdateOrganizationMemberRoleErrorCode =
	| 'ORGANIZATION_REQUIRED'
	| 'ORGANIZATION_MEMBERSHIP_REQUIRED'
	| 'ORGANIZATION_ADMIN_REQUIRED'
	| 'OWNER_ROLE_PROTECTED'
	| 'MEMBER_NOT_FOUND'
	| 'UNKNOWN';

/**
 * Error codes for global user deletion failures.
 */
export type DeleteGlobalUserErrorCode =
	| 'USER_ID_REQUIRED'
	| 'USER_NOT_FOUND'
	| 'LAST_ADMIN_OR_OWNER_PROTECTED'
	| 'USER_DELETE_CROSS_ORG_DEPENDENCY'
	| 'USER_DELETE_AUDIT_FALLBACK_REQUIRED'
	| 'ORGANIZATION_ADMIN_REQUIRED'
	| 'ORGANIZATION_MEMBERSHIP_REQUIRED'
	| 'UNKNOWN';

/**
 * Result of a mutation operation.
 */
export interface MutationResult<T = unknown, TErrorCode extends string = string> {
	/** Whether the operation was successful */
	success: boolean;
	/** The data returned from the operation */
	data?: T;
	/** Error message if the operation failed */
	error?: string;
	/** Error code if the operation failed */
	errorCode?: TErrorCode;
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
 * Input data for updating a member role within an organization.
 */
export interface UpdateOrganizationMemberRoleInput {
	/** Organization member id */
	memberId: string;
	/** Target organization ID */
	organizationId: string;
	/** New role to assign within the organization */
	role: 'admin' | 'member';
}

/**
 * Input data for deleting a global user account.
 */
export interface DeleteGlobalUserInput {
	/** Global user identifier to delete. */
	userId: string;
	/** Organization context for multi-organization sessions. */
	organizationId?: string | null;
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

const UPDATE_MEMBER_ROLE_ERROR_CODES = new Set<UpdateOrganizationMemberRoleErrorCode>([
	'ORGANIZATION_REQUIRED',
	'ORGANIZATION_MEMBERSHIP_REQUIRED',
	'ORGANIZATION_ADMIN_REQUIRED',
	'OWNER_ROLE_PROTECTED',
	'MEMBER_NOT_FOUND',
	'UNKNOWN',
]);

const DELETE_GLOBAL_USER_ERROR_CODES = new Set<DeleteGlobalUserErrorCode>([
	'USER_ID_REQUIRED',
	'USER_NOT_FOUND',
	'LAST_ADMIN_OR_OWNER_PROTECTED',
	'USER_DELETE_CROSS_ORG_DEPENDENCY',
	'USER_DELETE_AUDIT_FALLBACK_REQUIRED',
	'ORGANIZATION_ADMIN_REQUIRED',
	'ORGANIZATION_MEMBERSHIP_REQUIRED',
	'UNKNOWN',
]);

const CREATE_USER_ERROR_CODE_ALIASES: Record<string, CreateOrganizationUserErrorCode> = {
	USERNAME_IS_ALREADY_TAKEN_PLEASE_TRY_ANOTHER: 'USERNAME_IS_ALREADY_TAKEN',
	USERNAME_ALREADY_TAKEN: 'USERNAME_IS_ALREADY_TAKEN',
	USERNAME_TAKEN: 'USERNAME_IS_ALREADY_TAKEN',
	EMAIL_ALREADY_EXISTS: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
	EMAIL_IS_ALREADY_TAKEN: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
	EMAIL_IS_ALREADY_IN_USE: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
	EMAIL_ALREADY_IN_USE: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
};

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

	const aliasMatch = CREATE_USER_ERROR_CODE_ALIASES[normalized];
	if (aliasMatch) {
		return aliasMatch;
	}

	if (normalized.startsWith('USERNAME_IS_ALREADY_TAKEN')) {
		return 'USERNAME_IS_ALREADY_TAKEN';
	}

	if (normalized.includes('USERNAME') && normalized.includes('TAKEN')) {
		return 'USERNAME_IS_ALREADY_TAKEN';
	}

	if (
		normalized.includes('EMAIL') &&
		(normalized.includes('ALREADY') ||
			normalized.includes('EXISTS') ||
			normalized.includes('TAKEN') ||
			normalized.includes('IN_USE'))
	) {
		return 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL';
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

	const errorObject = typeof value.error === 'object' && value.error ? value.error : null;
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
 * Normalizes raw role-update error codes into a known value.
 *
 * @param value - Raw error code from the API payload
 * @returns Normalized error code or null when unavailable
 */
function normalizeUpdateOrganizationMemberRoleErrorCode(
	value: string,
): UpdateOrganizationMemberRoleErrorCode | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	const normalized = trimmed
		.replace(/[^a-zA-Z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.toUpperCase();

	if (UPDATE_MEMBER_ROLE_ERROR_CODES.has(normalized as UpdateOrganizationMemberRoleErrorCode)) {
		return normalized as UpdateOrganizationMemberRoleErrorCode;
	}

	return null;
}

/**
 * Extracts the API error payload details from a treaty client error object.
 *
 * @param error - Error payload returned by the API client
 * @returns Best-effort error message and code from the payload
 */
function extractApiErrorInfo(error: unknown): { code: string | null; message: string | null } {
	const payload = error as { message?: unknown; value?: ApiErrorPayload } | null;
	const candidateCodes: string[] = [];
	const candidateMessages: string[] = [];

	const value = payload?.value;
	if (!value || typeof value !== 'object') {
		if (typeof payload?.message === 'string') {
			candidateMessages.push(payload.message);
		}

		return {
			code: candidateCodes.find((candidate) => candidate.trim().length > 0)?.trim() ?? null,
			message:
				candidateMessages
					.find(
						(candidate) =>
							candidate.trim().length > 0 && candidate.trim() !== '[object Object]',
					)
					?.trim() ?? null,
		};
	}

	const topLevelCode = (value as { code?: unknown }).code;
	if (typeof topLevelCode === 'string') {
		candidateCodes.push(topLevelCode);
	}

	const errorObject = typeof value.error === 'object' && value.error ? value.error : null;

	if (errorObject && typeof errorObject === 'object') {
		const code = (errorObject as { code?: unknown }).code;
		if (typeof code === 'string') {
			candidateCodes.push(code);
		}

		const message = (errorObject as { message?: unknown }).message;
		if (typeof message === 'string') {
			candidateMessages.push(message);
		}

		const summary = extractValidationSummary((errorObject as { details?: unknown }).details);
		if (summary) {
			candidateMessages.push(summary);
		}
	}

	if (typeof value.error === 'string') {
		candidateMessages.push(value.error);
	}

	const topLevelSummary = extractValidationSummary((value as { details?: unknown }).details);
	if (topLevelSummary) {
		candidateMessages.push(topLevelSummary);
	}

	if (typeof payload?.message === 'string') {
		candidateMessages.push(payload.message);
	}

	return {
		code: candidateCodes.find((candidate) => candidate.trim().length > 0)?.trim() ?? null,
		message:
			candidateMessages
				.find(
					(candidate) =>
						candidate.trim().length > 0 && candidate.trim() !== '[object Object]',
				)
				?.trim() ?? null,
	};
}

/**
 * Resolves the role-update error code from a treaty client error payload.
 *
 * @param error - Error payload returned by the API client
 * @returns Normalized update-role error code or null when unavailable
 */
function resolveUpdateOrganizationMemberRoleErrorCode(
	error: unknown,
): UpdateOrganizationMemberRoleErrorCode | null {
	const errorCode = extractApiErrorInfo(error).code;
	if (!errorCode) {
		return null;
	}

	return normalizeUpdateOrganizationMemberRoleErrorCode(errorCode);
}

/**
 * Resolves a delete-global-user error code from an API error payload.
 *
 * @param error - Error payload returned by the API client
 * @returns Normalized error code or null when unavailable
 */
function resolveDeleteGlobalUserErrorCode(error: unknown): DeleteGlobalUserErrorCode | null {
	const errorCode = extractApiErrorInfo(error).code;
	if (!errorCode) {
		return null;
	}

	const normalized = errorCode.trim().toUpperCase();
	if (DELETE_GLOBAL_USER_ERROR_CODES.has(normalized as DeleteGlobalUserErrorCode)) {
		return normalized as DeleteGlobalUserErrorCode;
	}

	return 'UNKNOWN';
}

/**
 * Creates a new user and assigns them to an organization.
 *
 * @param input - User details and organization assignment
 * @returns A promise resolving to the mutation result
 */
export async function createOrganizationUser(
	input: CreateOrganizationUserInput,
): Promise<MutationResult<{ userId: string }, CreateOrganizationUserErrorCode>> {
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
			const logInput = { ...input, password: '[redacted]' };
			console.error('[users] Failed to create organization user', {
				input: logInput,
				error: response.error,
			});
			const errorCode = resolveCreateUserErrorCode(response.error) ?? 'UNKNOWN';
			return {
				success: false,
				error: 'Failed to create user',
				errorCode,
			};
		}

		const payload = getApiResponseData(response);
		const createdUserId = payload?.data?.userId ?? null;

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

		const payload = getApiResponseData(response);
		return {
			success: true,
			data: {
				memberId: payload?.data?.memberId ?? null,
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
 * Updates an existing organization member role.
 *
 * Uses the API route instead of calling Better Auth directly from the client so
 * platform superusers can manage memberships across organizations consistently.
 *
 * @param input - Member role update payload
 * @returns Mutation result with optional member snapshot
 */
export async function updateOrganizationMemberRole(
	input: UpdateOrganizationMemberRoleInput,
): Promise<
	MutationResult<
		{
			member?: {
				id: string;
				organizationId: string;
				role: string;
				userId: string;
			} | null;
		},
		UpdateOrganizationMemberRoleErrorCode
	>
> {
	try {
		const fallbackMessage = 'No se pudo actualizar el rol';
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api.organization['update-member-role-direct'].post({
			memberId: input.memberId,
			organizationId: input.organizationId,
			role: input.role,
		});

		if (response.error) {
			const errorInfo = extractApiErrorInfo(response.error);
			return {
				success: false,
				error: errorInfo.message ?? fallbackMessage,
				errorCode:
					resolveUpdateOrganizationMemberRoleErrorCode(response.error) ?? 'UNKNOWN',
			};
		}

		const payload = getApiResponseData(response);
		return {
			success: true,
			data: {
				member: payload?.data?.member ?? null,
			},
		};
	} catch (error) {
		console.error('Failed to update organization member role:', error);
		return {
			success: false,
			error: 'No se pudo actualizar el rol',
			errorCode: 'UNKNOWN',
		};
	}
}

/**
 * Deletes a global user account while preserving related historical records.
 *
 * @param input - Target user deletion payload
 * @returns Mutation result with impact summary when deletion succeeds
 */
export async function deleteGlobalUser(input: DeleteGlobalUserInput): Promise<
	MutationResult<
		{
			removedMemberships: number;
			unlinkedEmployees: number;
			reassignedDeductions: number;
			reassignedGratifications: number;
		},
		DeleteGlobalUserErrorCode
	>
> {
	try {
		if (!input.userId.trim()) {
			return {
				success: false,
				error: 'No se recibió el usuario a eliminar',
				errorCode: 'USER_ID_REQUIRED',
			};
		}

		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);
		const organizationId = input.organizationId?.trim() || null;
		const response = await api.organization['delete-user-global'].post({
			userId: input.userId,
			...(organizationId ? { organizationId } : {}),
		});

		if (response.error) {
			const errorInfo = extractApiErrorInfo(response.error);
			return {
				success: false,
				error: errorInfo.message ?? 'No se pudo eliminar el usuario',
				errorCode: resolveDeleteGlobalUserErrorCode(response.error) ?? 'UNKNOWN',
			};
		}

		const payload = getApiResponseData(response);
		return {
			success: true,
			data: {
				removedMemberships: Number(payload?.data?.removedMemberships ?? 0),
				unlinkedEmployees: Number(payload?.data?.unlinkedEmployees ?? 0),
				reassignedDeductions: Number(payload?.data?.reassignedDeductions ?? 0),
				reassignedGratifications: Number(payload?.data?.reassignedGratifications ?? 0),
			},
		};
	} catch (error) {
		console.error('Failed to delete global user:', error);
		return {
			success: false,
			error: 'No se pudo eliminar el usuario',
			errorCode: 'UNKNOWN',
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
