'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
	ACTIONS,
	EVENTS,
	Joyride,
	STATUS,
	type EventData,
	type Step as JoyrideStep,
} from 'react-joyride';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useSession } from '@/lib/auth-client';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import {
	completeTour,
	fetchTourProgress,
	type TourProgressRecord,
} from '@/lib/tour-client-functions';
import { getTourById } from '@/lib/tours/registry';
import type { TourStep } from '@/lib/tours/types';

interface PendingSkipState {
	tourId: string;
	stepIndex: number;
}

/**
 * Value exposed by the tour context.
 */
interface TourContextValue {
	/** Whether any tour is currently running. */
	isRunning: boolean;
	/** Active tour identifier when a tour is running. */
	activeTourId: string | null;
	/** Stable key for the current user and organization tour scope. */
	progressScopeKey: string;
	/** Loaded tour progress records for the active user. */
	progress: TourProgressRecord[];
	/** Whether the initial progress query has completed. */
	isProgressReady: boolean;
	/** Starts a registered tour from the first step. */
	startTour: (tourId: string) => void;
	/** Determines whether a tour has already been completed or skipped. */
	isTourDone: (tourId: string) => boolean;
}

/**
 * Props for the TourProvider component.
 */
interface TourProviderProps {
	/** Descendant application subtree. */
	children: React.ReactNode;
}

const TourContext = createContext<TourContextValue | undefined>(undefined);

/**
 * Maps tour step definitions into React Joyride steps using translated content.
 *
 * @param steps - Tour steps from the registry
 * @param translate - Tour translation helper
 * @returns Joyride step array
 */
function buildJoyrideSteps(
	steps: TourStep[],
	translate: ReturnType<typeof useTranslations<'Tours'>>,
): JoyrideStep[] {
	return steps.map((step) => ({
		target: step.target,
		content: translate(step.contentKey),
		placement: step.placement,
		disableBeacon: true,
	}));
}

/**
 * Provides guided tour state and renders the Joyride instance for dashboard pages.
 *
 * @param props - Component props
 * @returns Provider subtree with Joyride and skip confirmation dialog
 */
