import { describe, expect, it } from 'vitest';

import { buildClosedEmployeeDialogState } from '@/lib/employee-dialog-state';

describe('buildClosedEmployeeDialogState', () => {
	it('resets the mobile employee dialog to the info tab and clears wizard state', () => {
		const state = buildClosedEmployeeDialogState(true);

		expect(state.isDialogOpen).toBe(false);
		expect(state.dialogMode).toBe('create');
		expect(state.activeEmployee).toBeNull();
		expect(state.detailTab).toBe('info');
		expect(state.visitedDetailTabs).toEqual({ info: true });
		expect(state.showMobileDiscardFromOutside).toBe(false);
		expect(state.mobileWizardBaseline).toBeNull();
		expect(state.mobileWizardErrorSteps).toEqual([]);
		expect(state.mobileWizardStepIndex).toBe(0);
		expect(state.hasCustomCode).toBe(false);
	});

	it('resets the desktop employee dialog to the summary tab', () => {
		const state = buildClosedEmployeeDialogState(false);

		expect(state.detailTab).toBe('summary');
		expect(state.visitedDetailTabs).toEqual({ summary: true });
	});
});
