import { MINIMUM_WAGES } from '../utils/mexico-labor-constants.js';
import { addDaysToDateKey } from '../utils/date-key.js';
import { roundCurrency, sumMoney } from '../utils/money.js';

export type PayrollPaymentFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

export interface MexicoPayrollTaxSettings {
	/** Risk of work rate (prima de riesgo de trabajo). Example: 0.06 */
	riskWorkRate: number;
	/** State payroll tax rate (ISN). Example: 0.02 */
	statePayrollTaxRate: number;
	/** Whether the employer absorbs the employee IMSS share */
	absorbImssEmployeeShare: boolean;
	/** Whether the employer absorbs ISR withholding */
	absorbIsr: boolean;
	/** Aguinaldo days for the SDI/SBC integration factor */
	aguinaldoDays: number;
	/** Vacation premium rate for the SDI/SBC integration factor */
	vacationPremiumRate: number;
}

export interface PayrollTaxBases {
	sbcDaily: number;
	sbcPeriod: number;
	isrBase: number;
	daysInPeriod: number;
	umaDaily: number;
	minimumWageDaily: number;
}

export interface ImssEmployeeBreakdown {
	emExcess: number;
	pd: number;
	gmp: number;
	iv: number;
	cv: number;
	total: number;
}

export interface ImssEmployerBreakdown {
	emFixed: number;
	emExcess: number;
	pd: number;
	gmp: number;
	iv: number;
	cv: number;
	guarderias: number;
	total: number;
}

export interface PayrollEmployeeWithholdings {
	imssEmployee: ImssEmployeeBreakdown;
	isrWithheld: number;
	infonavitCredit: number;
	total: number;
}

export interface PayrollEmployerCosts {
	imssEmployer: ImssEmployerBreakdown;
	sarRetiro: number;
	infonavit: number;
	isn: number;
	riskWork: number;
	absorbedImssEmployeeShare: number;
	absorbedIsr: number;
	total: number;
}

export interface PayrollInformationalLines {
	isrBeforeSubsidy: number;
	subsidyApplied: number;
}

export interface MexicoPayrollTaxResult {
	bases: PayrollTaxBases;
	employeeWithholdings: PayrollEmployeeWithholdings;
	employerCosts: PayrollEmployerCosts;
	informationalLines: PayrollInformationalLines;
	netPay: number;
	companyCost: number;
}

export interface MexicoPayrollTaxInput {
	dailyPay: number;
	grossPay: number;
	paymentFrequency: PayrollPaymentFrequency;
	periodStartDateKey: string;
	periodEndDateKey: string;
	hireDate: Date | null;
	sbcDailyOverride?: number | null;
	locationGeographicZone?: keyof typeof MINIMUM_WAGES | null;
	settings: MexicoPayrollTaxSettings;
	umaDaily?: number;
}

type IsrTableRow = {
	lower: number;
	upper: number | null;
	fixed: number;
	rate: number;
};

const UMA_DAILY_2025 = 113.14;
const UMA_MONTHLY_DAYS = 30.4;
const SUBSIDY_MONTHLY_MAX = 475;
const SUBSIDY_MONTHLY_LIMIT = 10171;

