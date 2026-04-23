import { getUtcDateForZonedMidnight } from '../utils/time-zone.js';
import {
	getPayrollPeriodBounds,
	type AttendanceRow,
	type CalculatePayrollFromDataArgs,
	type EmployeeDeductionRow,
	type PayrollEmployeeRow,
	type ScheduleRow,
} from './payroll-calculation.js';

export type AetP10FixtureScope = 'TDD' | 'EFECTIVO' | 'ALL';

export interface AetP10DeductionFixture {
	id: string;
	type: EmployeeDeductionRow['type'];
	label: string;
	amount: number;
	satDeductionCode: string | null;
	includeInWorkbookNet: boolean;
}

export interface AetP10EmployeeFixture {
	id: string;
	firstName: string;
	lastName: string;
	fiscalDailyPay: number;
	realDailyPay: number;
	sbcDaily: number;
	hireDate: Date;
	sourceList: 'TDD' | 'EFECTIVO';
	deductions: AetP10DeductionFixture[];
	expectedFiscalGrossPay: number;
	expectedFiscalNetPay: number;
	expectedRealGrossPay: number;
	expectedRealNetPay: number;
}

export interface AetP10PayrollArgsOptions {
	scope?: AetP10FixtureScope;
	includeWorkbookInternalDeductions?: boolean;
}

export const AET_P10_2026_PERIOD = {
	periodStartDateKey: '2026-03-02',
	periodEndDateKey: '2026-03-08',
	timeZone: 'America/Mexico_City',
	paymentFrequency: 'WEEKLY' as const,
};

export const AET_P10_2026_PAYROLL_SETTINGS: NonNullable<
	CalculatePayrollFromDataArgs['payrollSettings']
> = {
	riskWorkRate: 0.06,
	statePayrollTaxRate: 0.02,
	absorbImssEmployeeShare: false,
	absorbIsr: false,
	aguinaldoDays: 15,
	vacationPremiumRate: 0.25,
	realVacationPremiumRate: 0.25,
	enableSeventhDayPay: true,
	enableDualPayroll: true,
	autoDeductLunchBreak: false,
	lunchBreakMinutes: 60,
	lunchBreakThresholdHours: 6,
	countSaturdayAsWorkedForSeventhDay: false,
};

export const AET_P10_TDD_LISTA_RAYA_EXPECTED = {
	employeeCount: 10,
	fiscalGrossTotal: 23158.52,
	fiscalVoucherDeductionsTotal: 1713.8,
	fiscalNetPayTotal: 21444.72,
	employerCostsTotal: 8447.21,
	realGrossTotal: 40963.56,
	realNetPayTotal: 39335.63,
};

export const AET_P10_EFECTIVO_LISTA_RAYA_EXPECTED = {
	employeeCount: 1,
	fiscalGrossTotal: 2205.28,
	fiscalVoucherDeductionsTotal: 0,
	fiscalNetPayTotal: 2205.28,
	employerCostsTotal: 814.9,
	realGrossTotal: 2205.28,
	realNetPayTotal: 2205.28,
};

const AET_P10_WORKED_DATE_KEYS = [
	'2026-03-02',
	'2026-03-03',
	'2026-03-04',
	'2026-03-05',
	'2026-03-06',
	'2026-03-07',
];

