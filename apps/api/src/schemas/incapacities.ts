import { z } from 'zod';

import { paginationSchema } from './crud.js';
import { dateKeySchema } from './vacations.js';

export const MAX_INCAPACITY_RANGE_DAYS = 2000;

/**
 * Incapacity type enumeration.
 */
export const incapacityTypeEnum = z.enum(['EG', 'RT', 'MAT', 'LIC140BIS']);

/**
 * SAT incapacity type enumeration.
 */
export const satTipoIncapacidadEnum = z.enum(['01', '02', '03', '04']);

/**
 * Incapacity issuance enumeration.
 */
export const incapacityIssuedByEnum = z.enum(['IMSS', 'recognized_by_IMSS']);

/**
 * Incapacity sequence enumeration.
 */
export const incapacitySequenceEnum = z.enum(['inicial', 'subsecuente', 'recaida']);

/**
 * Incapacity status enumeration.
 */
export const incapacityStatusEnum = z.enum(['ACTIVE', 'CANCELLED']);

/**
 * Validates that a date range is ordered and within supported limits.
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
	if (dayCount > MAX_INCAPACITY_RANGE_DAYS) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['endDateKey'],
			message: `Incapacity range exceeds ${MAX_INCAPACITY_RANGE_DAYS} days`,
		});
	}
}

/**
 * Base schema for incapacity date ranges.
 */
const incapacityDateRangeSchema = z.object({
	startDateKey: dateKeySchema,
	endDateKey: dateKeySchema,
});

/**
 * Schema for creating incapacity records.
 */
export const incapacityCreateSchema = incapacityDateRangeSchema
	.extend({
		employeeId: z.string().uuid(),
		caseId: z.string().min(1).max(255),
		type: incapacityTypeEnum,
		satTipoIncapacidad: satTipoIncapacidadEnum.optional(),
		daysAuthorized: z.coerce.number().int().positive(),
		certificateFolio: z.string().max(100).optional(),
		issuedBy: incapacityIssuedByEnum.optional(),
		sequence: incapacitySequenceEnum.optional(),
		percentOverride: z.coerce.number().min(0).max(1).optional(),
		organizationId: z.string().optional(),
	})
	.superRefine(validateDateRange);

/**
 * Schema for updating incapacity records.
 */
export const incapacityUpdateSchema = z
	.object({
		caseId: z.string().min(1).max(255).optional(),
		type: incapacityTypeEnum.optional(),
		satTipoIncapacidad: satTipoIncapacidadEnum.optional(),
		startDateKey: dateKeySchema.optional(),
		endDateKey: dateKeySchema.optional(),
		daysAuthorized: z.coerce.number().int().positive().optional(),
		certificateFolio: z.string().max(100).optional(),
		issuedBy: incapacityIssuedByEnum.optional(),
		sequence: incapacitySequenceEnum.optional(),
		percentOverride: z.coerce.number().min(0).max(1).optional(),
		status: incapacityStatusEnum.optional(),
	})
	.superRefine((value, ctx) => {
		if (value.startDateKey || value.endDateKey) {
			if (!value.startDateKey || !value.endDateKey) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['startDateKey'],
					message: 'startDateKey and endDateKey must be provided together',
				});
				return;
			}
			validateDateRange(
				{ startDateKey: value.startDateKey, endDateKey: value.endDateKey },
				ctx,
			);
		}
	});

/**
 * Schema for querying incapacity records with optional filters.
 */
export const incapacityQuerySchema = paginationSchema.extend({
	employeeId: z.string().uuid().optional(),
	status: incapacityStatusEnum.optional(),
	type: incapacityTypeEnum.optional(),
	from: dateKeySchema.optional(),
	to: dateKeySchema.optional(),
	search: z.string().optional(),
	organizationId: z.string().optional(),
});

/**
 * Schema for presigning incapacity document uploads.
 */
export const incapacityDocumentPresignSchema = z.object({
	fileName: z.string().min(1).max(255),
	contentType: z.string().min(1).max(100),
	sizeBytes: z.coerce.number().int().positive(),
});

/**
 * Schema for confirming incapacity document uploads.
 */
export const incapacityDocumentConfirmSchema = z.object({
	documentId: z.string().uuid(),
	objectKey: z.string().min(1),
	fileName: z.string().min(1).max(255),
	contentType: z.string().min(1).max(100),
	sizeBytes: z.coerce.number().int().positive(),
	sha256: z.string().min(1).max(128),
});

export type IncapacityCreateInput = z.infer<typeof incapacityCreateSchema>;
export type IncapacityUpdateInput = z.infer<typeof incapacityUpdateSchema>;
export type IncapacityQueryInput = z.infer<typeof incapacityQuerySchema>;
export type IncapacityType = z.infer<typeof incapacityTypeEnum>;
export type IncapacityStatus = z.infer<typeof incapacityStatusEnum>;
