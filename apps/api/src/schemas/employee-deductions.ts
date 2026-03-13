import { z } from 'zod';

import { parseDateKey } from '../utils/date-key.js';

const MAX_DEDUCTION_VALUE = 999999.9999;
const MAX_DEDUCTION_AMOUNT = 9999999999.99;

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
 * Supported deduction types.
 */
export const deductionTypeSchema = z.enum([
	'INFONAVIT',
	'ALIMONY',
	'FONACOT',
	'LOAN',
	'UNION_FEE',
	'ADVANCE',
	'OTHER',
]);

/**
 * Supported deduction calculation methods.
 */
export const deductionCalculationMethodSchema = z.enum([
	'PERCENTAGE_SBC',
	'PERCENTAGE_NET',
	'PERCENTAGE_GROSS',
	'FIXED_AMOUNT',
	'VSM_FACTOR',
]);

/**
 * Supported deduction frequencies.
 */
export const deductionFrequencySchema = z.enum(['RECURRING', 'ONE_TIME', 'INSTALLMENTS']);

/**
 * Supported deduction statuses.
 */
export const deductionStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']);

/**
 * Status values that are allowed through the mutation API.
 * COMPLETED is system-managed by payroll processing.
 */
export const deductionMutableStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']);

/**
 * Deduction value numeric validator.
 */
const deductionValueSchema = z.coerce
	.number()
	.positive('value must be greater than 0')
	.max(MAX_DEDUCTION_VALUE, `value must be less than or equal to ${MAX_DEDUCTION_VALUE}`);

/**
 * Deduction amount numeric validator.
 */
const deductionAmountSchema = z.coerce
	.number()
	.nonnegative('amount must be greater than or equal to 0')
	.max(MAX_DEDUCTION_AMOUNT, `amount must be less than or equal to ${MAX_DEDUCTION_AMOUNT}`);

/**
 * Path params for organization/employee-scoped deduction routes.
 */
export const employeeDeductionParamsSchema = z.object({
	organizationId: z.string().min(1, 'organizationId is required'),
	employeeId: z.string().min(1, 'employeeId is required'),
});

/**
 * Path params for a single deduction route.
 */
export const employeeDeductionDetailParamsSchema = employeeDeductionParamsSchema.extend({
	id: z.string().min(1, 'id is required'),
});

/**
 * Create payload for employee deductions.
 */
export const employeeDeductionCreateSchema = z
	.object({
		type: deductionTypeSchema,
		label: z.string().trim().min(1, 'label is required').max(150),
		calculationMethod: deductionCalculationMethodSchema,
		value: deductionValueSchema,
		frequency: deductionFrequencySchema,
		totalInstallments: z.coerce.number().int().positive().optional(),
		totalAmount: deductionAmountSchema.optional(),
		remainingAmount: deductionAmountSchema.optional(),
		startDateKey: dateKeySchema,
		endDateKey: dateKeySchema.optional(),
		referenceNumber: z.string().trim().max(120).optional(),
		satDeductionCode: z.string().trim().max(20).optional(),
		notes: z.string().trim().max(1000).optional(),
	})
	.strict();

/**
 * Update payload for employee deductions.
 */
export const employeeDeductionUpdateSchema = z
	.object({
		label: z.string().trim().min(1).max(150).optional(),
		value: deductionValueSchema.optional(),
		frequency: deductionFrequencySchema.optional(),
		totalInstallments: z.coerce.number().int().positive().nullable().optional(),
		totalAmount: deductionAmountSchema.nullable().optional(),
		remainingAmount: deductionAmountSchema.nullable().optional(),
		status: deductionMutableStatusSchema.optional(),
		startDateKey: dateKeySchema.optional(),
		endDateKey: dateKeySchema.nullable().optional(),
		referenceNumber: z.string().trim().max(120).nullable().optional(),
		satDeductionCode: z.string().trim().max(20).nullable().optional(),
		notes: z.string().trim().max(1000).nullable().optional(),
	})
	.strict()
	.refine((value) => Object.keys(value).length > 0, {
		message: 'At least one field must be provided for update',
	});

/**
 * Query filters for listing deductions on a single employee.
 */
export const employeeDeductionListQuerySchema = z.object({
	status: deductionStatusSchema.optional(),
	type: deductionTypeSchema.optional(),
});

/**
 * Query filters for listing organization-wide deductions.
 */
export const organizationDeductionListQuerySchema = z.object({
	status: deductionStatusSchema.optional(),
	type: deductionTypeSchema.optional(),
	employeeId: z.string().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).default(0),
});

export type EmployeeDeductionCreateInput = z.infer<typeof employeeDeductionCreateSchema>;
export type EmployeeDeductionUpdateInput = z.infer<typeof employeeDeductionUpdateSchema>;
export type EmployeeDeductionListQuery = z.infer<typeof employeeDeductionListQuerySchema>;
export type OrganizationDeductionListQuery = z.infer<typeof organizationDeductionListQuerySchema>;
