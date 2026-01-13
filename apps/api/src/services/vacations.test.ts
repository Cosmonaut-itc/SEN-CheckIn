import { describe, expect, it } from 'bun:test';

import {
	calculateAvailableVacationDays,
	calculateVacationAccrual,
	getServiceYearNumber,
} from './vacations.js';

describe('vacations accrual', () => {
	const hireDate = new Date('2025-01-01T00:00:00Z');

	it('accrues vacation days linearly within the service year', () => {
		const accrual = calculateVacationAccrual({
			hireDate,
			serviceYearNumber: 1,
			asOfDateKey: '2026-07-01',
		});

		expect(accrual.serviceYearStartDateKey).toBe('2026-01-01');
		expect(accrual.serviceYearEndDateKey).toBe('2026-12-31');
		expect(accrual.entitledDays).toBe(12);

		const expectedAccrued = (12 * 182) / 365;
		expect(accrual.accruedDays).toBeCloseTo(expectedAccrued, 6);
	});

	it('clamps accrual to the service year start date when asOf precedes it', () => {
		const accrual = calculateVacationAccrual({
			hireDate,
			serviceYearNumber: 1,
			asOfDateKey: '2025-06-01',
		});

		expect(accrual.serviceYearStartDateKey).toBe('2026-01-01');
		expect(accrual.daysElapsed).toBe(1);
		expect(accrual.daysInServiceYear).toBe(365);
		expect(accrual.accruedDays).toBeCloseTo(12 / 365, 6);
	});

	it('accrues full entitlement at the service year end date', () => {
		const accrual = calculateVacationAccrual({
			hireDate,
			serviceYearNumber: 1,
			asOfDateKey: '2026-12-31',
		});

		expect(accrual.daysElapsed).toBe(365);
		expect(accrual.accruedDays).toBe(12);
	});

	it('caps accrual at the service year end date', () => {
		const accrual = calculateVacationAccrual({
			hireDate,
			serviceYearNumber: 1,
			asOfDateKey: '2027-02-01',
		});

		expect(accrual.accruedDays).toBe(12);
	});

	it('returns zero accrual when serviceYearNumber is 0', () => {
		const accrual = calculateVacationAccrual({
			hireDate,
			serviceYearNumber: 0,
			asOfDateKey: '2025-12-31',
		});

		expect(accrual.entitledDays).toBe(0);
		expect(accrual.accruedDays).toBe(0);
		expect(accrual.serviceYearStartDateKey).toBeNull();
		expect(accrual.serviceYearEndDateKey).toBe('2025-12-31');
	});

	it('uses 366-day service years when the period includes Feb 29', () => {
		const leapHireDate = new Date('2023-02-01T00:00:00Z');
		const accrual = calculateVacationAccrual({
			hireDate: leapHireDate,
			serviceYearNumber: 1,
			asOfDateKey: '2024-02-01',
		});

		expect(accrual.serviceYearStartDateKey).toBe('2024-02-01');
		expect(accrual.serviceYearEndDateKey).toBe('2025-01-31');
		expect(accrual.daysInServiceYear).toBe(366);
		expect(accrual.accruedDays).toBeCloseTo(12 / 366, 6);
	});

	it('rolls Feb 29 hire dates to the next valid anniversary', () => {
		const leapHireDate = new Date('2024-02-29T00:00:00Z');
		const accrual = calculateVacationAccrual({
			hireDate: leapHireDate,
			serviceYearNumber: 1,
			asOfDateKey: '2025-03-01',
		});

		expect(accrual.serviceYearStartDateKey).toBe('2025-03-01');
		expect(accrual.serviceYearEndDateKey).toBe('2026-02-28');
		expect(accrual.daysInServiceYear).toBe(365);
	});

	it('calculates available days from accrued, used, and pending totals', () => {
		const available = calculateAvailableVacationDays({
			accruedDays: 5.9835,
			usedDays: 2,
			pendingDays: 1,
		});

		expect(available).toBe(2);
	});

	it('clamps available days at zero when usage exceeds accrual', () => {
		const available = calculateAvailableVacationDays({
			accruedDays: 2.1,
			usedDays: 3,
			pendingDays: 1,
		});

		expect(available).toBe(0);
	});
});

describe('vacations service year number', () => {
	const hireDate = new Date('2025-06-15T00:00:00Z');

	it('increments only on the anniversary date', () => {
		expect(getServiceYearNumber(hireDate, '2026-06-14')).toBe(0);
		expect(getServiceYearNumber(hireDate, '2026-06-15')).toBe(1);
	});

	it('returns 0 for dates before the hire date', () => {
		expect(getServiceYearNumber(hireDate, '2025-06-14')).toBe(0);
	});
});
