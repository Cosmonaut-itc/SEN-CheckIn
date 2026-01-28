import { z } from 'zod';

import { paginationSchema } from './crud.js';
import { parseDateKey } from '../utils/date-key.js';

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_VACATION_REQUEST_RANGE_DAYS = 2000;

/**
 * Validates that a date key matches YYYY-MM-DD and is a real calendar date.
 *
 * @param value - Date key string to validate
 * @returns True when the date key is valid
 */
function isValidDateKey(value: string): boolean {
	if (!DATE_KEY_REGEX.test(value)) {
		return false;
	}
	try {
		parseDateKey(value);
		return true;
	} catch {
		return false;
	}
}

/**
 * Base schema for a date key in YYYY-MM-DD format.
 */
export const dateKeySchema = z
	.string()
	.regex(DATE_KEY_REGEX, 'Date must be YYYY-MM-DD')
	.refine(isValidDateKey, 'Invalid calendar date');

/**
 * Vacation request status enumeration.
 */
export const vacationRequestStatusEnum = z.enum([
	'DRAFT',
	'SUBMITTED',
	'APPROVED',
	'REJECTED',
	'CANCELLED',
]);

/**
 * Vacation request day type enumeration.
 */
export const vacationDayTypeEnum = z.enum([
	'SCHEDULED_WORKDAY',
	'SCHEDULED_REST_DAY',
	'EXCEPTION_WORKDAY',
	'EXCEPTION_DAY_OFF',
	'MANDATORY_REST_DAY',
	'INCAPACITY',
]);

/**
 * Validates that a date range is ordered (end >= start).
 *
 * @param value - Date range payload
 * @param ctx - Zod refinement context
 * @returns Nothing
 */
function validateDateRange(
	value: { startDateKey: string; endDateKey: string },
	ctx: z.RefinementCtx,
): void {
	if (value.endDateKey < value.startDateKey) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['endDateKey'],
			message: 'endDateKey must be on or after startDateKey',
		});
		return;
	}

	const startDate = new Date(`${value.startDateKey}T00:00:00Z`);
	const endDate = new Date(`${value.endDateKey}T00:00:00Z`);
	if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
		return;
	}

	const dayCount =
		Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
	if (dayCount > MAX_VACATION_REQUEST_RANGE_DAYS) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['endDateKey'],
			message: `Vacation range exceeds ${MAX_VACATION_REQUEST_RANGE_DAYS} days`,
		});
	}
}

/**
 * Schema for date key ranges used in vacation requests.
 */
const vacationDateRangeSchema = z.object({
	startDateKey: dateKeySchema,
	endDateKey: dateKeySchema,
});

/**
 * Schema for creating vacation requests (admin or self-service).
 */
export const vacationRequestCreateSchema = vacationDateRangeSchema
	.extend({
		employeeId: z.string().uuid().optional(),
		requestedNotes: z.string().max(1000).optional(),
		status: vacationRequestStatusEnum.optional(),
	})
	.superRefine(validateDateRange);

/**
 * Schema for querying vacation requests with optional filters.
 */
export const vacationRequestQuerySchema = paginationSchema.extend({
	employeeId: z.string().uuid().optional(),
	status: vacationRequestStatusEnum.optional(),
	from: dateKeySchema.optional(),
	to: dateKeySchema.optional(),
	organizationId: z.string().optional(),
});

/**
 * Schema for approve/reject/cancel actions.
 */
export const vacationRequestDecisionSchema = z.object({
	decisionNotes: z.string().max(1000).optional(),
});

export type VacationRequestCreateInput = z.infer<typeof vacationRequestCreateSchema>;
export type VacationRequestQueryInput = z.infer<typeof vacationRequestQuerySchema>;
export type VacationRequestDecisionInput = z.infer<typeof vacationRequestDecisionSchema>;
export type VacationRequestStatus = z.infer<typeof vacationRequestStatusEnum>;
export type VacationDayType = z.infer<typeof vacationDayTypeEnum>;
