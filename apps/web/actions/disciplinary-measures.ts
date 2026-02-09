'use server';

import { headers } from 'next/headers';
import type { DisciplinaryOutcome, DisciplinarySignatureStatus } from '@sen-checkin/types';

import { getApiResponseData, type ApiErrorPayload } from '@/lib/api-response';
import { createServerApiClient } from '@/lib/server-api';

/**
 * Generic mutation result envelope used by disciplinary server actions.
 */
export interface DisciplinaryMutationResult<T = unknown> {
	/** Indicates whether the operation succeeded. */
	success: boolean;
	/** Optional payload returned by the API. */
	data?: T;
	/** Optional normalized error code. */
	errorCode?: string;
	/** Optional fallback message for UI toasts. */
	error?: string;
}

interface PresignPayload {
	url: string;
	fields: Record<string, string>;
	objectKey: string;
	bucket: string;
}

/**
 * Input payload for creating a disciplinary measure.
 */
export interface CreateDisciplinaryMeasureInput {
	employeeId: string;
	incidentDateKey: string;
	reason: string;
	policyReference?: string;
	outcome: DisciplinaryOutcome;
	suspensionStartDateKey?: string;
	suspensionEndDateKey?: string;
}

/**
 * Input payload for updating a disciplinary measure.
 */
export interface UpdateDisciplinaryMeasureInput {
	id: string;
	incidentDateKey?: string;
	reason?: string;
	policyReference?: string | null;
	outcome?: DisciplinaryOutcome;
	suspensionStartDateKey?: string | null;
	suspensionEndDateKey?: string | null;
}

/**
 * Input payload for file presign endpoints.
 */
export interface DisciplinaryFilePresignInput {
	id: string;
	fileName: string;
	contentType: string;
	sizeBytes: number;
}

/**
 * Input payload for confirming signed acta upload.
 */
export interface ConfirmDisciplinarySignedActaInput {
	id: string;
	docVersionId: string;
	generationId: string;
	objectKey: string;
	fileName: string;
	contentType: string;
	sizeBytes: number;
	sha256: string;
	signedAtDateKey?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Input payload for confirming refusal certificate upload.
 */
export interface ConfirmDisciplinaryRefusalInput {
	id: string;
	docVersionId: string;
	generationId: string;
	objectKey: string;
	fileName: string;
	contentType: string;
	sizeBytes: number;
	sha256: string;
	signedAtDateKey?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Input payload for confirming attachment upload.
 */
export interface ConfirmDisciplinaryAttachmentInput {
	id: string;
	attachmentId: string;
	objectKey: string;
	fileName: string;
	contentType: string;
	sizeBytes: number;
	sha256: string;
	metadata?: Record<string, unknown>;
}

/**
 * Input payload for closing disciplinary measures.
 */
export interface CloseDisciplinaryMeasureInput {
	id: string;
	signatureStatus: DisciplinarySignatureStatus;
	notes?: string;
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
 * Extracts a normalized API error code from an Eden Treaty error payload.
 *
 * @param status - HTTP status code
 * @param error - Unknown Eden Treaty error payload
 * @returns Error code string
 */
function resolveDisciplinaryErrorCode(status: number | undefined, error: unknown): string {
	const payload = error as { value?: ApiErrorPayload } | null;
	const code = payload?.value?.error?.code;
	if (typeof code === 'string' && code.length > 0) {
		return code;
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
 * Creates a disciplinary measure.
 *
 * @param input - Measure creation payload
 * @returns Mutation result with created measure
 */
export async function createDisciplinaryMeasureAction(
	input: CreateDisciplinaryMeasureInput,
): Promise<DisciplinaryMutationResult<Record<string, unknown>>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api['disciplinary-measures'].post({
			employeeId: input.employeeId,
			incidentDateKey: input.incidentDateKey,
			reason: input.reason,
			policyReference: input.policyReference,
			outcome: input.outcome,
			suspensionStartDateKey: input.suspensionStartDateKey,
			suspensionEndDateKey: input.suspensionEndDateKey,
		});

		if (response.error) {
			return {
				success: false,
				errorCode: resolveDisciplinaryErrorCode(response.status, response.error),
				error: 'No se pudo crear la medida disciplinaria',
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: (payload?.data ?? null) as Record<string, unknown> };
	} catch (error) {
		console.error('Failed to create disciplinary measure:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
			error: 'No se pudo crear la medida disciplinaria',
		};
	}
}

/**
 * Updates a disciplinary measure.
 *
 * @param input - Measure update payload
 * @returns Mutation result with updated measure
 */
export async function updateDisciplinaryMeasureAction(
	input: UpdateDisciplinaryMeasureInput,
): Promise<DisciplinaryMutationResult<Record<string, unknown>>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api['disciplinary-measures'][input.id].put({
			incidentDateKey: input.incidentDateKey,
			reason: input.reason,
			policyReference: input.policyReference,
			outcome: input.outcome,
			suspensionStartDateKey: input.suspensionStartDateKey,
			suspensionEndDateKey: input.suspensionEndDateKey,
		});

		if (response.error) {
			return {
				success: false,
				errorCode: resolveDisciplinaryErrorCode(response.status, response.error),
				error: 'No se pudo actualizar la medida disciplinaria',
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: (payload?.data ?? null) as Record<string, unknown> };
	} catch (error) {
		console.error('Failed to update disciplinary measure:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
			error: 'No se pudo actualizar la medida disciplinaria',
		};
	}
}

/**
 * Generates disciplinary acta draft from legal template.
 *
 * @param input - Measure identifier and optional template override
 * @returns Mutation result with generation payload
 */
export async function generateDisciplinaryActaAction(input: {
	id: string;
	templateId?: string;
}): Promise<DisciplinaryMutationResult<Record<string, unknown>>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api['disciplinary-measures'][input.id]['generate-acta'].post({
			templateId: input.templateId,
		});

