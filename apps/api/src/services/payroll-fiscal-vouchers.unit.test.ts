import { describe, expect, it } from 'bun:test';

import {
	calculateFiscalVoucherDeductions,
	expectCurrencyClose,
	sumCurrency,
} from '../test-utils/payroll-currency-helpers.js';
import { roundCurrency } from '../utils/money.js';
import { calculatePayrollFromData } from './payroll-calculation.js';
import {
	AET_P10_TDD_LISTA_RAYA_EXPECTED,
	buildAetP10PayrollArgs,
	getAetP10EmployeeFixtures,
} from './payroll-real-fixtures.test-data.js';
import {
	buildPayrollFiscalVoucherFromCalculationRow,
	validatePayrollFiscalVoucher,
} from './payroll-fiscal-vouchers.js';

describe('payroll fiscal vouchers', () => {
	it('builds CONTPAQi-parity fiscal voucher totals from AET lista de raya rows', () => {
		const calculation = calculatePayrollFromData(buildAetP10PayrollArgs({ scope: 'TDD' }));
		const fixtures = getAetP10EmployeeFixtures('TDD');
		const vouchers = calculation.employees.map((row) =>
			buildPayrollFiscalVoucherFromCalculationRow({
				row,
				payrollRunId: 'run-aet-p10',
				payrollRunEmployeeId: `line-${row.employeeId}`,
				organizationId: 'org-aet',
				issuer: {
					name: 'AET',
					rfc: 'AET010101AAA',
					fiscalRegime: '601',
					expeditionPostalCode: '64000',
				},
				receiver: {
					name: row.name,
					rfc: 'XAXX010101000',
					curp: 'XAXX010101HNEXXXA4',
					nss: '12345678901',
					fiscalRegime: '605',
					fiscalPostalCode: '64000',
					contractType: '01',
					workdayType: '01',
				},
				periodStartDateKey: '2026-03-02',
				periodEndDateKey: '2026-03-08',
				paymentDateKey: '2026-03-08',
			}),
		);

		const fiscalGrossTotal = sumCurrency(
			vouchers.map((voucher) => voucher.totals.totalPerceptions),
		);
		const fiscalDeductionsTotal = sumCurrency(
			vouchers.map((voucher) => voucher.totals.totalDeductions),
		);
		const fiscalNetTotal = sumCurrency(vouchers.map((voucher) => voucher.totals.netPay));

		expectCurrencyClose(
			fiscalGrossTotal,
			AET_P10_TDD_LISTA_RAYA_EXPECTED.fiscalGrossTotal,
			0.01,
		);
		expectCurrencyClose(
			fiscalDeductionsTotal,
			AET_P10_TDD_LISTA_RAYA_EXPECTED.fiscalVoucherDeductionsTotal,
		);
		expectCurrencyClose(
			fiscalNetTotal,
			AET_P10_TDD_LISTA_RAYA_EXPECTED.fiscalNetPayTotal,
		);

		for (const fixture of fixtures) {
			const voucher = vouchers.find((entry) => entry.employeeId === fixture.id);
			const row = calculation.employees.find((entry) => entry.employeeId === fixture.id);

			if (!voucher || !row) {
				throw new Error(`Missing voucher for ${fixture.id}.`);
			}

			const expectedDeductions = calculateFiscalVoucherDeductions(
				row.employeeWithholdings.total,
				row.deductionsBreakdown,
			);

			expectCurrencyClose(voucher.totals.totalPerceptions, fixture.expectedFiscalGrossPay);
			expectCurrencyClose(voucher.totals.totalDeductions, expectedDeductions);
			expectCurrencyClose(voucher.totals.netPay, fixture.expectedFiscalNetPay);
			expect(voucher.perceptions[0]).toMatchObject({
				internalType: 'FISCAL_GROSS_PAY',
				satTypeCode: '001',
			});
		}
	});

	it('keeps real dual-payroll complement outside the fiscal voucher by default', () => {
		const calculation = calculatePayrollFromData(buildAetP10PayrollArgs({ scope: 'TDD' }));
		const row = calculation.employees.find((entry) => entry.complementPay !== null);

		if (!row || row.fiscalGrossPay === null || row.complementPay === null) {
			throw new Error('Expected a dual payroll row with complement pay.');
		}

		const voucher = buildPayrollFiscalVoucherFromCalculationRow({
			row,
			payrollRunId: 'run-aet-p10',
			payrollRunEmployeeId: `line-${row.employeeId}`,
			organizationId: 'org-aet',
			issuer: {
				name: 'AET',
				rfc: 'AET010101AAA',
				fiscalRegime: '601',
				expeditionPostalCode: '64000',
			},
			receiver: {
				name: row.name,
				rfc: 'XAXX010101000',
				curp: 'XAXX010101HNEXXXA4',
				nss: '12345678901',
				fiscalRegime: '605',
				fiscalPostalCode: '64000',
				contractType: '01',
				workdayType: '01',
			},
			periodStartDateKey: '2026-03-02',
			periodEndDateKey: '2026-03-08',
			paymentDateKey: '2026-03-08',
		});

		expect(voucher.realPayrollComplementPay).toBe(row.complementPay);
		expect(voucher.totals.totalPerceptions).toBe(row.fiscalGrossPay);
		expect(voucher.perceptions.map((line) => line.internalType as string)).not.toContain(
			'REAL_COMPLEMENT',
		);
	});

	it('validates missing SAT-required fiscal data before stamping', () => {
		const calculation = calculatePayrollFromData(buildAetP10PayrollArgs({ scope: 'TDD' }));
		const row = calculation.employees[0];

		if (!row) {
			throw new Error('Expected at least one payroll row.');
		}

		const voucher = buildPayrollFiscalVoucherFromCalculationRow({
			row,
			payrollRunId: 'run-aet-p10',
			payrollRunEmployeeId: `line-${row.employeeId}`,
			organizationId: 'org-aet',
			issuer: {
				name: 'AET',
				rfc: null,
				fiscalRegime: null,
				expeditionPostalCode: null,
			},
			receiver: {
				name: row.name,
				rfc: null,
				curp: null,
				nss: null,
				fiscalRegime: null,
				fiscalPostalCode: null,
				contractType: null,
				workdayType: null,
			},
			periodStartDateKey: '2026-03-02',
			periodEndDateKey: '2026-03-08',
			paymentDateKey: null,
		});

		const result = validatePayrollFiscalVoucher(voucher);

		expect(result.status).toBe('BLOCKED');
		expect(result.errors.map((error) => error.code)).toEqual([
			'ISSUER_RFC_REQUIRED',
			'ISSUER_FISCAL_REGIME_REQUIRED',
			'ISSUER_EXPEDITION_POSTAL_CODE_REQUIRED',
			'RECEIVER_RFC_REQUIRED',
			'RECEIVER_CURP_REQUIRED',
			'RECEIVER_NSS_REQUIRED',
			'RECEIVER_FISCAL_REGIME_REQUIRED',
			'RECEIVER_FISCAL_POSTAL_CODE_REQUIRED',
			'RECEIVER_CONTRACT_TYPE_REQUIRED',
			'RECEIVER_WORKDAY_TYPE_REQUIRED',
			'PAYMENT_DATE_REQUIRED',
		]);
	});

	it('blocks vouchers whose totals drift from perception minus deduction arithmetic', () => {
		const calculation = calculatePayrollFromData(buildAetP10PayrollArgs({ scope: 'TDD' }));
		const row = calculation.employees[0];

		if (!row) {
			throw new Error('Expected at least one payroll row.');
		}

		const voucher = buildPayrollFiscalVoucherFromCalculationRow({
			row,
			payrollRunId: 'run-aet-p10',
			payrollRunEmployeeId: `line-${row.employeeId}`,
			organizationId: 'org-aet',
			issuer: {
				name: 'AET',
				rfc: 'AET010101AAA',
				fiscalRegime: '601',
				expeditionPostalCode: '64000',
			},
			receiver: {
				name: row.name,
				rfc: 'XAXX010101000',
				curp: 'XAXX010101HNEXXXA4',
				nss: '12345678901',
				fiscalRegime: '605',
				fiscalPostalCode: '64000',
				contractType: '01',
				workdayType: '01',
			},
			periodStartDateKey: '2026-03-02',
			periodEndDateKey: '2026-03-08',
			paymentDateKey: '2026-03-08',
		});
		const driftedVoucher = {
			...voucher,
			totals: {
				...voucher.totals,
				netPay: roundCurrency(voucher.totals.netPay + 1),
			},
		};

		const result = validatePayrollFiscalVoucher(driftedVoucher);

		expect(result.status).toBe('BLOCKED');
		expect(result.errors.map((error) => error.code)).toContain('NET_PAY_TOTAL_MISMATCH');
	});
});
