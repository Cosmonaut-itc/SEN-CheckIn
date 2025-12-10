import { and, eq, ilike, or, type SQL } from 'drizzle-orm';
import { Elysia } from 'elysia';

import db from '../db/index.js';
import {
	employee,
	employeeSchedule,
	jobPosition,
	location,
	organization,
	scheduleTemplate,
	scheduleTemplateDay,
} from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { hasOrganizationAccess, resolveOrganizationId } from '../utils/organization.js';
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
	.use(combinedAuthPlugin)
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
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			set,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const {
				limit,
				offset,
				locationId,
				jobPositionId,
				status,
				search,
				organizationId: organizationIdQuery,
			} = query;

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: organizationIdQuery ?? null,
			});

			if (!organizationId) {
				set.status = authType === 'apiKey' ? 403 : 400;
				return { error: 'Organization is required or not permitted' };
			}

			// Build conditions array
			const conditions: [SQL<unknown>, ...SQL<unknown>[]] = [
				eq(employee.organizationId, organizationId),
			];
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
				const searchClause = or(
					ilike(employee.firstName, `%${search}%`),
					ilike(employee.lastName, `%${search}%`),
					ilike(employee.code, `%${search}%`),
				)!;
				conditions.push(searchClause);
			}

			// Select employee fields and join job position to get the name
			let baseQuery = db
				.select({
					id: employee.id,
					code: employee.code,
					firstName: employee.firstName,
					lastName: employee.lastName,
					email: employee.email,
					phone: employee.phone,
					jobPositionId: employee.jobPositionId,
					jobPositionName: jobPosition.name,
					department: employee.department,
					status: employee.status,
					shiftType: employee.shiftType,
					hireDate: employee.hireDate,
					locationId: employee.locationId,
					organizationId: employee.organizationId,
					rekognitionUserId: employee.rekognitionUserId,
					scheduleTemplateId: employee.scheduleTemplateId,
					scheduleTemplateName: scheduleTemplate.name,
					scheduleTemplateShiftType: scheduleTemplate.shiftType,
					lastPayrollDate: employee.lastPayrollDate,
					createdAt: employee.createdAt,
					updatedAt: employee.updatedAt,
				})
				.from(employee)
				.leftJoin(jobPosition, eq(employee.jobPositionId, jobPosition.id))
				.leftJoin(scheduleTemplate, eq(employee.scheduleTemplateId, scheduleTemplate.id));

			const whereClause = and(...conditions)!;
			baseQuery = baseQuery.where(whereClause) as typeof baseQuery;

			const results = await baseQuery
				.limit(limit)
				.offset(offset)
				.orderBy(employee.lastName, employee.firstName);

			// Get total count with same filters
			let countQuery = db.select().from(employee);
			const countWhere = and(...conditions)!;
			countQuery = countQuery.where(countWhere) as typeof countQuery;
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
		async ({ params, set, authType, session, sessionOrganizationIds, apiKeyOrganizationIds }) => {
			const { id } = params;

			const results = await db
				.select({
					id: employee.id,
					code: employee.code,
					firstName: employee.firstName,
					lastName: employee.lastName,
					email: employee.email,
					phone: employee.phone,
					jobPositionId: employee.jobPositionId,
					jobPositionName: jobPosition.name,
					department: employee.department,
					status: employee.status,
					shiftType: employee.shiftType,
					hireDate: employee.hireDate,
					locationId: employee.locationId,
					organizationId: employee.organizationId,
					rekognitionUserId: employee.rekognitionUserId,
					scheduleTemplateId: employee.scheduleTemplateId,
					scheduleTemplateName: scheduleTemplate.name,
					scheduleTemplateShiftType: scheduleTemplate.shiftType,
					lastPayrollDate: employee.lastPayrollDate,
					createdAt: employee.createdAt,
					updatedAt: employee.updatedAt,
				})
				.from(employee)
				.leftJoin(jobPosition, eq(employee.jobPositionId, jobPosition.id))
				.leftJoin(scheduleTemplate, eq(employee.scheduleTemplateId, scheduleTemplate.id))
				.where(eq(employee.id, id))
				.limit(1);

			const record = results[0];
			if (!record) {
				set.status = 404;
				return { error: 'Employee not found' };
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					record.organizationId,
				)
			) {
				set.status = 403;
				return { error: 'You do not have access to this employee' };
			}

			const schedule = await db
				.select()
				.from(employeeSchedule)
				.where(eq(employeeSchedule.employeeId, id))
				.orderBy(employeeSchedule.dayOfWeek, employeeSchedule.startTime);

			return { data: { ...record, schedule } };
		},
		{
			params: idParamSchema,
		},
	)

	/**
	 * Create a new employee.
	 *
	 * @route POST /employees
	 * @param body - Employee data (jobPositionId is required)
	 * @returns Created employee record
	 */
	.post(
		'/',
		async ({
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
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
				organizationId: organizationIdInput,
				schedule,
				shiftType,
				scheduleTemplateId,
			} = body;

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: organizationIdInput ?? null,
			});

			if (!organizationId) {
				set.status = authType === 'apiKey' ? 403 : 400;
				return { error: 'Organization is required or not permitted' };
			}

			// Verify organization exists
			const organizationExists = await db
				.select()
				.from(organization)
				.where(eq(organization.id, organizationId))
				.limit(1);

			if (!organizationExists[0]) {
				set.status = 400;
				return { error: 'Organization not found' };
			}

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

				if (
					locationExists[0].organizationId &&
					locationExists[0].organizationId !== organizationId
				) {
					set.status = 403;
					return { error: 'Location does not belong to this organization' };
				}
			}

			// Verify job position exists (required for new employees)
			const positionExists = await db
				.select()
				.from(jobPosition)
				.where(eq(jobPosition.id, jobPositionId))
				.limit(1);
			if (!positionExists[0]) {
				set.status = 400;
				return { error: 'Job position not found' };
			}

			if (
				positionExists[0].organizationId &&
				positionExists[0].organizationId !== organizationId
			) {
				set.status = 403;
				return { error: 'Job position does not belong to this organization' };
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

			if (schedule && scheduleTemplateId) {
				set.status = 400;
				return { error: 'Provide either a scheduleTemplateId or a custom schedule, not both' };
			}

			let templateDays: {
				dayOfWeek: number;
				startTime: string;
				endTime: string;
				isWorkingDay: boolean | null;
			}[] = [];
			let selectedTemplate: typeof scheduleTemplate.$inferSelect | null = null;

			if (scheduleTemplateId) {
				const templateRecord = await db
					.select()
					.from(scheduleTemplate)
					.where(eq(scheduleTemplate.id, scheduleTemplateId))
					.limit(1);

				if (!templateRecord[0]) {
					set.status = 404;
					return { error: 'Schedule template not found' };
				}

				if (
					templateRecord[0].organizationId &&
					templateRecord[0].organizationId !== organizationId
				) {
					set.status = 403;
					return { error: 'Schedule template does not belong to this organization' };
				}

				selectedTemplate = templateRecord[0] ?? null;

				templateDays = await db
					.select()
					.from(scheduleTemplateDay)
					.where(eq(scheduleTemplateDay.templateId, scheduleTemplateId))
					.orderBy(scheduleTemplateDay.dayOfWeek);
			}

			const id = crypto.randomUUID();

			const resolvedShiftType = shiftType ?? selectedTemplate?.shiftType ?? 'DIURNA';

			const newEmployee = {
				id,
				code,
				firstName,
				lastName,
				email: email ?? null,
				phone: phone ?? null,
				jobPositionId,
				department: department ?? null,
				status: empStatus,
				hireDate: hireDate ?? null,
				locationId: locationId ?? null,
				organizationId,
				shiftType: resolvedShiftType,
				scheduleTemplateId: scheduleTemplateId ?? null,
			};

			await db.insert(employee).values(newEmployee);

			const selectedSchedule = schedule ?? templateDays;

			if (selectedSchedule && selectedSchedule.length > 0) {
				const scheduleRows = selectedSchedule.map((entry) => ({
					employeeId: id,
					dayOfWeek: entry.dayOfWeek,
					startTime: entry.startTime,
					endTime: entry.endTime,
					isWorkingDay: entry.isWorkingDay ?? true,
				}));
				await db.insert(employeeSchedule).values(scheduleRows);
			}

			set.status = 201;
			return {
				data: {
					...newEmployee,
					rekognitionUserId: null,
					createdAt: new Date(),
					updatedAt: new Date(),
					scheduleTemplateName: selectedTemplate?.name ?? null,
					scheduleTemplateShiftType: selectedTemplate?.shiftType ?? null,
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
		async ({
			params,
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			// Check if employee exists
			const existing = await db.select().from(employee).where(eq(employee.id, id)).limit(1);
			if (!existing[0]) {
				set.status = 404;
				return { error: 'Employee not found' };
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					existing[0].organizationId,
				)
			) {
				set.status = 403;
				return { error: 'You do not have access to this employee' };
			}

			const targetOrgId = existing[0].organizationId ?? null;
			const resolvedOrganizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: targetOrgId,
			});

			if (!resolvedOrganizationId) {
				set.status = 403;
				return { error: 'Organization is required or not permitted' };
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

				if (
					resolvedOrganizationId &&
					locationExists[0].organizationId &&
					locationExists[0].organizationId !== resolvedOrganizationId
				) {
					set.status = 403;
					return { error: 'Location does not belong to this organization' };
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

				if (
					resolvedOrganizationId &&
					positionExists[0].organizationId &&
					positionExists[0].organizationId !== resolvedOrganizationId
				) {
					set.status = 403;
					return { error: 'Job position does not belong to this organization' };
				}
			}

			// Only update if there are fields to update
			if (Object.keys(body).length === 0) {
				return { data: existing[0] };
			}

			if (body.schedule && body.scheduleTemplateId) {
				set.status = 400;
				return { error: 'Provide either a scheduleTemplateId or a custom schedule, not both' };
			}

			let templateDays: {
				dayOfWeek: number;
				startTime: string;
				endTime: string;
				isWorkingDay: boolean | null;
			}[] = [];
			let selectedTemplate: typeof scheduleTemplate.$inferSelect | null = null;

			if (body.scheduleTemplateId) {
				const templateRecord = await db
					.select()
					.from(scheduleTemplate)
					.where(eq(scheduleTemplate.id, body.scheduleTemplateId))
					.limit(1);

				if (!templateRecord[0]) {
					set.status = 404;
					return { error: 'Schedule template not found' };
				}

				if (
					templateRecord[0].organizationId &&
					templateRecord[0].organizationId !== resolvedOrganizationId
				) {
					set.status = 403;
					return { error: 'Schedule template does not belong to this organization' };
				}

				selectedTemplate = templateRecord[0] ?? null;

				templateDays = await db
					.select()
					.from(scheduleTemplateDay)
					.where(eq(scheduleTemplateDay.templateId, body.scheduleTemplateId))
					.orderBy(scheduleTemplateDay.dayOfWeek);
			}

			// Extract schedule updates separately to avoid passing to employee table
			const { schedule, scheduleTemplateId, ...employeeUpdate } = body;
			const updatePayload: Partial<typeof employee.$inferInsert> = {
				...employeeUpdate,
			};

			if (scheduleTemplateId !== undefined) {
				updatePayload.scheduleTemplateId = scheduleTemplateId;
			}
			if (
				scheduleTemplateId !== undefined &&
				scheduleTemplateId !== null &&
				employeeUpdate.shiftType === undefined &&
				selectedTemplate
			) {
				updatePayload.shiftType = selectedTemplate.shiftType;
			}

			await db.update(employee).set(updatePayload).where(eq(employee.id, id));

			let nextSchedule:
				| NonNullable<typeof schedule>
				| typeof templateDays
				| undefined = undefined;

			if (schedule !== undefined) {
				nextSchedule = schedule;
			} else if (scheduleTemplateId !== undefined && scheduleTemplateId !== null) {
				nextSchedule = templateDays;
			}

			if (nextSchedule !== undefined) {
				await db.delete(employeeSchedule).where(eq(employeeSchedule.employeeId, id));
				if (nextSchedule.length > 0) {
					const scheduleRows = nextSchedule.map((entry) => ({
						employeeId: id,
						dayOfWeek: entry.dayOfWeek,
						startTime: entry.startTime,
						endTime: entry.endTime,
						isWorkingDay: entry.isWorkingDay ?? true,
					}));
					await db.insert(employeeSchedule).values(scheduleRows);
				}
			}

			// Fetch updated record
			const updated = await db
				.select({
					id: employee.id,
					code: employee.code,
					firstName: employee.firstName,
					lastName: employee.lastName,
					email: employee.email,
					phone: employee.phone,
					jobPositionId: employee.jobPositionId,
					department: employee.department,
					status: employee.status,
					shiftType: employee.shiftType,
					hireDate: employee.hireDate,
					locationId: employee.locationId,
					organizationId: employee.organizationId,
					scheduleTemplateId: employee.scheduleTemplateId,
					scheduleTemplateName: scheduleTemplate.name,
					scheduleTemplateShiftType: scheduleTemplate.shiftType,
					rekognitionUserId: employee.rekognitionUserId,
					lastPayrollDate: employee.lastPayrollDate,
					createdAt: employee.createdAt,
					updatedAt: employee.updatedAt,
				})
				.from(employee)
				.leftJoin(scheduleTemplate, eq(employee.scheduleTemplateId, scheduleTemplate.id))
				.where(eq(employee.id, id))
				.limit(1);
			const updatedSchedule = await db
				.select()
				.from(employeeSchedule)
				.where(eq(employeeSchedule.employeeId, id))
				.orderBy(employeeSchedule.dayOfWeek, employeeSchedule.startTime);

			return { data: { ...updated[0], schedule: updatedSchedule } };
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
		async ({ params, set, authType, session, sessionOrganizationIds, apiKeyOrganizationIds }) => {
			const { id } = params;

			// Check if employee exists
			const existing = await db.select().from(employee).where(eq(employee.id, id)).limit(1);
			if (!existing[0]) {
				set.status = 404;
				return { error: 'Employee not found' };
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					existing[0].organizationId,
				)
			) {
				set.status = 403;
				return { error: 'You do not have access to this employee' };
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
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}): Promise<UserCreationResult> => {
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

			const employeeRecord = existingEmployee[0]!;

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					employeeRecord.organizationId,
				)
			) {
				set.status = 403;
				return {
					success: false,
					userId: null,
					employeeId,
					message: 'You do not have access to this employee',
				};
			}

			// Check if employee already has a Rekognition user
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
		async ({
			params,
			body,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}): Promise<FaceEnrollmentResult> => {
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

			const enrollEmployee = existingEmployee[0]!;

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					enrollEmployee.organizationId,
				)
			) {
				set.status = 403;
				return {
					success: false,
					faceId: null,
					employeeId,
					associated: false,
					message: 'You do not have access to this employee',
				};
			}

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
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}): Promise<{ success: boolean; message: string }> => {
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

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					deleteEmployeeRecord.organizationId,
				)
			) {
				set.status = 403;
				return {
					success: false,
					message: 'You do not have access to this employee',
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
