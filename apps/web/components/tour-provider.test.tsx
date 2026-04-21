import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import rawMessages from '@/messages/es.json';
import { OrgProvider } from '@/lib/org-client-context';
import { PayrollPageClient } from '@/app/(dashboard)/payroll/payroll-client';

const mockFetchTourProgress = vi.fn();
const mockCompleteTour = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockFetchPayrollSettings = vi.fn();
const mockCalculatePayroll = vi.fn();
const mockFetchPayrollRuns = vi.fn();
const joyrideState = {
	props: null as Record<string, unknown> | null,
};
const authSessionState = {
	value: {
		data: {
			user: {
				id: 'user-1',
			},
			session: {
				activeOrganizationId: 'org-1',
			},
		},
		isPending: false,
	},
};

/**
 * Stores the latest Joyride props exposed by the mock implementation.
 *
 * @param props - Joyride props snapshot
 * @returns Void
 */
function setJoyrideProps(props: Record<string, unknown>): void {
	joyrideState.props = props;
}

vi.mock('@/lib/tour-client-functions', () => ({
	fetchTourProgress: (...args: unknown[]) => mockFetchTourProgress(...args),
	completeTour: (...args: unknown[]) => mockCompleteTour(...args),
}));

vi.mock('@/lib/auth-client', () => ({
	useSession: () => authSessionState.value,
}));

vi.mock('@/lib/client-functions', () => ({
	fetchPayrollSettings: (...args: unknown[]) => mockFetchPayrollSettings(...args),
	calculatePayroll: (...args: unknown[]) => mockCalculatePayroll(...args),
	fetchPayrollRuns: (...args: unknown[]) => mockFetchPayrollRuns(...args),
}));

vi.mock('sonner', () => ({
	toast: {
		error: (...args: unknown[]) => mockToastError(...args),
		success: (...args: unknown[]) => mockToastSuccess(...args),
	},
}));

vi.mock('@/components/tour-help-button', async () => {
	const actual =
		await vi.importActual<typeof import('@/components/tour-provider')>(
			'@/components/tour-provider',
		);

	return {
		TourHelpButton: ({ tourId }: { tourId: string }): React.ReactElement => {
			const { startTour } = actual.useTourContext();

			return (
				<button
					type="button"
					data-testid="tour-help-button"
					onClick={() => startTour(tourId)}
				>
					{tourId}
				</button>
			);
		},
	};
});

vi.mock('@/actions/payroll', () => ({
	processPayrollAction: vi.fn().mockResolvedValue({ success: true, data: null }),
}));

vi.mock('react-joyride', () => {
	const Joyride = (props: Record<string, unknown>) => {
		setJoyrideProps(props);
		return <div data-testid="joyride-mock" />;
	};

	return {
		__esModule: true,
		Joyride,
		ACTIONS: {
			CLOSE: 'close',
			NEXT: 'next',
			PREV: 'prev',
			SKIP: 'skip',
		},
		EVENTS: {
			STEP_AFTER: 'step:after',
			TARGET_NOT_FOUND: 'target:not-found',
			TOUR_END: 'tour:end',
		},
		STATUS: {
			FINISHED: 'finished',
			RUNNING: 'running',
			SKIPPED: 'skipped',
		},
	};
});

import { TourProvider, useTourContext } from './tour-provider';
import { useTour } from '@/hooks/use-tour';

const payrollMessages = (rawMessages as { default?: typeof rawMessages }).default ?? rawMessages;

const messages = {
	Tours: {
		skipConfirmTitle: 'Omitir tutorial?',
		skipConfirmMessage: 'Puedes repetirlo desde el botón de ayuda (?) en cualquier momento.',
		skipConfirmButton: 'Sí, omitir',
		skipCancelButton: 'Continuar tutorial',
		completedMessage: 'Tutorial completado! Puedes repetirlo desde el botón de ayuda.',
		saveErrorMessage: 'No se pudo guardar el progreso del tutorial.',
		helpButtonTooltip: 'Repetir tutorial de esta sección',
		progressLabel: 'Paso {current} de {total}',
		nextButton: 'Siguiente',
		prevButton: 'Anterior',
		skipButton: 'Omitir tutorial',
		dashboard: {
			step1: 'Paso 1',
			step2: 'Paso 2',
			step3: 'Paso 3',
		},
	},
};

