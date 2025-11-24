import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';

import db from '../db/index.js';
import { client } from '../db/schema.js';
import {
	clientQuerySchema,
	createClientSchema,
	idParamSchema,
	updateClientSchema,
} from '../schemas/crud.js';

/**
 * Client routes for managing client/company records.
 * Provides full CRUD operations for the client table.
 *
 * @module routes/clients
 */

/**
 * Client routes plugin for Elysia.
 */
export const clientRoutes = new Elysia({ prefix: '/clients' })
	/**
	 * List all clients with pagination.
	 *
	 * @route GET /clients
	 * @param query.limit - Maximum number of results (default: 50)
	 * @param query.offset - Number of results to skip (default: 0)
	 * @returns Array of client records
	 */
	.get(
		'/',
		async ({ query }) => {
			const { limit, offset } = query;

			const results = await db
				.select()
				.from(client)
				.limit(limit)
				.offset(offset)
				.orderBy(client.name);

			const countResult = await db.select().from(client);
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
			query: clientQuerySchema,
		},
	)

	/**
	 * Get a single client by ID.
	 *
	 * @route GET /clients/:id
	 * @param id - Client UUID
	 * @returns Client record or 404 error
	 */
	.get(
		'/:id',
		async ({ params, set }) => {
			const { id } = params;

			const results = await db.select().from(client).where(eq(client.id, id)).limit(1);

			const record = results[0];
			if (!record) {
				set.status = 404;
				return { error: 'Client not found' };
			}

			return { data: record };
		},
		{
			params: idParamSchema,
		},
	)

	/**
	 * Create a new client.
	 *
	 * @route POST /clients
	 * @param body.name - Client name
	 * @returns Created client record
	 */
	.post(
		'/',
		async ({ body, set }) => {
			const id = crypto.randomUUID();

			const newClient = {
				id,
				name: body.name,
			};

			await db.insert(client).values(newClient);

			set.status = 201;
			return {
				data: {
					...newClient,
					apiKeyId: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			};
		},
		{
			body: createClientSchema,
		},
	)

	/**
	 * Update an existing client.
	 *
	 * @route PUT /clients/:id
	 * @param id - Client UUID
	 * @param body - Fields to update
	 * @returns Updated client record
	 */
	.put(
		'/:id',
		async ({ params, body, set }) => {
			const { id } = params;

			// Check if client exists
			const existing = await db.select().from(client).where(eq(client.id, id)).limit(1);

			if (!existing[0]) {
				set.status = 404;
				return { error: 'Client not found' };
			}

			// Only update if there are fields to update
			if (Object.keys(body).length === 0) {
				return { data: existing[0] };
			}

			await db.update(client).set(body).where(eq(client.id, id));

			// Fetch updated record
			const updated = await db.select().from(client).where(eq(client.id, id)).limit(1);

			return { data: updated[0] };
		},
		{
			params: idParamSchema,
			body: updateClientSchema,
		},
	)

	/**
	 * Delete a client.
	 *
	 * @route DELETE /clients/:id
	 * @param id - Client UUID
	 * @returns Success message
	 */
	.delete(
		'/:id',
		async ({ params, set }) => {
			const { id } = params;

			// Check if client exists
			const existing = await db.select().from(client).where(eq(client.id, id)).limit(1);

			if (!existing[0]) {
				set.status = 404;
				return { error: 'Client not found' };
			}

			await db.delete(client).where(eq(client.id, id));

			return { message: 'Client deleted successfully' };
		},
		{
			params: idParamSchema,
		},
	);
