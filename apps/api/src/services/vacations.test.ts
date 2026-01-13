import { describe, expect, it } from 'bun:test';

import { calculateAvailableVacationDays, calculateVacationAccrual } from './vacations.js';

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

	it('caps accrual at the service year end date', () => {
		const accrual = calculateVacationAccrual({
			hireDate,
			serviceYearNumber: 1,
			asOfDateKey: '2027-02-01',
		});

		expect(accrual.accruedDays).toBe(12);
	});

	it('calculates available days from accrued, used, and pending totals', () => {
		const available = calculateAvailableVacationDays({
			accruedDays: 5.9835,
			usedDays: 2,
			pendingDays: 1,
		});

		expect(available).toBe(2);
	});
});
