import { describe, expect, it } from 'bun:test';

import {
	calculateMexicoPayrollTaxes,
	type MexicoPayrollTaxSettings,
} from './mexico-payroll-taxes.js';

/**
 * Builds a standard tax settings payload for tests.
 *
 * @returns Mexico payroll tax settings
 */
function buildBaseSettings(): MexicoPayrollTaxSettings {
	return {
		riskWorkRate: 0.02,
		statePayrollTaxRate: 0,
		absorbImssEmployeeShare: false,
		absorbIsr: false,
		aguinaldoDays: 15,
		vacationPremiumRate: 0.25,
	};
}

describe('mexico-payroll-taxes incapacity exemptions', () => {
	it('reduces IMSS-based contributions but keeps retiro and INFONAVIT unchanged', () => {
		const baseInput = {
			dailyPay: 500,
			grossPay: 3500,
			paymentFrequency: 'WEEKLY' as const,
			periodStartDateKey: '2026-01-01',
			periodEndDateKey: '2026-01-07',
			hireDate: new Date('2020-01-01T00:00:00Z'),
			locationGeographicZone: 'GENERAL' as const,
			settings: buildBaseSettings(),
		};

		const normal = calculateMexicoPayrollTaxes(baseInput);
		const exempt = calculateMexicoPayrollTaxes({
			...baseInput,
			imssExemptDateKeys: ['2026-01-02', '2026-01-03', '2026-01-04'],
		});

		expect(exempt.bases.sbcPeriod).toBeLessThan(normal.bases.sbcPeriod);
		expect(exempt.employerCosts.imssEmployer.total).toBeLessThan(
			normal.employerCosts.imssEmployer.total,
		);
		expect(exempt.employeeWithholdings.imssEmployee.total).toBeLessThan(
			normal.employeeWithholdings.imssEmployee.total,
		);
		expect(exempt.employerCosts.riskWork).toBeLessThan(normal.employerCosts.riskWork);
		expect(exempt.employerCosts.sarRetiro).toBeCloseTo(normal.employerCosts.sarRetiro, 2);
		expect(exempt.employerCosts.infonavit).toBeCloseTo(normal.employerCosts.infonavit, 2);
	});
});

describe('mexico-payroll-taxes minimum wage parity', () => {
	it('keeps minimum-wage fiscal payroll net aligned with CONTPAQi lista de raya', () => {
		const result = calculateMexicoPayrollTaxes({
			dailyPay: 315.04,
			grossPay: 2205.28,
			paymentFrequency: 'WEEKLY',
			periodStartDateKey: '2026-03-02',
			periodEndDateKey: '2026-03-08',
			hireDate: new Date('2018-01-08T00:00:00.000Z'),
			sbcDailyOverride: 332.73,
			locationGeographicZone: 'GENERAL',
			settings: {
				...buildBaseSettings(),
				riskWorkRate: 0.06,
				statePayrollTaxRate: 0.02,
			},
		});

		expect(result.bases.minimumWageDaily).toBe(315.04);
		expect(result.informationalLines.subsidyApplied).toBe(123.34);
		expect(result.employeeWithholdings.isrWithheld).toBe(0);
		expect(result.employeeWithholdings.imssEmployee.total).toBe(0);
		expect(result.employeeWithholdings.total).toBe(0);
		expect(result.employerCosts.absorbedImssEmployeeShare).toBe(55.32);
		expect(result.employerCosts.imssEmployer.total).toBe(444.71);
		expect(result.employerCosts.total).toBe(814.9);
		expect(result.netPay).toBe(2205.28);
	});

	it('respects absorption settings for fiscal payroll above minimum wage', () => {
		const baseInput = {
			dailyPay: 1000,
			grossPay: 7000,
			paymentFrequency: 'WEEKLY' as const,
			periodStartDateKey: '2026-03-02',
			periodEndDateKey: '2026-03-08',
			hireDate: new Date('2018-01-08T00:00:00.000Z'),
			sbcDailyOverride: 1000,
			locationGeographicZone: 'GENERAL' as const,
			settings: {
				...buildBaseSettings(),
				riskWorkRate: 0.06,
				statePayrollTaxRate: 0.02,
			},
		};

		const retained = calculateMexicoPayrollTaxes(baseInput);
		const absorbed = calculateMexicoPayrollTaxes({
			...baseInput,
			settings: {
				...baseInput.settings,
				absorbImssEmployeeShare: true,
				absorbIsr: true,
			},
		});

		expect(retained.bases.minimumWageDaily).toBe(315.04);
		expect(retained.employeeWithholdings.imssEmployee.total).toBeGreaterThan(0);
		expect(retained.employeeWithholdings.isrWithheld).toBeGreaterThan(0);
		expect(retained.employeeWithholdings.total).toBeGreaterThan(0);
		expect(retained.employerCosts.absorbedImssEmployeeShare).toBe(0);
		expect(retained.employerCosts.absorbedIsr).toBe(0);

		expect(absorbed.employeeWithholdings.imssEmployee.total).toBe(0);
		expect(absorbed.employeeWithholdings.isrWithheld).toBe(0);
		expect(absorbed.employeeWithholdings.total).toBe(0);
		expect(absorbed.employerCosts.absorbedImssEmployeeShare).toBe(
			retained.employeeWithholdings.imssEmployee.total,
		);
		expect(absorbed.employerCosts.absorbedIsr).toBe(retained.employeeWithholdings.isrWithheld);
		expect(absorbed.netPay).toBe(baseInput.grossPay);
	});

	it('keeps positive ISR accountable for minimum-wage employees with extra taxable pay', () => {
		const baseInput = {
			dailyPay: 315.04,
			grossPay: 7000,
			paymentFrequency: 'WEEKLY' as const,
			periodStartDateKey: '2026-03-02',
			periodEndDateKey: '2026-03-08',
			hireDate: new Date('2018-01-08T00:00:00.000Z'),
			sbcDailyOverride: 332.73,
			locationGeographicZone: 'GENERAL' as const,
			settings: {
				...buildBaseSettings(),
				riskWorkRate: 0.06,
				statePayrollTaxRate: 0.02,
			},
		};

		const retained = calculateMexicoPayrollTaxes(baseInput);
		const absorbed = calculateMexicoPayrollTaxes({
			...baseInput,
			settings: {
				...baseInput.settings,
				absorbIsr: true,
			},
		});

		expect(retained.employeeWithholdings.imssEmployee.total).toBe(0);
		expect(retained.employerCosts.absorbedImssEmployeeShare).toBeGreaterThan(0);
		expect(retained.informationalLines.isrBeforeSubsidy).toBeGreaterThan(
			retained.informationalLines.subsidyApplied,
		);
		expect(retained.employeeWithholdings.isrWithheld).toBeGreaterThan(0);
		expect(retained.employerCosts.absorbedIsr).toBe(0);

		expect(absorbed.employeeWithholdings.isrWithheld).toBe(0);
		expect(absorbed.employeeWithholdings.total).toBe(0);
		expect(absorbed.employerCosts.absorbedIsr).toBe(
			retained.employeeWithholdings.isrWithheld,
		);
	});
});
