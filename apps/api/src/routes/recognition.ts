import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';

import db from '../db/index.js';
import { employee } from '../db/schema.js';
import { logger } from '../logger/index.js';
import { imageBodySchema, type RecognitionResult } from '../schemas/recognition.js';
import { searchUsersByImage } from '../services/rekognition.js';

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

/**
 * Decodes a base64 string to a Uint8Array for Rekognition API calls.
 *
 * @param base64String - The base64-encoded image string (without data URL prefix)
 * @returns Uint8Array containing the decoded image bytes
 */
function decodeBase64Image(base64String: string): Uint8Array {
	// Remove data URL prefix if present
	const cleanBase64 = base64String.replace(/^data:image\/\w+;base64,/, '');
	const binaryString = atob(cleanBase64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes;
}

/**
 * Recognition routes plugin for Elysia.
 * Provides endpoints for face identification against stored user vectors.
 */
export const recognitionRoutes = new Elysia({ prefix: '/recognition' })
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
		async ({ body, set }): Promise<RecognitionResult> => {
			const { image } = body;

			logger.debug('Recognition identify request received', {
				imageLength: image?.length ?? 0,
				hasImage: !!image,
			});

			// Decode base64 image to bytes
			let imageBytes: Uint8Array;
			try {
				imageBytes = decodeBase64Image(image);
				logger.debug('Image decoded successfully', {
					bytesLength: imageBytes.length,
				});
			} catch (error) {
				logger.error('Failed to decode base64 image', error);
				set.status = 400;
				return {
					matched: false,
					match: null,
					employee: null,
					searchedFaceConfidence: null,
				};
			}

			// Search for matching user in Rekognition
			logger.debug('Searching for face in Rekognition', {
				threshold: DEFAULT_SIMILARITY_THRESHOLD,
			});

			const searchResult = await searchUsersByImage(imageBytes, DEFAULT_SIMILARITY_THRESHOLD);

			logger.debug('Rekognition search completed', {
				matched: searchResult.matched,
				userId: searchResult.userId ?? null,
				similarity: searchResult.similarity ?? null,
				searchedFaceConfidence: searchResult.searchedFaceConfidence ?? null,
			});

			// If no match found, return early
			if (!searchResult.matched || !searchResult.userId) {
				logger.info('No face match found in Rekognition', {
					searchedFaceConfidence: searchResult.searchedFaceConfidence ?? null,
				});
				return {
					matched: false,
					match: null,
					employee: null,
					searchedFaceConfidence: searchResult.searchedFaceConfidence,
				};
			}

			// Look up the matched employee in the database using Rekognition user ID
			logger.debug('Looking up employee by Rekognition user ID', {
				rekognitionUserId: searchResult.userId,
			});

			const matchedEmployeeResults = await db
				.select({
					id: employee.id,
					firstName: employee.firstName,
					lastName: employee.lastName,
					code: employee.code,
				})
				.from(employee)
				.where(eq(employee.rekognitionUserId, searchResult.userId))
				.limit(1);

			const matchedEmployeeRecord = matchedEmployeeResults[0];

			// If employee not found in DB (data inconsistency), still return the match info
			if (!matchedEmployeeRecord) {
				logger.warn('Rekognition matched but employee not found in database', {
					rekognitionUserId: searchResult.userId,
					similarity: searchResult.similarity ?? 0,
				});
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

			logger.info('Face recognition successful', {
				employeeId: matchedEmployeeRecord.id,
				employeeCode: matchedEmployeeRecord.code,
				employeeName: `${matchedEmployeeRecord.firstName} ${matchedEmployeeRecord.lastName}`,
				similarity: searchResult.similarity ?? 0,
				searchedFaceConfidence: searchResult.searchedFaceConfidence ?? null,
			});

			// Return full match result with employee details
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
		},
		{
			body: imageBodySchema,
		},
	);

