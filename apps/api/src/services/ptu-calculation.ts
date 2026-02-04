import { roundCurrency } from '../utils/money.js';
import type { MinimumWageZone } from '../utils/minimum-wage.js';
import { MINIMUM_WAGE_BY_YEAR } from '../utils/mexico-labor-constants.js';
import { calculateExtraPaymentTaxes, type ExtraPaymentTaxBreakdown } from './extra-payment-taxes.js';

/**
 * PTU eligibility override values.
 */
export type PtuEligibilityOverride = 'DEFAULT' | 'INCLUDE' | 'EXCLUDE';

/**
 * PTU calculation warning.
 */
export interface PtuCalculationWarning {
	/** Warning type identifier. */
	type: string;
	/** Warning message. */
	message: string;
	/** Warning severity. */
	severity: 'warning' | 'error';
}

/**
 * Input record for PTU calculation per employee.
 */
export interface PtuEmployeeInput {
	/** Employee identifier. */
	employeeId: string;
	/** Employee status. */
	status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
	/** Employment type for PTU eligibility. */
	employmentType: 'PERMANENT' | 'EVENTUAL';
	/** Daily pay used as PTU quota. */
	dailyPay: number;
	/** Optional override for daily quota (post-cap). */
	dailyQuotaOverride?: number | null;
	/** Days counted for PTU. */
	daysCounted: number;
	/** Optional override for annual salary base. */
	annualSalaryBaseOverride?: number | null;
	/** Trust employee flag. */
	isTrustEmployee: boolean;
	/** Director/admin/general manager flag. */
	isDirectorAdminGeneralManager: boolean;
	/** Domestic worker flag. */
	isDomesticWorker: boolean;
	/** Platform worker flag. */
	isPlatformWorker: boolean;
	/** Platform hours in the year. */
	platformHoursYear: number;
	/** PTU eligibility override. */
	ptuEligibilityOverride: PtuEligibilityOverride;
	/** Minimum wage zone for exemptions. */
	minimumWageZone: MinimumWageZone | null;
	/** Ordinary monthly income for RLISR 174. */
	ordinaryMonthlyIncome: number;
	/** PTU history amounts (last 3 years). */
	ptuHistoryAmounts: number[];
}

/**
 * PTU calculation input payload.
 */
export interface PtuCalculationInput {
	/** Fiscal year for PTU. */
	fiscalYear: number;
	/** Payment date key (YYYY-MM-DD). */
	paymentDateKey: string;
	/** Taxable income base. */
	taxableIncome: number;
	/** PTU percentage. */
	ptuPercentage: number;
	/** Include inactive employees. */
	includeInactive: boolean;
	/** PTU mode (default rules vs manual). */
	ptuMode: 'DEFAULT_RULES' | 'MANUAL';
	/** Optional SMG daily override when year data missing. */
	smgDailyOverride?: number | null;
	/** Month days used for 3-month cap. */
	monthDaysForCaps: number;
	/** Employee inputs for calculation. */
	employees: PtuEmployeeInput[];
}

/**
 * PTU calculation output per employee.
 */
export interface PtuCalculationEmployee {
	/** Employee identifier. */
	employeeId: string;
	/** Eligibility flag. */
	isEligible: boolean;
	/** Eligibility reasons. */
	eligibilityReasons: string[];
	/** Days counted. */
	daysCounted: number;
	/** Daily quota used. */
	dailyQuota: number;
	/** Annual salary base. */
	annualSalaryBase: number;
	/** PTU by days. */
	ptuByDays: number;
	/** PTU by salary. */
	ptuBySalary: number;
	/** PTU before caps. */
	ptuPreCap: number;
	/** Cap based on 3 months. */
	capThreeMonths: number;
	/** Cap based on 3-year average. */
	capAvgThreeYears: number;
	/** Final cap applied. */
	capFinal: number;
	/** Final PTU amount. */
	ptuFinal: number;
	/** Tax breakdown. */
	tax: ExtraPaymentTaxBreakdown;
	/** Warnings for this employee. */
	warnings: PtuCalculationWarning[];
}

