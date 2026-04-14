import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetchTourProgress, mockCompleteTour, joyrideState } = vi.hoisted(() => ({
	mockFetchTourProgress: vi.fn(),
	mockCompleteTour: vi.fn(),
	joyrideState: {
		props: null as Record<string, unknown> | null,
	},
}));

vi.mock('@/lib/tour-client-functions', () => ({
	fetchTourProgress: (...args: unknown[]) => mockFetchTourProgress(...args),
	completeTour: (...args: unknown[]) => mockCompleteTour(...args),
}));

vi.mock('react-joyride', () => {
	const Joyride = (props: Record<string, unknown>) => {
		joyrideState.props = props;
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

const messages = {
	Tours: {
		skipConfirmTitle: 'Omitir tutorial?',
		skipConfirmMessage: 'Puedes repetirlo desde el botón de ayuda (?) en cualquier momento.',
		skipConfirmButton: 'Sí, omitir',
		skipCancelButton: 'Continuar tutorial',
		completedMessage: 'Tutorial completado! Puedes repetirlo desde el botón de ayuda.',
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

	return render(
		<QueryClientProvider client={queryClient}>
			<NextIntlClientProvider locale="es" messages={messages}>
				<TourProvider>{children}</TourProvider>
			</NextIntlClientProvider>
		</QueryClientProvider>,
	);
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

describe('TourProvider', () => {
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

	it('starts a registered tour and maps translated steps into Joyride props', async () => {
		renderWithProviders(<TourContextProbe />);

		await waitFor(() => {
			expect(mockFetchTourProgress).toHaveBeenCalledTimes(1);
		});

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
				target: '[data-tour="dashboard-map"]',
				content: 'dashboard.step3',
				placement: 'top',
				disableBeacon: true,
			},
		]);
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
});
