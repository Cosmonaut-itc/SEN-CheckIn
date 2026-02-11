import { z } from 'zod';

import { paginationSchema } from './crud.js';
import { dateKeySchema } from './vacations.js';

export const MAX_EMPLOYEE_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Enum schema for employee document requirement keys.
 */
export const employeeDocumentRequirementKeyEnum = z.enum([
	'IDENTIFICATION',
	'TAX_CONSTANCY',
	'PROOF_OF_ADDRESS',
	'SOCIAL_SECURITY_EVIDENCE',
	'EMPLOYMENT_PROFILE',
	'SIGNED_CONTRACT',
	'SIGNED_NDA',
]);

/**
 * Enum schema for employee document review statuses.
 */
export const employeeDocumentReviewStatusEnum = z.enum([
	'PENDING_REVIEW',
	'APPROVED',
	'REJECTED',
]);

/**
 * Enum schema for employee document sources.
 */
export const employeeDocumentSourceEnum = z.enum([
	'UPLOAD',
	'PHYSICAL_SIGNED_UPLOAD',
	'DIGITAL_SIGNATURE',
]);

/**
 * Enum schema for identification subtype.
 */
export const identificationSubtypeEnum = z.enum(['INE', 'PASSPORT', 'OTHER']);

/**
 * Enum schema for employment profile subtype.
 */
export const employmentProfileSubtypeEnum = z.enum(['CURRICULUM', 'JOB_APPLICATION']);

/**
 * Enum schema for legal document kind.
 */
export const legalDocumentKindEnum = z.enum([
	'CONTRACT',
	'NDA',
	'ACTA_ADMINISTRATIVA',
	'CONSTANCIA_NEGATIVA_FIRMA',
]);

/**
 * Enum schema for legal template status.
 */
export const legalTemplateStatusEnum = z.enum(['DRAFT', 'PUBLISHED']);

/**
 * Enum schema for workflow requirement activation stage.
 */
export const documentRequirementActivationStageEnum = z.enum(['BASE', 'LEGAL_AFTER_GATE']);

/**
 * Query schema for employee document history endpoint.
 */
export const employeeDocumentHistoryQuerySchema = paginationSchema.extend({
	requirementKey: z.preprocess(
		(value) => {
			if (value === undefined || value === null) {
				return undefined;
			}
			if (typeof value === 'string' && (value.trim() === '' || value === 'undefined')) {
				return undefined;
			}
			return value;
		},
		employeeDocumentRequirementKeyEnum.optional(),
	),
});

/**
 * Schema for generating presigned upload payloads.
 */
export const employeeDocumentPresignSchema = z.object({
	fileName: z.string().min(1).max(255),
	contentType: z.string().min(1).max(100),
	sizeBytes: z.coerce.number().int().positive(),
});

/**
 * Schema for confirming uploaded employee documents.
 */
export const employeeDocumentConfirmSchema = z.object({
	docVersionId: z.string().uuid(),
	objectKey: z.string().min(1),
	fileName: z.string().min(1).max(255),
	contentType: z.string().min(1).max(100),
	sizeBytes: z.coerce.number().int().positive(),
	sha256: z.string().min(1).max(128),
	source: employeeDocumentSourceEnum.optional(),
	generationId: z.string().uuid().optional(),
	identificationSubtype: identificationSubtypeEnum.optional(),
	employmentProfileSubtype: employmentProfileSubtypeEnum.optional(),
	signedAtDateKey: dateKeySchema.optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Schema for reviewing employee documents.
 */
export const employeeDocumentReviewSchema = z
	.object({
		reviewStatus: z.enum(['APPROVED', 'REJECTED']),
		reviewComment: z.string().trim().max(1000).optional(),
	})
	.superRefine((value, ctx) => {
		if (value.reviewStatus === 'REJECTED' && !value.reviewComment) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['reviewComment'],
				message: 'reviewComment is required when rejecting a document',
			});
		}
	});

/**
 * Schema for requirement configuration items.
 */
export const organizationDocumentRequirementConfigSchema = z.object({
	requirementKey: employeeDocumentRequirementKeyEnum,
	isRequired: z.boolean(),
	displayOrder: z.coerce.number().int().min(1),
	activationStage: documentRequirementActivationStageEnum,
});

/**
 * Schema for updating workflow configuration.
 */
export const documentWorkflowConfigUpdateSchema = z.object({
	baseApprovedThresholdForLegal: z.coerce.number().int().min(1).max(10).optional(),
	requirements: z.array(organizationDocumentRequirementConfigSchema).optional(),
});

/**
 * Schema for template draft creation.
 */
export const legalTemplateDraftSchema = z.object({
	htmlContent: z.string().min(1),
	variablesSchemaSnapshot: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Schema for legal template updates.
 */
export const legalTemplateUpdateSchema = z.object({
	htmlContent: z.string().min(1).optional(),
	status: legalTemplateStatusEnum.optional(),
	variablesSchemaSnapshot: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Schema for legal generation creation.
 */
export const legalGenerationCreateSchema = z.object({
	templateId: z.string().uuid().optional(),
}).default({});

/**
 * Schema for confirming a digital legal signature.
 */
export const legalDigitalSignConfirmSchema = z.object({
	generationId: z.string().uuid(),
	signedAtDateKey: dateKeySchema.optional(),
	signatureDataUrl: z.string().min(1).optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Schema for confirming a physical legal signature upload.
 */
export const legalPhysicalSignConfirmSchema = z.object({
	docVersionId: z.string().uuid(),
	generationId: z.string().uuid(),
	objectKey: z.string().min(1),
	fileName: z.string().min(1).max(255),
	contentType: z.string().min(1).max(100),
	sizeBytes: z.coerce.number().int().positive(),
	sha256: z.string().min(1).max(128),
	signedAtDateKey: dateKeySchema.optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Schema for legal branding upload presign.
 */
export const legalBrandingPresignSchema = z.object({
	fileName: z.string().min(1).max(255),
	contentType: z.string().min(1).max(100),
	sizeBytes: z.coerce.number().int().positive(),
});

/**
 * Schema for legal branding upload confirm.
 */
export const legalBrandingConfirmSchema = z.object({
	objectKey: z.string().min(1).optional(),
	fileName: z.string().min(1).max(255).optional(),
	contentType: z.string().min(1).max(100).optional(),
	sizeBytes: z.coerce.number().int().positive().optional(),
	sha256: z.string().min(1).max(128).optional(),
	displayName: z.string().max(255).optional(),
	headerText: z.string().max(2000).optional(),
});

export type EmployeeDocumentRequirementKeyInput = z.infer<
	typeof employeeDocumentRequirementKeyEnum
>;
export type EmployeeDocumentReviewStatusInput = z.infer<
	typeof employeeDocumentReviewStatusEnum
>;
export type EmployeeDocumentSourceInput = z.infer<typeof employeeDocumentSourceEnum>;
export type IdentificationSubtypeInput = z.infer<typeof identificationSubtypeEnum>;
export type EmploymentProfileSubtypeInput = z.infer<typeof employmentProfileSubtypeEnum>;
export type LegalDocumentKindInput = z.infer<typeof legalDocumentKindEnum>;
