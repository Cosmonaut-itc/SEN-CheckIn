import { z } from 'zod';

import { isValidIanaTimeZone } from '../utils/time-zone.js';
import { parseDateKey } from '../utils/date-key.js';

/**
 * Enum for supported payment frequencies.
 */
export const paymentFrequencyEnum = z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']);

/**
 * Enum for overtime enforcement behavior.
 */
export const overtimeEnforcementEnum = z.enum(['WARN', 'BLOCK']);

/**
 * Enum for PTU mode behavior.
 */
export const ptuModeEnum = z.enum(['DEFAULT_RULES', 'MANUAL']);

/**
 * Enum for employer type (persona moral/física).
 */
export const employerTypeEnum = z.enum(['PERSONA_MORAL', 'PERSONA_FISICA']);

/**
 * Schema for updating/creating payroll settings.
 */
export const payrollSettingsSchema = z.object({
	weekStartDay: z.number().int().min(0).max(6).optional(),
	timeZone: z
		.string()
		.min(1, 'Time zone is required')
		.max(255)
		.refine(isValidIanaTimeZone, { message: 'Invalid IANA time zone' })
		.optional(),
	organizationId: z.string().optional(),
	overtimeEnforcement: overtimeEnforcementEnum.default('WARN').optional(),
	additionalMandatoryRestDays: z
		.array(
			z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
				.refine((value) => {
					try {
						parseDateKey(value);
						return true;
					} catch {
						return false;
					}
				}, 'Invalid calendar date'),
		)
		.optional(),
	riskWorkRate: z.coerce.number().min(0).max(1).optional(),
	statePayrollTaxRate: z.coerce.number().min(0).max(1).optional(),
	absorbImssEmployeeShare: z.boolean().optional(),
	absorbIsr: z.boolean().optional(),
	aguinaldoDays: z.coerce.number().int().min(0).optional(),
	vacationPremiumRate: z.coerce.number().min(0.25).max(1).optional(),
	enableSeventhDayPay: z.boolean().optional(),
	autoDeductLunchBreak: z.boolean().optional(),
	lunchBreakMinutes: z.coerce.number().int().min(15).max(120).optional(),
	lunchBreakThresholdHours: z.coerce.number().min(4).max(10).optional(),
	countSaturdayAsWorkedForSeventhDay: z.boolean().optional(),
	ptuEnabled: z.boolean().optional(),
	ptuMode: ptuModeEnum.optional(),
	ptuIsExempt: z.boolean().optional(),
	ptuExemptReason: z.string().max(255).nullable().optional(),
	employerType: employerTypeEnum.optional(),
	aguinaldoEnabled: z.boolean().optional(),
	enableDisciplinaryMeasures: z.boolean().optional(),
});

/**
 * Schema for payroll calculation input.
 */
const payrollPeriodSchemaBase = z.object({
	periodStartDateKey: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
		.refine((value) => {
			try {
				parseDateKey(value);
				return true;
			} catch {
				return false;
			}
		}, 'Invalid calendar date'),
	periodEndDateKey: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
		.refine((value) => {
			try {
				parseDateKey(value);
				return true;
			} catch {
				return false;
			}
		}, 'Invalid calendar date'),
	paymentFrequency: paymentFrequencyEnum.optional(),
	organizationId: z.string().optional(),
});

/**
 * Schema for payroll calculation input.
 */
export const payrollCalculateSchema = payrollPeriodSchemaBase.superRefine((value, ctx) => {
	if (value.periodEndDateKey < value.periodStartDateKey) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['periodEndDateKey'],
			message: 'periodEndDateKey must be on or after periodStartDateKey',
		});
	}
});

/**
 * Schema for processing payroll (persists run and updates employees).
 */
export const payrollProcessSchema = payrollPeriodSchemaBase.superRefine((value, ctx) => {
	if (value.periodEndDateKey < value.periodStartDateKey) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['periodEndDateKey'],
			message: 'periodEndDateKey must be on or after periodStartDateKey',
		});
	}
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
	type: z.enum([
		'OVERTIME_DAILY_EXCEEDED',
		'OVERTIME_WEEKLY_EXCEEDED',
		'OVERTIME_WEEKLY_DAYS_EXCEEDED',
		'LUNCH_BREAK_AUTO_DEDUCTED',
		'OVERTIME_NOT_AUTHORIZED',
		'OVERTIME_EXCEEDED_AUTHORIZATION',
		'BELOW_MINIMUM_WAGE',
	]),
	message: z.string(),
	severity: z.enum(['warning', 'error']),
});

/**
 * Legal references used by payroll holiday notices.
 */
export const payrollHolidayLegalReferenceEnum = z.enum([
	'LFT Art. 74',
	'LFT Art. 75',
	'LFT Art. 74/75',
]);

/**
 * Employee-level holiday impact payload.
 */
export const payrollEmployeeHolidayImpactSchema = z.object({
	affectedHolidayDateKeys: z.array(
		z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
	),
	mandatoryPremiumAmount: z.number(),
});

/**
 * Payroll holiday notice payload.
 */