/**
 * PTU calculation aggregate output.
 */
export interface PtuCalculationResult {
	/** Employee calculation rows. */
	employees: PtuCalculationEmployee[];
	/** Aggregate warnings. */
	warnings: PtuCalculationWarning[];
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
 * @param args.fiscalYear - Fiscal year
 * @param args.zone - Minimum wage zone
 * @param args.override - Optional override value
 * @returns Resolved SMG daily value or null when missing
 */
function resolveSmgDaily(args: {
	fiscalYear: number;
	zone: MinimumWageZone | null;
	override?: number | null;
}): number | null {
	if (!args.zone) {
		return null;
	}
	const yearData = MINIMUM_WAGE_BY_YEAR[args.fiscalYear as keyof typeof MINIMUM_WAGE_BY_YEAR];
	if (yearData) {
		return yearData[args.zone];
	}
	if (args.override && args.override > 0) {
		return args.override;
	}
	return null;
}

/**
 * Determines PTU eligibility based on rules and overrides.
 *
 * @param args - Eligibility inputs
 * @param args.employee - Employee input
 * @param args.includeInactive - Include inactive employees flag
 * @param args.ptuMode - PTU mode
 * @returns Eligibility decision and reasons
 */
function determinePtuEligibility(args: {
	employee: PtuEmployeeInput;
	includeInactive: boolean;
	ptuMode: 'DEFAULT_RULES' | 'MANUAL';
}): { isEligible: boolean; reasons: string[] } {
	const reasons: string[] = [];
	const { employee } = args;

	if (employee.ptuEligibilityOverride === 'EXCLUDE') {
		reasons.push('OVERRIDE_EXCLUDE');
		return { isEligible: false, reasons };
	}

	if (args.ptuMode === 'MANUAL') {
		if (employee.ptuEligibilityOverride === 'INCLUDE') {
			return { isEligible: true, reasons };
		}
		reasons.push('MANUAL_SELECTION_REQUIRED');
		return { isEligible: false, reasons };
	}

	if (employee.ptuEligibilityOverride === 'INCLUDE') {
		return { isEligible: true, reasons };
	}

	if (!args.includeInactive && employee.status !== 'ACTIVE') {
		reasons.push('INACTIVE');
		return { isEligible: false, reasons };
	}

	if (employee.isDirectorAdminGeneralManager) {
		reasons.push('DIRECTOR_ADMIN');
		return { isEligible: false, reasons };
	}
	if (employee.isDomesticWorker) {
		reasons.push('DOMESTIC_WORKER');
		return { isEligible: false, reasons };
	}
	if (employee.isPlatformWorker && employee.platformHoursYear < 288) {
		reasons.push('PLATFORM_HOURS_BELOW_THRESHOLD');
		return { isEligible: false, reasons };
	}
	if (employee.employmentType === 'EVENTUAL' && employee.daysCounted < 60) {
		reasons.push('EVENTUAL_DAYS_BELOW_60');
		return { isEligible: false, reasons };
	}

	return { isEligible: true, reasons };
}

/**
 * Calculates PTU distribution and tax breakdowns.
 *
 * @param input - PTU calculation inputs
 * @returns PTU calculation result with totals and warnings
 */
export function calculatePtu(input: PtuCalculationInput): PtuCalculationResult {
	const warnings: PtuCalculationWarning[] = [];
	const ptuTotal = roundCurrency(Math.max(0, input.taxableIncome) * Math.max(0, input.ptuPercentage));
	const halfPool = roundCurrency(ptuTotal / 2);

	const highestNonTrustDaily = input.employees
		.filter((employee) => !employee.isTrustEmployee)
		.reduce((max, employee) => Math.max(max, employee.dailyPay), 0);
	const trustCap = highestNonTrustDaily > 0 ? highestNonTrustDaily * 1.2 : null;

	const baseEmployees: PtuCalculationEmployee[] = input.employees.map((employee) => {
		const employeeWarnings: PtuCalculationWarning[] = [];
		const eligibility = determinePtuEligibility({
			employee,
			includeInactive: input.includeInactive,
			ptuMode: input.ptuMode,
		});
		const resolvedDailyPay =
			employee.dailyQuotaOverride !== null && employee.dailyQuotaOverride !== undefined
				? employee.dailyQuotaOverride
				: employee.dailyPay;
		const resolvedDailyQuota = trustCap && employee.isTrustEmployee
			? Math.min(resolvedDailyPay, trustCap)
			: resolvedDailyPay;
		const computedAnnualSalaryBase = roundCurrency(
			resolvedDailyQuota * Math.max(0, employee.daysCounted),
		);
		const annualSalaryBase = roundCurrency(
			Math.max(0, employee.annualSalaryBaseOverride ?? computedAnnualSalaryBase),
		);
		const smgDaily = resolveSmgDaily({
			fiscalYear: input.fiscalYear,
			zone: employee.minimumWageZone,
			override: input.smgDailyOverride ?? null,
		});
		if (!employee.minimumWageZone) {
			employeeWarnings.push({
				type: 'MISSING_MINIMUM_WAGE_ZONE',
				message: 'El empleado no tiene zona geográfica para salario mínimo.',
				severity: 'error',
			});
		}
		if (smgDaily === null) {
			employeeWarnings.push({
				type: 'MISSING_MINIMUM_WAGE_YEAR',
				message: 'No existe salario mínimo configurado para el año seleccionado.',
				severity: 'error',
			});
		}
		if (resolvedDailyPay <= 0) {
			employeeWarnings.push({
				type: 'MISSING_DAILY_PAY',
				message: 'El empleado no tiene salario diario válido.',
				severity: 'error',
			});
		}

		return {
			employeeId: employee.employeeId,
			isEligible: eligibility.isEligible,
			eligibilityReasons: eligibility.reasons,
			daysCounted: Math.max(0, employee.daysCounted),
			dailyQuota: roundCurrency(Math.max(0, resolvedDailyQuota)),
			annualSalaryBase,
			ptuByDays: 0,
			ptuBySalary: 0,
			ptuPreCap: 0,
			capThreeMonths: 0,
			capAvgThreeYears: 0,
			capFinal: 0,
			ptuFinal: 0,
			tax: {
				exemptAmount: 0,
				taxableAmount: 0,
				withheldIsr: 0,
				netAmount: 0,
				withholdingMethod: 'RLISR_174',
			},
			warnings: employeeWarnings,
		};
	});

	const eligibleEmployees = baseEmployees.filter(
		(employee) => employee.isEligible && employee.warnings.every((w) => w.severity !== 'error'),
	);
	const sumDays = eligibleEmployees.reduce((sum, employee) => sum + employee.daysCounted, 0);
	const sumSalary = eligibleEmployees.reduce(
		(sum, employee) => sum + employee.annualSalaryBase,
		0,
	);

	const factorDay = sumDays > 0 ? halfPool / sumDays : 0;
	const factorSalary = sumSalary > 0 ? halfPool / sumSalary : 0;

	for (const employee of eligibleEmployees) {
		employee.ptuByDays = roundCurrency(employee.daysCounted * factorDay);
		employee.ptuBySalary = roundCurrency(employee.annualSalaryBase * factorSalary);
		employee.ptuPreCap = roundCurrency(employee.ptuByDays + employee.ptuBySalary);
	}

	for (const employee of eligibleEmployees) {
		const historyValues =
			input.employees.find((item) => item.employeeId === employee.employeeId)
				?.ptuHistoryAmounts ?? [];
		const avgHistory = historyValues.length > 0
			? historyValues.reduce((sum, value) => sum + value, 0) / historyValues.length
			: 0;
		const capThreeMonths = roundCurrency(employee.dailyQuota * input.monthDaysForCaps * 3);
		employee.capThreeMonths = capThreeMonths;
		employee.capAvgThreeYears = roundCurrency(avgHistory);
		employee.capFinal = roundCurrency(Math.max(employee.capThreeMonths, employee.capAvgThreeYears));
		employee.ptuFinal = employee.ptuPreCap;
	}

	let excessPool = roundCurrency(
		eligibleEmployees.reduce((sum, employee) => {
			if (employee.ptuPreCap > employee.capFinal) {
				const excess = employee.ptuPreCap - employee.capFinal;
				employee.ptuFinal = employee.capFinal;
				return sum + excess;
			}
			return sum;
		}, 0),
	);

	let iteration = 0;
	while (excessPool > 0.01 && iteration < 20) {
		iteration += 1;
		const remaining = eligibleEmployees.filter(
			(employee) => employee.ptuFinal < employee.capFinal - 0.001,
		);
		if (remaining.length === 0) {
			break;
		}
		const remainingDays = remaining.reduce((sum, employee) => sum + employee.daysCounted, 0);
		const remainingSalary = remaining.reduce(
			(sum, employee) => sum + employee.annualSalaryBase,
			0,
		);
		if (remainingDays === 0 && remainingSalary === 0) {
			break;
		}
		const halfExcess = roundCurrency(excessPool / 2);
		const factorExcessDays = remainingDays > 0 ? halfExcess / remainingDays : 0;
		const factorExcessSalary = remainingSalary > 0 ? halfExcess / remainingSalary : 0;
		let newExcess = 0;
		for (const employee of remaining) {
			const addByDays = roundCurrency(employee.daysCounted * factorExcessDays);
			const addBySalary = roundCurrency(employee.annualSalaryBase * factorExcessSalary);
			const addition = roundCurrency(addByDays + addBySalary);
			const nextValue = roundCurrency(employee.ptuFinal + addition);
			if (nextValue > employee.capFinal) {
				newExcess += nextValue - employee.capFinal;
				employee.ptuFinal = employee.capFinal;
			} else {
				employee.ptuFinal = nextValue;
			}
		}
		excessPool = roundCurrency(newExcess);
	}

	let grossTotal = 0;
	let exemptTotal = 0;
	let taxableTotal = 0;
	let withheldTotal = 0;
	let netTotal = 0;
	let employeeCount = 0;

	for (const employee of baseEmployees) {
		const inputEmployee = input.employees.find((item) => item.employeeId === employee.employeeId);
		const smgDaily = resolveSmgDaily({
			fiscalYear: input.fiscalYear,
			zone: inputEmployee?.minimumWageZone ?? null,
			override: input.smgDailyOverride ?? null,
		});
		if (employee.isEligible && employee.warnings.every((w) => w.severity !== 'error')) {
			const tax = calculateExtraPaymentTaxes({
				grossAmount: employee.ptuFinal,
				smgDaily: smgDaily ?? 0,
				exemptDays: 15,
				paymentDateKey: input.paymentDateKey,
				ordinaryMonthlyIncome: inputEmployee?.ordinaryMonthlyIncome ?? 0,
			});
			employee.tax = tax;
			grossTotal = roundCurrency(grossTotal + employee.ptuFinal);
			exemptTotal = roundCurrency(exemptTotal + tax.exemptAmount);
			taxableTotal = roundCurrency(taxableTotal + tax.taxableAmount);
			withheldTotal = roundCurrency(withheldTotal + tax.withheldIsr);
			netTotal = roundCurrency(netTotal + tax.netAmount);
			employeeCount += 1;
		} else {
			employee.ptuFinal = 0;
			employee.tax = {
				exemptAmount: 0,
				taxableAmount: 0,
				withheldIsr: 0,
				netAmount: 0,
				withholdingMethod: 'RLISR_174',
			};
		}
	}

	for (const employee of baseEmployees) {
		if (employee.warnings.length > 0) {
			warnings.push(...employee.warnings);
		}
	}

	return {
		employees: baseEmployees,
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
