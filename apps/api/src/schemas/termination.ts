import { z } from 'zod';

import { dateKeySchema } from './vacations.js';

/**
 * Termination reason enumeration.
 */
export const terminationReasonEnum = z.enum([
	'voluntary_resignation',
	'justified_rescission',
	'unjustified_dismissal',
	'end_of_contract',
	'mutual_agreement',
	'death',
]);

/**
 * Employment contract type enumeration.
 */
export const employmentContractTypeEnum = z.enum(['indefinite', 'fixed_term', 'specific_work']);

/**
 * Validates that the last day worked does not exceed termination date.
 *
 * @param value - Termination payload
 * @param ctx - Zod refinement context
 * @returns Nothing
 */
function validateTerminationDates(
	value: { terminationDateKey: string; lastDayWorkedDateKey?: string | undefined },
	ctx: z.RefinementCtx,
): void {
	if (value.lastDayWorkedDateKey && value.lastDayWorkedDateKey > value.terminationDateKey) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['lastDayWorkedDateKey'],
			message: 'lastDayWorkedDateKey must be on or before terminationDateKey',
		});
	}
}

/**
 * Schema for termination preview and confirmation inputs.
 */
export const employeeTerminationSchema = z
	.object({
		terminationDateKey: dateKeySchema,
		lastDayWorkedDateKey: dateKeySchema.optional(),
		terminationReason: terminationReasonEnum,
		contractType: employmentContractTypeEnum,
		unpaidDays: z.coerce.number().min(0),
		otherDue: z.coerce.number().min(0),
		vacationBalanceDays: z.coerce.number().min(0).nullable().optional(),
		dailySalaryIndemnizacion: z.coerce.number().positive().nullable().optional(),
		terminationNotes: z.string().max(1000).nullable().optional(),
	})
	.superRefine(validateTerminationDates);

export type EmployeeTerminationInput = z.infer<typeof employeeTerminationSchema>;
export type TerminationReason = z.infer<typeof terminationReasonEnum>;
export type EmploymentContractType = z.infer<typeof employmentContractTypeEnum>;
