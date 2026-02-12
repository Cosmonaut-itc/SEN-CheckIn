import { Elysia } from 'elysia';
import type { AuthSession } from '../plugins/auth.js';

import {
	buildHolidayCsvExport,
	createCustomHolidayEntries,
	getHolidaySyncStatus,
	importHolidayCsv,
	isOrganizationAdmin,
	listHolidayEntries,
	rejectHolidaySyncRun,
	resolveSyncYears,
	syncOrganizationHolidayCalendar,
	updateHolidayEntry,
	approveHolidaySyncRun,
} from '../services/holidays.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { resolveOrganizationId } from '../utils/organization.js';
import { idParamSchema } from '../schemas/crud.js';
import {
	holidayCsvImportSchema,
	holidayCustomCreateSchema,
	holidayListQuerySchema,
	holidaySyncDecisionSchema,
	holidaySyncSchema,
	holidayUpdateSchema,
} from '../schemas/payroll-holidays.js';

/**
 * Resolves organization and validates access for holiday routes.
 *
 * @param args - Auth and organization args
 * @returns Organization identifier when allowed
 */
function resolveHolidayOrganization(args: {
	authType: 'session' | 'apiKey';
	session: AuthSession | null;
	sessionOrganizationIds: string[];
	apiKeyOrganizationId: string | null;
	apiKeyOrganizationIds: string[];
	requestedOrganizationId?: string | null;
}): string | null {
	return resolveOrganizationId({
		authType: args.authType,
		session: args.session,
		sessionOrganizationIds: args.sessionOrganizationIds,
		apiKeyOrganizationId: args.apiKeyOrganizationId,
		apiKeyOrganizationIds: args.apiKeyOrganizationIds,
		requestedOrganizationId: args.requestedOrganizationId ?? null,
	});
}

/**
 * Payroll holidays routes.
 */
