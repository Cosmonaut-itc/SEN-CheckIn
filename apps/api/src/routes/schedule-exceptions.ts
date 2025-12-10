import { Elysia } from 'elysia';
import crypto from 'node:crypto';
import { and, eq, gte, lte, type SQL } from 'drizzle-orm';
import { endOfDay, startOfDay } from 'date-fns';

import db from '../db/index.js';
import { employee, scheduleException } from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { hasOrganizationAccess, resolveOrganizationId } from '../utils/organization.js';
import type { AuthSession } from '../plugins/auth.js';
import {
	createScheduleExceptionSchema,
	scheduleExceptionQuerySchema,
	updateScheduleExceptionSchema,
} from '../schemas/schedules.js';
import { idParamSchema } from '../schemas/crud.js';
import { calculateDailyMinutes } from '../utils/schedule-validator.js';

type ScheduleExceptionInsert = typeof scheduleException.$inferInsert;

/**
 * Validates that the caller can access the employee tied to an exception.
 *
 * @param employeeId - Employee identifier
 * @param auth - Authentication context
 * @returns Employee record when authorized, otherwise error response
 */
async function ensureEmployeeAccess(
	employeeId: string,
	auth: {
		authType: 'session' | 'apiKey';
		session: AuthSession | null;
		sessionOrganizationIds: string[];
		apiKeyOrganizationIds: string[];
	},
	set: { status?: number | string } & Record<string, unknown>,
): Promise<typeof employee.$inferSelect | null> {
	const employeeRecord = await db.select().from(employee).where(eq(employee.id, employeeId)).limit(1);
	const record = employeeRecord[0];

	if (!record) {
		set.status = 404;
		return null;
	}

	if (
		!hasOrganizationAccess(
			auth.authType,
			auth.session,
			auth.sessionOrganizationIds,
			auth.apiKeyOrganizationIds,
			record.organizationId,
		)
	) {
		set.status = 403;
		return null;
	}

	return record;
}

/**
 * Schedule exception routes for per-employee overrides.
 */
