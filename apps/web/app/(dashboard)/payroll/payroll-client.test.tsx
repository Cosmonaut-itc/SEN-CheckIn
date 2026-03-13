import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import rawMessages from '@/messages/es.json';
import { OrgProvider } from '@/lib/org-client-context';

import { PayrollPageClient } from './payroll-client';

const messages = (rawMessages as { default?: typeof rawMessages }).default ?? rawMessages;

const mockFetchPayrollSettings = vi.fn();
const mockCalculatePayroll = vi.fn();
const mockFetchPayrollRuns = vi.fn();

vi.mock('@/lib/client-functions', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/client-functions')>();
	return {
		...actual,
		fetchPayrollSettings: (...args: unknown[]) => mockFetchPayrollSettings(...args),
		calculatePayroll: (...args: unknown[]) => mockCalculatePayroll(...args),
		fetchPayrollRuns: (...args: unknown[]) => mockFetchPayrollRuns(...args),
	};
});

vi.mock('@/actions/payroll', () => ({
	processPayrollAction: vi.fn().mockResolvedValue({ success: true, data: null }),
}));

vi.mock('./payroll-run-receipts-dialog', () => ({
	PayrollRunReceiptsDialog: (): React.ReactElement => <div data-testid="receipts-dialog" />,
}));

vi.mock('./ptu-tab', () => ({
	PtuTab: (): React.ReactElement => <div data-testid="ptu-tab" />,
}));

vi.mock('./aguinaldo-tab', () => ({
	AguinaldoTab: (): React.ReactElement => <div data-testid="aguinaldo-tab" />,
}));

/**
 * Renders the payroll page with providers used in production.
 *
 * @param orgOverrides - Optional organization context overrides
 * @returns Render result
 */
function renderWithProviders(
	orgOverrides: Partial<React.ComponentProps<typeof OrgProvider>['value']> = {},
): ReturnType<typeof render> {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	});

	return render(
		<QueryClientProvider client={queryClient}>
			<OrgProvider
				value={{
					organizationId: 'org-1',
					organizationSlug: 'org-1',
					organizationName: 'Org Test',
					organizationRole: 'owner',
					...orgOverrides,
				}}
			>
				<NextIntlClientProvider locale="es" messages={messages}>
					<PayrollPageClient />
				</NextIntlClientProvider>
			</OrgProvider>
		</QueryClientProvider>,
	);
}