const ISR_TABLES: Record<PayrollPaymentFrequency, IsrTableRow[]> = {
	WEEKLY: [
		{ lower: 0.01, upper: 171.78, fixed: 0, rate: 1.92 },
		{ lower: 171.79, upper: 1458.03, fixed: 3.29, rate: 6.4 },
		{ lower: 1458.04, upper: 2562.35, fixed: 85.62, rate: 10.88 },
		{ lower: 2562.36, upper: 2978.64, fixed: 205.8, rate: 16 },
		{ lower: 2978.65, upper: 3566.22, fixed: 272.37, rate: 17.92 },
		{ lower: 3566.23, upper: 7192.64, fixed: 377.65, rate: 21.36 },
		{ lower: 7192.65, upper: 11336.57, fixed: 1152.27, rate: 23.52 },
		{ lower: 11336.58, upper: 21643.3, fixed: 2126.95, rate: 30 },
		{ lower: 21643.31, upper: 28857.78, fixed: 5218.92, rate: 32 },
		{ lower: 28857.79, upper: 86573.34, fixed: 7527.59, rate: 34 },
		{ lower: 86573.35, upper: null, fixed: 27150.83, rate: 35 },
	],
	BIWEEKLY: [
		{ lower: 0.01, upper: 368.1, fixed: 0, rate: 1.92 },
		{ lower: 368.11, upper: 3124.35, fixed: 7.05, rate: 6.4 },
		{ lower: 3124.36, upper: 5490.75, fixed: 183.45, rate: 10.88 },
		{ lower: 5490.76, upper: 6382.8, fixed: 441, rate: 16 },
		{ lower: 6382.81, upper: 7641.9, fixed: 583.65, rate: 17.92 },
		{ lower: 7641.91, upper: 15412.8, fixed: 809.25, rate: 21.36 },
		{ lower: 15412.81, upper: 24292.65, fixed: 2469.15, rate: 23.52 },
		{ lower: 24292.66, upper: 46378.5, fixed: 4557.75, rate: 30 },
		{ lower: 46378.51, upper: 61838.1, fixed: 11183.4, rate: 32 },
		{ lower: 61838.11, upper: 185514.3, fixed: 16130.55, rate: 34 },
		{ lower: 185514.31, upper: null, fixed: 58180.35, rate: 35 },
	],
	MONTHLY: [
		{ lower: 0.01, upper: 746.04, fixed: 0, rate: 1.92 },
		{ lower: 746.05, upper: 6332.05, fixed: 14.32, rate: 6.4 },
		{ lower: 6332.06, upper: 11128.01, fixed: 371.83, rate: 10.88 },
		{ lower: 11128.02, upper: 12935.82, fixed: 893.63, rate: 16 },
		{ lower: 12935.83, upper: 15487.71, fixed: 1182.88, rate: 17.92 },
		{ lower: 15487.72, upper: 31236.49, fixed: 1640.18, rate: 21.36 },
		{ lower: 31236.5, upper: 49233, fixed: 5004.12, rate: 23.52 },
		{ lower: 49233.01, upper: 93993.9, fixed: 9236.89, rate: 30 },
		{ lower: 93993.91, upper: 125325.2, fixed: 22665.17, rate: 32 },
		{ lower: 125325.21, upper: 375975.61, fixed: 32691.18, rate: 34 },
		{ lower: 375975.62, upper: null, fixed: 117912.32, rate: 35 },
	],
};

/**
 * Calculates the inclusive number of days between two date keys.
 *
 * @param periodStartDateKey - Period start date key (YYYY-MM-DD)
 * @param periodEndDateKey - Period end date key (YYYY-MM-DD)
 * @returns Inclusive day count
 */
function getInclusiveDayCount(periodStartDateKey: string, periodEndDateKey: string): number {
	if (periodEndDateKey < periodStartDateKey) {
		return 0;
	}
	let count = 0;
	let cursor = periodStartDateKey;
	for (let i = 0; i < 400 && cursor <= periodEndDateKey; i += 1) {
		count += 1;
		if (cursor === periodEndDateKey) {
			break;
		}
		cursor = addDaysToDateKey(cursor, 1);
	}
	return count;
}

/**
 * Calculates completed years of service relative to a period end date.
 *
 * @param hireDate - Employee hire date
 * @param periodEndDateKey - Period end date key (YYYY-MM-DD)
 * @returns Completed years of service (>=0)
 */
function getCompletedYears(hireDate: Date, periodEndDateKey: string): number {
	const periodEnd = new Date(`${periodEndDateKey}T00:00:00Z`);
	if (Number.isNaN(periodEnd.getTime())) {
		return 0;
	}
	let years = periodEnd.getUTCFullYear() - hireDate.getUTCFullYear();
	const anniversary = new Date(
		Date.UTC(periodEnd.getUTCFullYear(), hireDate.getUTCMonth(), hireDate.getUTCDate()),
	);
	if (periodEnd < anniversary) {
		years -= 1;
	}
	return Math.max(0, years);
}

/**
 * Returns vacation days per completed years under LFT 2023+.
 *
 * @param completedYears - Completed years of service
 * @returns Vacation days for the year
 */
