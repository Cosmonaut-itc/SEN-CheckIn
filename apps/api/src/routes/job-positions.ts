import { Elysia } from 'elysia';
import { and, eq, ilike, or } from 'drizzle-orm';

import db from '../db/index.js';
import { jobPosition, client } from '../db/schema.js';
import {
	idParamSchema,
	jobPositionQuerySchema,
	createJobPositionSchema,
	updateJobPositionSchema,
} from '../schemas/crud.js';

/**
 * Job Position routes for managing employee positions/roles.
 * Provides full CRUD operations for the job_position table.
 *
 * @module routes/job-positions
 */

/**
 * Job Position routes plugin for Elysia.
 */
export const jobPositionRoutes = new Elysia({ prefix: '/job-positions' })
	/**
	 * List all job positions with pagination and optional filters.
	 *
	 * @route GET /job-positions
	 * @param query.limit - Maximum number of results (default: 50)
	 * @param query.offset - Number of results to skip (default: 0)
	 * @param query.clientId - Filter by client ID (optional)
	 * @param query.search - Search by name or description (optional)
	 * @returns Array of job position records
	 */
	.get(
		'/',
		async ({ query }) => {
			const { limit, offset, clientId, search } = query;

			// Build conditions array
			const conditions = [];
			if (clientId) {
				conditions.push(eq(jobPosition.clientId, clientId));
			}
			if (search) {
				conditions.push(
					or(
						ilike(jobPosition.name, `%${search}%`),
						ilike(jobPosition.description, `%${search}%`),
					),
				);
			}

			let baseQuery = db.select().from(jobPosition);

			if (conditions.length > 0) {
				baseQuery = baseQuery.where(
					conditions.length === 1 ? conditions[0] : and(...conditions),
				) as typeof baseQuery;
			}

			const results = await baseQuery.limit(limit).offset(offset).orderBy(jobPosition.name);

			// Get total count with same conditions
			let countQuery = db.select().from(jobPosition);
			if (conditions.length > 0) {
				countQuery = countQuery.where(
					conditions.length === 1 ? conditions[0] : and(...conditions),
				) as typeof countQuery;
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
			query: jobPositionQuerySchema,
		},
	)

	/**
	 * Get a single job position by ID.
	 *
	 * @route GET /job-positions/:id
	 * @param id - Job position UUID
	 * @returns Job position record or 404 error
	 */
	.get(
		'/:id',
		async ({ params, set }) => {
			const { id } = params;

			const results = await db.select().from(jobPosition).where(eq(jobPosition.id, id)).limit(1);

			const record = results[0];
			if (!record) {
				set.status = 404;
				return { error: 'Job position not found' };
			}

			return { data: record };
		},
		{
			params: idParamSchema,
		},
	)

	/**
	 * Create a new job position.
	 *
	 * @route POST /job-positions
	 * @param body.name - Position name
	 * @param body.description - Position description (optional)
	 * @param body.clientId - Client ID this position belongs to
	 * @returns Created job position record
	 */
	.post(
		'/',
		async ({ body, set }) => {
			const { name, description, clientId } = body;

			// Verify client exists
			const clientExists = await db.select().from(client).where(eq(client.id, clientId)).limit(1);

			if (!clientExists[0]) {
				set.status = 400;
				return { error: 'Client not found' };
			}

			const id = crypto.randomUUID();

			const newPosition = {
				id,
				name,
				description: description ?? null,
				clientId,
			};

			await db.insert(jobPosition).values(newPosition);

			set.status = 201;
			return {
				data: {
					...newPosition,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			};
		},
		{
			body: createJobPositionSchema,
		},
	)

	/**
	 * Update an existing job position.
	 *
	 * @route PUT /job-positions/:id
	 * @param id - Job position UUID
	 * @param body - Fields to update
	 * @returns Updated job position record
	 */
	.put(
		'/:id',
		async ({ params, body, set }) => {
			const { id } = params;

			// Check if position exists
			const existing = await db.select().from(jobPosition).where(eq(jobPosition.id, id)).limit(1);

			if (!existing[0]) {
				set.status = 404;
				return { error: 'Job position not found' };
			}

			// Only update if there are fields to update
			if (Object.keys(body).length === 0) {
				return { data: existing[0] };
			}

			await db.update(jobPosition).set(body).where(eq(jobPosition.id, id));

			// Fetch updated record
			const updated = await db.select().from(jobPosition).where(eq(jobPosition.id, id)).limit(1);

			return { data: updated[0] };
		},
		{
			params: idParamSchema,
			body: updateJobPositionSchema,
		},
	)

	/**
	 * Delete a job position.
	 *
	 * @route DELETE /job-positions/:id
	 * @param id - Job position UUID
	 * @returns Success message
	 */
	.delete(
		'/:id',
		async ({ params, set }) => {
			const { id } = params;

			// Check if position exists
			const existing = await db.select().from(jobPosition).where(eq(jobPosition.id, id)).limit(1);

			if (!existing[0]) {
				set.status = 404;
				return { error: 'Job position not found' };
			}

			await db.delete(jobPosition).where(eq(jobPosition.id, id));

			return { message: 'Job position deleted successfully' };
		},
		{
			params: idParamSchema,
		},
	);

