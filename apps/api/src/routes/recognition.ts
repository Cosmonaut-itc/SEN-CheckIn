import { Buffer } from 'node:buffer';
import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';

import db from '../db/index.js';
import { employee } from '../db/schema.js';
import { logger } from '../logger/index.js';
import { imageBodySchema, type RecognitionResult } from '../schemas/recognition.js';
import { recognitionAuthPlugin } from '../plugins/auth.js';
import { RecognitionBadRequestError, parseRecognitionRequestBody } from './recognition-body.js';
import {
	RekognitionServiceError,
	searchUsersByImage,
	type SearchUsersByImageResult,
} from '../services/rekognition.js';

/**
 * Recognition routes for face identification.
 * These routes handle the face matching flow using Amazon Rekognition User Vectors.
 *
 * @module routes/recognition
 */

/**
 * Default similarity threshold for face matching.
 * Faces with similarity below this threshold (80%) are not considered matches.
 */
const DEFAULT_SIMILARITY_THRESHOLD = 80;
const BASE64_IMAGE_PREFIX_PATTERN = /^data:image\/\w+;base64,/;
const BASE64_PAYLOAD_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

interface RecognitionStageTimings {
	auth: number;
	parse: number;
	decode: number;
	rekognition: number;
	db: number;
	serialize: number;
	total: number;
}

interface RecognitionRequestDiagnostics {
	requestId: string;
	platform: string | null;
	networkType: string | null;
	imageChars: number;
	payloadBytes: number | null;
	decodedBytes: number;
	rekognitionAttempts: number;
	status: number;
	errorCode: string | null;
	timings: RecognitionStageTimings;
}

/**
 * Error type for recognition results that are ambiguous due to data inconsistencies.
 */
class RecognitionConflictError extends Error {
	/** Stable client-facing error code. */
	public readonly errorCode: 'RECOGNITION_EMPLOYEE_LOOKUP_CONFLICT';

	/** Client-facing message. */
	public readonly clientMessage: string;

	/**
	 * Creates a new RecognitionConflictError instance.
	 *
	 * @param message - Internal error message for logs
	 * @param clientMessage - Human-readable client-facing message
	 */
	constructor(message: string, clientMessage: string) {
		super(message);
		this.name = 'RecognitionConflictError';
		this.errorCode = 'RECOGNITION_EMPLOYEE_LOOKUP_CONFLICT';
		this.clientMessage = clientMessage;
	}
}

/**
 * Measures an async operation and returns both duration and result.
 *
 * @param operation - Function to execute
 * @returns Promise resolving to the operation result and elapsed time in milliseconds
 * @throws Re-throws any error from the wrapped operation
 */
async function measureAsync<T>(
	operation: () => Promise<T>,
): Promise<{ durationMs: number; result: T }> {
	const startedAt = performance.now();
	const result = await operation();

	return {
		durationMs: performance.now() - startedAt,
		result,
	};
}

/**
 * Measures a synchronous operation and returns both duration and result.
 *
 * @param operation - Function to execute
 * @returns Operation result and elapsed time in milliseconds
 * @throws Re-throws any error from the wrapped operation
 */
function measureSync<T>(operation: () => T): { durationMs: number; result: T } {
	const startedAt = performance.now();
	const result = operation();

	return {
		durationMs: performance.now() - startedAt,
		result,
	};
}

/**
 * Decodes a base64 string to a Uint8Array for Rekognition API calls.
 *
 * @param base64String - The base64-encoded image string (without data URL prefix)
 * @returns Uint8Array containing the decoded image bytes
 * @throws Error when the payload is not valid base64 image data
 */
function decodeBase64Image(base64String: string): Uint8Array {
	const cleanBase64 = base64String.replace(BASE64_IMAGE_PREFIX_PATTERN, '');

	if (!BASE64_PAYLOAD_PATTERN.test(cleanBase64)) {
		throw new RecognitionBadRequestError(
			'Invalid base64 payload',
			'INVALID_IMAGE_BASE64',
			'Invalid base64 image data',
		);
	}

	const bytes = Buffer.from(cleanBase64, 'base64');

	if (bytes.length === 0) {
		throw new RecognitionBadRequestError(
			'Decoded image payload is empty',
			'INVALID_IMAGE_BASE64',
			'Invalid base64 image data',
		);
	}

	return bytes;
}

