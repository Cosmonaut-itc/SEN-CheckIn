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

/**
 * Input data for creating a new job position.
 */
export interface CreateJobPositionInput {
	/** Job position name */
	name: string;
	/** Job position description (optional) */
	description?: string;
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
}

/**
 * Error codes for job position mutations.
 */
export type JobPositionMutationErrorCode =
	| 'BAD_REQUEST'
	| 'FORBIDDEN'
	| 'NOT_FOUND'
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
}

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
 * Resolves a mutation error code from the API response status.
 *
 * @param status - HTTP status code from the API response
 * @param error - Error payload from the API response
 * @returns Normalized error code for UI handling
 */
function resolveErrorCode(status: number | undefined): JobPositionMutationErrorCode {
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
			organizationId: input.organizationId,
		});

		if (response.error) {
			return {
				success: false,
				errorCode: resolveErrorCode(response.status),
			};
		}

		return {
			success: true,
			data: response.data,
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
		} = {};

		if (input.name !== undefined) {
			updatePayload.name = input.name;
		}

		if (input.description !== undefined) {
			updatePayload.description = input.description;
		}

		const response = await api['job-positions'][input.id].put(updatePayload);

		if (response.error) {
			return {
				success: false,
				errorCode: resolveErrorCode(response.status),
			};
		}

		return {
			success: true,
			data: response.data,
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
				errorCode: resolveErrorCode(response.status),
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