export const payrollHolidaysRoutes = new Elysia({ prefix: '/payroll-settings/holidays' })
	.use(combinedAuthPlugin)
	/**
	 * Lists holiday entries by year/source/status/kind.
	 */
	.get(
		'/',
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveHolidayOrganization({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: query.organizationId ?? null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const data = await listHolidayEntries({
				organizationId,
				year: query.year,
				source: query.source,
				status: query.status,
				kind: query.kind,
			});

			return { data };
		},
		{ query: holidayListQuerySchema },
	)
	/**
	 * Creates custom holiday entries.
	 */
	.post(
		'/custom',
		async ({
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveHolidayOrganization({
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
			if (authType !== 'session' || !session) {
				set.status = 403;
				return buildErrorResponse('Only owner/admin can modify holidays', 403);
			}

			const isAdmin = await isOrganizationAdmin({
				userId: session.userId,
				organizationId,
			});
			if (!isAdmin) {
				set.status = 403;
				return buildErrorResponse('Only owner/admin can modify holidays', 403);
			}

			const data = await createCustomHolidayEntries({
				organizationId,
				dateKey: body.dateKey,
				name: body.name,
				kind: body.kind ?? 'MANDATORY',
				recurrence: body.recurrence ?? 'ONE_TIME',
				legalReference: body.legalReference,
				actorUserId: session.userId,
			});

			return { data };
		},
		{ body: holidayCustomCreateSchema },
	)
	/**
	 * Updates/deactivates a holiday entry.
	 */
	.patch(
		'/:id',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveHolidayOrganization({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});
			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}
			if (authType !== 'session' || !session) {
				set.status = 403;
				return buildErrorResponse('Only owner/admin can modify holidays', 403);
			}

			const isAdmin = await isOrganizationAdmin({
				userId: session.userId,
				organizationId,
			});
			if (!isAdmin) {
				set.status = 403;
				return buildErrorResponse('Only owner/admin can modify holidays', 403);
			}

			try {
				const data = await updateHolidayEntry({
					organizationId,
					holidayId: params.id,
					actorUserId: session.userId,
					reason: body.reason,
					name: body.name,
					kind: body.kind,
					dateKey: body.dateKey,
					active: body.active,
					legalReference: body.legalReference,
				});
				return { data };
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Failed to update holiday entry',
					400,
				);
			}
		},
		{ params: idParamSchema, body: holidayUpdateSchema },
	)
	/**
	 * Imports holiday entries from CSV.
	 */
	.post(
		'/import/csv',
		async ({
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveHolidayOrganization({
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
			if (authType !== 'session' || !session) {
				set.status = 403;
				return buildErrorResponse('Only owner/admin can import holidays', 403);
			}

			const isAdmin = await isOrganizationAdmin({
				userId: session.userId,
				organizationId,
			});
			if (!isAdmin) {
				set.status = 403;
				return buildErrorResponse('Only owner/admin can import holidays', 403);
			}

			try {
				const data = await importHolidayCsv({
					organizationId,
					csvContent: body.csvContent,
					actorUserId: session.userId,
				});
				return { data };
			} catch (error) {
				set.status = 400;
				return buildErrorResponse(
					error instanceof Error ? error.message : 'Failed to import CSV',
					400,
				);
			}
		},
		{ body: holidayCsvImportSchema },
	)
	/**
	 * Exports holidays as CSV with current filters.
	 */
	.get(
		'/export/csv',
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveHolidayOrganization({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: query.organizationId ?? null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const rows = await listHolidayEntries({
				organizationId,
				year: query.year,
				source: query.source,
				status: query.status,
				kind: query.kind,
			});
			const csvContent = buildHolidayCsvExport(rows);

			return {
				data: {
					count: rows.length,
					fileName: `feriados-${organizationId}-${query.year ?? 'all'}.csv`,
					csvContent,
				},
			};
		},
		{ query: holidayListQuerySchema },
	)
	/**
	 * Triggers manual provider sync.
	 */
	.post(
		'/sync',
		async ({
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveHolidayOrganization({
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
			if (authType !== 'session' || !session) {
				set.status = 403;
				return buildErrorResponse('Only owner/admin can synchronize holidays', 403);
			}

			const isAdmin = await isOrganizationAdmin({
				userId: session.userId,
				organizationId,
			});
			if (!isAdmin) {
				set.status = 403;
				return buildErrorResponse('Only owner/admin can synchronize holidays', 403);
			}

			const years = resolveSyncYears(
				body.years && body.years.length > 0
					? body.years
					: body.year
						? [body.year]
						: undefined,
			);

			const data = await syncOrganizationHolidayCalendar({
				organizationId,
				years,
				requestedByUserId: session.userId,
			});

			return { data };
		},
		{ body: holidaySyncSchema },
	)
	/**
	 * Approves all pending entries in a sync run.
	 */
	.post(
		'/sync/:runId/approve',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveHolidayOrganization({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});
			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}
			if (authType !== 'session' || !session) {
				set.status = 403;
				return buildErrorResponse('Only owner/admin can approve sync runs', 403);
			}

			const isAdmin = await isOrganizationAdmin({
				userId: session.userId,
				organizationId,
			});
			if (!isAdmin) {
				set.status = 403;
				return buildErrorResponse('Only owner/admin can approve sync runs', 403);
			}

			const approvedCount = await approveHolidaySyncRun({
				runId: params.runId,
				organizationId,
				actorUserId: session.userId,
				reason: body.reason,
			});

			return { data: { runId: params.runId, approvedCount } };
		},
		{
			body: holidaySyncDecisionSchema,
		},
	)
	/**
	 * Rejects all pending entries in a sync run.
	 */
	.post(
		'/sync/:runId/reject',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveHolidayOrganization({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});
			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}
			if (authType !== 'session' || !session) {
				set.status = 403;
				return buildErrorResponse('Only owner/admin can reject sync runs', 403);
			}

			const isAdmin = await isOrganizationAdmin({
				userId: session.userId,
				organizationId,
			});
			if (!isAdmin) {
				set.status = 403;
				return buildErrorResponse('Only owner/admin can reject sync runs', 403);
			}

			const rejectedCount = await rejectHolidaySyncRun({
				runId: params.runId,
				organizationId,
				actorUserId: session.userId,
				reason: body.reason,
			});

			return { data: { runId: params.runId, rejectedCount } };
		},
		{
			body: holidaySyncDecisionSchema,
		},
	)
	/**
	 * Returns latest sync status for the active organization.
	 */
	.get(
		'/sync/status',
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveHolidayOrganization({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: query.organizationId ?? null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const data = await getHolidaySyncStatus(organizationId);
			return { data };
		},
	);
