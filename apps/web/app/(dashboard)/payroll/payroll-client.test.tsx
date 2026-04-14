import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const mockUseTour = vi.fn();
const mockTourRestartById = new Map<string, ReturnType<typeof vi.fn>>();

vi.mock('@/lib/client-functions', () => ({
	fetchPayrollSettings: (...args: unknown[]) => mockFetchPayrollSettings(...args),
	calculatePayroll: (...args: unknown[]) => mockCalculatePayroll(...args),
	fetchPayrollRuns: (...args: unknown[]) => mockFetchPayrollRuns(...args),
}));

vi.mock('@/hooks/use-tour', () => ({
	useTour: (...args: unknown[]) => mockUseTour(...args),
}));

vi.mock('@/components/tour-help-button', () => ({
	TourHelpButton: ({ tourId }: { tourId: string }): React.ReactElement => (
		<button
			type="button"
			data-testid="tour-help-button"
			onClick={() => mockTourRestartById.get(tourId)?.()}
		>
			{tourId}
		</button>
	),
}));

vi.mock('@/components/ui/tabs', () => {
	const TabsContext = React.createContext<{
		value: string;
		onValueChange?: (value: string) => void;
	} | null>(null);

	return {
		Tabs: ({
			value,
			onValueChange,
			className,
			children,
		}: {
			value: string;
			onValueChange?: (value: string) => void;
			className?: string;
			children: React.ReactNode;
		}): React.ReactElement => (
			<TabsContext.Provider value={{ value, onValueChange }}>
				<div className={className}>{children}</div>
			</TabsContext.Provider>
		),
		TabsList: ({
			children,
			...props
		}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement => (
			<div role="tablist" {...props}>
				{children}
			</div>
		),
		TabsTrigger: ({
			value,
			disabled,
			children,
			...props
		}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
			value: string;
		}): React.ReactElement => {
			const contextValue = React.useContext(TabsContext);
			const isSelected = contextValue?.value === value;

			return (
				<button
					type="button"
					role="tab"
					aria-selected={isSelected}
					data-state={isSelected ? 'active' : 'inactive'}
					disabled={disabled}
					onClick={() => {
						if (!disabled) {
							contextValue?.onValueChange?.(value);
						}
					}}
					{...props}
				>
					{children}
				</button>
			);
		},
		TabsContent: ({
			value,
			children,
			...props
		}: React.HTMLAttributes<HTMLDivElement> & {
			value: string;
		}): React.ReactElement | null => {
			const contextValue = React.useContext(TabsContext);

			if (contextValue?.value !== value) {
				return null;
			}

			return <div {...props}>{children}</div>;
		},
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
		mockUseTour.mockReset();
		mockTourRestartById.clear();

		mockUseTour.mockImplementation((tourId: string) => {
			const restartTour = mockTourRestartById.get(tourId) ?? vi.fn();

			mockTourRestartById.set(tourId, restartTour);

			return {
				restartTour,
				isTourRunning: false,
			};
		});

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

	it('uses the contextual tour and help button for the active tab', async () => {
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
			enableDualPayroll: false,
			ptuEnabled: true,
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

		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByTestId('tour-help-button')).toHaveTextContent('payroll');
		});

		expect(mockUseTour.mock.calls).toEqual(
			expect.arrayContaining([
				['payroll', true],
				['payroll-ptu', false],
				['payroll-aguinaldo', false],
			]),
		);
		expect(screen.getByTestId('payroll-tab-payroll')).toHaveAttribute('aria-selected', 'true');

		await waitFor(() => {
			expect(screen.getByTestId('payroll-tab-ptu')).not.toBeDisabled();
		});

		fireEvent.click(screen.getByTestId('payroll-tab-ptu'));

		await waitFor(() => {
			expect(screen.getByTestId('tour-help-button')).toHaveTextContent('payroll-ptu');
		});

		expect(mockUseTour.mock.calls).toEqual(
			expect.arrayContaining([
				['payroll', false],
				['payroll-ptu', true],
				['payroll-aguinaldo', false],
			]),
		);
		expect(screen.getByTestId('payroll-tab-ptu')).toHaveAttribute('aria-selected', 'true');

		await waitFor(() => {
			expect(screen.getByTestId('payroll-tab-aguinaldo')).not.toBeDisabled();
		});

		fireEvent.click(screen.getByTestId('payroll-tab-aguinaldo'));

		await waitFor(() => {
			expect(screen.getByTestId('tour-help-button')).toHaveTextContent(
				'payroll-aguinaldo',
			);
		});

		expect(mockUseTour.mock.calls).toEqual(
			expect.arrayContaining([
				['payroll', false],
				['payroll-ptu', false],
				['payroll-aguinaldo', true],
			]),
		);
		expect(screen.getByTestId('payroll-tab-aguinaldo')).toHaveAttribute(
			'aria-selected',
			'true',
		);
	});

	it('keeps the payroll tour active when PTU is disabled in settings', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByTestId('tour-help-button')).toHaveTextContent('payroll');
		});

		expect(screen.getByTestId('payroll-tab-ptu')).toBeDisabled();
		expect(mockUseTour.mock.calls).toEqual(
			expect.arrayContaining([
				['payroll', true],
				['payroll-ptu', false],
				['payroll-aguinaldo', false],
			]),
		);
	});

	it('replays the payroll tour from the help button when aguinaldo is disabled', async () => {
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
			enableDualPayroll: false,
			ptuEnabled: true,
			ptuMode: 'DEFAULT_RULES',
			ptuIsExempt: false,
			ptuExemptReason: null,
			employerType: 'PERSONA_MORAL',
			aguinaldoEnabled: false,
			enableDisciplinaryMeasures: true,
			autoDeductLunchBreak: true,
			lunchBreakMinutes: 60,
			lunchBreakThresholdHours: 6,
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
			updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		});

		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByTestId('tour-help-button')).toHaveTextContent('payroll');
		});

		expect(screen.getByTestId('payroll-tab-aguinaldo')).toBeDisabled();

		fireEvent.click(screen.getByTestId('tour-help-button'));

		expect(mockTourRestartById.get('payroll')).toHaveBeenCalledTimes(1);
		expect(mockTourRestartById.get('payroll-ptu')).not.toHaveBeenCalled();
		expect(mockTourRestartById.get('payroll-aguinaldo')).not.toHaveBeenCalled();
	});

	it('keeps horizontal overflow inside the payroll preview table container', async () => {
		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByText('María López')).toBeInTheDocument();
		});

		expect(screen.getByTestId('payroll-page-root')).toHaveClass('overflow-x-hidden');
		expect(screen.getByTestId('payroll-preview-table-container')).toHaveClass(
			'overflow-x-auto',
		);
		expect(screen.getByTestId('payroll-preview-table-container')).toHaveClass('max-w-full');
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

	it('falls back to regular gross pay in footer totals when dual payroll is mixed', async () => {
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
				{
					employeeId: 'emp-2',
					name: 'Juan Pérez',
					shiftType: 'DIURNA',
					dailyPay: 180,
					fiscalDailyPay: null,
					hourlyPay: 22.5,
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
					normalPay: 1080,
					overtimeDoublePay: 0,
					overtimeTriplePay: 0,
					sundayPremiumAmount: 0,
					mandatoryRestDayPremiumAmount: 0,
					vacationDaysPaid: 0,
					vacationPayAmount: 0,
					vacationPremiumAmount: 0,
					totalPay: 1080,
					grossPay: 1080,
					fiscalGrossPay: null,
					complementPay: null,
					totalRealPay: null,
					bases: {
						sbcDaily: 180,
						sbcPeriod: 1260,
						isrBase: 1080,
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
					netPay: 1080,
					companyCost: 1080,
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
			totalAmount: 2820,
			taxSummary: {
				grossTotal: 2820,
				employeeWithholdingsTotal: 0,
				employerCostsTotal: 0,
				netPayTotal: 2820,
				companyCostTotal: 2820,
			},
			periodStartDateKey: '2026-03-09',
			periodEndDateKey: '2026-03-15',
			timeZone: 'America/Mexico_City',
			overtimeEnforcement: 'WARN',
			holidayNotices: [],
		});

		renderWithProviders();

		await waitFor(() => {
			expect(screen.getByText('preview.footer.dualPayrollLabel')).toBeInTheDocument();
		});

		expect(screen.getByText('$2,400.00')).toBeInTheDocument();
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
