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

	it('clips a session that ends after the period (timezone midnight bounds)', () => {
		const periodStartDateKey = '2025-01-01';
		const periodEndDateKey = '2025-01-01';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		expect(toDateKeyInTimeZone(periodBounds.periodStartUtc, timeZone)).toBe(periodStartDateKey);
		expect(toDateKeyInTimeZone(periodBounds.periodEndExclusiveUtc, timeZone)).toBe('2025-01-02');

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

	it('does not undercount daily overtime for overnight sessions (session-based overtime)', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-03';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const checkIn = getUtcDateForZonedTime(periodStartDateKey, 20, 0, timeZone);
		const checkOut = getUtcDateForZonedTime(periodEndDateKey, 8, 0, timeZone);

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
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(4);
		expect(row?.normalHours).toBe(4);
		expect(row?.overtimeDoubleHours).toBe(0);
		expect(row?.sundayPremiumAmount).toBe(0);
		expect(row?.mandatoryRestDayPremiumAmount).toBe(0);
		expect(row?.totalPay).toBe(400);
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

