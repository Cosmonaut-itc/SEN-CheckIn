import { describe, expect, it } from 'bun:test';

import {
	calculatePtu,
	type PtuCalculationInput,
	type PtuEmployeeInput,
} from './ptu-calculation.js';

const BASE_EMPLOYEE: PtuEmployeeInput = {
	employeeId: 'emp-base',
	status: 'ACTIVE',
	employmentType: 'PERMANENT',
	dailyPay: 500,
	dailyQuotaOverride: null,
	daysCounted: 365,
	annualSalaryBaseOverride: null,
	isTrustEmployee: false,
	isDirectorAdminGeneralManager: false,
	isDomesticWorker: false,
	isPlatformWorker: false,
	platformHoursYear: 0,
	ptuEligibilityOverride: 'DEFAULT',
	minimumWageZone: 'GENERAL',
	ordinaryMonthlyIncome: 15000,
	ptuHistoryAmounts: [],
};

/**
 * Builds a PTU employee input by overriding the baseline values.
 *
 * @param overrides - Partial overrides for the base employee
 * @returns PTU employee input for calculations
 */
function buildEmployee(overrides: Partial<PtuEmployeeInput> = {}): PtuEmployeeInput {
	return {
		...BASE_EMPLOYEE,
		employeeId: overrides.employeeId ?? BASE_EMPLOYEE.employeeId,
		...overrides,
	};
}

/**
 * Builds PTU calculation input with optional overrides.
 *
 * @param overrides - Partial overrides for the base input
 * @returns PTU calculation input payload
 */
function buildInput(
	overrides: Partial<PtuCalculationInput> & { employees?: PtuEmployeeInput[] } = {},
): PtuCalculationInput {
	return {
		fiscalYear: 2026,
		paymentDateKey: '2026-05-15',
		taxableIncome: 100000,
		ptuPercentage: 0.1,
		includeInactive: false,
		ptuMode: 'DEFAULT_RULES',
		smgDailyOverride: null,
		monthDaysForCaps: 30,
		employees: overrides.employees ?? [buildEmployee()],
		...overrides,
	};
}

