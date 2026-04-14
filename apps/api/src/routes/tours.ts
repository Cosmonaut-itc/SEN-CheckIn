import { and, eq } from 'drizzle-orm';
import { Elysia } from 'elysia';

import db from '../db/index.js';
import { tourProgress } from '../db/schema.js';
import { completeTourBodySchema, tourIdParamSchema } from '../schemas/tours.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { resolveOrganizationId } from '../utils/organization.js';

/**
 * Tour progress routes for tracking guided tour completion.
 *
 * @module routes/tours
 */
export const tourRoutes = new Elysia({ prefix: '/tours' })
	.use(combinedAuthPlugin)

	/**
	 * Get all tour progress for the current user in the active organization.
	 *
	 * @route GET /tours/progress
	 */
	.get('/progress', async ({
		authType,
		session,
		sessionOrganizationIds,
		set,
		apiKeyOrganizationId,
		apiKeyOrganizationIds,
	}) => {
		const userId = authType === 'session' ? session?.userId ?? null : null;
		if (!userId) {
			set.status = 401;
			return buildErrorResponse('Session auth required', 401);
		}

		const organizationId = resolveOrganizationId({
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			requestedOrganizationId: null,
		});

		if (!organizationId) {
			set.status = 400;
			return buildErrorResponse('Organization is required', 400);
		}

		const results = await db
			.select({
				tourId: tourProgress.tourId,
				status: tourProgress.status,
				completedAt: tourProgress.completedAt,
			})
			.from(tourProgress)
			.where(
				and(
					eq(tourProgress.userId, userId),
					eq(tourProgress.organizationId, organizationId),
				),
			);

		return { data: { tours: results } };
	})

	/**
	 * Mark a tour as completed or skipped.
	 *
	 * @route POST /tours/:tourId/complete
	 */
	.post('/:tourId/complete', async ({
		params,
		body,
		authType,
		session,
		sessionOrganizationIds,
		set,
		apiKeyOrganizationId,
		apiKeyOrganizationIds,
	}) => {
		const userId = authType === 'session' ? session?.userId ?? null : null;
		if (!userId) {
			set.status = 401;
			return buildErrorResponse('Session auth required', 401);
		}

		const organizationId = resolveOrganizationId({
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			requestedOrganizationId: null,
		});

		if (!organizationId) {
			set.status = 400;
			return buildErrorResponse('Organization is required', 400);
		}

		await db
			.insert(tourProgress)
			.values({
				userId,
				organizationId,
				tourId: params.tourId,
				status: body.status,
			})
			.onConflictDoUpdate({
				target: [tourProgress.userId, tourProgress.organizationId, tourProgress.tourId],
				set: {
					status: body.status,
					completedAt: new Date(),
				},
			});

		return {
			data: {
				tourId: params.tourId,
				status: body.status,
			},
		};
	}, {
		params: tourIdParamSchema,
		body: completeTourBodySchema,
	})

	/**
	 * Reset a single tour progress entry.
	 *
	 * @route DELETE /tours/:tourId/progress
	 */
	.delete('/:tourId/progress', async ({
		params,
		authType,
		session,
		sessionOrganizationIds,
		set,
		apiKeyOrganizationId,
		apiKeyOrganizationIds,
	}) => {
		const userId = authType === 'session' ? session?.userId ?? null : null;
		if (!userId) {
			set.status = 401;
			return buildErrorResponse('Session auth required', 401);
		}

		const organizationId = resolveOrganizationId({
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			requestedOrganizationId: null,
		});

		if (!organizationId) {
			set.status = 400;
			return buildErrorResponse('Organization is required', 400);
		}

		await db
			.delete(tourProgress)
			.where(
				and(
					eq(tourProgress.userId, userId),
					eq(tourProgress.organizationId, organizationId),
					eq(tourProgress.tourId, params.tourId),
				),
			);

		return {
			data: {
				tourId: params.tourId,
				deleted: true,
			},
		};
	}, {
		params: tourIdParamSchema,
	});