/**
 * Renders tour providers with a fresh query client.
 *
 * @param children - React subtree under test
 * @returns Testing library render result
 */
function renderWithProviders(children: React.ReactNode) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	return {
		queryClient,
		...render(
			<QueryClientProvider client={queryClient}>
				<NextIntlClientProvider locale="es" messages={messages}>
					<TourProvider>{children}</TourProvider>
				</NextIntlClientProvider>
			</QueryClientProvider>,
		),
	};
}

/**
 * Renders the payroll page with the production providers used by the guided tour.
 *
 * @param children - React subtree under test
 * @returns Testing library render result
 */
function renderPayrollWithProviders(children: React.ReactNode) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	return {
		queryClient,
		...render(
			<QueryClientProvider client={queryClient}>
				<OrgProvider
					value={{
						organizationId: 'org-1',
						organizationSlug: 'org-1',
						organizationName: 'Org Test',
						organizationRole: 'owner',
					}}
				>
					<NextIntlClientProvider locale="es" messages={payrollMessages}>
						<TourProvider>{children}</TourProvider>
					</NextIntlClientProvider>
				</OrgProvider>
			</QueryClientProvider>,
		),
	};
}

/**
 * Consumer component used to exercise the tour context API.
 *
 * @returns Probe element
 */
function TourContextProbe(): React.ReactElement {
	const { activeTourId, isRunning, startTour } = useTourContext();

	return (
		<div>
			<div data-testid="tour-state">
				{String(isRunning)}::{activeTourId ?? 'none'}
			</div>
			<button type="button" onClick={() => startTour('dashboard')}>
				Iniciar tour
			</button>
		</div>
	);
}

/**
 * Consumer component used to exercise the useTour hook.
 *
 * @returns Probe element
 */
function UseTourProbe(): React.ReactElement {
	const { restartTour, isTourRunning } = useTour('dashboard');

	return (
		<div>
			<div data-testid="use-tour-state">{String(isTourRunning)}</div>
			<button type="button" onClick={restartTour}>
				Reiniciar
			</button>
		</div>
	);
}

/**
 * Consumer component used to start the payroll guided tour.
 *
 * @returns Probe element
 */
function PayrollTourProbe(): React.ReactElement {
	const { startTour } = useTourContext();

	return (
		<button type="button" onClick={() => startTour('payroll')}>
			Iniciar tour payroll
		</button>
	);
}

