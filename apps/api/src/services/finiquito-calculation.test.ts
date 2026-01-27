import { describe, expect, it } from 'bun:test';

import { roundCurrency, sumMoney } from '../utils/money.js';
import { calculateEmployeeTerminationSettlement } from './finiquito-calculation.js';

const BASE_INPUT = {
	employeeId: 'emp-test',
	hireDate: new Date('2024-01-01T00:00:00Z'),
	dailyPay: 500,
	sbcDailyOverride: 600,
	terminationDateKey: '2026-01-15',
	lastDayWorkedDateKey: '2026-01-15',
	terminationReason: 'voluntary_resignation' as const,
	contractType: 'indefinite' as const,
	unpaidDays: 2,
	otherDue: 100,
	vacationBalanceDays: 5,
	vacationUsedDays: 0,
	dailySalaryIndemnizacion: 600,
	locationZone: 'GENERAL' as const,
	aguinaldoDaysPolicy: 15,
	vacationPremiumRatePolicy: 0.25,
};

const TERMINATION_REASONS = [
	'voluntary_resignation',
	'justified_rescission',
	'unjustified_dismissal',
	'end_of_contract',
	'mutual_agreement',
	'death',
] as const;

const LONG_TENURE_INPUT = {
	...BASE_INPUT,
	hireDate: new Date('2005-01-01T00:00:00Z'),
	terminationDateKey: '2026-01-15',
	lastDayWorkedDateKey: '2026-01-15',
};

