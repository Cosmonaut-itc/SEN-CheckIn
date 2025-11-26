import { and, eq, ilike, or } from 'drizzle-orm';
import { Elysia } from 'elysia';

import db from '../db/index.js';
import { employee, jobPosition, location } from '../db/schema.js';
import {
	createEmployeeSchema,
	employeeQuerySchema,
	idParamSchema,
	updateEmployeeSchema,
} from '../schemas/crud.js';
import {
	employeeIdParamsSchema,
	imageBodySchema,
	type FaceEnrollmentResult,
	type UserCreationResult,
} from '../schemas/recognition.js';
import {
	associateFaces,
	createUser,
	deleteFaces,
	deleteUser,
	disassociateFaces,
	indexFace,
	listFacesByExternalId,
} from '../services/rekognition.js';

/**
 * Employee routes for CRUD operations and face recognition enrollment.
 * Provides full CRUD operations plus Rekognition User Vectors enrollment flow.
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
 * Provides CRUD operations and Rekognition face enrollment endpoints.
 */
export const employeeRoutes = new Elysia({ prefix: '/employees' })
	// =========================================================================
	// CRUD Operations
	// =========================================================================

	/**
	 * List all employees with pagination and optional filters.
	 *
	 * @route GET /employees
	 * @param query.limit - Maximum number of results (default: 50)
	 * @param query.offset - Number of results to skip (default: 0)
	 * @param query.locationId - Filter by location ID (optional)
	 * @param query.jobPositionId - Filter by job position ID (optional)
	 * @param query.status - Filter by employee status (optional)
	 * @param query.search - Search by name or code (optional)
	 * @returns Array of employee records with pagination info
	 */
	.get(
		'/',
		async ({ query }) => {
			const { limit, offset, locationId, jobPositionId, status, search } = query;

			let baseQuery = db.select().from(employee);

			// Build conditions array
			const conditions = [];
			if (locationId) {
				conditions.push(eq(employee.locationId, locationId));
			}
			if (jobPositionId) {
				conditions.push(eq(employee.jobPositionId, jobPositionId));
			}
			if (status) {
				conditions.push(eq(employee.status, status));
			}
			if (search) {
				conditions.push(
					or(
						ilike(employee.firstName, `%${search}%`),
						ilike(employee.lastName, `%${search}%`),
						ilike(employee.code, `%${search}%`),
					),
				);
			}

			if (conditions.length > 0) {
				baseQuery = baseQuery.where(and(...conditions)) as typeof baseQuery;
			}

			const results = await baseQuery
				.limit(limit)
				.offset(offset)
				.orderBy(employee.lastName, employee.firstName);

			// Get total count with same filters
			let countQuery = db.select().from(employee);
			if (conditions.length > 0) {
				countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
			}
			const countResult = await countQuery;
			const total = countResult.length;

			return {
				data: results,
				pagination: {
					total,
					limit,
					offset,
					hasMore: offset + results.length < total,
				},
			};
		},
		{
			query: employeeQuerySchema,
		},
	)

	/**
	 * Get a single employee by ID.
	 *
	 * @route GET /employees/:id
	 * @param id - Employee UUID
	 * @returns Employee record or 404 error
	 */
	.get(
		'/:id',
		async ({ params, set }) => {
			const { id } = params;

			const results = await db.select().from(employee).where(eq(employee.id, id)).limit(1);

			const record = results[0];
			if (!record) {
				set.status = 404;
				return { error: 'Employee not found' };
			}

			return { data: record };
		},
		{
			params: idParamSchema,
		},
	)

	/**
	 * Create a new employee.
	 *
	 * @route POST /employees
	 * @param body - Employee data
	 * @returns Created employee record
	 */
	.post(
		'/',
		async ({ body, set }) => {
			const {
				code,
				firstName,
				lastName,
				email,
				phone,
				jobPositionId,
				department,
				status: empStatus,
				hireDate,
				locationId,
			} = body;

			// Verify location exists if provided
			if (locationId) {
				const locationExists = await db
					.select()
					.from(location)
					.where(eq(location.id, locationId))
					.limit(1);
				if (!locationExists[0]) {
					set.status = 400;
					return { error: 'Location not found' };
				}
			}

			// Verify job position exists if provided
			if (jobPositionId) {
				const positionExists = await db
					.select()
					.from(jobPosition)
					.where(eq(jobPosition.id, jobPositionId))
					.limit(1);
				if (!positionExists[0]) {
					set.status = 400;
					return { error: 'Job position not found' };
				}
			}

			// Check if code is unique
			const codeExists = await db
				.select()
				.from(employee)
				.where(eq(employee.code, code))
				.limit(1);
			if (codeExists[0]) {
				set.status = 409;
				return { error: 'Employee code already exists' };
			}

			const id = crypto.randomUUID();

			const newEmployee = {
				id,
				code,
				firstName,
				lastName,
				email: email ?? null,
				phone: phone ?? null,
				jobPositionId: jobPositionId ?? null,
				department: department ?? null,
				status: empStatus,
				hireDate: hireDate ?? null,
				locationId: locationId ?? null,
			};

			await db.insert(employee).values(newEmployee);

			set.status = 201;
			return {
				data: {
					...newEmployee,
					rekognitionUserId: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			};
		},
		{
			body: createEmployeeSchema,
		},
	)

	/**
	 * Update an existing employee.
	 *
	 * @route PUT /employees/:id
	 * @param id - Employee UUID
	 * @param body - Fields to update
	 * @returns Updated employee record
	 */
	.put(
		'/:id',
		async ({ params, body, set }) => {
			const { id } = params;

			// Check if employee exists
			const existing = await db.select().from(employee).where(eq(employee.id, id)).limit(1);
			if (!existing[0]) {
				set.status = 404;
				return { error: 'Employee not found' };
			}

			// Check if code is unique (if being updated)
			if (body.code && body.code !== existing[0].code) {
				const codeExists = await db
					.select()
					.from(employee)
					.where(eq(employee.code, body.code))
					.limit(1);
				if (codeExists[0]) {
					set.status = 409;
					return { error: 'Employee code already exists' };
				}
			}

			// Verify location exists if being updated
			if (body.locationId) {
				const locationExists = await db
					.select()
					.from(location)
					.where(eq(location.id, body.locationId))
					.limit(1);
				if (!locationExists[0]) {
					set.status = 400;
					return { error: 'Location not found' };
				}
			}

			// Verify job position exists if being updated
			if (body.jobPositionId) {
				const positionExists = await db
					.select()
					.from(jobPosition)
					.where(eq(jobPosition.id, body.jobPositionId))
					.limit(1);
				if (!positionExists[0]) {
					set.status = 400;
					return { error: 'Job position not found' };
				}
			}

			// Only update if there are fields to update
			if (Object.keys(body).length === 0) {
				return { data: existing[0] };
			}

			await db.update(employee).set(body).where(eq(employee.id, id));

			// Fetch updated record
			const updated = await db.select().from(employee).where(eq(employee.id, id)).limit(1);

			return { data: updated[0] };
		},
		{
			params: idParamSchema,
			body: updateEmployeeSchema,
		},
	)

	/**
	 * Delete an employee.
	 *
	 * @route DELETE /employees/:id
	 * @param id - Employee UUID
	 * @returns Success message
	 */
	.delete(
		'/:id',
		async ({ params, set }) => {
			const { id } = params;

			// Check if employee exists
			const existing = await db.select().from(employee).where(eq(employee.id, id)).limit(1);
			if (!existing[0]) {
				set.status = 404;
				return { error: 'Employee not found' };
			}

			// If employee has Rekognition user, clean up first
			if (existing[0].rekognitionUserId) {
				const facesResult = await listFacesByExternalId(id);
				if (facesResult.success && facesResult.faceIds.length > 0) {
					await disassociateFaces(existing[0].rekognitionUserId, facesResult.faceIds);
					await deleteFaces(facesResult.faceIds);
				}
				await deleteUser(existing[0].rekognitionUserId);
			}

			await db.delete(employee).where(eq(employee.id, id));

			return { message: 'Employee deleted successfully' };
		},
		{
			params: idParamSchema,
		},
	)

	// =========================================================================
	// Rekognition Face Enrollment Operations
	// =========================================================================

	/**
	 * Creates a Rekognition user for an employee.
	 * This must be called before enrolling faces for the employee.
	 *
	 * @route POST /employees/:id/create-rekognition-user
	 * @param id - Employee UUID from path parameters
	 * @returns UserCreationResult with success status and user ID
	 */
	.post(
		'/:id/create-rekognition-user',
		async ({ params, set }): Promise<UserCreationResult> => {
			const { id: employeeId } = params;

			// Verify employee exists in database
			const existingEmployee = await db
				.select()
				.from(employee)
				.where(eq(employee.id, employeeId))
				.limit(1);

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
			await db
				.update(employee)
				.set({ rekognitionUserId: employeeId })
				.where(eq(employee.id, employeeId));

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
	 */
	.post(
		'/:id/enroll-face',
		async ({ params, body, set }): Promise<FaceEnrollmentResult> => {
			const { id: employeeId } = params;
			const { image } = body;

			// Verify employee exists and has a Rekognition user
			const existingEmployee = await db
				.select()
				.from(employee)
				.where(eq(employee.id, employeeId))
				.limit(1);

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
			} catch {
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
			const associateResult = await associateFaces(enrollEmployee.rekognitionUserId, [
				faceId,
			]);

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
	 */
	.delete(
		'/:id/rekognition-user',
		async ({ params, set }): Promise<{ success: boolean; message: string }> => {
			const { id: employeeId } = params;

			// Verify employee exists
			const existingEmployee = await db
				.select()
				.from(employee)
				.where(eq(employee.id, employeeId))
				.limit(1);

			const deleteEmployeeRecord = existingEmployee[0];
			if (!deleteEmployeeRecord) {
				set.status = 404;
				return {
					success: false,
					message: 'Employee not found',
				};
			}

			const rekognitionUserId = deleteEmployeeRecord.rekognitionUserId;

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
			await db
				.update(employee)
				.set({ rekognitionUserId: null })
				.where(eq(employee.id, employeeId));

			return {
				success: true,
				message: 'Rekognition user and associated faces deleted successfully',
			};
		},
		{
			params: employeeIdParamsSchema,
		},
	);
