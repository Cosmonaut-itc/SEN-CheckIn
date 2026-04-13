import { describe, expect, it } from 'bun:test';

import { addDaysToDateKey } from '../utils/date-key.js';
import { resolveMinimumWageDaily } from '../utils/minimum-wage.js';
import { getUtcDateForZonedMidnight, toDateKeyInTimeZone } from '../utils/time-zone.js';
import {
	calculateMexicoPayrollTaxes,
	getSbcDaily,
	type MexicoPayrollTaxSettings,
} from './mexico-payroll-taxes.js';
import {
	calculatePayrollFromData,
	getPayrollPeriodBounds,
	type AttendanceRow,
	type CalculatePayrollFromDataArgs,
	type OvertimeAuthorizationRow,
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
 * Builds schedule rows for the provided working weekdays.
 *
 * @param employeeId - Employee identifier
 * @param workingDays - Working day indexes (0 = Sunday ... 6 = Saturday)
 * @returns Schedule rows for the full week
 */
function buildScheduleForWorkingDays(
	employeeId: string,
	workingDays: number[],
): ScheduleRow[] {
	const workingDaySet = new Set(workingDays);
	return Array.from({ length: 7 }, (_, dayOfWeek) => ({
		employeeId,
		dayOfWeek,
		startTime: '09:00',
		endTime: '17:00',
		isWorkingDay: workingDaySet.has(dayOfWeek),
	}));
}

/**
 * Creates attendance rows for a list of worked date keys.
 *
 * @param employeeId - Employee identifier
 * @param workedDateKeys - Date keys worked during the period
 * @param timeZone - IANA timezone identifier
 * @returns Attendance rows for the provided worked dates
 */
function buildAttendanceForDateKeys(
	employeeId: string,
	workedDateKeys: string[],
	timeZone: string,
): AttendanceRow[] {
	return workedDateKeys.flatMap((dateKey) =>
		createAttendancePair(
			employeeId,
			getUtcDateForZonedTime(dateKey, 9, 0, timeZone),
			getUtcDateForZonedTime(dateKey, 17, 0, timeZone),
		),
	);
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

/**
 * Builds payroll settings overrides for lunch break deduction scenarios.
 *
 * @param overrides - Lunch break-specific overrides
 * @returns Payroll settings override payload compatible with current calculator args
 */
function buildLunchBreakSettings(overrides: {
	autoDeductLunchBreak: boolean;
	lunchBreakMinutes?: number;
	lunchBreakThresholdHours?: number;
}): CalculatePayrollFromDataArgs['payrollSettings'] {
	return {
		autoDeductLunchBreak: overrides.autoDeductLunchBreak,
		lunchBreakMinutes: overrides.lunchBreakMinutes ?? 60,
		lunchBreakThresholdHours: overrides.lunchBreakThresholdHours ?? 6,
	} as CalculatePayrollFromDataArgs['payrollSettings'];
}

type TestEmployeeDeduction = {
	id: string;
	employeeId: string;
	type:
		| 'INFONAVIT'
		| 'ALIMONY'
		| 'FONACOT'
		| 'LOAN'
		| 'UNION_FEE'
		| 'ADVANCE'
		| 'OTHER';
	label: string;
	calculationMethod:
		| 'PERCENTAGE_SBC'
		| 'PERCENTAGE_NET'
		| 'PERCENTAGE_GROSS'
		| 'FIXED_AMOUNT'
		| 'VSM_FACTOR';
	value: number;
	frequency: 'RECURRING' | 'ONE_TIME' | 'INSTALLMENTS';
	totalInstallments: number | null;
	completedInstallments: number;
	totalAmount: number | null;
	remainingAmount: number | null;
	status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
	startDateKey: string;
	endDateKey: string | null;
};

type TestEmployeeGratification = {
	id: string;
	employeeId: string;
	concept: string;
	amount: number;
	periodicity: 'ONE_TIME' | 'RECURRING';
	applicationMode: 'MANUAL' | 'AUTOMATIC';
	status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
	startDateKey: string;
	endDateKey: string | null;
	notes: string | null;
	createdAt: Date | null;
};

/**
 * Creates a test employee deduction row.
 *
 * @param overrides - Field overrides for the deduction row
 * @returns Deduction row payload for payroll calculation tests
 */
function createEmployeeDeduction(
	overrides: Partial<TestEmployeeDeduction>,
): TestEmployeeDeduction {
	return {
		id: overrides.id ?? `deduction-${Math.random().toString(16).slice(2, 8)}`,
		employeeId: overrides.employeeId ?? 'emp-test-1',
		type: overrides.type ?? 'OTHER',
		label: overrides.label ?? 'Descuento de prueba',
		calculationMethod: overrides.calculationMethod ?? 'FIXED_AMOUNT',
		value: overrides.value ?? 100,
		frequency: overrides.frequency ?? 'RECURRING',
		totalInstallments: overrides.totalInstallments ?? null,
		completedInstallments: overrides.completedInstallments ?? 0,
		totalAmount: overrides.totalAmount ?? null,
		remainingAmount: overrides.remainingAmount ?? null,
		status: overrides.status ?? 'ACTIVE',
		startDateKey: overrides.startDateKey ?? '2025-03-03',
		endDateKey: overrides.endDateKey ?? null,
	};
}

/**
 * Creates a test employee gratification row.
 *
 * @param overrides - Field overrides for the gratification row
 * @returns Gratification row payload for payroll calculation tests
 */
function createEmployeeGratification(
	overrides: Partial<TestEmployeeGratification>,
): TestEmployeeGratification {
	return {
		id: overrides.id ?? `gratification-${Math.random().toString(16).slice(2, 8)}`,
		employeeId: overrides.employeeId ?? 'emp-test-1',
		concept: overrides.concept ?? 'Gratificación de prueba',
		amount: overrides.amount ?? 100,
		periodicity: overrides.periodicity ?? 'ONE_TIME',
		applicationMode: overrides.applicationMode ?? 'MANUAL',
		status: overrides.status ?? 'ACTIVE',
		startDateKey: overrides.startDateKey ?? '2025-03-03',
		endDateKey: overrides.endDateKey ?? null,
		notes: overrides.notes ?? null,
		createdAt: overrides.createdAt ?? new Date('2025-03-01T00:00:00.000Z'),
	};
}

/**
 * Builds a standard weekly payroll calculation input with optional deductions.
 *
 * @param args - Optional overrides for the weekly test scenario
 * @returns Payroll calculation arguments
 */
function buildWeeklyPayrollArgsWithDeductions(args?: {
	employeeDeductions?: TestEmployeeDeduction[];
	employeeGratifications?: TestEmployeeGratification[];
	attendanceRows?: AttendanceRow[];
	employeeOverrides?: Partial<PayrollEmployeeRow>;
	payrollSettings?: CalculatePayrollFromDataArgs['payrollSettings'];
}): CalculatePayrollFromDataArgs & {
	employeeDeductions?: TestEmployeeDeduction[];
	employeeGratifications?: TestEmployeeGratification[];
} {
	const employeeId = args?.employeeOverrides?.id ?? 'emp-test-1';
	const timeZone = 'America/Mexico_City';
	const periodStartDateKey = '2025-03-03';
	const periodEndDateKey = '2025-03-09';

	return {
		employees: [
			{
				id: employeeId,
				firstName: 'Ada',
				lastName: 'Lovelace',
				dailyPay: 800,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				...args?.employeeOverrides,
			},
		],
		schedules: buildWeeklySchedule(employeeId),
		attendanceRows:
			args?.attendanceRows ??
			buildWeeklyAttendance(employeeId, periodStartDateKey, periodEndDateKey, timeZone),
		periodStartDateKey,
		periodEndDateKey,
		periodBounds: getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		}),
		overtimeEnforcement: 'WARN',
		weekStartDay: 1,
		additionalMandatoryRestDays: [],
		defaultTimeZone: timeZone,
		employeeDeductions: args?.employeeDeductions,
		employeeGratifications: args?.employeeGratifications,
		payrollSettings: args?.payrollSettings,
	};
}

type DualPayrollEmployee = PayrollEmployeeRow & {
	fiscalDailyPay?: number | null;
};

type DualPayrollSettings = NonNullable<CalculatePayrollFromDataArgs['payrollSettings']> & {
	enableDualPayroll?: boolean;
};

type DualPayrollCalculationRow = ReturnType<typeof calculatePayrollFromData>['employees'][number] & {
	fiscalDailyPay?: number | null;
	fiscalGrossPay?: number | null;
	complementPay?: number | null;
	totalRealPay?: number | null;
};

