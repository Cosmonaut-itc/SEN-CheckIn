import { Elysia } from 'elysia';
import { and, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';
import { eachDayOfInterval, endOfDay, format, isAfter, startOfDay } from 'date-fns';
import { z } from 'zod';

import db from '../db/index.js';
import {
	employee,
	employeeSchedule,
	payrollSetting,
	scheduleException,
	scheduleTemplate,
	scheduleTemplateDay,
} from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { buildErrorResponse } from '../utils/error-response.js';
import { resolveOrganizationId } from '../utils/organization.js';
import { calendarQuerySchema, scheduleTemplateDaySchema } from '../schemas/schedules.js';
import { shiftTypeEnum } from '../schemas/crud.js';
import { validateScheduleDays } from '../utils/schedule-validator.js';

type CalendarDay = {
	date: string;
	isWorkingDay: boolean;
	startTime: string | null;
	endTime: string | null;
	source: 'template' | 'manual' | 'exception' | 'none';
	exceptionType?: 'DAY_OFF' | 'MODIFIED' | 'EXTRA_DAY';
};

type CalendarEmployee = {
	employeeId: string;
	employeeName: string;
	locationId: string | null;
	scheduleTemplateId: string | null;
	shiftType: 'DIURNA' | 'NOCTURNA' | 'MIXTA';
	days: CalendarDay[];
};

/**
 * Fetches overtime enforcement for an organization.
 *
 * @param organizationId - Organization identifier
 * @returns Overtime enforcement behavior
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
 * Builds a map of template days keyed by template ID.
 *
 * @param templateIds - Template identifiers to fetch
 * @returns Map of templateId -> day rows
 */
async function loadTemplateDays(
	templateIds: string[],
): Promise<Map<string, (typeof scheduleTemplateDay.$inferSelect)[]>> {
	if (templateIds.length === 0) {
		return new Map();
	}

	const rows = await db
		.select()
		.from(scheduleTemplateDay)
		.where(inArray(scheduleTemplateDay.templateId, templateIds))
		.orderBy(scheduleTemplateDay.dayOfWeek);

	const map = new Map<string, (typeof scheduleTemplateDay.$inferSelect)[]>();
	for (const row of rows) {
		const current = map.get(row.templateId) ?? [];
		current.push(row);
		map.set(row.templateId, current);
	}
	return map;
}

/**
 * Builds a map of manual employee schedules keyed by employee ID.
 *
 * @param employeeIds - Employee identifiers
 * @returns Map of employeeId -> schedule rows
 */
async function loadEmployeeSchedules(
	employeeIds: string[],
): Promise<Map<string, (typeof employeeSchedule.$inferSelect)[]>> {
	if (employeeIds.length === 0) {
		return new Map();
	}

	const schedules = await db
		.select()
		.from(employeeSchedule)
		.where(inArray(employeeSchedule.employeeId, employeeIds));

	const map = new Map<string, (typeof employeeSchedule.$inferSelect)[]>();
	for (const row of schedules) {
		const current = map.get(row.employeeId) ?? [];
		current.push(row);
		map.set(row.employeeId, current);
	}
	return map;
}

/**
 * Builds a map of exceptions keyed by employeeId+date.
 *
 * @param employeeIds - Employee identifiers
 * @param startDate - Date range start
 * @param endDate - Date range end
 * @returns Map of composite key to exception row
 */
async function loadExceptions(
	employeeIds: string[],
	startDate: Date,
	endDate: Date,
): Promise<Map<string, typeof scheduleException.$inferSelect>> {
	if (employeeIds.length === 0) {
		return new Map();
	}

	const rows = await db
		.select()
		.from(scheduleException)
		.where(
			and(
				inArray(scheduleException.employeeId, employeeIds),
				gte(scheduleException.exceptionDate, startDate),
				lte(scheduleException.exceptionDate, endDate),
			)!,
		);

	const map = new Map<string, typeof scheduleException.$inferSelect>();
	for (const row of rows) {
		const key = `${row.employeeId}-${format(row.exceptionDate, 'yyyy-MM-dd')}`;
		map.set(key, row);
	}
	return map;
}

/**
 * Scheduling routes for calendar view, template assignment, and validation.
 */
export const schedulingRoutes = new Elysia({ prefix: '/scheduling' })
	.use(combinedAuthPlugin)
	/**
	 * Returns effective schedules for employees between the given dates.
	 */
	.get(
		'/calendar',
		async ({
			query,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const { startDate, endDate, organizationId: orgQuery, locationId, employeeId } = query;
			const normalizedStart = startOfDay(startDate);
			const normalizedEnd = endOfDay(endDate);

			if (isAfter(normalizedStart, normalizedEnd)) {
				set.status = 400;
				return buildErrorResponse('startDate must be on or before endDate', 400);
			}

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: orgQuery ?? null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const conditions: [SQL<unknown>, ...SQL<unknown>[]] = [
				eq(employee.organizationId, organizationId),
			];
			if (locationId) {
				conditions.push(eq(employee.locationId, locationId));
			}
			if (employeeId) {
				conditions.push(eq(employee.id, employeeId));
			}

			const employeesResult = await db
				.select({
					id: employee.id,
					firstName: employee.firstName,
					lastName: employee.lastName,
					locationId: employee.locationId,
					scheduleTemplateId: employee.scheduleTemplateId,
					shiftType: employee.shiftType,
				})
				.from(employee)
				.where(and(...conditions)!);

			if (employeesResult.length === 0) {
				return { data: [] };
			}

			const templateIds = employeesResult
				.map((emp) => emp.scheduleTemplateId)
				.filter((id): id is string => Boolean(id));

			const employeeIds = employeesResult.map((emp) => emp.id);

			const [templateDaysMap, manualScheduleMap, exceptionMap] = await Promise.all([
				loadTemplateDays(templateIds),
				loadEmployeeSchedules(employeeIds),
				loadExceptions(employeeIds, normalizedStart, normalizedEnd),
			]);

			const range = eachDayOfInterval({ start: normalizedStart, end: normalizedEnd });

			const calendar: CalendarEmployee[] = employeesResult.map((emp) => {
				const baseSchedule =
					(emp.scheduleTemplateId
						? templateDaysMap.get(emp.scheduleTemplateId)
						: undefined) ??
					manualScheduleMap.get(emp.id) ??
					[];

				const days: CalendarDay[] = range.map((date) => {
					const dayKey = format(date, 'yyyy-MM-dd');
					const exception = exceptionMap.get(`${emp.id}-${dayKey}`);
					const dayOfWeek = date.getDay();
					const baseDay = baseSchedule.find((d) => d.dayOfWeek === dayOfWeek);

					if (exception) {
						if (exception.exceptionType === 'DAY_OFF') {
							return {
								date: dayKey,
								isWorkingDay: false,
								startTime: null,
								endTime: null,
								source: 'exception',
								exceptionType: exception.exceptionType,
							};
						}

						return {
							date: dayKey,
							isWorkingDay: true,
							startTime: exception.startTime ?? null,
							endTime: exception.endTime ?? null,
							source: 'exception',
							exceptionType: exception.exceptionType,
						};
					}

					if (baseDay && (baseDay.isWorkingDay ?? true)) {
						return {
							date: dayKey,
							isWorkingDay: true,
							startTime: baseDay.startTime,
							endTime: baseDay.endTime,
							source: emp.scheduleTemplateId ? 'template' : 'manual',
						};
					}

					return {
						date: dayKey,
						isWorkingDay: false,
						startTime: null,
						endTime: null,
						source: 'none',
					};
				});

				return {
					employeeId: emp.id,
					employeeName: `${emp.firstName} ${emp.lastName}`,
					locationId: emp.locationId,
					scheduleTemplateId: emp.scheduleTemplateId ?? null,
					shiftType: emp.shiftType ?? 'DIURNA',
					days,
				};
			});

			return { data: calendar };
		},
		{
			query: calendarQuerySchema,
		},
	)
	/**
	 * Assigns a schedule template to one or more employees and syncs their schedule rows.
	 */
	.post(
		'/assign-template',
		async ({
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const { templateId, employeeIds } = body;

			const template = await db
				.select()
				.from(scheduleTemplate)
				.where(eq(scheduleTemplate.id, templateId))
				.limit(1);

			const templateRecord = template[0];
			if (!templateRecord) {
				set.status = 404;
				return buildErrorResponse('Schedule template not found', 404);
			}

			const organizationId = templateRecord.organizationId;

			const resolvedOrgId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: organizationId,
			});

			if (!resolvedOrgId || resolvedOrgId !== organizationId) {
				set.status = 403;
				return buildErrorResponse('You do not have access to this template', 403);
			}

			const employeesToUpdate = await db
				.select()
				.from(employee)
				.where(inArray(employee.id, employeeIds));

			if (employeesToUpdate.length === 0) {
				set.status = 404;
				return buildErrorResponse('No matching employees found', 404);
			}

			const invalidEmployees = employeesToUpdate.filter(
				(emp) => emp.organizationId !== organizationId,
			);
			if (invalidEmployees.length > 0) {
				set.status = 403;
				return buildErrorResponse(
					'One or more employees do not belong to this organization',
					403,
				);
			}

			const templateDays = await db
				.select()
				.from(scheduleTemplateDay)
				.where(eq(scheduleTemplateDay.templateId, templateId));

			for (const emp of employeesToUpdate) {
				await db
					.update(employee)
					.set({
						scheduleTemplateId: templateId,
						shiftType: templateRecord.shiftType,
					})
					.where(eq(employee.id, emp.id));

				await db.delete(employeeSchedule).where(eq(employeeSchedule.employeeId, emp.id));
				if (templateDays.length > 0) {
					const scheduleRows = templateDays.map((day) => ({
						employeeId: emp.id,
						dayOfWeek: day.dayOfWeek,
						startTime: day.startTime,
						endTime: day.endTime,
						isWorkingDay: day.isWorkingDay ?? true,
					}));
					await db.insert(employeeSchedule).values(scheduleRows);
				}
			}

			return { updated: employeesToUpdate.length };
		},
		{
			body: z.object({
				templateId: z.string().uuid('Invalid template ID'),
				employeeIds: z.array(z.string().uuid()).min(1, 'At least one employee is required'),
			}),
		},
	)
	/**
	 * Validates a schedule configuration without saving it.
	 */
	.post(
		'/validate',
		async ({
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const { shiftType, days, organizationId: orgInput } = body;

			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: orgInput ?? null,
			});

			if (!organizationId) {
				const status = authType === 'apiKey' ? 403 : 400;
				set.status = status;
				return buildErrorResponse('Organization is required or not permitted', status);
			}

			const enforcement = await getOvertimeEnforcement(organizationId);
			const validation = validateScheduleDays({
				days,
				shiftType,
				overtimeEnforcement: enforcement,
			});

			return { data: { validation, overtimeEnforcement: enforcement } };
		},
		{
			body: z.object({
				shiftType: shiftTypeEnum,
				days: z.array(scheduleTemplateDaySchema).min(1),
				organizationId: z.string().optional(),
			}),
		},
	);