/**
 * Applies diagnostic headers to the current response.
 *
 * @param set - Elysia response setter
 * @param diagnostics - Structured request diagnostics
 * @returns Nothing
 */
function applyRecognitionHeaders(
	set: {
		headers: Record<string, string | number>;
		status?: number | string;
	},
	diagnostics: RecognitionRequestDiagnostics,
): void {
	set.headers['x-request-id'] = diagnostics.requestId;
	set.headers['server-timing'] = [
		`auth;dur=${diagnostics.timings.auth.toFixed(2)}`,
		`parse;dur=${diagnostics.timings.parse.toFixed(2)}`,
		`decode;dur=${diagnostics.timings.decode.toFixed(2)}`,
		`rekognition;dur=${diagnostics.timings.rekognition.toFixed(2)}`,
		`db;dur=${diagnostics.timings.db.toFixed(2)}`,
		`serialize;dur=${diagnostics.timings.serialize.toFixed(2)}`,
		`total;dur=${diagnostics.timings.total.toFixed(2)}`,
	].join(', ');
}

/**
 * Logs a structured recognition diagnostics event.
 *
 * @param diagnostics - Request-level diagnostics captured for the route
 * @returns Nothing
 */
function logRecognitionDiagnostics(diagnostics: RecognitionRequestDiagnostics): void {
	const logPayload = {
		requestId: diagnostics.requestId,
		platform: diagnostics.platform,
		networkType: diagnostics.networkType,
		imageChars: diagnostics.imageChars,
		payloadBytes: diagnostics.payloadBytes,
		decodedBytes: diagnostics.decodedBytes,
		authMs: diagnostics.timings.auth,
		parseMs: diagnostics.timings.parse,
		decodeMs: diagnostics.timings.decode,
		rekognitionMs: diagnostics.timings.rekognition,
		dbMs: diagnostics.timings.db,
		serializeMs: diagnostics.timings.serialize,
		totalMs: diagnostics.timings.total,
		rekognitionAttempts: diagnostics.rekognitionAttempts,
		status: diagnostics.status,
		errorCode: diagnostics.errorCode,
	};

	if (diagnostics.status >= 500) {
		logger.warn('Recognition identify diagnostics', logPayload);
		return;
	}

	logger.info('Recognition identify diagnostics', logPayload);
}

/**
 * Builds the success response payload for a matched or unmatched recognition search.
 *
 * @param searchResult - Rekognition search result
 * @param matchedEmployeeRecord - Employee record matched in the database, if present
 * @returns Recognition response payload
 */
function buildRecognitionResponse(
	searchResult: SearchUsersByImageResult,
	matchedEmployeeRecord:
		| {
				id: string;
				firstName: string;
				lastName: string;
				code: string;
		  }
		| undefined,
): RecognitionResult {
	if (!searchResult.matched || !searchResult.userId) {
		return {
			matched: false,
			match: null,
			employee: null,
			searchedFaceConfidence: searchResult.searchedFaceConfidence,
		};
	}

	if (!matchedEmployeeRecord) {
		return {
			matched: true,
			match: {
				userId: searchResult.userId,
				similarity: searchResult.similarity ?? 0,
			},
			employee: null,
			searchedFaceConfidence: searchResult.searchedFaceConfidence,
		};
	}

	return {
		matched: true,
		match: {
			userId: searchResult.userId,
			similarity: searchResult.similarity ?? 0,
		},
		employee: {
			id: matchedEmployeeRecord.id,
			firstName: matchedEmployeeRecord.firstName,
			lastName: matchedEmployeeRecord.lastName,
			code: matchedEmployeeRecord.code,
		},
		searchedFaceConfidence: searchResult.searchedFaceConfidence,
	};
}

/**
 * Recognition routes plugin for Elysia.
 * Provides endpoints for face identification against stored user vectors.
 */
