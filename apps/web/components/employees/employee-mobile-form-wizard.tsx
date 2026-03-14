'use client';

import React from 'react';
import { CheckCircle2, Circle, Disc3, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
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

/**
 * Mobile wizard step definition.
 */
export interface EmployeeMobileWizardStep {
	/** Stable step identifier. */
	id: string;
	/** Visible step title. */
	title: string;
	/** Step content. */
	content: React.ReactNode;
}

/**
 * Props required by the mobile employee form wizard.
 */
export interface EmployeeMobileFormWizardProps {
	/** Header title. */
	title: string;
	/** Label for the close action. */
	closeLabel: string;
	/** Label for the previous-step action. */
	previousLabel: string;
	/** Label for the next-step action. */
	nextLabel: string;
	/** Label for the final save action. */
	saveLabel: string;
	/** Label for cancelling discard confirmation. */
	cancelDiscardLabel: string;
	/** Label for confirming discard. */
	confirmDiscardLabel: string;
	/** Discard dialog title. */
	discardTitle: string;
	/** Discard dialog description. */
	discardDescription: string;
	/** Progress label template using {current}, {total}, and {step}. */
	progressLabel: string;
	/** Navigation label for the stepper. */
	progressNavigationLabel: string;
	/** Step button aria-label template using {current}, {total}, and {step}. */
	stepAriaLabel: string;
	/** Suffix appended to aria labels when a step has validation errors. */
	stepErrorSuffix: string;
	/** Whether the wizard currently has unsaved changes. */
	dirty: boolean;
	/** Step indexes with validation errors. */
	errorStepIndexes: number[];
	/** Whether the discard confirmation should open due to an outside close request. */
	showDiscardFromOutside?: boolean;
	/** Updates the outside discard confirmation state. */
	setShowDiscardFromOutside?: React.Dispatch<React.SetStateAction<boolean>>;
	/** Optional controlled active step index. */
	activeStepIndex?: number;
	/** Notifies when the active step changes. */
	onActiveStepIndexChange?: (nextStepIndex: number) => void;
	/** Whether the final submit action is pending. */
	isSubmitting?: boolean;
	/** All wizard steps. */
	steps: EmployeeMobileWizardStep[];
	/** Called when the wizard should close. */
	onClose: () => void;
	/** Called when the user confirms the final submit action. */
	onSubmit: () => void;
}

/**
 * Resolves the stepper icon for a given step state.
 *
 * @param index - Zero-based step index
 * @param currentStepIndex - Zero-based active step index
 * @param visitedSteps - Visited step indexes
 * @param errorStepIndexes - Step indexes with validation errors
 * @returns Icon element for the step button
 */
function renderStepIcon(
	index: number,
	currentStepIndex: number,
	visitedSteps: Set<number>,
	errorStepIndexes: Set<number>,
): React.ReactElement {
	if (errorStepIndexes.has(index)) {
		return <Disc3 className="h-4 w-4 text-destructive" />;
	}

	if (index === currentStepIndex) {
		return <Disc3 className="h-4 w-4 text-[var(--accent-primary)]" />;
	}

	if (visitedSteps.has(index)) {
		return <CheckCircle2 className="h-4 w-4 text-[var(--accent-primary)]" />;
	}

	return <Circle className="h-4 w-4 text-muted-foreground" />;
}

/**
 * Formats the progress label shown above the step content.
 *
 * @param template - Template string
 * @param current - Current one-based step index
 * @param total - Total step count
 * @param step - Current step title
 * @returns Formatted progress label
 */
function formatProgressLabel(
	template: string,
	current: number,
	total: number,
	step: string,
): string {
	return template
		.replace('{current}', String(current))
		.replace('{total}', String(total))
		.replace('{step}', step);
}

/**
 * Formats the aria-label applied to a step button.
 *
 * @param template - Base aria-label template
 * @param current - Current one-based step index
 * @param total - Total step count
 * @param step - Current step title
 * @param hasErrors - Whether the step currently has validation errors
 * @param errorSuffix - Localized error suffix
 * @returns Formatted step aria-label
 */
function formatStepAriaLabel(
	template: string,
	current: number,
	total: number,
	step: string,
	hasErrors: boolean,
	errorSuffix: string,
): string {
	const baseLabel = formatProgressLabel(template, current, total, step);
	return hasErrors ? `${baseLabel} ${errorSuffix}` : baseLabel;
}

/**
 * Renders the mobile wizard used for create/edit employee flows.
 *
 * @param props - Component props
 * @returns Mobile wizard JSX
 */
export function EmployeeMobileFormWizard({
	title,
	closeLabel,
	previousLabel,
	nextLabel,
	saveLabel,
	cancelDiscardLabel,
	confirmDiscardLabel,
	discardTitle,
	discardDescription,
	progressLabel,
	progressNavigationLabel,
	stepAriaLabel,
	stepErrorSuffix,
	dirty,
	errorStepIndexes,
	showDiscardFromOutside = false,
	setShowDiscardFromOutside,
	activeStepIndex,
	onActiveStepIndexChange,
	isSubmitting = false,
	steps,
	onClose,
	onSubmit,
}: EmployeeMobileFormWizardProps): React.ReactElement {
	const [uncontrolledStepIndex, setUncontrolledStepIndex] = React.useState<number>(0);
	const [visitedSteps, setVisitedSteps] = React.useState<Set<number>>(new Set([0]));
	const [isDiscardDialogOpen, setIsDiscardDialogOpen] = React.useState<boolean>(false);

	const currentStepIndex = activeStepIndex ?? uncontrolledStepIndex;
	const totalSteps = steps.length;
	const currentStep = steps[currentStepIndex];
	const errorStepSet = React.useMemo(() => new Set(errorStepIndexes), [errorStepIndexes]);
	const currentProgressLabel = formatProgressLabel(
		progressLabel,
		currentStepIndex + 1,
		totalSteps,
		currentStep.title,
	);
	const isLastStep = currentStepIndex === totalSteps - 1;
	const isDiscardDialogVisible = isDiscardDialogOpen || showDiscardFromOutside;

	React.useEffect(() => {
		setVisitedSteps((previousVisitedSteps) => {
			const nextVisitedSteps = new Set(previousVisitedSteps);
			nextVisitedSteps.add(currentStepIndex);
			return nextVisitedSteps;
		});
	}, [currentStepIndex]);

	/**
	 * Closes the discard confirmation regardless of how it was opened.
	 *
	 * @returns Nothing
	 */
	const closeDiscardDialog = (): void => {
		setIsDiscardDialogOpen(false);
		setShowDiscardFromOutside?.(false);
	};

	/**
	 * Moves the wizard to a target step index and tracks the visit.
	 *
	 * @param nextIndex - Target step index
	 * @returns Nothing
	 */
	const goToStep = (nextIndex: number): void => {
		if (activeStepIndex === undefined) {
			setUncontrolledStepIndex(nextIndex);
		}
		onActiveStepIndexChange?.(nextIndex);
		setVisitedSteps((previousVisitedSteps) => {
			const nextVisitedSteps = new Set(previousVisitedSteps);
			nextVisitedSteps.add(nextIndex);
			return nextVisitedSteps;
		});
	};

	/**
	 * Handles the close action, prompting when there are unsaved changes.
	 *
	 * @returns Nothing
	 */
	const handleCloseRequest = (): void => {
		if (!dirty) {
			onClose();
			return;
		}

		setIsDiscardDialogOpen(true);
	};

	/**
	 * Handles the primary footer action.
	 *
	 * @returns Nothing
	 */
	const handlePrimaryAction = (): void => {
		if (isLastStep) {
			onSubmit();
			return;
		}

		goToStep(currentStepIndex + 1);
	};

	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<div className="shrink-0 border-b bg-background px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-lg font-semibold text-foreground">{title}</h2>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="h-11 w-11"
						onClick={handleCloseRequest}
						aria-label={closeLabel}
					>
						<X className="h-4 w-4" />
						<span className="sr-only">{closeLabel}</span>
					</Button>
				</div>
			</div>

			<div className="shrink-0 border-b bg-background px-4 py-3">
				<nav aria-label={progressNavigationLabel} role="navigation" className="space-y-3">
					<p className="text-sm font-medium text-foreground">{currentProgressLabel}</p>
					<div className="flex items-center gap-2 overflow-x-auto">
						{steps.map((step, index) => {
							const isCurrentStep = index === currentStepIndex;
							const stepLabel = formatStepAriaLabel(
								stepAriaLabel,
								index + 1,
								totalSteps,
								step.title,
								errorStepSet.has(index),
								stepErrorSuffix,
							);
							return (
								<Button
									key={step.id}
									type="button"
									variant="ghost"
									size="icon"
									className="h-11 w-11 shrink-0 rounded-full"
									onClick={() => goToStep(index)}
									aria-label={stepLabel}
									aria-current={isCurrentStep ? 'step' : undefined}
								>
									{renderStepIcon(index, currentStepIndex, visitedSteps, errorStepSet)}
								</Button>
							);
						})}
					</div>
				</nav>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{currentStep.content}</div>

			<div className="shrink-0 border-t bg-background px-4 py-3">
				<div className="flex items-center gap-3">
					{currentStepIndex > 0 ? (
						<Button
							type="button"
							variant="outline"
							className="min-h-11 flex-1"
							onClick={() => goToStep(currentStepIndex - 1)}
						>
							{previousLabel}
						</Button>
					) : null}
					<Button
						type="button"
						className="min-h-11 flex-1"
						onClick={handlePrimaryAction}
						disabled={isSubmitting}
					>
						{isLastStep ? saveLabel : nextLabel}
					</Button>
				</div>
			</div>

			<AlertDialog
				open={isDiscardDialogVisible}
				onOpenChange={(open) => {
					if (!open) {
						closeDiscardDialog();
					}
				}}
			>
				<AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-3xl p-4">
					<AlertDialogHeader>
						<AlertDialogTitle>{discardTitle}</AlertDialogTitle>
						<AlertDialogDescription>{discardDescription}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="[&>button]:min-h-11 [&>button]:w-full min-[1025px]:[&>button]:w-auto">
						<AlertDialogCancel onClick={closeDiscardDialog}>
							{cancelDiscardLabel}
						</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-white hover:bg-destructive/90"
							onClick={() => {
								closeDiscardDialog();
								onClose();
							}}
						>
							{confirmDiscardLabel}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
