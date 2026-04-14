import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseOptionalTourContext = vi.fn();
const mockStartTour = vi.fn();

vi.mock('@/components/tour-provider', () => ({
	useOptionalTourContext: (...args: unknown[]) => mockUseOptionalTourContext(...args),
}));

import { useTour } from './use-tour';

/**
 * Consumer component used to exercise the useTour hook.
 *
 * @returns Test probe element
 */
function UseTourProbe(props: { enabled?: boolean }): React.ReactElement {
	const { isTourRunning, restartTour } = useTour('dashboard', props.enabled ?? true);

	return (
		<div>
			<div data-testid="tour-state">{String(isTourRunning)}</div>
			<button type="button" onClick={restartTour}>
				Reiniciar
			</button>
		</div>
	);
}

describe('useTour', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockUseOptionalTourContext.mockReset();
		mockStartTour.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('keeps the hook order stable when the optional context appears later', () => {
		const initialContext = null;
		const activeContext = {
			activeTourId: null,
			progressScopeKey: 'user-1:org-1',
			isProgressReady: true,
			isRunning: false,
			isTourDone: vi.fn().mockReturnValue(false),
			startTour: mockStartTour,
		};

		mockUseOptionalTourContext.mockReturnValueOnce(initialContext);

		const { rerender } = render(<UseTourProbe />);

		mockUseOptionalTourContext.mockReturnValue(activeContext);

		expect(() => {
			rerender(<UseTourProbe />);
		}).not.toThrow();

		act(() => {
			vi.advanceTimersByTime(500);
		});

		expect(mockStartTour).toHaveBeenCalledWith('dashboard');
	});

		it(
			'does not auto-launch or restart the tour when disabled',
			() => {
			vi.useRealTimers();
			mockUseOptionalTourContext.mockReturnValue({
				activeTourId: null,
			progressScopeKey: 'user-1:org-1',
			isProgressReady: true,
			isRunning: false,
			isTourDone: vi.fn().mockReturnValue(false),
			startTour: mockStartTour,
		});

		render(<UseTourProbe enabled={false} />);
		fireEvent.click(screen.getByRole('button', { name: 'Reiniciar' }));

			expect(screen.getByTestId('tour-state')).toHaveTextContent('false');
			expect(mockStartTour).not.toHaveBeenCalled();
			},
			15_000,
		);

	it('re-arms auto-launch when the progress scope changes', () => {
		const firstScopeContext = {
			activeTourId: null,
			progressScopeKey: 'user-1:org-1',
			isProgressReady: true,
			isRunning: false,
			isTourDone: vi.fn().mockReturnValue(false),
			startTour: mockStartTour,
		};
		const secondScopeContext = {
			...firstScopeContext,
			progressScopeKey: 'user-1:org-2',
		};

		mockUseOptionalTourContext.mockReturnValue(firstScopeContext);
		const { rerender } = render(<UseTourProbe />);

		act(() => {
			vi.advanceTimersByTime(500);
		});

		mockUseOptionalTourContext.mockReturnValue(secondScopeContext);
		rerender(<UseTourProbe />);

		act(() => {
			vi.advanceTimersByTime(500);
		});

		expect(mockStartTour).toHaveBeenCalledTimes(2);
	});
});
