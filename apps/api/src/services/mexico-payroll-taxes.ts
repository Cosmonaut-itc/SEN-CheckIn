import { addDaysToDateKey } from '../utils/date-key.js';
import { roundCurrency, sumMoney } from '../utils/money.js';
import { resolveMinimumWageDaily, type MinimumWageZone } from '../utils/minimum-wage.js';

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
	locationGeographicZone?: MinimumWageZone | null;
	settings: MexicoPayrollTaxSettings;
	umaDaily?: number;
	imssExemptDateKeys?: string[];
}

type IsrTableRow = {
	lower: number;
	upper: number | null;
	fixed: number;
	rate: number;
};

type CvRateBracket = {
	upperUma: number | null;
	rate: number;
};

type CvRateTable = {
	minimumWageRate: number;
	umaBrackets: CvRateBracket[];
};

type SubsidyRule = {
	monthlyMax: number;
	monthlyLimit: number;
};

const UMA_DAILY_2025 = 113.14;
const UMA_DAILY_2026 = 117.31;
const UMA_MONTHLY_DAYS = 30.4;

const SUBSIDY_RULE_2025: SubsidyRule = {
	monthlyMax: 475,
	monthlyLimit: 10171,
};
const SUBSIDY_RULE_2026_JAN: SubsidyRule = {
	monthlyMax: 536.21,
	monthlyLimit: 11492.66,
};
const SUBSIDY_RULE_2026_FEB: SubsidyRule = {
	monthlyMax: 535.65,
	monthlyLimit: 11492.66,
};