export function getVacationDaysForYears(completedYears: number): number {
	const years = Math.max(1, Math.floor(completedYears));
	if (years === 1) return 12;
	if (years === 2) return 14;
	if (years === 3) return 16;
	if (years === 4) return 18;
	if (years === 5) return 20;
	if (years <= 10) return 22;
	if (years <= 15) return 24;
	if (years <= 20) return 26;
	if (years <= 25) return 28;
	if (years <= 30) return 30;
	const extraBlocks = Math.floor((years - 30) / 5) + 1;
	return 30 + extraBlocks * 2;
}

/**
 * Computes the SDI/SBC integration factor (FI).
 *
 * @param aguinaldoDays - Aguinaldo days
 * @param vacationDays - Vacation days
 * @param vacationPremiumRate - Vacation premium rate (e.g., 0.25)
 * @returns Integration factor
 */
export function getIntegrationFactor(
	aguinaldoDays: number,
	vacationDays: number,
	vacationPremiumRate: number,
): number {
	return (365 + aguinaldoDays + vacationDays * vacationPremiumRate) / 365;
}

/**
 * Resolves the SBC daily value using override or automatic SDI calculation.
 *
 * @param args - Salary and settings inputs
 * @returns SBC daily rounded to two decimals
 */
export function getSbcDaily(args: {
	dailyPay: number;
	hireDate: Date | null;
	sbcDailyOverride?: number | null;
	aguinaldoDays: number;
	vacationPremiumRate: number;
	periodEndDateKey: string;
}): number {
	const { dailyPay, hireDate, sbcDailyOverride, aguinaldoDays, vacationPremiumRate, periodEndDateKey } =
		args;
	if (sbcDailyOverride && sbcDailyOverride > 0) {
		return roundCurrency(sbcDailyOverride);
	}
	const completedYears = hireDate ? getCompletedYears(hireDate, periodEndDateKey) : 0;
	const vacationDays = getVacationDaysForYears(completedYears);
	const integrationFactor = getIntegrationFactor(aguinaldoDays, vacationDays, vacationPremiumRate);
	return roundCurrency(dailyPay * integrationFactor);
}

/**
 * Resolves the employer CV rate based on SBC and minimum wage/UMA brackets.
 *
 * @param sbcDaily - SBC daily amount
 * @param umaDaily - UMA daily amount
 * @param minimumWageDaily - Minimum wage daily amount for the zone
 * @returns Employer CV rate
 */
export function getCvEmployerRate(
	sbcDaily: number,
	umaDaily: number,
	minimumWageDaily: number,
): number {
	if (sbcDaily <= minimumWageDaily) {
		return 0.0315;
	}
	const umaRatio = sbcDaily / umaDaily;
	if (umaRatio <= 1.5) return 0.03544;
	if (umaRatio <= 2.0) return 0.04426;
	if (umaRatio <= 2.5) return 0.04954;
	if (umaRatio <= 3.0) return 0.05307;
	if (umaRatio <= 3.5) return 0.05559;
	if (umaRatio <= 4.0) return 0.05747;
	return 0.06422;
}

/**
 * Calculates ISR for a given base and frequency using the 2025 tables.
 *
 * @param isrBase - Taxable base for the period
 * @param frequency - Payroll payment frequency
 * @returns ISR before subsidy
 */
export function calculateIsrFromTable(
	isrBase: number,
	frequency: PayrollPaymentFrequency,
): number {
	if (isrBase <= 0) {
		return 0;
	}
	const table = ISR_TABLES[frequency];
	const row =
		table.find((entry) => isrBase >= entry.lower && (entry.upper === null || isrBase <= entry.upper)) ??
		table[table.length - 1];
	if (!row) {
		return 0;
	}
	const excess = isrBase - row.lower;
	const tax = row.fixed + excess * (row.rate / 100);
	return roundCurrency(tax);
}

/**
 * Calculates Mexico payroll taxes (ISR + subsidy, IMSS, SAR, INFONAVIT, ISN) for a period.
 *
 * @param input - Payroll and fiscal inputs for the employee
 * @returns Detailed tax breakdown with net pay and company cost
 */
