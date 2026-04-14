import type { TourConfig } from './types';

/**
 * Guided tour for the employees section.
 */
export const employeesTour: TourConfig = {
	id: 'employees',
	section: '/employees',
	adminOnly: false,
	steps: [
		{
			target: '[data-testid="employees-add-button"]',
			contentKey: 'employees.step1',
			placement: 'bottom',
		},
		{
			target: '[data-testid="employees-add-menu-button"]',
			contentKey: 'employees.step2',
			placement: 'bottom',
		},
		{
			target: '[data-tour="employees-list"]',
			contentKey: 'employees.step3',
			placement: 'top',
		},
	],
};
