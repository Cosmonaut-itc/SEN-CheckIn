'use server';

import { headers } from 'next/headers';

import { createServerApiClient } from '@/lib/server-api';

export interface CreateOvertimeAuthorizationInput {
	organizationId: string;
	employeeId: string;
	dateKey: string;
	authorizedHours: number;
	notes?: string;
}

export interface UpdateOvertimeAuthorizationInput {
	organizationId: string;
	id: string;
	authorizedHours?: number;
	status?: 'ACTIVE' | 'CANCELLED';
	notes?: string;
}

export interface CancelOvertimeAuthorizationInput {
	organizationId: string;
	id: string;
}

export interface MutationResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * Extracts a human-readable API error message from an Eden error payload.
 *
 * @param error - Unknown response error object
 * @param fallbackMessage - Default message when the payload has no detail
 * @returns API message when available, otherwise the fallback
 */
function getApiErrorMessage(error: unknown, fallbackMessage: string): string {
	if (!error || typeof error !== 'object') {
		return fallbackMessage;
	}

	const directMessage = (error as { message?: unknown }).message;
	if (typeof directMessage === 'string' && directMessage.trim()) {
		return directMessage;
	}

	const nestedMessage = (
		error as {
			value?: {
				error?: {
					message?: unknown;
				};
			};
		}
	).value?.error?.message;
	if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
		return nestedMessage;
	}

	return fallbackMessage;
}

/**
 * Resolves the forwarded cookie header for server actions.
 *
 * @returns Cookie header string
 */
async function getCookieHeader(): Promise<string> {
	const requestHeaders = await headers();
	return requestHeaders.get('cookie') ?? '';
}

/**
 * Creates a new overtime authorization.
 *
 * @param input - Authorization payload
 * @returns Mutation result with API response payload
 */
export async function createOvertimeAuthorizationAction(
	input: CreateOvertimeAuthorizationInput,
): Promise<MutationResult> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.organizations[input.organizationId][
			'overtime-authorizations'
		].post({
			employeeId: input.employeeId,
			dateKey: input.dateKey,
			authorizedHours: input.authorizedHours,
			notes: input.notes?.trim() ? input.notes.trim() : undefined,
		});

		if (response.error) {
			return {
				success: false,
				error: getApiErrorMessage(
					response.error,
					'Failed to create overtime authorization',
				),
			};
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to create overtime authorization:', error);
		return { success: false, error: 'Failed to create overtime authorization' };
	}
}

/**
 * Updates an existing overtime authorization.
 *
 * @param input - Update payload
 * @returns Mutation result with API response payload
 */
export async function updateOvertimeAuthorizationAction(
	input: UpdateOvertimeAuthorizationInput,
): Promise<MutationResult> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.organizations[input.organizationId]['overtime-authorizations'][
			input.id
		].put({
			authorizedHours: input.authorizedHours,
			status: input.status,
			notes: input.notes?.trim() ? input.notes.trim() : undefined,
		});

		if (response.error) {
			return {
				success: false,
				error: getApiErrorMessage(
					response.error,
					'Failed to update overtime authorization',
				),
			};
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to update overtime authorization:', error);
		return { success: false, error: 'Failed to update overtime authorization' };
	}
}

/**
 * Cancels an overtime authorization via soft delete.
 *
 * @param input - Organization and authorization identifiers
 * @returns Mutation result with API response payload
 */
export async function cancelOvertimeAuthorizationAction(
	input: CancelOvertimeAuthorizationInput,
): Promise<MutationResult> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response =
			await api.organizations[input.organizationId]['overtime-authorizations'][
				input.id
			].delete();

		if (response.error) {
			return {
				success: false,
				error: getApiErrorMessage(
					response.error,
					'Failed to cancel overtime authorization',
				),
			};
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to cancel overtime authorization:', error);
		return { success: false, error: 'Failed to cancel overtime authorization' };
	}
}
