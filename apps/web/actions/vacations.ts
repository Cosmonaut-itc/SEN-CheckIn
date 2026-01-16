'use server';

/**
 * Server actions for vacation request workflows (HR/admin).
 *
 * These actions forward session cookies to the API to perform
 * create/approve/reject/cancel operations for vacation requests.
 *
 * @module actions/vacations
 */

import { headers } from 'next/headers';

import { getApiResponseData } from '@/lib/api-response';
import { createServerApiClient } from '@/lib/server-api';
import type { VacationRequest } from '@/lib/client-functions';

/**
 * Input data for creating a vacation request.
 */
export interface CreateVacationRequestInput {
	/** Target employee ID */
	employeeId: string;
	/** Start date key (YYYY-MM-DD) */
	startDateKey: string;
	/** End date key (YYYY-MM-DD) */
	endDateKey: string;
	/** Optional notes for the request */
	requestedNotes?: string;
	/** Optional initial status (DRAFT or SUBMITTED) */
	status?: 'DRAFT' | 'SUBMITTED';
}

/**
 * Input data for vacation request decisions.
 */
export interface VacationDecisionInput {
	/** Request identifier */
	id: string;
	/** Optional decision notes */
	decisionNotes?: string;
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
 * Retrieves cookie header from the current request.
 *
 * @returns Cookie header string
 */
async function getCookieHeader(): Promise<string> {
	const requestHeaders = await headers();
	return requestHeaders.get('cookie') ?? '';
}

/**
 * Creates a vacation request for an employee.
 *
 * @param input - Vacation request payload
 * @returns Mutation result with the created request
 */
export async function createVacationRequestAction(
	input: CreateVacationRequestInput,
): Promise<MutationResult<VacationRequest>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const requestedNotes = input.requestedNotes?.trim() || undefined;

		const response = await api.vacations.requests.post({
			employeeId: input.employeeId,
			startDateKey: input.startDateKey,
			endDateKey: input.endDateKey,
			requestedNotes,
			status: input.status,
		});

		if (response.error) {
			return { success: false, error: 'Failed to create vacation request' };
		}

		const payload = getApiResponseData(response);
		return { success: true, data: payload?.data as VacationRequest };
	} catch (error) {
		console.error('Failed to create vacation request:', error);
		return { success: false, error: 'Failed to create vacation request' };
	}
}

/**
 * Approves a vacation request.
 *
 * @param input - Decision payload
 * @returns Mutation result with the updated request
 */
export async function approveVacationRequestAction(
	input: VacationDecisionInput,
): Promise<MutationResult<VacationRequest>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const decisionNotes = input.decisionNotes?.trim() || undefined;

		const response = await api.vacations.requests[input.id].approve.post({
			decisionNotes,
		});

		if (response.error) {
			return { success: false, error: 'Failed to approve vacation request' };
		}

		const payload = getApiResponseData(response);
		return { success: true, data: payload?.data as VacationRequest };
	} catch (error) {
		console.error('Failed to approve vacation request:', error);
		return { success: false, error: 'Failed to approve vacation request' };
	}
}

/**
 * Rejects a vacation request.
 *
 * @param input - Decision payload
 * @returns Mutation result with the updated request
 */
export async function rejectVacationRequestAction(
	input: VacationDecisionInput,
): Promise<MutationResult<VacationRequest>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const decisionNotes = input.decisionNotes?.trim() || undefined;

		const response = await api.vacations.requests[input.id].reject.post({
			decisionNotes,
		});

		if (response.error) {
			return { success: false, error: 'Failed to reject vacation request' };
		}

		const payload = getApiResponseData(response);
		return { success: true, data: payload?.data as VacationRequest };
	} catch (error) {
		console.error('Failed to reject vacation request:', error);
		return { success: false, error: 'Failed to reject vacation request' };
	}
}

/**
 * Cancels a vacation request.
 *
 * @param input - Decision payload
 * @returns Mutation result with the updated request
 */
export async function cancelVacationRequestAction(
	input: VacationDecisionInput,
): Promise<MutationResult<VacationRequest>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const decisionNotes = input.decisionNotes?.trim() || undefined;

		const response = await api.vacations.requests[input.id].cancel.post({
			decisionNotes,
		});

		if (response.error) {
			return { success: false, error: 'Failed to cancel vacation request' };
		}

		const payload = getApiResponseData(response);
		return { success: true, data: payload?.data as VacationRequest };
	} catch (error) {
		console.error('Failed to cancel vacation request:', error);
		return { success: false, error: 'Failed to cancel vacation request' };
	}
}
