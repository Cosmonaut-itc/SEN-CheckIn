import type { IncapacityType, SatTipoIncapacidad } from '@sen-checkin/types';

import { addDaysToDateKey, parseDateKey } from '../utils/date-key.js';
import { roundCurrency } from '../utils/money.js';
import { resolveUmaDaily } from './mexico-payroll-taxes.js';

export type ImssSubsidyPaymentMode = 'direct' | 'indirect_reimbursement';

export interface IncapacityRecordInput {
	id?: string;
	employeeId: string;
	caseId: string;
	type: IncapacityType;
	satTipoIncapacidad: SatTipoIncapacidad;
	startDateKey: string;
	endDateKey: string;
	daysAuthorized: number;
	percentOverride?: number | null;
}

export interface IncapacityTypeSummary {
	days: number;
	subsidyDays: number;
	subsidyRate: number;
	expectedSubsidyAmount: number;
}

export interface IncapacitySummary {
	daysIncapacityTotal: number;
	byType: Record<IncapacityType, IncapacityTypeSummary>;
}

export interface IncapacitySubsidySummary {
	paymentMode: ImssSubsidyPaymentMode;
	expectedSubsidyAmount: number;
	informationalOnly: boolean;
}

export interface IncapacityCalculationResult {
	incapacitySummary: IncapacitySummary;
	imssExemptDateKeys: string[];
	imssSubsidy: IncapacitySubsidySummary;
}

const DEFAULT_SUBSIDY_RATES: Record<IncapacityType, number> = {
	EG: 0.6,
	RT: 1,
	MAT: 1,
	LIC140BIS: 0.6,
};

/**
 * Computes the case day index for a given date key.
 *
 * @param caseStartDateKey - Case start date key (YYYY-MM-DD)
 * @param dateKey - Date key to evaluate (YYYY-MM-DD)
 * @returns Case day index (1-based)
 */
