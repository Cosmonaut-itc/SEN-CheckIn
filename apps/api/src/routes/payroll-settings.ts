import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';

import db from '../db/index.js';
import { payrollSetting } from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { resolveOrganizationId } from '../utils/organization.js';
import { payrollSettingsSchema } from '../schemas/payroll.js';

/**
 * Payroll settings routes for per-organization configuration.
 */
export const payrollSettingsRoutes = new Elysia({ prefix: '/payroll-settings' })
	.use(combinedAuthPlugin)
	/**
	 * Get payroll settings for the active organization.
	 *
	 * @returns Payroll settings record (creates default if missing)
	 */
	.get('/', async ({ authType, session, sessionOrganizationIds, apiKeyOrganizationId, apiKeyOrganizationIds, set }) => {
		const organizationId = resolveOrganizationId({
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			requestedOrganizationId: null,
		});

		if (!organizationId) {
			set.status = authType === 'apiKey' ? 403 : 400;
			return { error: 'Organization is required or not permitted' };
		}

		const existing = await db
			.select()
			.from(payrollSetting)
			.where(eq(payrollSetting.organizationId, organizationId))
			.limit(1);

		if (existing[0]) {
			return { data: existing[0] };
		}

		// Create a default configuration if none exists
		const defaultSetting = {
			organizationId,
			weekStartDay: 1,
		};

		const [insertedSetting] = await db.insert(payrollSetting).values(defaultSetting).returning();

		return { data: insertedSetting };
	})
	/**
	 * Upsert payroll settings for the active organization.
	 *
	 * @returns Saved payroll settings
	 */
	.put(
		'/',
		async ({
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
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
				set.status = authType === 'apiKey' ? 403 : 400;
				return { error: 'Organization is required or not permitted' };
			}

			const updatePayload = {
				weekStartDay: body.weekStartDay,
				organizationId,
			};

			const existing = await db
				.select()
				.from(payrollSetting)
				.where(eq(payrollSetting.organizationId, organizationId))
				.limit(1);

			if (existing[0]) {
				await db
					.update(payrollSetting)
					.set({ weekStartDay: updatePayload.weekStartDay })
					.where(eq(payrollSetting.organizationId, organizationId));
			} else {
				await db.insert(payrollSetting).values(updatePayload);
			}

			const saved = await db
				.select()
				.from(payrollSetting)
				.where(eq(payrollSetting.organizationId, organizationId))
				.limit(1);

			return { data: saved[0] };
		},
		{
			body: payrollSettingsSchema,
		},
	);

