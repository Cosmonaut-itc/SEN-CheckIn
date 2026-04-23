import { describe, expect, it } from 'bun:test';

import {
	calculateFiscalVoucherDeductions,
	expectCurrencyClose,
	sumCurrency,
} from '../test-utils/payroll-currency-helpers.js';
import { roundCurrency } from '../utils/money.js';
import { calculatePayrollFromData, type PayrollCalculationRow } from './payroll-calculation.js';
import {
	AET_P10_EFECTIVO_LISTA_RAYA_EXPECTED,
	AET_P10_TDD_LISTA_RAYA_EXPECTED,
	buildAetP10PayrollArgs,
	getAetP10EmployeeFixtures,
	type AetP10EmployeeFixture,
} from './payroll-real-fixtures.test-data.js';

/**
 * Returns the row for a fixture employee.
 *
 * @param rows - Calculation rows
 * @param fixture - Source employee fixture
 * @returns Matching calculation row
 * @throws Error when the row is missing
 */
function requireFixtureRow(
	rows: PayrollCalculationRow[],
	fixture: AetP10EmployeeFixture,
): PayrollCalculationRow {
	const row = rows.find((entry) => entry.employeeId === fixture.id);
	if (!row) {
		throw new Error(`Missing payroll row for ${fixture.id}.`);
	}
	return row;
}

/**
 * Resolves the fiscal gross pay from a payroll row.
 *
 * @param row - Payroll calculation row
 * @returns Fiscal gross pay when dual payroll is active, otherwise gross pay
 */
function getFiscalGrossPay(row: PayrollCalculationRow): number {
	return row.fiscalGrossPay ?? row.grossPay;
}

describe('payroll real CONTPAQi fixtures', () => {
	it('matches AET TDD lista de raya period 10 2026 and workbook real net pay', () => {
		const calculation = calculatePayrollFromData(buildAetP10PayrollArgs({ scope: 'TDD' }));
		const fixtures = getAetP10EmployeeFixtures('TDD');

		expect(calculation.employees).toHaveLength(AET_P10_TDD_LISTA_RAYA_EXPECTED.employeeCount);

		const fiscalGrossTotal = sumCurrency(calculation.employees.map(getFiscalGrossPay));
		const fiscalVoucherDeductionsTotal = sumCurrency(
			calculation.employees.map((row) =>
				calculateFiscalVoucherDeductions(
					row.employeeWithholdings.total,
					row.deductionsBreakdown,
				),
			),
		);
		const fiscalNetPayTotal = roundCurrency(
			fiscalGrossTotal - fiscalVoucherDeductionsTotal,
		);

		expectCurrencyClose(
			fiscalGrossTotal,
			AET_P10_TDD_LISTA_RAYA_EXPECTED.fiscalGrossTotal,
			0.01,
		);
		expectCurrencyClose(
			fiscalVoucherDeductionsTotal,
			AET_P10_TDD_LISTA_RAYA_EXPECTED.fiscalVoucherDeductionsTotal,
		);
		expectCurrencyClose(fiscalNetPayTotal, AET_P10_TDD_LISTA_RAYA_EXPECTED.fiscalNetPayTotal);
		expectCurrencyClose(
			calculation.taxSummary.employerCostsTotal,
			AET_P10_TDD_LISTA_RAYA_EXPECTED.employerCostsTotal,
			0.01,
		);
		expectCurrencyClose(
			calculation.taxSummary.grossTotal,
			AET_P10_TDD_LISTA_RAYA_EXPECTED.realGrossTotal,
			0.01,
		);
		expectCurrencyClose(
			calculation.taxSummary.netPayTotal,
			AET_P10_TDD_LISTA_RAYA_EXPECTED.realNetPayTotal,
		);

		for (const fixture of fixtures) {
			const row = requireFixtureRow(calculation.employees, fixture);
			const fiscalGrossPay = getFiscalGrossPay(row);
			const fiscalVoucherDeductions = calculateFiscalVoucherDeductions(
				row.employeeWithholdings.total,
				row.deductionsBreakdown,
			);

			expectCurrencyClose(fiscalGrossPay, fixture.expectedFiscalGrossPay, 0.01);
			expectCurrencyClose(
				roundCurrency(fiscalGrossPay - fiscalVoucherDeductions),
				fixture.expectedFiscalNetPay,
			);
			expectCurrencyClose(row.totalRealPay ?? row.grossPay, fixture.expectedRealGrossPay);
			expectCurrencyClose(row.netPay, fixture.expectedRealNetPay);
		}
	});

	it('matches AET efectivo lista de raya period 10 2026', () => {
		const calculation = calculatePayrollFromData(
			buildAetP10PayrollArgs({
				scope: 'EFECTIVO',
				includeWorkbookInternalDeductions: false,
			}),
		);

		expect(calculation.employees).toHaveLength(
			AET_P10_EFECTIVO_LISTA_RAYA_EXPECTED.employeeCount,
		);

		const fiscalGrossTotal = sumCurrency(calculation.employees.map(getFiscalGrossPay));
		const fiscalVoucherDeductionsTotal = sumCurrency(
			calculation.employees.map((row) =>
				calculateFiscalVoucherDeductions(
					row.employeeWithholdings.total,
					row.deductionsBreakdown,
				),
			),
		);
		const fiscalNetPayTotal = roundCurrency(
			fiscalGrossTotal - fiscalVoucherDeductionsTotal,
		);

		expectCurrencyClose(
			fiscalGrossTotal,
			AET_P10_EFECTIVO_LISTA_RAYA_EXPECTED.fiscalGrossTotal,
			0.01,
		);
		expectCurrencyClose(
			fiscalVoucherDeductionsTotal,
			AET_P10_EFECTIVO_LISTA_RAYA_EXPECTED.fiscalVoucherDeductionsTotal,
			0.01,
		);
		expectCurrencyClose(
			fiscalNetPayTotal,
			AET_P10_EFECTIVO_LISTA_RAYA_EXPECTED.fiscalNetPayTotal,
			0.01,
		);
		expectCurrencyClose(
			calculation.taxSummary.employerCostsTotal,
			AET_P10_EFECTIVO_LISTA_RAYA_EXPECTED.employerCostsTotal,
			0.01,
		);
		expectCurrencyClose(
			calculation.taxSummary.netPayTotal,
			AET_P10_EFECTIVO_LISTA_RAYA_EXPECTED.realNetPayTotal,
			0.01,
		);
	});
});
