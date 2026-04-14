import { z } from 'zod';

import { parseDateKey } from '../utils/date-key.js';

const MAX_GRATIFICATION_AMOUNT = 9999999999.99;

/**
 * Validates a date key in YYYY-MM-DD format.
 */
const dateKeySchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
	.refine((value) => {
		try {
			parseDateKey(value);
			return true;
		} catch {
			return false;
		}
	}, 'Invalid calendar date');

/**
 * Supported gratification periodicity values.
 */
export const gratificationPeriodicitySchema = z.enum(['ONE_TIME', 'RECURRING']);

/**
 * Supported gratification application modes.
 */
export const gratificationApplicationModeSchema = z.enum(['MANUAL', 'AUTOMATIC']);

/**
 * Supported gratification statuses.
 */
export const gratificationStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']);

/**
 * Mutable statuses accepted by the API.
 */
export const gratificationMutableStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']);

/**
 * Normalizes optional query-string values.
 *
 * @param value - Raw query-string value
 * @returns Normalized value or undefined
 */
function normalizeOptionalQueryValue(value: unknown): unknown {
	if (value === undefined || value === null) {
		return undefined;
	}

	if (typeof value === 'string' && (value.trim() === '' || value === 'undefined')) {
		return undefined;
	}

	return value;
}

/**
 * Checks whether the gratification date range is chronologically valid.
 *
 * @param startDateKey - Gratification start date key
 * @param endDateKey - Optional gratification end date key
 * @returns True when the range is valid
 */
export function hasValidGratificationDateRange(
	startDateKey: string,
	endDateKey: string | null | undefined,
): boolean {
	return endDateKey === null || endDateKey === undefined || endDateKey >= startDateKey;
}

/**
 * Verifies the gratitude business rule matrix.
 *
 * @param args - Gratification inputs
 * @returns Validation error message when invalid, otherwise null
 */
export function validateGratificationBusinessRules(args: {
	periodicity: 'ONE_TIME' | 'RECURRING';
	applicationMode: 'MANUAL' | 'AUTOMATIC';
}): string | null {
	if (args.applicationMode === 'MANUAL' && args.periodicity !== 'ONE_TIME') {
		return 'Manual gratifications only allow ONE_TIME periodicity';
	}

	return null;
}

/**
 * Path params for organization/employee-scoped gratification routes.
 */
export const employeeGratificationParamsSchema = z.object({
	organizationId: z.string().min(1, 'organizationId is required'),
	employeeId: z.string().min(1, 'employeeId is required'),
});

/**
 * Path params for a single gratification route.
 */
export const employeeGratificationDetailParamsSchema = employeeGratificationParamsSchema.extend({
	id: z.string().min(1, 'id is required'),
});

/**
 * Create payload for employee gratifications.
 */
export const employeeGratificationCreateSchema = z
	.object({
		concept: z.string().trim().min(1, 'concept is required').max(150),
		amount: z.coerce
			.number()
			.positive('amount must be greater than 0')
			.max(MAX_GRATIFICATION_AMOUNT),
		periodicity: gratificationPeriodicitySchema,
		applicationMode: gratificationApplicationModeSchema,
		startDateKey: dateKeySchema,
		endDateKey: dateKeySchema.optional(),
		notes: z.string().trim().max(1000).optional(),
	})
	.strict()
	.superRefine((value, context) => {
		if (!hasValidGratificationDateRange(value.startDateKey, value.endDateKey)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['endDateKey'],
				message: 'endDateKey must be greater than or equal to startDateKey',
			});
		}

		const validationError = validateGratificationBusinessRules({
			periodicity: value.periodicity,
			applicationMode: value.applicationMode,
		});
		if (validationError) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['applicationMode'],
				message: validationError,
			});
		}
	});

/**
 * Update payload for employee gratifications.
 */
export const employeeGratificationUpdateSchema = z
	.object({
		concept: z.string().trim().min(1).max(150).optional(),
		amount: z.coerce.number().positive().max(MAX_GRATIFICATION_AMOUNT).optional(),
		periodicity: gratificationPeriodicitySchema.optional(),
		applicationMode: gratificationApplicationModeSchema.optional(),
		status: gratificationMutableStatusSchema.optional(),
		startDateKey: dateKeySchema.optional(),
		endDateKey: dateKeySchema.nullable().optional(),
		notes: z.string().trim().max(1000).nullable().optional(),
	})
	.strict()
	.superRefine((value, context) => {
		if (
			value.startDateKey &&
			value.endDateKey &&
			!hasValidGratificationDateRange(value.startDateKey, value.endDateKey)
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['endDateKey'],
				message: 'endDateKey must be greater than or equal to startDateKey',
			});
		}

		if (
			value.periodicity !== undefined &&
			value.applicationMode !== undefined &&
			validateGratificationBusinessRules({
				periodicity: value.periodicity,
				applicationMode: value.applicationMode,
			})
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['applicationMode'],
				message: 'Manual gratifications only allow ONE_TIME periodicity',
			});
		}
	})
	.refine((value) => Object.keys(value).length > 0, {
		message: 'At least one field must be provided for update',
	});

/**
 * Query filters for employee-level gratification lists.
 */
export const employeeGratificationListQuerySchema = z.object({
	status: z.preprocess(normalizeOptionalQueryValue, gratificationStatusSchema.optional()),
	periodicity: z.preprocess(
		normalizeOptionalQueryValue,
		gratificationPeriodicitySchema.optional(),
	),
	applicationMode: z.preprocess(
		normalizeOptionalQueryValue,
		gratificationApplicationModeSchema.optional(),
	),
});

/**
 * Query filters for organization-wide gratification lists.
 */
export const organizationGratificationListQuerySchema = z.object({
	status: z.preprocess(normalizeOptionalQueryValue, gratificationStatusSchema.optional()),
	periodicity: z.preprocess(
		normalizeOptionalQueryValue,
		gratificationPeriodicitySchema.optional(),
	),
	applicationMode: z.preprocess(
		normalizeOptionalQueryValue,
		gratificationApplicationModeSchema.optional(),
	),
	employeeId: z.preprocess(normalizeOptionalQueryValue, z.string().min(1).optional()),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).default(0),
});

export type EmployeeGratificationCreateInput = z.infer<typeof employeeGratificationCreateSchema>;
export type EmployeeGratificationUpdateInput = z.infer<typeof employeeGratificationUpdateSchema>;
export type EmployeeGratificationListQuery = z.infer<typeof employeeGratificationListQuerySchema>;
export type OrganizationGratificationListQuery = z.infer<
	typeof organizationGratificationListQuerySchema
>;
