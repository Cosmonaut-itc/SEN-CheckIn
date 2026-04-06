'use server';

import { headers } from 'next/headers';

import { API_BASE_URL } from '@/lib/server-api';

type PaymentFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

export interface ImportedEmployeePreview {
	firstName: string;
	lastName: string;
	dailyPay: number | null;
	confidence: number;
	fieldConfidence: {
		firstName: number;
		lastName: number;
		dailyPay: number;
	};
	locationId: string;
	jobPositionId: string;
	paymentFrequency: PaymentFrequency;
}

export interface ImportDocumentResponse {
	employees: ImportedEmployeePreview[];
	processingMeta: {
		pagesProcessed: number;
		totalEmployeesFound: number;
		processingTimeMs: number;
	};
}

export interface BulkCreateEmployeeInput {
	code: string;
	firstName: string;
	lastName: string;
	dailyPay: number;
	paymentFrequency: PaymentFrequency;
	jobPositionId: string;
	locationId: string;
}

export interface BulkCreateEmployeesInput {
	employees: BulkCreateEmployeeInput[];
}

export interface BulkCreateEmployeesResponse {
	batchId: string;
	results: Array<{
		index: number;
		success: boolean;
		employeeId?: string;
		error?: string;
	}>;
	summary: {
		total: number;
		created: number;
		failed: number;
	};
}

export interface UndoBulkImportResponse {
	deleted: number;
	batchId: string;
}

export interface MutationResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * Reads the caller cookie header inside a server action.
 *
 * @returns Forwarded cookie header string
 */
async function getCookieHeader(): Promise<string> {
	const requestHeaders = await headers();
	return requestHeaders.get('cookie') ?? '';
}

/**
 * Extracts a human-readable error message from an API payload.
 *
 * @param payload - Parsed API payload
 * @param fallbackStatus - HTTP status used as fallback context
 * @returns Error message string
 */
function resolveErrorMessage(payload: unknown, fallbackStatus: number): string {
	if (payload && typeof payload === 'object') {
		const errorRecord = (payload as { error?: unknown }).error;
		if (errorRecord && typeof errorRecord === 'object') {
			const message = (errorRecord as { message?: unknown }).message;
			if (typeof message === 'string' && message.length > 0) {
				return message;
			}
		}
	}

	return `Error del servidor (${fallbackStatus})`;
}

/**
 * Sends a JSON request to the employee import API endpoints.
 *
 * @param args - Request method, path and optional body
 * @returns Standardized mutation result
 */
async function requestEmployeeImportApi<T>(args: {
	method: 'POST' | 'DELETE';
	path: string;
	body?: Record<string, unknown>;
}): Promise<MutationResult<T>> {
	try {
		const cookieHeader = await getCookieHeader();
		const response = await fetch(`${API_BASE_URL}${args.path}`, {
			method: args.method,
			headers: {
				'content-type': 'application/json',
				cookie: cookieHeader,
			},
			body: args.body ? JSON.stringify(args.body) : undefined,
		});
		const payload = (await response.json().catch(() => null)) as T | {
			error?: {
				message?: string;
			};
		} | null;

		if (!response.ok) {
			return {
				success: false,
				error: resolveErrorMessage(payload, response.status),
			};
		}

		return {
			success: true,
			data: payload as T,
		};
	} catch (error) {
		console.error('[employee-import] API request failed', {
			path: args.path,
			method: args.method,
			error,
		});
		return {
			success: false,
			error: 'No fue posible completar la solicitud.',
		};
	}
}

/**
 * Uploads a document for AI employee extraction.
 *
 * @param formData - Multipart request payload
 * @returns Standardized mutation result with extracted employees
 */
export async function importDocument(
	formData: FormData,
): Promise<MutationResult<ImportDocumentResponse>> {
	try {
		const cookieHeader = await getCookieHeader();
		const response = await fetch(`${API_BASE_URL}/employees/import`, {
			method: 'POST',
			headers: {
				cookie: cookieHeader,
			},
			body: formData,
		});
		const payload = (await response.json().catch(() => null)) as ImportDocumentResponse | {
			error?: {
				message?: string;
			};
		} | null;

		if (!response.ok) {
			return {
				success: false,
				error: resolveErrorMessage(payload, response.status),
			};
		}

		return {
			success: true,
			data: payload as ImportDocumentResponse,
		};
	} catch (error) {
		console.error('[employee-import] document import failed', error);
		return {
			success: false,
			error: 'Error procesando el documento.',
		};
	}
}

/**
 * Creates multiple employees from a reviewed bulk-import preview.
 *
 * @param input - Bulk employee payload
 * @returns Standardized mutation result
 */
export async function bulkCreateEmployees(
	input: BulkCreateEmployeesInput,
): Promise<MutationResult<BulkCreateEmployeesResponse>> {
	return await requestEmployeeImportApi<BulkCreateEmployeesResponse>({
		method: 'POST',
		path: '/employees/bulk',
		body: {
			employees: input.employees,
		},
	});
}

/**
 * Deletes all employees created under a bulk-import batch.
 *
 * @param batchId - Bulk import batch identifier
 * @returns Standardized mutation result
 */
export async function undoBulkImport(
	batchId: string,
): Promise<MutationResult<UndoBulkImportResponse>> {
	return await requestEmployeeImportApi<UndoBulkImportResponse>({
		method: 'DELETE',
		path: `/employees/bulk/${batchId}`,
	});
}