/**
 * Returns the first calculation row as a dual-payroll-aware test shape.
 *
 * @param rows - Calculation rows
 * @returns First row cast to the extended dual payroll shape
 * @throws Error when no row is available
 */
function requireDualPayrollRow(
	rows: ReturnType<typeof calculatePayrollFromData>['employees'],
): DualPayrollCalculationRow {
	const row = rows[0];
	if (!row) {
		throw new Error('Expected at least one payroll calculation row.');
	}
	return row as DualPayrollCalculationRow;
}

/**
 * Returns the first calculation row as a payroll row with gratification breakdown.
 *
 * @param rows - Calculation rows
 * @returns First row cast to include gratification fields
 * @throws Error when no row is available
 */
function requirePayrollRowWithGratifications(
	rows: ReturnType<typeof calculatePayrollFromData>['employees'],
): DualPayrollCalculationRow & {
	gratificationsBreakdown: Array<{
		gratificationId: string;
		concept: string;
		appliedAmount: number;
		statusBefore: string;
		statusAfter: string;
	}>;
	totalGratifications: number;
} {
	const row = rows[0];
	if (!row) {
		throw new Error('Expected at least one payroll calculation row.');
	}

	return row as DualPayrollCalculationRow & {
		gratificationsBreakdown: Array<{
			gratificationId: string;
			concept: string;
			appliedAmount: number;
			statusBefore: string;
			statusAfter: string;
		}>;
		totalGratifications: number;
	};
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
		expect(row?.payableOvertimeDoubleHours).toBe(2);
		expect(row?.payableOvertimeTripleHours).toBe(0);
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

	it('aggregates repeated authorization warnings across multiple days', () => {
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
				getUtcDateForZonedTime('2025-01-08', 19, 0, timeZone),
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
		const authorizationWarnings =
			row?.warnings.filter(
				(warning) =>
					warning.type === 'OVERTIME_NOT_AUTHORIZED' ||
					warning.type === 'OVERTIME_EXCEEDED_AUTHORIZATION',
			) ?? [];

		expect(authorizationWarnings).toHaveLength(2);
		expect(
			authorizationWarnings.find(
				(warning) => warning.type === 'OVERTIME_EXCEEDED_AUTHORIZATION',
			)?.message,
		).toContain('2025-01-06');
		expect(
			authorizationWarnings.find((warning) => warning.type === 'OVERTIME_NOT_AUTHORIZED')
				?.message,
		).toContain('2025-01-07, 2025-01-08');
	});

	it('indexes overtime authorizations once before iterating employees', () => {
		const periodStartDateKey = '2025-01-06';
		const periodEndDateKey = '2025-01-06';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		let employeeIdReads = 0;
		const overtimeAuthorizations: OvertimeAuthorizationRow[] = [
			{
				get employeeId(): string {
					employeeIdReads += 1;
					return employeeId;
				},
				dateKey: periodStartDateKey,
				authorizedHours: 1,
				status: 'ACTIVE',
			},
			{
				get employeeId(): string {
					employeeIdReads += 1;
					return 'emp-test-2';
				},
				dateKey: periodStartDateKey,
				authorizedHours: 1,
				status: 'ACTIVE',
			},
			{
				get employeeId(): string {
					employeeIdReads += 1;
					return 'emp-test-3';
				},
				dateKey: periodStartDateKey,
				authorizedHours: 1,
				status: 'ACTIVE',
			},
		];

		const employees: PayrollEmployeeRow[] = [
			defaultEmployee,
			{
				...defaultEmployee,
				id: 'emp-test-2',
				firstName: 'Grace',
				lastName: 'Hopper',
			},
			{
				...defaultEmployee,
				id: 'emp-test-3',
				firstName: 'Linus',
				lastName: 'Torvalds',
			},
		];

		calculatePayrollFromData({
			...baseArgs,
			employees,
			attendanceRows: [],
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeAuthorizations,
		});

		expect(employeeIdReads).toBe(overtimeAuthorizations.length);
	});

	it('allocates authorized overtime into weekly double and triple buckets chronologically', () => {
		const periodStartDateKey = '2025-01-06';
		const periodEndDateKey = '2025-01-10';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const attendanceRows = [
			...createAttendancePair(
				employeeId,
				getUtcDateForZonedTime('2025-01-06', 8, 0, timeZone),
				getUtcDateForZonedTime('2025-01-06', 18, 0, timeZone),
			),
			...createAttendancePair(
				employeeId,
				getUtcDateForZonedTime('2025-01-07', 8, 0, timeZone),
				getUtcDateForZonedTime('2025-01-07', 19, 0, timeZone),
			),
			...createAttendancePair(
				employeeId,
				getUtcDateForZonedTime('2025-01-08', 8, 0, timeZone),
				getUtcDateForZonedTime('2025-01-08', 19, 0, timeZone),
			),
			...createAttendancePair(
				employeeId,
				getUtcDateForZonedTime('2025-01-09', 8, 0, timeZone),
				getUtcDateForZonedTime('2025-01-09', 19, 0, timeZone),
			),
			...createAttendancePair(
				employeeId,
				getUtcDateForZonedTime('2025-01-10', 8, 0, timeZone),
				getUtcDateForZonedTime('2025-01-10', 17, 0, timeZone),
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
				{
					employeeId,
					dateKey: '2025-01-09',
					authorizedHours: 3,
					status: 'ACTIVE',
				},
				{
					employeeId,
					dateKey: '2025-01-10',
					authorizedHours: 1,
					status: 'ACTIVE',
				},
			],
		});

		const row = employees[0];
		expect(row?.overtimeDoubleHours).toBe(9);
		expect(row?.overtimeTripleHours).toBe(3);
		expect(row?.authorizedOvertimeHours).toBe(10);
		expect(row?.unauthorizedOvertimeHours).toBe(2);
		expect(row?.payableOvertimeDoubleHours).toBe(7);
		expect(row?.payableOvertimeTripleHours).toBe(3);
		expect(row?.overtimeDoublePay).toBe(1400);
		expect(row?.overtimeTriplePay).toBe(900);
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

	it('does not deduct lunch break automatically when the setting is disabled', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-02';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: createAttendancePair(
				employeeId,
				getUtcDateForZonedTime(periodStartDateKey, 9, 0, timeZone),
				getUtcDateForZonedTime(periodEndDateKey, 17, 0, timeZone),
			),
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			payrollSettings: buildLunchBreakSettings({ autoDeductLunchBreak: false }),
		});

		const row = employees[0];
		const lunchMetrics = row as unknown as {
			lunchBreakAutoDeductedDays: number;
			lunchBreakAutoDeductedMinutes: number;
		};
		expect(row?.hoursWorked).toBe(8);
		expect(lunchMetrics.lunchBreakAutoDeductedDays).toBe(0);
		expect(lunchMetrics.lunchBreakAutoDeductedMinutes).toBe(0);
		expect(
			(row?.warnings ?? []).some(
				(warning) => (warning as { type?: string }).type === 'LUNCH_BREAK_AUTO_DEDUCTED',
			),
		).toBe(false);
	});

	it('deducts the configured lunch break when no lunch checkout exists and the threshold is exceeded', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-02';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: createAttendancePair(
				employeeId,
				getUtcDateForZonedTime(periodStartDateKey, 9, 0, timeZone),
				getUtcDateForZonedTime(periodEndDateKey, 17, 0, timeZone),
			),
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			payrollSettings: buildLunchBreakSettings({
				autoDeductLunchBreak: true,
				lunchBreakMinutes: 60,
				lunchBreakThresholdHours: 6,
			}),
		});

		const row = employees[0];
		const lunchMetrics = row as unknown as {
			lunchBreakAutoDeductedDays: number;
			lunchBreakAutoDeductedMinutes: number;
		};
		expect(row?.hoursWorked).toBe(7);
		expect(row?.normalHours).toBe(7);
		expect(row?.totalPay).toBe(700);
		expect(lunchMetrics.lunchBreakAutoDeductedDays).toBe(1);
		expect(lunchMetrics.lunchBreakAutoDeductedMinutes).toBe(60);
		expect(
			(row?.warnings ?? []).some(
				(warning) => (warning as { type?: string }).type === 'LUNCH_BREAK_AUTO_DEDUCTED',
			),
		).toBe(true);
	});

	it('does not apply an extra lunch deduction when a lunch checkout already exists', () => {
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
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 13, 0, timeZone),
				type: 'CHECK_OUT',
				checkOutReason: 'LUNCH_BREAK',
			} as AttendanceRow,
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 14, 0, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodEndDateKey, 18, 0, timeZone),
				type: 'CHECK_OUT',
			},
		];

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			payrollSettings: buildLunchBreakSettings({ autoDeductLunchBreak: true }),
		});

		const row = employees[0];
		const lunchMetrics = row as unknown as {
			lunchBreakAutoDeductedDays: number;
			lunchBreakAutoDeductedMinutes: number;
		};
		expect(row?.hoursWorked).toBe(8);
		expect(lunchMetrics.lunchBreakAutoDeductedDays).toBe(0);
		expect(lunchMetrics.lunchBreakAutoDeductedMinutes).toBe(0);
		expect(
			(row?.warnings ?? []).some(
				(warning) => (warning as { type?: string }).type === 'LUNCH_BREAK_AUTO_DEDUCTED',
			),
		).toBe(false);
	});

	it('still auto deducts lunch when the only explicit break is personal', () => {
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
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 12, 0, timeZone),
				type: 'CHECK_OUT',
				checkOutReason: 'PERSONAL',
			} as AttendanceRow,
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 12, 5, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodEndDateKey, 17, 5, timeZone),
				type: 'CHECK_OUT',
			},
		];

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			payrollSettings: buildLunchBreakSettings({ autoDeductLunchBreak: true }),
		});

		const row = employees[0];
		const lunchMetrics = row as unknown as {
			lunchBreakAutoDeductedDays: number;
			lunchBreakAutoDeductedMinutes: number;
		};
		expect(row?.hoursWorked).toBeCloseTo(7, 5);
		expect(lunchMetrics.lunchBreakAutoDeductedDays).toBe(1);
		expect(lunchMetrics.lunchBreakAutoDeductedMinutes).toBe(60);
		expect(
			(row?.warnings ?? []).some(
				(warning) => (warning as { type?: string }).type === 'LUNCH_BREAK_AUTO_DEDUCTED',
			),
		).toBe(true);
	});

	it('does not deduct lunch break when worked hours are below threshold', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-02';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows: createAttendancePair(
				employeeId,
				getUtcDateForZonedTime(periodStartDateKey, 9, 0, timeZone),
				getUtcDateForZonedTime(periodEndDateKey, 14, 0, timeZone),
			),
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			payrollSettings: buildLunchBreakSettings({
				autoDeductLunchBreak: true,
				lunchBreakThresholdHours: 6,
			}),
		});

		const row = employees[0];
		const lunchMetrics = row as unknown as {
			lunchBreakAutoDeductedDays: number;
			lunchBreakAutoDeductedMinutes: number;
		};
		expect(row?.hoursWorked).toBe(5);
		expect(lunchMetrics.lunchBreakAutoDeductedDays).toBe(0);
		expect(lunchMetrics.lunchBreakAutoDeductedMinutes).toBe(0);
		expect(
			(row?.warnings ?? []).some(
				(warning) => (warning as { type?: string }).type === 'LUNCH_BREAK_AUTO_DEDUCTED',
			),
		).toBe(false);
	});

	it('does not auto deduct lunch twice when an explicit break spans midnight', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-03';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const attendanceRows: AttendanceRow[] = [
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 20, 0, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 23, 55, timeZone),
				type: 'CHECK_OUT',
				checkOutReason: 'LUNCH_BREAK',
			} as AttendanceRow,
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodEndDateKey, 0, 5, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodEndDateKey, 8, 5, timeZone),
				type: 'CHECK_OUT',
			},
		];

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			payrollSettings: buildLunchBreakSettings({ autoDeductLunchBreak: true }),
		});

		const row = employees[0];
		const lunchMetrics = row as unknown as {
			lunchBreakAutoDeductedDays: number;
			lunchBreakAutoDeductedMinutes: number;
		};

		expect(row?.hoursWorked).toBeCloseTo(715 / 60, 5);
		expect(lunchMetrics.lunchBreakAutoDeductedDays).toBe(0);
		expect(lunchMetrics.lunchBreakAutoDeductedMinutes).toBe(0);
		expect(
			(row?.warnings ?? []).some(
				(warning) => (warning as { type?: string }).type === 'LUNCH_BREAK_AUTO_DEDUCTED',
			),
		).toBe(false);
	});

	it('does auto deduct lunch on the next day when a lunch checkout crosses midnight for too long', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-03';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const attendanceRows: AttendanceRow[] = [
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 20, 0, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 23, 55, timeZone),
				type: 'CHECK_OUT',
				checkOutReason: 'LUNCH_BREAK',
			} as AttendanceRow,
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodEndDateKey, 8, 5, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodEndDateKey, 16, 5, timeZone),
				type: 'CHECK_OUT',
			},
		];

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			payrollSettings: buildLunchBreakSettings({ autoDeductLunchBreak: true }),
		});

		const row = employees[0];
		const lunchMetrics = row as unknown as {
			lunchBreakAutoDeductedDays: number;
			lunchBreakAutoDeductedMinutes: number;
		};

		expect(row?.hoursWorked).toBeCloseTo(655 / 60, 5);
		expect(lunchMetrics.lunchBreakAutoDeductedDays).toBe(1);
		expect(lunchMetrics.lunchBreakAutoDeductedMinutes).toBe(60);
		expect(
			(row?.warnings ?? []).filter(
				(warning) => (warning as { type?: string }).type === 'LUNCH_BREAK_AUTO_DEDUCTED',
			),
		).toHaveLength(1);
	});

	it('does not auto deduct lunch twice for legacy overnight breaks without a checkout reason', () => {
		const periodStartDateKey = '2025-01-02';
		const periodEndDateKey = '2025-01-03';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const attendanceRows: AttendanceRow[] = [
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 20, 0, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodStartDateKey, 23, 55, timeZone),
				type: 'CHECK_OUT',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodEndDateKey, 0, 5, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime(periodEndDateKey, 8, 5, timeZone),
				type: 'CHECK_OUT',
			},
		];

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			payrollSettings: buildLunchBreakSettings({ autoDeductLunchBreak: true }),
		});

		const row = employees[0];
		const lunchMetrics = row as unknown as {
			lunchBreakAutoDeductedDays: number;
			lunchBreakAutoDeductedMinutes: number;
		};

		expect(row?.hoursWorked).toBeCloseTo(715 / 60, 5);
		expect(lunchMetrics.lunchBreakAutoDeductedDays).toBe(0);
		expect(lunchMetrics.lunchBreakAutoDeductedMinutes).toBe(0);
		expect(
			(row?.warnings ?? []).some(
				(warning) => (warning as { type?: string }).type === 'LUNCH_BREAK_AUTO_DEDUCTED',
			),
		).toBe(false);
	});

	it('tracks mixed lunch deduction scenarios across multiple days', () => {
		const periodStartDateKey = '2025-01-06';
		const periodEndDateKey = '2025-01-08';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const attendanceRows: AttendanceRow[] = [
			...createAttendancePair(
				employeeId,
				getUtcDateForZonedTime('2025-01-06', 9, 0, timeZone),
				getUtcDateForZonedTime('2025-01-06', 17, 0, timeZone),
			),
			{
				employeeId,
				timestamp: getUtcDateForZonedTime('2025-01-07', 9, 0, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime('2025-01-07', 13, 0, timeZone),
				type: 'CHECK_OUT',
				checkOutReason: 'LUNCH_BREAK',
			} as AttendanceRow,
			{
				employeeId,
				timestamp: getUtcDateForZonedTime('2025-01-07', 14, 0, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime('2025-01-07', 18, 0, timeZone),
				type: 'CHECK_OUT',
			},
			...createAttendancePair(
				employeeId,
				getUtcDateForZonedTime('2025-01-08', 9, 0, timeZone),
				getUtcDateForZonedTime('2025-01-08', 13, 0, timeZone),
			),
		];

		const { employees } = calculatePayrollFromData({
			...baseArgs,
			attendanceRows,
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			payrollSettings: buildLunchBreakSettings({ autoDeductLunchBreak: true }),
		});

		const row = employees[0];
		const lunchMetrics = row as unknown as {
			lunchBreakAutoDeductedDays: number;
			lunchBreakAutoDeductedMinutes: number;
		};
		expect(row?.hoursWorked).toBe(19);
		expect(lunchMetrics.lunchBreakAutoDeductedDays).toBe(1);
		expect(lunchMetrics.lunchBreakAutoDeductedMinutes).toBe(60);
		expect(
			(row?.warnings ?? []).filter(
				(warning) => (warning as { type?: string }).type === 'LUNCH_BREAK_AUTO_DEDUCTED',
			),
		).toHaveLength(1);
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

	describe('countSaturdayAsWorkedForSeventhDay', () => {
		const employeeId = 'emp-saturday-1';
		const employee: PayrollEmployeeRow = {
			id: employeeId,
			firstName: 'Luisa',
			lastName: 'Neri',
			dailyPay: 350,
			paymentFrequency: 'WEEKLY',
			shiftType: 'DIURNA',
			locationGeographicZone: 'GENERAL',
			locationTimeZone: timeZone,
		};
		const periodStartDateKey = '2025-12-15';
		const periodEndDateKey = '2025-12-21';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});
		const calculationBaseArgs = {
			employees: [employee],
			periodStartDateKey,
			periodEndDateKey,
			periodBounds,
			overtimeEnforcement: 'WARN' as const,
			weekStartDay: 1,
			additionalMandatoryRestDays: [],
			defaultTimeZone: timeZone,
		};
		const defaultSeventhDaySettings: NonNullable<
			CalculatePayrollFromDataArgs['payrollSettings']
		> = {
			enableSeventhDayPay: true,
			countSaturdayAsWorkedForSeventhDay: false,
		};
		const countSaturdaySettings: NonNullable<
			CalculatePayrollFromDataArgs['payrollSettings']
		> = {
			enableSeventhDayPay: true,
			countSaturdayAsWorkedForSeventhDay: true,
		};

		it('preserves current behavior when saturday counting is disabled', () => {
			const { employees: results } = calculatePayrollFromData({
				...calculationBaseArgs,
				schedules: buildScheduleForWorkingDays(employeeId, [1, 2, 3, 4, 5]),
				attendanceRows: buildAttendanceForDateKeys(
					employeeId,
					['2025-12-15', '2025-12-16', '2025-12-17', '2025-12-18', '2025-12-19'],
					timeZone,
				),
				payrollSettings: defaultSeventhDaySettings,
			});

			expect(results[0]?.seventhDayPay).toBe(350);
		});

		it('pays seventh day when saturday counting is enabled for a monday-to-friday schedule', () => {
			const { employees: results } = calculatePayrollFromData({
				...calculationBaseArgs,
				schedules: buildScheduleForWorkingDays(employeeId, [1, 2, 3, 4, 5]),
				attendanceRows: buildAttendanceForDateKeys(
					employeeId,
					['2025-12-15', '2025-12-16', '2025-12-17', '2025-12-18', '2025-12-19'],
					timeZone,
				),
				payrollSettings: countSaturdaySettings,
			});

			expect(results[0]?.seventhDayPay).toBe(350);
		});

		it('does not pay seventh day when a monday-to-friday employee misses a weekday', () => {
			const { employees: results } = calculatePayrollFromData({
				...calculationBaseArgs,
				schedules: buildScheduleForWorkingDays(employeeId, [1, 2, 3, 4, 5]),
				attendanceRows: buildAttendanceForDateKeys(
					employeeId,
					['2025-12-15', '2025-12-16', '2025-12-18', '2025-12-19'],
					timeZone,
				),
				payrollSettings: countSaturdaySettings,
			});

			expect(results[0]?.seventhDayPay).toBe(0);
		});

		it('does not pay seventh day when saturday is scheduled and the employee misses it', () => {
			const { employees: results } = calculatePayrollFromData({
				...calculationBaseArgs,
				schedules: buildScheduleForWorkingDays(employeeId, [1, 2, 3, 4, 5, 6]),
				attendanceRows: buildAttendanceForDateKeys(
					employeeId,
					['2025-12-15', '2025-12-16', '2025-12-17', '2025-12-18', '2025-12-19'],
					timeZone,
				),
				payrollSettings: countSaturdaySettings,
			});

			expect(results[0]?.seventhDayPay).toBe(0);
		});

		it('does not duplicate seventh day pay when saturday is worked extra on a monday-to-friday schedule', () => {
			const { employees: results } = calculatePayrollFromData({
				...calculationBaseArgs,
				schedules: buildScheduleForWorkingDays(employeeId, [1, 2, 3, 4, 5]),
				attendanceRows: buildAttendanceForDateKeys(
					employeeId,
					[
						'2025-12-15',
						'2025-12-16',
						'2025-12-17',
						'2025-12-18',
						'2025-12-19',
						'2025-12-20',
					],
					timeZone,
				),
				payrollSettings: countSaturdaySettings,
			});

			expect(results[0]?.seventhDayPay).toBe(350);
		});
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

	describe('employee deductions', () => {
		it('keeps payroll unchanged when the employee has no deductions', () => {
			const { employees } = calculatePayrollFromData(buildWeeklyPayrollArgsWithDeductions());

			const row = employees[0];
			expect(row?.totalDeductions).toBe(0);
			expect(row?.deductionsBreakdown).toEqual([]);
		});

		it('calculates INFONAVIT deductions based on SBC', () => {
			const args = buildWeeklyPayrollArgsWithDeductions({
				employeeDeductions: [
					createEmployeeDeduction({
						type: 'INFONAVIT',
						label: 'INFONAVIT SBC',
						calculationMethod: 'PERCENTAGE_SBC',
						value: 10,
					}),
				],
			});

			const { employees } = calculatePayrollFromData(args);
			const row = employees[0];
			const sbcDaily = getSbcDaily({
				dailyPay: Number(args.employees[0]?.dailyPay ?? 0),
				hireDate: args.employees[0]?.hireDate ?? null,
				sbcDailyOverride:
					typeof args.employees[0]?.sbcDailyOverride === 'string'
						? Number(args.employees[0]?.sbcDailyOverride)
						: (args.employees[0]?.sbcDailyOverride ?? null),
				aguinaldoDays: 15,
				vacationPremiumRate: 0.25,
				periodEndDateKey: args.periodEndDateKey,
			});
			const expectedAmount = Number((0.1 * sbcDaily * 7).toFixed(2));

			expect(row?.totalDeductions).toBe(expectedAmount);
			expect(row?.deductionsBreakdown[0]?.appliedAmount).toBe(expectedAmount);
		});

		it('calculates ALIMONY percentage deductions after taxes', () => {
			const args = buildWeeklyPayrollArgsWithDeductions({
				employeeDeductions: [
					createEmployeeDeduction({
						type: 'ALIMONY',
						label: 'Pension alimenticia',
						calculationMethod: 'PERCENTAGE_NET',
						value: 20,
					}),
				],
			});

			const { employees } = calculatePayrollFromData(args);
			const row = employees[0];
			if (!row) {
				throw new Error('Expected payroll row.');
			}

			const expectedAmount = Number(
				((row.grossPay - row.employeeWithholdings.total) * 0.2).toFixed(2),
			);

			expect(row.totalDeductions).toBe(expectedAmount);
			expect(row.deductionsBreakdown[0]?.appliedAmount).toBe(expectedAmount);
		});

		it('calculates PERCENTAGE_GROSS deductions correctly', () => {
			const args = buildWeeklyPayrollArgsWithDeductions({
				employeeDeductions: [
					createEmployeeDeduction({
						type: 'OTHER',
						label: 'Fondo social',
						calculationMethod: 'PERCENTAGE_GROSS',
						value: 5,
					}),
				],
			});

			const { employees } = calculatePayrollFromData(args);
			const row = employees[0];
			if (!row) {
				throw new Error('Expected payroll row.');
			}

			const expectedAmount = Number((row.grossPay * 0.05).toFixed(2));

			expect(row.totalDeductions).toBe(expectedAmount);
			expect(row.deductionsBreakdown[0]).toMatchObject({
				type: 'OTHER',
				label: 'Fondo social',
				calculationMethod: 'PERCENTAGE_GROSS',
				configuredValue: 5,
				baseAmount: row.grossPay,
				appliedAmount: expectedAmount,
			});
		});

		it('prorates PERCENTAGE_GROSS deductions for partial periods', () => {
			const args = buildWeeklyPayrollArgsWithDeductions({
				employeeDeductions: [
					createEmployeeDeduction({
						type: 'OTHER',
						label: 'Fondo social parcial',
						calculationMethod: 'PERCENTAGE_GROSS',
						value: 5,
						startDateKey: '2025-03-07',
						endDateKey: '2025-03-09',
					}),
				],
			});

			const { employees } = calculatePayrollFromData(args);
			const row = employees[0];
			if (!row) {
				throw new Error('Expected payroll row.');
			}

			const expectedAmount = Number(((row.grossPay * (3 / 7)) * 0.05).toFixed(2));

			expect(row.totalDeductions).toBe(expectedAmount);
			expect(row.deductionsBreakdown[0]).toMatchObject({
				type: 'OTHER',
				label: 'Fondo social parcial',
				calculationMethod: 'PERCENTAGE_GROSS',
				applicableDays: 3,
				appliedAmount: expectedAmount,
			});
		});

		it('prorates FIXED_AMOUNT deductions for partial periods', () => {
			const { employees } = calculatePayrollFromData(
				buildWeeklyPayrollArgsWithDeductions({
					employeeDeductions: [
						createEmployeeDeduction({
							label: 'Prestamo parcial',
							value: 700,
							startDateKey: '2025-03-05',
							endDateKey: '2025-03-07',
						}),
					],
				}),
			);

			expect(employees[0]?.totalDeductions).toBe(300);
			expect(employees[0]?.deductionsBreakdown[0]?.appliedAmount).toBe(300);
		});

		it('does not prorate ONE_TIME FIXED_AMOUNT deductions for partial periods', () => {
			const { employees } = calculatePayrollFromData(
				buildWeeklyPayrollArgsWithDeductions({
					employeeDeductions: [
						createEmployeeDeduction({
							id: 'one-time-partial-period',
							type: 'LOAN',
							frequency: 'ONE_TIME',
							value: 700,
							startDateKey: '2025-03-05',
							endDateKey: '2025-03-07',
						}),
					],
				}),
			);

			expect(employees[0]?.totalDeductions).toBe(700);
			expect(employees[0]?.deductionsBreakdown[0]?.appliedAmount).toBe(700);
			expect(employees[0]?.deductionsBreakdown[0]?.statusAfter).toBe('COMPLETED');
		});

		it('calculates VSM_FACTOR deductions using the minimum wage', () => {
			const args = buildWeeklyPayrollArgsWithDeductions({
				employeeDeductions: [
					createEmployeeDeduction({
						type: 'INFONAVIT',
						label: 'INFONAVIT VSM',
						calculationMethod: 'VSM_FACTOR',
						value: 2,
					}),
				],
			});

			const { employees } = calculatePayrollFromData(args);
			const minimumWage = resolveMinimumWageDaily({
				dateKey: args.periodEndDateKey,
				zone: 'GENERAL',
			});
			const expectedAmount = Number((2 * minimumWage * 7).toFixed(2));

			expect(employees[0]?.totalDeductions).toBe(expectedAmount);
			expect(employees[0]?.deductionsBreakdown[0]?.appliedAmount).toBe(expectedAmount);
		});

		it('marks ONE_TIME deductions as completed after they are applied', () => {
			const { employees } = calculatePayrollFromData(
				buildWeeklyPayrollArgsWithDeductions({
					employeeDeductions: [
						createEmployeeDeduction({
							id: 'one-time-1',
							frequency: 'ONE_TIME',
							value: 500,
						}),
					],
				}),
			);

			expect(employees[0]?.deductionsBreakdown[0]?.statusAfter).toBe('COMPLETED');
		});

		it('does not cap ONE_TIME percentage deductions by their configured rate', () => {
			const { employees } = calculatePayrollFromData(
				buildWeeklyPayrollArgsWithDeductions({
					employeeDeductions: [
						createEmployeeDeduction({
							id: 'one-time-percentage-gross',
							type: 'OTHER',
							calculationMethod: 'PERCENTAGE_GROSS',
							frequency: 'ONE_TIME',
							value: 10,
						}),
					],
				}),
			);

			expect(employees[0]?.deductionsBreakdown[0]?.appliedAmount).toBe(480);
			expect(employees[0]?.deductionsBreakdown[0]?.remainingAmountAfter).toBe(0);
			expect(employees[0]?.deductionsBreakdown[0]?.statusAfter).toBe('COMPLETED');
		});

		it('keeps ONE_TIME deductions active and tracks the remaining amount when net-pay capping blocks full collection', () => {
			const { employees } = calculatePayrollFromData(
				buildWeeklyPayrollArgsWithDeductions({
					employeeOverrides: {
						dailyPay: 100,
					},
					employeeDeductions: [
						createEmployeeDeduction({
							id: 'one-time-net-cap',
							type: 'LOAN',
							frequency: 'ONE_TIME',
							value: 1000,
						}),
					],
				}),
			);

			const row = employees[0];
			if (!row) {
				throw new Error('Expected payroll row.');
			}

			const netBeforeDeductions = Number((row.grossPay - row.employeeWithholdings.total).toFixed(2));
			expect(row.deductionsBreakdown[0]?.appliedAmount).toBe(netBeforeDeductions);
			expect(row.deductionsBreakdown[0]?.remainingAmountAfter).toBe(
				Number((1000 - netBeforeDeductions).toFixed(2)),
			);
			expect(row.deductionsBreakdown[0]?.statusAfter).toBe('ACTIVE');
			expect(row.deductionsBreakdown[0]?.cappedByNetPay).toBe(true);
		});

		it('does not prorate INSTALLMENTS FIXED_AMOUNT deductions for a partial first period', () => {
			const { employees } = calculatePayrollFromData(
				buildWeeklyPayrollArgsWithDeductions({
					employeeDeductions: [
						createEmployeeDeduction({
							id: 'installment-partial-period',
							type: 'LOAN',
							frequency: 'INSTALLMENTS',
							totalInstallments: 12,
							value: 700,
							startDateKey: '2025-03-05',
							endDateKey: '2025-03-07',
						}),
					],
				}),
			);

			expect(employees[0]?.deductionsBreakdown[0]?.appliedAmount).toBe(700);
			expect(employees[0]?.deductionsBreakdown[0]?.completedInstallmentsAfter).toBe(1);
			expect(employees[0]?.deductionsBreakdown[0]?.statusAfter).toBe('ACTIVE');
		});

		it('increments installment progress when the deduction is applied', () => {
			const { employees } = calculatePayrollFromData(
				buildWeeklyPayrollArgsWithDeductions({
					employeeDeductions: [
						createEmployeeDeduction({
							id: 'installment-1',
							type: 'LOAN',
							frequency: 'INSTALLMENTS',
							totalInstallments: 10,
							completedInstallments: 3,
							totalAmount: 5000,
							remainingAmount: 3500,
							value: 500,
						}),
					],
				}),
			);

			expect(employees[0]?.deductionsBreakdown[0]?.completedInstallmentsAfter).toBe(4);
			expect(employees[0]?.deductionsBreakdown[0]?.statusAfter).toBe('ACTIVE');
		});

		it('does not advance installment progress when net-pay capping only covers a partial payment', () => {
			const { employees } = calculatePayrollFromData(
				buildWeeklyPayrollArgsWithDeductions({
					employeeOverrides: {
						dailyPay: 100,
					},
					employeeDeductions: [
						createEmployeeDeduction({
							id: 'installment-partial-net-cap',
							type: 'LOAN',
							frequency: 'INSTALLMENTS',
							totalInstallments: 4,
							completedInstallments: 3,
							totalAmount: 4000,
							remainingAmount: 1000,
							value: 1000,
						}),
					],
				}),
			);

			const row = employees[0];
			if (!row) {
				throw new Error('Expected payroll row.');
			}

			const netBeforeDeductions = Number((row.grossPay - row.employeeWithholdings.total).toFixed(2));
			expect(row.deductionsBreakdown[0]?.appliedAmount).toBe(netBeforeDeductions);
			expect(employees[0]?.deductionsBreakdown[0]?.completedInstallmentsAfter).toBe(3);
			expect(employees[0]?.deductionsBreakdown[0]?.remainingAmountAfter).toBe(
				Number((1000 - netBeforeDeductions).toFixed(2)),
			);
			expect(employees[0]?.deductionsBreakdown[0]?.statusAfter).toBe('ACTIVE');
			expect(employees[0]?.deductionsBreakdown[0]?.cappedByNetPay).toBe(true);
		});

		it('marks installments as completed when the last payment is applied', () => {
			const { employees } = calculatePayrollFromData(
				buildWeeklyPayrollArgsWithDeductions({
					employeeDeductions: [
						createEmployeeDeduction({
							id: 'installment-2',
							type: 'LOAN',
							frequency: 'INSTALLMENTS',
							totalInstallments: 10,
							completedInstallments: 9,
							totalAmount: 5000,
							remainingAmount: 500,
							value: 500,
						}),
					],
				}),
			);

			expect(employees[0]?.deductionsBreakdown[0]?.completedInstallmentsAfter).toBe(10);
			expect(employees[0]?.deductionsBreakdown[0]?.statusAfter).toBe('COMPLETED');
		});

		it('completes installments when a tracked totalAmount is exhausted before totalInstallments is reached', () => {
			const { employees } = calculatePayrollFromData(
				buildWeeklyPayrollArgsWithDeductions({
					employeeDeductions: [
						createEmployeeDeduction({
							id: 'installment-total-cap',
							type: 'LOAN',
							frequency: 'INSTALLMENTS',
							totalInstallments: 5,
							completedInstallments: 3,
							totalAmount: 100,
							remainingAmount: 25,
							value: 25,
						}),
					],
				}),
			);

			expect(employees[0]?.deductionsBreakdown[0]?.appliedAmount).toBe(25);
			expect(employees[0]?.deductionsBreakdown[0]?.completedInstallmentsAfter).toBe(4);
			expect(employees[0]?.deductionsBreakdown[0]?.remainingAmountAfter).toBe(0);
			expect(employees[0]?.deductionsBreakdown[0]?.statusAfter).toBe('COMPLETED');
		});

		it('caps tracked deductions by the remaining outstanding balance', () => {
			const { employees } = calculatePayrollFromData(
				buildWeeklyPayrollArgsWithDeductions({
					employeeDeductions: [
						createEmployeeDeduction({
							id: 'installment-remaining-balance',
							type: 'LOAN',
							frequency: 'INSTALLMENTS',
							totalInstallments: 10,
							completedInstallments: 9,
							totalAmount: 5000,
							remainingAmount: 200,
							value: 500,
						}),
					],
				}),
			);

			expect(employees[0]?.totalDeductions).toBe(200);
			expect(employees[0]?.deductionsBreakdown[0]?.appliedAmount).toBe(200);
			expect(employees[0]?.deductionsBreakdown[0]?.remainingAmountAfter).toBe(0);
			expect(employees[0]?.deductionsBreakdown[0]?.statusAfter).toBe('COMPLETED');
		});

		it('completes recurring deductions when a tracked balance reaches zero', () => {
			const { employees } = calculatePayrollFromData(
				buildWeeklyPayrollArgsWithDeductions({
					employeeDeductions: [
						createEmployeeDeduction({
							id: 'recurring-capped-balance',
							type: 'OTHER',
							frequency: 'RECURRING',
							totalAmount: 500,
							remainingAmount: 500,
							value: 500,
						}),
					],
				}),
			);

			expect(employees[0]?.totalDeductions).toBe(500);
			expect(employees[0]?.deductionsBreakdown[0]?.appliedAmount).toBe(500);
			expect(employees[0]?.deductionsBreakdown[0]?.remainingAmountAfter).toBe(0);
			expect(employees[0]?.deductionsBreakdown[0]?.statusAfter).toBe('COMPLETED');
		});

		it('does not apply paused deductions', () => {
			const { employees } = calculatePayrollFromData(
				buildWeeklyPayrollArgsWithDeductions({
					employeeDeductions: [
						createEmployeeDeduction({
							id: 'paused-1',
							status: 'PAUSED',
							value: 500,
						}),
					],
				}),
			);

			expect(employees[0]?.totalDeductions).toBe(0);
			expect(employees[0]?.deductionsBreakdown).toEqual([]);
		});

		it('applies multiple deductions in the required order', () => {
			const { employees } = calculatePayrollFromData(
				buildWeeklyPayrollArgsWithDeductions({
					employeeDeductions: [
						createEmployeeDeduction({
							id: 'fixed-1',
							label: 'Caja de ahorro',
							calculationMethod: 'FIXED_AMOUNT',
							value: 500,
						}),
						createEmployeeDeduction({
							id: 'alimony-1',
							type: 'ALIMONY',
							label: 'Pension alimenticia',
							calculationMethod: 'PERCENTAGE_NET',
							value: 10,
						}),
					],
				}),
			);

			const row = employees[0];
			if (!row) {
				throw new Error('Expected payroll row.');
			}

			const expectedNetBasedAmount = Number(
				((row.grossPay - row.employeeWithholdings.total) * 0.1).toFixed(2),
			);
			expect(row.deductionsBreakdown.map((item) => item.calculationMethod)).toEqual([
				'PERCENTAGE_NET',
				'FIXED_AMOUNT',
			]);
			expect(row.totalDeductions).toBe(Number((expectedNetBasedAmount + 500).toFixed(2)));
		});

		it('caps deductions when they exceed the net pay and adds a warning', () => {
			const { employees } = calculatePayrollFromData(
				buildWeeklyPayrollArgsWithDeductions({
					employeeDeductions: [
						createEmployeeDeduction({
							id: 'oversized-1',
							label: 'Prestamo enorme',
							value: 100000,
						}),
					],
				}),
			);

			const row = employees[0];
			if (!row) {
				throw new Error('Expected payroll row.');
			}

			const netBeforeDeductions = Number((row.grossPay - row.employeeWithholdings.total).toFixed(2));
			expect(row.totalDeductions).toBe(netBeforeDeductions);
			expect(row.netPay).toBe(0);
			expect(row.deductionsBreakdown[0]?.cappedByNetPay).toBe(true);
			expect(row.warnings.some((warning) => warning.type === 'DEDUCTIONS_EXCEED_NET_PAY')).toBe(
				true,
			);
		});
	});

	describe('dual payroll', () => {
		const dualEmployeeId = 'emp-dual-1';
		const dualPeriodStartDateKey = '2025-12-15';
		const dualPeriodEndDateKey = '2025-12-19';
		const dualPeriodBounds = getPayrollPeriodBounds({
			periodStartDateKey: dualPeriodStartDateKey,
			periodEndDateKey: dualPeriodEndDateKey,
			timeZone,
		});
		const dualSchedule = buildScheduleForWorkingDays(dualEmployeeId, [1, 2, 3, 4, 5]);
		const dualAttendance = buildAttendanceForDateKeys(
			dualEmployeeId,
			[
				'2025-12-15',
				'2025-12-16',
				'2025-12-17',
				'2025-12-18',
				'2025-12-19',
			],
			timeZone,
		);
		const dualBaseArgs = {
			employees: [] as DualPayrollEmployee[],
			schedules: dualSchedule,
			attendanceRows: dualAttendance,
			periodStartDateKey: dualPeriodStartDateKey,
			periodEndDateKey: dualPeriodEndDateKey,
			periodBounds: dualPeriodBounds,
			overtimeEnforcement: 'WARN' as const,
			weekStartDay: 1,
			additionalMandatoryRestDays: [],
			defaultTimeZone: timeZone,
		};
		const dualBaseSettings: DualPayrollSettings = {
			...baseTaxSettings,
			absorbImssEmployeeShare: false,
			absorbIsr: false,
			enableSeventhDayPay: false,
		};

		const buildDualEmployee = (fiscalDailyPay?: number | null): DualPayrollEmployee => ({
			id: dualEmployeeId,
			firstName: 'Mario',
			lastName: 'Dual',
			dailyPay: 500,
			fiscalDailyPay,
			paymentFrequency: 'WEEKLY',
			shiftType: 'DIURNA',
			locationGeographicZone: 'GENERAL',
			locationTimeZone: timeZone,
			hireDate: new Date('2020-01-01T00:00:00Z'),
		});

		it('keeps the current calculation when dual payroll is disabled', () => {
			const standard = requireDualPayrollRow(
				calculatePayrollFromData({
					...dualBaseArgs,
					employees: [buildDualEmployee(300)],
					payrollSettings: dualBaseSettings,
				}).employees,
			);
			const dualDisabled = requireDualPayrollRow(
				calculatePayrollFromData({
					...dualBaseArgs,
					employees: [buildDualEmployee(300)],
					payrollSettings: {
						...dualBaseSettings,
						enableDualPayroll: false,
					} as CalculatePayrollFromDataArgs['payrollSettings'],
				}).employees,
			);

			expect(dualDisabled.totalPay).toBe(standard.totalPay);
			expect(dualDisabled.grossPay).toBe(standard.grossPay);
			expect(dualDisabled.netPay).toBe(standard.netPay);
			expect(dualDisabled.employeeWithholdings.total).toBe(standard.employeeWithholdings.total);
			expect(dualDisabled.bases.sbcDaily).toBe(standard.bases.sbcDaily);
		});

		it('keeps the current calculation when dual payroll is enabled but fiscalDailyPay is null', () => {
			const standard = requireDualPayrollRow(
				calculatePayrollFromData({
					...dualBaseArgs,
					employees: [buildDualEmployee()],
					payrollSettings: dualBaseSettings,
				}).employees,
			);
			const dualWithoutFiscal = requireDualPayrollRow(
				calculatePayrollFromData({
					...dualBaseArgs,
					employees: [buildDualEmployee(null)],
					payrollSettings: {
						...dualBaseSettings,
						enableDualPayroll: true,
					} as CalculatePayrollFromDataArgs['payrollSettings'],
				}).employees,
			);

			expect(dualWithoutFiscal.totalPay).toBe(standard.totalPay);
			expect(dualWithoutFiscal.grossPay).toBe(standard.grossPay);
			expect(dualWithoutFiscal.netPay).toBe(standard.netPay);
			expect(dualWithoutFiscal.employeeWithholdings.total).toBe(
				standard.employeeWithholdings.total,
			);
			expect(dualWithoutFiscal.bases.sbcDaily).toBe(standard.bases.sbcDaily);
		});

		it('calculates taxes on fiscal pay while keeping total real pay on the employee payment', () => {
			const standard = requireDualPayrollRow(
				calculatePayrollFromData({
					...dualBaseArgs,
					employees: [buildDualEmployee(300)],
					payrollSettings: dualBaseSettings,
				}).employees,
			);
			const dualEnabled = requireDualPayrollRow(
				calculatePayrollFromData({
					...dualBaseArgs,
					employees: [buildDualEmployee(300)],
					payrollSettings: {
						...dualBaseSettings,
						enableDualPayroll: true,
					} as CalculatePayrollFromDataArgs['payrollSettings'],
				}).employees,
			);

			expect(dualEnabled.totalRealPay).toBe(2500);
			expect(dualEnabled.totalPay).toBe(2500);
			expect(dualEnabled.fiscalDailyPay).toBe(300);
			expect(dualEnabled.fiscalGrossPay).toBe(1500);
			expect(dualEnabled.bases.sbcDaily).toBeLessThan(standard.bases.sbcDaily);
			expect(dualEnabled.employeeWithholdings.total).toBeLessThan(
				standard.employeeWithholdings.total,
			);
		});

		it('calculates the complement from the difference between real and fiscal daily pay', () => {
			const dualEnabled = requireDualPayrollRow(
				calculatePayrollFromData({
					...dualBaseArgs,
					employees: [buildDualEmployee(300)],
					payrollSettings: {
						...dualBaseSettings,
						enableDualPayroll: true,
					} as CalculatePayrollFromDataArgs['payrollSettings'],
				}).employees,
			);

			expect(dualEnabled.complementPay).toBe(1000);
			expect(dualEnabled.totalRealPay).toBe(2500);
			expect(dualEnabled.fiscalGrossPay).toBe(1500);
		});

		it('does not generate a complement when fiscalDailyPay is greater than or equal to dailyPay', () => {
			const dualEnabled = requireDualPayrollRow(
				calculatePayrollFromData({
					...dualBaseArgs,
					employees: [buildDualEmployee(600)],
					payrollSettings: {
						...dualBaseSettings,
						enableDualPayroll: true,
					} as CalculatePayrollFromDataArgs['payrollSettings'],
				}).employees,
			);

			expect(dualEnabled.complementPay).toBe(0);
			expect(dualEnabled.totalRealPay).toBe(2500);
			expect(dualEnabled.fiscalGrossPay).toBe(2500);
		});

		it('reports hourly pay using the real daily pay when dual payroll is enabled', () => {
			const dualEnabled = requireDualPayrollRow(
				calculatePayrollFromData({
					...dualBaseArgs,
					employees: [buildDualEmployee(300)],
					payrollSettings: {
						...dualBaseSettings,
						enableDualPayroll: true,
					} as CalculatePayrollFromDataArgs['payrollSettings'],
				}).employees,
			);

			expect(dualEnabled.dailyPay).toBe(500);
			expect(dualEnabled.fiscalDailyPay).toBe(300);
			expect(dualEnabled.hourlyPay).toBe(62.5);
		});

		it('does not emit below-minimum-wage warnings when only the fiscal daily pay is below minimum', () => {
			const dualEnabled = requireDualPayrollRow(
				calculatePayrollFromData({
					...dualBaseArgs,
					employees: [buildDualEmployee(200)],
					payrollSettings: {
						...dualBaseSettings,
						enableDualPayroll: true,
					} as CalculatePayrollFromDataArgs['payrollSettings'],
				}).employees,
			);

			expect(dualEnabled.dailyPay).toBe(500);
			expect(dualEnabled.fiscalDailyPay).toBe(200);
			expect(dualEnabled.warnings.some((warning) => warning.type === 'BELOW_MINIMUM_WAGE')).toBe(
				false,
			);
		});

		it('keeps total real pay aligned with the standard payroll when overtime and vacation pay exist', () => {
			const dualAttendanceWithOvertime = [
				'2025-12-15',
				'2025-12-16',
				'2025-12-17',
				'2025-12-18',
				'2025-12-19',
			].flatMap((dateKey) =>
				createAttendancePair(
					dualEmployeeId,
					getUtcDateForZonedTime(dateKey, 9, 0, timeZone),
					getUtcDateForZonedTime(dateKey, 19, 0, timeZone),
				),
			);
			const overtimeAuthorizations = [
				'2025-12-15',
				'2025-12-16',
				'2025-12-17',
				'2025-12-18',
				'2025-12-19',
			].map((dateKey) => ({
				employeeId: dualEmployeeId,
				dateKey,
				authorizedHours: 2,
				status: 'ACTIVE' as const,
			}));
			const vacationDayCounts = {
				[dualEmployeeId]: 5,
			};

			const standard = requireDualPayrollRow(
				calculatePayrollFromData({
					...dualBaseArgs,
					employees: [buildDualEmployee(300)],
					attendanceRows: dualAttendanceWithOvertime,
					overtimeAuthorizations,
					vacationDayCounts,
					payrollSettings: {
						...dualBaseSettings,
						enableDualPayroll: false,
					} as CalculatePayrollFromDataArgs['payrollSettings'],
				}).employees,
			);
			const dualEnabled = requireDualPayrollRow(
				calculatePayrollFromData({
					...dualBaseArgs,
					employees: [buildDualEmployee(300)],
					attendanceRows: dualAttendanceWithOvertime,
					overtimeAuthorizations,
					vacationDayCounts,
					payrollSettings: {
						...dualBaseSettings,
						enableDualPayroll: true,
					} as CalculatePayrollFromDataArgs['payrollSettings'],
				}).employees,
			);

			expect(standard.totalPay).toBe(6937.5);
			expect(dualEnabled.fiscalGrossPay).toBe(4162.5);
			expect(dualEnabled.complementPay).toBe(2775);
			expect(dualEnabled.totalRealPay).toBe(6937.5);
			expect(dualEnabled.totalPay).toBe(standard.totalPay);
			expect(dualEnabled.vacationPayAmount).toBe(1500);
			expect(dualEnabled.realVacationPayAmount).toBe(2500);
			expect(dualEnabled.vacationPremiumAmount).toBe(375);
			expect(dualEnabled.realVacationPremiumAmount).toBe(625);
		});

		it('uses the configured real vacation premium rate independently from the fiscal rate', () => {
			const dualEnabled = requireDualPayrollRow(
				calculatePayrollFromData({
					...dualBaseArgs,
					employees: [buildDualEmployee(300)],
					vacationDayCounts: {
						[dualEmployeeId]: 5,
					},
					payrollSettings: {
						...dualBaseSettings,
						enableDualPayroll: true,
						vacationPremiumRate: 0.25,
						realVacationPremiumRate: 0.5,
					} as CalculatePayrollFromDataArgs['payrollSettings'],
				}).employees,
			);

			expect(dualEnabled.vacationPremiumAmount).toBe(375);
			expect(dualEnabled.realVacationPremiumAmount).toBe(1250);
			expect(dualEnabled.totalRealPay).toBe(6250);
		});

		it('bases percentage-net deductions on the fiscal net when dual payroll is enabled', () => {
			const dualEnabled = requireDualPayrollRow(
				calculatePayrollFromData({
					...dualBaseArgs,
					employees: [buildDualEmployee(300)],
					employeeDeductions: [
						createEmployeeDeduction({
							employeeId: dualEmployeeId,
							type: 'ALIMONY',
							label: 'Pension alimenticia dual',
							calculationMethod: 'PERCENTAGE_NET',
							value: 20,
						}),
					],
					payrollSettings: {
						...dualBaseSettings,
						enableDualPayroll: true,
					} as CalculatePayrollFromDataArgs['payrollSettings'],
				}).employees,
			);

			if (dualEnabled.fiscalGrossPay === null) {
				throw new Error('Expected fiscal gross pay for dual payroll row.');
			}

			const expectedFiscalNet = Number(
				(dualEnabled.fiscalGrossPay - dualEnabled.employeeWithholdings.total).toFixed(2),
			);
			const expectedAmount = Number((expectedFiscalNet * 0.2).toFixed(2));

			expect(dualEnabled.deductionsBreakdown[0]).toMatchObject({
				calculationMethod: 'PERCENTAGE_NET',
				baseAmount: expectedFiscalNet,
				appliedAmount: expectedAmount,
			});
			expect(dualEnabled.totalDeductions).toBe(expectedAmount);
		});

		it('caps deductions against the fiscal side without consuming the real complement', () => {
			const dualEnabled = requireDualPayrollRow(
				calculatePayrollFromData({
					...dualBaseArgs,
					employees: [buildDualEmployee(300)],
					employeeDeductions: [
						createEmployeeDeduction({
							employeeId: dualEmployeeId,
							type: 'OTHER',
							label: 'Descuento fijo dual',
							calculationMethod: 'FIXED_AMOUNT',
							value: 2000,
						}),
					],
					payrollSettings: {
						...dualBaseSettings,
						enableDualPayroll: true,
					} as CalculatePayrollFromDataArgs['payrollSettings'],
				}).employees,
			);

			if (dualEnabled.fiscalGrossPay === null || dualEnabled.totalRealPay === null) {
				throw new Error('Expected dual payroll amounts for row.');
			}

			const expectedFiscalNet = Number(
				(dualEnabled.fiscalGrossPay - dualEnabled.employeeWithholdings.total).toFixed(2),
			);
			const expectedNetPay = Number(
				(dualEnabled.totalRealPay -
					dualEnabled.employeeWithholdings.total -
					expectedFiscalNet).toFixed(2),
			);

			expect(dualEnabled.deductionsBreakdown[0]).toMatchObject({
				calculationMethod: 'FIXED_AMOUNT',
				appliedAmount: expectedFiscalNet,
				cappedByNetPay: true,
			});
			expect(dualEnabled.totalDeductions).toBe(expectedFiscalNet);
			expect(dualEnabled.netPay).toBe(expectedNetPay);
		});

		it('calculates INFONAVIT from the fiscal SBC and keeps the real complement outside the deduction base', () => {
			const standard = requireDualPayrollRow(
				calculatePayrollFromData({
					...dualBaseArgs,
					employees: [buildDualEmployee(300)],
					employeeDeductions: [
						createEmployeeDeduction({
							employeeId: dualEmployeeId,
							type: 'INFONAVIT',
							label: 'INFONAVIT dual SBC',
							calculationMethod: 'PERCENTAGE_SBC',
							value: 10,
						}),
					],
					payrollSettings: {
						...dualBaseSettings,
						enableDualPayroll: false,
					} as CalculatePayrollFromDataArgs['payrollSettings'],
				}).employees,
			);
			const dualEnabled = requireDualPayrollRow(
				calculatePayrollFromData({
					...dualBaseArgs,
					employees: [buildDualEmployee(300)],
					employeeDeductions: [
						createEmployeeDeduction({
							employeeId: dualEmployeeId,
							type: 'INFONAVIT',
							label: 'INFONAVIT dual SBC',
							calculationMethod: 'PERCENTAGE_SBC',
							value: 10,
						}),
					],
					payrollSettings: {
						...dualBaseSettings,
						enableDualPayroll: true,
					} as CalculatePayrollFromDataArgs['payrollSettings'],
				}).employees,
			);

			if (dualEnabled.totalRealPay === null) {
				throw new Error('Expected total real pay for dual payroll row.');
			}

			const expectedFiscalBase = Number((dualEnabled.bases.sbcDaily * 5).toFixed(2));
			const expectedFiscalAmount = Number((expectedFiscalBase * 0.1).toFixed(2));
			const expectedNetPay = Number(
				(dualEnabled.totalRealPay -
					dualEnabled.employeeWithholdings.total -
					expectedFiscalAmount).toFixed(2),
			);

			expect(standard.deductionsBreakdown[0]?.appliedAmount).toBeGreaterThan(expectedFiscalAmount);
			expect(dualEnabled.deductionsBreakdown[0]).toMatchObject({
				type: 'INFONAVIT',
				calculationMethod: 'PERCENTAGE_SBC',
				baseAmount: expectedFiscalBase,
				appliedAmount: expectedFiscalAmount,
				cappedByNetPay: false,
			});
			expect(dualEnabled.totalDeductions).toBe(expectedFiscalAmount);
			expect(dualEnabled.netPay).toBe(expectedNetPay);
		});
	});

	describe('gratifications', () => {
		it('adds gratifications to real pay without changing the tax base in non-dual payroll', () => {
			const baseline = requirePayrollRowWithGratifications(
				calculatePayrollFromData(buildWeeklyPayrollArgsWithDeductions()).employees,
			);
			const gratificationAmount = 275.5;
			const withGratification = requirePayrollRowWithGratifications(
				calculatePayrollFromData(
					buildWeeklyPayrollArgsWithDeductions({
						employeeGratifications: [
							createEmployeeGratification({
								amount: gratificationAmount,
								periodicity: 'ONE_TIME',
								applicationMode: 'MANUAL',
							}),
						],
					}),
				).employees,
			);

			expect(withGratification.totalGratifications).toBe(gratificationAmount);
			expect(withGratification.gratificationsBreakdown).toHaveLength(1);
			expect(withGratification.gratificationsBreakdown[0]).toMatchObject({
				concept: 'Gratificación de prueba',
				appliedAmount: gratificationAmount,
				statusBefore: 'ACTIVE',
				statusAfter: 'COMPLETED',
			});
			expect(withGratification.grossPay).toBeCloseTo(
				Number((baseline.grossPay + gratificationAmount).toFixed(2)),
			);
			expect(withGratification.netPay).toBeCloseTo(
				Number((baseline.netPay + gratificationAmount).toFixed(2)),
			);
			expect(withGratification.employeeWithholdings.total).toBe(
				baseline.employeeWithholdings.total,
			);
		});

		it('keeps gratifications outside the fiscal base when dual payroll is enabled', () => {
			const dualEmployeeId = 'emp-dual-gratification';
			const dualBase = requireDualPayrollRow(
				calculatePayrollFromData(
					buildWeeklyPayrollArgsWithDeductions({
						employeeOverrides: {
							id: dualEmployeeId,
							dailyPay: 1000,
							fiscalDailyPay: 700,
						},
						payrollSettings: {
							...baseTaxSettings,
							enableDualPayroll: true,
						},
					}),
				).employees,
			);
			const gratificationAmount = 320;
			const dualWithGratification = requireDualPayrollRow(
				calculatePayrollFromData(
					buildWeeklyPayrollArgsWithDeductions({
						employeeOverrides: {
							id: dualEmployeeId,
							dailyPay: 1000,
							fiscalDailyPay: 700,
						},
						payrollSettings: {
							...baseTaxSettings,
							enableDualPayroll: true,
						},
						employeeGratifications: [
							createEmployeeGratification({
								employeeId: dualEmployeeId,
								amount: gratificationAmount,
								periodicity: 'RECURRING',
								applicationMode: 'AUTOMATIC',
							}),
						],
					}),
				).employees,
			);

			if (dualBase.fiscalGrossPay === null || dualWithGratification.fiscalGrossPay === null) {
				throw new Error('Expected fiscal gross pay for dual payroll rows.');
			}
			if (dualBase.totalRealPay === null || dualWithGratification.totalRealPay === null) {
				throw new Error('Expected total real pay for dual payroll rows.');
			}

			expect(dualWithGratification.fiscalGrossPay).toBe(dualBase.fiscalGrossPay);
			expect(dualWithGratification.totalGratifications).toBe(gratificationAmount);
			expect(dualWithGratification.gratificationsBreakdown[0]).toMatchObject({
				appliedAmount: gratificationAmount,
				statusAfter: 'ACTIVE',
			});
			expect(dualWithGratification.totalRealPay).toBe(
				Number((dualBase.totalRealPay + gratificationAmount).toFixed(2)),
			);
			expect(dualWithGratification.netPay).toBe(
				Number((dualBase.netPay + gratificationAmount).toFixed(2)),
			);
			expect(dualWithGratification.employeeWithholdings.total).toBe(
				dualBase.employeeWithholdings.total,
			);
		});
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
