import type { EmploymentContractType, EmployeeTerminationSettlement, TerminationReason } from '@sen-checkin/types';

import { addDaysToDateKey, parseDateKey, toDateKeyUtc } from '../utils/date-key.js';
import { roundCurrency, sumMoney } from '../utils/money.js';
import { resolveMinimumWageDaily, type MinimumWageZone } from '../utils/minimum-wage.js';
import { getSbcDaily, getVacationDaysForYears } from './mexico-payroll-taxes.js';
import { calculateVacationAccrual, getServiceYearNumber } from './vacations.js';

const DAYS_IN_MONTH_LFT = 30;
const DAYS_IN_YEAR_FOR_INDEMNIZATION = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Input payload for calculating an employee termination settlement.
 */
export interface EmployeeTerminationCalculationInput {
	/** Employee identifier. */
	employeeId: string;
	/** Employee hire date. */
	hireDate: Date;
	/** Employee daily pay (salario diario). */
	dailyPay: number;
	/** Optional SBC daily override. */
	sbcDailyOverride?: number | null;
	/** Termination date key (YYYY-MM-DD). */
	terminationDateKey: string;
	/** Last day worked date key (YYYY-MM-DD). */
	lastDayWorkedDateKey: string;
	/** Termination reason. */
	terminationReason: TerminationReason;
	/** Employment contract type. */
	contractType: EmploymentContractType;
	/** Unpaid days to include in salary due. */
	unpaidDays: number;
	/** Additional due amounts. */
	otherDue: number;
	/** Optional vacation balance override (days, supports decimals). */
	vacationBalanceDays?: number | null;
	/** Approved vacation days used in the current service year. */
	vacationUsedDays: number;
	/** Optional daily salary override for indemnizations. */
	dailySalaryIndemnizacion?: number | null;
	/** Geographic zone for minimum wage calculations. */
	locationZone: MinimumWageZone;
	/** Aguinaldo days policy value. */
	aguinaldoDaysPolicy: number;
	/** Vacation premium policy rate. */
	vacationPremiumRatePolicy: number;
}

/**
 * Converts a date key into a UTC Date instance.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns UTC Date instance
 */
function toUtcDate(dateKey: string): Date {
	return new Date(`${dateKey}T00:00:00Z`);
}

/**
 * Calculates inclusive day span between date keys.
 *
 * @param startDateKey - Start date key (YYYY-MM-DD)
 * @param endDateKey - End date key (YYYY-MM-DD)
 * @returns Inclusive day count (>=0)
 */
function getInclusiveDayCount(startDateKey: string, endDateKey: string): number {
	if (endDateKey < startDateKey) {
		return 0;
	}
	const start = toUtcDate(startDateKey);
	const end = toUtcDate(endDateKey);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return 0;
	}
	const diffDays = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
	return Math.max(0, diffDays);
}

/**
 * Resolves the number of days in the calendar year for a date key.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Days in the year (365 or 366)
 */
function resolveYearDays(dateKey: string): number {
	const { year } = parseDateKey(dateKey);
	const leapCandidate = new Date(Date.UTC(year, 1, 29));
	return leapCandidate.getUTCMonth() === 1 ? 366 : 365;
}

/**
 * Resolves the date key for the start of the calendar year.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns YYYY-01-01 date key for the year
 */
function getYearStartDateKey(dateKey: string): string {
	const { year } = parseDateKey(dateKey);
	return `${year}-01-01`;
}

/**
 * Clamps a numeric value to a non-negative finite number.
 *
 * @param value - Value to clamp
 * @returns Clamped non-negative number
 */
function clampNonNegative(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}
	return Math.max(0, value);
}

/**
 * Builds the default vacation balance days using accrual and approved usage.
 *
 * @param args - Vacation accrual inputs
 * @param args.hireDate - Employee hire date
 * @param args.asOfDateKey - Accrual cutoff date key
 * @param args.usedDays - Approved vacation days used in the current service year
 * @returns Vacation balance days (supports decimals)
 */
