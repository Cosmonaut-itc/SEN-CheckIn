import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';

import db from '../db/index.js';
import { location, client } from '../db/schema.js';
import {
	idParamSchema,
	locationQuerySchema,
	createLocationSchema,
	updateLocationSchema,
} from '../schemas/crud.js';

/**
 * Location routes for managing location/branch records.
 * Provides full CRUD operations for the location table.
 *
 * @module routes/locations
 */

/**
 * Location routes plugin for Elysia.
 */
export const locationRoutes = new Elysia({ prefix: '/locations' })
	/**
	 * List all locations with pagination and optional client filter.
	 *
	 * @route GET /locations
	 * @param query.limit - Maximum number of results (default: 50)
	 * @param query.offset - Number of results to skip (default: 0)
	 * @param query.clientId - Filter by client ID (optional)
	 * @returns Array of location records
	 */
	.get(
		'/',
		async ({ query }) => {
			const { limit, offset, clientId } = query;

			let baseQuery = db.select().from(location);

			if (clientId) {
				baseQuery = baseQuery.where(eq(location.clientId, clientId)) as typeof baseQuery;
			}

			const results = await baseQuery.limit(limit).offset(offset).orderBy(location.name);

			// Get total count
			let countQuery = db.select().from(location);
			if (clientId) {
				countQuery = countQuery.where(eq(location.clientId, clientId)) as typeof countQuery;
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
			query: locationQuerySchema,
		},
	)

	/**
	 * Get a single location by ID.
	 *
	 * @route GET /locations/:id
	 * @param id - Location UUID
	 * @returns Location record or 404 error
	 */
	.get(
		'/:id',
		async ({ params, set }) => {
			const { id } = params;

			const results = await db.select().from(location).where(eq(location.id, id)).limit(1);

			const record = results[0];
			if (!record) {
				set.status = 404;
				return { error: 'Location not found' };
			}

			return { data: record };
		},
		{
			params: idParamSchema,
		},
	)

	/**
	 * Create a new location.
	 *
	 * @route POST /locations
	 * @param body.name - Location name
	 * @param body.code - Unique location code
	 * @param body.address - Physical address (optional)
	 * @param body.clientId - Client ID this location belongs to
	 * @returns Created location record
	 */
	.post(
		'/',
		async ({ body, set }) => {
			const { name, code, address, clientId } = body;

			// Verify client exists
			const clientExists = await db.select().from(client).where(eq(client.id, clientId)).limit(1);

			if (!clientExists[0]) {
				set.status = 400;
				return { error: 'Client not found' };
			}

			// Check if code is unique
			const codeExists = await db.select().from(location).where(eq(location.code, code)).limit(1);

			if (codeExists[0]) {
				set.status = 409;
				return { error: 'Location code already exists' };
			}

			const id = crypto.randomUUID();

			const newLocation = {
				id,
				name,
				code,
				address: address ?? null,
				clientId,
			};

			await db.insert(location).values(newLocation);

			set.status = 201;
			return {
				data: {
					...newLocation,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			};
		},
		{
			body: createLocationSchema,
		},
	)

	/**
	 * Update an existing location.
	 *
	 * @route PUT /locations/:id
	 * @param id - Location UUID
	 * @param body - Fields to update
	 * @returns Updated location record
	 */
	.put(
		'/:id',
		async ({ params, body, set }) => {
			const { id } = params;

			// Check if location exists
			const existing = await db.select().from(location).where(eq(location.id, id)).limit(1);

			if (!existing[0]) {
				set.status = 404;
				return { error: 'Location not found' };
			}

			// Check if code is unique (if being updated)
			if (body.code && body.code !== existing[0].code) {
				const codeExists = await db.select().from(location).where(eq(location.code, body.code)).limit(1);

				if (codeExists[0]) {
					set.status = 409;
					return { error: 'Location code already exists' };
				}
			}

			// Only update if there are fields to update
			if (Object.keys(body).length === 0) {
				return { data: existing[0] };
			}

			await db.update(location).set(body).where(eq(location.id, id));

			// Fetch updated record
			const updated = await db.select().from(location).where(eq(location.id, id)).limit(1);

			return { data: updated[0] };
		},
		{
			params: idParamSchema,
			body: updateLocationSchema,
		},
	)

	/**
	 * Delete a location.
	 *
	 * @route DELETE /locations/:id
	 * @param id - Location UUID
	 * @returns Success message
	 */
	.delete(
		'/:id',
		async ({ params, set }) => {
			const { id } = params;

			// Check if location exists
			const existing = await db.select().from(location).where(eq(location.id, id)).limit(1);

			if (!existing[0]) {
				set.status = 404;
				return { error: 'Location not found' };
			}

			await db.delete(location).where(eq(location.id, id));

			return { message: 'Location deleted successfully' };
		},
		{
			params: idParamSchema,
		},
	);

