import type { TourConfig } from './types';

/**
 * Guided tour for the Aguinaldo payroll sub-section.
 */
export const payrollAguinaldoTour: TourConfig = {
	id: 'payroll-aguinaldo',
	section: '/payroll',
	adminOnly: false,
	steps: [
		{
			target: '[data-tour="payroll-tab-aguinaldo"]',
			contentKey: 'payrollAguinaldo.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="payroll-aguinaldo-config"]',
			contentKey: 'payrollAguinaldo.step2',
			placement: 'bottom',
		},
		{
			target: '[data-tour="payroll-aguinaldo-actions"]',
			contentKey: 'payrollAguinaldo.step3',
			placement: 'bottom',
		},
		{
			target: '[data-tour="payroll-aguinaldo-summary"]',
			contentKey: 'payrollAguinaldo.step4',
			placement: 'top',
		},
		{
			target: '[data-tour="payroll-aguinaldo-table"]',
			contentKey: 'payrollAguinaldo.step5',
			placement: 'top',
		},
		{
			target: '[data-tour="payroll-aguinaldo-history"]',
			contentKey: 'payrollAguinaldo.step6',
			placement: 'top',
		},
	],
};
