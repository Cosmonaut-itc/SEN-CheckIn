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
