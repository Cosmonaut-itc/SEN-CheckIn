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
			target: '[data-tour="payroll-legal-rules"]',
			contentKey: 'payroll.step2',
			placement: 'bottom',
		},
		{
			target: '[data-tour="payroll-insights"]',
			contentKey: 'payroll.step3',
			placement: 'bottom',
		},
		{
			target: '[data-tour="payroll-process"]',
			contentKey: 'payroll.step4',
			placement: 'left',
		},
		{
			target: '[data-tour="payroll-preview-table"]',
			contentKey: 'payroll.step5',
			placement: 'top',
		},
		{
			target: '[data-tour="payroll-run-history"]',
			contentKey: 'payroll.step6',
			placement: 'top',
		},
		{
			target: '[data-tour="payroll-tab-ptu"]',
			contentKey: 'payroll.step7',
			placement: 'bottom',
		},
		{
			target: '[data-tour="payroll-tab-aguinaldo"]',
			contentKey: 'payroll.step8',
			placement: 'bottom',
		},
	],
};