describe('ptu-calculation', () => {
	it('splits PTU pool 50/50 by days and salary', () => {
		const employees = [
			buildEmployee({ employeeId: 'emp-1', daysCounted: 200, dailyPay: 500 }),
			buildEmployee({ employeeId: 'emp-2', daysCounted: 200, dailyPay: 500 }),
		];
		const result = calculatePtu(
			buildInput({
				taxableIncome: 10000,
				employees,
			}),
		);

		const emp1 = result.employees.find((row) => row.employeeId === 'emp-1');
		const emp2 = result.employees.find((row) => row.employeeId === 'emp-2');
		if (!emp1 || !emp2) {
			throw new Error('Expected PTU employees in calculation output.');
		}
		expect(emp1.ptuFinal).toBeCloseTo(500, 2);
		expect(emp2.ptuFinal).toBeCloseTo(500, 2);
	});

	it('allocates full PTU pool by days when salary base sum is zero', () => {
		const employees = [
			buildEmployee({
				employeeId: 'emp-days-1',
				daysCounted: 100,
				annualSalaryBaseOverride: 0,
				dailyPay: 500,
			}),
			buildEmployee({
				employeeId: 'emp-days-2',
				daysCounted: 300,
				annualSalaryBaseOverride: 0,
				dailyPay: 500,
			}),
		];
		const result = calculatePtu(
			buildInput({
				taxableIncome: 10000,
				employees,
			}),
		);

		const emp1 = result.employees.find((row) => row.employeeId === 'emp-days-1');
		const emp2 = result.employees.find((row) => row.employeeId === 'emp-days-2');
		if (!emp1 || !emp2) {
			throw new Error('Expected PTU employees for day-only distribution test.');
		}
		expect(emp1.ptuFinal).toBeCloseTo(250, 2);
		expect(emp2.ptuFinal).toBeCloseTo(750, 2);
		expect(emp1.ptuFinal + emp2.ptuFinal).toBeCloseTo(1000, 2);
	});

	it('excludes eventual employees below 60 days', () => {
		const employees = [
			buildEmployee({
				employeeId: 'emp-eventual',
				employmentType: 'EVENTUAL',
				daysCounted: 59,
			}),
		];

		const result = calculatePtu(buildInput({ employees, taxableIncome: 8000 }));
		const row = result.employees[0];
		if (!row) {
			throw new Error('Expected PTU employee row.');
		}
		expect(row.isEligible).toBe(false);
		expect(row.eligibilityReasons).toContain('EVENTUAL_DAYS_BELOW_60');
	});

	it('caps trust employees at 1.2x the max non-trust daily pay', () => {
		const employees = [
			buildEmployee({ employeeId: 'emp-base', dailyPay: 100, daysCounted: 120 }),
			buildEmployee({
				employeeId: 'emp-trust',
				isTrustEmployee: true,
				dailyPay: 150,
				daysCounted: 120,
			}),
		];

		const result = calculatePtu(buildInput({ employees, taxableIncome: 10000 }));
		const trustEmployee = result.employees.find((row) => row.employeeId === 'emp-trust');
		if (!trustEmployee) {
			throw new Error('Expected trust employee row.');
		}
		expect(trustEmployee.dailyQuota).toBeCloseTo(120, 2);
	});

	it('uses the higher of 3-month cap or 3-year average', () => {
		const employees = [
			buildEmployee({
				employeeId: 'emp-cap',
				dailyPay: 100,
				daysCounted: 200,
				ptuHistoryAmounts: [15000, 15000, 15000],
			}),
		];

		const result = calculatePtu(buildInput({ employees, taxableIncome: 10000 }));
		const row = result.employees[0];
		if (!row) {
			throw new Error('Expected PTU employee row.');
		}
		expect(row.capThreeMonths).toBeCloseTo(9000, 2);
		expect(row.capAvgThreeYears).toBeCloseTo(15000, 2);
		expect(row.capFinal).toBeCloseTo(15000, 2);
	});

	it('redistributes excess PTU to remaining eligible employees', () => {
		const employees = [
			buildEmployee({
				employeeId: 'emp-low',
				dailyPay: 100,
				daysCounted: 365,
			}),
			buildEmployee({
				employeeId: 'emp-high',
				dailyPay: 1000,
				daysCounted: 365,
			}),
		];

		const result = calculatePtu(buildInput({ employees, taxableIncome: 500000 }));
		const low = result.employees.find((row) => row.employeeId === 'emp-low');
		const high = result.employees.find((row) => row.employeeId === 'emp-high');
		if (!low || !high) {
			throw new Error('Expected PTU employee rows for redistribution test.');
		}
		expect(low.ptuFinal).toBeCloseTo(low.capFinal, 2);
		expect(high.ptuFinal).toBeGreaterThan(high.ptuPreCap);
		const total = low.ptuFinal + high.ptuFinal;
		expect(total).toBeCloseTo(50000, 1);
	});

	it('redistributes full excess when only one distribution factor remains', () => {
		const employees = [
			buildEmployee({
				employeeId: 'emp-capped-days',
				dailyPay: 1,
				daysCounted: 200,
				annualSalaryBaseOverride: 0,
			}),
			buildEmployee({
				employeeId: 'emp-remaining-days',
				dailyPay: 100,
				daysCounted: 200,
				annualSalaryBaseOverride: 0,
			}),
		];

		const result = calculatePtu(
			buildInput({
				taxableIncome: 10000,
				employees,
			}),
		);
		const capped = result.employees.find((row) => row.employeeId === 'emp-capped-days');
		const remaining = result.employees.find((row) => row.employeeId === 'emp-remaining-days');
		if (!capped || !remaining) {
			throw new Error('Expected PTU employees for excess redistribution test.');
		}
		expect(capped.ptuFinal).toBeCloseTo(90, 2);
		expect(remaining.ptuFinal).toBeCloseTo(910, 2);
		expect(capped.ptuFinal + remaining.ptuFinal).toBeCloseTo(1000, 2);
	});

	it('honors manual selection and eligibility overrides', () => {
		const manualEmployees = [
			buildEmployee({ employeeId: 'emp-manual', ptuEligibilityOverride: 'DEFAULT' }),
			buildEmployee({
				employeeId: 'emp-included',
				ptuEligibilityOverride: 'INCLUDE',
			}),
		];

		const manualResult = calculatePtu(
			buildInput({ employees: manualEmployees, ptuMode: 'MANUAL' }),
		);
		const manualDefault = manualResult.employees.find(
			(row) => row.employeeId === 'emp-manual',
		);
		const manualIncluded = manualResult.employees.find(
			(row) => row.employeeId === 'emp-included',
		);
		if (!manualDefault || !manualIncluded) {
			throw new Error('Expected PTU manual selection employees.');
		}
		expect(manualDefault.isEligible).toBe(false);
		expect(manualDefault.eligibilityReasons).toContain('MANUAL_SELECTION_REQUIRED');
		expect(manualIncluded.isEligible).toBe(true);

		const inactiveEmployees = [
			buildEmployee({
				employeeId: 'emp-inactive',
				status: 'INACTIVE',
				ptuEligibilityOverride: 'DEFAULT',
			}),
			buildEmployee({
				employeeId: 'emp-override',
				status: 'INACTIVE',
				ptuEligibilityOverride: 'INCLUDE',
			}),
		];
		const inactiveResult = calculatePtu(buildInput({ employees: inactiveEmployees }));
		const inactiveDefault = inactiveResult.employees.find(
			(row) => row.employeeId === 'emp-inactive',
		);
		const inactiveOverride = inactiveResult.employees.find(
			(row) => row.employeeId === 'emp-override',
		);
		if (!inactiveDefault || !inactiveOverride) {
			throw new Error('Expected PTU inactive employees.');
		}
		expect(inactiveDefault.isEligible).toBe(false);
		expect(inactiveDefault.eligibilityReasons).toContain('INACTIVE');
		expect(inactiveOverride.isEligible).toBe(true);
	});
});