describe('TourProvider', () => {
	beforeEach(() => {
		mockFetchTourProgress.mockReset();
		mockCompleteTour.mockReset();
		mockToastError.mockReset();
		mockToastSuccess.mockReset();
		mockFetchPayrollSettings.mockReset();
		mockCalculatePayroll.mockReset();
		mockFetchPayrollRuns.mockReset();
		mockFetchTourProgress.mockResolvedValue([]);
		mockCompleteTour.mockResolvedValue(undefined);
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
					lunchBreakAutoDeductedDays: 0,
					lunchBreakAutoDeductedMinutes: 0,
					warnings: [],
					deductionsBreakdown: [],
					totalDeductions: 0,
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
			warnings: [],
			holidayNotices: [],
		});
		mockFetchPayrollRuns.mockResolvedValue([]);
		joyrideState.props = null;
		authSessionState.value = {
			data: {
				user: {
					id: 'user-1',
				},
				session: {
					activeOrganizationId: 'org-1',
				},
			},
			isPending: false,
		};
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts a registered tour and maps translated steps into Joyride props', async () => {
		renderWithProviders(<TourContextProbe />);

		await waitFor(() => {
			expect(mockFetchTourProgress).toHaveBeenCalledTimes(1);
		}, { timeout: 15_000 });

		fireEvent.click(screen.getByRole('button', { name: 'Iniciar tour' }));

		expect(screen.getByTestId('tour-state')).toHaveTextContent('true::dashboard');
		expect(joyrideState.props?.run).toBe(true);
		expect(joyrideState.props?.steps).toEqual([
			{
				target: '[data-tour="dashboard-counters"]',
				content: 'dashboard.step1',
				placement: 'bottom',
				disableBeacon: true,
			},
			{
				target: '[data-tour="dashboard-present"]',
				content: 'dashboard.step2',
				placement: 'bottom',
				disableBeacon: true,
			},
			{
				target: '[data-tour="dashboard-map-summary"]',
				content: 'dashboard.step3',
				placement: 'bottom',
				disableBeacon: true,
			},
		]);
	});

	it('maps the expanded payroll tour to selectors that exist in the payroll page DOM', async () => {
		renderPayrollWithProviders(
			<>
				<PayrollTourProbe />
				<PayrollPageClient />
			</>,
		);

		await waitFor(() => {
			expect(mockFetchTourProgress).toHaveBeenCalledTimes(1);
			expect(mockFetchPayrollSettings).toHaveBeenCalledTimes(1);
			expect(mockCalculatePayroll).toHaveBeenCalledTimes(1);
		});

		fireEvent.click(screen.getByRole('button', { name: 'Iniciar tour payroll' }));

		await waitFor(() => {
			expect(joyrideState.props?.run).toBe(true);
			expect(Array.isArray(joyrideState.props?.steps)).toBe(true);
		});

		const payrollSteps = joyrideState.props?.steps as Array<{ target: string }> | undefined;
		expect(payrollSteps).toHaveLength(8);

		for (const step of payrollSteps ?? []) {
			expect(document.querySelector(step.target)).not.toBeNull();
		}
	});

	it('replays the payroll tour from the help button when aguinaldo is disabled', async () => {
		mockFetchTourProgress.mockResolvedValueOnce([
			{
				tourId: 'payroll',
				status: 'completed',
				completedAt: '2026-03-15T00:00:00.000Z',
			},
		]);
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

		renderPayrollWithProviders(<PayrollPageClient />);

		await waitFor(() => {
			expect(screen.getByTestId('tour-help-button')).toHaveTextContent('payroll');
			expect(screen.getByTestId('payroll-tab-aguinaldo')).toBeDisabled();
		});

		expect(joyrideState.props?.run).toBe(false);

		fireEvent.click(screen.getByTestId('tour-help-button'));

		await waitFor(() => {
			expect(joyrideState.props?.run).toBe(true);
		});

		expect(joyrideState.props?.steps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					target: '[data-tour="payroll-tabs"]',
				}),
			]),
		);
	});

	it('uses readable tooltip color tokens for the guided tour card', async () => {
		renderWithProviders(<TourContextProbe />);

		await waitFor(() => {
			expect(mockFetchTourProgress).toHaveBeenCalledTimes(1);
		});

		fireEvent.click(screen.getByRole('button', { name: 'Iniciar tour' }));

		expect(joyrideState.props?.options).toMatchObject({
			backgroundColor: 'var(--popover)',
			textColor: 'var(--popover-foreground)',
			arrowColor: 'var(--popover)',
			primaryColor: 'var(--primary)',
		});
		expect(joyrideState.props?.styles).toMatchObject({
			buttonPrimary: {
				color: 'var(--primary-foreground)',
			},
			buttonBack: {
				color: 'var(--popover-foreground)',
			},
			buttonSkip: {
				color: 'var(--popover-foreground)',
			},
			buttonClose: {
				color: 'var(--popover-foreground)',
			},
		});
	});

	it('marks a running tour as completed when Joyride finishes', async () => {
		renderWithProviders(<TourContextProbe />);

		await waitFor(() => {
			expect(mockFetchTourProgress).toHaveBeenCalledTimes(1);
		});

		fireEvent.click(screen.getByRole('button', { name: 'Iniciar tour' }));

		await act(async () => {
			(joyrideState.props?.onEvent as ((event: Record<string, unknown>) => void) | undefined)?.({
				action: 'next',
				index: 2,
				lifecycle: 'complete',
				origin: null,
				size: 3,
				status: 'finished',
				step: {},
				type: 'tour:end',
			});
		});

		await waitFor(() => {
			expect(mockCompleteTour).toHaveBeenCalledWith('dashboard', 'completed');
		});
		expect(screen.getByTestId('tour-state')).toHaveTextContent('false::none');
	});

	it('advances the controlled step index when Joyride reports a missing target', async () => {
		renderWithProviders(<TourContextProbe />);

		await waitFor(() => {
			expect(mockFetchTourProgress).toHaveBeenCalledTimes(1);
		});

		fireEvent.click(screen.getByRole('button', { name: 'Iniciar tour' }));
		expect(joyrideState.props?.stepIndex).toBe(0);

		await act(async () => {
			(joyrideState.props?.onEvent as ((event: Record<string, unknown>) => void) | undefined)?.({
				action: 'start',
				index: 0,
				lifecycle: 'init',
				origin: null,
				size: 3,
				status: 'running',
				step: {},
				type: 'target:not-found',
			});
		});

		expect(joyrideState.props?.stepIndex).toBe(1);

		await act(async () => {
			(joyrideState.props?.onEvent as ((event: Record<string, unknown>) => void) | undefined)?.({
				action: 'next',
				index: 1,
				lifecycle: 'complete',
				origin: null,
				size: 3,
				status: 'running',
				step: {},
				type: 'target:not-found',
			});
		});

		expect(joyrideState.props?.stepIndex).toBe(2);

		await act(async () => {
			(joyrideState.props?.onEvent as ((event: Record<string, unknown>) => void) | undefined)?.({
				action: 'prev',
				index: 1,
				lifecycle: 'complete',
				origin: null,
				size: 3,
				status: 'running',
				step: {},
				type: 'target:not-found',
			});
		});

		expect(joyrideState.props?.stepIndex).toBe(1);
	});

	it('closes the active tour and shows an error when completion persistence fails', async () => {
		mockCompleteTour.mockRejectedValue(new Error('network down'));

		renderWithProviders(<TourContextProbe />);

		await waitFor(() => {
			expect(mockFetchTourProgress).toHaveBeenCalledTimes(1);
		});

		fireEvent.click(screen.getByRole('button', { name: 'Iniciar tour' }));

		await act(async () => {
			(joyrideState.props?.onEvent as ((event: Record<string, unknown>) => void) | undefined)?.({
				action: 'next',
				index: 2,
				lifecycle: 'complete',
				origin: null,
				size: 3,
				status: 'finished',
				step: {},
				type: 'tour:end',
			});
		});

		await waitFor(() => {
			expect(mockCompleteTour).toHaveBeenCalledWith('dashboard', 'completed');
			expect(mockToastError).toHaveBeenCalledWith('saveErrorMessage');
		});
		expect(screen.getByTestId('tour-state')).toHaveTextContent('false::none');
	});

	it('asks for confirmation before marking a skipped tour as skipped', async () => {
		renderWithProviders(<TourContextProbe />);

		await waitFor(() => {
			expect(mockFetchTourProgress).toHaveBeenCalledTimes(1);
		});

		fireEvent.click(screen.getByRole('button', { name: 'Iniciar tour' }));

		await act(async () => {
			(joyrideState.props?.onEvent as ((event: Record<string, unknown>) => void) | undefined)?.({
				action: 'skip',
				index: 1,
				lifecycle: 'complete',
				origin: null,
				size: 3,
				status: 'skipped',
				step: {},
				type: 'tour:end',
			});
		});

		expect(screen.getByRole('alertdialog')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'skipCancelButton' }));
		expect(mockCompleteTour).not.toHaveBeenCalled();
		expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
		expect(screen.getByTestId('tour-state')).toHaveTextContent('true::dashboard');

		await act(async () => {
			(joyrideState.props?.onEvent as ((event: Record<string, unknown>) => void) | undefined)?.({
				action: 'skip',
				index: 1,
				lifecycle: 'complete',
				origin: null,
				size: 3,
				status: 'skipped',
				step: {},
				type: 'tour:end',
			});
		});
		fireEvent.click(screen.getByRole('button', { name: 'skipConfirmButton' }));

		await waitFor(() => {
			expect(mockCompleteTour).toHaveBeenCalledWith('dashboard', 'skipped');
		});
		expect(screen.getByTestId('tour-state')).toHaveTextContent('false::none');
	}, 15_000);

	it('closes the skip confirmation and shows an error when skip persistence fails', async () => {
		mockCompleteTour.mockRejectedValue(new Error('network down'));

		renderWithProviders(<TourContextProbe />);

		await waitFor(() => {
			expect(mockFetchTourProgress).toHaveBeenCalledTimes(1);
		});

		fireEvent.click(screen.getByRole('button', { name: 'Iniciar tour' }));

		await act(async () => {
			(joyrideState.props?.onEvent as ((event: Record<string, unknown>) => void) | undefined)?.({
				action: 'skip',
				index: 1,
				lifecycle: 'complete',
				origin: null,
				size: 3,
				status: 'skipped',
				step: {},
				type: 'tour:end',
			});
		});

		fireEvent.click(screen.getByRole('button', { name: 'skipConfirmButton' }));

		await waitFor(() => {
			expect(mockCompleteTour).toHaveBeenCalledWith('dashboard', 'skipped');
			expect(mockToastError).toHaveBeenCalledWith('saveErrorMessage');
		});
		expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
		expect(screen.getByTestId('tour-state')).toHaveTextContent('false::none');
	});
});