export const recognitionRoutes = new Elysia({ prefix: '/recognition' })
	.use(recognitionAuthPlugin)
	/**
	 * Identifies an employee by matching their face against enrolled user vectors.
	 * Uses Amazon Rekognition SearchUsersByImage for high-accuracy matching.
	 *
	 * @route POST /recognition/identify
	 * @param body.image - Base64-encoded image (without data URL prefix)
	 * @returns RecognitionResult with match status, employee info, and similarity score
	 *
	 * @example
	 * ```
	 * POST /recognition/identify
	 * Content-Type: application/json
	 *
	 * { "image": "iVBORw0KGgo..." }
	 *
	 * Response (matched):
	 * {
	 *   "matched": true,
	 *   "match": { "userId": "emp-123-uuid", "similarity": 98.5 },
	 *   "employee": {
	 *     "id": "emp-123-uuid",
	 *     "firstName": "John",
	 *     "lastName": "Doe",
	 *     "code": "EMP001"
	 *   },
	 *   "searchedFaceConfidence": 99.9
	 * }
	 *
	 * Response (no match):
	 * {
	 *   "matched": false,
	 *   "match": null,
	 *   "employee": null,
	 *   "searchedFaceConfidence": 95.2
	 * }
	 * ```
	 */
	.post(
		'/identify',
		async ({
			body,
			request,
			set,
			authTimingMs = 0,
			requestId = crypto.randomUUID(),
		}): Promise<RecognitionResult> => {
			const requestStartedAt = performance.now();
			const diagnostics: RecognitionRequestDiagnostics = {
				requestId,
				platform: request.headers.get('x-client-platform'),
				networkType: request.headers.get('x-client-network-type'),
				imageChars: 0,
				payloadBytes: request.headers.has('content-length')
					? Number(request.headers.get('content-length'))
					: null,
				decodedBytes: 0,
				rekognitionAttempts: 0,
				status: 200,
				errorCode: null,
				timings: {
					auth: authTimingMs,
					parse: 0,
					decode: 0,
					rekognition: 0,
					db: 0,
					serialize: 0,
					total: 0,
				},
			};
			let responsePayload: RecognitionResult | undefined;
			let rekognitionStartedAt: number | null = null;
			let unexpectedError: unknown;
			let shouldRethrowUnexpectedError = false;

			try {
				const parseMeasurement = measureSync(() => parseRecognitionRequestBody(body));
				diagnostics.timings.parse = parseMeasurement.durationMs;
				diagnostics.imageChars = parseMeasurement.result.image.length;
				diagnostics.payloadBytes ??= parseMeasurement.result.payloadBytes;

				logger.debug('Recognition identify request received', {
					requestId,
					imageLength: diagnostics.imageChars,
					hasImage: diagnostics.imageChars > 0,
				});

				const decodeMeasurement = measureSync(() =>
					decodeBase64Image(parseMeasurement.result.image),
				);
				const imageBytes = decodeMeasurement.result;
				diagnostics.timings.decode = decodeMeasurement.durationMs;
				diagnostics.decodedBytes = imageBytes.length;

				logger.debug('Image decoded successfully', {
					requestId,
					bytesLength: imageBytes.length,
				});

				logger.debug('Searching for face in Rekognition', {
					requestId,
					threshold: DEFAULT_SIMILARITY_THRESHOLD,
				});

				rekognitionStartedAt = performance.now();
				const searchResult = await searchUsersByImage(
					imageBytes,
					DEFAULT_SIMILARITY_THRESHOLD,
				);
				diagnostics.timings.rekognition = performance.now() - rekognitionStartedAt;
				diagnostics.rekognitionAttempts = searchResult.attempts ?? 0;

				logger.debug('Rekognition search completed', {
					requestId,
					matched: searchResult.matched,
					userId: searchResult.userId ?? null,
					similarity: searchResult.similarity ?? null,
					searchedFaceConfidence: searchResult.searchedFaceConfidence ?? null,
					attempts: searchResult.attempts ?? null,
				});

				let matchedEmployeeRecord:
					| {
							id: string;
							firstName: string;
							lastName: string;
							code: string;
					  }
					| undefined;

				const matchedUserId = searchResult.userId;

				if (!searchResult.matched || !matchedUserId) {
					logger.info('No face match found in Rekognition', {
						requestId,
						searchedFaceConfidence: searchResult.searchedFaceConfidence ?? null,
					});
				} else {
					logger.debug('Looking up employee by Rekognition user ID', {
						requestId,
						rekognitionUserId: searchResult.userId,
					});

					const dbMeasurement = await measureAsync(async () => {
						return db
							.select({
								id: employee.id,
								firstName: employee.firstName,
								lastName: employee.lastName,
								code: employee.code,
							})
							.from(employee)
							.where(eq(employee.rekognitionUserId, matchedUserId))
							.limit(2);
					});
					diagnostics.timings.db = dbMeasurement.durationMs;
					if (dbMeasurement.result.length > 1) {
						throw new RecognitionConflictError(
							'Recognition result matched multiple employees',
							'Face recognition result is not uniquely mapped',
						);
					}
					[matchedEmployeeRecord] = dbMeasurement.result;

					if (!matchedEmployeeRecord) {
						logger.warn('Rekognition matched but employee not found in database', {
							requestId,
							rekognitionUserId: matchedUserId,
							similarity: searchResult.similarity ?? 0,
						});
					} else {
						logger.info('Face recognition successful', {
							requestId,
							employeeId: matchedEmployeeRecord.id,
							employeeCode: matchedEmployeeRecord.code,
							employeeName: `${matchedEmployeeRecord.firstName} ${matchedEmployeeRecord.lastName}`,
							similarity: searchResult.similarity ?? 0,
							searchedFaceConfidence: searchResult.searchedFaceConfidence ?? null,
						});
					}
				}

				responsePayload = buildRecognitionResponse(searchResult, matchedEmployeeRecord);
				const serializeMeasurement = measureSync(() => JSON.stringify(responsePayload));
				diagnostics.timings.serialize = serializeMeasurement.durationMs;
			} catch (error) {
				if (diagnostics.timings.rekognition === 0 && rekognitionStartedAt !== null) {
					diagnostics.timings.rekognition = performance.now() - rekognitionStartedAt;
				}

				if (error instanceof RekognitionServiceError) {
					logger.error('Recognition identify upstream failure', error, {
						requestId,
						errorCode: error.errorCode,
						status: error.httpStatus,
					});

					diagnostics.status = error.httpStatus;
					diagnostics.errorCode = error.errorCode;
					set.status = error.httpStatus;

					responsePayload = {
						matched: false,
						match: null,
						employee: null,
						searchedFaceConfidence: null,
						message: 'Face recognition service unavailable',
						errorCode: error.errorCode,
					};
					const serializeMeasurement = measureSync(() => JSON.stringify(responsePayload));
					diagnostics.timings.serialize = serializeMeasurement.durationMs;
				} else if (error instanceof RecognitionBadRequestError) {
					logger.error('Recognition identify bad request', error, {
						requestId,
						errorCode: error.errorCode,
					});

					diagnostics.status = 400;
					diagnostics.errorCode = error.errorCode;
					set.status = 400;

					responsePayload = {
						matched: false,
						match: null,
						employee: null,
						searchedFaceConfidence: null,
						message: error.clientMessage,
						errorCode: error.errorCode,
					};
					const serializeMeasurement = measureSync(() => JSON.stringify(responsePayload));
					diagnostics.timings.serialize = serializeMeasurement.durationMs;
				} else if (error instanceof RecognitionConflictError) {
					logger.error('Recognition identify employee lookup conflict', error, {
						requestId,
						errorCode: error.errorCode,
					});

					diagnostics.status = 409;
					diagnostics.errorCode = error.errorCode;
					set.status = 409;

					responsePayload = {
						matched: false,
						match: null,
						employee: null,
						searchedFaceConfidence: null,
						message: error.clientMessage,
						errorCode: error.errorCode,
					};
					const serializeMeasurement = measureSync(() => JSON.stringify(responsePayload));
					diagnostics.timings.serialize = serializeMeasurement.durationMs;
				} else {
					diagnostics.status = 500;
					diagnostics.errorCode = 'INTERNAL_ERROR';
					set.status = 500;
					unexpectedError = error;
					shouldRethrowUnexpectedError = true;
				}
			} finally {
				diagnostics.status =
					typeof set.status === 'number' ? set.status : diagnostics.status ?? 200;
				diagnostics.timings.total = authTimingMs + (performance.now() - requestStartedAt);
				applyRecognitionHeaders(set, diagnostics);
				logRecognitionDiagnostics(diagnostics);
			}

			if (shouldRethrowUnexpectedError) {
				throw unexpectedError;
			}

			if (responsePayload === undefined) {
				throw new Error('Recognition response payload was not created.');
			}

			return responsePayload;
		},
		{
			body: imageBodySchema,
		},
	);
