import { Elysia } from 'elysia';
import { eq, and, ilike, or, type SQL } from 'drizzle-orm';

import db from '../db/index.js';
import { device, location, organization } from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import {
	idParamSchema,
	deviceQuerySchema,
	createDeviceSchema,
	updateDeviceSchema,
} from '../schemas/crud.js';

/**
 * Device routes for managing kiosk/device records.
 * Provides full CRUD operations for the device table plus heartbeat functionality.
 *
 * @module routes/devices
 */

/**
 * Device routes plugin for Elysia.
 */
export const deviceRoutes = new Elysia({ prefix: '/devices' })
	.use(combinedAuthPlugin)
	/**
	 * List all devices with pagination and optional filters.
	 *
	 * @route GET /devices
	 * @param query.limit - Maximum number of results (default: 50)
	 * @param query.offset - Number of results to skip (default: 0)
	 * @param query.locationId - Filter by location ID (optional)
	 * @param query.status - Filter by device status (optional)
	 * @returns Array of device records
	 */
	.get(
		'/',
		async ({ query, authType, session, set }) => {
			const { limit, offset, locationId, status, search, organizationId: organizationIdQuery } =
				query;

			const organizationId =
				authType === 'session'
					? (session?.activeOrganizationId ?? organizationIdQuery ?? null)
					: (organizationIdQuery ?? null);

			if (!organizationId) {
				set.status = 400;
				return { error: 'Organization is required' };
			}

			let baseQuery = db.select().from(device);

			// Build conditions array
			const conditions: [SQL<unknown>, ...SQL<unknown>[]] = [
				eq(device.organizationId, organizationId),
			];
			if (locationId) {
				conditions.push(eq(device.locationId, locationId));
			}
			if (status) {
				conditions.push(eq(device.status, status));
			}
			if (search) {
				const searchClause = or(
					ilike(device.code, `%${search}%`),
					ilike(device.name, `%${search}%`),
					ilike(device.deviceType, `%${search}%`),
				)!;
				conditions.push(searchClause);
			}

			const whereClause = and(...conditions)!;
			baseQuery = baseQuery.where(whereClause) as typeof baseQuery;

			const results = await baseQuery.limit(limit).offset(offset).orderBy(device.name);

			// Get total count with same filters
			let countQuery = db.select().from(device);
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
			query: deviceQuerySchema,
		},
	)

	/**
	 * Get a single device by ID.
	 *
	 * @route GET /devices/:id
	 * @param id - Device UUID
	 * @returns Device record or 404 error
	 */
	.get(
		'/:id',
		async ({ params, set, authType, session }) => {
			const { id } = params;
			const activeOrgId =
				authType === 'session' ? (session?.activeOrganizationId ?? null) : null;

			const results = await db.select().from(device).where(eq(device.id, id)).limit(1);

			const record = results[0];
			if (!record) {
				set.status = 404;
				return { error: 'Device not found' };
			}

			if (
				activeOrgId &&
				record.organizationId &&
				record.organizationId !== activeOrgId
			) {
				set.status = 403;
				return { error: 'You do not have access to this device' };
			}

			return { data: record };
		},
		{
			params: idParamSchema,
		},
	)

	/**
	 * Create a new device.
	 *
	 * @route POST /devices
	 * @param body.code - Unique device code
	 * @param body.name - Device name (optional)
	 * @param body.deviceType - Type of device (optional)
	 * @param body.status - Device status (default: OFFLINE)
	 * @param body.locationId - Location ID (optional)
	 * @returns Created device record
	 */
	.post(
		'/',
		async ({ body, set, authType, session }) => {
			const {
				code,
				name,
				deviceType,
				status: deviceStatus,
				locationId,
				organizationId: organizationIdInput,
			} = body;

			const organizationId =
				authType === 'session'
					? (session?.activeOrganizationId ?? organizationIdInput ?? null)
					: (organizationIdInput ?? null);

			if (!organizationId) {
				set.status = 400;
				return { error: 'Organization is required' };
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

			// Check if code is unique
			const codeExists = await db.select().from(device).where(eq(device.code, code)).limit(1);

			if (codeExists[0]) {
				set.status = 409;
				return { error: 'Device code already exists' };
			}

			const id = crypto.randomUUID();

			const newDevice = {
				id,
				code,
				name: name ?? null,
				deviceType: deviceType ?? null,
				status: deviceStatus,
				locationId: locationId ?? null,
				organizationId,
			};

			await db.insert(device).values(newDevice);

			set.status = 201;
			return {
				data: {
					...newDevice,
					lastHeartbeat: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			};
		},
		{
			body: createDeviceSchema,
		},
	)

	/**
	 * Update an existing device.
	 *
	 * @route PUT /devices/:id
	 * @param id - Device UUID
	 * @param body - Fields to update
	 * @returns Updated device record
	 */
	.put(
		'/:id',
		async ({ params, body, set, authType, session }) => {
			const { id } = params;
			const activeOrgId =
				authType === 'session' ? (session?.activeOrganizationId ?? null) : null;

			// Check if device exists
			const existing = await db.select().from(device).where(eq(device.id, id)).limit(1);

			if (!existing[0]) {
				set.status = 404;
				return { error: 'Device not found' };
			}

			if (
				activeOrgId &&
				existing[0].organizationId &&
				existing[0].organizationId !== activeOrgId
			) {
				set.status = 403;
				return { error: 'You do not have access to this device' };
			}

			const targetOrgId = existing[0].organizationId ?? activeOrgId;

			// Check if code is unique (if being updated)
			if (body.code && body.code !== existing[0].code) {
				const codeExists = await db.select().from(device).where(eq(device.code, body.code)).limit(1);

				if (codeExists[0]) {
					set.status = 409;
					return { error: 'Device code already exists' };
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
					targetOrgId &&
					locationExists[0].organizationId &&
					locationExists[0].organizationId !== targetOrgId
				) {
					set.status = 403;
					return { error: 'Location does not belong to this organization' };
				}
			}

			// Only update if there are fields to update
			if (Object.keys(body).length === 0) {
				return { data: existing[0] };
			}

			await db.update(device).set(body).where(eq(device.id, id));

			// Fetch updated record
			const updated = await db.select().from(device).where(eq(device.id, id)).limit(1);

			return { data: updated[0] };
		},
		{
			params: idParamSchema,
			body: updateDeviceSchema,
		},
	)

	/**
	 * Delete a device.
	 *
	 * @route DELETE /devices/:id
	 * @param id - Device UUID
	 * @returns Success message
	 */
	.delete(
		'/:id',
		async ({ params, set, authType, session }) => {
			const { id } = params;
			const activeOrgId =
				authType === 'session' ? (session?.activeOrganizationId ?? null) : null;

			// Check if device exists
			const existing = await db.select().from(device).where(eq(device.id, id)).limit(1);

			if (!existing[0]) {
				set.status = 404;
				return { error: 'Device not found' };
			}

			if (
				activeOrgId &&
				existing[0].organizationId &&
				existing[0].organizationId !== activeOrgId
			) {
				set.status = 403;
				return { error: 'You do not have access to this device' };
			}

			await db.delete(device).where(eq(device.id, id));

			return { message: 'Device deleted successfully' };
		},
		{
			params: idParamSchema,
		},
	)

	/**
	 * Update device heartbeat timestamp and set status to ONLINE.
	 * Called periodically by devices to indicate they are active.
	 *
	 * @route POST /devices/:id/heartbeat
	 * @param id - Device UUID
	 * @returns Updated device record with new heartbeat timestamp
	 */
	.post(
		'/:id/heartbeat',
		async ({ params, set, authType, session }) => {
			const { id } = params;
			const activeOrgId =
				authType === 'session' ? (session?.activeOrganizationId ?? null) : null;

			// Check if device exists
			const existing = await db.select().from(device).where(eq(device.id, id)).limit(1);

			if (!existing[0]) {
				set.status = 404;
				return { error: 'Device not found' };
			}

			if (
				activeOrgId &&
				existing[0].organizationId &&
				existing[0].organizationId !== activeOrgId
			) {
				set.status = 403;
				return { error: 'You do not have access to this device' };
			}

			const now = new Date();

			await db
				.update(device)
				.set({
					lastHeartbeat: now,
					status: 'ONLINE',
				})
				.where(eq(device.id, id));

			// Fetch updated record
			const updated = await db.select().from(device).where(eq(device.id, id)).limit(1);

			return { data: updated[0] };
		},
		{
			params: idParamSchema,
		},
	);