describe('finiquito calculation', () => {
	it('calculates finiquito-only amounts for voluntary resignation', () => {
		const result = calculateEmployeeTerminationSettlement(BASE_INPUT);

		expect(result.breakdown.finiquito.salaryDue).toBe(1000);
		expect(result.breakdown.finiquito.aguinaldoProp).toBe(308.22);
		expect(result.breakdown.finiquito.vacationPay).toBe(2500);
		expect(result.breakdown.finiquito.vacationPremium).toBe(625);
		expect(result.breakdown.finiquito.otherDue).toBe(100);
		expect(result.totals.finiquitoTotalGross).toBe(4533.22);
		expect(result.totals.liquidacionTotalGross).toBe(0);
		expect(result.totals.grossTotal).toBe(4533.22);
	});

	it('calculates indemnizations for unjustified dismissal on indefinite contracts', () => {
		const result = calculateEmployeeTerminationSettlement({
			...BASE_INPUT,
			terminationReason: 'unjustified_dismissal',
		});

		const expected3Meses = roundCurrency(result.inputsUsed.dailySalaryIndemnizacion * 90);
		expect(result.breakdown.liquidacion.indemnizacion3Meses).toBe(expected3Meses);

		const expected20Dias = roundCurrency(
			result.inputsUsed.dailySalaryIndemnizacion *
				20 *
				result.inputsUsed.serviceYearsForIndemnizacion,
		);
		expect(result.breakdown.liquidacion.indemnizacion20Dias).toBe(expected20Dias);

		const expectedPrima = roundCurrency(
			12 *
				Math.min(
					Math.max(
						result.inputsUsed.dailySalaryIndemnizacion,
						result.inputsUsed.minimumWageDaily,
					),
					result.inputsUsed.minimumWageDaily * 2,
				) *
				result.inputsUsed.serviceYearsForAntiguedad,
		);
		expect(result.breakdown.liquidacion.primaAntiguedad).toBe(expectedPrima);

		const expectedLiquidacionTotal = sumMoney([
			result.breakdown.liquidacion.indemnizacion3Meses,
			result.breakdown.liquidacion.indemnizacion20Dias,
			result.breakdown.liquidacion.primaAntiguedad,
		]);
		expect(result.breakdown.liquidacion.totalGross).toBe(expectedLiquidacionTotal);
	});

	it('applies prima de antiguedad on voluntary resignation after 15 years', () => {
		const result = calculateEmployeeTerminationSettlement({
			...BASE_INPUT,
			hireDate: new Date('2009-01-01T00:00:00Z'),
			terminationDateKey: '2026-01-01',
			lastDayWorkedDateKey: '2026-01-01',
			terminationReason: 'voluntary_resignation',
			dailySalaryIndemnizacion: 500,
		});

		expect(result.inputsUsed.serviceYearsForAntiguedad).toBeGreaterThanOrEqual(15);
		expect(result.breakdown.liquidacion.primaAntiguedad).toBeGreaterThan(0);
		expect(result.breakdown.liquidacion.indemnizacion3Meses).toBe(0);
		expect(result.breakdown.liquidacion.indemnizacion20Dias).toBe(0);
	});

	it('covers all termination reasons for indemnizacion and prima', () => {
		for (const reason of TERMINATION_REASONS) {
			const result = calculateEmployeeTerminationSettlement({
				...LONG_TENURE_INPUT,
				terminationReason: reason,
			});

			if (reason === 'unjustified_dismissal') {
				expect(result.breakdown.liquidacion.indemnizacion3Meses).toBeGreaterThan(0);
				expect(result.breakdown.liquidacion.indemnizacion20Dias).toBeGreaterThan(0);
			} else {
				expect(result.breakdown.liquidacion.indemnizacion3Meses).toBe(0);
				expect(result.breakdown.liquidacion.indemnizacion20Dias).toBe(0);
			}

			if (
				reason === 'unjustified_dismissal' ||
				reason === 'justified_rescission' ||
				reason === 'death' ||
				reason === 'voluntary_resignation'
			) {
				expect(result.breakdown.liquidacion.primaAntiguedad).toBeGreaterThan(0);
			} else {
				expect(result.breakdown.liquidacion.primaAntiguedad).toBe(0);
			}
		}
	});

	it('calculates indemnizacion20Dias for fixed-term contracts under one year', () => {
		const result = calculateEmployeeTerminationSettlement({
			...BASE_INPUT,
			hireDate: new Date('2025-09-01T00:00:00Z'),
			terminationDateKey: '2026-01-15',
			lastDayWorkedDateKey: '2026-01-15',
			terminationReason: 'unjustified_dismissal',
			contractType: 'fixed_term',
			dailySalaryIndemnizacion: 500,
		});

		expect(result.inputsUsed.serviceYearsForIndemnizacion).toBeLessThan(1);
		const expected20Dias = roundCurrency(
			result.inputsUsed.dailySalaryIndemnizacion * (result.inputsUsed.serviceDays / 2),
		);
		expect(result.breakdown.liquidacion.indemnizacion20Dias).toBe(expected20Dias);
	});

	it('calculates indemnizacion20Dias for specific-work contracts after one year', () => {
		const result = calculateEmployeeTerminationSettlement({
			...BASE_INPUT,
			hireDate: new Date('2023-01-01T00:00:00Z'),
			terminationDateKey: '2026-01-15',
			lastDayWorkedDateKey: '2026-01-15',
			terminationReason: 'unjustified_dismissal',
			contractType: 'specific_work',
			dailySalaryIndemnizacion: 500,
		});

		expect(result.inputsUsed.serviceYearsForIndemnizacion).toBeGreaterThanOrEqual(1);
		const expected20Dias = roundCurrency(
			result.inputsUsed.dailySalaryIndemnizacion * (6 * 30) +
				result.inputsUsed.dailySalaryIndemnizacion *
					20 *
					Math.max(0, result.inputsUsed.serviceYearsForIndemnizacion - 1),
		);
		expect(result.breakdown.liquidacion.indemnizacion20Dias).toBe(expected20Dias);
	});

	it('uses last day worked when earlier than termination date for service days', () => {
		const result = calculateEmployeeTerminationSettlement({
			...BASE_INPUT,
			terminationDateKey: '2026-01-15',
			lastDayWorkedDateKey: '2026-01-10',
		});

		const startMs = Date.parse('2024-01-01T00:00:00Z');
		const endMs = Date.parse('2026-01-10T00:00:00Z');
		const expectedServiceDays = Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
		expect(result.inputsUsed.serviceDays).toBe(expectedServiceDays);
	});
});
