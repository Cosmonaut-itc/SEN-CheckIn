import { z } from 'zod';

type GratificationStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export type PayrollRunEmployeeGratificationRow = {
	employeeId: string;
	taxBreakdown: unknown;
};

export type GratificationRollbackPlan = {
	gratificationId: string;
	employeeId: string;
	statusBefore: GratificationStatus;
	statusAfter: GratificationStatus;
	sourceAmount: string;
	periodicity: 'ONE_TIME' | 'RECURRING';
	applicationMode: 'MANUAL' | 'AUTOMATIC';
	sourceStartDateKey: string;
	sourceEndDateKey: string | null;
	notes: string | null;
};

const gratificationBreakdownItemSchema = z.object({
	gratificationId: z.string().min(1),
	periodicity: z.enum(['ONE_TIME', 'RECURRING']),
	applicationMode: z.enum(['MANUAL', 'AUTOMATIC']),
	sourceAmount: z.union([
		z.number().finite(),
		z
			.string()
			.trim()
			.regex(/^-?\d+(?:\.\d+)?$/)
			.transform((value) => Number(value)),
	]),
	sourceStartDateKey: z.string().min(1),
	sourceEndDateKey: z.string().nullable(),
	statusBefore: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']),
	statusAfter: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']),
	notes: z.string().nullable(),
});

type GratificationBreakdownItem = z.infer<typeof gratificationBreakdownItemSchema>;

const payrollTaxBreakdownSchema = z
	.object({
		gratificationsBreakdown: z.array(gratificationBreakdownItemSchema).default([]),
	})
	.passthrough();

/**
 * Parses persisted payroll gratification breakdown rows from JSONB.
 *
 * @param value - Raw JSONB value from `payroll_run_employee.tax_breakdown`
 * @returns Validated gratification breakdown items or an empty list when the snapshot is absent
 * @throws {Error} When persisted gratification data is malformed
 */
export function parseGratificationBreakdown(value: unknown): GratificationBreakdownItem[] {
	if (value === null || value === undefined) {
		return [];
	}

	return payrollTaxBreakdownSchema.parse(value).gratificationsBreakdown;
}

/**
 * Builds gratification rollback operations from persisted payroll snapshots.
 *
 * @param rows - Payroll run employee rows with persisted tax breakdown snapshots
 * @returns Gratification rollback plan derived from persisted snapshots
 * @throws {Error} When the persisted gratification JSON is malformed
 */
export function buildGratificationRollbackPlansFromRows(
	rows: ReadonlyArray<PayrollRunEmployeeGratificationRow>,
): GratificationRollbackPlan[] {
	const rollbacks: GratificationRollbackPlan[] = [];

	for (const row of rows) {
		const items = parseGratificationBreakdown(row.taxBreakdown);
		for (const item of items) {
			if (item.statusBefore === item.statusAfter) {
				continue;
			}

			rollbacks.push({
				gratificationId: item.gratificationId,
				employeeId: row.employeeId,
				statusBefore: item.statusBefore,
				statusAfter: item.statusAfter,
				sourceAmount: item.sourceAmount.toFixed(2),
				periodicity: item.periodicity,
				applicationMode: item.applicationMode,
				sourceStartDateKey: item.sourceStartDateKey,
				sourceEndDateKey: item.sourceEndDateKey,
				notes: item.notes,
			});
		}
	}

	return rollbacks;
}