const AET_P10_TDD_EMPLOYEES: AetP10EmployeeFixture[] = [
	{
		id: 'aet-p10-tdd-01',
		firstName: 'Empleado',
		lastName: 'TDD 01',
		fiscalDailyPay: 473,
		realDailyPay: 674.1428571428571,
		sbcDaily: 500.21,
		hireDate: new Date('2012-03-01T00:00:00.000Z'),
		sourceList: 'TDD',
		deductions: [
			{
				id: 'aet-p10-tdd-01-infonavit',
				type: 'INFONAVIT',
				label: 'Infonavit CF correspondiente',
				amount: 421.02,
				satDeductionCode: '010',
				includeInWorkbookNet: true,
			},
		],
		expectedFiscalGrossPay: 3311,
		expectedFiscalNetPay: 2504.11,
		expectedRealGrossPay: 4719,
		expectedRealNetPay: 4297.98,
	},
	{
		id: 'aet-p10-tdd-02',
		firstName: 'Empleado',
		lastName: 'TDD 02',
		fiscalDailyPay: 315.04,
		realDailyPay: 667.8571428571429,
		sbcDaily: 333.17,
		hireDate: new Date('2015-05-18T00:00:00.000Z'),
		sourceList: 'TDD',
		deductions: [],
		expectedFiscalGrossPay: 2205.28,
		expectedFiscalNetPay: 2205.28,
		expectedRealGrossPay: 4675,
		expectedRealNetPay: 4675,
	},
	{
		id: 'aet-p10-tdd-03',
		firstName: 'Empleado',
		lastName: 'TDD 03',
		fiscalDailyPay: 315.04,
		realDailyPay: 605,
		sbcDaily: 332.73,
		hireDate: new Date('2017-05-29T00:00:00.000Z'),
		sourceList: 'TDD',
		deductions: [],
		expectedFiscalGrossPay: 2205.28,
		expectedFiscalNetPay: 2205.28,
		expectedRealGrossPay: 4235,
		expectedRealNetPay: 4235,
	},
	{
		id: 'aet-p10-tdd-04',
		firstName: 'Empleado',
		lastName: 'TDD 04',
		fiscalDailyPay: 315.04,
		realDailyPay: 760.5714285714286,
		sbcDaily: 332.73,
		hireDate: new Date('2017-07-31T00:00:00.000Z'),
		sourceList: 'TDD',
		deductions: [
			{
				id: 'aet-p10-tdd-04-infonavit',
				type: 'INFONAVIT',
				label: 'Infonavit CF correspondiente',
				amount: 245.33,
				satDeductionCode: '010',
				includeInWorkbookNet: true,
			},
			{
				id: 'aet-p10-tdd-04-alimony',
				type: 'ALIMONY',
				label: 'Pension alimenticia',
				amount: 661.58,
				satDeductionCode: '007',
				includeInWorkbookNet: true,
			},
		],
		expectedFiscalGrossPay: 2205.28,
		expectedFiscalNetPay: 1298.37,
		expectedRealGrossPay: 5324,
		expectedRealNetPay: 4417.09,
	},
	{
		id: 'aet-p10-tdd-05',
		firstName: 'Empleado',
		lastName: 'TDD 05',
		fiscalDailyPay: 315.04,
		realDailyPay: 785.714,
		sbcDaily: 332.73,
		hireDate: new Date('2019-07-29T00:00:00.000Z'),
		sourceList: 'TDD',
		deductions: [],
		expectedFiscalGrossPay: 2205.28,
		expectedFiscalNetPay: 2205.28,
		expectedRealGrossPay: 5500,
		expectedRealNetPay: 5500,
	},
	{
		id: 'aet-p10-tdd-06',
		firstName: 'Empleado',
		lastName: 'TDD 06',
		fiscalDailyPay: 315.04,
		realDailyPay: 315.04,
		sbcDaily: 332.3,
		hireDate: new Date('2021-07-05T00:00:00.000Z'),
		sourceList: 'TDD',
		deductions: [],
		expectedFiscalGrossPay: 2205.28,
		expectedFiscalNetPay: 2205.28,
		expectedRealGrossPay: 2205.28,
		expectedRealNetPay: 2205.28,
	},
	{
		id: 'aet-p10-tdd-07',
		firstName: 'Empleado',
		lastName: 'TDD 07',
		fiscalDailyPay: 315.04,
		realDailyPay: 589.2857142857143,
		sbcDaily: 331.87,
		hireDate: new Date('2022-01-17T00:00:00.000Z'),
		sourceList: 'TDD',
		deductions: [],
		expectedFiscalGrossPay: 2205.28,
		expectedFiscalNetPay: 2205.28,
		expectedRealGrossPay: 4125,
		expectedRealNetPay: 4125,
	},
	{
		id: 'aet-p10-tdd-08',
		firstName: 'Empleado',
		lastName: 'TDD 08',
		fiscalDailyPay: 315.04,
		realDailyPay: 315.04,
		sbcDaily: 331.87,
		hireDate: new Date('2022-04-04T00:00:00.000Z'),
		sourceList: 'TDD',
		deductions: [],
		expectedFiscalGrossPay: 2205.28,
		expectedFiscalNetPay: 2205.28,
		expectedRealGrossPay: 2205.28,
		expectedRealNetPay: 2205.28,
	},
	{
		id: 'aet-p10-tdd-09',
		firstName: 'Empleado',
		lastName: 'TDD 09',
		fiscalDailyPay: 315.04,
		realDailyPay: 589.2857142857143,
		sbcDaily: 331.44,
		hireDate: new Date('2023-06-01T00:00:00.000Z'),
		sourceList: 'TDD',
		deductions: [],
		expectedFiscalGrossPay: 2205.28,
		expectedFiscalNetPay: 2205.28,
		expectedRealGrossPay: 4125,
		expectedRealNetPay: 4125,
	},
	{
		id: 'aet-p10-tdd-10',
		firstName: 'Empleado',
		lastName: 'TDD 10',
		fiscalDailyPay: 315.04,
		realDailyPay: 550,
		sbcDaily: 331.44,
		hireDate: new Date('2023-12-11T00:00:00.000Z'),
		sourceList: 'TDD',
		deductions: [
			{
				id: 'aet-p10-tdd-10-loan',
				type: 'LOAN',
				label: 'Prestamo personal',
				amount: 300,
				satDeductionCode: null,
				includeInWorkbookNet: true,
			},
		],
		expectedFiscalGrossPay: 2205.28,
		expectedFiscalNetPay: 2205.28,
		expectedRealGrossPay: 3850,
		expectedRealNetPay: 3550,
	},
];

