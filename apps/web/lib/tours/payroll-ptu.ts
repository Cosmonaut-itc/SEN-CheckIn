import type { TourConfig } from './types';

/**
 * Guided tour for the PTU payroll sub-section.
 */
export const payrollPtuTour: TourConfig = {
	id: 'payroll-ptu',
	section: '/payroll',
	adminOnly: false,
	steps: [
		{
			target: '[data-tour="payroll-tab-ptu"]',
			contentKey: 'payrollPtu.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="payroll-ptu-config"]',
			contentKey: 'payrollPtu.step2',
			placement: 'bottom',
		},
		{
			target: '[data-tour="payroll-ptu-actions"]',
			contentKey: 'payrollPtu.step3',
			placement: 'bottom',
		},
		{
			target: '[data-tour="payroll-ptu-summary"]',
			contentKey: 'payrollPtu.step4',
			placement: 'top',
		},
		{
			target: '[data-tour="payroll-ptu-table"]',
			contentKey: 'payrollPtu.step5',
			placement: 'top',
		},
		{
			target: '[data-tour="payroll-ptu-history"]',
			contentKey: 'payrollPtu.step6',
			placement: 'top',
		},
	],
};