export const payrollHolidayNoticeSchema = z.object({
	kind: z.literal('HOLIDAY_PAYROLL_IMPACT'),
	title: z.string(),
	message: z.string(),
	legalReference: payrollHolidayLegalReferenceEnum,
	periodStartDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
	periodEndDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
	affectedHolidayDateKeys: z.array(
		z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
	),
	affectedEmployees: z.number().int().min(0),
	estimatedMandatoryPremiumTotal: z.number(),
	generatedAt: z.string(),
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
	seventhDayPay: z.number(),
	normalHours: z.number(),
	overtimeDoubleHours: z.number(),
	overtimeTripleHours: z.number(),
	payableOvertimeDoubleHours: z.number(),
	payableOvertimeTripleHours: z.number(),
	authorizedOvertimeHours: z.number(),
	unauthorizedOvertimeHours: z.number(),
	sundayHoursWorked: z.number(),
	mandatoryRestDaysWorkedCount: z.number(),
	mandatoryRestDayDateKeys: z.array(
		z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
	),
	normalPay: z.number(),
	overtimeDoublePay: z.number(),
	overtimeTriplePay: z.number(),
	sundayPremiumAmount: z.number(),
	mandatoryRestDayPremiumAmount: z.number(),
	vacationDaysPaid: z.number(),
	vacationPayAmount: z.number(),
	vacationPremiumAmount: z.number(),
	lunchBreakAutoDeductedDays: z.number(),
	lunchBreakAutoDeductedMinutes: z.number(),
	totalPay: z.number(),
	grossPay: z.number(),
	bases: z.object({
		sbcDaily: z.number(),
		sbcPeriod: z.number(),
		isrBase: z.number(),
		daysInPeriod: z.number(),
		umaDaily: z.number(),
		minimumWageDaily: z.number(),
	}),
	employeeWithholdings: z.object({
		imssEmployee: z.object({
			emExcess: z.number(),
			pd: z.number(),
			gmp: z.number(),
			iv: z.number(),
			cv: z.number(),
			total: z.number(),
		}),
		isrWithheld: z.number(),
		infonavitCredit: z.number(),
		total: z.number(),
	}),
	employerCosts: z.object({
		imssEmployer: z.object({
			emFixed: z.number(),
			emExcess: z.number(),
			pd: z.number(),
			gmp: z.number(),
			iv: z.number(),
			cv: z.number(),
			guarderias: z.number(),
			total: z.number(),
		}),
		sarRetiro: z.number(),
		infonavit: z.number(),
		isn: z.number(),
		riskWork: z.number(),
		absorbedImssEmployeeShare: z.number(),
		absorbedIsr: z.number(),
		total: z.number(),
	}),
	informationalLines: z.object({
		isrBeforeSubsidy: z.number(),
		subsidyApplied: z.number(),
	}),
	netPay: z.number(),
	companyCost: z.number(),
	incapacitySummary: z.object({
		daysIncapacityTotal: z.number(),
		expectedImssSubsidyAmount: z.number(),
		byType: z.object({
			EG: z.object({
				days: z.number(),
				subsidyDays: z.number(),
				subsidyRate: z.number(),
				expectedSubsidyAmount: z.number(),
			}),
			RT: z.object({
				days: z.number(),
				subsidyDays: z.number(),
				subsidyRate: z.number(),
				expectedSubsidyAmount: z.number(),
			}),
			MAT: z.object({
				days: z.number(),
				subsidyDays: z.number(),
				subsidyRate: z.number(),
				expectedSubsidyAmount: z.number(),
			}),
			LIC140BIS: z.object({
				days: z.number(),
				subsidyDays: z.number(),
				subsidyRate: z.number(),
				expectedSubsidyAmount: z.number(),
			}),
		}),
	}),
	warnings: z.array(payrollWarningSchema),
	holidayImpact: payrollEmployeeHolidayImpactSchema.optional(),
});

export const payrollTaxSummarySchema = z.object({
	grossTotal: z.number(),
	employeeWithholdingsTotal: z.number(),
	employerCostsTotal: z.number(),
	netPayTotal: z.number(),
	companyCostTotal: z.number(),
});

export type PaymentFrequency = z.infer<typeof paymentFrequencyEnum>;
export type PayrollSettingsInput = z.infer<typeof payrollSettingsSchema>;
export type PayrollCalculateInput = z.infer<typeof payrollCalculateSchema>;
export type PayrollProcessInput = z.infer<typeof payrollProcessSchema>;
export type PayrollRunQuery = z.infer<typeof payrollRunQuerySchema>;
export type PayrollWarning = z.infer<typeof payrollWarningSchema>;
export type PayrollEmployeeHolidayImpact = z.infer<typeof payrollEmployeeHolidayImpactSchema>;
export type PayrollHolidayNotice = z.infer<typeof payrollHolidayNoticeSchema>;
export type PayrollEmployeeBreakdown = z.infer<typeof payrollEmployeeBreakdownSchema>;
export type PayrollTaxSummary = z.infer<typeof payrollTaxSummarySchema>;
export type OvertimeEnforcement = z.infer<typeof overtimeEnforcementEnum>;
