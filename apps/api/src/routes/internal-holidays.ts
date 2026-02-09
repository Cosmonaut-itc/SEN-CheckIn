import { Elysia } from 'elysia';

import { internalHolidaySyncSchema } from '../schemas/payroll-holidays.js';
import {
	cleanupHolidayHistory,
	getAllOrganizationIdsForHolidaySync,
	resolveSyncYears,
	syncOrganizationHolidayCalendar,
} from '../services/holidays.js';
import { buildErrorResponse } from '../utils/error-response.js';

const INTERNAL_SYNC_TOKEN = process.env.INTERNAL_HOLIDAYS_SYNC_TOKEN ?? process.env.INTERNAL_API_TOKEN;

/**
 * Validates the internal scheduler token.
 *
 * @param headerToken - Token from request headers
 * @returns True when token is valid
 */
function isValidInternalToken(headerToken: string | null): boolean {
	if (!INTERNAL_SYNC_TOKEN) {
		return false;
	}
	return headerToken === INTERNAL_SYNC_TOKEN;
}

/**
 * Internal holiday routes used by scheduler/cron jobs.
 */
export const internalHolidayRoutes = new Elysia({ prefix: '/internal/holidays' }).post(
	'/sync',
	async ({ body, request, set }) => {
		const headerToken = request.headers.get('x-internal-token');
		if (!isValidInternalToken(headerToken)) {
			set.status = 401;
			return buildErrorResponse('Invalid internal token', 401);
		}

		const years = resolveSyncYears(body.years);

		if (body.organizationId) {
			const result = await syncOrganizationHolidayCalendar({
				organizationId: body.organizationId,
				years,
				requestedByUserId: null,
			});
			await cleanupHolidayHistory({ organizationId: body.organizationId });
			return { data: { mode: 'single', results: [result] } };
		}

		const organizationIds = await getAllOrganizationIdsForHolidaySync();
		const results = [];
		for (const organizationId of organizationIds) {
			const result = await syncOrganizationHolidayCalendar({
				organizationId,
				years,
				requestedByUserId: null,
			});
			results.push(result);
		}

		await cleanupHolidayHistory({});
		return { data: { mode: 'global', results } };
	},
	{ body: internalHolidaySyncSchema },
);
