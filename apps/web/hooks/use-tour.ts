'use client';

import { useEffect, useRef } from 'react';

import { useOptionalTourContext } from '@/components/tour-provider';

/**
 * Hook for auto-launching a section tour on first visit and replaying it on demand.
 *
 * @param tourId - Tour identifier to manage
 * @param enabled - Whether the tour may auto-launch and be restarted
 * @returns Restart action and running state for the current tour
 */
export function useTour(
	tourId: string,
	enabled = true,
): {
	restartTour: () => void;
	isTourRunning: boolean;
} {
	const contextValue = useOptionalTourContext();
	const hasAutoLaunched = useRef<boolean>(false);

	useEffect(() => {
		hasAutoLaunched.current = false;
	}, [contextValue?.progressScopeKey]);

	useEffect(() => {
		if (
			!enabled ||
			!contextValue ||
			!contextValue.isProgressReady ||
			hasAutoLaunched.current ||
			contextValue.isTourDone(tourId) ||
			contextValue.isRunning
		) {
			return;
		}

		hasAutoLaunched.current = true;
		const timer = window.setTimeout(() => {
			contextValue.startTour(tourId);
		}, 500);

		return () => {
			window.clearTimeout(timer);
		};
	}, [contextValue, enabled, tourId]);

	/**
	 * Restarts the tour from the first step.
	 *
	 * @returns Void
	 */
	const restartTour = (): void => {
		if (!enabled || !contextValue) {
			return;
		}
		contextValue.startTour(tourId);
	};

	return {
		restartTour,
		isTourRunning:
			enabled && Boolean(contextValue?.isRunning && contextValue.activeTourId === tourId),
	};
}
