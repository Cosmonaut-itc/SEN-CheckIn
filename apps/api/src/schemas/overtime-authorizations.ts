import { z } from 'zod';

import { parseDateKey } from '../utils/date-key.js';

const MAX_AUTHORIZED_HOURS = 999.99;

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
 * Enum for overtime authorization status filters and mutations.
 */
export const overtimeAuthorizationStatusSchema = z.enum(['PENDING', 'ACTIVE', 'CANCELLED']);

/**
 * Validates overtime hours against the database numeric(5,2) range.
 */
const authorizedHoursSchema = z.coerce
	.number()
	.positive('authorizedHours must be greater than 0')
	.max(MAX_AUTHORIZED_HOURS, 'authorizedHours must be less than or equal to 999.99');

/**
 * Path params for organization-scoped overtime authorization routes.
 */
export const overtimeAuthorizationOrganizationParamsSchema = z.object({
	organizationId: z.string().min(1, 'organizationId is required'),
});

/**
 * Path params for a single overtime authorization route.
 */
export const overtimeAuthorizationParamsSchema =
	overtimeAuthorizationOrganizationParamsSchema.extend({
		id: z.string().min(1, 'id is required'),
	});

/**
 * Create payload for overtime authorizations.
 */
export const overtimeAuthorizationCreateSchema = z.object({
	employeeId: z.string().min(1, 'employeeId is required'),
	dateKey: dateKeySchema,
	authorizedHours: authorizedHoursSchema,
	notes: z.string().trim().max(500).optional(),
});

/**
 * Update payload for overtime authorizations.
 */
export const overtimeAuthorizationUpdateSchema = z.object({
	authorizedHours: authorizedHoursSchema.optional(),
	status: overtimeAuthorizationStatusSchema.optional(),
	notes: z.string().trim().max(500).optional(),
}).refine(
	(value) =>
		value.authorizedHours !== undefined ||
		value.status !== undefined ||
		value.notes !== undefined,
	{
		message: 'At least one field must be provided for update',
	},
);

/**
 * Query filters for listing overtime authorizations.
 */
export const overtimeAuthorizationListQuerySchema = z.object({
	employeeId: z.string().min(1).optional(),
	startDate: dateKeySchema.optional(),
	endDate: dateKeySchema.optional(),
	status: overtimeAuthorizationStatusSchema.optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).default(0),
});

export type OvertimeAuthorizationCreateInput = z.infer<typeof overtimeAuthorizationCreateSchema>;
export type OvertimeAuthorizationUpdateInput = z.infer<typeof overtimeAuthorizationUpdateSchema>;
export type OvertimeAuthorizationListQuery = z.infer<typeof overtimeAuthorizationListQuerySchema>;
