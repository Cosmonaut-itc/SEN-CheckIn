/**
 * Organization slug that gets explicit dual payroll demo data in the seed script.
 */
export const DUAL_PAYROLL_SEED_ORGANIZATION_SLUG = 'sen-checkin';

export type DualPayrollDemoEmployeeOverride = {
	code: string;
	firstName: string;
	lastName: string;
	department: string;
	dailyPay: string;
	fiscalDailyPay: string | null;
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	shiftType: 'DIURNA' | 'NOCTURNA' | 'MIXTA';
	locationCode: string;
	scenarioLabel: string;
};

export interface SeedPayrollRunCompensationArgs {
	dailyPay: number;
	fiscalDailyPay: number | null;
	authorizedOvertimeHours: number;
	paidNormalHours: number;
	shiftDivisor: number;
}

export interface SeedPayrollRunCompensation {
	hourlyPay: number;
	normalPay: number;
	overtimeDoublePay: number;
	totalPay: number;
	fiscalDailyPay: number | null;
	fiscalGrossPay: number | null;
	complementPay: number | null;
	totalRealPay: number | null;
}

/**
 * Rounds currency values to two decimals for deterministic seed math.
 *
 * @param value - Numeric value to round
 * @returns Rounded value with 2 decimal places
 */
function roundCurrency(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Builds explicit employee scenarios for manually testing dual payroll flows.
 *
 * @returns Stable employee overrides keyed by deterministic employee code
 */
export function buildDualPayrollDemoEmployeeOverrides(): readonly DualPayrollDemoEmployeeOverride[] {
	return [
		{
			code: 'EMP-0001',
			firstName: 'Elena',
			lastName: 'Fiscal',
			department: 'Nomina Dual',
			dailyPay: '400.00',
			fiscalDailyPay: '280.0000',
			paymentFrequency: 'WEEKLY',
			shiftType: 'DIURNA',
			locationCode: 'SEN-CEN',
			scenarioLabel: 'Dual semanal con complemento visible',
		},
		{
			code: 'EMP-0002',
			firstName: 'Marco',
			lastName: 'Complemento',
			department: 'Nomina Dual',
			dailyPay: '600.00',
			fiscalDailyPay: '450.0000',
			paymentFrequency: 'BIWEEKLY',
			shiftType: 'MIXTA',
			locationCode: 'SEN-ZLFN',
			scenarioLabel: 'Dual quincenal en zona fronteriza',
		},
		{
			code: 'EMP-0003',
			firstName: 'Sofia',
			lastName: 'Real',
			department: 'Nomina Dual',
			dailyPay: '1000.00',
			fiscalDailyPay: null,
			paymentFrequency: 'MONTHLY',
			shiftType: 'DIURNA',
			locationCode: 'SEN-CEN',
			scenarioLabel: 'Org dual sin salario fiscal capturado',
		},
		{
			code: 'EMP-0004',
			firstName: 'Diego',
			lastName: 'Nocturno',
			department: 'Nomina Dual',
			dailyPay: '420.00',
			fiscalDailyPay: '300.0000',
			paymentFrequency: 'WEEKLY',
			shiftType: 'NOCTURNA',
			locationCode: 'SEN-ZLFN',
			scenarioLabel: 'Dual semanal en turno nocturno',
		},
	] as const;
}

/**
 * Computes simplified compensation totals for seeded payroll run rows.
 *
 * The seed payroll run intentionally uses a lightweight model, but it still
 * mirrors the core dual payroll split so the UI can display fiscal/complement
 * columns with meaningful data.
 *
 * @param args - Compensation inputs for a seeded payroll line
 * @returns Real/fiscal totals persisted on the seeded payroll run employee row
 */
export function buildSeedPayrollRunCompensation(
	args: SeedPayrollRunCompensationArgs,
): SeedPayrollRunCompensation {
	const hourlyPay =
		args.shiftDivisor > 0 ? roundCurrency(args.dailyPay / args.shiftDivisor) : 0;
	const normalPay = roundCurrency(args.paidNormalHours * hourlyPay);
	const overtimeDoublePay = roundCurrency(args.authorizedOvertimeHours * hourlyPay * 2);
	const totalPay = roundCurrency(normalPay + overtimeDoublePay);

	if (
		args.fiscalDailyPay === null ||
		!Number.isFinite(args.fiscalDailyPay) ||
		args.fiscalDailyPay <= 0 ||
		args.fiscalDailyPay >= args.dailyPay
	) {
		return {
			hourlyPay,
			normalPay,
			overtimeDoublePay,
			totalPay,
			fiscalDailyPay: null,
			fiscalGrossPay: null,
			complementPay: null,
			totalRealPay: null,
		};
	}

	const fiscalDailyPay = roundCurrency(args.fiscalDailyPay);
	const fiscalHourlyPay =
		args.shiftDivisor > 0 ? roundCurrency(fiscalDailyPay / args.shiftDivisor) : 0;
	const fiscalNormalPay = roundCurrency(args.paidNormalHours * fiscalHourlyPay);
	const fiscalOvertimeDoublePay = roundCurrency(
		args.authorizedOvertimeHours * fiscalHourlyPay * 2,
	);
	const fiscalGrossPay = roundCurrency(fiscalNormalPay + fiscalOvertimeDoublePay);
	const complementPay = roundCurrency(Math.max(totalPay - fiscalGrossPay, 0));

	return {
		hourlyPay,
		normalPay,
		overtimeDoublePay,
		totalPay,
		fiscalDailyPay,
		fiscalGrossPay,
		complementPay,
		totalRealPay: totalPay,
	};
}
