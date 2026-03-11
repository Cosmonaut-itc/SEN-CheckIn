import { describe, expect, it } from 'bun:test';

import { addDaysToDateKey } from '../utils/date-key.js';
import { getUtcDateForZonedMidnight, toDateKeyInTimeZone } from '../utils/time-zone.js';
import {
	calculateMexicoPayrollTaxes,
	type MexicoPayrollTaxSettings,
} from './mexico-payroll-taxes.js';
import {
	calculatePayrollFromData,
	getPayrollPeriodBounds,
	type AttendanceRow,
	type PayrollEmployeeRow,
	type ScheduleRow,
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
function createAttendancePair(employeeId: string, checkIn: Date, checkOut: Date): AttendanceRow[] {
	return [
		{ employeeId, timestamp: checkIn, type: 'CHECK_IN' },
		{ employeeId, timestamp: checkOut, type: 'CHECK_OUT' },
	];
}

/**
 * Sums numeric values and rounds to two decimals.
 *
 * @param values - Array of numeric values
 * @returns Sum rounded to two decimals
 */
function sumRounded(values: number[]): number {
	const total = values.reduce((sum, value) => sum + value, 0);
	return Number(total.toFixed(2));
}

/**
 * Builds weekly schedule entries (Mon-Sat working, Sunday rest) for an employee.
 *
 * @param employeeId - Employee identifier
 * @returns Schedule rows for the week
 */
function buildWeeklySchedule(employeeId: string): ScheduleRow[] {
	return [
		{ employeeId, dayOfWeek: 0, startTime: '09:00', endTime: '17:00', isWorkingDay: false },
		{ employeeId, dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isWorkingDay: true },
		{ employeeId, dayOfWeek: 2, startTime: '09:00', endTime: '17:00', isWorkingDay: true },
		{ employeeId, dayOfWeek: 3, startTime: '09:00', endTime: '17:00', isWorkingDay: true },
		{ employeeId, dayOfWeek: 4, startTime: '09:00', endTime: '17:00', isWorkingDay: true },
		{ employeeId, dayOfWeek: 5, startTime: '09:00', endTime: '17:00', isWorkingDay: true },
		{ employeeId, dayOfWeek: 6, startTime: '09:00', endTime: '17:00', isWorkingDay: true },
	];
}

/**
 * Creates attendance rows for each working day in a weekly period.
 *
 * @param employeeId - Employee identifier
 * @param periodStartDateKey - Period start date key
 * @param periodEndDateKey - Period end date key
 * @param timeZone - IANA timezone identifier
 * @param skippedDateKeys - Optional date keys to skip (absences)
 * @returns Attendance rows for the period
 */
function buildWeeklyAttendance(
	employeeId: string,
	periodStartDateKey: string,
	periodEndDateKey: string,
	timeZone: string,
	skippedDateKeys: string[] = [],
): AttendanceRow[] {
	const rows: AttendanceRow[] = [];
	let currentKey = periodStartDateKey;
	for (let i = 0; i < 10 && currentKey <= periodEndDateKey; i += 1) {
		const dayDate = new Date(`${currentKey}T00:00:00Z`);
		const dayOfWeek = dayDate.getUTCDay();
		const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 6;
		if (isWorkingDay && !skippedDateKeys.includes(currentKey)) {
			const checkIn = getUtcDateForZonedTime(currentKey, 9, 0, timeZone);
			const checkOut = getUtcDateForZonedTime(currentKey, 17, 0, timeZone);
			rows.push(...createAttendancePair(employeeId, checkIn, checkOut));
		}
		if (currentKey === periodEndDateKey) {
			break;
		}
		currentKey = addDaysToDateKey(currentKey, 1);
	}
	return rows;
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

	const baseArgs = {
		employees: [defaultEmployee],
		schedules: [],
		overtimeEnforcement: 'WARN' as const,
		weekStartDay: 1,
		additionalMandatoryRestDays: [],
		defaultTimeZone: timeZone,
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
		expect(toDateKeyInTimeZone(periodBounds.periodEndExclusiveUtc, timeZone)).toBe(
			'2025-01-02',
		);

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

	it('clips a session that ends after the period (timezone midnight bounds)', () => {
		const periodStartDateKey = '2025-01-01';
		const periodEndDateKey = '2025-01-01';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		expect(toDateKeyInTimeZone(periodBounds.periodStartUtc, timeZone)).toBe(periodStartDateKey);
		expect(toDateKeyInTimeZone(periodBounds.periodEndExclusiveUtc, timeZone)).toBe(
			'2025-01-02',
		);

		const checkIn = getUtcDateForZonedTime(periodStartDateKey, 23, 0, timeZone);
		const checkOut = getUtcDateForZonedTime('2025-01-02', 1, 0, timeZone);

		const { employees, totalAmount } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: createAttendancePair(employeeId, checkIn, checkOut),
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
		});

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

	it('adds vacation pay and premium when vacation day counts are provided', () => {
		const periodStartDateKey = '2025-01-06';
		const periodEndDateKey = '2025-01-06';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: [],
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			payrollSettings: {
				vacationPremiumRate: 0.25,
			},
			vacationDayCounts: {
				[employeeId]: 2,
			},
		});

		expect(employees).toHaveLength(1);
		const row = employees[0];
		expect(row?.vacationDaysPaid).toBe(2);
		expect(row?.vacationPayAmount).toBe(1600);
		expect(row?.vacationPremiumAmount).toBe(400);
		expect(row?.totalPay).toBe(2000);
		expect(row?.grossPay).toBe(2000);
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
			...baseArgs,
			attendanceRows: createAttendancePair(employeeId, checkIn, checkOut),
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
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
			...baseArgs,
			attendanceRows: createAttendancePair(employeeId, checkIn, checkOut),
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(12);
		expect(row?.normalHours).toBe(8);
		expect(row?.overtimeDoubleHours).toBe(4);
		expect(row?.overtimeTripleHours).toBe(0);
		expect(row?.warnings.some((w) => w.type === 'OVERTIME_DAILY_EXCEEDED')).toBe(true);
	});

	it('does not pay overtime without an active authorization', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-02';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const checkIn = getUtcDateForZonedTime(periodStartDateKey, 8, 0, timeZone);
		const checkOut = getUtcDateForZonedTime(periodEndDateKey, 19, 0, timeZone);

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: createAttendancePair(employeeId, checkIn, checkOut),
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeAuthorizations: [],
		});

		const row = employees[0];
		expect(row?.overtimeDoubleHours).toBe(3);
		expect(row?.authorizedOvertimeHours).toBe(0);
		expect(row?.unauthorizedOvertimeHours).toBe(3);
		expect(row?.overtimeDoublePay).toBe(0);
		expect(row?.warnings.some((w) => w.type === 'OVERTIME_NOT_AUTHORIZED')).toBe(true);
	});

	it('limits paid overtime to the authorized hours when authorization is partial', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-02';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const checkIn = getUtcDateForZonedTime(periodStartDateKey, 8, 0, timeZone);
		const checkOut = getUtcDateForZonedTime(periodEndDateKey, 19, 0, timeZone);

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: createAttendancePair(employeeId, checkIn, checkOut),
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeAuthorizations: [
				{
					employeeId,
					dateKey: periodStartDateKey,
					authorizedHours: 2,
					status: 'ACTIVE',
				},
			],
		});

		const row = employees[0];
		expect(row?.overtimeDoubleHours).toBe(3);
		expect(row?.authorizedOvertimeHours).toBe(2);
		expect(row?.unauthorizedOvertimeHours).toBe(1);
		expect(row?.overtimeDoublePay).toBe(400);
		expect(row?.warnings.some((w) => w.type === 'OVERTIME_EXCEEDED_AUTHORIZATION')).toBe(true);
	});

	it('pays all overtime when authorization covers all extra hours', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-02';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const checkIn = getUtcDateForZonedTime(periodStartDateKey, 8, 0, timeZone);
		const checkOut = getUtcDateForZonedTime(periodEndDateKey, 19, 0, timeZone);

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: createAttendancePair(employeeId, checkIn, checkOut),
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeAuthorizations: [
				{
					employeeId,
					dateKey: periodStartDateKey,
					authorizedHours: 3,
					status: 'ACTIVE',
				},
			],
		});

		const row = employees[0];
		expect(row?.authorizedOvertimeHours).toBe(3);
		expect(row?.unauthorizedOvertimeHours).toBe(0);
		expect(row?.overtimeDoublePay).toBe(600);
		expect(
			row?.warnings.some(
				(w) =>
					w.type === 'OVERTIME_NOT_AUTHORIZED' ||
					w.type === 'OVERTIME_EXCEEDED_AUTHORIZATION',
			),
		).toBe(false);
	});

	it('accumulates authorized and unauthorized overtime across mixed days', () => {
		const periodStartDateKey = '2025-01-06';
		const periodEndDateKey = '2025-01-08';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const attendanceRows = [
			...createAttendancePair(
				employeeId,
				getUtcDateForZonedTime('2025-01-06', 8, 0, timeZone),
				getUtcDateForZonedTime('2025-01-06', 19, 0, timeZone),
			),
			...createAttendancePair(
				employeeId,
				getUtcDateForZonedTime('2025-01-07', 8, 0, timeZone),
				getUtcDateForZonedTime('2025-01-07', 19, 0, timeZone),
			),
			...createAttendancePair(
				employeeId,
				getUtcDateForZonedTime('2025-01-08', 8, 0, timeZone),
				getUtcDateForZonedTime('2025-01-08', 17, 0, timeZone),
			),
		];

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeAuthorizations: [
				{
					employeeId,
					dateKey: '2025-01-06',
					authorizedHours: 2,
					status: 'ACTIVE',
				},
			],
		});

		const row = employees[0];
		expect(row?.overtimeDoubleHours).toBe(7);
		expect(row?.authorizedOvertimeHours).toBe(2);
		expect(row?.unauthorizedOvertimeHours).toBe(5);
		expect(row?.overtimeDoublePay).toBe(400);
		expect(row?.warnings.some((w) => w.type === 'OVERTIME_NOT_AUTHORIZED')).toBe(true);
		expect(row?.warnings.some((w) => w.type === 'OVERTIME_EXCEEDED_AUTHORIZATION')).toBe(true);
	});

	it('does not emit a daily overtime warning at exactly 3 hours', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-02';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const checkIn = getUtcDateForZonedTime(periodStartDateKey, 8, 0, timeZone);
		const checkOut = getUtcDateForZonedTime(periodEndDateKey, 19, 0, timeZone);

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: createAttendancePair(employeeId, checkIn, checkOut),
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(11);
		expect(row?.normalHours).toBe(8);
		expect(row?.overtimeDoubleHours).toBe(3);
		expect(row?.warnings.some((w) => w.type === 'OVERTIME_DAILY_EXCEEDED')).toBe(false);
	});

	it('applies daily overtime once across split shifts in the same day', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-02';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const attendanceRows = [
			...createAttendancePair(
				employeeId,
				getUtcDateForZonedTime(periodStartDateKey, 8, 0, timeZone),
				getUtcDateForZonedTime(periodEndDateKey, 12, 0, timeZone),
			),
			...createAttendancePair(
				employeeId,
				getUtcDateForZonedTime(periodStartDateKey, 14, 0, timeZone),
				getUtcDateForZonedTime(periodEndDateKey, 22, 0, timeZone),
			),
		];

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeAuthorizations: [
				{
					employeeId,
					dateKey: periodStartDateKey,
					authorizedHours: 1,
					status: 'ACTIVE',
				},
			],
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(12);
		expect(row?.normalHours).toBe(8);
		expect(row?.overtimeDoubleHours).toBe(4);
		expect(row?.warnings.some((w) => w.type === 'OVERTIME_DAILY_EXCEEDED')).toBe(true);
	});

	it('assigns overnight overtime to the local workday bucket', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-03';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const checkIn = getUtcDateForZonedTime(periodStartDateKey, 22, 0, timeZone);
		const checkOut = getUtcDateForZonedTime(periodEndDateKey, 12, 0, timeZone);

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: createAttendancePair(employeeId, checkIn, checkOut),
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
		});

		const row = employees[0];
		const dailyWarning = row?.warnings.find((w) => w.type === 'OVERTIME_DAILY_EXCEEDED');
		expect(row?.hoursWorked).toBe(14);
		expect(row?.normalHours).toBe(10);
		expect(row?.overtimeDoubleHours).toBe(4);
		expect(dailyWarning?.message).toContain('2025-01-03');
	});

	it('does not emit weekly overtime warnings at the exact limits', () => {
		const periodStartDateKey = '2025-01-06';
		const periodEndDateKey = '2025-01-08';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const sessions = ['2025-01-06', '2025-01-07', '2025-01-08'].flatMap((dayKey) => {
			const checkIn = getUtcDateForZonedTime(dayKey, 8, 0, timeZone);
			const checkOut = getUtcDateForZonedTime(dayKey, 19, 0, timeZone);
			return createAttendancePair(employeeId, checkIn, checkOut);
		});

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: sessions,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeAuthorizations: [
				{
					employeeId,
					dateKey: '2025-01-06',
					authorizedHours: 3,
					status: 'ACTIVE',
				},
				{
					employeeId,
					dateKey: '2025-01-07',
					authorizedHours: 3,
					status: 'ACTIVE',
				},
				{
					employeeId,
					dateKey: '2025-01-08',
					authorizedHours: 3,
					status: 'ACTIVE',
				},
			],
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(33);
		expect(row?.normalHours).toBe(24);
		expect(row?.overtimeDoubleHours).toBe(9);
		expect(row?.overtimeTripleHours).toBe(0);
		expect(row?.warnings).toHaveLength(0);
	});

	it('buckets weekly overtime into double/triple and emits weekly warnings', () => {
		const periodStartDateKey = '2025-01-06';
		const periodEndDateKey = '2025-01-09';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const sessions = ['2025-01-06', '2025-01-07', '2025-01-08', '2025-01-09'].flatMap(
			(dayKey) => {
				const checkIn = getUtcDateForZonedTime(dayKey, 8, 0, timeZone);
				const checkOut = getUtcDateForZonedTime(dayKey, 22, 0, timeZone);
				return createAttendancePair(employeeId, checkIn, checkOut);
			},
		);

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: sessions,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(56);
		expect(row?.normalHours).toBe(32);
		expect(row?.overtimeDoubleHours).toBe(9);
		expect(row?.overtimeTripleHours).toBe(15);
		expect(row?.warnings.some((w) => w.type === 'OVERTIME_WEEKLY_EXCEEDED')).toBe(true);
		expect(row?.warnings.some((w) => w.type === 'OVERTIME_WEEKLY_DAYS_EXCEEDED')).toBe(true);
	});

	it('resets weekly normal limits inside a biweekly period (no overtime across weeks)', () => {
		const periodStartDateKey = '2025-01-06';
		const periodEndDateKey = '2025-01-18';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const workedDays = [
			'2025-01-06',
			'2025-01-07',
			'2025-01-08',
			'2025-01-09',
			'2025-01-10',
			'2025-01-11',
			'2025-01-13',
			'2025-01-14',
			'2025-01-15',
			'2025-01-16',
			'2025-01-17',
			'2025-01-18',
		];

		const attendanceRows = workedDays.flatMap((dayKey) => {
			const checkIn = getUtcDateForZonedTime(dayKey, 8, 0, timeZone);
			const checkOut = getUtcDateForZonedTime(dayKey, 16, 0, timeZone);
			return createAttendancePair(employeeId, checkIn, checkOut);
		});

		const { employees, totalAmount } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(96);
		expect(row?.normalHours).toBe(96);
		expect(row?.overtimeDoubleHours).toBe(0);
		expect(row?.overtimeTripleHours).toBe(0);
		expect(row?.normalPay).toBe(9600);
		expect(row?.totalPay).toBe(9600);
		expect(row?.warnings).toHaveLength(0);
		expect(totalAmount).toBe(9600);
	});

	it('uses weekStartDay to change weekly overtime buckets', () => {
		const periodStartDateKey = '2025-01-05';
		const periodEndDateKey = '2025-01-11';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const workedDays = [
			'2025-01-05',
			'2025-01-06',
			'2025-01-07',
			'2025-01-08',
			'2025-01-09',
			'2025-01-10',
			'2025-01-11',
		];

		const attendanceRows = workedDays.flatMap((dayKey) => {
			const checkIn = getUtcDateForZonedTime(dayKey, 8, 0, timeZone);
			const checkOut = getUtcDateForZonedTime(dayKey, 16, 0, timeZone);
			return createAttendancePair(employeeId, checkIn, checkOut);
		});

		const { employees: sundayWeekEmployees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			weekStartDay: 0,
		});

		const { employees: mondayWeekEmployees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			weekStartDay: 1,
		});

		const sundayWeekRow = sundayWeekEmployees[0];
		expect(sundayWeekRow?.hoursWorked).toBe(56);
		expect(sundayWeekRow?.normalHours).toBe(48);
		expect(sundayWeekRow?.overtimeDoubleHours).toBe(8);
		expect(sundayWeekRow?.overtimeTripleHours).toBe(0);
		expect(sundayWeekRow?.sundayPremiumAmount).toBe(200);

		const mondayWeekRow = mondayWeekEmployees[0];
		expect(mondayWeekRow?.hoursWorked).toBe(56);
		expect(mondayWeekRow?.normalHours).toBe(56);
		expect(mondayWeekRow?.overtimeDoubleHours).toBe(0);
		expect(mondayWeekRow?.overtimeTripleHours).toBe(0);
		expect(mondayWeekRow?.sundayPremiumAmount).toBe(200);
	});

	it('computes weekly overtime from daily overtime sum (double/triple split)', () => {
		const periodStartDateKey = '2025-01-06';
		const periodEndDateKey = '2025-01-07';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const sessions = [
			{ dateKey: '2025-01-06', checkInHour: 8, checkOutHour: 21 },
			{ dateKey: '2025-01-07', checkInHour: 8, checkOutHour: 21 },
		].flatMap(({ dateKey, checkInHour, checkOutHour }) => {
			const checkIn = getUtcDateForZonedTime(dateKey, checkInHour, 0, timeZone);
			const checkOut = getUtcDateForZonedTime(dateKey, checkOutHour, 0, timeZone);
			return createAttendancePair(employeeId, checkIn, checkOut);
		});

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: sessions,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(26);
		expect(row?.normalHours).toBe(16);
		expect(row?.overtimeDoubleHours).toBe(9);
		expect(row?.overtimeTripleHours).toBe(1);
		expect(row?.warnings.some((w) => w.type === 'OVERTIME_WEEKLY_EXCEEDED')).toBe(true);
	});

	it('marks overtime warnings as errors when overtimeEnforcement is BLOCK', () => {
		const periodStartDateKey = '2025-01-06';
		const periodEndDateKey = '2025-01-07';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const sessions = [
			{ dateKey: '2025-01-06', checkInHour: 8, checkOutHour: 21 },
			{ dateKey: '2025-01-07', checkInHour: 8, checkOutHour: 21 },
		].flatMap(({ dateKey, checkInHour, checkOutHour }) => {
			const checkIn = getUtcDateForZonedTime(dateKey, checkInHour, 0, timeZone);
			const checkOut = getUtcDateForZonedTime(dateKey, checkOutHour, 0, timeZone);
			return createAttendancePair(employeeId, checkIn, checkOut);
		});

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: sessions,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeEnforcement: 'BLOCK',
		});

		const row = employees[0];
		const dailyWarning = row?.warnings.find((w) => w.type === 'OVERTIME_DAILY_EXCEEDED');
		const weeklyWarning = row?.warnings.find((w) => w.type === 'OVERTIME_WEEKLY_EXCEEDED');
		expect(dailyWarning?.severity).toBe('error');
		expect(weeklyWarning?.severity).toBe('error');
	});

	it('marks weekly overtime day warnings as errors when overtimeEnforcement is BLOCK', () => {
		const periodStartDateKey = '2025-01-06';
		const periodEndDateKey = '2025-01-09';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const sessions = ['2025-01-06', '2025-01-07', '2025-01-08', '2025-01-09'].flatMap(
			(dayKey) => {
				const checkIn = getUtcDateForZonedTime(dayKey, 8, 0, timeZone);
				const checkOut = getUtcDateForZonedTime(dayKey, 17, 0, timeZone);
				return createAttendancePair(employeeId, checkIn, checkOut);
			},
		);

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: sessions,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeEnforcement: 'BLOCK',
		});

		const row = employees[0];
		const weeklyDaysWarning = row?.warnings.find(
			(w) => w.type === 'OVERTIME_WEEKLY_DAYS_EXCEEDED',
		);
		expect(weeklyDaysWarning?.severity).toBe('error');
	});

	it('marks weekly overtime warnings as errors when overtimeEnforcement is BLOCK', () => {
		const periodStartDateKey = '2025-01-06';
		const periodEndDateKey = '2025-01-10';
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
			'2025-01-10',
		].flatMap((dayKey) => {
			const checkIn = getUtcDateForZonedTime(dayKey, 8, 0, timeZone);
			const checkOut = getUtcDateForZonedTime(dayKey, 18, 0, timeZone);
			return createAttendancePair(employeeId, checkIn, checkOut);
		});

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: sessions,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeEnforcement: 'BLOCK',
		});

		const row = employees[0];
		const weeklyWarning = row?.warnings.find((w) => w.type === 'OVERTIME_WEEKLY_EXCEEDED');
		expect(row?.warnings.some((w) => w.type === 'OVERTIME_DAILY_EXCEEDED')).toBe(false);
		expect(weeklyWarning?.severity).toBe('error');
	});

	it('applies mandatory rest day premium for additionalMandatoryRestDays', () => {
		const periodStartDateKey = '2025-02-13';
		const periodEndDateKey = '2025-02-13';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const checkIn = getUtcDateForZonedTime(periodStartDateKey, 8, 0, timeZone);
		const checkOut = getUtcDateForZonedTime(periodEndDateKey, 9, 0, timeZone);

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: createAttendancePair(employeeId, checkIn, checkOut),
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			additionalMandatoryRestDays: [periodStartDateKey],
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(1);
		expect(row?.mandatoryRestDaysWorkedCount).toBe(1);
		expect(row?.mandatoryRestDayPremiumAmount).toBe(1600);
	});

	it('emits a below-minimum-wage warning per geographic zone', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-02';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const underpaidGeneralEmployee: PayrollEmployeeRow = {
			...defaultEmployee,
			id: 'emp-underpaid-general',
			locationGeographicZone: 'GENERAL',
			dailyPay: 200,
		};

		const underpaidZlfnEmployee: PayrollEmployeeRow = {
			...defaultEmployee,
			id: 'emp-underpaid-zlfn',
			locationGeographicZone: 'ZLFN',
			dailyPay: 400,
		};

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			employees: [underpaidGeneralEmployee, underpaidZlfnEmployee],
			attendanceRows: [],
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
		});

		const general = employees.find((e) => e.employeeId === underpaidGeneralEmployee.id);
		expect(general?.warnings.some((w) => w.type === 'BELOW_MINIMUM_WAGE')).toBe(true);

		const zlfn = employees.find((e) => e.employeeId === underpaidZlfnEmployee.id);
		expect(zlfn?.warnings.some((w) => w.type === 'BELOW_MINIMUM_WAGE')).toBe(true);
	});

	it('uses shiftType daily limits and divisors (NOCTURNA vs MIXTA)', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-02';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const nocturnaEmployee: PayrollEmployeeRow = {
			...defaultEmployee,
			id: 'emp-nocturna',
			shiftType: 'NOCTURNA',
			dailyPay: 700,
		};

		const mixtaEmployee: PayrollEmployeeRow = {
			...defaultEmployee,
			id: 'emp-mixta',
			shiftType: 'MIXTA',
			dailyPay: 750,
		};

		const nocturnaAttendance = createAttendancePair(
			nocturnaEmployee.id,
			getUtcDateForZonedTime(periodStartDateKey, 8, 0, timeZone),
			getUtcDateForZonedTime(periodEndDateKey, 16, 0, timeZone),
		);

		const mixtaAttendance = createAttendancePair(
			mixtaEmployee.id,
			getUtcDateForZonedTime(periodStartDateKey, 8, 0, timeZone),
			getUtcDateForZonedTime(periodEndDateKey, 16, 0, timeZone),
		);

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			employees: [nocturnaEmployee, mixtaEmployee],
			attendanceRows: [...nocturnaAttendance, ...mixtaAttendance],
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeAuthorizations: [
				{
					employeeId: nocturnaEmployee.id,
					dateKey: periodStartDateKey,
					authorizedHours: 1,
					status: 'ACTIVE',
				},
				{
					employeeId: mixtaEmployee.id,
					dateKey: periodStartDateKey,
					authorizedHours: 0.5,
					status: 'ACTIVE',
				},
			],
		});

		const nocturna = employees.find((e) => e.employeeId === nocturnaEmployee.id);
		expect(nocturna?.hoursWorked).toBe(8);
		expect(nocturna?.normalHours).toBe(7);
		expect(nocturna?.overtimeDoubleHours).toBe(1);
		expect(nocturna?.hourlyPay).toBe(100);
		expect(nocturna?.totalPay).toBe(900);

		const mixta = employees.find((e) => e.employeeId === mixtaEmployee.id);
		expect(mixta?.hoursWorked).toBe(8);
		expect(mixta?.normalHours).toBeCloseTo(7.5, 6);
		expect(mixta?.overtimeDoubleHours).toBeCloseTo(0.5, 6);
		expect(mixta?.hourlyPay).toBe(100);
		expect(mixta?.totalPay).toBeCloseTo(850, 6);
	});

	it('calculates expectedHours from schedules (including overnight schedules)', () => {
		const periodStartDateKey = '2025-01-06';
		const periodEndDateKey = '2025-01-06';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const schedules = [
			{
				employeeId,
				dayOfWeek: 1,
				startTime: '22:00',
				endTime: '06:00',
				isWorkingDay: true,
			},
		];

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			schedules,
			attendanceRows: [],
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
		});

		const row = employees[0];
		expect(row?.expectedHours).toBe(8);
	});

	it('ignores unpaired attendance records (missing CHECK_IN/CHECK_OUT)', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-02';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const attendanceRows: AttendanceRow[] = [
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 7, 0, timeZone),
				type: 'CHECK_OUT',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 8, 0, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 13, 0, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 17, 0, timeZone),
				type: 'CHECK_OUT',
			},
		];

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeAuthorizations: [
				{
					employeeId,
					dateKey: periodStartDateKey,
					authorizedHours: 1,
					status: 'ACTIVE',
				},
			],
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(4);
		expect(row?.normalHours).toBe(4);
		expect(row?.overtimeDoubleHours).toBe(0);
		expect(row?.sundayPremiumAmount).toBe(0);
		expect(row?.mandatoryRestDayPremiumAmount).toBe(0);
		expect(row?.totalPay).toBe(400);
	});

	it('counts paid time between CHECK_OUT_AUTHORIZED and the next CHECK_IN', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-02';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const attendanceRows: AttendanceRow[] = [
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 9, 0, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 11, 0, timeZone),
				type: 'CHECK_OUT_AUTHORIZED',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 13, 0, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 18, 0, timeZone),
				type: 'CHECK_OUT',
			},
		];

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeAuthorizations: [
				{
					employeeId,
					dateKey: periodStartDateKey,
					authorizedHours: 1,
					status: 'ACTIVE',
				},
			],
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(9);
		expect(row?.normalHours).toBe(8);
		expect(row?.overtimeDoubleHours).toBe(1);
		expect(row?.overtimeTripleHours).toBe(0);
		expect(row?.totalPay).toBe(1000);
	});

	it('counts WORK_OFFSITE LABORABLE as a standard paid shift', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-02';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const attendanceRows: AttendanceRow[] = [
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 0, 0, timeZone),
				type: 'WORK_OFFSITE',
				offsiteDateKey: periodStartDateKey,
				offsiteDayKind: 'LABORABLE',
			},
		];

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(8);
		expect(row?.normalHours).toBe(8);
		expect(row?.mandatoryRestDaysWorkedCount).toBe(0);
		expect(row?.normalPay).toBe(800);
		expect(row?.mandatoryRestDayPremiumAmount).toBe(0);
		expect(row?.totalPay).toBe(800);
	});

	it('counts WORK_OFFSITE NO_LABORABLE using rest-day premium rules', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-02';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const attendanceRows: AttendanceRow[] = [
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 0, 0, timeZone),
				type: 'WORK_OFFSITE',
				offsiteDateKey: periodStartDateKey,
				offsiteDayKind: 'NO_LABORABLE',
			},
		];

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(8);
		expect(row?.normalHours).toBe(8);
		expect(row?.mandatoryRestDaysWorkedCount).toBe(1);
		expect(row?.normalPay).toBe(800);
		expect(row?.mandatoryRestDayPremiumAmount).toBe(1600);
		expect(row?.totalPay).toBe(2400);
	});

	it('prioritizes WORK_OFFSITE over check segments on the same date', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-02';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const attendanceRows: AttendanceRow[] = [
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 9, 0, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 21, 0, timeZone),
				type: 'CHECK_OUT',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 23, 0, timeZone),
				type: 'WORK_OFFSITE',
				offsiteDateKey: periodStartDateKey,
				offsiteDayKind: 'LABORABLE',
			},
		];

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(8);
		expect(row?.normalHours).toBe(8);
		expect(row?.overtimeDoubleHours).toBe(0);
		expect(row?.overtimeTripleHours).toBe(0);
		expect(row?.totalPay).toBe(800);
	});

	it('closes paid authorized exit span when a WORK_OFFSITE day starts', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-04';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const offsiteDateKey = '2025-01-03';
		const attendanceRows: AttendanceRow[] = [
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 22, 0, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 23, 0, timeZone),
				type: 'CHECK_OUT_AUTHORIZED',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(offsiteDateKey, 0, 0, timeZone),
				type: 'WORK_OFFSITE',
				offsiteDateKey,
				offsiteDayKind: 'LABORABLE',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodEndDateKey, 9, 0, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodEndDateKey, 10, 0, timeZone),
				type: 'CHECK_OUT',
			},
		];

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(11);
		expect(row?.normalHours).toBe(11);
		expect(row?.overtimeDoubleHours).toBe(0);
		expect(row?.overtimeTripleHours).toBe(0);
		expect(row?.totalPay).toBe(1100);
	});

	it('returns zeroed hours and pay when there is no attendance', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-02';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const { employees, totalAmount } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: [],
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(0);
		expect(row?.expectedHours).toBe(0);
		expect(row?.normalHours).toBe(0);
		expect(row?.overtimeDoubleHours).toBe(0);
		expect(row?.overtimeTripleHours).toBe(0);
		expect(row?.sundayPremiumAmount).toBe(0);
		expect(row?.mandatoryRestDayPremiumAmount).toBe(0);
		expect(row?.totalPay).toBe(0);
		expect(row?.warnings).toHaveLength(0);
		expect(totalAmount).toBe(0);
	});

	it('does not double-count Sunday premium across multiple sessions on the same Sunday', () => {
		const periodStartDateKey = '2025-01-05';
		const periodEndDateKey = '2025-01-05';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const attendanceRows = [
			...createAttendancePair(
				employeeId,
				getUtcDateForZonedTime(periodStartDateKey, 8, 0, timeZone),
				getUtcDateForZonedTime(periodEndDateKey, 10, 0, timeZone),
			),
			...createAttendancePair(
				employeeId,
				getUtcDateForZonedTime(periodStartDateKey, 14, 0, timeZone),
				getUtcDateForZonedTime(periodEndDateKey, 16, 0, timeZone),
			),
		];

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(4);
		expect(row?.sundayHoursWorked).toBe(4);
		expect(row?.sundayPremiumAmount).toBe(200);
		expect(row?.totalPay).toBe(600);
	});

	it('applies both Sunday and mandatory rest day premiums (de-duped by local date key)', () => {
		const periodStartDateKey = '2025-01-05';
		const periodEndDateKey = '2025-01-05';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const attendanceRows = [
			...createAttendancePair(
				employeeId,
				getUtcDateForZonedTime(periodStartDateKey, 8, 0, timeZone),
				getUtcDateForZonedTime(periodEndDateKey, 10, 0, timeZone),
			),
			...createAttendancePair(
				employeeId,
				getUtcDateForZonedTime(periodStartDateKey, 14, 0, timeZone),
				getUtcDateForZonedTime(periodEndDateKey, 16, 0, timeZone),
			),
		];

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			additionalMandatoryRestDays: [periodStartDateKey],
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(4);
		expect(row?.sundayHoursWorked).toBe(4);
		expect(row?.sundayPremiumAmount).toBe(200);
		expect(row?.mandatoryRestDaysWorkedCount).toBe(1);
		expect(row?.mandatoryRestDayPremiumAmount).toBe(1600);
		expect(row?.totalPay).toBe(2200);
	});

	it('segments work by employee time zone when computing daily overtime', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-03';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const utcEmployee: PayrollEmployeeRow = {
			...defaultEmployee,
			id: 'emp-utc',
			locationTimeZone: 'UTC',
		};

		const mxEmployee: PayrollEmployeeRow = {
			...defaultEmployee,
			id: 'emp-mx',
			locationTimeZone: timeZone,
		};

		const checkIn = new Date('2025-01-02T23:00:00.000Z');
		const checkOut = new Date('2025-01-03T09:00:00.000Z');

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			employees: [utcEmployee, mxEmployee],
			attendanceRows: [
				...createAttendancePair(utcEmployee.id, checkIn, checkOut),
				...createAttendancePair(mxEmployee.id, checkIn, checkOut),
			],
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
		});

		const utcRow = employees.find((row) => row.employeeId === utcEmployee.id);
		const mxRow = employees.find((row) => row.employeeId === mxEmployee.id);
		expect(utcRow?.normalHours).toBe(9);
		expect(utcRow?.overtimeDoubleHours).toBe(1);
		expect(mxRow?.normalHours).toBe(10);
		expect(mxRow?.overtimeDoubleHours).toBe(0);
	});

	it('falls back to defaultTimeZone when employee locationTimeZone is invalid', () => {
		const periodStartDateKey = '2025-01-04';
		const periodEndDateKey = '2025-01-05';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const employeeWithInvalidTimeZone: PayrollEmployeeRow = {
			...defaultEmployee,
			id: 'emp-invalid-tz',
			locationTimeZone: 'Invalid/TimeZone',
		};

		const checkIn = getUtcDateForZonedTime(periodStartDateKey, 22, 0, timeZone);
		const checkOut = getUtcDateForZonedTime(periodEndDateKey, 6, 0, timeZone);

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			employees: [employeeWithInvalidTimeZone],
			attendanceRows: createAttendancePair(employeeWithInvalidTimeZone.id, checkIn, checkOut),
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(8);
		expect(row?.sundayHoursWorked).toBe(6);
		expect(row?.sundayPremiumAmount).toBe(200);
	});
});