export const scheduleExceptionRoutes = new Elysia({ prefix: '/schedule-exceptions' })
	.use(combinedAuthPlugin)
	/**
	 * Lists schedule exceptions for employees within the organization.
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
			const { limit, offset, employeeId, fromDate, toDate, organizationId: orgQuery } = query;

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

			const conditions: [SQL<unknown>, ...SQL<unknown>[]] = [
				eq(employee.organizationId, organizationId),
			];

			if (employeeId) {
				conditions.push(eq(scheduleException.employeeId, employeeId));
			}
			if (fromDate) {
				conditions.push(gte(scheduleException.exceptionDate, startOfDay(fromDate)));
			}
			if (toDate) {
				conditions.push(lte(scheduleException.exceptionDate, endOfDay(toDate)));
			}

			const whereClause = and(...conditions)!;

			const results = await db
				.select({
					id: scheduleException.id,
					employeeId: scheduleException.employeeId,
					exceptionDate: scheduleException.exceptionDate,
					exceptionType: scheduleException.exceptionType,
					startTime: scheduleException.startTime,
					endTime: scheduleException.endTime,
					reason: scheduleException.reason,
					createdAt: scheduleException.createdAt,
					updatedAt: scheduleException.updatedAt,
					employeeName: employee.firstName,
					employeeLastName: employee.lastName,
				})
				.from(scheduleException)
				.leftJoin(employee, eq(scheduleException.employeeId, employee.id))
				.where(whereClause)
				.limit(limit)
				.offset(offset)
				.orderBy(scheduleException.exceptionDate);

			const total = (
				await db
					.select()
					.from(scheduleException)
					.leftJoin(employee, eq(scheduleException.employeeId, employee.id))
					.where(whereClause)
			).length;

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
			query: scheduleExceptionQuerySchema,
		},
	)
	/**
	 * Creates a new schedule exception for an employee.
	 */
	.post(
		'/',
		async ({
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationIds,
			set,
		}) => {
			const {
				employeeId,
				exceptionDate,
				exceptionType,
				startTime,
				endTime,
				reason,
			} = body;

			const employeeRecord = await ensureEmployeeAccess(
				employeeId,
				{
					authType,
					session,
					sessionOrganizationIds,
					apiKeyOrganizationIds,
				},
				set,
			);

			if (!employeeRecord) {
				return { error: 'Employee not found or not permitted' };
			}

			const normalizedDate = startOfDay(exceptionDate);

			if (exceptionType !== 'DAY_OFF') {
				const minutes = calculateDailyMinutes({
					dayOfWeek: normalizedDate.getUTCDay(),
					startTime: startTime ?? '',
					endTime: endTime ?? '',
					isWorkingDay: true,
				});
				if (minutes <= 0) {
					set.status = 400;
					return { error: 'Invalid start and end time for exception' };
				}
			}

			const exists = await db
				.select()
				.from(scheduleException)
				.where(
					and(
						eq(scheduleException.employeeId, employeeId),
						eq(scheduleException.exceptionDate, normalizedDate),
					)!,
				)
				.limit(1);

			if (exists[0]) {
				set.status = 409;
				return { error: 'An exception already exists for this date' };
			}

			const newException: ScheduleExceptionInsert = {
				id: crypto.randomUUID(),
				employeeId,
				exceptionDate: normalizedDate,
				exceptionType,
				startTime: startTime ?? null,
				endTime: endTime ?? null,
				reason: reason ?? null,
			};

			await db.insert(scheduleException).values(newException);

			set.status = 201;
			return { data: newException };
		},
		{
			body: createScheduleExceptionSchema,
		},
	)
	/**
	 * Updates an existing schedule exception.
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
			const existing = await db
				.select({
					id: scheduleException.id,
					employeeId: scheduleException.employeeId,
					exceptionDate: scheduleException.exceptionDate,
					exceptionType: scheduleException.exceptionType,
					startTime: scheduleException.startTime,
					endTime: scheduleException.endTime,
					reason: scheduleException.reason,
					createdAt: scheduleException.createdAt,
					updatedAt: scheduleException.updatedAt,
					organizationId: employee.organizationId,
				})
				.from(scheduleException)
				.leftJoin(employee, eq(scheduleException.employeeId, employee.id))
				.where(eq(scheduleException.id, id))
				.limit(1);

			const record = existing[0];

			if (!record) {
				set.status = 404;
				return { error: 'Schedule exception not found' };
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
				return { error: 'You do not have access to this schedule exception' };
			}

			const nextType = body.exceptionType ?? record.exceptionType;
			const nextDate = body.exceptionDate ? startOfDay(body.exceptionDate) : record.exceptionDate;
			const nextStart = body.startTime ?? record.startTime;
			const nextEnd = body.endTime ?? record.endTime;

			if (nextType !== 'DAY_OFF') {
				const minutes = calculateDailyMinutes({
					dayOfWeek: nextDate.getUTCDay(),
					startTime: nextStart ?? '',
					endTime: nextEnd ?? '',
					isWorkingDay: true,
				});
				if (minutes <= 0) {
					set.status = 400;
					return { error: 'Invalid start and end time for exception' };
				}
			}

			if (nextDate.getTime() !== record.exceptionDate.getTime()) {
				const duplicate = await db
					.select()
					.from(scheduleException)
					.where(
						and(
							eq(scheduleException.employeeId, record.employeeId),
							eq(scheduleException.exceptionDate, nextDate),
						)!,
					)
					.limit(1);
				if (duplicate[0]) {
					set.status = 409;
					return { error: 'An exception already exists for this date' };
				}
			}

			const updatePayload: Partial<ScheduleExceptionInsert> = {};
			if (body.exceptionDate !== undefined) {
				updatePayload.exceptionDate = nextDate;
			}
			if (body.exceptionType !== undefined) {
				updatePayload.exceptionType = nextType;
			}
			if (body.startTime !== undefined) {
				updatePayload.startTime = nextStart;
			}
			if (body.endTime !== undefined) {
				updatePayload.endTime = nextEnd;
			}
			if (body.reason !== undefined) {
				updatePayload.reason = body.reason;
			}

			await db.update(scheduleException).set(updatePayload).where(eq(scheduleException.id, id));

			const refreshed = await db
				.select()
				.from(scheduleException)
				.where(eq(scheduleException.id, id))
				.limit(1);

			return { data: refreshed[0] };
		},
		{
			body: updateScheduleExceptionSchema,
			params: idParamSchema,
		},
	)
	/**
	 * Deletes a schedule exception.
	 */
	.delete(
		'/:id',
		async ({ params, authType, session, sessionOrganizationIds, apiKeyOrganizationIds, set }) => {
			const { id } = params;

			const existing = await db
				.select({
					id: scheduleException.id,
					employeeId: scheduleException.employeeId,
					organizationId: employee.organizationId,
				})
				.from(scheduleException)
				.leftJoin(employee, eq(scheduleException.employeeId, employee.id))
				.where(eq(scheduleException.id, id))
				.limit(1);

			const record = existing[0];

			if (!record) {
				set.status = 404;
				return { error: 'Schedule exception not found' };
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
				return { error: 'You do not have access to this schedule exception' };
			}

			await db.delete(scheduleException).where(eq(scheduleException.id, id));

			return { message: 'Schedule exception deleted successfully' };
		},
		{
			params: idParamSchema,
		},
	);
