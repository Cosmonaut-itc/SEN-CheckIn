import type { EmployeeDetailTab } from '@sen-checkin/types';

/**
 * Supported employee dialog modes.
 */
export type EmployeeDialogMode = 'create' | 'view' | 'edit';

/**
 * Supported employee dialog tabs, including the mobile-only info tab.
 */
export type EmployeeDialogTab = EmployeeDetailTab | 'info';

/**
 * Serializable state that should be reset whenever the employee dialog closes.
 */
export interface ClosedEmployeeDialogState {
	/** Whether the dialog should remain open. */
	isDialogOpen: boolean;
	/** Next dialog mode after reset. */
	dialogMode: EmployeeDialogMode;
	/** Active employee after reset. */
	activeEmployee: null;
	/** Initial detail tab after reset. */
	detailTab: EmployeeDialogTab;
	/** Visited tabs after reset. */
	visitedDetailTabs: Partial<Record<EmployeeDialogTab, boolean>>;
	/** Whether the outside discard dialog should remain visible. */
	showMobileDiscardFromOutside: boolean;
	/** Serialized wizard baseline after reset. */
	mobileWizardBaseline: null;
	/** Wizard error step indexes after reset. */
	mobileWizardErrorSteps: number[];
	/** Active wizard step index after reset. */
	mobileWizardStepIndex: number;
	/** Whether the employee code is currently manually overridden. */
	hasCustomCode: boolean;
}

/**
 * Builds the canonical closed-dialog state for the employee modal.
 *
 * @param isMobile - Whether the mobile layout is active
 * @returns Reset state for the next dialog session
 */
export function buildClosedEmployeeDialogState(
	isMobile: boolean,
): ClosedEmployeeDialogState {
	const detailTab: EmployeeDialogTab = isMobile ? 'info' : 'summary';

	return {
		isDialogOpen: false,
		dialogMode: 'create',
		activeEmployee: null,
		detailTab,
		visitedDetailTabs: { [detailTab]: true },
		showMobileDiscardFromOutside: false,
		mobileWizardBaseline: null,
		mobileWizardErrorSteps: [],
		mobileWizardStepIndex: 0,
		hasCustomCode: false,
	};
}
