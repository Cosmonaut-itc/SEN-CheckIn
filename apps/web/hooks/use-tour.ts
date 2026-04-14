'use client';

import { useEffect, useRef } from 'react';

import { useOptionalTourContext } from '@/components/tour-provider';

/**
 * Hook for auto-launching a section tour on first visit and replaying it on demand.
 *
 * @param tourId - Tour identifier to manage
 * @returns Restart action and running state for the current tour
 */
export function useTour(tourId: string): {
	restartTour: () => void;
	isTourRunning: boolean;
} {
	const contextValue = useOptionalTourContext();
	const hasAutoLaunched = useRef<boolean>(false);

	if (!contextValue) {
		return {
			restartTour: () => undefined,
			isTourRunning: false,
		};
	}

	const { activeTourId, isProgressReady, isRunning, isTourDone, startTour } = contextValue;

	useEffect(() => {
		if (!isProgressReady || hasAutoLaunched.current || isTourDone(tourId) || isRunning) {
			return;
		}

		hasAutoLaunched.current = true;
		const timer = window.setTimeout(() => {
			startTour(tourId);
		}, 500);

		return () => {
			window.clearTimeout(timer);
		};
	}, [isProgressReady, isRunning, isTourDone, startTour, tourId]);

	/**
	 * Restarts the tour from the first step.
	 *
	 * @returns Void
	 */
	const restartTour = (): void => {
		startTour(tourId);
	};

	return {
		restartTour,
		isTourRunning: isRunning && activeTourId === tourId,
	};
}
