'use server';

/**
 * Server actions for IMSS incapacity workflows (HR/admin).
 *
 * These actions forward authenticated cookies to the API for
 * incapacity CRUD operations and document uploads.
 *
 * @module actions/incapacities
 */

import { headers } from 'next/headers';

import { getApiResponseData, type ApiErrorPayload } from '@/lib/api-response';
import { createServerApiClient } from '@/lib/server-api';
import type {
	IncapacityCreateInput,
	IncapacityDocument,
	IncapacityRecord,
	IncapacityUpdateInput,
} from '@/lib/client-functions';

/**
 * Result of a mutation operation.
 */
export interface MutationResult<T = unknown> {
	/** Whether the operation was successful */
	success: boolean;
	/** The data returned from the operation */
	data?: T;
	/** Error code if the operation failed */
	errorCode?: IncapacityMutationErrorCode;
	/** Error message if the operation failed */
	error?: string;
}

/**
 * Error codes for incapacity mutations.
 */
export type IncapacityMutationErrorCode =
	| 'BAD_REQUEST'
	| 'UNAUTHORIZED'
	| 'FORBIDDEN'
	| 'NOT_FOUND'
	| 'CONFLICT'
	| 'INCAPACITY_EMPLOYEE_REQUIRED'
	| 'INCAPACITY_EMPLOYEE_NOT_FOUND'
	| 'INCAPACITY_INVALID_RANGE'
	| 'INCAPACITY_SAT_MISMATCH'
	| 'INCAPACITY_BUCKET_NOT_CONFIGURED'
	| 'INCAPACITY_DOCUMENT_INVALID'
	| 'INCAPACITY_DOCUMENT_NOT_FOUND'
	| 'UNKNOWN';

type IncapacityErrorPayload = ApiErrorPayload | { error?: string };

const INCAPACITY_ERROR_CODE_SET = new Set<IncapacityMutationErrorCode>([
	'BAD_REQUEST',
	'UNAUTHORIZED',
	'FORBIDDEN',
	'NOT_FOUND',
	'CONFLICT',
	'INCAPACITY_EMPLOYEE_REQUIRED',
	'INCAPACITY_EMPLOYEE_NOT_FOUND',
	'INCAPACITY_INVALID_RANGE',
	'INCAPACITY_SAT_MISMATCH',
	'INCAPACITY_BUCKET_NOT_CONFIGURED',
	'INCAPACITY_DOCUMENT_INVALID',
	'INCAPACITY_DOCUMENT_NOT_FOUND',
	'UNKNOWN',
]);

/**
 * Checks whether an error code is supported by incapacity mutations.
 *
 * @param code - Error code candidate
 * @returns True when the code is a known incapacity mutation error
 */
function isIncapacityErrorCode(code: string): code is IncapacityMutationErrorCode {
	return INCAPACITY_ERROR_CODE_SET.has(code as IncapacityMutationErrorCode);
}

/**
 * Extracts the error code from an API response error payload.
 *
 * @param error - Error payload from Eden Treaty response
 * @returns Error code when available, otherwise null
 */
