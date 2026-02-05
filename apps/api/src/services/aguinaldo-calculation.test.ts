import { describe, expect, it } from 'bun:test';

import {
	calculateAguinaldo,
	type AguinaldoCalculationInput,
	type AguinaldoEmployeeInput,
} from './aguinaldo-calculation.js';

const BASE_EMPLOYEE: AguinaldoEmployeeInput = {
	employeeId: 'emp-base',
	status: 'ACTIVE',
	dailySalaryBase: 500,
	daysCounted: 365,
	aguinaldoDaysPolicy: 15,
	yearDays: 365,
	minimumWageZone: 'GENERAL',
	ordinaryMonthlyIncome: 15000,
};

/**
 * Builds an aguinaldo employee input by overriding baseline values.
 *
 * @param overrides - Partial overrides for the base employee
 * @returns Aguinaldo employee input for calculations
 */
function buildEmployee(
	overrides: Partial<AguinaldoEmployeeInput> = {},
): AguinaldoEmployeeInput {
	return {
		...BASE_EMPLOYEE,
		employeeId: overrides.employeeId ?? BASE_EMPLOYEE.employeeId,
		...overrides,
	};
}

/**
 * Builds aguinaldo calculation input with optional overrides.
 *
 * @param overrides - Partial overrides for the base input
 * @returns Aguinaldo calculation input payload
 */
function buildInput(
	overrides: Partial<AguinaldoCalculationInput> & { employees?: AguinaldoEmployeeInput[] } = {},
): AguinaldoCalculationInput {
	return {
		calendarYear: 2026,
		paymentDateKey: '2026-12-15',
		includeInactive: false,
		smgDailyOverride: null,
		employees: overrides.employees ?? [buildEmployee()],
		...overrides,
	};
}

describe('aguinaldo-calculation', () => {
	it('prorates aguinaldo by days in year and policy days', () => {
		const employee = buildEmployee({
			employeeId: 'emp-prorated',
			dailySalaryBase: 100,
			daysCounted: 182,
			aguinaldoDaysPolicy: 15,
			yearDays: 365,
		});
		const result = calculateAguinaldo(buildInput({ employees: [employee] }));
		const row = result.employees[0];
		if (!row) {
			throw new Error('Expected aguinaldo employee row.');
		}
		const expected = Number((100 * 15 * (182 / 365)).toFixed(2));
		expect(row.grossAmount).toBeCloseTo(expected, 2);
	});

	it('honors aguinaldo days policy overrides', () => {
		const employee = buildEmployee({
			employeeId: 'emp-override',
			dailySalaryBase: 200,
			daysCounted: 365,
			aguinaldoDaysPolicy: 20,
			yearDays: 365,
		});
		const result = calculateAguinaldo(buildInput({ employees: [employee] }));
		const row = result.employees[0];
		if (!row) {
			throw new Error('Expected aguinaldo employee row.');
		}
		expect(row.grossAmount).toBeCloseTo(200 * 20, 2);
	});

	it('handles leap-year prorating with 366 days', () => {
		const employee = buildEmployee({
			employeeId: 'emp-leap',
			dailySalaryBase: 100,
			daysCounted: 366,
			aguinaldoDaysPolicy: 15,
			yearDays: 366,
		});
		const result = calculateAguinaldo(
			buildInput({
				calendarYear: 2024,
				smgDailyOverride: 300,
				employees: [employee],
			}),
		);
		const row = result.employees[0];
		if (!row) {
			throw new Error('Expected aguinaldo employee row.');
		}
		expect(row.grossAmount).toBeCloseTo(1500, 2);
	});

	it('excludes inactive employees unless includeInactive is true', () => {
		const employee = buildEmployee({
			employeeId: 'emp-inactive',
			status: 'INACTIVE',
			dailySalaryBase: 150,
			daysCounted: 365,
			aguinaldoDaysPolicy: 15,
			yearDays: 365,
		});

		const excludedResult = calculateAguinaldo(buildInput({ employees: [employee] }));
		const excludedRow = excludedResult.employees[0];
		if (!excludedRow) {
			throw new Error('Expected aguinaldo employee row.');
		}
		expect(excludedRow.isEligible).toBe(false);
		expect(excludedRow.eligibilityReasons).toContain('INACTIVE');
		expect(excludedRow.grossAmount).toBe(0);

		const includedResult = calculateAguinaldo(
			buildInput({ includeInactive: true, employees: [employee] }),
		);
		const includedRow = includedResult.employees[0];
		if (!includedRow) {
			throw new Error('Expected aguinaldo employee row.');
		}
		expect(includedRow.isEligible).toBe(true);
		expect(includedRow.grossAmount).toBeGreaterThan(0);
	});

	it('excludes employees with missing daily base using a warning', () => {
		const employee = buildEmployee({
			employeeId: 'emp-missing-base',
			dailySalaryBase: 0,
			daysCounted: 365,
			aguinaldoDaysPolicy: 15,
			yearDays: 365,
		});

		const result = calculateAguinaldo(buildInput({ employees: [employee] }));
		const row = result.employees[0];
		if (!row) {
			throw new Error('Expected aguinaldo employee row.');
		}
		expect(row.isEligible).toBe(false);
		expect(row.eligibilityReasons).toContain('MISSING_DAILY_BASE');
		const missingBaseWarning = row.warnings.find(
			(warning) => warning.type === 'MISSING_DAILY_BASE',
		);
		if (!missingBaseWarning) {
			throw new Error('Expected missing daily base warning.');
		}
		expect(missingBaseWarning.severity).toBe('warning');
		expect(row.warnings.some((warning) => warning.severity === 'error')).toBe(false);
		expect(result.totals.employeeCount).toBe(0);
		expect(result.totals.grossTotal).toBe(0);
	});
});