		if (response.error) {
			return {
				success: false,
				errorCode: resolveDisciplinaryErrorCode(response.status, response.error),
				error: 'No se pudo generar el acta administrativa',
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: (payload?.data ?? null) as Record<string, unknown> };
	} catch (error) {
		console.error('Failed to generate disciplinary acta:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
			error: 'No se pudo generar el acta administrativa',
		};
	}
}

/**
 * Requests a presigned upload for signed acta file.
 *
 * @param input - Upload presign payload
 * @returns Mutation result with presigned fields
 */
export async function presignDisciplinarySignedActaAction(
	input: DisciplinaryFilePresignInput,
): Promise<DisciplinaryMutationResult<PresignPayload & { docVersionId: string }>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api['disciplinary-measures'][input.id]['signed-acta'].presign.post({
			fileName: input.fileName,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
		});

		if (response.error) {
			return {
				success: false,
				errorCode: resolveDisciplinaryErrorCode(response.status, response.error),
				error: 'No se pudo preparar la carga del acta firmada',
			};
		}

		const payload = getApiResponseData(response);
		return {
			success: true,
			data: (payload?.data ?? null) as PresignPayload & { docVersionId: string },
		};
	} catch (error) {
		console.error('Failed to presign signed acta upload:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
			error: 'No se pudo preparar la carga del acta firmada',
		};
	}
}

/**
 * Confirms signed acta upload metadata.
 *
 * @param input - Confirm payload
 * @returns Mutation result with persisted document version
 */
export async function confirmDisciplinarySignedActaAction(
	input: ConfirmDisciplinarySignedActaInput,
): Promise<DisciplinaryMutationResult<Record<string, unknown>>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api['disciplinary-measures'][input.id]['signed-acta'].confirm.post({
			docVersionId: input.docVersionId,
			generationId: input.generationId,
			objectKey: input.objectKey,
			fileName: input.fileName,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
			sha256: input.sha256,
			signedAtDateKey: input.signedAtDateKey,
			metadata: input.metadata,
		});

		if (response.error) {
			return {
				success: false,
				errorCode: resolveDisciplinaryErrorCode(response.status, response.error),
				error: 'No se pudo confirmar el acta firmada',
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: (payload?.data ?? null) as Record<string, unknown> };
	} catch (error) {
		console.error('Failed to confirm signed acta upload:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
			error: 'No se pudo confirmar el acta firmada',
		};
	}
}

/**
 * Generates refusal certificate draft from legal template.
 *
 * @param input - Measure identifier with optional template/refusal reason
 * @returns Mutation result with generation payload
 */
export async function generateDisciplinaryRefusalAction(input: {
	id: string;
	templateId?: string;
	refusalReason?: string;
}): Promise<DisciplinaryMutationResult<Record<string, unknown>>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api['disciplinary-measures'][input.id].refusal.generate.post({
			templateId: input.templateId,
			refusalReason: input.refusalReason,
		});

		if (response.error) {
			return {
				success: false,
				errorCode: resolveDisciplinaryErrorCode(response.status, response.error),
				error: 'No se pudo generar la constancia de negativa',
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: (payload?.data ?? null) as Record<string, unknown> };
	} catch (error) {
		console.error('Failed to generate refusal certificate:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
			error: 'No se pudo generar la constancia de negativa',
		};
	}
}

/**
 * Requests a presigned upload for refusal certificate file.
 *
 * @param input - Upload presign payload
 * @returns Mutation result with presigned fields
 */
export async function presignDisciplinaryRefusalAction(
	input: DisciplinaryFilePresignInput,
): Promise<DisciplinaryMutationResult<PresignPayload & { docVersionId: string }>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api['disciplinary-measures'][input.id].refusal.presign.post({
			fileName: input.fileName,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
		});

		if (response.error) {
			return {
				success: false,
				errorCode: resolveDisciplinaryErrorCode(response.status, response.error),
				error: 'No se pudo preparar la carga de la constancia',
			};
		}

		const payload = getApiResponseData(response);
		return {
			success: true,
			data: (payload?.data ?? null) as PresignPayload & { docVersionId: string },
		};
	} catch (error) {
		console.error('Failed to presign refusal upload:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
			error: 'No se pudo preparar la carga de la constancia',
		};
	}
}

