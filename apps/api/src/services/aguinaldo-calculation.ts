import { roundCurrency } from '../utils/money.js';
import type { MinimumWageZone } from '../utils/minimum-wage.js';
import { MINIMUM_WAGE_BY_YEAR } from '../utils/mexico-labor-constants.js';
import { calculateExtraPaymentTaxes, type ExtraPaymentTaxBreakdown } from './extra-payment-taxes.js';

/**
 * Aguinaldo calculation warning.
 */
export interface AguinaldoCalculationWarning {
	/** Warning type identifier. */
	type: string;
	/** Warning message. */
	message: string;
	/** Warning severity. */
	severity: 'warning' | 'error';
}

/**
 * Input record for Aguinaldo calculation per employee.
 */
export interface AguinaldoEmployeeInput {
	/** Employee identifier. */
	employeeId: string;
	/** Employee status. */
	status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
	/** Daily salary base (average daily pay). */
	dailySalaryBase: number;
	/** Days counted for aguinaldo. */
	daysCounted: number;
	/** Aguinaldo days policy value. */
	aguinaldoDaysPolicy: number;
	/** Days in year (365/366). */
	yearDays: number;
	/** Minimum wage zone for exemptions. */
	minimumWageZone: MinimumWageZone | null;
	/** Ordinary monthly income for RLISR 174. */
	ordinaryMonthlyIncome: number;
}

/**
 * Aguinaldo calculation input payload.
 */
export interface AguinaldoCalculationInput {
	/** Calendar year for aguinaldo. */
	calendarYear: number;
	/** Payment date key (YYYY-MM-DD). */
	paymentDateKey: string;
	/** Include inactive employees. */
	includeInactive: boolean;
	/** Optional SMG daily override when year data missing. */
	smgDailyOverride?: number | null;
	/** Employee inputs for calculation. */
	employees: AguinaldoEmployeeInput[];
}

/**
 * Aguinaldo calculation output per employee.
 */
export interface AguinaldoCalculationEmployee {
	/** Employee identifier. */
	employeeId: string;
	/** Eligibility flag. */
	isEligible: boolean;
	/** Eligibility reasons. */
	eligibilityReasons: string[];
	/** Days counted. */
	daysCounted: number;
	/** Daily salary base used. */
	dailySalaryBase: number;
	/** Aguinaldo days policy. */
	aguinaldoDaysPolicy: number;
	/** Days in year. */
	yearDays: number;
	/** Gross amount. */
	grossAmount: number;
	/** Tax breakdown. */
	tax: ExtraPaymentTaxBreakdown;
	/** Warnings for this employee. */
	warnings: AguinaldoCalculationWarning[];
}

/**
 * Aguinaldo calculation aggregate output.
 */
export interface AguinaldoCalculationResult {
	/** Employee calculation rows. */
	employees: AguinaldoCalculationEmployee[];
	/** Aggregate warnings. */
	warnings: AguinaldoCalculationWarning[];
	/** Aggregate totals. */
	totals: {
		grossTotal: number;
		exemptTotal: number;
		taxableTotal: number;
		withheldTotal: number;
		netTotal: number;
		employeeCount: number;
	};
}

/**
 * Resolves the SMG daily value for a year and zone, with optional override.
 *
 * @param args - Resolution inputs
 * @param args.calendarYear - Calendar year
 * @param args.zone - Minimum wage zone
 * @param args.override - Optional override value
 * @returns Resolved SMG daily value or null when missing
 */
function resolveSmgDaily(args: {
	calendarYear: number;
	zone: MinimumWageZone | null;
	override?: number | null;
}): number | null {
	if (!args.zone) {
		return null;
	}
	const yearData = MINIMUM_WAGE_BY_YEAR[args.calendarYear as keyof typeof MINIMUM_WAGE_BY_YEAR];
	if (yearData) {
		return yearData[args.zone];
	}
	if (args.override && args.override > 0) {
		return args.override;
	}
	return null;
}

