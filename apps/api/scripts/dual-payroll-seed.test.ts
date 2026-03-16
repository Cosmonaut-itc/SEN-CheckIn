import { describe, expect, it } from 'bun:test';

import {
	buildDualPayrollDemoEmployeeOverrides,
	buildSeedPayrollRunCompensation,
	DUAL_PAYROLL_SEED_ORGANIZATION_SLUG,
} from './dual-payroll-seed.js';

describe('dual payroll seed helpers', () => {
	it('defines deterministic employee scenarios for the seeded dual payroll org', () => {
		const overrides = buildDualPayrollDemoEmployeeOverrides();

		expect(DUAL_PAYROLL_SEED_ORGANIZATION_SLUG).toBe('sen-checkin');
		expect(overrides).toHaveLength(4);
		expect(overrides.map((override) => override.code)).toEqual([
			'EMP-0001',
			'EMP-0002',
			'EMP-0003',
			'EMP-0004',
		]);
		expect(overrides.map((override) => override.fiscalDailyPay)).toEqual([
			'280.0000',
			'450.0000',
			null,
			'300.0000',
		]);
	});

	it('splits seeded payroll run compensation into fiscal and complement totals', () => {
		const amounts = buildSeedPayrollRunCompensation({
			dailyPay: 400,
			fiscalDailyPay: 280,
			authorizedOvertimeHours: 2,
			paidNormalHours: 14,
			shiftDivisor: 8,
		});

		expect(amounts.hourlyPay).toBe(50);
		expect(amounts.normalPay).toBe(700);
		expect(amounts.overtimeDoublePay).toBe(200);
		expect(amounts.totalPay).toBe(900);
		expect(amounts.fiscalDailyPay).toBe(280);
		expect(amounts.fiscalGrossPay).toBe(630);
		expect(amounts.complementPay).toBe(270);
		expect(amounts.totalRealPay).toBe(900);
	});

	it('falls back to the real salary when fiscal daily pay is unavailable', () => {
		const amounts = buildSeedPayrollRunCompensation({
			dailyPay: 600,
			fiscalDailyPay: null,
			authorizedOvertimeHours: 1,
			paidNormalHours: 10,
			shiftDivisor: 8,
		});

		expect(amounts.fiscalDailyPay).toBeNull();
		expect(amounts.fiscalGrossPay).toBeNull();
		expect(amounts.complementPay).toBeNull();
		expect(amounts.totalRealPay).toBeNull();
		expect(amounts.totalPay).toBe(900);
	});
});
