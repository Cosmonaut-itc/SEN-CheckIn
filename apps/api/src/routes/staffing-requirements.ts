import { type SQL, and, count, eq, ne } from 'drizzle-orm';
import { Elysia } from 'elysia';

import db from '../db/index.js';
import { jobPosition, location, organization, staffingRequirement } from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import {
	createStaffingRequirementSchema,
	idParamSchema,
	staffingRequirementQuerySchema,
	updateStaffingRequirementSchema,
} from '../schemas/crud.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { hasOrganizationAccess, resolveOrganizationId } from '../utils/organization.js';

type StaffingRequirementInsert = typeof staffingRequirement.$inferInsert;
type StaffingRequirementSelect = typeof staffingRequirement.$inferSelect;

const STAFFING_REQUIREMENT_UNIQUE_INDEX = 'staffing_requirement_org_location_position_uniq';

/**
 * Detects a duplicate staffing requirement unique-constraint error.
 *
 * @param error - Unknown database error
 * @returns True when the error matches the staffing requirement unique index
 */
function isDuplicateStaffingRequirementError(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false;
	}

	const wrappedCause = (error as { cause?: unknown }).cause;
	const code =
		(error as { code?: unknown }).code ??
		(wrappedCause && typeof wrappedCause === 'object'
			? (wrappedCause as { code?: unknown }).code
			: undefined);
	const constraint =
		(error as { constraint?: unknown }).constraint ??
		(wrappedCause && typeof wrappedCause === 'object'
			? (wrappedCause as { constraint?: unknown }).constraint
			: undefined);

	return code === '23505' && constraint === STAFFING_REQUIREMENT_UNIQUE_INDEX;
}

/**
 * Checks whether an organization exists.
 *
 * @param organizationId - Organization identifier to verify
 * @returns True when the organization exists
 */
async function organizationExists(organizationId: string): Promise<boolean> {
	const rows = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.id, organizationId))
		.limit(1);

	return Boolean(rows[0]);
}

/**
 * Checks whether a location belongs to the target organization.
 *
 * @param locationId - Location identifier to verify
 * @param organizationId - Organization identifier that must own the location
 * @returns True when the location belongs to the organization
 */
async function locationBelongsToOrganization(
	locationId: string,
	organizationId: string,
): Promise<boolean> {
	const rows = await db
		.select({ id: location.id })
		.from(location)
		.where(and(eq(location.id, locationId), eq(location.organizationId, organizationId)))
		.limit(1);

	return Boolean(rows[0]);
}

/**
 * Checks whether a job position belongs to the target organization.
 *
 * @param jobPositionId - Job position identifier to verify
 * @param organizationId - Organization identifier that must own the job position
 * @returns True when the job position belongs to the organization
 */
async function jobPositionBelongsToOrganization(
	jobPositionId: string,
	organizationId: string,
): Promise<boolean> {
	const rows = await db
		.select({ id: jobPosition.id })
		.from(jobPosition)
		.where(
			and(eq(jobPosition.id, jobPositionId), eq(jobPosition.organizationId, organizationId)),
		)
		.limit(1);

	return Boolean(rows[0]);
}

/**
 * Checks whether a staffing requirement already exists for the same scoped tuple.
 *
 * @param organizationId - Organization identifier
 * @param locationId - Location identifier
 * @param jobPositionId - Job position identifier
 * @param excludeId - Existing requirement ID to ignore during updates
 * @returns True when another matching requirement exists
 */
async function staffingRequirementExists(
	organizationId: string,
	locationId: string,
	jobPositionId: string,
	excludeId?: string,
): Promise<boolean> {
	const conditions: [SQL<unknown>, ...SQL<unknown>[]] = [
		eq(staffingRequirement.organizationId, organizationId),
		eq(staffingRequirement.locationId, locationId),
		eq(staffingRequirement.jobPositionId, jobPositionId),
	];

	if (excludeId) {
		conditions.push(ne(staffingRequirement.id, excludeId));
	}

	const rows = await db
		.select({ id: staffingRequirement.id })
		.from(staffingRequirement)
		.where(and(...conditions))
		.limit(1);

	return Boolean(rows[0]);
}

/**
 * Fetches a staffing requirement by ID.
 *
 * @param id - Staffing requirement identifier
 * @returns Staffing requirement record or null when missing
 */
async function findStaffingRequirementById(id: string): Promise<StaffingRequirementSelect | null> {
	const rows = await db
		.select()
		.from(staffingRequirement)
		.where(eq(staffingRequirement.id, id))
		.limit(1);

	return rows[0] ?? null;
}

/**
 * Staffing requirement routes for minimum staffing by organization, location, and job position.
 */
