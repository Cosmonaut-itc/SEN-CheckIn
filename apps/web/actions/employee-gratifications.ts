'use server';

import { headers } from 'next/headers';

import type { EmployeeGratification } from '@/lib/client-functions';
import { createServerApiClient } from '@/lib/server-api';

export interface MutationResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

export interface CreateEmployeeGratificationInput {
	organizationId: string;
	employeeId: string;
	concept: string;
	amount: number;
	periodicity: EmployeeGratification['periodicity'];
	applicationMode: EmployeeGratification['applicationMode'];
	startDateKey: string;
	endDateKey?: string;
	notes?: string;
}

export interface UpdateEmployeeGratificationInput {
	organizationId: string;
	employeeId: string;
	id: string;
	concept?: string;
	amount?: number;
	periodicity?: EmployeeGratification['periodicity'];
	applicationMode?: EmployeeGratification['applicationMode'];
	status?: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
	startDateKey?: string;
	endDateKey?: string | null;
	notes?: string | null;
}

/**
 * Extracts a readable API error message from a mutation response.
 *
 * @param error - Unknown response error payload
 * @param fallbackMessage - Fallback message when the payload has no detail
 * @returns Human-readable error message
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
 * Resolves the forwarded cookie header for authenticated server actions.
 *
 * @returns Cookie header string
 */
async function getCookieHeader(): Promise<string> {
	const requestHeaders = await headers();
	return requestHeaders.get('cookie') ?? '';
}

/**
 * Creates a new employee gratification.
 *
 * @param input - Gratification creation payload
 * @returns Mutation result with API response payload
 */
export async function createEmployeeGratificationAction(
	input: CreateEmployeeGratificationInput,
): Promise<MutationResult> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.organizations[input.organizationId].employees[
			input.employeeId
		].gratifications.post({
			concept: input.concept.trim(),
			amount: input.amount,
			periodicity: input.periodicity,
			applicationMode: input.applicationMode,
			startDateKey: input.startDateKey,
			endDateKey: input.endDateKey?.trim() ? input.endDateKey.trim() : undefined,
			notes: input.notes?.trim() ? input.notes.trim() : undefined,
		});

		if (response.error) {
			return {
				success: false,
				error: getApiErrorMessage(response.error, 'No se pudo crear la gratificación'),
			};
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to create employee gratification:', error);
		return { success: false, error: 'No se pudo crear la gratificación' };
	}
}

/**
 * Updates an existing employee gratification.
 *
 * @param input - Gratification update payload
 * @returns Mutation result with API response payload
 */
export async function updateEmployeeGratificationAction(
	input: UpdateEmployeeGratificationInput,
): Promise<MutationResult> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.organizations[input.organizationId].employees[
			input.employeeId
		].gratifications[input.id].put({
			concept: input.concept?.trim(),
			amount: input.amount,
			periodicity: input.periodicity,
			applicationMode: input.applicationMode,
			status: input.status,
			startDateKey: input.startDateKey,
			endDateKey:
				typeof input.endDateKey === 'string'
					? input.endDateKey.trim() || null
					: input.endDateKey,
			notes: typeof input.notes === 'string' ? input.notes.trim() || null : input.notes,
		});

		if (response.error) {
			return {
				success: false,
				error: getApiErrorMessage(response.error, 'No se pudo actualizar la gratificación'),
			};
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to update employee gratification:', error);
		return { success: false, error: 'No se pudo actualizar la gratificación' };
	}
}

/**
 * Cancels an employee gratification by marking it as cancelled.
 *
 * @param input - Gratification cancellation payload
 * @returns Mutation result with API response payload
 */
export async function cancelEmployeeGratificationAction(input: {
	organizationId: string;
	employeeId: string;
	id: string;
}): Promise<MutationResult> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response =
			await api.organizations[input.organizationId].employees[
				input.employeeId
			].gratifications[input.id].delete();

		if (response.error) {
			return {
				success: false,
				error: getApiErrorMessage(response.error, 'No se pudo cancelar la gratificación'),
			};
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to cancel employee gratification:', error);
		return { success: false, error: 'No se pudo cancelar la gratificación' };
	}
}
