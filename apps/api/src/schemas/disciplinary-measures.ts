import { differenceInCalendarDays } from 'date-fns';
import { z } from 'zod';

import { idParamSchema, paginationSchema } from './crud.js';
import { dateKeySchema } from './vacations.js';
import { parseDateKey } from '../utils/date-key.js';

export const MAX_DISCIPLINARY_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DISCIPLINARY_ATTACHMENTS = 5;

/**
 * Allowed MIME types for disciplinary uploads.
 */
export const disciplinaryAllowedContentTypes = [
	'application/pdf',
	'image/jpeg',
	'image/png',
] as const;

/**
 * Disciplinary measure status enum.
 */
export const disciplinaryMeasureStatusEnum = z.enum(['DRAFT', 'GENERATED', 'CLOSED']);

/**
 * Disciplinary outcome enum.
 */
export const disciplinaryOutcomeEnum = z.enum([
	'no_action',
	'warning',
	'suspension',
	'termination_process',
]);

/**
 * Signature status enum for measure closure.
 */
export const disciplinarySignatureStatusEnum = z.enum([
	'signed_physical',
	'refused_to_sign',
]);

/**
 * Disciplinary document kind enum.
 */
export const disciplinaryDocumentKindEnum = z.enum([
	'ACTA_ADMINISTRATIVA',
	'CONSTANCIA_NEGATIVA_FIRMA',
]);

/**
 * Common file presign payload.
 */
export const disciplinaryFilePresignSchema = z.object({
	fileName: z.string().min(1).max(255),
	contentType: z.string().min(1).max(100),
	sizeBytes: z.coerce.number().int().positive(),
});

/**
 * Common file confirmation payload.
 */
export const disciplinaryFileConfirmSchema = z.object({
	objectKey: z.string().min(1),
	fileName: z.string().min(1).max(255),
	contentType: z.string().min(1).max(100),
	sizeBytes: z.coerce.number().int().positive(),
	sha256: z.string().min(1).max(128),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Disciplinary list filters.
 */
export const disciplinaryMeasuresQuerySchema = paginationSchema.extend({
	employeeId: z.string().uuid().optional(),
	search: z.string().trim().max(255).optional(),
	fromDateKey: dateKeySchema.optional(),
	toDateKey: dateKeySchema.optional(),
	status: disciplinaryMeasureStatusEnum.optional(),
	outcome: disciplinaryOutcomeEnum.optional(),
});

/**
 * KPI filters.
 */
export const disciplinaryKpisQuerySchema = z.object({
	fromDateKey: dateKeySchema.optional(),
	toDateKey: dateKeySchema.optional(),
});

/**
 * Converts a validated date key to a UTC Date instance.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Date instance at UTC midnight
 */
function dateKeyToUtcDate(dateKey: string): Date {
	const parsed = parseDateKey(dateKey);
	return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
}

/**
 * Validates suspension range boundaries.
 *
 * @param startDateKey - Suspension start date key
 * @param endDateKey - Suspension end date key
 * @returns Validation result with max-days constraint enforcement
 */
function validateSuspensionWindow(
	startDateKey: string,
	endDateKey: string,
): { isValid: true } | { isValid: false; message: string } {
	const startDate = dateKeyToUtcDate(startDateKey);
	const endDate = dateKeyToUtcDate(endDateKey);
	if (endDate < startDate) {
		return {
			isValid: false,
			message: 'suspensionEndDateKey must be on or after suspensionStartDateKey',
		};
	}

	const days = differenceInCalendarDays(endDate, startDate) + 1;
	if (days > 8) {
		return {
			isValid: false,
			message: 'suspension range cannot exceed 8 days',
		};
	}

	return { isValid: true };
}

/**
 * Schema for creating disciplinary measures.
 */
export const disciplinaryMeasureCreateSchema = z
	.object({
		employeeId: z.string().uuid(),
		incidentDateKey: dateKeySchema,
		reason: z.string().trim().min(1).max(6000),
		policyReference: z.string().trim().max(2000).optional(),
		outcome: disciplinaryOutcomeEnum.default('no_action'),
		suspensionStartDateKey: dateKeySchema.optional(),
		suspensionEndDateKey: dateKeySchema.optional(),
	})
	.superRefine((value, ctx) => {
		if (value.outcome === 'suspension') {
			if (!value.suspensionStartDateKey) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['suspensionStartDateKey'],
					message: 'suspensionStartDateKey is required for suspension outcome',
				});
			}
			if (!value.suspensionEndDateKey) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['suspensionEndDateKey'],
					message: 'suspensionEndDateKey is required for suspension outcome',
				});
			}
			if (value.suspensionStartDateKey && value.suspensionEndDateKey) {
				const result = validateSuspensionWindow(
					value.suspensionStartDateKey,
					value.suspensionEndDateKey,
				);
				if (!result.isValid) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['suspensionEndDateKey'],
						message: result.message,
					});
				}
			}
			return;
		}

		if (value.suspensionStartDateKey || value.suspensionEndDateKey) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['outcome'],
				message: 'suspension date range can only be set for suspension outcome',
			});
		}
	});