function getCaseDayIndex(caseStartDateKey: string, dateKey: string): number {
	const start = new Date(`${caseStartDateKey}T00:00:00Z`);
	const current = new Date(`${dateKey}T00:00:00Z`);
	if (Number.isNaN(start.getTime()) || Number.isNaN(current.getTime())) {
		return 1;
	}
	const diff = Math.floor((current.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
	return diff + 1;
}

/**
 * Builds a list of date keys between start and end inclusive.
 *
 * @param startDateKey - Start date key (YYYY-MM-DD)
 * @param endDateKey - End date key (YYYY-MM-DD)
 * @returns Array of date keys in ascending order
 */
function buildDateKeyRange(startDateKey: string, endDateKey: string): string[] {
	if (endDateKey < startDateKey) {
		return [];
	}
	const dateKeys: string[] = [];
	let cursor = startDateKey;
	for (let i = 0; i < 400 && cursor <= endDateKey; i += 1) {
		dateKeys.push(cursor);
		if (cursor === endDateKey) {
			break;
		}
		cursor = addDaysToDateKey(cursor, 1);
	}
	return dateKeys;
}

/**
 * Resolves the subsidy rate for an incapacity record.
 *
 * @param type - Incapacity type
 * @param percentOverride - Optional override rate (0-1)
 * @returns Subsidy rate to apply
 */
function resolveSubsidyRate(type: IncapacityType, percentOverride?: number | null): number {
	if (typeof percentOverride === 'number' && percentOverride >= 0) {
		return percentOverride;
	}
	return DEFAULT_SUBSIDY_RATES[type];
}

/**
 * Builds a fresh incapacity summary by type object.
 *
 * @returns Initialized summary by type
 */
function buildEmptySummaryByType(): Record<IncapacityType, IncapacityTypeSummary> {
	return {
		EG: {
			days: 0,
			subsidyDays: 0,
			subsidyRate: DEFAULT_SUBSIDY_RATES.EG,
			expectedSubsidyAmount: 0,
		},
		RT: {
			days: 0,
			subsidyDays: 0,
			subsidyRate: DEFAULT_SUBSIDY_RATES.RT,
			expectedSubsidyAmount: 0,
		},
		MAT: {
			days: 0,
			subsidyDays: 0,
			subsidyRate: DEFAULT_SUBSIDY_RATES.MAT,
			expectedSubsidyAmount: 0,
		},
		LIC140BIS: {
			days: 0,
			subsidyDays: 0,
			subsidyRate: DEFAULT_SUBSIDY_RATES.LIC140BIS,
			expectedSubsidyAmount: 0,
		},
	};
}

/**
 * Calculates incapacity summary and IMSS subsidy expectations for a period.
 *
 * @param args - Period, SBC, and incapacity records
 * @returns Incapacity calculation result
 */
export function calculateIncapacitySummary(args: {
	periodStartDateKey: string;
	periodEndDateKey: string;
	sbcDaily: number;
	incapacityRecords: IncapacityRecordInput[];
	paymentMode?: ImssSubsidyPaymentMode;
}): IncapacityCalculationResult {
	const { periodStartDateKey, periodEndDateKey, sbcDaily, incapacityRecords, paymentMode } = args;
	const normalizedRecords = incapacityRecords
		.filter((record) => record.endDateKey >= periodStartDateKey)
		.filter((record) => record.startDateKey <= periodEndDateKey)
		.sort((a, b) =>
			a.startDateKey === b.startDateKey
				? a.type.localeCompare(b.type)
				: a.startDateKey.localeCompare(b.startDateKey),
		);

	const caseStartDateKeys = new Map<string, string>();
	for (const record of incapacityRecords) {
		const current = caseStartDateKeys.get(record.caseId);
		if (!current || record.startDateKey < current) {
			caseStartDateKeys.set(record.caseId, record.startDateKey);
		}
	}

	const coveredDateKeys = new Set<string>();
	const imssExemptDateKeys = new Set<string>();
	const byType = buildEmptySummaryByType();

	for (const record of normalizedRecords) {
		const overlapStart =
			record.startDateKey < periodStartDateKey ? periodStartDateKey : record.startDateKey;
		const overlapEnd =
			record.endDateKey > periodEndDateKey ? periodEndDateKey : record.endDateKey;
		if (overlapEnd < overlapStart) {
			continue;
		}

		const dateKeys = buildDateKeyRange(overlapStart, overlapEnd);
		const caseStartDateKey = caseStartDateKeys.get(record.caseId) ?? record.startDateKey;
		const subsidyRate = resolveSubsidyRate(record.type, record.percentOverride);

		for (const dateKey of dateKeys) {
			if (coveredDateKeys.has(dateKey)) {
				continue;
			}
			coveredDateKeys.add(dateKey);
			imssExemptDateKeys.add(dateKey);

			const summary = byType[record.type];
			summary.days += 1;
			summary.subsidyRate = subsidyRate;

			const caseDayIndex = getCaseDayIndex(caseStartDateKey, dateKey);
			const eligibleForSubsidy = record.type !== 'EG' || caseDayIndex >= 4;
			if (eligibleForSubsidy) {
				summary.subsidyDays += 1;
				const umaDaily = resolveUmaDaily(dateKey);
				const sbcDailyCapped = Math.min(sbcDaily, umaDaily * 25);
				summary.expectedSubsidyAmount += sbcDailyCapped * subsidyRate;
			}
		}
	}

	let expectedSubsidyAmount = 0;
	for (const key of Object.keys(byType) as IncapacityType[]) {
		const summary = byType[key];
		summary.expectedSubsidyAmount = roundCurrency(summary.expectedSubsidyAmount);
		expectedSubsidyAmount += summary.expectedSubsidyAmount;
	}

	const resolvedPaymentMode: ImssSubsidyPaymentMode = paymentMode ?? 'direct';

	return {
		incapacitySummary: {
			daysIncapacityTotal: coveredDateKeys.size,
			byType,
		},
		imssExemptDateKeys: Array.from(imssExemptDateKeys).sort((a, b) => a.localeCompare(b)),
		imssSubsidy: {
			paymentMode: resolvedPaymentMode,
			expectedSubsidyAmount: roundCurrency(expectedSubsidyAmount),
			informationalOnly: resolvedPaymentMode === 'direct',
		},
	};
}

/**
 * Validates that a date key is a real calendar date.
 *
 * @param dateKey - Date key to validate
 * @returns True when the date key is valid
 */
export function isValidDateKey(dateKey: string): boolean {
	try {
		parseDateKey(dateKey);
		return true;
	} catch {
		return false;
	}
}
