import { z } from 'zod';

/**
 * Enum for holiday sources.
 */
export const holidaySourceEnum = z.enum(['INTERNAL', 'PROVIDER', 'CUSTOM']);

/**
 * Enum for holiday statuses.
 */
export const holidayStatusEnum = z.enum([
	'PENDING_APPROVAL',
	'APPROVED',
	'REJECTED',
	'DEACTIVATED',
]);

/**
 * Enum for holiday kinds.
 */
export const holidayKindEnum = z.enum(['MANDATORY', 'OPTIONAL']);

/**
 * Enum for custom recurrence mode.
 */
export const holidayRecurrenceEnum = z.enum(['ONE_TIME', 'ANNUAL']);

/**
 * Schema for holiday list filters.
 */
export const holidayListQuerySchema = z.object({
	year: z.coerce.number().int().min(2000).max(2100).optional(),
	source: holidaySourceEnum.optional(),
	status: holidayStatusEnum.optional(),
	kind: holidayKindEnum.optional(),
	organizationId: z.string().optional(),
});

/**
 * Schema for creating custom holiday entries.
 */
export const holidayCustomCreateSchema = z.object({
	organizationId: z.string().optional(),
	dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
	name: z.string().min(1).max(255),
	kind: holidayKindEnum.default('MANDATORY').optional(),
	recurrence: holidayRecurrenceEnum.default('ONE_TIME').optional(),
	legalReference: z.string().max(255).nullable().optional(),
});

/**
 * Schema for updating/deactivating a holiday entry.
 */
export const holidayUpdateSchema = z
	.object({
		name: z.string().min(1).max(255).optional(),
		kind: holidayKindEnum.optional(),
		dateKey: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
			.optional(),
		active: z.boolean().optional(),
		legalReference: z.string().max(255).nullable().optional(),
		reason: z.string().trim().min(1).max(500),
	})
	.superRefine((value, ctx) => {
		const changed =
			value.name !== undefined ||
			value.kind !== undefined ||
			value.dateKey !== undefined ||
			value.active !== undefined ||
			value.legalReference !== undefined;
		if (!changed) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'At least one mutable field must be provided.',
			});
		}
	});

/**
 * Schema for CSV imports.
 */
export const holidayCsvImportSchema = z.object({
	organizationId: z.string().optional(),
	csvContent: z.string().min(1),
});

/**
 * Schema for manual provider sync.
 */
export const holidaySyncSchema = z.object({
	organizationId: z.string().optional(),
	years: z.array(z.coerce.number().int().min(2000).max(2100)).min(1).optional(),
	year: z.coerce.number().int().min(2000).max(2100).optional(),
});

/**
 * Schema for approving/rejecting a provider sync run.
 */
export const holidaySyncDecisionSchema = z.object({
	reason: z.string().trim().min(1).max(500).optional(),
});

/**
 * Schema for internal scheduler sync endpoint.
 */
export const internalHolidaySyncSchema = z.object({
	organizationId: z.string().optional(),
	years: z.array(z.coerce.number().int().min(2000).max(2100)).min(1).optional(),
});

export type HolidaySource = z.infer<typeof holidaySourceEnum>;
export type HolidayStatus = z.infer<typeof holidayStatusEnum>;
export type HolidayKind = z.infer<typeof holidayKindEnum>;
export type HolidayRecurrence = z.infer<typeof holidayRecurrenceEnum>;
export type HolidayListQuery = z.infer<typeof holidayListQuerySchema>;
export type HolidayCustomCreateInput = z.infer<typeof holidayCustomCreateSchema>;
export type HolidayUpdateInput = z.infer<typeof holidayUpdateSchema>;
export type HolidayCsvImportInput = z.infer<typeof holidayCsvImportSchema>;
export type HolidaySyncInput = z.infer<typeof holidaySyncSchema>;
export type HolidaySyncDecisionInput = z.infer<typeof holidaySyncDecisionSchema>;
export type InternalHolidaySyncInput = z.infer<typeof internalHolidaySyncSchema>;