function buildDefaultVacationBalanceDays(args: {
	hireDate: Date;
	asOfDateKey: string;
	usedDays: number;
}): number {
	const currentServiceYear = getServiceYearNumber(args.hireDate, args.asOfDateKey) ?? 0;
	const normalizedUsedDays = clampNonNegative(args.usedDays);

	if (currentServiceYear <= 0) {
		const hireDateKey = toDateKeyUtc(args.hireDate);
		const firstYearEndDateKey = addDaysToDateKey(
			toDateKeyUtc(
				new Date(
					Date.UTC(
						args.hireDate.getUTCFullYear() + 1,
						args.hireDate.getUTCMonth(),
						args.hireDate.getUTCDate(),
					),
				),
			),
			-1,
		);
		const daysInFirstYear = getInclusiveDayCount(hireDateKey, firstYearEndDateKey);
		const daysElapsed = getInclusiveDayCount(
			hireDateKey,
			args.asOfDateKey < hireDateKey ? hireDateKey : args.asOfDateKey,
		);
		const entitledDays = getVacationDaysForYears(1);
		const accruedDays =
			daysInFirstYear > 0 ? (entitledDays * daysElapsed) / daysInFirstYear : 0;
		return Math.max(0, accruedDays - normalizedUsedDays);
	}

	const accrual = calculateVacationAccrual({
		hireDate: args.hireDate,
		serviceYearNumber: currentServiceYear,
		asOfDateKey: args.asOfDateKey,
	});

	return Math.max(0, accrual.accruedDays - normalizedUsedDays);
}

/**
 * Determines if prima de antigüedad applies based on termination reason and tenure.
 *
 * @param reason - Termination reason
 * @param serviceYears - Years of service (decimal)
 * @returns True when prima de antigüedad should be paid
 */
function shouldPayPrimaAntiguedad(reason: TerminationReason, serviceYears: number): boolean {
	switch (reason) {
		case 'unjustified_dismissal':
		case 'justified_rescission':
		case 'death':
			return true;
		case 'voluntary_resignation':
			return serviceYears >= 15;
		default:
			return false;
	}
}

/**
 * Determines if indemnization components apply.
 *
 * @param reason - Termination reason
 * @returns True when indemnizations apply
 */
function shouldPayIndemnizacion(reason: TerminationReason): boolean {
	return reason === 'unjustified_dismissal';
}

/**
 * Calculates the termination settlement snapshot.
 *
 * @param input - Calculation inputs
 * @returns Auditable termination settlement payload
 */