const ISR_TABLES_2025: Record<PayrollPaymentFrequency, IsrTableRow[]> = {
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

const ISR_TABLES_2026: Record<PayrollPaymentFrequency, IsrTableRow[]> = {
	WEEKLY: [
		{ lower: 0.01, upper: 194.46, fixed: 0, rate: 1.92 },
		{ lower: 194.47, upper: 1650.67, fixed: 3.71, rate: 6.4 },
		{ lower: 1650.68, upper: 2900.87, fixed: 96.95, rate: 10.88 },
		{ lower: 2900.88, upper: 3372.11, fixed: 232.96, rate: 16 },
		{ lower: 3372.12, upper: 4037.32, fixed: 308.35, rate: 17.92 },
		{ lower: 4037.33, upper: 8142.75, fixed: 427.56, rate: 21.36 },
		{ lower: 8142.76, upper: 12834.08, fixed: 1304.45, rate: 23.52 },
		{ lower: 12834.09, upper: 24502.45, fixed: 2407.86, rate: 30 },
		{ lower: 24502.46, upper: 32669.91, fixed: 5908.35, rate: 32 },
		{ lower: 32669.92, upper: 98009.66, fixed: 8521.94, rate: 34 },
		{ lower: 98009.67, upper: null, fixed: 30737.49, rate: 35 },
	],
	BIWEEKLY: [
		{ lower: 0.01, upper: 416.7, fixed: 0, rate: 1.92 },
		{ lower: 416.71, upper: 3537.15, fixed: 7.95, rate: 6.4 },
		{ lower: 3537.16, upper: 6216.15, fixed: 207.75, rate: 10.88 },
		{ lower: 6216.16, upper: 7225.95, fixed: 499.2, rate: 16 },
		{ lower: 7225.96, upper: 8651.4, fixed: 660.75, rate: 17.92 },
		{ lower: 8651.41, upper: 17448.75, fixed: 916.2, rate: 21.36 },
		{ lower: 17448.76, upper: 27501.6, fixed: 2795.25, rate: 23.52 },
		{ lower: 27501.61, upper: 52505.25, fixed: 5159.7, rate: 30 },
		{ lower: 52505.26, upper: 70006.95, fixed: 12660.75, rate: 32 },
		{ lower: 70006.96, upper: 210020.7, fixed: 18261.3, rate: 34 },
		{ lower: 210020.71, upper: null, fixed: 65866.05, rate: 35 },
	],
	MONTHLY: [
		{ lower: 0.01, upper: 844.59, fixed: 0, rate: 1.92 },
		{ lower: 844.6, upper: 7168.51, fixed: 16.22, rate: 6.4 },
		{ lower: 7168.52, upper: 12598.02, fixed: 420.95, rate: 10.88 },
		{ lower: 12598.03, upper: 14644.64, fixed: 1011.68, rate: 16 },
		{ lower: 14644.65, upper: 17533.64, fixed: 1339.14, rate: 17.92 },
		{ lower: 17533.65, upper: 35362.83, fixed: 1856.84, rate: 21.36 },
		{ lower: 35362.84, upper: 55736.68, fixed: 5665.16, rate: 23.52 },
		{ lower: 55736.69, upper: 106410.5, fixed: 10457.09, rate: 30 },
		{ lower: 106410.51, upper: 141880.66, fixed: 25659.23, rate: 32 },
		{ lower: 141880.67, upper: 425641.99, fixed: 37009.69, rate: 34 },
		{ lower: 425642, upper: null, fixed: 133488.54, rate: 35 },
	],
};

const CV_RATE_TABLE_2025: CvRateTable = {
	minimumWageRate: 0.0315,
	umaBrackets: [
		{ upperUma: 1.5, rate: 0.03544 },
		{ upperUma: 2.0, rate: 0.04426 },
		{ upperUma: 2.5, rate: 0.04954 },
		{ upperUma: 3.0, rate: 0.05307 },
		{ upperUma: 3.5, rate: 0.05559 },
		{ upperUma: 4.0, rate: 0.05747 },
		{ upperUma: null, rate: 0.06422 },
	],
};

const CV_RATE_TABLE_2026: CvRateTable = {
	minimumWageRate: 0.0315,
	umaBrackets: [
		{ upperUma: 1.5, rate: 0.03676 },
		{ upperUma: 2.0, rate: 0.04851 },
		{ upperUma: 2.5, rate: 0.05556 },
		{ upperUma: 3.0, rate: 0.06026 },
		{ upperUma: 3.5, rate: 0.06361 },
		{ upperUma: 4.0, rate: 0.06613 },
		{ upperUma: null, rate: 0.07513 },
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

type UmaDependentTotals = {
	sbcPeriodRaw: number;
	excessOver3UmaPeriodRaw: number;
	emFixedEmployerRaw: number;
	cvEmployerRaw: number;
	subsidyPeriodRaw: number;
};

/**
 * Resolves the UMA daily amount for a date key.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @param overrideUmaDaily - Optional override UMA value for the entire period
 * @returns UMA daily value for the date
 */
export function resolveUmaDaily(dateKey: string, overrideUmaDaily?: number): number {
	if (overrideUmaDaily && overrideUmaDaily > 0) {
		return overrideUmaDaily;
	}
	return dateKey >= '2026-02-01' ? UMA_DAILY_2026 : UMA_DAILY_2025;
}

/**
 * Resolves the ISR table for a given frequency and effective date.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @param frequency - Payroll payment frequency
 * @returns ISR table rows for the effective year
 */
function resolveIsrTable(dateKey: string, frequency: PayrollPaymentFrequency): IsrTableRow[] {
	const tables = dateKey >= '2026-01-01' ? ISR_TABLES_2026 : ISR_TABLES_2025;
	return tables[frequency];
}

/**
 * Resolves subsidy parameters for a given date key.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Subsidy rule for the effective date
 */
function resolveSubsidyRule(dateKey: string): SubsidyRule {
	if (dateKey >= '2026-02-01') {
		return SUBSIDY_RULE_2026_FEB;
	}
	if (dateKey >= '2026-01-01') {
		return SUBSIDY_RULE_2026_JAN;
	}
	return SUBSIDY_RULE_2025;
}

/**
 * Resolves the CV rate table for a given date key.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns CV rate table for the effective year
 */
function resolveCvRateTable(dateKey: string): CvRateTable {
	return dateKey >= '2026-01-01' ? CV_RATE_TABLE_2026 : CV_RATE_TABLE_2025;
}

/**
 * Aggregates UMA-dependent totals across a period.
 *
 * @param args - Period and SBC inputs
 * @param args.periodStartDateKey - Period start date key (YYYY-MM-DD)
 * @param args.periodEndDateKey - Period end date key (YYYY-MM-DD)
 * @param args.sbcDaily - SBC daily amount (non-capped)
 * @param args.zone - Geographic minimum wage zone
 * @param args.umaDailyOverride - Optional fixed UMA daily override
 * @param args.excludeDateKeys - Optional set of date keys to skip from totals
 * @returns Aggregated UMA-dependent raw totals
 */
function buildUmaDependentTotals(args: {
	periodStartDateKey: string;
	periodEndDateKey: string;
	sbcDaily: number;
	zone: MinimumWageZone;
	umaDailyOverride?: number;
	excludeDateKeys?: Set<string>;
}): UmaDependentTotals {
	if (args.periodEndDateKey < args.periodStartDateKey) {
		return {
			sbcPeriodRaw: 0,
			excessOver3UmaPeriodRaw: 0,
			emFixedEmployerRaw: 0,
			cvEmployerRaw: 0,
			subsidyPeriodRaw: 0,
		};
	}

	let sbcPeriodRaw = 0;
	let excessOver3UmaPeriodRaw = 0;
	let emFixedEmployerRaw = 0;
	let cvEmployerRaw = 0;
	let subsidyPeriodRaw = 0;

	let cursor = args.periodStartDateKey;
	for (let i = 0; i < 400 && cursor <= args.periodEndDateKey; i += 1) {
		if (args.excludeDateKeys?.has(cursor)) {
			if (cursor === args.periodEndDateKey) {
				break;
			}
			cursor = addDaysToDateKey(cursor, 1);
			continue;
		}
		const umaDaily = resolveUmaDaily(cursor, args.umaDailyOverride);
		const minimumWageDaily = resolveMinimumWageDaily({
			dateKey: cursor,
			zone: args.zone,
		});
		const sbcDailyCapped = Math.min(args.sbcDaily, umaDaily * 25);
		sbcPeriodRaw += sbcDailyCapped;
		excessOver3UmaPeriodRaw += Math.max(0, sbcDailyCapped - umaDaily * 3);
		emFixedEmployerRaw += umaDaily * 0.204;

		const cvEmployerRate = getCvEmployerRate({
			sbcDaily: sbcDailyCapped,
			umaDaily,
			minimumWageDaily,
			rateTable: resolveCvRateTable(cursor),
		});
		cvEmployerRaw += sbcDailyCapped * cvEmployerRate;

		const subsidyRule = resolveSubsidyRule(cursor);
		subsidyPeriodRaw += subsidyRule.monthlyMax / UMA_MONTHLY_DAYS;

		if (cursor === args.periodEndDateKey) {
			break;
		}
		cursor = addDaysToDateKey(cursor, 1);
	}

	return {
		sbcPeriodRaw,
		excessOver3UmaPeriodRaw,
		emFixedEmployerRaw,
		cvEmployerRaw,
		subsidyPeriodRaw,
	};
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
	const {
		dailyPay,
		hireDate,
		sbcDailyOverride,
		aguinaldoDays,
		vacationPremiumRate,
		periodEndDateKey,
	} = args;
	if (sbcDailyOverride && sbcDailyOverride > 0) {
		return roundCurrency(sbcDailyOverride);
	}
	const completedYears = hireDate ? getCompletedYears(hireDate, periodEndDateKey) : 0;
	const vacationDays = getVacationDaysForYears(completedYears);
	const integrationFactor = getIntegrationFactor(
		aguinaldoDays,
		vacationDays,
		vacationPremiumRate,
	);
	return roundCurrency(dailyPay * integrationFactor);
}

/**
 * Resolves the employer CV rate based on SBC and minimum wage/UMA brackets.
 *
 * @param args - CV rate lookup inputs
 * @param args.sbcDaily - SBC daily amount
 * @param args.umaDaily - UMA daily amount
 * @param args.minimumWageDaily - Minimum wage daily amount for the zone
 * @param args.rateTable - CV rate table for the effective year
 * @returns Employer CV rate
 */
export function getCvEmployerRate(args: {
	sbcDaily: number;
	umaDaily: number;
	minimumWageDaily: number;
	rateTable: CvRateTable;
}): number {
	const { sbcDaily, umaDaily, minimumWageDaily, rateTable } = args;
	if (sbcDaily <= minimumWageDaily) {
		return rateTable.minimumWageRate;
	}
	const umaRatio = sbcDaily / umaDaily;
	for (const bracket of rateTable.umaBrackets) {
		if (bracket.upperUma === null || umaRatio <= bracket.upperUma) {
			return bracket.rate;
		}
	}
	return rateTable.minimumWageRate;
}

/**
 * Calculates ISR for a given base and frequency using the effective tables.
 *
 * @param isrBase - Taxable base for the period
 * @param frequency - Payroll payment frequency
 * @param dateKey - Effective date key (YYYY-MM-DD)
 * @returns ISR before subsidy
 */
export function calculateIsrFromTable(
	isrBase: number,
	frequency: PayrollPaymentFrequency,
	dateKey: string,
): number {
	if (isrBase <= 0) {
		return 0;
	}
	const table = resolveIsrTable(dateKey, frequency);
	const row =
		table.find(
			(entry) => isrBase >= entry.lower && (entry.upper === null || isrBase <= entry.upper),
		) ?? table[table.length - 1];
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
		umaDaily: umaDailyOverride,
		imssExemptDateKeys,
	} = input;
	const daysInPeriod = getInclusiveDayCount(periodStartDateKey, periodEndDateKey);
	const zone: MinimumWageZone = locationGeographicZone ?? 'GENERAL';
	const effectiveUmaDaily = resolveUmaDaily(periodEndDateKey, umaDailyOverride);
	const minimumWageDaily = resolveMinimumWageDaily({
		dateKey: periodEndDateKey,
		zone,
	});
	const minimumWageFiscalPayroll = roundCurrency(dailyPay) <= minimumWageDaily;

	const sbcDaily = getSbcDaily({
		dailyPay,
		hireDate,
		sbcDailyOverride,
		aguinaldoDays: settings.aguinaldoDays,
		vacationPremiumRate: settings.vacationPremiumRate,
		periodEndDateKey,
	});
	const umaDependentTotals = buildUmaDependentTotals({
		periodStartDateKey,
		periodEndDateKey,
		sbcDaily,
		zone,
		umaDailyOverride,
	});
	const imssExemptDateKeySet = new Set(imssExemptDateKeys ?? []);
	const umaDependentTotalsImss =
		imssExemptDateKeySet.size > 0
			? buildUmaDependentTotals({
					periodStartDateKey,
					periodEndDateKey,
					sbcDaily,
					zone,
					umaDailyOverride,
					excludeDateKeys: imssExemptDateKeySet,
				})
			: umaDependentTotals;
	const sbcPeriodTotal = umaDependentTotals.sbcPeriodRaw;
	const sbcPeriodImssBase = umaDependentTotalsImss.sbcPeriodRaw;

	const isrBase = roundCurrency(grossPay);
	const isrBeforeSubsidy = calculateIsrFromTable(isrBase, paymentFrequency, periodEndDateKey);
	const subsidyRule = resolveSubsidyRule(periodEndDateKey);
	const subsidyPeriod = roundCurrency(
		Math.min(subsidyRule.monthlyMax, umaDependentTotals.subsidyPeriodRaw),
	);
	const monthlyEquivalent = daysInPeriod > 0 ? (isrBase / daysInPeriod) * UMA_MONTHLY_DAYS : 0;
	const subsidyEligible = monthlyEquivalent <= subsidyRule.monthlyLimit;
	const subsidyApplied = subsidyEligible
		? roundCurrency(Math.min(isrBeforeSubsidy, subsidyPeriod))
		: 0;
	const isrWithheldCalculated = roundCurrency(Math.max(0, isrBeforeSubsidy - subsidyApplied));

	const excessOver3UmaPeriod = umaDependentTotalsImss.excessOver3UmaPeriodRaw;
	const emFixedEmployerRaw = umaDependentTotalsImss.emFixedEmployerRaw;
	const emExcessEmployerRaw = excessOver3UmaPeriod * 0.011;
	const emExcessEmployeeRaw = excessOver3UmaPeriod * 0.004;
	const pdEmployerRaw = sbcPeriodImssBase * 0.007;
	const pdEmployeeRaw = sbcPeriodImssBase * 0.0025;
	const gmpEmployerRaw = sbcPeriodImssBase * 0.0105;
	const gmpEmployeeRaw = sbcPeriodImssBase * 0.00375;
	const ivEmployerRaw = sbcPeriodImssBase * 0.0175;
	const ivEmployeeRaw = sbcPeriodImssBase * 0.00625;
	const cvEmployerRaw = umaDependentTotalsImss.cvEmployerRaw;
	const cvEmployeeRaw = sbcPeriodImssBase * 0.01125;
	const guarderiasRaw = sbcPeriodImssBase * 0.01;
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
	const sarRetiro = roundCurrency(sbcPeriodTotal * 0.02);
	const infonavit = roundCurrency(sbcPeriodTotal * 0.05);
	const riskWork = roundCurrency(sbcPeriodImssBase * settings.riskWorkRate);
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

	const absorbImssEmployeeShare =
		settings.absorbImssEmployeeShare || minimumWageFiscalPayroll;
	const minimumWageIsrExempt =
		minimumWageFiscalPayroll &&
		isrBase <= roundCurrency(minimumWageDaily * daysInPeriod);
	const withholdIsr = !settings.absorbIsr && !minimumWageIsrExempt;
	const absorbedImssEmployeeShare = absorbImssEmployeeShare ? imssEmployee.total : 0;
	const absorbedIsr = settings.absorbIsr && !minimumWageIsrExempt ? isrWithheldCalculated : 0;

	const imssEmployer: ImssEmployerBreakdown = absorbImssEmployeeShare
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
		imssEmployee: absorbImssEmployeeShare
			? {
					emExcess: 0,
					pd: 0,
					gmp: 0,
					iv: 0,
					cv: 0,
					total: 0,
				}
			: imssEmployee,
		isrWithheld: withholdIsr ? isrWithheldCalculated : 0,
		infonavitCredit: 0,
		total: sumMoney([
			absorbImssEmployeeShare ? 0 : imssEmployee.total,
			withholdIsr ? isrWithheldCalculated : 0,
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
			sbcPeriod: roundCurrency(sbcPeriodImssBase),
			isrBase,
			daysInPeriod,
			umaDaily: effectiveUmaDaily,
			minimumWageDaily,
		},
		employeeWithholdings,
		employerCosts,
		informationalLines,
		netPay,
		companyCost,
	};
}
