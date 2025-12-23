import { z } from 'zod';

import { paginationSchema, shiftTypeEnum } from './crud.js';

/**
 * Zod validation schemas for scheduling templates, exceptions, and calendar queries.
 * @module schemas/schedules
 */

/**
 * Schedule exception type enumeration.
 */
export const scheduleExceptionTypeEnum = z.enum(['DAY_OFF', 'MODIFIED', 'EXTRA_DAY']);

/**
 * Schema for a single day within a schedule template.
 */
export const scheduleTemplateDaySchema = z.object({
	dayOfWeek: z.number().int().min(0).max(6),
	startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be HH:MM'),
	endTime: z.string().regex(/^\d{2}:\d{2}$/, 'End time must be HH:MM'),
	isWorkingDay: z.boolean().default(true),
});

/**
 * Schema for creating a schedule template with daily configurations.
 */
export const createScheduleTemplateSchema = z.object({
	name: z.string().min(1, 'Name is required').max(255),
	description: z.string().max(1000).optional(),
	shiftType: shiftTypeEnum.default('DIURNA').optional(),
	organizationId: z.string().optional(),
	days: z.array(scheduleTemplateDaySchema).min(1, 'At least one day is required'),
});

/**
 * Schema for updating a schedule template.
 */
export const updateScheduleTemplateSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	description: z.string().max(1000).nullable().optional(),
	shiftType: shiftTypeEnum.optional(),
	organizationId: z.string().optional(),
	days: z.array(scheduleTemplateDaySchema).min(1).optional(),
});

/**
 * Schema for querying schedule templates with pagination.
 */
export const scheduleTemplateQuerySchema = paginationSchema.extend({
	organizationId: z.string().optional(),
});

/**
 * Schema for creating a schedule exception.
 */
export const createScheduleExceptionSchema = z
	.object({
		employeeId: z.string().uuid('Invalid employee ID'),
		exceptionDate: z.coerce.date(),
		exceptionType: scheduleExceptionTypeEnum,
		startTime: z
			.string()
			.regex(/^\d{2}:\d{2}$/, 'Start time must be HH:MM')
			.optional(),
		endTime: z
			.string()
			.regex(/^\d{2}:\d{2}$/, 'End time must be HH:MM')
			.optional(),
		reason: z.string().max(500).optional(),
	})
	.superRefine((value, ctx) => {
		if (value.exceptionType === 'DAY_OFF') {
			return;
		}

		if (!value.startTime) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['startTime'],
				message: 'startTime is required for this exception type',
			});
		}
		if (!value.endTime) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['endTime'],
				message: 'endTime is required for this exception type',
			});
		}
	});

/**
 * Schema for updating a schedule exception.
 */
export const updateScheduleExceptionSchema = z
	.object({
		exceptionDate: z.coerce.date().optional(),
		exceptionType: scheduleExceptionTypeEnum.optional(),
		startTime: z
			.string()
			.regex(/^\d{2}:\d{2}$/, 'Start time must be HH:MM')
			.optional(),
		endTime: z
			.string()
			.regex(/^\d{2}:\d{2}$/, 'End time must be HH:MM')
			.optional(),
		reason: z.string().max(500).nullable().optional(),
	})
	.superRefine((value, ctx) => {
		if (!value.exceptionType || value.exceptionType === 'DAY_OFF') {
			return;
		}

		if (!value.startTime) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['startTime'],
				message: 'startTime is required for this exception type',
			});
		}
		if (!value.endTime) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['endTime'],
				message: 'endTime is required for this exception type',
			});
		}
	});

/**
 * Schema for querying schedule exceptions.
 */
export const scheduleExceptionQuerySchema = paginationSchema.extend({
	employeeId: z.string().uuid().optional(),
	fromDate: z.coerce.date().optional(),
	toDate: z.coerce.date().optional(),
	organizationId: z.string().optional(),
});

/**
 * Schema for calendar queries to fetch effective schedules.
 */
export const calendarQuerySchema = z.object({
	startDate: z.coerce.date(),
	endDate: z.coerce.date(),
	organizationId: z.string().optional(),
	locationId: z.string().uuid().optional(),
	employeeId: z.string().uuid().optional(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type ScheduleExceptionType = z.infer<typeof scheduleExceptionTypeEnum>;
export type ScheduleTemplateDayInput = z.infer<typeof scheduleTemplateDaySchema>;
export type CreateScheduleTemplateInput = z.infer<typeof createScheduleTemplateSchema>;
export type UpdateScheduleTemplateInput = z.infer<typeof updateScheduleTemplateSchema>;
export type ScheduleTemplateQuery = z.infer<typeof scheduleTemplateQuerySchema>;
export type CreateScheduleExceptionInput = z.infer<typeof createScheduleExceptionSchema>;
export type UpdateScheduleExceptionInput = z.infer<typeof updateScheduleExceptionSchema>;
export type ScheduleExceptionQuery = z.infer<typeof scheduleExceptionQuerySchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;


