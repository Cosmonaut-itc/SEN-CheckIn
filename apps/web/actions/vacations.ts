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

import { getApiResponseData, type ApiErrorPayload } from '@/lib/api-response';
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
	/** Error code if the operation failed */
	errorCode?: VacationMutationErrorCode;
	/** Error message if the operation failed */
	error?: string;
}

/**
 * Error codes for vacation request mutations.
 */
export type VacationMutationErrorCode =
	| 'BAD_REQUEST'
	| 'UNAUTHORIZED'
	| 'FORBIDDEN'
	| 'NOT_FOUND'
	| 'CONFLICT'
	| 'VACATION_EMPLOYEE_REQUIRED'
	| 'VACATION_EMPLOYEE_NOT_FOUND'
	| 'VACATION_INVALID_STATUS'
	| 'VACATION_HIRE_DATE_REQUIRED'
	| 'VACATION_INVALID_RANGE'
	| 'VACATION_SERVICE_YEAR_INCOMPLETE'
	| 'VACATION_INSUFFICIENT_BALANCE'
	| 'VACATION_OVERLAP'
	| 'VACATION_INCAPACITY_OVERLAP'
	| 'UNKNOWN';

type VacationErrorPayload = ApiErrorPayload | { error?: string };

const VACATION_ERROR_CODE_SET = new Set<VacationMutationErrorCode>([
	'BAD_REQUEST',
	'UNAUTHORIZED',
	'FORBIDDEN',
	'NOT_FOUND',
	'CONFLICT',
	'VACATION_EMPLOYEE_REQUIRED',
	'VACATION_EMPLOYEE_NOT_FOUND',
	'VACATION_INVALID_STATUS',
	'VACATION_HIRE_DATE_REQUIRED',
	'VACATION_INVALID_RANGE',
	'VACATION_SERVICE_YEAR_INCOMPLETE',
	'VACATION_INSUFFICIENT_BALANCE',
	'VACATION_OVERLAP',
	'VACATION_INCAPACITY_OVERLAP',
	'UNKNOWN',
]);

/**
 * Checks whether an error code is supported by vacation mutations.
 *
 * @param code - Error code candidate
 * @returns True when the code is a known vacation mutation error
 */
function isVacationErrorCode(code: string): code is VacationMutationErrorCode {
	return VACATION_ERROR_CODE_SET.has(code as VacationMutationErrorCode);
}

/**
 * Extracts the error code from an API response error payload.
 *
 * @param error - Error payload from Eden Treaty response
 * @returns Error code when available, otherwise null
 */
function extractVacationErrorCode(error: unknown): string | null {
	const payload = error as { value?: VacationErrorPayload } | null;
	const value = payload?.value;

	if (!value || typeof value !== 'object') {
		return null;
	}

	if ('error' in value && value.error) {
		if (typeof value.error === 'string') {
			return value.error;
		}
		if (
			typeof value.error === 'object' &&
			'code' in value.error &&
			typeof value.error.code === 'string'
		) {
			return value.error.code;
		}
	}

	return null;
}

/**
 * Resolves a mutation error code from the API response.
 *
 * @param status - HTTP status code from the API response
 * @param error - Error payload from the API response
 * @returns Normalized error code for UI handling
 */
function resolveVacationErrorCode(
	status: number | undefined,
	error: unknown,
): VacationMutationErrorCode {
	const errorCode = extractVacationErrorCode(error);
	if (errorCode && isVacationErrorCode(errorCode)) {
		return errorCode;
	}

	switch (status) {
		case 400:
			return 'BAD_REQUEST';
		case 401:
			return 'UNAUTHORIZED';
		case 403:
			return 'FORBIDDEN';
		case 404:
			return 'NOT_FOUND';
		case 409:
			return 'CONFLICT';
		default:
			return 'UNKNOWN';
	}
}

/**
 * Logs API errors for vacation actions with contextual metadata.
 *
 * @param action - Action identifier for logging
 * @param status - HTTP status code from the API response
 * @param error - Error payload from the API response
 * @param meta - Additional log context
 * @returns void
 */
function logVacationActionError(
	action: string,
	status: number | undefined,
	error: unknown,
	meta?: Record<string, unknown>,
): void {
	console.error(`[vacations:${action}] API error`, {
		status,
		error,
		...(meta ?? {}),
	});
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
			logVacationActionError('create', response.status, response.error, {
				employeeId: input.employeeId,
				startDateKey: input.startDateKey,
				endDateKey: input.endDateKey,
				status: input.status ?? 'SUBMITTED',
				notesLength: requestedNotes?.length ?? 0,
			});
			return {
				success: false,
				errorCode: resolveVacationErrorCode(response.status, response.error),
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: payload?.data as VacationRequest };
	} catch (error) {
		console.error('Failed to create vacation request:', error);
		return { success: false, errorCode: 'UNKNOWN' };
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
			logVacationActionError('approve', response.status, response.error, {
				requestId: input.id,
				notesLength: decisionNotes?.length ?? 0,
			});
			return {
				success: false,
				errorCode: resolveVacationErrorCode(response.status, response.error),
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: payload?.data as VacationRequest };
	} catch (error) {
		console.error('Failed to approve vacation request:', error);
		return { success: false, errorCode: 'UNKNOWN' };
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
			logVacationActionError('reject', response.status, response.error, {
				requestId: input.id,
				notesLength: decisionNotes?.length ?? 0,
			});
			return {
				success: false,
				errorCode: resolveVacationErrorCode(response.status, response.error),
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: payload?.data as VacationRequest };
	} catch (error) {
		console.error('Failed to reject vacation request:', error);
		return { success: false, errorCode: 'UNKNOWN' };
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
			logVacationActionError('cancel', response.status, response.error, {
				requestId: input.id,
				notesLength: decisionNotes?.length ?? 0,
			});
			return {
				success: false,
				errorCode: resolveVacationErrorCode(response.status, response.error),
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: payload?.data as VacationRequest };
	} catch (error) {
		console.error('Failed to cancel vacation request:', error);
		return { success: false, errorCode: 'UNKNOWN' };
	}
}