export const staffingRequirementRoutes = new Elysia({ prefix: '/staffing-requirements' })
	.use(combinedAuthPlugin)
	/**
	 * List staffing requirements with organization scoping and optional filters.
	 *
	 * @route GET /staffing-requirements
	 * @param query.limit - Maximum number of results
	 * @param query.offset - Number of results to skip
	 * @param query.organizationId - Optional organization filter
	 * @param query.locationId - Optional location filter
	 * @param query.jobPositionId - Optional job position filter
	 * @returns Staffing requirement records with pagination
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
				organizationId: organizationIdQuery,
				locationId,
				jobPositionId,
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
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const conditions: [SQL<unknown>, ...SQL<unknown>[]] = [
				eq(staffingRequirement.organizationId, organizationId),
			];
			if (locationId) {
				conditions.push(eq(staffingRequirement.locationId, locationId));
			}
			if (jobPositionId) {
				conditions.push(eq(staffingRequirement.jobPositionId, jobPositionId));
			}

			const whereClause = and(...conditions)!;
			const results = await db
				.select()
				.from(staffingRequirement)
				.where(whereClause)
				.limit(limit)
				.offset(offset)
				.orderBy(staffingRequirement.locationId, staffingRequirement.jobPositionId);
			const countResult = await db
				.select({ total: count() })
				.from(staffingRequirement)
				.where(whereClause);
			const total = Number(countResult[0]?.total ?? 0);

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
			query: staffingRequirementQuerySchema,
		},
	)

	/**
	 * Get a single staffing requirement by ID.
	 *
	 * @route GET /staffing-requirements/:id
	 * @param id - Staffing requirement UUID
	 * @returns Staffing requirement record or an error response
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
			const record = await findStaffingRequirementById(params.id);

			if (!record) {
				set.status = 404;
				return buildErrorResponse('Staffing requirement not found', 404);
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
				return buildErrorResponse(
					'You do not have access to this staffing requirement',
					403,
				);
			}

			return { data: record };
		},
		{
			params: idParamSchema,
		},
	)

	/**
	 * Create a staffing requirement.
	 *
	 * @route POST /staffing-requirements
	 * @param body.organizationId - Organization ID
	 * @param body.locationId - Location ID owned by the organization
	 * @param body.jobPositionId - Job position ID owned by the organization
	 * @param body.minimumRequired - Minimum required staffing count
	 * @returns Created staffing requirement record
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
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: body.organizationId ?? null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			if (!(await organizationExists(organizationId))) {
				set.status = 400;
				return buildErrorResponse('Organization not found', 400);
			}

			if (!(await locationBelongsToOrganization(body.locationId, organizationId))) {
				set.status = 400;
				return buildErrorResponse('Location not found for organization', 400);
			}

			if (!(await jobPositionBelongsToOrganization(body.jobPositionId, organizationId))) {
				set.status = 400;
				return buildErrorResponse('Job position not found for organization', 400);
			}

			if (
				await staffingRequirementExists(organizationId, body.locationId, body.jobPositionId)
			) {
				set.status = 409;
				return buildErrorResponse('Staffing requirement already exists', 409);
			}

			const newRequirement: StaffingRequirementInsert = {
				organizationId,
				locationId: body.locationId,
				jobPositionId: body.jobPositionId,
				minimumRequired: body.minimumRequired,
			};
			try {
				const [created] = await db
					.insert(staffingRequirement)
					.values(newRequirement)
					.returning();

				set.status = 201;
				return { data: created };
			} catch (error) {
				if (isDuplicateStaffingRequirementError(error)) {
					set.status = 409;
					return buildErrorResponse('Staffing requirement already exists', 409);
				}

				throw error;
			}
		},
		{
			body: createStaffingRequirementSchema,
		},
	)

	/**
	 * Update a staffing requirement.
	 *
	 * @route PUT /staffing-requirements/:id
	 * @param id - Staffing requirement UUID
	 * @param body - Fields to update
	 * @returns Updated staffing requirement record
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
			const existing = await findStaffingRequirementById(params.id);

			if (!existing) {
				set.status = 404;
				return buildErrorResponse('Staffing requirement not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					existing.organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse(
					'You do not have access to this staffing requirement',
					403,
				);
			}

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: existing.organizationId,
			});

			if (!organizationId) {
				set.status = 403;
				return buildErrorResponse('Organization is required or not permitted', 403);
			}

			if (Object.keys(body).length === 0) {
				return { data: existing };
			}

			const nextLocationId = body.locationId ?? existing.locationId;
			const nextJobPositionId = body.jobPositionId ?? existing.jobPositionId;

			if (!(await locationBelongsToOrganization(nextLocationId, organizationId))) {
				set.status = 400;
				return buildErrorResponse('Location not found for organization', 400);
			}

			if (!(await jobPositionBelongsToOrganization(nextJobPositionId, organizationId))) {
				set.status = 400;
				return buildErrorResponse('Job position not found for organization', 400);
			}

			if (
				await staffingRequirementExists(
					organizationId,
					nextLocationId,
					nextJobPositionId,
					existing.id,
				)
			) {
				set.status = 409;
				return buildErrorResponse('Staffing requirement already exists', 409);
			}

			const updatePayload: Partial<StaffingRequirementInsert> = { updatedAt: new Date() };
			if (body.locationId !== undefined) {
				updatePayload.locationId = body.locationId;
			}
			if (body.jobPositionId !== undefined) {
				updatePayload.jobPositionId = body.jobPositionId;
			}
			if (body.minimumRequired !== undefined) {
				updatePayload.minimumRequired = body.minimumRequired;
			}

			try {
				const [updated] = await db
					.update(staffingRequirement)
					.set(updatePayload)
					.where(eq(staffingRequirement.id, existing.id))
					.returning();

				return { data: updated };
			} catch (error) {
				if (isDuplicateStaffingRequirementError(error)) {
					set.status = 409;
					return buildErrorResponse('Staffing requirement already exists', 409);
				}

				throw error;
			}
		},
		{
			params: idParamSchema,
			body: updateStaffingRequirementSchema,
		},
	)

	/**
	 * Delete a staffing requirement.
	 *
	 * @route DELETE /staffing-requirements/:id
	 * @param id - Staffing requirement UUID
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
			const existing = await findStaffingRequirementById(params.id);

			if (!existing) {
				set.status = 404;
				return buildErrorResponse('Staffing requirement not found', 404);
			}

			if (
				!hasOrganizationAccess(
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
					existing.organizationId,
				)
			) {
				set.status = 403;
				return buildErrorResponse(
					'You do not have access to this staffing requirement',
					403,
				);
			}

			await db.delete(staffingRequirement).where(eq(staffingRequirement.id, existing.id));

			return { message: 'Staffing requirement deleted successfully' };
		},
		{
			params: idParamSchema,
		},
	);
