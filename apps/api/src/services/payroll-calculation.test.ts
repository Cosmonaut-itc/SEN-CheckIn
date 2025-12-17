import { describe, expect, it } from 'bun:test';

import { getUtcDateForZonedMidnight, toDateKeyInTimeZone } from '../utils/time-zone.js';
import {
	calculatePayrollFromData,
	getPayrollPeriodBounds,
	type AttendanceRow,
	type PayrollEmployeeRow,
} from './payroll-calculation.js';

/**
 * Builds a UTC Date for a local wall-clock time in the given timezone.
 *
 * @param dateKey - Local date key (YYYY-MM-DD)
 * @param hour - Local hour (0..23)
 * @param minute - Local minute (0..59)
 * @param timeZone - IANA timezone identifier
 * @returns UTC Date representing that local instant
 */
function getUtcDateForZonedTime(
	dateKey: string,
	hour: number,
	minute: number,
	timeZone: string,
): Date {
	const midnightUtc = getUtcDateForZonedMidnight(dateKey, timeZone);
	return new Date(midnightUtc.getTime() + hour * 60 * 60 * 1000 + minute * 60 * 1000);
}

/**
 * Creates a check-in/check-out pair for a single employee.
 *
 * @param employeeId - Employee identifier
 * @param checkIn - Check-in instant
 * @param checkOut - Check-out instant
 * @returns Attendance rows in chronological order
 */
function createAttendancePair(
	employeeId: string,
	checkIn: Date,
	checkOut: Date,
): AttendanceRow[] {
	return [
		{ employeeId, timestamp: checkIn, type: 'CHECK_IN' },
		{ employeeId, timestamp: checkOut, type: 'CHECK_OUT' },
	];
}

describe('payroll-calculation', () => {
	const employeeId = 'emp-test-1';
	const timeZone = 'America/Mexico_City';
	const defaultEmployee: PayrollEmployeeRow = {
		id: employeeId,
		firstName: 'Ada',
		lastName: 'Lovelace',
		dailyPay: 800,
		paymentFrequency: 'WEEKLY',
		shiftType: 'DIURNA',
		locationGeographicZone: 'GENERAL',
		locationTimeZone: timeZone,
	};

	it('clips a session that starts before the period (timezone midnight bounds)', () => {
		const periodStartDateKey = '2025-01-01';
		const periodEndDateKey = '2025-01-01';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		expect(toDateKeyInTimeZone(periodBounds.periodStartUtc, timeZone)).toBe(periodStartDateKey);
		expect(toDateKeyInTimeZone(periodBounds.periodEndExclusiveUtc, timeZone)).toBe('2025-01-02');

		const checkIn = getUtcDateForZonedTime('2024-12-31', 23, 0, timeZone);
		const checkOut = getUtcDateForZonedTime('2025-01-01', 1, 0, timeZone);

		const { employees, totalAmount } = calculatePayrollFromData({
			employees: [defaultEmployee],
			schedules: [],
			attendanceRows: createAttendancePair(employeeId, checkIn, checkOut),
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeEnforcement: 'WARN',
			weekStartDay: 1,
			additionalMandatoryRestDays: [],
			defaultTimeZone: timeZone,
		});

		expect(employees).toHaveLength(1);
		const row = employees[0];
		expect(row?.hoursWorked).toBe(1);
		expect(row?.normalHours).toBe(1);
		expect(row?.overtimeDoubleHours).toBe(0);
		expect(row?.mandatoryRestDaysWorkedCount).toBe(1);
		expect(row?.normalPay).toBe(100);
		expect(row?.mandatoryRestDayPremiumAmount).toBe(1600);
		expect(row?.totalPay).toBe(1700);
		expect(row?.warnings).toHaveLength(0);
		expect(totalAmount).toBe(1700);
	});

	it('splits cross-midnight work into local day keys (Sunday premium hours)', () => {
		const periodStartDateKey = '2025-01-04';
		const periodEndDateKey = '2025-01-05';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const checkIn = getUtcDateForZonedTime(periodStartDateKey, 22, 0, timeZone);
		const checkOut = getUtcDateForZonedTime(periodEndDateKey, 6, 0, timeZone);

		const { employees } = calculatePayrollFromData({
			employees: [defaultEmployee],
			schedules: [],
			attendanceRows: createAttendancePair(employeeId, checkIn, checkOut),
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeEnforcement: 'WARN',
			weekStartDay: 1,
			additionalMandatoryRestDays: [],
			defaultTimeZone: timeZone,
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(8);
		expect(row?.normalHours).toBe(8);
		expect(row?.sundayHoursWorked).toBe(6);
		expect(row?.sundayPremiumAmount).toBe(200);
		expect(row?.totalPay).toBe(1000);
	});

	it('emits a daily overtime warning when overtime exceeds 3 hours', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-02';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const checkIn = getUtcDateForZonedTime(periodStartDateKey, 8, 0, timeZone);
		const checkOut = getUtcDateForZonedTime(periodEndDateKey, 20, 0, timeZone);

		const { employees } = calculatePayrollFromData({
			employees: [defaultEmployee],
			schedules: [],
			attendanceRows: createAttendancePair(employeeId, checkIn, checkOut),
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeEnforcement: 'WARN',
			weekStartDay: 1,
			additionalMandatoryRestDays: [],
			defaultTimeZone: timeZone,
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(12);
		expect(row?.normalHours).toBe(8);
		expect(row?.overtimeDoubleHours).toBe(4);
		expect(row?.overtimeTripleHours).toBe(0);
		expect(row?.warnings.some((w) => w.type === 'OVERTIME_DAILY_EXCEEDED')).toBe(true);
	});

	it('buckets weekly overtime into double/triple and emits weekly warnings', () => {
		const periodStartDateKey = '2025-01-06';
		const periodEndDateKey = '2025-01-09';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const sessions = [
			'2025-01-06',
			'2025-01-07',
			'2025-01-08',
			'2025-01-09',
		].flatMap((dayKey) => {
			const checkIn = getUtcDateForZonedTime(dayKey, 8, 0, timeZone);
			const checkOut = getUtcDateForZonedTime(dayKey, 22, 0, timeZone);
			return createAttendancePair(employeeId, checkIn, checkOut);
		});

		const { employees } = calculatePayrollFromData({
			employees: [defaultEmployee],
			schedules: [],
			attendanceRows: sessions,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeEnforcement: 'WARN',
			weekStartDay: 1,
			additionalMandatoryRestDays: [],
			defaultTimeZone: timeZone,
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(56);
		expect(row?.normalHours).toBe(32);
		expect(row?.overtimeDoubleHours).toBe(9);
		expect(row?.overtimeTripleHours).toBe(15);
		expect(row?.warnings.some((w) => w.type === 'OVERTIME_WEEKLY_EXCEEDED')).toBe(true);
		expect(row?.warnings.some((w) => w.type === 'OVERTIME_WEEKLY_DAYS_EXCEEDED')).toBe(true);
	});
});

