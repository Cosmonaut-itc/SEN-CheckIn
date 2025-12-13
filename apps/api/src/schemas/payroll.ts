import { z } from 'zod';

/**
 * Enum for supported payment frequencies.
 */
export const paymentFrequencyEnum = z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']);

/**
 * Enum for overtime enforcement behavior.
 */
export const overtimeEnforcementEnum = z.enum(['WARN', 'BLOCK']);

/**
 * Schema for updating/creating payroll settings.
 */
export const payrollSettingsSchema = z.object({
	weekStartDay: z.number().int().min(0).max(6).default(1),
	organizationId: z.string().optional(),
	overtimeEnforcement: overtimeEnforcementEnum.default('WARN').optional(),
});

/**
 * Schema for payroll calculation input.
 */
export const payrollCalculateSchema = z.object({
	periodStart: z.coerce.date(),
	periodEnd: z.coerce.date(),
	paymentFrequency: paymentFrequencyEnum.optional(),
	organizationId: z.string().optional(),
});

/**
 * Schema for processing payroll (persists run and updates employees).
 */
export const payrollProcessSchema = payrollCalculateSchema.extend({
	// allow optional note or dry-run flag if needed later
});

/**
 * Schema for querying payroll runs.
 */
export const payrollRunQuerySchema = z.object({
	organizationId: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Warning emitted during payroll calculation.
 */
export const payrollWarningSchema = z.object({
	type: z.enum(['OVERTIME_DAILY_EXCEEDED', 'OVERTIME_WEEKLY_EXCEEDED', 'BELOW_MINIMUM_WAGE']),
	message: z.string(),
	severity: z.enum(['warning', 'error']),
});

/**
 * Detailed payroll breakdown per employee.
 */
export const payrollEmployeeBreakdownSchema = z.object({
	employeeId: z.string(),
	name: z.string(),
	shiftType: z.enum(['DIURNA', 'NOCTURNA', 'MIXTA']),
	dailyPay: z.number(),
	hourlyPay: z.number(),
	normalHours: z.number(),
	overtimeDoubleHours: z.number(),
	overtimeTripleHours: z.number(),
	sundayHoursWorked: z.number(),
	normalPay: z.number(),
	overtimeDoublePay: z.number(),
	overtimeTriplePay: z.number(),
	sundayPremiumAmount: z.number(),
	totalPay: z.number(),
	warnings: z.array(payrollWarningSchema),
});

export type PaymentFrequency = z.infer<typeof paymentFrequencyEnum>;
export type PayrollSettingsInput = z.infer<typeof payrollSettingsSchema>;
export type PayrollCalculateInput = z.infer<typeof payrollCalculateSchema>;
export type PayrollProcessInput = z.infer<typeof payrollProcessSchema>;
export type PayrollRunQuery = z.infer<typeof payrollRunQuerySchema>;
export type PayrollWarning = z.infer<typeof payrollWarningSchema>;
export type PayrollEmployeeBreakdown = z.infer<typeof payrollEmployeeBreakdownSchema>;
export type OvertimeEnforcement = z.infer<typeof overtimeEnforcementEnum>;