export function calculateEmployeeTerminationSettlement(
	input: EmployeeTerminationCalculationInput,
): EmployeeTerminationSettlement {
	const dailySalaryBase = roundCurrency(clampNonNegative(input.dailyPay));
	const unpaidDays = clampNonNegative(input.unpaidDays);
	const otherDue = roundCurrency(clampNonNegative(input.otherDue));
	const aguinaldoDaysPolicy = clampNonNegative(input.aguinaldoDaysPolicy);
	const vacationPremiumRatePolicy = clampNonNegative(input.vacationPremiumRatePolicy);

	const dailySalaryIndemnizacion = roundCurrency(
		input.dailySalaryIndemnizacion && input.dailySalaryIndemnizacion > 0
			? input.dailySalaryIndemnizacion
			: getSbcDaily({
				dailyPay: dailySalaryBase,
				hireDate: input.hireDate,
				sbcDailyOverride: input.sbcDailyOverride ?? undefined,
				aguinaldoDays: aguinaldoDaysPolicy,
				vacationPremiumRate: vacationPremiumRatePolicy,
				periodEndDateKey: input.terminationDateKey,
			}),
	);

	const minimumWageDaily = resolveMinimumWageDaily({
		dateKey: input.terminationDateKey,
		zone: input.locationZone,
	});

	const vacationBalanceDays =
		input.vacationBalanceDays !== null && input.vacationBalanceDays !== undefined
			? Math.max(0, input.vacationBalanceDays)
			: buildDefaultVacationBalanceDays({
					hireDate: input.hireDate,
					asOfDateKey: input.terminationDateKey,
					usedDays: input.vacationUsedDays,
				});

	const salaryDue = roundCurrency(dailySalaryBase * unpaidDays);

	const aguinaldoStartDateKey = getYearStartDateKey(input.terminationDateKey);
	const hireDateKey = toDateKeyUtc(input.hireDate);
	const aguinaldoAccrualStart =
		hireDateKey > aguinaldoStartDateKey ? hireDateKey : aguinaldoStartDateKey;
	const aguinaldoDaysWorkedInYear = getInclusiveDayCount(
		aguinaldoAccrualStart,
		input.terminationDateKey,
	);
	const aguinaldoYearDays = resolveYearDays(input.terminationDateKey);
	const aguinaldoProp = roundCurrency(
		dailySalaryBase *
			aguinaldoDaysPolicy *
			(aguinaldoYearDays > 0 ? aguinaldoDaysWorkedInYear / aguinaldoYearDays : 0),
	);

	const vacationPay = roundCurrency(dailySalaryBase * vacationBalanceDays);
	const vacationPremium = roundCurrency(vacationPay * vacationPremiumRatePolicy);

	const finiquitoTotalGross = sumMoney([
		salaryDue,
		aguinaldoProp,
		vacationPay,
		vacationPremium,
		otherDue,
	]);

	const serviceDays = getInclusiveDayCount(hireDateKey, input.terminationDateKey);
	const serviceYears = serviceDays / DAYS_IN_YEAR_FOR_INDEMNIZATION;
	const serviceYearsForAntiguedad = serviceYears;
	const serviceYearsForIndemnizacion = serviceYears;

	const payIndemnizacion = shouldPayIndemnizacion(input.terminationReason);
	const payPrimaAntiguedad = shouldPayPrimaAntiguedad(
		input.terminationReason,
		serviceYearsForAntiguedad,
	);

	const indemnizacion3Meses = payIndemnizacion
		? roundCurrency(dailySalaryIndemnizacion * DAYS_IN_MONTH_LFT * 3)
		: 0;

	let indemnizacion20Dias = 0;
	if (payIndemnizacion) {
		if (input.contractType === 'indefinite') {
			indemnizacion20Dias = roundCurrency(
				dailySalaryIndemnizacion * 20 * serviceYearsForIndemnizacion,
			);
		} else {
			if (serviceYearsForIndemnizacion < 1) {
				indemnizacion20Dias = roundCurrency(
					dailySalaryIndemnizacion * (serviceDays / 2),
				);
			} else {
				indemnizacion20Dias = roundCurrency(
					dailySalaryIndemnizacion * (6 * DAYS_IN_MONTH_LFT) +
						dailySalaryIndemnizacion *
							20 *
							Math.max(0, serviceYearsForIndemnizacion - 1),
				);
			}
		}
	}

	const salaryBaseForAntiguedad = Math.min(
		Math.max(dailySalaryIndemnizacion, minimumWageDaily),
		minimumWageDaily * 2,
	);
	const primaAntiguedad = payPrimaAntiguedad
		? roundCurrency(12 * salaryBaseForAntiguedad * serviceYearsForAntiguedad)
		: 0;

	const liquidacionTotalGross = sumMoney([
		indemnizacion3Meses,
		indemnizacion20Dias,
		primaAntiguedad,
	]);

	const grossTotal = sumMoney([finiquitoTotalGross, liquidacionTotalGross]);

	return {
		employeeId: input.employeeId,
		termination: {
			terminationDateKey: input.terminationDateKey,
			lastDayWorkedDateKey: input.lastDayWorkedDateKey,
			terminationReason: input.terminationReason,
			contractType: input.contractType,
		},
		inputsUsed: {
			dailySalaryBase,
			dailySalaryIndemnizacion,
			minimumWageDaily,
			aguinaldoDaysPolicy,
			vacationPremiumRatePolicy,
			vacationBalanceDays,
			unpaidDays,
			otherDue,
			aguinaldoDaysWorkedInYear,
			aguinaldoYearDays,
			serviceDays,
			serviceYears,
			serviceYearsForAntiguedad,
			serviceYearsForIndemnizacion,
		},
		breakdown: {
			finiquito: {
				salaryDue,
				aguinaldoProp,
				vacationPay,
				vacationPremium,
				otherDue,
				totalGross: finiquitoTotalGross,
			},
			liquidacion: {
				indemnizacion3Meses,
				indemnizacion20Dias,
				primaAntiguedad,
				totalGross: liquidacionTotalGross,
			},
		},
		totals: {
			finiquitoTotalGross,
			liquidacionTotalGross,
			grossTotal,
		},
	};
}