export function calculateMexicoPayrollTaxes(input: MexicoPayrollTaxInput): MexicoPayrollTaxResult {
	const {
		dailyPay,
		grossPay,
		paymentFrequency,
		periodStartDateKey,
		periodEndDateKey,
		hireDate,
		sbcDailyOverride,
		locationGeographicZone,
		settings,
		umaDaily = UMA_DAILY_2025,
	} = input;
	const daysInPeriod = getInclusiveDayCount(periodStartDateKey, periodEndDateKey);
	const zone = (locationGeographicZone ?? 'GENERAL') as keyof typeof MINIMUM_WAGES;
	const minimumWageDaily = MINIMUM_WAGES[zone];

	const sbcDaily = getSbcDaily({
		dailyPay,
		hireDate,
		sbcDailyOverride,
		aguinaldoDays: settings.aguinaldoDays,
		vacationPremiumRate: settings.vacationPremiumRate,
		periodEndDateKey,
	});
	const sbcDailyCapped = Math.min(sbcDaily, umaDaily * 25);
	const sbcPeriod = sbcDailyCapped * daysInPeriod;

	const isrBase = roundCurrency(grossPay);
	const isrBeforeSubsidy = calculateIsrFromTable(isrBase, paymentFrequency);
	const dailySubsidy = SUBSIDY_MONTHLY_MAX / UMA_MONTHLY_DAYS;
	const subsidyPeriodRaw = dailySubsidy * daysInPeriod;
	const subsidyPeriod = roundCurrency(
		Math.min(SUBSIDY_MONTHLY_MAX, subsidyPeriodRaw),
	);
	const monthlyEquivalent = daysInPeriod > 0 ? (isrBase / daysInPeriod) * UMA_MONTHLY_DAYS : 0;
	const subsidyEligible = monthlyEquivalent <= SUBSIDY_MONTHLY_LIMIT;
	const subsidyApplied = subsidyEligible
		? roundCurrency(Math.min(isrBeforeSubsidy, subsidyPeriod))
		: 0;
	const isrWithheldCalculated = roundCurrency(Math.max(0, isrBeforeSubsidy - subsidyApplied));

	const excessOver3UmaDaily = Math.max(0, sbcDailyCapped - umaDaily * 3);
	const excessOver3UmaPeriod = excessOver3UmaDaily * daysInPeriod;
	const emFixedEmployerRaw = umaDaily * daysInPeriod * 0.204;
	const emExcessEmployerRaw = excessOver3UmaPeriod * 0.011;
	const emExcessEmployeeRaw = excessOver3UmaPeriod * 0.004;
	const pdEmployerRaw = sbcPeriod * 0.007;
	const pdEmployeeRaw = sbcPeriod * 0.0025;
	const gmpEmployerRaw = sbcPeriod * 0.0105;
	const gmpEmployeeRaw = sbcPeriod * 0.00375;
	const ivEmployerRaw = sbcPeriod * 0.0175;
	const ivEmployeeRaw = sbcPeriod * 0.00625;
	const cvEmployerRate = getCvEmployerRate(sbcDailyCapped, umaDaily, minimumWageDaily);
	const cvEmployerRaw = sbcPeriod * cvEmployerRate;
	const cvEmployeeRaw = sbcPeriod * 0.01125;
	const guarderiasRaw = sbcPeriod * 0.01;
	const emFixedEmployer = roundCurrency(emFixedEmployerRaw);
	const emExcessEmployer = roundCurrency(emExcessEmployerRaw);
	const emExcessEmployee = roundCurrency(emExcessEmployeeRaw);
	const pdEmployer = roundCurrency(pdEmployerRaw);
	const pdEmployee = roundCurrency(pdEmployeeRaw);
	const gmpEmployer = roundCurrency(gmpEmployerRaw);
	const gmpEmployee = roundCurrency(gmpEmployeeRaw);
	const ivEmployer = roundCurrency(ivEmployerRaw);
	const ivEmployee = roundCurrency(ivEmployeeRaw);
	const cvEmployer = roundCurrency(cvEmployerRaw);
	const cvEmployee = roundCurrency(cvEmployeeRaw);
	const guarderias = roundCurrency(guarderiasRaw);
	const sarRetiro = roundCurrency(sbcPeriod * 0.02);
	const infonavit = roundCurrency(sbcPeriod * 0.05);
	const riskWork = roundCurrency(sbcPeriod * settings.riskWorkRate);
	const isn = roundCurrency(isrBase * settings.statePayrollTaxRate);

	const imssEmployeeTotalRaw =
		emExcessEmployeeRaw + pdEmployeeRaw + gmpEmployeeRaw + ivEmployeeRaw + cvEmployeeRaw;
	const imssEmployerTotalRaw =
		emFixedEmployerRaw +
		emExcessEmployerRaw +
		pdEmployerRaw +
		gmpEmployerRaw +
		ivEmployerRaw +
		cvEmployerRaw;
	const imssEmployerAbsorbTotalRaw = imssEmployerTotalRaw + imssEmployeeTotalRaw;
	const emExcessCombined = roundCurrency(emExcessEmployerRaw + emExcessEmployeeRaw);
	const pdCombined = roundCurrency(pdEmployerRaw + pdEmployeeRaw);
	const gmpCombined = roundCurrency(gmpEmployerRaw + gmpEmployeeRaw);
	const ivCombined = roundCurrency(ivEmployerRaw + ivEmployeeRaw);
	const cvCombined = roundCurrency(cvEmployerRaw + cvEmployeeRaw);

	const imssEmployee: ImssEmployeeBreakdown = {
		emExcess: emExcessEmployee,
		pd: pdEmployee,
		gmp: gmpEmployee,
		iv: ivEmployee,
		cv: cvEmployee,
		total: roundCurrency(imssEmployeeTotalRaw),
	};

	const imssEmployerBase: ImssEmployerBreakdown = {
		emFixed: emFixedEmployer,
		emExcess: emExcessEmployer,
		pd: pdEmployer,
		gmp: gmpEmployer,
		iv: ivEmployer,
		cv: cvEmployer,
		guarderias,
		total: roundCurrency(imssEmployerTotalRaw),
	};

	const absorbedImssEmployeeShare = settings.absorbImssEmployeeShare ? imssEmployee.total : 0;
	const absorbedIsr = settings.absorbIsr ? isrWithheldCalculated : 0;

	const imssEmployer: ImssEmployerBreakdown = settings.absorbImssEmployeeShare
		? {
			...imssEmployerBase,
			emExcess: emExcessCombined,
			pd: pdCombined,
			gmp: gmpCombined,
			iv: ivCombined,
			cv: cvCombined,
			total: roundCurrency(imssEmployerAbsorbTotalRaw),
		}
		: imssEmployerBase;

	const employeeWithholdings: PayrollEmployeeWithholdings = {
		imssEmployee: settings.absorbImssEmployeeShare
			? {
				emExcess: 0,
				pd: 0,
				gmp: 0,
				iv: 0,
				cv: 0,
				total: 0,
			}
			: imssEmployee,
		isrWithheld: settings.absorbIsr ? 0 : isrWithheldCalculated,
		infonavitCredit: 0,
		total: sumMoney([
			settings.absorbImssEmployeeShare ? 0 : imssEmployee.total,
			settings.absorbIsr ? 0 : isrWithheldCalculated,
		]),
	};

	const employerCosts: PayrollEmployerCosts = {
		imssEmployer,
		sarRetiro,
		infonavit,
		isn,
		riskWork,
		absorbedImssEmployeeShare,
		absorbedIsr,
		total: sumMoney([
			imssEmployer.total,
			imssEmployer.guarderias,
			sarRetiro,
			infonavit,
			isn,
			riskWork,
			absorbedIsr,
		]),
	};

	const informationalLines: PayrollInformationalLines = {
		isrBeforeSubsidy,
		subsidyApplied,
	};

	const netPay = roundCurrency(isrBase - employeeWithholdings.total);
	const companyCost = roundCurrency(isrBase + employerCosts.total);

	return {
		bases: {
			sbcDaily,
			sbcPeriod: roundCurrency(sbcPeriod),
			isrBase,
			daysInPeriod,
			umaDaily,
			minimumWageDaily,
		},
		employeeWithholdings,
		employerCosts,
		informationalLines,
		netPay,
		companyCost,
	};
}
