import { Elysia } from 'elysia';
import crypto from 'node:crypto';
import { and, eq, ilike, or, type SQL } from 'drizzle-orm';

import db from '../db/index.js';
import { jobPosition, organization } from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { hasOrganizationAccess, resolveOrganizationId } from '../utils/organization.js';
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
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			set,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
		}) => {
			const { limit, offset, organizationId: organizationIdQuery, search } = query;
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: organizationIdQuery ?? null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
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
				.select()
				.from(jobPosition)
				.where(eq(jobPosition.id, id))
				.limit(1);

			const record = results[0];
			if (!record) {
				set.status = 404;
				return buildErrorResponse('Job position not found', 404);
			}

			// Enforce organization scoping
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
				return buildErrorResponse('You do not have access to this job position', 403);
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
				name,
				description,
				organizationId: organizationIdInput,
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
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			// Verify organization exists
			const organizationExists = await db
				.select()
				.from(organization)
				.where(eq(organization.id, organizationId))
				.limit(1);

			if (!organizationExists[0]) {
				set.status = 400;
				return buildErrorResponse('Organization not found', 400);
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

			// Check if position exists
			const existing = await db
				.select()
				.from(jobPosition)
				.where(eq(jobPosition.id, id))
				.limit(1);

			if (!existing[0]) {
				set.status = 404;
				return buildErrorResponse('Job position not found', 404);
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
				return buildErrorResponse('You do not have access to this job position', 403);
			}

			const resolvedOrganizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: existing[0].organizationId,
			});

			if (!resolvedOrganizationId) {
				set.status = 403;
				return buildErrorResponse('Organization is required or not permitted', 403);
			}

			// Only update if there are fields to update
			if (Object.keys(body).length === 0) {
				return { data: existing[0] };
			}

			const updatePayload: Partial<typeof jobPosition.$inferInsert> = {};
			if (body.name !== undefined) {
				updatePayload.name = body.name;
			}
			if (body.description !== undefined) {
				updatePayload.description = body.description;
			}

			await db.update(jobPosition).set(updatePayload).where(eq(jobPosition.id, id));

			// Fetch updated record
			const updated = await db
				.select()
				.from(jobPosition)
				.where(eq(jobPosition.id, id))
				.limit(1);

			return {
				data: updated[0],
			};
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
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			// Check if position exists
			const existing = await db
				.select()
				.from(jobPosition)
				.where(eq(jobPosition.id, id))
				.limit(1);

			if (!existing[0]) {
				set.status = 404;
				return buildErrorResponse('Job position not found', 404);
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
				return buildErrorResponse('You do not have access to this job position', 403);
			}

			await db.delete(jobPosition).where(eq(jobPosition.id, id));

			return { message: 'Job position deleted successfully' };
		},
		{
			params: idParamSchema,
		},
	);
