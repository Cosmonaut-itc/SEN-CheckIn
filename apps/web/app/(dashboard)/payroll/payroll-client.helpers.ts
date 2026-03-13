import type { PayrollCalculationEmployee } from '@/lib/client-functions';

export type CsvRow = Record<string, string | number | null | undefined>;

type TranslateFn = (key: string) => string;

/**
 * Builds a CSV employee row from a payroll calculation row.
 *
 * @param args - Builder inputs
 * @param args.row - Payroll calculation row to serialize
 * @param args.periodStartDateKey - Export period start date key
 * @param args.periodEndDateKey - Export period end date key
 * @param args.t - Translation function for static labels
 * @returns CSV-safe row data for one employee
 */
export function buildPayrollCsvEmployeeRow(args: {
	row: PayrollCalculationEmployee;
	periodStartDateKey: string;
	periodEndDateKey: string;
	t: TranslateFn;
}): CsvRow {
	const { row, periodStartDateKey, periodEndDateKey, t } = args;
	const warnings = row.warnings.map((warning) => warning.message).join(' | ');

	return {
		rowType: t('csv.rowTypes.employee'),
		employeeId: row.employeeId,
		employeeName: row.name,
		paymentFrequency: t(`paymentFrequency.${row.paymentFrequency}`),
		periodStart: periodStartDateKey,
		periodEnd: periodEndDateKey,
		dailyPay: row.dailyPay,
		fiscalDailyPay: row.fiscalDailyPay ?? null,
		hourlyPay: row.hourlyPay,
		hoursWorked: row.hoursWorked,
		expectedHours: row.expectedHours,
		normalHours: row.normalHours,
		overtimeDoubleHours: row.overtimeDoubleHours,
		overtimeTripleHours: row.overtimeTripleHours,
		authorizedOvertimeHours: row.authorizedOvertimeHours,
		unauthorizedOvertimeHours: row.unauthorizedOvertimeHours,
		sundayPremiumAmount: row.sundayPremiumAmount,
		mandatoryRestDayPremiumAmount: row.mandatoryRestDayPremiumAmount,
		vacationDaysPaid: row.vacationDaysPaid ?? 0,
		vacationPayAmount: row.vacationPayAmount ?? 0,
		vacationPremiumAmount: row.vacationPremiumAmount ?? 0,
		incapacityDays: row.incapacitySummary?.daysIncapacityTotal ?? 0,
		incapacitySubsidy: row.incapacitySummary?.expectedImssSubsidyAmount ?? 0,
		seventhDayPay: row.seventhDayPay ?? 0,
		totalPay: row.totalPay,
		fiscalGrossPay: row.fiscalGrossPay ?? row.grossPay ?? row.totalPay,
		complementPay: row.complementPay ?? 0,
		totalRealPay: row.totalRealPay ?? row.totalPay,
		grossPay: row.grossPay ?? row.totalPay,
		employeeWithholdingsTotal: row.employeeWithholdings?.total ?? 0,
		employeeWithholdingsIsr: row.employeeWithholdings?.isrWithheld ?? 0,
		employeeWithholdingsImssTotal: row.employeeWithholdings?.imssEmployee?.total ?? 0,
		employerCostsTotal: row.employerCosts?.total ?? 0,
		employerCostsImssTotal: row.employerCosts?.imssEmployer?.total ?? 0,
		employerCostsImssGuarderias: row.employerCosts?.imssEmployer?.guarderias ?? 0,
		employerCostsSarRetiro: row.employerCosts?.sarRetiro ?? 0,
		employerCostsInfonavit: row.employerCosts?.infonavit ?? 0,
		employerCostsRiskWork: row.employerCosts?.riskWork ?? 0,
		employerCostsIsn: row.employerCosts?.isn ?? 0,
		employerCostsAbsorbedImssEmployeeShare:
			row.employerCosts?.absorbedImssEmployeeShare ?? 0,
		employerCostsAbsorbedIsr: row.employerCosts?.absorbedIsr ?? 0,
		netPay: row.netPay ?? 0,
		companyCost: row.companyCost ?? 0,
		baseSbcDaily: row.bases?.sbcDaily ?? 0,
		baseSbcPeriod: row.bases?.sbcPeriod ?? 0,
		baseIsrBase: row.bases?.isrBase ?? 0,
		baseDaysInPeriod: row.bases?.daysInPeriod ?? 0,
		informationalIsrBeforeSubsidy: row.informationalLines?.isrBeforeSubsidy ?? 0,
		informationalSubsidyApplied: row.informationalLines?.subsidyApplied ?? 0,
		lunchBreakAutoDeductedDays: row.lunchBreakAutoDeductedDays ?? 0,
		lunchBreakAutoDeductedMinutes: row.lunchBreakAutoDeductedMinutes ?? 0,
		warningsCount: row.warnings.length,
		warnings,
	};
}