/**
 * Calculates Aguinaldo amounts and tax breakdowns.
 *
 * @param input - Aguinaldo calculation inputs
 * @returns Aguinaldo calculation result with totals and warnings
 */
export function calculateAguinaldo(
	input: AguinaldoCalculationInput,
): AguinaldoCalculationResult {
	const warnings: AguinaldoCalculationWarning[] = [];
	const employees: AguinaldoCalculationEmployee[] = input.employees.map((employee) => {
		const employeeWarnings: AguinaldoCalculationWarning[] = [];
		const eligibilityReasons: string[] = [];
		if (!input.includeInactive && employee.status !== 'ACTIVE') {
			eligibilityReasons.push('INACTIVE');
		}
		if (employee.dailySalaryBase <= 0) {
			employeeWarnings.push({
				type: 'MISSING_DAILY_BASE',
				message: 'El empleado no tiene salario diario base válido.',
				severity: 'error',
			});
		}
		if (!employee.minimumWageZone) {
			employeeWarnings.push({
				type: 'MISSING_MINIMUM_WAGE_ZONE',
				message: 'El empleado no tiene zona geográfica para salario mínimo.',
				severity: 'error',
			});
		}
		const smgDaily = resolveSmgDaily({
			calendarYear: input.calendarYear,
			zone: employee.minimumWageZone,
			override: input.smgDailyOverride ?? null,
		});
		if (smgDaily === null) {
			employeeWarnings.push({
				type: 'MISSING_MINIMUM_WAGE_YEAR',
				message: 'No existe salario mínimo configurado para el año seleccionado.',
				severity: 'error',
			});
		}

		const isEligible = eligibilityReasons.length === 0;
		const grossAmount = roundCurrency(
			employee.dailySalaryBase *
				employee.aguinaldoDaysPolicy *
				(employee.yearDays > 0 ? employee.daysCounted / employee.yearDays : 0),
		);
		const tax = isEligible && employeeWarnings.every((w) => w.severity !== 'error')
			? calculateExtraPaymentTaxes({
					grossAmount,
					smgDaily: smgDaily ?? 0,
					exemptDays: 30,
					paymentDateKey: input.paymentDateKey,
					ordinaryMonthlyIncome: employee.ordinaryMonthlyIncome,
				})
			: {
				exemptAmount: 0,
				taxableAmount: 0,
				withheldIsr: 0,
				netAmount: 0,
				withholdingMethod: 'RLISR_174',
			};

		return {
			employeeId: employee.employeeId,
			isEligible,
			eligibilityReasons,
			daysCounted: Math.max(0, employee.daysCounted),
			dailySalaryBase: roundCurrency(Math.max(0, employee.dailySalaryBase)),
			aguinaldoDaysPolicy: employee.aguinaldoDaysPolicy,
			yearDays: employee.yearDays,
			grossAmount: isEligible ? grossAmount : 0,
			tax,
			warnings: employeeWarnings,
		};
	});

	let grossTotal = 0;
	let exemptTotal = 0;
	let taxableTotal = 0;
	let withheldTotal = 0;
	let netTotal = 0;
	let employeeCount = 0;

	for (const employee of employees) {
		if (employee.isEligible && employee.warnings.every((w) => w.severity !== 'error')) {
			grossTotal = roundCurrency(grossTotal + employee.grossAmount);
			exemptTotal = roundCurrency(exemptTotal + employee.tax.exemptAmount);
			taxableTotal = roundCurrency(taxableTotal + employee.tax.taxableAmount);
			withheldTotal = roundCurrency(withheldTotal + employee.tax.withheldIsr);
			netTotal = roundCurrency(netTotal + employee.tax.netAmount);
			employeeCount += 1;
		}
		if (employee.warnings.length > 0) {
			warnings.push(...employee.warnings);
		}
	}

	return {
		employees,
		warnings,
		totals: {
			grossTotal,
			exemptTotal,
			taxableTotal,
			withheldTotal,
			netTotal,
			employeeCount,
		},
	};
}
