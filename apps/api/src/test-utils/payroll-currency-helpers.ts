import { expect } from 'bun:test';

import { roundCurrency } from '../utils/money.js';

interface FiscalVoucherDeduction {
	satDeductionCode: string | null;
	appliedAmount: number;
}

/**
 * Sums numeric values and rounds to currency precision.
 *
 * @param values - Numeric values to sum
 * @returns Rounded currency sum
 */
export function sumCurrency(values: number[]): number {
	return roundCurrency(values.reduce((total, value) => total + value, 0));
}

/**
 * Asserts currency values with a small tolerance for third-party rounding drift.
 *
 * @param actual - Actual amount
 * @param expected - Expected amount
 * @param tolerance - Accepted absolute difference
 * @returns Nothing
 */
export function expectCurrencyClose(actual: number, expected: number, tolerance = 0.02): void {
	expect(Math.abs(roundCurrency(actual - expected))).toBeLessThanOrEqual(tolerance);
}

/**
 * Calculates deductions that should appear on the fiscal payroll voucher.
 *
 * @param employeeWithholdingsTotal - ISR/IMSS employee withholding total
 * @param deductionsBreakdown - Payroll deduction breakdown rows
 * @returns ISR/IMSS plus SAT-coded deductions
 */
export function calculateFiscalVoucherDeductions(
	employeeWithholdingsTotal: number,
	deductionsBreakdown: FiscalVoucherDeduction[],
): number {
	const satCodedDeductions = deductionsBreakdown
		.filter((deduction) => deduction.satDeductionCode !== null)
		.map((deduction) => deduction.appliedAmount);

	return sumCurrency([employeeWithholdingsTotal, ...satCodedDeductions]);
}
