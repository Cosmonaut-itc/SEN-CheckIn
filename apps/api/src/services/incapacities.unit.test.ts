import { describe, expect, it } from 'bun:test';

import { addDaysToDateKey } from '../utils/date-key.js';
import type { IncapacityType, SatTipoIncapacidad } from '@sen-checkin/types';
import { calculateIncapacitySummary, type IncapacityRecordInput } from './incapacities.js';
import { resolveUmaDaily } from './mexico-payroll-taxes.js';

const SAT_TYPE_MAP: Record<IncapacityType, SatTipoIncapacidad> = {
	EG: '02',
	RT: '01',
	MAT: '03',
	LIC140BIS: '04',
};

/**
 * Builds an incapacity record input with defaults.
 *
 * @param overrides - Partial record overrides
 * @returns Incapacity record input
 */
function buildRecord(
	overrides: Partial<IncapacityRecordInput> & { type?: IncapacityType },
): IncapacityRecordInput {
	const type = overrides.type ?? 'EG';
	return {
		id: overrides.id ?? undefined,
		employeeId: overrides.employeeId ?? 'emp-1',
		caseId: overrides.caseId ?? 'CASE-1',
		type,
		satTipoIncapacidad: overrides.satTipoIncapacidad ?? SAT_TYPE_MAP[type],
		startDateKey: overrides.startDateKey ?? '2026-01-05',
		endDateKey: overrides.endDateKey ?? '2026-01-11',
		daysAuthorized: overrides.daysAuthorized ?? 7,
		percentOverride: overrides.percentOverride ?? null,
	};
}

/**
 * Builds a date key range from a start date.
 *
 * @param startDateKey - Start date key
 * @param days - Number of days in range
 * @returns End date key
 */
function endDateFromStart(startDateKey: string, days: number): string {
	return addDaysToDateKey(startDateKey, days - 1);
}

