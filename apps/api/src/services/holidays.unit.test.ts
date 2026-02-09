import { describe, expect, it } from 'bun:test';

import type { PayrollCalculationRow } from './payroll-calculation.js';
import {
	mapProviderHolidayKind,
	mapProviderHolidayToEntry,
	resolveAnnualDateKey,
	resolvePayrollHolidayContext,
} from './holidays.js';

/**
 * Builds a minimal payroll row fixture for holiday context tests.
 *
 * @param overrides - Partial overrides
 * @returns Payroll calculation row fixture
 */
function buildPayrollRow(
	overrides: Partial<Pick<PayrollCalculationRow, 'employeeId' | 'mandatoryRestDayPremiumAmount' | 'mandatoryRestDayDateKeys'>>,
): PayrollCalculationRow {
	return {
		employeeId: overrides.employeeId ?? 'emp-1',
		mandatoryRestDayPremiumAmount: overrides.mandatoryRestDayPremiumAmount ?? 0,
		mandatoryRestDayDateKeys: overrides.mandatoryRestDayDateKeys ?? [],
	} as unknown as PayrollCalculationRow;
}

describe('holidays service unit', () => {
	it('maps provider holiday kind using subdivision/global metadata', () => {
		const nationalHoliday: Parameters<typeof mapProviderHolidayKind>[0] = {
			date: '2026-01-01',
			localName: 'Año Nuevo',
			name: 'New Year',
			countryCode: 'MX',
			fixed: true,
			global: true,
			counties: null,
			launchYear: null,
			types: ['Public'],
		};
		const localHoliday: Parameters<typeof mapProviderHolidayKind>[0] = {
			...nationalHoliday,
			date: '2026-03-01',
			localName: 'Día local',
			global: false,
			counties: ['MX-BCN'],
		};

		expect(mapProviderHolidayKind(nationalHoliday)).toBe('MANDATORY');
		expect(mapProviderHolidayKind(localHoliday)).toBe('OPTIONAL');
	});

	it('maps provider entries as pending approval with conflict reason', () => {
		const providerRow: Parameters<typeof mapProviderHolidayToEntry>[0]['row'] = {
			date: '2026-02-02',
			localName: 'Día de la Constitución',
			name: 'Constitution Day',
			countryCode: 'MX',
			fixed: false,
			global: true,
			counties: null,
			launchYear: null,
			types: ['Public'],
		};

		const mappedEntry = mapProviderHolidayToEntry({
			organizationId: 'org-1',
			runId: 'run-1',
			row: providerRow,
			internalMandatoryKeys: new Set(['2026-02-02']),
		});

		expect(mappedEntry.organizationId).toBe('org-1');
		expect(mappedEntry.source).toBe('PROVIDER');
		expect(mappedEntry.status).toBe('PENDING_APPROVAL');
		expect(mappedEntry.conflictReason).toContain('Conflicto con calendario interno');
	});

	it('resolves payroll holiday notice with employee impact and premium totals', async () => {
		const context = await resolvePayrollHolidayContext({
			organizationId: 'org-1',
			periodStartDateKey: '2026-02-01',
			periodEndDateKey: '2026-02-07',
			legacyAdditionalMandatoryRestDays: [],
			additionalMandatoryRestDays: ['2026-02-05'],
			employees: [
				buildPayrollRow({
					employeeId: 'emp-1',
					mandatoryRestDayPremiumAmount: 350,
					mandatoryRestDayDateKeys: ['2026-02-05'],
				}),
				buildPayrollRow({
					employeeId: 'emp-2',
					mandatoryRestDayPremiumAmount: 0,
					mandatoryRestDayDateKeys: [],
				}),
			],
		});

		expect(context.holidayNotices).toHaveLength(1);
		const notice = context.holidayNotices[0];
		expect(notice?.title).toBe('Aviso de feriado');
		expect(notice?.legalReference).toBe('LFT Art. 74/75');
		expect(notice?.affectedEmployees).toBe(1);
		expect(notice?.estimatedMandatoryPremiumTotal).toBe(350);
		expect(context.employeeHolidayImpactByEmployeeId['emp-1']).toEqual({
			affectedHolidayDateKeys: ['2026-02-05'],
			mandatoryPremiumAmount: 350,
		});
	});

	it('uses Art. 74 legal reference when there is no premium amount', async () => {
		const context = await resolvePayrollHolidayContext({
			organizationId: 'org-1',
			periodStartDateKey: '2026-12-25',
			periodEndDateKey: '2026-12-25',
			legacyAdditionalMandatoryRestDays: [],
			additionalMandatoryRestDays: ['2026-12-25'],
			employees: [
				buildPayrollRow({
					employeeId: 'emp-1',
					mandatoryRestDayPremiumAmount: 0,
					mandatoryRestDayDateKeys: [],
				}),
			],
		});

		expect(context.holidayNotices).toHaveLength(1);
		expect(context.holidayNotices[0]?.legalReference).toBe('LFT Art. 74');
	});

	it('resolves annual recurrence for leap-day holidays', () => {
		expect(resolveAnnualDateKey('02-29', 2024)).toBe('2024-02-29');
		expect(resolveAnnualDateKey('02-29', 2025)).toBe('2025-02-28');
	});
});
