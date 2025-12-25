import { Elysia } from 'elysia';
import crypto from 'node:crypto';
import { and, eq, ilike, or, type SQL } from 'drizzle-orm';

import db from '../db/index.js';
import { payrollSetting, scheduleTemplate, scheduleTemplateDay } from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { hasOrganizationAccess, resolveOrganizationId } from '../utils/organization.js';
import {
	createScheduleTemplateSchema,
	scheduleTemplateQuerySchema,
	updateScheduleTemplateSchema,
} from '../schemas/schedules.js';
import { idParamSchema } from '../schemas/crud.js';
import { validateScheduleDays } from '../utils/schedule-validator.js';

type TemplateInsert = typeof scheduleTemplate.$inferInsert;
type TemplateDayInsert = typeof scheduleTemplateDay.$inferInsert;

/**
 * Retrieves overtime enforcement setting for the organization.
 *
 * @param organizationId - Organization identifier
 * @returns Overtime enforcement mode
 */
async function getOvertimeEnforcement(organizationId: string): Promise<'WARN' | 'BLOCK'> {
	const existing = await db
		.select()
		.from(payrollSetting)
		.where(eq(payrollSetting.organizationId, organizationId))
		.limit(1);
	return existing[0]?.overtimeEnforcement ?? 'WARN';
}

/**
 * Normalizes template day input into rows for persistence.
 *
 * @param templateId - Parent template identifier
 * @param days - Day configurations to persist
 * @returns Normalized rows for insertion
 */
function buildTemplateDayRows(
	templateId: string,
	days: { dayOfWeek: number; startTime: string; endTime: string; isWorkingDay?: boolean }[],
): TemplateDayInsert[] {
	return days.map((day) => ({
		id: crypto.randomUUID(),
		templateId,
		dayOfWeek: day.dayOfWeek,
		startTime: day.startTime,
		endTime: day.endTime,
		isWorkingDay: day.isWorkingDay ?? true,
	}));
}

/**
 * Schedule template routes for CRUD operations with labor law validation.
 */