describe('useTour', () => {
	beforeEach(() => {
		mockFetchTourProgress.mockReset();
		mockCompleteTour.mockReset();
		mockFetchTourProgress.mockResolvedValue([]);
		mockCompleteTour.mockResolvedValue(undefined);
		joyrideState.props = null;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('auto-launches an unseen tour after the initial delay', async () => {
		renderWithProviders(<UseTourProbe />);

		await waitFor(() => {
			expect(mockFetchTourProgress).toHaveBeenCalledTimes(1);
		});

		await waitFor(() => {
			expect(screen.getByTestId('use-tour-state')).toHaveTextContent('true');
			expect(joyrideState.props?.run).toBe(true);
		}, { timeout: 1200 });
	});

	it('does not auto-launch a tour that is already completed', async () => {
		mockFetchTourProgress.mockResolvedValue([
			{
				tourId: 'dashboard',
				status: 'completed',
				completedAt: '2026-04-14T12:00:00.000Z',
			},
		]);

		renderWithProviders(<UseTourProbe />);

		await waitFor(() => {
			expect(mockFetchTourProgress).toHaveBeenCalledTimes(1);
		});

		await act(async () => {
			await new Promise((resolve) => window.setTimeout(resolve, 600));
		});

		expect(screen.getByTestId('use-tour-state')).toHaveTextContent('false');
		expect(joyrideState.props?.run).not.toBe(true);
	});

	it('does not auto-launch a tour when progress loading fails', async () => {
		mockFetchTourProgress.mockRejectedValue(new Error('network down'));

		renderWithProviders(<UseTourProbe />);

		await waitFor(() => {
			expect(mockFetchTourProgress).toHaveBeenCalledTimes(1);
		});

		await act(async () => {
			await new Promise((resolve) => window.setTimeout(resolve, 600));
		});

		expect(screen.getByTestId('use-tour-state')).toHaveTextContent('false');
		expect(joyrideState.props?.run).not.toBe(true);
	});

	it('refetches progress when the authenticated user context changes', async () => {
		const view = renderWithProviders(<TourContextProbe />);

		await waitFor(() => {
			expect(mockFetchTourProgress).toHaveBeenCalledTimes(1);
		});

		authSessionState.value = {
			data: {
				user: {
					id: 'user-2',
				},
				session: {
					activeOrganizationId: 'org-2',
				},
			},
			isPending: false,
		};

		view.rerender(
			<QueryClientProvider client={view.queryClient}>
				<NextIntlClientProvider locale="es" messages={messages}>
					<TourProvider>
						<TourContextProbe />
					</TourProvider>
				</NextIntlClientProvider>
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(mockFetchTourProgress).toHaveBeenCalledTimes(2);
		});
	});
});