function extractIncapacityErrorCode(error: unknown): string | null {
	const payload = error as { value?: IncapacityErrorPayload } | null;
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
function resolveIncapacityErrorCode(
	status: number | undefined,
	error: unknown,
): IncapacityMutationErrorCode {
	const errorCode = extractIncapacityErrorCode(error);
	if (errorCode && isIncapacityErrorCode(errorCode)) {
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
 * Logs API errors for incapacity actions with contextual metadata.
 *
 * @param action - Action identifier for logging
 * @param status - HTTP status code from the API response
 * @param error - Error payload from the API response
 * @param meta - Additional log context
 * @returns void
 */
function logIncapacityActionError(
	action: string,
	status: number | undefined,
	error: unknown,
	meta?: Record<string, unknown>,
): void {
	console.error(`[incapacities:${action}] API error`, {
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
 * Creates a new incapacity record.
 *
 * @param input - Incapacity creation payload
 * @returns Mutation result with the created record
 */
export async function createIncapacityAction(
	input: IncapacityCreateInput,
): Promise<MutationResult<IncapacityRecord>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.incapacities.post({
			employeeId: input.employeeId,
			caseId: input.caseId.trim(),
			type: input.type,
			satTipoIncapacidad: input.satTipoIncapacidad,
			startDateKey: input.startDateKey,
			endDateKey: input.endDateKey,
			daysAuthorized: input.daysAuthorized,
			certificateFolio: input.certificateFolio?.trim() || undefined,
			issuedBy: input.issuedBy,
			sequence: input.sequence,
			percentOverride: input.percentOverride ?? undefined,
		});

		if (response.error) {
			logIncapacityActionError('create', response.status, response.error, {
				employeeId: input.employeeId,
				startDateKey: input.startDateKey,
				endDateKey: input.endDateKey,
				type: input.type,
			});
			return {
				success: false,
				errorCode: resolveIncapacityErrorCode(response.status, response.error),
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: payload?.data as IncapacityRecord };
	} catch (error) {
		console.error('Failed to create incapacity record:', error);
		return { success: false, errorCode: 'UNKNOWN' };
	}
}

/**
 * Updates an existing incapacity record.
 *
 * @param input - Incapacity update payload
 * @returns Mutation result with the updated record
 */
export async function updateIncapacityAction(
	input: IncapacityUpdateInput,
): Promise<MutationResult<IncapacityRecord>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.incapacities[input.id].put({
			caseId: input.caseId.trim(),
			type: input.type,
			satTipoIncapacidad: input.satTipoIncapacidad,
			startDateKey: input.startDateKey,
			endDateKey: input.endDateKey,
			daysAuthorized: input.daysAuthorized,
			certificateFolio: input.certificateFolio?.trim() || undefined,
			issuedBy: input.issuedBy,
			sequence: input.sequence,
			percentOverride: input.percentOverride ?? undefined,
			status: input.status,
		});

		if (response.error) {
			logIncapacityActionError('update', response.status, response.error, {
				incapacityId: input.id,
				employeeId: input.employeeId,
				startDateKey: input.startDateKey,
				endDateKey: input.endDateKey,
			});
			return {
				success: false,
				errorCode: resolveIncapacityErrorCode(response.status, response.error),
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: payload?.data as IncapacityRecord };
	} catch (error) {
		console.error('Failed to update incapacity record:', error);
		return { success: false, errorCode: 'UNKNOWN' };
	}
}

/**
 * Cancels an incapacity record.
 *
 * @param input - Cancel payload
 * @returns Mutation result with the updated record
 */
export async function cancelIncapacityAction(input: {
	id: string;
}): Promise<MutationResult<IncapacityRecord>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.incapacities[input.id].cancel.post({});

		if (response.error) {
			logIncapacityActionError('cancel', response.status, response.error, {
				incapacityId: input.id,
			});
			return {
				success: false,
				errorCode: resolveIncapacityErrorCode(response.status, response.error),
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: payload?.data as IncapacityRecord };
	} catch (error) {
		console.error('Failed to cancel incapacity record:', error);
		return { success: false, errorCode: 'UNKNOWN' };
	}
}

/**
 * Input payload for presigning incapacity document uploads.
 */
export interface IncapacityDocumentPresignInput {
	/** Incapacity identifier */
	incapacityId: string;
	/** File name */
	fileName: string;
	/** MIME content type */
	contentType: string;
	/** File size in bytes */
	sizeBytes: number;
}

/**
 * Presigned document response payload.
 */
export interface IncapacityDocumentPresignResult {
	/** Target upload URL */
	url: string;
	/** Form fields to include in the upload */
	fields: Record<string, string>;
	/** Server-generated document identifier */
	documentId: string;
	/** Object key for the uploaded document */
	objectKey: string;
	/** Bucket name */
	bucket: string;
}

/**
 * Creates a presigned POST policy for uploading incapacity documents.
 *
 * @param input - Presign payload
 * @returns Mutation result with presigned form data
 */
export async function presignIncapacityDocumentAction(
	input: IncapacityDocumentPresignInput,
): Promise<MutationResult<IncapacityDocumentPresignResult>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.incapacities[input.incapacityId].documents.presign.post({
			fileName: input.fileName,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
		});

		if (response.error) {
			logIncapacityActionError('presign', response.status, response.error, {
				incapacityId: input.incapacityId,
				fileName: input.fileName,
				contentType: input.contentType,
			});
			return {
				success: false,
				errorCode: resolveIncapacityErrorCode(response.status, response.error),
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: payload?.data as IncapacityDocumentPresignResult };
	} catch (error) {
		console.error('Failed to presign incapacity document upload:', error);
		return { success: false, errorCode: 'UNKNOWN' };
	}
}

/**
 * Input payload for confirming incapacity document uploads.
 */
export interface IncapacityDocumentConfirmInput {
	/** Incapacity identifier */
	incapacityId: string;
	/** Document identifier */
	documentId: string;
	/** Bucket object key */
	objectKey: string;
	/** Original file name */
	fileName: string;
	/** MIME content type */
	contentType: string;
	/** File size in bytes */
	sizeBytes: number;
	/** SHA-256 hex digest */
	sha256: string;
}

/**
 * Confirms an uploaded incapacity document and stores metadata.
 *
 * @param input - Confirm payload
 * @returns Mutation result with stored document metadata
 */
export async function confirmIncapacityDocumentAction(
	input: IncapacityDocumentConfirmInput,
): Promise<MutationResult<IncapacityDocument>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.incapacities[input.incapacityId].documents.confirm.post({
			documentId: input.documentId,
			objectKey: input.objectKey,
			fileName: input.fileName,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
			sha256: input.sha256,
		});

		if (response.error) {
			logIncapacityActionError('confirm', response.status, response.error, {
				incapacityId: input.incapacityId,
				documentId: input.documentId,
				objectKey: input.objectKey,
			});
			return {
				success: false,
				errorCode: resolveIncapacityErrorCode(response.status, response.error),
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: payload?.data as IncapacityDocument };
	} catch (error) {
		console.error('Failed to confirm incapacity document upload:', error);
		return { success: false, errorCode: 'UNKNOWN' };
	}
}

/**
 * Input payload for requesting an incapacity document URL.
 */
export interface IncapacityDocumentUrlInput {
	/** Incapacity identifier */
	incapacityId: string;
	/** Document identifier */
	documentId: string;
}

/**
 * Response payload for document URL fetches.
 */
export interface IncapacityDocumentUrlResult {
	/** Presigned URL */
	url: string;
}

/**
 * Retrieves a presigned URL for an incapacity document.
 *
 * @param input - Document URL payload
 * @returns Mutation result with the presigned URL
 */
export async function getIncapacityDocumentUrlAction(
	input: IncapacityDocumentUrlInput,
): Promise<MutationResult<IncapacityDocumentUrlResult>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response =
			await api.incapacities[input.incapacityId].documents[input.documentId].url.get();

		if (response.error) {
			logIncapacityActionError('document-url', response.status, response.error, {
				incapacityId: input.incapacityId,
				documentId: input.documentId,
			});
			return {
				success: false,
				errorCode: resolveIncapacityErrorCode(response.status, response.error),
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: payload?.data as IncapacityDocumentUrlResult };
	} catch (error) {
		console.error('Failed to fetch incapacity document URL:', error);
		return { success: false, errorCode: 'UNKNOWN' };
	}
}