describe('incapacities service', () => {
	it('calculates EG subsidy starting on day 4 (case A)', () => {
		const result = calculateIncapacitySummary({
			periodStartDateKey: '2026-01-05',
			periodEndDateKey: '2026-01-11',
			sbcDaily: 500,
			incapacityRecords: [
				buildRecord({
					type: 'EG',
					caseId: 'EG-CASE-1',
					startDateKey: '2026-01-05',
					endDateKey: '2026-01-11',
					daysAuthorized: 7,
				}),
			],
		});

		expect(result.incapacitySummary.daysIncapacityTotal).toBe(7);
		expect(result.incapacitySummary.byType.EG.days).toBe(7);
		expect(result.incapacitySummary.byType.EG.subsidyDays).toBe(4);
		expect(result.incapacitySummary.byType.EG.expectedSubsidyAmount).toBe(1200);
		expect(result.imssExemptDateKeys).toHaveLength(7);
		expect(result.imssExemptDateKeys[0]).toBe('2026-01-05');
		expect(result.imssExemptDateKeys[6]).toBe('2026-01-11');
	});

	it('applies EG subsidy across periods using case day index (case B)', () => {
		const result = calculateIncapacitySummary({
			periodStartDateKey: '2026-01-05',
			periodEndDateKey: '2026-01-11',
			sbcDaily: 500,
			incapacityRecords: [
				buildRecord({
					type: 'EG',
					caseId: 'EG-CASE-2',
					startDateKey: '2026-01-01',
					endDateKey: '2026-01-07',
					daysAuthorized: 7,
				}),
			],
		});

		expect(result.incapacitySummary.daysIncapacityTotal).toBe(3);
		expect(result.incapacitySummary.byType.EG.days).toBe(3);
		expect(result.incapacitySummary.byType.EG.subsidyDays).toBe(3);
		expect(result.incapacitySummary.byType.EG.expectedSubsidyAmount).toBe(900);
	});

	it('calculates RT subsidy at 100% (case C)', () => {
		const result = calculateIncapacitySummary({
			periodStartDateKey: '2026-03-01',
			periodEndDateKey: '2026-03-10',
			sbcDaily: 600,
			incapacityRecords: [
				buildRecord({
					type: 'RT',
					caseId: 'RT-CASE-1',
					startDateKey: '2026-03-01',
					endDateKey: '2026-03-10',
					daysAuthorized: 10,
				}),
			],
		});

		expect(result.incapacitySummary.daysIncapacityTotal).toBe(10);
		expect(result.incapacitySummary.byType.RT.days).toBe(10);
		expect(result.incapacitySummary.byType.RT.subsidyDays).toBe(10);
		expect(result.incapacitySummary.byType.RT.expectedSubsidyAmount).toBe(6000);
	});

	it('calculates MAT subsidy across 84 days (case D)', () => {
		const startDateKey = '2026-01-01';
		const endDateKey = endDateFromStart(startDateKey, 84);

		const result = calculateIncapacitySummary({
			periodStartDateKey: startDateKey,
			periodEndDateKey: endDateKey,
			sbcDaily: 500,
			incapacityRecords: [
				buildRecord({
					type: 'MAT',
					caseId: 'MAT-CASE-1',
					startDateKey,
					endDateKey,
					daysAuthorized: 84,
				}),
			],
		});

		expect(result.incapacitySummary.daysIncapacityTotal).toBe(84);
		expect(result.incapacitySummary.byType.MAT.days).toBe(84);
		expect(result.incapacitySummary.byType.MAT.subsidyDays).toBe(84);
		expect(result.incapacitySummary.byType.MAT.expectedSubsidyAmount).toBe(42000);
	});

	it('deduplicates overlapping records and uses earliest case start', () => {
		const result = calculateIncapacitySummary({
			periodStartDateKey: '2026-01-04',
			periodEndDateKey: '2026-01-06',
			sbcDaily: 500,
			incapacityRecords: [
				buildRecord({
					type: 'EG',
					caseId: 'EG-CASE-3',
					startDateKey: '2026-01-01',
					endDateKey: '2026-01-03',
					daysAuthorized: 3,
				}),
				buildRecord({
					type: 'EG',
					caseId: 'EG-CASE-3',
					startDateKey: '2026-01-04',
					endDateKey: '2026-01-06',
					daysAuthorized: 3,
				}),
			],
		});

		expect(result.incapacitySummary.daysIncapacityTotal).toBe(3);
		expect(result.incapacitySummary.byType.EG.subsidyDays).toBe(3);
		expect(result.incapacitySummary.byType.EG.expectedSubsidyAmount).toBe(900);
	});

	it('caps SBC daily amount at UMA * 25 for subsidy calculations', () => {
		const dateKey = '2026-01-15';
		const umaDaily = resolveUmaDaily(dateKey);
		const expectedDailyCap = umaDaily * 25;

		const result = calculateIncapacitySummary({
			periodStartDateKey: dateKey,
			periodEndDateKey: dateKey,
			sbcDaily: 10000,
			incapacityRecords: [
				buildRecord({
					type: 'RT',
					caseId: 'RT-CASE-2',
					startDateKey: dateKey,
					endDateKey: dateKey,
					daysAuthorized: 1,
				}),
			],
		});

		const expected = Number((expectedDailyCap * 1).toFixed(2));
		expect(result.incapacitySummary.byType.RT.expectedSubsidyAmount).toBe(expected);
	});

	it('does not double count overlapping incapacity dates', () => {
		const result = calculateIncapacitySummary({
			periodStartDateKey: '2026-02-01',
			periodEndDateKey: '2026-02-04',
			sbcDaily: 500,
			incapacityRecords: [
				buildRecord({
					type: 'RT',
					caseId: 'RT-OVERLAP',
					startDateKey: '2026-02-01',
					endDateKey: '2026-02-03',
					daysAuthorized: 3,
				}),
				buildRecord({
					type: 'EG',
					caseId: 'EG-OVERLAP',
					startDateKey: '2026-02-02',
					endDateKey: '2026-02-04',
					daysAuthorized: 3,
				}),
			],
		});

		expect(result.incapacitySummary.daysIncapacityTotal).toBe(4);
		expect(result.incapacitySummary.byType.RT.days).toBe(3);
		expect(result.incapacitySummary.byType.EG.days).toBe(1);
		expect(result.imssExemptDateKeys).toEqual([
			'2026-02-01',
			'2026-02-02',
			'2026-02-03',
			'2026-02-04',
		]);
	});
});
