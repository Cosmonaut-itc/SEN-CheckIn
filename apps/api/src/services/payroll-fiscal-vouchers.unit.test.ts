import { describe, expect, it } from 'bun:test';

import {
	calculateFiscalVoucherDeductions,
	expectCurrencyClose,
	sumCurrency,
} from '../test-utils/payroll-currency-helpers.js';
import { roundCurrency } from '../utils/money.js';
import {
	calculatePayrollFromData,
	type PayrollCalculationRow,
} from './payroll-calculation.js';
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
		const fiscalNetDeductionsTotal = sumCurrency(
			vouchers.map((voucher) =>
				roundCurrency(voucher.totals.totalDeductions - voucher.totals.totalOtherPayments),
			),
		);
		const fiscalNetTotal = sumCurrency(vouchers.map((voucher) => voucher.totals.netPay));
		const fiscalTechnicalOtherPaymentsTotal = sumCurrency(
			vouchers.map((voucher) => voucher.totals.totalOtherPayments),
		);

		expectCurrencyClose(
			fiscalGrossTotal,
			AET_P10_TDD_LISTA_RAYA_EXPECTED.fiscalGrossTotal,
			0.01,
		);
		expectCurrencyClose(
			fiscalNetDeductionsTotal,
			roundCurrency(
				AET_P10_TDD_LISTA_RAYA_EXPECTED.fiscalVoucherDeductionsTotal -
					fiscalTechnicalOtherPaymentsTotal,
			),
		);
		expectCurrencyClose(
			fiscalNetTotal,
			roundCurrency(
				AET_P10_TDD_LISTA_RAYA_EXPECTED.fiscalNetPayTotal +
					fiscalTechnicalOtherPaymentsTotal,
			),
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
			const netDeductions = roundCurrency(
				voucher.totals.totalDeductions - voucher.totals.totalOtherPayments,
			);

			expectCurrencyClose(voucher.totals.totalPerceptions, fixture.expectedFiscalGrossPay);
			expectCurrencyClose(
				netDeductions,
				roundCurrency(expectedDeductions - voucher.totals.totalOtherPayments),
			);
			expectCurrencyClose(
				voucher.totals.netPay,
				roundCurrency(fixture.expectedFiscalNetPay + voucher.totals.totalOtherPayments),
			);
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

	it('maps caused employment subsidy with the SAT 0.01 technical other-payment amount', () => {
		const row = {
			employeeId: 'emp-subsidy',
			name: 'Subsidio Aplicado',
			paymentFrequency: 'WEEKLY',
			grossPay: 1000,
			fiscalGrossPay: 1000,
			complementPay: null,
			deductionsBreakdown: [],
			employeeWithholdings: {
				imssEmployee: {
					emExcess: 0,
					pd: 0,
					gmp: 0,
					iv: 0,
					cv: 0,
					total: 0,
				},
				isrWithheld: 25,
				infonavitCredit: 0,
				total: 25,
			},
			informationalLines: {
				isrBeforeSubsidy: 125,
				subsidyApplied: 25,
				subsidyCaused: 100,
			},
		} as unknown as PayrollCalculationRow;

		const voucher = buildPayrollFiscalVoucherFromCalculationRow({
			row,
			payrollRunId: 'run-subsidy',
			payrollRunEmployeeId: 'line-subsidy',
			organizationId: 'org-subsidy',
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

		expect(voucher.otherPayments).toEqual([
			{
				internalType: 'SUBSIDY_APPLIED',
				satTypeCode: '002',
				internalCode: 'SUBSIDY_APPLIED',
				description:
					'Subsidio para el empleo del Decreto que otorga el subsidio para el empleo',
				amount: 0.01,
				subsidyCausedAmount: 100,
			},
		]);
		expect(voucher.deductions.find((deduction) => deduction.internalType === 'ISR')).toMatchObject({
			amount: 25,
			satTypeCode: '002',
		});
		expect(voucher.totals.totalOtherPayments).toBe(0.01);
		expect(voucher.totals.netPay).toBe(975.01);
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

	it('blocks applied payroll deductions that do not have SAT deduction codes', () => {
		const calculation = calculatePayrollFromData(
			buildAetP10PayrollArgs({
				scope: 'TDD',
				includeWorkbookInternalDeductions: true,
			}),
		);
		const row = calculation.employees.find((entry) =>
			entry.deductionsBreakdown.some((deduction) => deduction.satDeductionCode === null),
		);

		if (!row) {
			throw new Error('Expected a payroll row with an internal non-SAT deduction.');
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

		const result = validatePayrollFiscalVoucher(voucher);
		const unmappedDeduction = row.deductionsBreakdown.find(
			(deduction) => deduction.satDeductionCode === null,
		);

		if (!unmappedDeduction) {
			throw new Error('Expected an unmapped deduction.');
		}

		expect(result.status).toBe('BLOCKED');
		expect(result.errors.map((error) => error.code)).toContain('DEDUCTION_SAT_CODE_REQUIRED');
		expect(voucher.unmappedDeductions.map((deduction) => deduction.amount)).toContain(
			unmappedDeduction.appliedAmount,
		);
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
