'use server';

/**
 * Server actions for staffing requirement CRUD operations.
 *
 * @module actions/staffing-requirements
 */

import { headers } from 'next/headers';
import { createServerApiClient } from '@/lib/server-api';

/**
 * Input data for creating a staffing requirement.
 */
export interface CreateStaffingRequirementInput {
	/** Optional organization override for API key flows */
	organizationId?: string;
	/** Required location identifier */
	locationId: string;
	/** Required job position identifier */
	jobPositionId: string;
	/** Minimum required employees */
	minimumRequired: number;
}

/**
 * Input data for updating a staffing requirement.
 */
export interface UpdateStaffingRequirementInput {
	/** Staffing requirement identifier */
	id: string;
	/** Optional location identifier */
	locationId?: string;
	/** Optional job position identifier */
	jobPositionId?: string;
	/** Optional minimum required employees */
	minimumRequired?: number;
}

/**
 * Error codes for staffing requirement mutations.
 */
export type StaffingRequirementMutationErrorCode =
	| 'BAD_REQUEST'
	| 'FORBIDDEN'
	| 'NOT_FOUND'
	| 'CONFLICT'
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
	errorCode?: StaffingRequirementMutationErrorCode;
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
 * @returns Normalized error code for UI handling
 */
function resolveErrorCode(status: number | undefined): StaffingRequirementMutationErrorCode {
	switch (status) {
		case 400:
			return 'BAD_REQUEST';
		case 401:
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
 * Creates a staffing requirement.
 *
 * @param input - Staffing requirement data to create
 * @returns A promise resolving to the mutation result
 */
export async function createStaffingRequirement(
	input: CreateStaffingRequirementInput,
): Promise<MutationResult> {
	try {
		const cookieHeader = await getCookieHeader();
		const api = createServerApiClient(cookieHeader);

		const response = await api['staffing-requirements'].post({
			organizationId: input.organizationId,
			locationId: input.locationId,
			jobPositionId: input.jobPositionId,
			minimumRequired: input.minimumRequired,
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
		console.error('Failed to create staffing requirement:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
		};
	}
}

/**
 * Updates a staffing requirement.
 *
 * @param input - Staffing requirement data to update
 * @returns A promise resolving to the mutation result
 */
export async function updateStaffingRequirement(
	input: UpdateStaffingRequirementInput,
): Promise<MutationResult> {
	try {
		const cookieHeader = await getCookieHeader();
		const api = createServerApiClient(cookieHeader);
		const updatePayload: {
			locationId?: string;
			jobPositionId?: string;
			minimumRequired?: number;
		} = {};

		if (input.locationId !== undefined) {
			updatePayload.locationId = input.locationId;
		}

		if (input.jobPositionId !== undefined) {
			updatePayload.jobPositionId = input.jobPositionId;
		}

		if (input.minimumRequired !== undefined) {
			updatePayload.minimumRequired = input.minimumRequired;
		}

		const response = await api['staffing-requirements'][input.id].put(updatePayload);

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
		console.error('Failed to update staffing requirement:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
		};
	}
}

/**
 * Deletes a staffing requirement.
 *
 * @param id - Staffing requirement ID to delete
 * @returns A promise resolving to the mutation result
 */
export async function deleteStaffingRequirement(id: string): Promise<MutationResult> {
	try {
		const cookieHeader = await getCookieHeader();
		const api = createServerApiClient(cookieHeader);
		const response = await api['staffing-requirements'][id].delete();

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
		console.error('Failed to delete staffing requirement:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
		};
	}
}
