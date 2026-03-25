import type { CheckOutReason, RecognitionResult } from '@sen-checkin/types';

import { submitAttendanceWithOfflineSupport } from './offline-attendance';
import type { AttendanceType } from './query-keys';
import { API_BASE_URL } from './api';
import { authedFetch } from './auth-client';

/**
 * Request payload for the face verification API call.
 */
export interface VerifyFaceInput {
	/** Base64 image payload sent to the API. */
	imageBase64: string;
	/** Approximate payload size in bytes. */
	payloadBytes: number;
	/** Client platform used for diagnostics. */
	platform: 'android' | 'ios';
	/** Current network type reported by the device, when known. */
	networkType: string | null;
}

/**
 * Error thrown when the face verification request fails.
 */
export class FaceVerificationError extends Error {
	/** HTTP status returned by the API. */
	public readonly status: number;

	/** Stable API error code when provided. */
	public readonly errorCode: string | null;

	/** Whether the client should encourage retrying the attempt. */
	public readonly retryable: boolean;

	/** Request identifier returned by the API, when present. */
	public readonly requestId: string | null;

	/**
	 * Creates a new FaceVerificationError instance.
	 *
	 * @param message - Human-readable error message
	 * @param status - HTTP status returned by the API
	 * @param errorCode - Stable API error code when available
	 * @param requestId - Request identifier from the API response
	 */
	constructor(message: string, status: number, errorCode: string | null, requestId: string | null) {
		super(message);
		this.name = 'FaceVerificationError';
		this.status = status;
		this.errorCode = errorCode;
		this.retryable = status === 503 || status === 504;
		this.requestId = requestId;
	}
}

/**
 * Verifies a captured face against the API.
 *
 * @param input - Verification request payload and diagnostics context
 * @returns Recognition API response payload
 * @throws FaceVerificationError when the API returns a non-success status
 */
export async function verifyFace(input: VerifyFaceInput): Promise<RecognitionResult> {
	const response = (await authedFetch(`${API_BASE_URL}/recognition/identify`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-client-platform': input.platform,
			'x-client-network-type': input.networkType ?? 'unknown',
		},
		body: JSON.stringify({ image: input.imageBase64 }),
		credentials: 'include',
	})) as Response;

	if (!response.ok) {
		const errorPayload = (await response.json().catch(() => null)) as
			| {
					errorCode?: string;
					message?: string;
			  }
			| null;
		throw new FaceVerificationError(
			errorPayload?.message ?? 'Face verification failed',
			response.status,
			errorPayload?.errorCode ?? null,
			response.headers.get('x-request-id'),
		);
	}

	return (await response.json()) as RecognitionResult;
}

export async function recordAttendance(
	employeeId: string,
	deviceId: string,
	type: AttendanceType,
	metadata?: Record<string, unknown>,
	checkOutReason?: CheckOutReason,
) {
	return submitAttendanceWithOfflineSupport({
		employeeId,
		deviceId,
		type,
		metadata,
		checkOutReason,
	});
}
