import { z } from 'zod';

type DeductionStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export type PayrollRunEmployeeDeductionRow = {
	employeeId: string;
	deductionsBreakdown: unknown;
};

export type DeductionRollbackPlan = {
	deductionId: string;
	employeeId: string;
	statusBefore: DeductionStatus;
	statusAfter: DeductionStatus;
	completedInstallmentsBefore: number;
	completedInstallmentsAfter: number;
	remainingAmountBefore: string | null;
	remainingAmountAfter: string | null;
	calculationMethod: string;
	frequency: string;
	sourceValue: string;
	sourceTotalInstallments: number | null;
	sourceTotalAmount: string | null;
	sourceStartDateKey: string;
	sourceEndDateKey: string | null;
};

const numericValueSchema = z.union([
	z.number().finite(),
	z
		.string()
		.trim()
		.regex(/^-?\d+(?:\.\d+)?$/)
		.transform((value) => Number(value)),
]);

const integerValueSchema = z.union([
	z.number().int(),
	z
		.string()
		.trim()
		.regex(/^-?\d+$/)
		.transform((value) => Number(value)),
]);

const nullableMoneyValueSchema = z.union([numericValueSchema, z.null()]);

const deductionBreakdownItemSchema = z.object({
	deductionId: z.string().min(1),
	calculationMethod: z.string().min(1),
	frequency: z.string().min(1),
	sourceValue: numericValueSchema,
	sourceTotalInstallments: integerValueSchema.nullable(),
	completedInstallmentsBefore: integerValueSchema,
	completedInstallmentsAfter: integerValueSchema,
	remainingAmountBefore: nullableMoneyValueSchema,
	remainingAmountAfter: nullableMoneyValueSchema,
	sourceTotalAmount: nullableMoneyValueSchema,
	statusBefore: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']),
	statusAfter: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']),
	sourceStartDateKey: z.string().min(1),
	sourceEndDateKey: z.string().nullable(),
});

type DeductionBreakdownItem = z.infer<typeof deductionBreakdownItemSchema>;

/**
 * Parses persisted payroll deduction breakdown rows from JSONB.
 *
 * @param value - Raw JSONB value from `payroll_run_employee.deductions_breakdown`
 * @returns Validated deduction breakdown items
 * @throws {Error} When persisted deduction data is malformed
 */
export function parseDeductionBreakdown(value: unknown): DeductionBreakdownItem[] {
	return z.array(deductionBreakdownItemSchema).parse(value);
}

/**
 * Normalizes a persisted Postgres numeric-like value to a fixed 2-decimal string.
 *
 * @param value - Database numeric value
 * @returns Fixed 2-decimal string or `null`
 * @throws {Error} When the value is not a valid numeric string or finite number
 */
export function normalizeDatabaseMoney(value: string | number | null): string | null {
	if (value === null) {
		return null;
	}

	return numericValueSchema.parse(value).toFixed(2);
}

/**
 * Normalizes a persisted Postgres numeric-like value to a fixed 4-decimal string.
 *
 * @param value - Database numeric value
 * @returns Fixed 4-decimal string
 * @throws {Error} When the value is not a valid numeric string or finite number
 */
export function normalizeDatabaseDecimal4(value: string | number): string {
	return numericValueSchema.parse(value).toFixed(4);
}

/**
 * Builds deduction rollback operations from persisted payroll snapshots.
 *
 * @param rows - Payroll run employee rows with persisted deductions breakdown snapshots
 * @returns Deduction rollback plan derived from persisted snapshots
 * @throws {Error} When the persisted deduction JSON is malformed
 */
export function buildDeductionRollbackPlansFromRows(
	rows: ReadonlyArray<PayrollRunEmployeeDeductionRow>,
): DeductionRollbackPlan[] {
	const rollbacks: DeductionRollbackPlan[] = [];

	for (const row of rows) {
		const items = parseDeductionBreakdown(row.deductionsBreakdown ?? []);
		for (const item of items) {
			const stateChanged =
				item.statusBefore !== item.statusAfter ||
				item.completedInstallmentsBefore !== item.completedInstallmentsAfter ||
				item.remainingAmountBefore !== item.remainingAmountAfter;

			if (!stateChanged) {
				continue;
			}

			rollbacks.push({
				deductionId: item.deductionId,
				employeeId: row.employeeId,
				statusBefore: item.statusBefore,
				statusAfter: item.statusAfter,
				completedInstallmentsBefore: item.completedInstallmentsBefore,
				completedInstallmentsAfter: item.completedInstallmentsAfter,
				remainingAmountBefore: item.remainingAmountBefore?.toFixed(2) ?? null,
				remainingAmountAfter: item.remainingAmountAfter?.toFixed(2) ?? null,
				calculationMethod: item.calculationMethod,
				frequency: item.frequency,
				sourceValue: item.sourceValue.toFixed(4),
				sourceTotalInstallments: item.sourceTotalInstallments,
				sourceTotalAmount: item.sourceTotalAmount?.toFixed(2) ?? null,
				sourceStartDateKey: item.sourceStartDateKey,
				sourceEndDateKey: item.sourceEndDateKey,
			});
		}
	}

	return rollbacks;
}
