'use server';

import { headers } from 'next/headers';
import type {
	EmployeeDocumentRequirementKey,
	EmployeeDocumentSource,
	EmploymentProfileSubtype,
	IdentificationSubtype,
	LegalDocumentKind,
	LegalTemplateStatus,
} from '@sen-checkin/types';

const API_BASE_URL: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Generic mutation result envelope used by document workflow server actions.
 */
export interface DocumentMutationResult<T = unknown> {
	/** Indicates whether the operation succeeded. */
	success: boolean;
	/** Optional payload returned by the API. */
	data?: T;
	/** Optional normalized error code. */
	errorCode?: string;
	/** Optional fallback message for UI toasts. */
	error?: string;
}

/**
 * Reads the request cookie header in a server action context.
 *
 * @returns Cookie header value or empty string
 */
async function getCookieHeader(): Promise<string> {
	const requestHeaders = await headers();
	return requestHeaders.get('cookie') ?? '';
}

/**
 * Extracts a normalized error code from an API error response.
 *
 * @param payload - Parsed JSON payload from the API
 * @param status - HTTP status code
 * @returns Error code string
 */
function resolveDocumentErrorCode(payload: unknown, status: number): string {
	if (payload && typeof payload === 'object') {
		const errorRecord = (payload as { error?: unknown }).error;
		if (errorRecord && typeof errorRecord === 'object') {
			const code = (errorRecord as { code?: unknown }).code;
			if (typeof code === 'string' && code.length > 0) {
				return code;
			}
		}
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
 * Sends a JSON request to the API using the caller's cookies.
 *
 * @param args - Request configuration
 * @returns Standardized mutation result with parsed payload
 */
async function requestDocumentApi<T>(args: {
	method: 'GET' | 'POST' | 'PUT';
	path: string;
	body?: Record<string, unknown>;
}): Promise<DocumentMutationResult<T>> {
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

		const payload = (await response.json().catch(() => null)) as
			| { data?: T; error?: { message?: string; code?: string } }
			| null;

		if (!response.ok) {
			return {
				success: false,
				errorCode: resolveDocumentErrorCode(payload, response.status),
				error:
					payload?.error?.message ??
					`Request failed with status ${response.status}`,
			};
		}

		return {
			success: true,
			data: payload?.data as T,
		};
	} catch (error) {
		console.error('[employee-documents] API request failed', {
			path: args.path,
			method: args.method,
			error,
		});
		return {
			success: false,
			errorCode: 'UNKNOWN',
			error: 'Request failed',
		};
	}
}

/**
 * Payload for employee document presign requests.
 */
export interface EmployeeDocumentPresignInput {
	employeeId: string;
	requirementKey: EmployeeDocumentRequirementKey;
	fileName: string;
	contentType: string;
	sizeBytes: number;
}

/**
 * Response payload for employee document presign requests.
 */
export interface EmployeeDocumentPresignResult {
	url: string;
	fields: Record<string, string>;
	docVersionId: string;
	objectKey: string;
	bucket: string;
}

/**
 * Creates a presigned upload payload for an employee document requirement.
 *
 * @param input - Presign input
 * @returns Mutation result with presigned payload
 */
export async function presignEmployeeDocumentAction(
	input: EmployeeDocumentPresignInput,
): Promise<DocumentMutationResult<EmployeeDocumentPresignResult>> {
	return await requestDocumentApi<EmployeeDocumentPresignResult>({
		method: 'POST',
		path: `/employees/${input.employeeId}/documents/${input.requirementKey}/presign`,
		body: {
			fileName: input.fileName,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
		},
	});
}

/**
 * Payload for employee document confirm requests.
 */
export interface EmployeeDocumentConfirmInput {
	employeeId: string;
	requirementKey: EmployeeDocumentRequirementKey;
	docVersionId: string;
	objectKey: string;
	fileName: string;
	contentType: string;
	sizeBytes: number;
	sha256: string;
	source?: EmployeeDocumentSource;
	generationId?: string;
	identificationSubtype?: IdentificationSubtype;
	employmentProfileSubtype?: EmploymentProfileSubtype;
	signedAtDateKey?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Confirms a previously uploaded employee document.
 *
 * @param input - Confirm input
 * @returns Mutation result with persisted document version
 */
export async function confirmEmployeeDocumentAction(
	input: EmployeeDocumentConfirmInput,
): Promise<DocumentMutationResult<Record<string, unknown>>> {
	return await requestDocumentApi<Record<string, unknown>>({
		method: 'POST',
		path: `/employees/${input.employeeId}/documents/${input.requirementKey}/confirm`,
		body: {
			docVersionId: input.docVersionId,
			objectKey: input.objectKey,
			fileName: input.fileName,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
			sha256: input.sha256,
			source: input.source,
			generationId: input.generationId,
			identificationSubtype: input.identificationSubtype,
			employmentProfileSubtype: input.employmentProfileSubtype,
			signedAtDateKey: input.signedAtDateKey,
			metadata: input.metadata,
		},
	});
}

/**
 * Reviews a current employee document version.
 *
 * @param input - Review input
 * @returns Mutation result with updated document version
 */
export async function reviewEmployeeDocumentAction(input: {
	employeeId: string;
	docVersionId: string;
	reviewStatus: 'APPROVED' | 'REJECTED';
	reviewComment?: string;
}): Promise<DocumentMutationResult<Record<string, unknown>>> {
	return await requestDocumentApi<Record<string, unknown>>({
		method: 'POST',
		path: `/employees/${input.employeeId}/documents/${input.docVersionId}/review`,
		body: {
			reviewStatus: input.reviewStatus,
			reviewComment: input.reviewComment,
		},
	});
}

/**
 * Generates a legal document instance for an employee.
 *
 * @param input - Generation input
 * @returns Mutation result with generation data and rendered HTML
 */
export async function generateEmployeeLegalDocumentAction(input: {
	employeeId: string;
	kind: LegalDocumentKind;
	templateId?: string;
}): Promise<DocumentMutationResult<Record<string, unknown>>> {
	return await requestDocumentApi<Record<string, unknown>>({
		method: 'POST',
		path: `/employees/${input.employeeId}/legal-documents/${input.kind}/generations`,
		body: {
			templateId: input.templateId,
		},
	});
}

/**
 * Confirms a digitally signed legal document.
 *
 * @param input - Digital signature input
 * @returns Mutation result with stored signed document version
 */
export async function signEmployeeLegalDigitalAction(input: {
	employeeId: string;
	kind: LegalDocumentKind;
	generationId: string;
	signatureDataUrl?: string;
	signedAtDateKey?: string;
	metadata?: Record<string, unknown>;
}): Promise<DocumentMutationResult<Record<string, unknown>>> {
	return await requestDocumentApi<Record<string, unknown>>({
		method: 'POST',
		path: `/employees/${input.employeeId}/legal-documents/${input.kind}/sign-digital/confirm`,
		body: {
			generationId: input.generationId,
			signatureDataUrl: input.signatureDataUrl,
			signedAtDateKey: input.signedAtDateKey,
			metadata: input.metadata,
		},
	});
}

/**
 * Creates a presigned upload payload for a physically signed legal document.
 *
 * @param input - Presign input
 * @returns Mutation result with presigned payload
 */
export async function presignEmployeeLegalPhysicalAction(input: {
	employeeId: string;
	kind: LegalDocumentKind;
	fileName: string;
	contentType: string;
	sizeBytes: number;
}): Promise<DocumentMutationResult<EmployeeDocumentPresignResult>> {
	return await requestDocumentApi<EmployeeDocumentPresignResult>({
		method: 'POST',
		path: `/employees/${input.employeeId}/legal-documents/${input.kind}/sign-physical/presign`,
		body: {
			fileName: input.fileName,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
		},
	});
}

/**
 * Confirms a physically signed legal document upload.
 *
 * @param input - Physical sign confirm input
 * @returns Mutation result with persisted document version
 */
export async function confirmEmployeeLegalPhysicalAction(input: {
	employeeId: string;
	kind: LegalDocumentKind;
	docVersionId: string;
	generationId: string;
	objectKey: string;
	fileName: string;
	contentType: string;
	sizeBytes: number;
	sha256: string;
	signedAtDateKey?: string;
	metadata?: Record<string, unknown>;
}): Promise<DocumentMutationResult<Record<string, unknown>>> {
	return await requestDocumentApi<Record<string, unknown>>({
		method: 'POST',
		path: `/employees/${input.employeeId}/legal-documents/${input.kind}/sign-physical/confirm`,
		body: {
			docVersionId: input.docVersionId,
			generationId: input.generationId,
			objectKey: input.objectKey,
			fileName: input.fileName,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
			sha256: input.sha256,
			signedAtDateKey: input.signedAtDateKey,
			metadata: input.metadata,
		},
	});
}

/**
 * Updates organization document workflow configuration.
 *
 * @param input - Config update payload
 * @returns Mutation result with updated config and requirements
 */
export async function updateDocumentWorkflowConfigAction(input: {
	baseApprovedThresholdForLegal?: number;
	requirements?: Array<{
		requirementKey: EmployeeDocumentRequirementKey;
		isRequired: boolean;
		displayOrder: number;
		activationStage: 'BASE' | 'LEGAL_AFTER_GATE';
	}>;
}): Promise<DocumentMutationResult<Record<string, unknown>>> {
	return await requestDocumentApi<Record<string, unknown>>({
		method: 'PUT',
		path: '/document-workflow/config',
		body: {
			baseApprovedThresholdForLegal: input.baseApprovedThresholdForLegal,
			requirements: input.requirements,
		},
	});
}

/**
 * Creates a new draft legal template for an organization.
 *
 * @param input - Draft template payload
 * @returns Mutation result with created template row
 */
export async function createLegalTemplateDraftAction(input: {
	kind: LegalDocumentKind;
	htmlContent: string;
	variablesSchemaSnapshot?: Record<string, unknown>;
}): Promise<DocumentMutationResult<Record<string, unknown>>> {
	return await requestDocumentApi<Record<string, unknown>>({
		method: 'POST',
		path: `/document-workflow/templates/${input.kind}/draft`,
		body: {
			htmlContent: input.htmlContent,
			variablesSchemaSnapshot: input.variablesSchemaSnapshot,
		},
	});
}

/**
 * Updates an existing legal template row.
 *
 * @param input - Template update payload
 * @returns Mutation result with updated template
 */
export async function updateLegalTemplateAction(input: {
	templateId: string;
	htmlContent?: string;
	status?: LegalTemplateStatus;
	variablesSchemaSnapshot?: Record<string, unknown>;
}): Promise<DocumentMutationResult<Record<string, unknown>>> {
	return await requestDocumentApi<Record<string, unknown>>({
		method: 'PUT',
		path: `/document-workflow/templates/${input.templateId}`,
		body: {
			htmlContent: input.htmlContent,
			status: input.status,
			variablesSchemaSnapshot: input.variablesSchemaSnapshot,
		},
	});
}

/**
 * Publishes an existing legal template.
 *
 * @param templateId - Template identifier
 * @returns Mutation result with published template row
 */
export async function publishLegalTemplateAction(
	templateId: string,
): Promise<DocumentMutationResult<Record<string, unknown>>> {
	return await requestDocumentApi<Record<string, unknown>>({
		method: 'POST',
		path: `/document-workflow/templates/${templateId}/publish`,
	});
}

/**
 * Creates a presigned upload payload for legal branding logo.
 *
 * @param input - Branding presign payload
 * @returns Mutation result with presigned payload
 */
export async function presignLegalBrandingAction(input: {
	fileName: string;
	contentType: string;
	sizeBytes: number;
}): Promise<DocumentMutationResult<{ url: string; fields: Record<string, string>; objectKey: string }>> {
	return await requestDocumentApi<{ url: string; fields: Record<string, string>; objectKey: string }>({
		method: 'POST',
		path: '/document-workflow/branding/presign',
		body: {
			fileName: input.fileName,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
		},
	});
}

/**
 * Confirms legal branding values and optional logo metadata.
 *
 * @param input - Branding confirm payload
 * @returns Mutation result with persisted branding row
 */
export async function confirmLegalBrandingAction(input: {
	objectKey?: string;
	fileName?: string;
	contentType?: string;
	sizeBytes?: number;
	sha256?: string;
	displayName?: string;
	headerText?: string;
}): Promise<DocumentMutationResult<Record<string, unknown>>> {
	return await requestDocumentApi<Record<string, unknown>>({
		method: 'POST',
		path: '/document-workflow/branding/confirm',
		body: {
			objectKey: input.objectKey,
			fileName: input.fileName,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
			sha256: input.sha256,
			displayName: input.displayName,
			headerText: input.headerText,
		},
	});
}
