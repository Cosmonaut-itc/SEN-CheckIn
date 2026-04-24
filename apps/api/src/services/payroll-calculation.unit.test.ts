import { describe, expect, it } from 'bun:test';

import {
	calculatePayrollFromData,
	getPayrollPeriodBounds,
	type AttendanceRow,
	type PayrollEmployeeRow,
	type ScheduleRow,
} from './payroll-calculation.js';

const TEST_TIME_ZONE = 'America/Mexico_City';

/**
 * Builds a UTC instant for a local date/time in Mexico City.
 *
 * @param dateKey - Local date key
 * @param hour - Local hour
 * @param minute - Local minute
 * @returns UTC instant
 * @throws Error when the date key is invalid
 */
function getMexicoCityInstant(dateKey: string, hour: number, minute: number): Date {
	const [year, month, day] = dateKey.split('-').map(Number);
	if (!year || !month || !day) {
		throw new Error(`Invalid date key: ${dateKey}`);
	}
	return new Date(Date.UTC(year, month - 1, day, hour + 6, minute, 0, 0));
}

describe('payroll cutoff assumed attendance', () => {
	it('does not inject or audit assumed hours over a complete short real attendance day', () => {
		const employeeId = 'emp-short-real-attendance';
		const periodStartDateKey = '2026-04-24';
		const periodEndDateKey = '2026-04-24';
		const employee: PayrollEmployeeRow = {
			id: employeeId,
			firstName: 'Carlos',
			lastName: 'Corte',
			dailyPay: 800,
			paymentFrequency: 'WEEKLY',
			shiftType: 'DIURNA',
			locationGeographicZone: 'GENERAL',
			locationTimeZone: TEST_TIME_ZONE,
		};
		const schedules: ScheduleRow[] = [
			{
				employeeId,
				dayOfWeek: 5,
				startTime: '09:00',
				endTime: '17:00',
				isWorkingDay: true,
			},
		];
		const attendanceRows: AttendanceRow[] = [
			{
				employeeId,
				timestamp: getMexicoCityInstant('2026-04-24', 9, 0),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getMexicoCityInstant('2026-04-24', 13, 0),
				type: 'CHECK_OUT',
			},
		];

		const { employees } = calculatePayrollFromData({
			employees: [employee],
			schedules,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds: getPayrollPeriodBounds({
				periodStartDateKey,
				periodEndDateKey,
				timeZone: TEST_TIME_ZONE,
			}),
			overtimeEnforcement: 'WARN',
			weekStartDay: 1,
			additionalMandatoryRestDays: [],
			defaultTimeZone: TEST_TIME_ZONE,
			assumedAttendanceDateKeys: {
				[employeeId]: ['2026-04-24'],
			},
		});

		const row = employees[0];
		expect(row?.hoursWorked).toBe(4);
		expect(row?.normalHours).toBe(4);
		expect(row?.assumedAttendanceDateKeys).toEqual([]);
	});
});
