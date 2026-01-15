'use server';

/**
 * Server actions for job position CRUD operations.
 *
 * These actions are called from client components via useMutation
 * and execute on the server with full access to the API.
 *
 * All actions forward the caller's session cookies to the API
 * for proper authentication.
 *
 * @module actions/job-positions
 */

import { headers } from 'next/headers';
import { createServerApiClient } from '@/lib/server-api';
import type { ApiErrorPayload } from '@/lib/api-response';

/**
 * Input data for creating a new job position.
 */
export interface CreateJobPositionInput {
	/** Job position name */
	name: string;
	/** Job position description (optional) */
	description?: string;
	/** Daily pay rate (salario diario) */
	dailyPay: number;
	/** Payment frequency */
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	/** Optional organization override for API key flows (defaults to active org) */
	organizationId?: string;
}

/**
 * Input data for updating an existing job position.
 */
export interface UpdateJobPositionInput {
	/** The job position ID to update */
	id: string;
	/** Job position name */
	name?: string;
	/** Job position description (optional, can be null to clear) */
	description?: string | null;
	/** Daily pay rate (salario diario) */
	dailyPay?: number;
	/** Payment frequency */
	paymentFrequency?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
}

/**
 * Warning details for minimum wage validation.
 */
export interface JobPositionMinimumWageDetails {
	/** Daily pay provided for the position */
	dailyPay: number;
	/** Required minimum daily pay for the organization zones */
	minimumRequiredDailyPay: number;
	/** Geographic zones considered when validating the minimum wage */
	zones: Array<'GENERAL' | 'ZLFN'>;
}

/**
 * Warning payloads for job position mutations.
 */
export interface JobPositionWarning {
	/** Warning code identifier */
	code: 'BELOW_MINIMUM_WAGE';
	/** Additional details for the warning */
	details: JobPositionMinimumWageDetails;
}

/**
 * Error codes for job position mutations.
 */
export type JobPositionMutationErrorCode =
	| 'BAD_REQUEST'
	| 'FORBIDDEN'
	| 'NOT_FOUND'
	| 'BELOW_MINIMUM_WAGE'
	| 'UNKNOWN';

/**
 * Result of a mutation operation.
 */
export interface MutationResult<T = unknown> {
	/** Whether the operation was successful */
	success: boolean;
	/** The data returned from the operation */
	data?: T;
	/** Error code if the operation failed */
	errorCode?: JobPositionMutationErrorCode;
	/** Warnings returned by the API (non-blocking) */
	warnings?: JobPositionWarning[];
}

type JobPositionErrorPayload = ApiErrorPayload | { error?: string };

type JobPositionApiResponse = {
	warnings?: JobPositionWarning[];
};

/**
 * Retrieves the cookie header string from the incoming request.
 *
 * @returns A promise resolving to the cookie header string
 */
async function getCookieHeader(): Promise<string> {
	const requestHeaders = await headers();
	return requestHeaders.get('cookie') ?? '';
}

/**
 * Resolves a mutation error code from the API response.
 *
 * Supports both the new nested error structure ({ error: { code, message, details } })
 * and the legacy string format ({ error: string }) for backward compatibility.
 *
 * @param status - HTTP status code from the API response
 * @param error - Error payload from the API response
 * @returns Normalized error code for UI handling
 */
function resolveErrorCode(
	status: number | undefined,
	error: unknown,
): JobPositionMutationErrorCode {
	const payload = error as { value?: JobPositionErrorPayload } | null;
	const value = payload?.value;

	if (value && typeof value === 'object') {
		// Check new nested structure: { error: { code: 'BELOW_MINIMUM_WAGE', ... } }
		if (
			'error' in value &&
			typeof value.error === 'object' &&
			value.error !== null &&
			'code' in value.error &&
			value.error.code === 'BELOW_MINIMUM_WAGE'
		) {
			return 'BELOW_MINIMUM_WAGE';
		}

		// Check legacy string format: { error: 'BELOW_MINIMUM_WAGE' }
		if ('error' in value && value.error === 'BELOW_MINIMUM_WAGE') {
			return 'BELOW_MINIMUM_WAGE';
		}
	}

	switch (status) {
		case 400:
			return 'BAD_REQUEST';
		case 403:
			return 'FORBIDDEN';
		case 404:
			return 'NOT_FOUND';
		default:
			return 'UNKNOWN';
	}
}

/**
 * Extracts warnings from an API response payload.
 *
 * @param payload - API response payload
 * @returns Warning list when present
 */
function extractWarnings(payload: unknown): JobPositionWarning[] | undefined {
	const data = payload as JobPositionApiResponse | null;
	if (!data?.warnings || data.warnings.length === 0) {
		return undefined;
	}
	return data.warnings;
}

/**
 * Creates a new job position.
 *
 * @param input - The job position data to create
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await createJobPosition({
 *   name: 'Software Engineer',
 *   description: 'Develops software applications',
 * });
 * ```
 */
export async function createJobPosition(input: CreateJobPositionInput): Promise<MutationResult> {
	try {
		const cookieHeader = await getCookieHeader();
		const api = createServerApiClient(cookieHeader);

		const response = await api['job-positions'].post({
			name: input.name,
			description: input.description || undefined,
			dailyPay: input.dailyPay,
			paymentFrequency: input.paymentFrequency,
			organizationId: input.organizationId,
		});

		if (response.error) {
			return {
				success: false,
				errorCode: resolveErrorCode(response.status, response.error),
			};
		}

		return {
			success: true,
			data: response.data,
			warnings: extractWarnings(response.data),
		};
	} catch (error) {
		console.error('Failed to create job position:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
		};
	}
}

/**
 * Updates an existing job position.
 *
 * @param input - The job position data to update
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await updateJobPosition({
 *   id: 'job-position-id',
 *   name: 'Senior Software Engineer',
 * });
 * ```
 */
export async function updateJobPosition(input: UpdateJobPositionInput): Promise<MutationResult> {
	try {
		const cookieHeader = await getCookieHeader();
		const api = createServerApiClient(cookieHeader);

		const updatePayload: {
			name?: string;
			description?: string | null;
			dailyPay?: number;
			paymentFrequency?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
		} = {};

		if (input.name !== undefined) {
			updatePayload.name = input.name;
		}

		if (input.description !== undefined) {
			updatePayload.description = input.description;
		}

		if (input.dailyPay !== undefined) {
			updatePayload.dailyPay = input.dailyPay;
		}

		if (input.paymentFrequency !== undefined) {
			updatePayload.paymentFrequency = input.paymentFrequency;
		}

		const response = await api['job-positions'][input.id].put(updatePayload);

		if (response.error) {
			return {
				success: false,
				errorCode: resolveErrorCode(response.status, response.error),
			};
		}

		return {
			success: true,
			data: response.data,
			warnings: extractWarnings(response.data),
		};
	} catch (error) {
		console.error('Failed to update job position:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
		};
	}
}

/**
 * Deletes a job position.
 *
 * @param id - The job position ID to delete
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await deleteJobPosition('job-position-id');
 * ```
 */
export async function deleteJobPosition(id: string): Promise<MutationResult> {
	try {
		const cookieHeader = await getCookieHeader();
		const api = createServerApiClient(cookieHeader);

		const response = await api['job-positions'][id].delete();

		if (response.error) {
			return {
				success: false,
				errorCode: resolveErrorCode(response.status, response.error),
			};
		}

		return {
			success: true,
		};
	} catch (error) {
		console.error('Failed to delete job position:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
		};
	}
}
