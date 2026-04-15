import { describe, expect, it } from 'vitest';

import type { PayrollCalculationEmployee } from '@/lib/client-functions';

import { buildPayrollCsvEmployeeRow } from './payroll-client.helpers';

type TranslateFn = (key: string) => string;

/**
 * Builds a minimal payroll employee row for CSV helper tests.
 *
 * @param overrides - Per-test value overrides
 * @returns Payroll employee row
 */
function buildEmployee(
	overrides: Partial<PayrollCalculationEmployee> = {},
): PayrollCalculationEmployee {
	return {
		employeeId: 'emp-1',
		name: 'María López',
		shiftType: 'DIURNA',
		dailyPay: 300,
		fiscalDailyPay: null,
		hourlyPay: 37.5,
		paymentFrequency: 'WEEKLY',
		seventhDayPay: 0,
		hoursWorked: 48,
		expectedHours: 48,
		normalHours: 48,
		overtimeDoubleHours: 0,
		overtimeTripleHours: 0,
		payableOvertimeDoubleHours: 0,
		payableOvertimeTripleHours: 0,
		authorizedOvertimeHours: 0,
		unauthorizedOvertimeHours: 0,
		sundayHoursWorked: 0,
		mandatoryRestDaysWorkedCount: 0,
		mandatoryRestDayDateKeys: [],
		normalPay: 1800,
		overtimeDoublePay: 0,
		overtimeTriplePay: 0,
		sundayPremiumAmount: 0,
		mandatoryRestDayPremiumAmount: 0,
		vacationDaysPaid: 0,
		vacationPayAmount: 0,
		vacationPremiumAmount: 0,
		realVacationPayAmount: null,
		realVacationPremiumAmount: null,
		gratificationsBreakdown: [],
		totalGratifications: 0,
		lunchBreakAutoDeductedDays: 0,
		lunchBreakAutoDeductedMinutes: 0,
		totalPay: 1740,
		grossPay: 1740,
		fiscalGrossPay: null,
		complementPay: null,
		totalRealPay: null,
		bases: {
			sbcDaily: 300,
			sbcPeriod: 2100,
			isrBase: 1740,
			daysInPeriod: 7,
			umaDaily: 113.14,
			minimumWageDaily: 278.8,
		},
		employeeWithholdings: {
			imssEmployee: {
				emExcess: 0,
				pd: 0,
				gmp: 0,
				iv: 0,
				cv: 0,
				total: 0,
			},
			isrWithheld: 0,
			infonavitCredit: 0,
			total: 0,
		},
		employerCosts: {
			imssEmployer: {
				emFixed: 0,
				emExcess: 0,
				pd: 0,
				gmp: 0,
				iv: 0,
				cv: 0,
				guarderias: 0,
				total: 0,
			},
			sarRetiro: 0,
			infonavit: 0,
			isn: 0,
			riskWork: 0,
			absorbedImssEmployeeShare: 0,
			absorbedIsr: 0,
			total: 0,
		},
		informationalLines: {
			isrBeforeSubsidy: 0,
			subsidyApplied: 0,
		},
		deductionsBreakdown: [],
		totalDeductions: 0,
		netPay: 1740,
		companyCost: 1740,
		incapacitySummary: {
			daysIncapacityTotal: 0,
			expectedImssSubsidyAmount: 0,
			byType: {
				EG: { days: 0, subsidyDays: 0, subsidyRate: 0, expectedSubsidyAmount: 0 },
				RT: { days: 0, subsidyDays: 0, subsidyRate: 0, expectedSubsidyAmount: 0 },
				MAT: { days: 0, subsidyDays: 0, subsidyRate: 0, expectedSubsidyAmount: 0 },
				LIC140BIS: {
					days: 0,
					subsidyDays: 0,
					subsidyRate: 0,
					expectedSubsidyAmount: 0,
				},
			},
		},
		warnings: [],
		...overrides,
	};
}

describe('buildPayrollCsvEmployeeRow', () => {
	const t: TranslateFn = (key) => key;

	it('falls back to grossPay when exporting fiscal gross for non-dual rows', () => {
		const row = buildPayrollCsvEmployeeRow({
			row: buildEmployee({
				totalPay: 1080,
				grossPay: 1080,
				fiscalGrossPay: null,
				complementPay: null,
				totalRealPay: null,
			}),
			periodStartDateKey: '2026-03-09',
			periodEndDateKey: '2026-03-15',
			t,
		});

		expect(row.fiscalGrossPay).toBe(1080);
		expect(row.complementPay).toBe(0);
		expect(row.totalRealPay).toBe(1080);
	});

	it('exports real vacation amounts when dual payroll fields are available', () => {
		const row = buildPayrollCsvEmployeeRow({
			row: buildEmployee({
				vacationPayAmount: 600,
				vacationPremiumAmount: 150,
				realVacationPayAmount: 1000,
				realVacationPremiumAmount: 250,
			}),
			periodStartDateKey: '2026-03-09',
			periodEndDateKey: '2026-03-15',
			t,
		});

		expect(row.realVacationPayAmount).toBe(1000);
		expect(row.realVacationPremiumAmount).toBe(250);
	});

	it('exports total gratifications when real-only concepts are present', () => {
		const row = buildPayrollCsvEmployeeRow({
			row: buildEmployee({
				totalGratifications: 750,
			}),
			periodStartDateKey: '2026-03-09',
			periodEndDateKey: '2026-03-15',
			t,
		});

		expect(row.totalGratifications).toBe(750);
	});
});