describe('PayrollPageClient', () => {
	beforeEach(() => {
		mockFetchPayrollSettings.mockReset();
		mockCalculatePayroll.mockReset();
		mockFetchPayrollRuns.mockReset();

		mockFetchPayrollSettings.mockResolvedValue({
			id: 'payroll-1',
			organizationId: 'org-1',
			weekStartDay: 1,
			timeZone: 'America/Mexico_City',
			overtimeEnforcement: 'WARN',
			additionalMandatoryRestDays: [],
			riskWorkRate: 0,
			statePayrollTaxRate: 0,
			absorbImssEmployeeShare: false,
			absorbIsr: false,
			aguinaldoDays: 15,
			vacationPremiumRate: 0.25,
			enableSeventhDayPay: false,
			enableDualPayroll: false,
			ptuEnabled: false,
			ptuMode: 'DEFAULT_RULES',
			ptuIsExempt: false,
			ptuExemptReason: null,
			employerType: 'PERSONA_MORAL',
			aguinaldoEnabled: true,
			enableDisciplinaryMeasures: true,
			autoDeductLunchBreak: true,
			lunchBreakMinutes: 60,
			lunchBreakThresholdHours: 6,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		});

		mockCalculatePayroll.mockResolvedValue({
			employees: [
				{
					employeeId: 'emp-1',
					name: 'María López',
					shiftType: 'DIURNA',
					dailyPay: 300,
					fiscalDailyPay: null,
					hourlyPay: 37.5,
					paymentFrequency: 'WEEKLY',
					seventhDayPay: 0,
					hoursWorked: 48,
					expectedHours: 48,
					normalHours: 48,
					overtimeDoubleHours: 0,
					overtimeTripleHours: 0,
					sundayHoursWorked: 0,
					mandatoryRestDaysWorkedCount: 0,
					mandatoryRestDayDateKeys: [],
					normalPay: 1800,
					overtimeDoublePay: 0,
					overtimeTriplePay: 0,
					sundayPremiumAmount: 0,
					mandatoryRestDayPremiumAmount: 0,
					vacationDaysPaid: 0,
					vacationPayAmount: 0,
					vacationPremiumAmount: 0,
					totalPay: 1740,
					grossPay: 1740,
					fiscalGrossPay: null,
					complementPay: null,
					totalRealPay: null,
					bases: {
						sbcDaily: 300,
						sbcPeriod: 2100,
						isrBase: 1740,
						daysInPeriod: 7,
						umaDaily: 113.14,
						minimumWageDaily: 278.8,
					},
					employeeWithholdings: {
						imssEmployee: {
							emExcess: 0,
							pd: 0,
							gmp: 0,
							iv: 0,
							cv: 0,
							total: 0,
						},
						isrWithheld: 0,
						infonavitCredit: 0,
						total: 0,
					},
					employerCosts: {
						imssEmployer: {
							emFixed: 0,
							emExcess: 0,
							pd: 0,
							gmp: 0,
							iv: 0,
							cv: 0,
							guarderias: 0,
							total: 0,
						},
						sarRetiro: 0,
						infonavit: 0,
						isn: 0,
						riskWork: 0,
						absorbedImssEmployeeShare: 0,
						absorbedIsr: 0,
						total: 0,
					},
					informationalLines: {
						isrBeforeSubsidy: 0,
						subsidyApplied: 0,
					},
					netPay: 1740,
					companyCost: 1740,
					incapacitySummary: {
						daysIncapacityTotal: 0,
						expectedImssSubsidyAmount: 0,
						byType: {
							EG: {
								days: 0,
								subsidyDays: 0,
								subsidyRate: 0,
								expectedSubsidyAmount: 0,
							},
							RT: {
								days: 0,
								subsidyDays: 0,
								subsidyRate: 0,
								expectedSubsidyAmount: 0,
							},
							MAT: {
								days: 0,
								subsidyDays: 0,
								subsidyRate: 0,
								expectedSubsidyAmount: 0,
							},
							LIC140BIS: {
								days: 0,
								subsidyDays: 0,
								subsidyRate: 0,
								expectedSubsidyAmount: 0,
							},
						},
					},
					warnings: [
						{
							type: 'LUNCH_BREAK_AUTO_DEDUCTED',
							message: 'Se descontaron 120 minutos de comida automáticamente.',
							severity: 'warning',
						},
					],
					lunchBreakAutoDeductedDays: 2,
					lunchBreakAutoDeductedMinutes: 120,
				},
			],
			totalAmount: 1740,
			taxSummary: {
				grossTotal: 1740,
				employeeWithholdingsTotal: 0,
				employerCostsTotal: 0,
				netPayTotal: 1740,
				companyCostTotal: 1740,
			},
			periodStartDateKey: '2026-03-09',
			periodEndDateKey: '2026-03-15',
			timeZone: 'America/Mexico_City',
			overtimeEnforcement: 'WARN',
			holidayNotices: [],
		});
		mockFetchPayrollRuns.mockResolvedValue([]);
	});

	it('shows lunch break deduction indicators in the payroll preview table', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByText('María López')).toBeInTheDocument();
		});

		expect(screen.getByText('preview.table.lunchBreakDeduction')).toBeInTheDocument();
		expect(screen.getByText('preview.lunchBreak.badge')).toBeInTheDocument();
		expect(screen.getByText('preview.lunchBreak.days')).toBeInTheDocument();
		expect(screen.getByText('preview.lunchBreak.minutes')).toBeInTheDocument();
	});

	it('shows dual payroll columns and footer totals for admins when enabled', async () => {
		mockFetchPayrollSettings.mockResolvedValueOnce({
			id: 'payroll-1',
			organizationId: 'org-1',
			weekStartDay: 1,
			timeZone: 'America/Mexico_City',
			overtimeEnforcement: 'WARN',
			additionalMandatoryRestDays: [],
			riskWorkRate: 0,
			statePayrollTaxRate: 0,
			absorbImssEmployeeShare: false,
			absorbIsr: false,
			aguinaldoDays: 15,
			vacationPremiumRate: 0.25,
			enableSeventhDayPay: false,
			enableDualPayroll: true,
			ptuEnabled: false,
			ptuMode: 'DEFAULT_RULES',
			ptuIsExempt: false,
			ptuExemptReason: null,
			employerType: 'PERSONA_MORAL',
			aguinaldoEnabled: true,
			enableDisciplinaryMeasures: true,
			autoDeductLunchBreak: true,
			lunchBreakMinutes: 60,
			lunchBreakThresholdHours: 6,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		});
		mockCalculatePayroll.mockResolvedValueOnce({
			employees: [
				{
					employeeId: 'emp-1',
					name: 'María López',
					shiftType: 'DIURNA',
					dailyPay: 300,
					fiscalDailyPay: 220,
					hourlyPay: 37.5,
					paymentFrequency: 'WEEKLY',
					seventhDayPay: 0,
					hoursWorked: 48,
					expectedHours: 48,
					normalHours: 48,
					overtimeDoubleHours: 0,
					overtimeTripleHours: 0,
					sundayHoursWorked: 0,
					mandatoryRestDaysWorkedCount: 0,
					mandatoryRestDayDateKeys: [],
					normalPay: 1800,
					overtimeDoublePay: 0,
					overtimeTriplePay: 0,
					sundayPremiumAmount: 0,
					mandatoryRestDayPremiumAmount: 0,
					vacationDaysPaid: 0,
					vacationPayAmount: 0,
					vacationPremiumAmount: 0,
					totalPay: 1740,
					grossPay: 1740,
					fiscalGrossPay: 1320,
					complementPay: 420,
					totalRealPay: 1740,
					bases: {
						sbcDaily: 220,
						sbcPeriod: 1540,
						isrBase: 1320,
						daysInPeriod: 7,
						umaDaily: 113.14,
						minimumWageDaily: 278.8,
					},
					employeeWithholdings: {
						imssEmployee: {
							emExcess: 0,
							pd: 0,
							gmp: 0,
							iv: 0,
							cv: 0,
							total: 0,
						},
						isrWithheld: 0,
						infonavitCredit: 0,
						total: 0,
					},
					employerCosts: {
						imssEmployer: {
							emFixed: 0,
							emExcess: 0,
							pd: 0,
							gmp: 0,
							iv: 0,
							cv: 0,
							guarderias: 0,
							total: 0,
						},
						sarRetiro: 0,
						infonavit: 0,
						isn: 0,
						riskWork: 0,
						absorbedImssEmployeeShare: 0,
						absorbedIsr: 0,
						total: 0,
					},
					informationalLines: {
						isrBeforeSubsidy: 0,
						subsidyApplied: 0,
					},
					netPay: 1740,
					companyCost: 1740,
					incapacitySummary: {
						daysIncapacityTotal: 0,
						expectedImssSubsidyAmount: 0,
						byType: {
							EG: { days: 0, subsidyDays: 0, subsidyRate: 0, expectedSubsidyAmount: 0 },
							RT: { days: 0, subsidyDays: 0, subsidyRate: 0, expectedSubsidyAmount: 0 },
							MAT: { days: 0, subsidyDays: 0, subsidyRate: 0, expectedSubsidyAmount: 0 },
							LIC140BIS: {
								days: 0,
								subsidyDays: 0,
								subsidyRate: 0,
								expectedSubsidyAmount: 0,
							},
						},
					},
					warnings: [],
					lunchBreakAutoDeductedDays: 0,
					lunchBreakAutoDeductedMinutes: 0,
				},
			],
			totalAmount: 1740,
			taxSummary: {
				grossTotal: 1740,
				employeeWithholdingsTotal: 0,
				employerCostsTotal: 0,
				netPayTotal: 1740,
				companyCostTotal: 1740,
			},
			periodStartDateKey: '2026-03-09',
			periodEndDateKey: '2026-03-15',
			timeZone: 'America/Mexico_City',
			overtimeEnforcement: 'WARN',
			holidayNotices: [],
		});

		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByText('preview.table.fiscalGrossPay')).toBeInTheDocument();
		});

		expect(screen.getByText('preview.table.complementPay')).toBeInTheDocument();
		expect(screen.getByText('preview.table.totalRealPay')).toBeInTheDocument();
		expect(screen.getByText('preview.footer.dualPayrollLabel')).toBeInTheDocument();
	});

	it('hides dual payroll columns for members even when enabled', async () => {
		mockFetchPayrollSettings.mockResolvedValueOnce({
			id: 'payroll-1',
			organizationId: 'org-1',
			weekStartDay: 1,
			timeZone: 'America/Mexico_City',
			overtimeEnforcement: 'WARN',
			additionalMandatoryRestDays: [],
			riskWorkRate: 0,
			statePayrollTaxRate: 0,
			absorbImssEmployeeShare: false,
			absorbIsr: false,
			aguinaldoDays: 15,
			vacationPremiumRate: 0.25,
			enableSeventhDayPay: false,
			enableDualPayroll: true,
			ptuEnabled: false,
			ptuMode: 'DEFAULT_RULES',
			ptuIsExempt: false,
			ptuExemptReason: null,
			employerType: 'PERSONA_MORAL',
			aguinaldoEnabled: true,
			enableDisciplinaryMeasures: true,
			autoDeductLunchBreak: true,
			lunchBreakMinutes: 60,
			lunchBreakThresholdHours: 6,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		});

		renderWithProviders({ organizationRole: 'member', userRole: 'member' });

		await waitFor(() => {
			expect(screen.getByText('María López')).toBeInTheDocument();
		});

		expect(screen.queryByText('preview.table.fiscalGrossPay')).not.toBeInTheDocument();
		expect(screen.queryByText('preview.table.complementPay')).not.toBeInTheDocument();
		expect(screen.queryByText('preview.table.totalRealPay')).not.toBeInTheDocument();
	});
});