describe('payroll-calculation mexico taxes', () => {
	const timeZone = 'America/Mexico_City';
	const periodStartDateKey = '2025-12-15';
	const periodEndDateKey = '2025-12-21';
	const periodBounds = getPayrollPeriodBounds({
		periodStartDateKey,
		periodEndDateKey,
		timeZone,
	});

	const employees: PayrollEmployeeRow[] = [
		{
			id: 'emp-002',
			firstName: 'Jose',
			lastName: 'Guzman',
			dailyPay: 278.8,
			paymentFrequency: 'WEEKLY',
			shiftType: 'DIURNA',
			locationGeographicZone: 'GENERAL',
			locationTimeZone: timeZone,
			hireDate: new Date('2020-11-09T00:00:00Z'),
		},
		{
			id: 'emp-003',
			firstName: 'Ana',
			lastName: 'Guerrero',
			dailyPay: 278.8,
			paymentFrequency: 'WEEKLY',
			shiftType: 'DIURNA',
			locationGeographicZone: 'GENERAL',
			locationTimeZone: timeZone,
			hireDate: new Date('2022-01-04T00:00:00Z'),
		},
	];
	const baseEmployee = employees[0];
	if (!baseEmployee) {
		throw new Error('Base employee missing');
	}

	const schedules: ScheduleRow[] = [
		...buildWeeklySchedule('emp-002'),
		...buildWeeklySchedule('emp-003'),
	];

	const attendanceRows: AttendanceRow[] = [
		...buildWeeklyAttendance('emp-002', periodStartDateKey, periodEndDateKey, timeZone),
		...buildWeeklyAttendance('emp-003', periodStartDateKey, periodEndDateKey, timeZone),
	];

	const baseArgs = {
		employees,
		schedules,
		attendanceRows,
		periodStartDateKey,
		periodEndDateKey,
		periodBounds,
		overtimeEnforcement: 'WARN' as const,
		weekStartDay: 1,
		additionalMandatoryRestDays: [],
		defaultTimeZone: timeZone,
	};

	const baseTaxSettings = {
		riskWorkRate: 0.06,
		statePayrollTaxRate: 0.02,
		aguinaldoDays: 15,
		vacationPremiumRate: 0.25,
		enableSeventhDayPay: true,
	};

	it('matches the reference report with absorption enabled', () => {
		const { employees: results, taxSummary } = calculatePayrollFromData({
			...baseArgs,
			payrollSettings: {
				...baseTaxSettings,
				absorbImssEmployeeShare: true,
				absorbIsr: true,
			},
		});

		expect(results).toHaveLength(2);

		for (const row of results) {
			expect(row.seventhDayPay).toBe(278.8);
			expect(row.grossPay).toBe(1951.6);
			expect(row.informationalLines.isrBeforeSubsidy).toBe(139.32);
			expect(row.informationalLines.subsidyApplied).toBe(109.38);
			expect(row.employeeWithholdings.total).toBe(0);
			expect(row.employeeWithholdings.isrWithheld).toBe(0);
			expect(row.netPay).toBe(1951.6);
			expect(row.companyCost).toBe(
				Number((row.grossPay + row.employerCosts.total).toFixed(2)),
			);
		}

		const imssEmployerTotal = sumRounded(
			results.map((row) => row.employerCosts.imssEmployer.total),
		);
		const imssEmFixed = sumRounded(
			results.map((row) => row.employerCosts.imssEmployer.emFixed),
		);
		const imssDinGastos = sumRounded(
			results.map(
				(row) => row.employerCosts.imssEmployer.pd + row.employerCosts.imssEmployer.gmp,
			),
		);
		const imssIv = sumRounded(results.map((row) => row.employerCosts.imssEmployer.iv));
		const imssCv = sumRounded(results.map((row) => row.employerCosts.imssEmployer.cv));
		const sarTotal = sumRounded(results.map((row) => row.employerCosts.sarRetiro));
		const isnTotal = sumRounded(results.map((row) => row.employerCosts.isn));
		const rtTotal = sumRounded(results.map((row) => row.employerCosts.riskWork));
		const infonavitTotal = sumRounded(results.map((row) => row.employerCosts.infonavit));
		const guarderiasTotal = sumRounded(
			results.map((row) => row.employerCosts.imssEmployer.guarderias),
		);

		expect(imssEmployerTotal).toBe(782.9);
		expect(imssEmFixed).toBe(323.12);
		expect(imssDinGastos).toBe(97.66);
		expect(imssIv).toBe(97.65);
		expect(imssCv).toBe(264.47);
		expect(sarTotal).toBe(82.23);
		expect(isnTotal).toBe(78.06);
		expect(rtTotal).toBe(246.7);
		expect(infonavitTotal).toBe(205.59);
		expect(guarderiasTotal).toBe(41.12);

		const obligationsTotal = sumRounded([
			imssEmployerTotal,
			sarTotal,
			isnTotal,
			rtTotal,
			infonavitTotal,
			guarderiasTotal,
		]);
		expect(obligationsTotal).toBe(1436.6);

		expect(taxSummary.grossTotal).toBe(3903.2);
		expect(taxSummary.netPayTotal).toBe(3903.2);
	});

	it('matches the reference report without absorption', () => {
		const { employees: results, taxSummary } = calculatePayrollFromData({
			...baseArgs,
			payrollSettings: {
				...baseTaxSettings,
				absorbImssEmployeeShare: false,
				absorbIsr: false,
			},
		});

		const emp002 = results.find((row) => row.employeeId === 'emp-002');
		const emp003 = results.find((row) => row.employeeId === 'emp-003');
		expect(emp002?.employeeWithholdings.isrWithheld).toBe(29.94);
		expect(emp003?.employeeWithholdings.isrWithheld).toBe(29.94);
		expect(emp002?.employeeWithholdings.imssEmployee.total).toBe(48.89);
		expect(emp003?.employeeWithholdings.imssEmployee.total).toBe(48.76);
		expect(emp002?.netPay).toBe(1872.77);
		expect(emp003?.netPay).toBe(1872.9);

		const imssEmployerTotal = sumRounded(
			results.map((row) => row.employerCosts.imssEmployer.total),
		);
		expect(imssEmployerTotal).toBe(685.25);

		expect(taxSummary.grossTotal).toBe(3903.2);
		expect(taxSummary.netPayTotal).toBe(3745.67);
	});

	it('applies SBC override over automatic calculation', () => {
		const { employees: results } = calculatePayrollFromData({
			...baseArgs,
			employees: [
				{
					...baseEmployee,
					id: 'emp-override',
					sbcDailyOverride: 400,
				},
			],
			schedules: buildWeeklySchedule('emp-override'),
			attendanceRows: buildWeeklyAttendance(
				'emp-override',
				periodStartDateKey,
				periodEndDateKey,
				timeZone,
			),
			payrollSettings: {
				...baseTaxSettings,
				absorbImssEmployeeShare: false,
				absorbIsr: false,
			},
		});

		const row = results[0];
		expect(row?.bases.sbcDaily).toBe(400);
	});

	it('does not pay seventh day when attendance is missing', () => {
		const { employees: results } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: buildWeeklyAttendance(
				'emp-002',
				periodStartDateKey,
				periodEndDateKey,
				timeZone,
				['2025-12-19'],
			),
			employees: [baseEmployee],
			schedules: buildWeeklySchedule('emp-002'),
			payrollSettings: {
				...baseTaxSettings,
				absorbImssEmployeeShare: false,
				absorbIsr: false,
			},
		});

		const row = results[0];
		expect(row?.seventhDayPay).toBe(0);
	});

	it('ensures fiscal invariants are preserved', () => {
		const { employees: results } = calculatePayrollFromData({
			...baseArgs,
			payrollSettings: {
				...baseTaxSettings,
				absorbImssEmployeeShare: false,
				absorbIsr: false,
			},
		});

		for (const row of results) {
			const expectedNet = Number((row.grossPay - row.employeeWithholdings.total).toFixed(2));
			const expectedCompanyCost = Number((row.grossPay + row.employerCosts.total).toFixed(2));
			expect(row.grossPay).toBe(row.totalPay);
			expect(row.netPay).toBe(expectedNet);
			expect(row.companyCost).toBe(expectedCompanyCost);
			expect(Number(row.grossPay.toFixed(2))).toBe(row.grossPay);
			expect(Number(row.netPay.toFixed(2))).toBe(row.netPay);
			expect(Number(row.companyCost.toFixed(2))).toBe(row.companyCost);
		}
	});
});