/**
 * Confirms refusal certificate upload metadata.
 *
 * @param input - Confirm payload
 * @returns Mutation result with persisted document version
 */
export async function confirmDisciplinaryRefusalAction(
	input: ConfirmDisciplinaryRefusalInput,
): Promise<DisciplinaryMutationResult<Record<string, unknown>>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api['disciplinary-measures'][input.id].refusal.confirm.post({
			docVersionId: input.docVersionId,
			generationId: input.generationId,
			objectKey: input.objectKey,
			fileName: input.fileName,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
			sha256: input.sha256,
			signedAtDateKey: input.signedAtDateKey,
			metadata: input.metadata,
		});

		if (response.error) {
			return {
				success: false,
				errorCode: resolveDisciplinaryErrorCode(response.status, response.error),
				error: 'No se pudo confirmar la constancia de negativa',
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: (payload?.data ?? null) as Record<string, unknown> };
	} catch (error) {
		console.error('Failed to confirm refusal upload:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
			error: 'No se pudo confirmar la constancia de negativa',
		};
	}
}

/**
 * Requests a presigned upload for evidence attachments.
 *
 * @param input - Upload presign payload
 * @returns Mutation result with presigned fields
 */
export async function presignDisciplinaryAttachmentAction(
	input: DisciplinaryFilePresignInput,
): Promise<DisciplinaryMutationResult<PresignPayload & { attachmentId: string }>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api['disciplinary-measures'][input.id].attachments.presign.post({
			fileName: input.fileName,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
		});

		if (response.error) {
			return {
				success: false,
				errorCode: resolveDisciplinaryErrorCode(response.status, response.error),
				error: 'No se pudo preparar la carga del adjunto',
			};
		}

		const payload = getApiResponseData(response);
		return {
			success: true,
			data: (payload?.data ?? null) as PresignPayload & { attachmentId: string },
		};
	} catch (error) {
		console.error('Failed to presign disciplinary attachment upload:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
			error: 'No se pudo preparar la carga del adjunto',
		};
	}
}

/**
 * Confirms disciplinary attachment upload metadata.
 *
 * @param input - Confirm payload
 * @returns Mutation result with persisted attachment
 */
export async function confirmDisciplinaryAttachmentAction(
	input: ConfirmDisciplinaryAttachmentInput,
): Promise<DisciplinaryMutationResult<Record<string, unknown>>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api['disciplinary-measures'][input.id].attachments.confirm.post({
			attachmentId: input.attachmentId,
			objectKey: input.objectKey,
			fileName: input.fileName,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
			sha256: input.sha256,
			metadata: input.metadata,
		});

		if (response.error) {
			return {
				success: false,
				errorCode: resolveDisciplinaryErrorCode(response.status, response.error),
				error: 'No se pudo confirmar el adjunto',
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: (payload?.data ?? null) as Record<string, unknown> };
	} catch (error) {
		console.error('Failed to confirm disciplinary attachment upload:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
			error: 'No se pudo confirmar el adjunto',
		};
	}
}

/**
 * Deletes a disciplinary attachment.
 *
 * @param input - Measure and attachment identifiers
 * @returns Mutation result with deleted attachment id
 */
export async function deleteDisciplinaryAttachmentAction(input: {
	id: string;
	attachmentId: string;
}): Promise<DisciplinaryMutationResult<Record<string, unknown>>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api['disciplinary-measures'][input.id].attachments[
			input.attachmentId
		].delete();

		if (response.error) {
			return {
				success: false,
				errorCode: resolveDisciplinaryErrorCode(response.status, response.error),
				error: 'No se pudo eliminar el adjunto',
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: (payload?.data ?? null) as Record<string, unknown> };
	} catch (error) {
		console.error('Failed to delete disciplinary attachment:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
			error: 'No se pudo eliminar el adjunto',
		};
	}
}

/**
 * Closes a disciplinary measure.
 *
 * @param input - Close payload
 * @returns Mutation result with closed measure
 */
export async function closeDisciplinaryMeasureAction(
	input: CloseDisciplinaryMeasureInput,
): Promise<DisciplinaryMutationResult<Record<string, unknown>>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api['disciplinary-measures'][input.id].close.post({
			signatureStatus: input.signatureStatus,
			notes: input.notes,
		});

		if (response.error) {
			return {
				success: false,
				errorCode: resolveDisciplinaryErrorCode(response.status, response.error),
				error: 'No se pudo cerrar la medida disciplinaria',
			};
		}

		const payload = getApiResponseData(response);
		return { success: true, data: (payload?.data ?? null) as Record<string, unknown> };
	} catch (error) {
		console.error('Failed to close disciplinary measure:', error);
		return {
			success: false,
			errorCode: 'UNKNOWN',
			error: 'No se pudo cerrar la medida disciplinaria',
		};
	}
}
