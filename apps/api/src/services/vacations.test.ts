import { describe, expect, it } from 'bun:test';

import {
	buildVacationDayBreakdown,
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

describe('buildVacationDayBreakdown', () => {
	it('counts only working days and excludes rest days, holidays, and incapacities', () => {
		const breakdown = buildVacationDayBreakdown({
			startDateKey: '2026-02-02',
			endDateKey: '2026-02-06',
			scheduleDays: [
				{ dayOfWeek: 1, isWorkingDay: true },
				{ dayOfWeek: 2, isWorkingDay: true },
				{ dayOfWeek: 3, isWorkingDay: true },
				{ dayOfWeek: 4, isWorkingDay: true },
				{ dayOfWeek: 5, isWorkingDay: true },
			],
			exceptions: [],
			mandatoryRestDayKeys: new Set(['2026-02-04']),
			incapacityDateKeys: new Set(['2026-02-05']),
			hireDate: new Date('2020-01-01T00:00:00Z'),
		});

		expect(breakdown.vacationDays).toBe(3);
		expect(
			breakdown.days.map((day) => ({
				dateKey: day.dateKey,
				countsAsVacationDay: day.countsAsVacationDay,
				dayType: day.dayType,
			})),
		).toEqual([
			{
				dateKey: '2026-02-02',
				countsAsVacationDay: true,
				dayType: 'SCHEDULED_WORKDAY',
			},
			{
				dateKey: '2026-02-03',
				countsAsVacationDay: true,
				dayType: 'SCHEDULED_WORKDAY',
			},
			{
				dateKey: '2026-02-04',
				countsAsVacationDay: false,
				dayType: 'MANDATORY_REST_DAY',
			},
			{
				dateKey: '2026-02-05',
				countsAsVacationDay: false,
				dayType: 'INCAPACITY',
			},
			{
				dateKey: '2026-02-06',
				countsAsVacationDay: true,
				dayType: 'SCHEDULED_WORKDAY',
			},
		]);
	});

	it('counts exception workdays and keeps exception days off excluded', () => {
		const breakdown = buildVacationDayBreakdown({
			startDateKey: '2026-03-07',
			endDateKey: '2026-03-08',
			scheduleDays: [
				{ dayOfWeek: 0, isWorkingDay: false },
				{ dayOfWeek: 6, isWorkingDay: false },
			],
			exceptions: [
				{
					exceptionDate: new Date('2026-03-07T00:00:00Z'),
					exceptionType: 'EXTRA_DAY',
				},
				{
					exceptionDate: new Date('2026-03-08T00:00:00Z'),
					exceptionType: 'DAY_OFF',
				},
			],
			mandatoryRestDayKeys: new Set<string>(),
			hireDate: new Date('2020-01-01T00:00:00Z'),
		});

		expect(breakdown.vacationDays).toBe(1);
		expect(breakdown.days[0]?.dayType).toBe('EXCEPTION_WORKDAY');
		expect(breakdown.days[0]?.countsAsVacationDay).toBe(true);
		expect(breakdown.days[1]?.dayType).toBe('EXCEPTION_DAY_OFF');
		expect(breakdown.days[1]?.countsAsVacationDay).toBe(false);
	});
});