describe('payroll-calculation mexico taxes 2026', () => {
	const baseSettings: MexicoPayrollTaxSettings = {
		riskWorkRate: 0,
		statePayrollTaxRate: 0,
		absorbImssEmployeeShare: false,
		absorbIsr: false,
		aguinaldoDays: 15,
		vacationPremiumRate: 0.25,
	};

	const baseInput = {
		dailyPay: 278.8,
		grossPay: 1951.6,
		paymentFrequency: 'WEEKLY' as const,
		periodStartDateKey: '2026-01-05',
		periodEndDateKey: '2026-01-11',
		hireDate: new Date('2020-01-01T00:00:00Z'),
		locationGeographicZone: 'GENERAL' as const,
		settings: baseSettings,
	};

	it('uses 2026 ISR tables for weekly calculations', () => {
		const result = calculateMexicoPayrollTaxes(baseInput);
		expect(result.informationalLines.isrBeforeSubsidy).toBe(129.69);
	});

	it('applies subsidy changes between January and February 2026', () => {
		const january = calculateMexicoPayrollTaxes({
			...baseInput,
			periodStartDateKey: '2026-01-08',
			periodEndDateKey: '2026-01-14',
		});
		const february = calculateMexicoPayrollTaxes({
			...baseInput,
			periodStartDateKey: '2026-02-02',
			periodEndDateKey: '2026-02-08',
		});

		expect(january.informationalLines.subsidyApplied).toBe(123.47);
		expect(february.informationalLines.subsidyApplied).toBe(123.34);
	});

	it('sums UMA-dependent components across the 2026-02-01 switch', () => {
		const result = calculateMexicoPayrollTaxes({
			...baseInput,
			dailyPay: 1000,
			grossPay: 7000,
			periodStartDateKey: '2026-01-29',
			periodEndDateKey: '2026-02-04',
		});

		expect(result.employerCosts.imssEmployer.emFixed).toBe(164.97);
	});
});