export const scheduleTemplateRoutes = new Elysia({ prefix: '/schedule-templates' })
	.use(combinedAuthPlugin)
	/**
	 * Lists schedule templates for the active organization with pagination.
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
			const { limit, offset, organizationId: orgQuery, search } = query;

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: orgQuery ?? null,
			});

			if (!organizationId) {
				set.status = authType === 'apiKey' ? 403 : 400;
				return { error: 'Organization is required or not permitted' };
			}

			const conditions: SQL<unknown>[] = [
				eq(scheduleTemplate.organizationId, organizationId),
			];
			const normalizedSearch = search?.trim();
			if (normalizedSearch) {
				conditions.push(
					or(
						ilike(scheduleTemplate.name, `%${normalizedSearch}%`),
						ilike(scheduleTemplate.description, `%${normalizedSearch}%`),
					)!,
				);
			}

			let baseQuery = db.select().from(scheduleTemplate);
			if (conditions.length > 0) {
				baseQuery = baseQuery.where(and(...conditions)) as typeof baseQuery;
			}

			const results = await baseQuery
				.limit(limit)
				.offset(offset)
				.orderBy(scheduleTemplate.name);

			let countQuery = db.select().from(scheduleTemplate);
			if (conditions.length > 0) {
				countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
			}
			const total = (await countQuery).length;

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
			query: scheduleTemplateQuerySchema,
		},
	)
	/**
	 * Gets a single schedule template with its day configuration.
	 */
	.get(
		'/:id',
		async ({
			params,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
			set,
		}) => {
			const { id } = params;

			const template = await db
				.select()
				.from(scheduleTemplate)
				.where(eq(scheduleTemplate.id, id))
				.limit(1);
			const record = template[0];

			if (!record) {
				set.status = 404;
				return { error: 'Schedule template not found' };
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
				return { error: 'You do not have access to this schedule template' };
			}

			const days = await db
				.select()
				.from(scheduleTemplateDay)
				.where(eq(scheduleTemplateDay.templateId, id))
				.orderBy(scheduleTemplateDay.dayOfWeek);

			return { data: { ...record, days } };
		},
		{
			params: idParamSchema,
		},
	)
	/**
	 * Creates a new schedule template and validates labor law limits.
	 */
	.post(
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
			const { name, description, shiftType, days, organizationId: orgInput } = body;

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: orgInput ?? null,
			});

			if (!organizationId) {
				set.status = authType === 'apiKey' ? 403 : 400;
				return { error: 'Organization is required or not permitted' };
			}

			const enforcement = await getOvertimeEnforcement(organizationId);
			const validation = validateScheduleDays({
				days,
				shiftType: shiftType ?? 'DIURNA',
				overtimeEnforcement: enforcement,
			});

			if (!validation.valid && enforcement === 'BLOCK') {
				set.status = 400;
				return { error: 'Schedule exceeds legal limits', validation };
			}

			const templateId = crypto.randomUUID();
			const newTemplate: TemplateInsert = {
				id: templateId,
				name,
				description: description ?? null,
				shiftType: shiftType ?? 'DIURNA',
				organizationId,
			};

			await db.insert(scheduleTemplate).values(newTemplate);
			const dayRows = buildTemplateDayRows(templateId, days);
			await db.insert(scheduleTemplateDay).values(dayRows);

			set.status = 201;
			return {
				data: { ...newTemplate, days: dayRows },
				validation,
			};
		},
		{
			body: createScheduleTemplateSchema,
		},
	)
	/**
	 * Updates an existing schedule template and its days.
	 */
	.put(
		'/:id',
		async ({
			params,
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
			set,
		}) => {
			const { id } = params;
			const template = await db
				.select()
				.from(scheduleTemplate)
				.where(eq(scheduleTemplate.id, id))
				.limit(1);
			const existing = template[0];

			if (!existing) {
				set.status = 404;
				return { error: 'Schedule template not found' };
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
				return { error: 'You do not have access to this schedule template' };
			}

			const resolvedShiftType = body.shiftType ?? existing.shiftType ?? 'DIURNA';
			const resolvedDays =
				body.days ??
				(await db
					.select()
					.from(scheduleTemplateDay)
					.where(eq(scheduleTemplateDay.templateId, id))
					.orderBy(scheduleTemplateDay.dayOfWeek));

			const enforcement = await getOvertimeEnforcement(existing.organizationId);
			const validation = validateScheduleDays({
				days: resolvedDays.map((day) => ({
					dayOfWeek: day.dayOfWeek,
					startTime: day.startTime,
					endTime: day.endTime,
					isWorkingDay: day.isWorkingDay ?? true,
				})),
				shiftType: resolvedShiftType,
				overtimeEnforcement: enforcement,
			});

			if (!validation.valid && enforcement === 'BLOCK') {
				set.status = 400;
				return { error: 'Schedule exceeds legal limits', validation };
			}

			const updatePayload: Partial<TemplateInsert> = {};
			if (body.name !== undefined) {
				updatePayload.name = body.name;
			}
			if (body.description !== undefined) {
				updatePayload.description = body.description;
			}
			if (body.shiftType !== undefined) {
				updatePayload.shiftType = body.shiftType;
			}

			if (Object.keys(updatePayload).length > 0) {
				await db
					.update(scheduleTemplate)
					.set(updatePayload)
					.where(eq(scheduleTemplate.id, id));
			}

			if (body.days !== undefined) {
				await db.delete(scheduleTemplateDay).where(eq(scheduleTemplateDay.templateId, id));
				const dayRows = buildTemplateDayRows(id, body.days);
				if (dayRows.length > 0) {
					await db.insert(scheduleTemplateDay).values(dayRows);
				}
			}

			const updatedTemplate = await db
				.select()
				.from(scheduleTemplate)
				.where(eq(scheduleTemplate.id, id))
				.limit(1);

			const updatedDays = await db
				.select()
				.from(scheduleTemplateDay)
				.where(eq(scheduleTemplateDay.templateId, id))
				.orderBy(scheduleTemplateDay.dayOfWeek);

			return { data: { ...updatedTemplate[0], days: updatedDays }, validation };
		},
		{
			body: updateScheduleTemplateSchema,
			params: idParamSchema,
		},
	)
	/**
	 * Deletes a schedule template and its day configuration.
	 */
	.delete(
		'/:id',
		async ({
			params,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
			set,
		}) => {
			const { id } = params;

			const template = await db
				.select()
				.from(scheduleTemplate)
				.where(eq(scheduleTemplate.id, id))
				.limit(1);
			const existing = template[0];

			if (!existing) {
				set.status = 404;
				return { error: 'Schedule template not found' };
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
				return { error: 'You do not have access to this schedule template' };
			}

			await db.delete(scheduleTemplate).where(eq(scheduleTemplate.id, id));

			return { message: 'Schedule template deleted successfully' };
		},
		{
			params: idParamSchema,
		},
	);
