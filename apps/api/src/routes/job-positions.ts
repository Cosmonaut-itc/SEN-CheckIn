import { Elysia } from 'elysia';
import { and, eq, ilike, or, type SQL } from 'drizzle-orm';

import db from '../db/index.js';
import { jobPosition, organization } from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
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
	.use(combinedAuthPlugin)
	/**
	 * List all job positions with pagination and optional filters.
	 *
	 * @route GET /job-positions
	 * @param query.limit - Maximum number of results (default: 50)
	 * @param query.offset - Number of results to skip (default: 0)
	 * @param query.organizationId - Filter by organization ID (optional)
	 * @param query.search - Search by name or description (optional)
	 * @returns Array of job position records
	 */
	.get(
		'/',
		async ({ query, authType, session, set }) => {
			const { limit, offset, organizationId: organizationIdQuery, search } = query;
			const organizationId =
				authType === 'session'
					? (session?.activeOrganizationId ?? organizationIdQuery ?? null)
					: (organizationIdQuery ?? null);

			if (!organizationId) {
				set.status = 400;
				return { error: 'Organization is required' };
			}

			// Build conditions array
			const conditions: [SQL<unknown>, ...SQL<unknown>[]] = [
				eq(jobPosition.organizationId, organizationId),
			];
			if (search) {
				const searchClause = or(
					ilike(jobPosition.name, `%${search}%`),
					ilike(jobPosition.description, `%${search}%`),
				)!;
				conditions.push(searchClause);
			}

			let baseQuery = db.select().from(jobPosition);

			const whereClause = and(...conditions)!;
			baseQuery = baseQuery.where(whereClause) as typeof baseQuery;

			const results = await baseQuery.limit(limit).offset(offset).orderBy(jobPosition.name);

			// Get total count with same conditions
			let countQuery = db.select().from(jobPosition);
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
			query: jobPositionQuerySchema,
		},
	)

	/**
	 * Get a single job position by ID.
	 *
	 * @route GET /job-positions/:id
	 * @param id - Job position UUID
	 * @returns Job position record or 404/403 error
	 */
	.get(
		'/:id',
		async ({ params, set, authType, session }) => {
			const { id } = params;
			const activeOrgId =
				authType === 'session' ? (session?.activeOrganizationId ?? null) : null;

			const results = await db
				.select()
				.from(jobPosition)
				.where(eq(jobPosition.id, id))
				.limit(1);

			const record = results[0];
			if (!record) {
				set.status = 404;
				return { error: 'Job position not found' };
			}

			// Enforce organization scoping for session-based auth
			if (
				activeOrgId &&
				record.organizationId &&
				record.organizationId !== activeOrgId
			) {
				set.status = 403;
				return { error: 'You do not have access to this job position' };
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
	 * @param body.organizationId - Organization ID this position belongs to
	 * @returns Created job position record
	 */
	.post(
		'/',
		async ({ body, set, authType, session }) => {
			const { name, description, organizationId: organizationIdInput } = body;
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

			const id = crypto.randomUUID();

			const newPosition = {
				id,
				name,
				description: description ?? null,
				organizationId,
				clientId: null,
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
		async ({ params, body, set, authType, session }) => {
			const { id } = params;
			const activeOrgId =
				authType === 'session' ? (session?.activeOrganizationId ?? null) : null;

			// Check if position exists
			const existing = await db
				.select()
				.from(jobPosition)
				.where(eq(jobPosition.id, id))
				.limit(1);

			if (!existing[0]) {
				set.status = 404;
				return { error: 'Job position not found' };
			}

			if (
				activeOrgId &&
				existing[0].organizationId &&
				existing[0].organizationId !== activeOrgId
			) {
				set.status = 403;
				return { error: 'You do not have access to this job position' };
			}

			// Only update if there are fields to update
			if (Object.keys(body).length === 0) {
				return { data: existing[0] };
			}

			await db.update(jobPosition).set(body).where(eq(jobPosition.id, id));

			// Fetch updated record
			const updated = await db
				.select()
				.from(jobPosition)
				.where(eq(jobPosition.id, id))
				.limit(1);

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
		async ({ params, set, authType, session }) => {
			const { id } = params;
			const activeOrgId =
				authType === 'session' ? (session?.activeOrganizationId ?? null) : null;

			// Check if position exists
			const existing = await db
				.select()
				.from(jobPosition)
				.where(eq(jobPosition.id, id))
				.limit(1);

			if (!existing[0]) {
				set.status = 404;
				return { error: 'Job position not found' };
			}

			if (
				activeOrgId &&
				existing[0].organizationId &&
				existing[0].organizationId !== activeOrgId
			) {
				set.status = 403;
				return { error: 'You do not have access to this job position' };
			}

			await db.delete(jobPosition).where(eq(jobPosition.id, id));

			return { message: 'Job position deleted successfully' };
		},
		{
			params: idParamSchema,
		},
	);
