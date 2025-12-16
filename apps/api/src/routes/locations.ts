import { type SQL, and, eq, ilike, or } from 'drizzle-orm';
import { Elysia } from 'elysia';

import db from '../db/index.js';
import { location, organization } from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import {
	createLocationSchema,
	idParamSchema,
	locationQuerySchema,
	updateLocationSchema,
} from '../schemas/crud.js';
import { hasOrganizationAccess, resolveOrganizationId } from '../utils/organization.js';

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
	.use(combinedAuthPlugin)
	/**
	 * List all locations with pagination and organization scoping.
	 *
	 * @route GET /locations
	 * @param query.limit - Maximum number of results (default: 50)
	 * @param query.offset - Number of results to skip (default: 0)
	 * @param query.organizationId - Filter by organization ID (API key flow only)
	 * @returns Array of location records
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
				set.status = authType === 'apiKey' ? 403 : 400;
				return { error: 'Organization is required or not permitted' };
			}

			let baseQuery = db.select().from(location);
			const conditions: [SQL<unknown>, ...SQL<unknown>[]] = [
				eq(location.organizationId, organizationId),
			];

			if (search) {
				const searchClause = or(
					ilike(location.name, `%${search}%`),
					ilike(location.code, `%${search}%`),
				)!;
				conditions.push(searchClause);
			}

			const whereClause = and(...conditions)!;
			baseQuery = baseQuery.where(whereClause) as typeof baseQuery;

			const results = await baseQuery.limit(limit).offset(offset).orderBy(location.name);

			// Get total count
			let countQuery = db.select().from(location);
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
			query: locationQuerySchema,
		},
	)

	/**
	 * Get a single location by ID.
	 *
	 * @route GET /locations/:id
	 * @param id - Location UUID
	 * @returns Location record or 404/403 error
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

			const results = await db.select().from(location).where(eq(location.id, id)).limit(1);

			const record = results[0];
			if (!record) {
				set.status = 404;
				return { error: 'Location not found' };
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
				return { error: 'You do not have access to this location' };
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
	 * @param body.organizationId - Organization ID this location belongs to (API key flow only)
	 * @returns Created location record
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
				code,
				address,
				geographicZone,
				timeZone,
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

			// Check if code is unique
			const codeExists = await db
				.select()
				.from(location)
				.where(eq(location.code, code))
				.limit(1);

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
				organizationId,
				clientId: null,
				geographicZone: geographicZone ?? 'GENERAL',
				timeZone: timeZone ?? 'America/Mexico_City',
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

			// Check if location exists
			const existing = await db.select().from(location).where(eq(location.id, id)).limit(1);

			if (!existing[0]) {
				set.status = 404;
				return { error: 'Location not found' };
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
				return { error: 'You do not have access to this location' };
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
				return { error: 'Organization is required or not permitted' };
			}

			// Check if code is unique (if being updated)
			if (body.code && body.code !== existing[0].code) {
				const codeExists = await db
					.select()
					.from(location)
					.where(eq(location.code, body.code))
					.limit(1);

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
		async ({
			params,
			set,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
		}) => {
			const { id } = params;

			// Check if location exists
			const existing = await db.select().from(location).where(eq(location.id, id)).limit(1);

			if (!existing[0]) {
				set.status = 404;
				return { error: 'Location not found' };
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
				return { error: 'You do not have access to this location' };
			}

			await db.delete(location).where(eq(location.id, id));

			return { message: 'Location deleted successfully' };
		},
		{
			params: idParamSchema,
		},
	);