const AET_P10_EFECTIVO_EMPLOYEES: AetP10EmployeeFixture[] = [
	{
		id: 'aet-p10-efectivo-01',
		firstName: 'Empleado',
		lastName: 'Efectivo 01',
		fiscalDailyPay: 315.04,
		realDailyPay: 315.04,
		sbcDaily: 332.73,
		hireDate: new Date('2018-01-08T00:00:00.000Z'),
		sourceList: 'EFECTIVO',
		deductions: [],
		expectedFiscalGrossPay: 2205.28,
		expectedFiscalNetPay: 2205.28,
		expectedRealGrossPay: 2205.28,
		expectedRealNetPay: 2205.28,
	},
];

/**
 * Gets derived period-10 payroll fixture employees by source document.
 *
 * @param scope - Source document group to include
 * @returns Derived anonymized employee fixtures
 */
export function getAetP10EmployeeFixtures(scope: AetP10FixtureScope): AetP10EmployeeFixture[] {
	if (scope === 'TDD') {
		return AET_P10_TDD_EMPLOYEES;
	}
	if (scope === 'EFECTIVO') {
		return AET_P10_EFECTIVO_EMPLOYEES;
	}
	return [...AET_P10_TDD_EMPLOYEES, ...AET_P10_EFECTIVO_EMPLOYEES];
}

/**
 * Builds a UTC Date for a local wall-clock time in the fixture timezone.
 *
 * @param dateKey - Local date key (YYYY-MM-DD)
 * @param hour - Local hour
 * @param minute - Local minute
 * @returns UTC Date representing the fixture instant
 */
function getFixtureUtcDateForTime(dateKey: string, hour: number, minute: number): Date {
	const midnightUtc = getUtcDateForZonedMidnight(dateKey, AET_P10_2026_PERIOD.timeZone);
	return new Date(midnightUtc.getTime() + hour * 60 * 60 * 1000 + minute * 60 * 1000);
}

/**
 * Builds a standard Monday-Saturday schedule for a fixture employee.
 *
 * @param employeeId - Employee identifier
 * @returns Weekly schedule rows
 */
function buildFixtureSchedule(employeeId: string): ScheduleRow[] {
	return Array.from({ length: 7 }, (_, dayOfWeek) => ({
		employeeId,
		dayOfWeek,
		startTime: '09:00',
		endTime: '17:00',
		isWorkingDay: dayOfWeek !== 0,
	}));
}

/**
 * Builds attendance rows for the six worked days in the CONTPAQi fixture.
 *
 * @param employeeId - Employee identifier
 * @returns Check-in/check-out rows
 */