/**
 * Schema for updating disciplinary measures.
 */
export const disciplinaryMeasureUpdateSchema = z
	.object({
		incidentDateKey: dateKeySchema.optional(),
		reason: z.string().trim().min(1).max(6000).optional(),
		policyReference: z.string().trim().max(2000).nullable().optional(),
		outcome: disciplinaryOutcomeEnum.optional(),
		suspensionStartDateKey: dateKeySchema.nullable().optional(),
		suspensionEndDateKey: dateKeySchema.nullable().optional(),
	})
	.superRefine((value, ctx) => {
		if (value.outcome !== 'suspension') {
			if (value.suspensionStartDateKey || value.suspensionEndDateKey) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['outcome'],
					message: 'suspension date range can only be set for suspension outcome',
				});
			}
			return;
		}

		if (!value.suspensionStartDateKey) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['suspensionStartDateKey'],
				message: 'suspensionStartDateKey is required for suspension outcome',
			});
		}
		if (!value.suspensionEndDateKey) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['suspensionEndDateKey'],
				message: 'suspensionEndDateKey is required for suspension outcome',
			});
		}

		if (value.suspensionStartDateKey && value.suspensionEndDateKey) {
			const result = validateSuspensionWindow(
				value.suspensionStartDateKey,
				value.suspensionEndDateKey,
			);
			if (!result.isValid) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['suspensionEndDateKey'],
					message: result.message,
				});
			}
		}
	});

/**
 * Measure route params.
 */
export const disciplinaryMeasureIdParamsSchema = idParamSchema;

/**
 * Payload for acta generation.
 */
export const disciplinaryGenerateActaSchema = z.object({
	templateId: z.string().uuid().optional(),
});

/**
 * Payload for refusal certificate generation.
 */
export const disciplinaryGenerateRefusalSchema = z.object({
	templateId: z.string().uuid().optional(),
	refusalReason: z.string().trim().max(2000).optional(),
});

/**
 * Signed acta confirmation payload.
 */
export const disciplinarySignedActaConfirmSchema = disciplinaryFileConfirmSchema.extend({
	docVersionId: z.string().uuid(),
	generationId: z.string().uuid(),
	signedAtDateKey: dateKeySchema.optional(),
});

/**
 * Refusal certificate confirmation payload.
 */
export const disciplinaryRefusalConfirmSchema = disciplinaryFileConfirmSchema.extend({
	docVersionId: z.string().uuid(),
	generationId: z.string().uuid(),
	signedAtDateKey: dateKeySchema.optional(),
});

/**
 * Attachment confirmation payload.
 */
export const disciplinaryAttachmentConfirmSchema = disciplinaryFileConfirmSchema.extend({
	attachmentId: z.string().uuid(),
});

/**
 * Attachment path params.
 */
export const disciplinaryAttachmentDeleteParamsSchema = z.object({
	id: z.string().uuid(),
	attachmentId: z.string().uuid(),
});

/**
 * Payload used to close a disciplinary measure.
 */
export const disciplinaryCloseSchema = z.object({
	signatureStatus: disciplinarySignatureStatusEnum,
	notes: z.string().trim().max(4000).optional(),
});

/**
 * Params for disciplinary document URL lookup.
 */
export const disciplinaryDocumentUrlParamsSchema = z.object({
	id: z.string().uuid(),
	documentVersionId: z.string().uuid(),
});

export type DisciplinaryMeasuresQueryInput = z.infer<typeof disciplinaryMeasuresQuerySchema>;
export type DisciplinaryKpisQueryInput = z.infer<typeof disciplinaryKpisQuerySchema>;
export type DisciplinaryMeasureCreateInput = z.infer<typeof disciplinaryMeasureCreateSchema>;
export type DisciplinaryMeasureUpdateInput = z.infer<typeof disciplinaryMeasureUpdateSchema>;
export type DisciplinaryGenerateActaInput = z.infer<typeof disciplinaryGenerateActaSchema>;
export type DisciplinaryGenerateRefusalInput = z.infer<
	typeof disciplinaryGenerateRefusalSchema
>;
export type DisciplinarySignedActaConfirmInput = z.infer<
	typeof disciplinarySignedActaConfirmSchema
>;
export type DisciplinaryRefusalConfirmInput = z.infer<
	typeof disciplinaryRefusalConfirmSchema
>;
export type DisciplinaryAttachmentConfirmInput = z.infer<
	typeof disciplinaryAttachmentConfirmSchema
>;
export type DisciplinaryCloseInput = z.infer<typeof disciplinaryCloseSchema>;
