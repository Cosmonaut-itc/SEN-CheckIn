import { Elysia } from 'elysia';
import crypto from 'node:crypto';
import { eq, and, gte, lte, type SQL } from 'drizzle-orm';
import { startOfDay, endOfDay } from 'date-fns';

import db from '../db/index.js';
import { attendanceRecord, employee, device, location } from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { hasOrganizationAccess, resolveOrganizationId } from '../utils/organization.js';
import {
	idParamSchema,
	attendanceQuerySchema,
	createAttendanceSchema,
	employeeIdParamSchema,
} from '../schemas/crud.js';

/**
 * Attendance routes for managing check-in/check-out records.
 * Provides endpoints for creating and querying attendance records.
 *
 * @module routes/attendance
 */

/**
 * Attendance routes plugin for Elysia.
 */
export const attendanceRoutes = new Elysia({ prefix: '/attendance' })
	.use(combinedAuthPlugin)
	/**
	 * List attendance records with pagination and optional filters.
	 *
	 * @route GET /attendance
	 * @param query.limit - Maximum number of results (default: 50)
	 * @param query.offset - Number of results to skip (default: 0)
	 * @param query.employeeId - Filter by employee ID (optional)
	 * @param query.deviceId - Filter by device ID (optional)
	 * @param query.type - Filter by attendance type (optional)
	 * @param query.fromDate - Filter records from this date (optional)
	 * @param query.toDate - Filter records until this date (optional)
	 * @returns Array of attendance records with pagination info
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
				employeeId,
				deviceId,
				type,
				fromDate,
				toDate,
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
			const conditions: SQL<unknown>[] = [eq(employee.organizationId, organizationId)];
			if (employeeId) {
				conditions.push(eq(attendanceRecord.employeeId, employeeId));
			}
			if (deviceId) {
				conditions.push(eq(attendanceRecord.deviceId, deviceId));
			}
			if (type) {
				conditions.push(eq(attendanceRecord.type, type));
			}
			if (fromDate) {
				conditions.push(gte(attendanceRecord.timestamp, fromDate));
			}
			if (toDate) {
				conditions.push(lte(attendanceRecord.timestamp, toDate));
			}

			let baseQuery = db
				.select({
					id: attendanceRecord.id,
					employeeId: attendanceRecord.employeeId,
					employeeFirstName: employee.firstName,
					employeeLastName: employee.lastName,
					deviceId: attendanceRecord.deviceId,
					deviceLocationName: location.name,
					timestamp: attendanceRecord.timestamp,
					type: attendanceRecord.type,
					metadata: attendanceRecord.metadata,
					createdAt: attendanceRecord.createdAt,
					updatedAt: attendanceRecord.updatedAt,
				})
				.from(attendanceRecord)
				.innerJoin(employee, eq(attendanceRecord.employeeId, employee.id))
				.innerJoin(device, eq(attendanceRecord.deviceId, device.id))
				.leftJoin(location, eq(device.locationId, location.id));

			if (conditions.length > 0) {
				baseQuery = baseQuery.where(and(...conditions)) as typeof baseQuery;
			}

			const results = await baseQuery
				.limit(limit)
				.offset(offset)
				.orderBy(attendanceRecord.timestamp);

			const formattedResults = results.map(
				({ employeeFirstName, employeeLastName, ...rest }) => ({
					...rest,
					employeeName: `${employeeFirstName ?? ''} ${employeeLastName ?? ''}`
						.trim()
						.replace(/\s+/g, ' '),
				}),
			);

			// Get total count with same filters
			let countQuery = db
				.select({
					id: attendanceRecord.id,
				})
				.from(attendanceRecord)
				.innerJoin(employee, eq(attendanceRecord.employeeId, employee.id));
			if (conditions.length > 0) {
				countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
			}
			const countResult = await countQuery;
			const total = countResult.length;

			return {
				data: formattedResults,
				pagination: {
					total,
					limit,
					offset,
					hasMore: offset + results.length < total,
				},
			};
		},
		{
			query: attendanceQuerySchema,
		},
	)

	/**
	 * Get a single attendance record by ID.
	 *
	 * @route GET /attendance/:id
	 * @param id - Attendance record UUID
	 * @returns Attendance record or 404 error
	 */
	.get(
		'/:id',
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			const results = await db
				.select({
					id: attendanceRecord.id,
					employeeId: attendanceRecord.employeeId,
					employeeFirstName: employee.firstName,
					employeeLastName: employee.lastName,
					deviceId: attendanceRecord.deviceId,
					deviceLocationName: location.name,
					timestamp: attendanceRecord.timestamp,
					type: attendanceRecord.type,
					metadata: attendanceRecord.metadata,
					createdAt: attendanceRecord.createdAt,
					updatedAt: attendanceRecord.updatedAt,
					employeeOrgId: employee.organizationId,
				})
				.from(attendanceRecord)
				.innerJoin(employee, eq(attendanceRecord.employeeId, employee.id))
				.innerJoin(device, eq(attendanceRecord.deviceId, device.id))
				.leftJoin(location, eq(device.locationId, location.id))
				.where(eq(attendanceRecord.id, id))
				.limit(1);

			const record = results[0];
			if (!record) {
				set.status = 404;
				return { error: 'Attendance record not found' };
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					record.employeeOrgId,
				)
			) {
				set.status = 403;
				return { error: 'You do not have access to this attendance record' };
			}

			const { employeeOrgId: _employeeOrgId, employeeFirstName, employeeLastName, ...rest } =
				record;
			void _employeeOrgId;

			return {
				data: {
					...rest,
					employeeName: `${employeeFirstName ?? ''} ${employeeLastName ?? ''}`
						.trim()
						.replace(/\s+/g, ' '),
				},
			};
		},
		{
			params: idParamSchema,
		},
	)

	/**
	 * Create a new attendance record.
	 *
	 * @route POST /attendance
	 * @param body.employeeId - Employee UUID
	 * @param body.deviceId - Device UUID
	 * @param body.timestamp - Record timestamp (defaults to now)
	 * @param body.type - CHECK_IN or CHECK_OUT
	 * @param body.metadata - Additional metadata (optional)
	 * @returns Created attendance record
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
			const { employeeId, deviceId, timestamp, type, metadata } = body;

			// Verify employee exists
			const employeeExists = await db
				.select()
				.from(employee)
				.where(eq(employee.id, employeeId))
				.limit(1);
			const existingEmployee = employeeExists[0];
			if (!existingEmployee) {
				set.status = 400;
				return { error: 'Employee not found' };
			}

			// Verify device exists
			const deviceExists = await db
				.select()
				.from(device)
				.where(eq(device.id, deviceId))
				.limit(1);
			const existingDevice = deviceExists[0];
			if (!existingDevice) {
				set.status = 400;
				return { error: 'Device not found' };
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					existingEmployee.organizationId,
				)
			) {
				set.status = 403;
				return { error: 'Employee does not belong to an allowed organization' };
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					existingDevice.organizationId,
				)
			) {
				set.status = 403;
				return { error: 'Device does not belong to an allowed organization' };
			}

			const resolvedOrganizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId:
					existingEmployee.organizationId ?? existingDevice.organizationId ?? null,
			});

			if (!resolvedOrganizationId) {
				set.status = 403;
				return { error: 'Organization is required or not permitted' };
			}

			if (
				existingDevice.organizationId &&
				existingDevice.organizationId !== resolvedOrganizationId
			) {
				set.status = 403;
				return { error: 'Device does not belong to the resolved organization' };
			}

			const id = crypto.randomUUID();

			const newRecord = {
				id,
				employeeId,
				deviceId,
				timestamp,
				type,
				metadata: metadata ?? null,
			};

			await db.insert(attendanceRecord).values(newRecord);

			set.status = 201;
			return {
				data: {
					...newRecord,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			};
		},
		{
			body: createAttendanceSchema,
		},
	)

	/**
	 * Get today's attendance records for a specific employee.
	 *
	 * @route GET /attendance/employee/:employeeId/today
	 * @param employeeId - Employee UUID
	 * @returns Array of today's attendance records for the employee
	 */
	.get(
		'/employee/:employeeId/today',
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { employeeId } = params;

			// Verify employee exists
			const employeeExists = await db
				.select()
				.from(employee)
				.where(eq(employee.id, employeeId))
				.limit(1);
			const employeeRecord = employeeExists[0];
			if (!employeeRecord) {
				set.status = 404;
				return { error: 'Employee not found' };
			}

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
				return { error: 'You do not have access to this employee' };
			}

			const today = new Date();
			const dayStart = startOfDay(today);
			const dayEnd = endOfDay(today);

			const results = await db
				.select()
				.from(attendanceRecord)
				.where(
					and(
						eq(attendanceRecord.employeeId, employeeId),
						gte(attendanceRecord.timestamp, dayStart),
						lte(attendanceRecord.timestamp, dayEnd),
					),
				)
				.orderBy(attendanceRecord.timestamp);

			return {
				data: results,
				date: today.toISOString().split('T')[0],
				employeeId,
			};
		},
		{
			params: employeeIdParamSchema,
		},
	);