function buildFixtureAttendance(employeeId: string): AttendanceRow[] {
	return AET_P10_WORKED_DATE_KEYS.flatMap((dateKey) => [
		{
			employeeId,
			timestamp: getFixtureUtcDateForTime(dateKey, 9, 0),
			type: 'CHECK_IN' as const,
		},
		{
			employeeId,
			timestamp: getFixtureUtcDateForTime(dateKey, 17, 0),
			type: 'CHECK_OUT' as const,
		},
	]);
}

/**
 * Converts an employee fixture into the payroll engine row shape.
 *
 * @param fixture - Derived employee fixture
 * @returns Payroll employee row
 */
function buildEmployeeRow(fixture: AetP10EmployeeFixture): PayrollEmployeeRow {
	return {
		id: fixture.id,
		firstName: fixture.firstName,
		lastName: fixture.lastName,
		dailyPay: fixture.realDailyPay,
		fiscalDailyPay: fixture.fiscalDailyPay,
		hireDate: fixture.hireDate,
		sbcDailyOverride: fixture.sbcDaily,
		paymentFrequency: AET_P10_2026_PERIOD.paymentFrequency,
		shiftType: 'DIURNA',
		locationGeographicZone: 'GENERAL',
		locationTimeZone: AET_P10_2026_PERIOD.timeZone,
	};
}

/**
 * Converts fixture deductions into payroll engine rows.
 *
 * @param fixture - Derived employee fixture
 * @param includeWorkbookInternalDeductions - Whether to include non-fiscal workbook deductions
 * @returns Employee deduction rows
 */
function buildEmployeeDeductions(
	fixture: AetP10EmployeeFixture,
	includeWorkbookInternalDeductions: boolean,
): EmployeeDeductionRow[] {
	return fixture.deductions
		.filter(
			(deduction) =>
				deduction.satDeductionCode !== null ||
				(includeWorkbookInternalDeductions && deduction.includeInWorkbookNet),
		)
		.map((deduction) => ({
			id: deduction.id,
			employeeId: fixture.id,
			type: deduction.type,
			label: deduction.label,
			calculationMethod: 'FIXED_AMOUNT' as const,
			value: deduction.amount,
			frequency: 'RECURRING' as const,
			totalInstallments: null,
			completedInstallments: 0,
			totalAmount: null,
			remainingAmount: null,
			status: 'ACTIVE' as const,
			startDateKey: AET_P10_2026_PERIOD.periodStartDateKey,
			endDateKey: null,
			referenceNumber: null,
			satDeductionCode: deduction.satDeductionCode,
			notes: null,
			createdAt: new Date('2026-02-27T00:00:00.000Z'),
		}));
}

/**
 * Builds payroll calculation arguments from derived CONTPAQi/workbook fixtures.
 *
 * @param options - Fixture source and deduction options
 * @returns Payroll calculation input matching the app's real calculation flow
 */
export function buildAetP10PayrollArgs(
	options: AetP10PayrollArgsOptions = {},
): CalculatePayrollFromDataArgs {
	const scope = options.scope ?? 'TDD';
	const includeWorkbookInternalDeductions = options.includeWorkbookInternalDeductions ?? true;
	const fixtures = getAetP10EmployeeFixtures(scope);

	return {
		employees: fixtures.map(buildEmployeeRow),
		schedules: fixtures.flatMap((fixture) => buildFixtureSchedule(fixture.id)),
		attendanceRows: fixtures.flatMap((fixture) => buildFixtureAttendance(fixture.id)),
		periodStartDateKey: AET_P10_2026_PERIOD.periodStartDateKey,
		periodEndDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
		periodBounds: getPayrollPeriodBounds({
			periodStartDateKey: AET_P10_2026_PERIOD.periodStartDateKey,
			periodEndDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
			timeZone: AET_P10_2026_PERIOD.timeZone,
		}),
		overtimeEnforcement: 'WARN',
		weekStartDay: 1,
		additionalMandatoryRestDays: [],
		defaultTimeZone: AET_P10_2026_PERIOD.timeZone,
		employeeDeductions: fixtures.flatMap((fixture) =>
			buildEmployeeDeductions(fixture, includeWorkbookInternalDeductions),
		),
		payrollSettings: AET_P10_2026_PAYROLL_SETTINGS,
	};
}
