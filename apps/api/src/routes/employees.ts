import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';

import db from '../db/index.js';
import { employee } from '../db/schema.js';
import {
	imageBodySchema,
	employeeIdParamsSchema,
	type FaceEnrollmentResult,
	type UserCreationResult,
} from '../schemas/recognition.js';
import {
	createUser,
	deleteUser,
	indexFace,
	associateFaces,
	disassociateFaces,
	listFacesByExternalId,
	deleteFaces,
} from '../services/rekognition.js';

/**
 * Employee routes for face recognition enrollment and management.
 * These routes handle the enrollment flow for Amazon Rekognition User Vectors.
 *
 * @module routes/employees
 */

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
 * Employee routes plugin for Elysia.
 * Provides endpoints for Rekognition user creation, face enrollment, and cleanup.
 */
export const employeeRoutes = new Elysia({ prefix: '/employees' })
	/**
	 * Creates a Rekognition user for an employee.
	 * This must be called before enrolling faces for the employee.
	 *
	 * @route POST /employees/:id/create-rekognition-user
	 * @param id - Employee UUID from path parameters
	 * @returns UserCreationResult with success status and user ID
	 *
	 * @example
	 * ```
	 * POST /employees/123e4567-e89b-12d3-a456-426614174000/create-rekognition-user
	 * ```
	 */
	.post(
		'/:id/create-rekognition-user',
		async ({ params, set }): Promise<UserCreationResult> => {
			const { id: employeeId } = params;

			// Verify employee exists in database
			const existingEmployee = await db.select().from(employee).where(eq(employee.id, employeeId)).limit(1);

			if (existingEmployee.length === 0) {
				set.status = 404;
				return {
					success: false,
					userId: null,
					employeeId,
					message: 'Employee not found',
				};
			}

			// Check if employee already has a Rekognition user
			const employeeRecord = existingEmployee[0];
			if (employeeRecord?.rekognitionUserId) {
				set.status = 409;
				return {
					success: false,
					userId: employeeRecord.rekognitionUserId,
					employeeId,
					message: 'Employee already has a Rekognition user',
				};
			}

			// Create user in Rekognition
			const result = await createUser(employeeId);

			if (!result.success) {
				set.status = 500;
				return {
					success: false,
					userId: null,
					employeeId,
					message: result.message ?? 'Failed to create Rekognition user',
				};
			}

			// Update employee record with Rekognition user ID
			await db.update(employee).set({ rekognitionUserId: employeeId }).where(eq(employee.id, employeeId));

			return {
				success: true,
				userId: result.userId,
				employeeId,
				message: 'Rekognition user created successfully',
			};
		},
		{
			params: employeeIdParamsSchema,
		},
	)

	/**
	 * Enrolls a face for an employee by indexing and associating it with their Rekognition user.
	 * The employee must have a Rekognition user created first.
	 *
	 * @route POST /employees/:id/enroll-face
	 * @param id - Employee UUID from path parameters
	 * @param body.image - Base64-encoded image (without data URL prefix)
	 * @returns FaceEnrollmentResult with face ID and association status
	 *
	 * @example
	 * ```
	 * POST /employees/123e4567-e89b-12d3-a456-426614174000/enroll-face
	 * Content-Type: application/json
	 *
	 * { "image": "iVBORw0KGgo..." }
	 * ```
	 */
	.post(
		'/:id/enroll-face',
		async ({ params, body, set }): Promise<FaceEnrollmentResult> => {
			const { id: employeeId } = params;
			const { image } = body;

			// Verify employee exists and has a Rekognition user
			const existingEmployee = await db.select().from(employee).where(eq(employee.id, employeeId)).limit(1);

			if (existingEmployee.length === 0) {
				set.status = 404;
				return {
					success: false,
					faceId: null,
					employeeId,
					associated: false,
					message: 'Employee not found',
				};
			}

			const enrollEmployee = existingEmployee[0];
			if (!enrollEmployee?.rekognitionUserId) {
				set.status = 400;
				return {
					success: false,
					faceId: null,
					employeeId,
					associated: false,
					message: 'Employee does not have a Rekognition user. Create one first.',
				};
			}

			// Decode base64 image to bytes
			let imageBytes: Uint8Array;
			try {
				imageBytes = decodeBase64Image(image);
			} catch (error) {
				set.status = 400;
				return {
					success: false,
					faceId: null,
					employeeId,
					associated: false,
					message: 'Invalid base64 image data',
				};
			}

			// Index the face in Rekognition
			const indexResult = await indexFace(imageBytes, employeeId);

			const indexedFace = indexResult.faces[0];
			if (!indexResult.success || !indexedFace) {
				set.status = 400;
				return {
					success: false,
					faceId: null,
					employeeId,
					associated: false,
					message: indexResult.message ?? 'Failed to index face',
				};
			}

			const faceId = indexedFace.faceId;

			// Associate the face with the user
			const associateResult = await associateFaces(enrollEmployee.rekognitionUserId, [faceId]);

			return {
				success: true,
				faceId,
				employeeId,
				associated: associateResult.success,
				message: associateResult.success
					? 'Face enrolled and associated successfully'
					: `Face indexed but association failed: ${associateResult.message}`,
			};
		},
		{
			params: employeeIdParamsSchema,
			body: imageBodySchema,
		},
	)

	/**
	 * Deletes a Rekognition user and all associated faces for an employee.
	 * This cleans up all face recognition data for the employee.
	 *
	 * @route DELETE /employees/:id/rekognition-user
	 * @param id - Employee UUID from path parameters
	 * @returns Object with success status and message
	 *
	 * @example
	 * ```
	 * DELETE /employees/123e4567-e89b-12d3-a456-426614174000/rekognition-user
	 * ```
	 */
	.delete(
		'/:id/rekognition-user',
		async ({ params, set }): Promise<{ success: boolean; message: string }> => {
			const { id: employeeId } = params;

			// Verify employee exists
			const existingEmployee = await db.select().from(employee).where(eq(employee.id, employeeId)).limit(1);

			const deleteEmployee = existingEmployee[0];
			if (!deleteEmployee) {
				set.status = 404;
				return {
					success: false,
					message: 'Employee not found',
				};
			}

			const rekognitionUserId = deleteEmployee.rekognitionUserId;

			if (!rekognitionUserId) {
				set.status = 400;
				return {
					success: false,
					message: 'Employee does not have a Rekognition user',
				};
			}

			// List all faces for this employee to disassociate and delete them
			const facesResult = await listFacesByExternalId(employeeId);

			if (facesResult.success && facesResult.faceIds.length > 0) {
				// Disassociate faces from user
				await disassociateFaces(rekognitionUserId, facesResult.faceIds);

				// Delete the faces from the collection
				await deleteFaces(facesResult.faceIds);
			}

			// Delete the user from Rekognition
			const deleteResult = await deleteUser(rekognitionUserId);

			if (!deleteResult.success) {
				set.status = 500;
				return {
					success: false,
					message: deleteResult.message ?? 'Failed to delete Rekognition user',
				};
			}

			// Clear the Rekognition user ID from the employee record
			await db.update(employee).set({ rekognitionUserId: null }).where(eq(employee.id, employeeId));

			return {
				success: true,
				message: 'Rekognition user and associated faces deleted successfully',
			};
		},
		{
			params: employeeIdParamsSchema,
		},
	);

