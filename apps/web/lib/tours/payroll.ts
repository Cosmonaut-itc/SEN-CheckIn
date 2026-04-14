import type { TourConfig } from './types';

/**
 * Guided tour for the payroll section.
 */
export const payrollTour: TourConfig = {
	id: 'payroll',
	section: '/payroll',
	adminOnly: false,
	steps: [
		{
			target: '[data-tour="payroll-tabs"]',
			contentKey: 'payroll.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="payroll-process"]',
			contentKey: 'payroll.step2',
			placement: 'left',
		},
		{
			target: '[data-testid="payroll-preview-table-container"]',
			contentKey: 'payroll.step3',
			placement: 'top',
		},
	],
};
