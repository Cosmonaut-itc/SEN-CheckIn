import { z } from 'zod';

import { parseDateKey } from '../utils/date-key.js';
import { employerTypeEnum, ptuModeEnum } from './payroll.js';
import { ptuEligibilityOverrideEnum } from './crud.js';

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Schema for date key strings (YYYY-MM-DD).
 */
const dateKeySchema = z
	.string()
	.regex(DATE_KEY_REGEX, 'Date must be YYYY-MM-DD')
	.refine((value) => {
		try {
			parseDateKey(value);
			return true;
		} catch {
			return false;
		}
	}, 'Invalid calendar date');

/**
 * Schema for PTU employee override inputs.
 */
export const ptuEmployeeOverrideSchema = z.object({
	employeeId: z.string().uuid('Invalid employee ID'),
	daysCounted: z.coerce.number().int().min(0).optional(),
	dailyQuota: z.coerce.number().min(0).optional(),
	annualSalaryBase: z.coerce.number().min(0).optional(),
	eligibilityOverride: ptuEligibilityOverrideEnum.optional(),
});

/**
 * Schema for PTU calculation inputs.
 */
export const ptuCalculateSchema = z.object({
	fiscalYear: z.coerce.number().int().min(2000),
	paymentDateKey: dateKeySchema,
	taxableIncome: z.coerce.number().min(0),
	ptuPercentage: z.coerce.number().min(0).max(1).optional(),
	includeInactive: z.boolean().optional(),
	smgDailyOverride: z.coerce.number().min(0).optional(),
	organizationId: z.string().optional(),
	employeeOverrides: z.array(ptuEmployeeOverrideSchema).optional(),
});

/**
 * Schema for PTU run creation inputs.
 */
export const ptuRunCreateSchema = ptuCalculateSchema;

/**
 * Schema for PTU run update inputs.
 */
export const ptuRunUpdateSchema = ptuCalculateSchema.partial({
	fiscalYear: true,
	paymentDateKey: true,
	taxableIncome: true,
});

/**
 * Schema for PTU run cancellation inputs.
 */
export const ptuRunCancelSchema = z.object({
	reason: z.string().min(3).max(500),
});

/**
 * Schema for PTU run list queries.
 */
export const ptuRunQuerySchema = z.object({
	organizationId: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0),
	fiscalYear: z.coerce.number().int().min(2000).optional(),
});

/**
 * Schema for PTU history upsert inputs.
 */
export const ptuHistoryUpsertSchema = z.object({
	fiscalYear: z.coerce.number().int().min(2000),
	amount: z.coerce.number().min(0),
});

/**
 * Schema for Aguinaldo employee override inputs.
 */
export const aguinaldoEmployeeOverrideSchema = z.object({
	employeeId: z.string().uuid('Invalid employee ID'),
	daysCounted: z.coerce.number().int().min(0).optional(),
	dailySalaryBase: z.coerce.number().min(0).optional(),
	aguinaldoDaysPolicy: z.coerce.number().int().min(0).optional(),
});

/**
 * Schema for Aguinaldo calculation inputs.
 */
export const aguinaldoCalculateSchema = z.object({
	calendarYear: z.coerce.number().int().min(2000),
	paymentDateKey: dateKeySchema,
	includeInactive: z.boolean().optional(),
	smgDailyOverride: z.coerce.number().min(0).optional(),
	organizationId: z.string().optional(),
	employeeOverrides: z.array(aguinaldoEmployeeOverrideSchema).optional(),
});

/**
 * Schema for Aguinaldo run creation inputs.
 */
export const aguinaldoRunCreateSchema = aguinaldoCalculateSchema;

/**
 * Schema for Aguinaldo run update inputs.
 */
export const aguinaldoRunUpdateSchema = aguinaldoCalculateSchema.partial({
	calendarYear: true,
	paymentDateKey: true,
});

/**
 * Schema for Aguinaldo run cancellation inputs.
 */
export const aguinaldoRunCancelSchema = z.object({
	reason: z.string().min(3).max(500),
});

/**
 * Schema for Aguinaldo run list queries.
 */
export const aguinaldoRunQuerySchema = z.object({
	organizationId: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0),
	calendarYear: z.coerce.number().int().min(2000).optional(),
});

/**
 * Schema for employer type validation (shared).
 */
export const employerTypeSchema = employerTypeEnum.optional();

/**
 * Schema for PTU mode validation (shared).
 */
export const ptuModeSchema = ptuModeEnum.optional();