export function TourProvider({ children }: TourProviderProps): React.ReactElement {
	const t = useTranslations('Tours');
	const { data: session } = useSession();
	const queryClient = useQueryClient();
	const [isRunning, setIsRunning] = useState<boolean>(false);
	const [activeTourId, setActiveTourId] = useState<string | null>(null);
	const [steps, setSteps] = useState<JoyrideStep[]>([]);
	const [stepIndex, setStepIndex] = useState<number>(0);
	const [pendingSkip, setPendingSkip] = useState<PendingSkipState | null>(null);
	const userId = session?.user?.id ?? null;
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const progressScopeKey = `${userId ?? 'anonymous'}:${organizationId ?? 'none'}`;

	const { data: progress = [], isSuccess } = useQuery({
		queryKey: queryKeys.tours.progress(userId, organizationId),
		queryFn: fetchTourProgress,
		enabled: Boolean(userId && organizationId),
		staleTime: 5 * 60 * 1000,
	});

	/**
	 * Clears the in-memory state for the active tour.
	 *
	 * @returns Void
	 */
	const resetTourState = useCallback((): void => {
		setIsRunning(false);
		setActiveTourId(null);
		setSteps([]);
		setStepIndex(0);
		setPendingSkip(null);
	}, []);

	const completeTourMutation = useMutation({
		mutationKey: mutationKeys.tours.complete,
		mutationFn: ({ tourId, status }: { tourId: string; status: 'completed' | 'skipped' }) =>
			completeTour(tourId, status),
		onSuccess: async (_data, variables) => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.tours.all });
			if (variables.status === 'completed') {
				toast.success(t('completedMessage'));
			}
		},
		onError: () => {
			toast.error(t('saveErrorMessage'));
		},
	});

	/**
	 * Starts a registered tour from the first step.
	 *
	 * @param tourId - Tour identifier to launch
	 * @returns Void
	 */
	const startTour = useCallback(
		(tourId: string): void => {
			const config = getTourById(tourId);
			if (!config) {
				return;
			}

			setSteps(buildJoyrideSteps(config.steps, t));
			setActiveTourId(tourId);
			setStepIndex(0);
			setPendingSkip(null);
			setIsRunning(true);
		},
		[t],
	);

	/**
	 * Checks whether a given tour has already been completed or skipped.
	 *
	 * @param tourId - Tour identifier to inspect
	 * @returns True when the tour already has persisted progress
	 */
	const isTourDone = useCallback(
		(tourId: string): boolean => progress.some((entry) => entry.tourId === tourId),
		[progress],
	);

	/**
	 * Handles Joyride state transitions for next/prev/finish/skip events.
	 *
	 * @param event - Joyride event payload
	 * @returns Void
	 */
	const handleTourEvent = useCallback(
		(event: EventData): void => {
			if (!activeTourId) {
				return;
			}

			if (event.type === EVENTS.STEP_AFTER || event.type === EVENTS.TARGET_NOT_FOUND) {
				if (event.action === ACTIONS.PREV) {
					setStepIndex((currentIndex) => Math.max(currentIndex - 1, 0));
				} else {
					setStepIndex((currentIndex) => currentIndex + 1);
				}
			}

			if (event.status === STATUS.FINISHED) {
				completeTourMutation.mutate({
					tourId: activeTourId,
					status: 'completed',
				});
				resetTourState();
				return;
			}

			if (event.status === STATUS.SKIPPED || event.action === ACTIONS.SKIP) {
				setIsRunning(false);
				setPendingSkip({
					tourId: activeTourId,
					stepIndex: event.index,
				});
				return;
			}

			if (event.action === ACTIONS.CLOSE) {
				resetTourState();
			}
		},
		[activeTourId, completeTourMutation, resetTourState],
	);

	/**
	 * Confirms that the active tour should be marked as skipped.
	 *
	 * @returns Void
	 */
	const handleConfirmSkip = useCallback((): void => {
		if (!pendingSkip) {
			return;
		}

		completeTourMutation.mutate({
			tourId: pendingSkip.tourId,
			status: 'skipped',
		});
		resetTourState();
	}, [completeTourMutation, pendingSkip, resetTourState]);

	/**
	 * Continues the current tour after dismissing the skip confirmation dialog.
	 *
	 * @returns Void
	 */
	const handleCancelSkip = useCallback((): void => {
		if (!pendingSkip) {
			return;
		}

		setStepIndex(pendingSkip.stepIndex);
		setPendingSkip(null);
		setIsRunning(true);
	}, [pendingSkip]);

	const contextValue = useMemo<TourContextValue>(
		() => ({
			isRunning,
			activeTourId,
			progressScopeKey,
			progress,
			isProgressReady: isSuccess,
			startTour,
			isTourDone,
		}),
		[activeTourId, isRunning, isSuccess, isTourDone, progress, progressScopeKey, startTour],
	);

	return (
		<TourContext.Provider value={contextValue}>
			{children}
			<Joyride
				steps={steps}
				run={isRunning}
				stepIndex={stepIndex}
				continuous
				scrollToFirstStep
				onEvent={handleTourEvent}
				locale={{
					next: t('nextButton'),
					nextWithProgress: `${t('nextButton')} · ${t('progressLabel', {
						current: '{current}',
						total: '{total}',
					})}`,
					back: t('prevButton'),
					last: t('nextButton'),
					skip: t('skipButton'),
				}}
				options={{
					zIndex: 10000,
					primaryColor: 'var(--primary)',
					backgroundColor: 'var(--popover)',
					textColor: 'var(--popover-foreground)',
					arrowColor: 'var(--popover)',
					overlayColor: 'var(--overlay)',
					showProgress: true,
					closeButtonAction: 'skip',
					dismissKeyAction: false,
					overlayClickAction: false,
					buttons: ['back', 'primary', 'skip'],
				}}
				styles={{
					buttonPrimary: {
						borderRadius: 8,
						color: 'var(--primary-foreground)',
					},
					buttonBack: {
						borderRadius: 8,
						color: 'var(--popover-foreground)',
					},
					buttonSkip: {
						borderRadius: 8,
						color: 'var(--popover-foreground)',
					},
					buttonClose: {
						color: 'var(--popover-foreground)',
					},
				}}
			/>
			<AlertDialog open={pendingSkip !== null}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('skipConfirmTitle')}</AlertDialogTitle>
						<AlertDialogDescription>{t('skipConfirmMessage')}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={handleCancelSkip}>
							{t('skipCancelButton')}
						</AlertDialogCancel>
						<AlertDialogAction onClick={handleConfirmSkip}>
							{t('skipConfirmButton')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</TourContext.Provider>
	);
}

/**
 * Reads the current tour context.
 *
 * @returns Tour context value
 * @throws Error when used outside the TourProvider
 */
export function useTourContext(): TourContextValue {
	const contextValue = useContext(TourContext);
	if (!contextValue) {
		throw new Error('useTourContext must be used within a TourProvider');
	}
	return contextValue;
}

/**
 * Reads the current tour context when available.
 *
 * @returns Tour context value or null outside the provider
 */
export function useOptionalTourContext(): TourContextValue | null {
	return useContext(TourContext) ?? null;
}
