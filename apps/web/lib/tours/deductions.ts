import type { TourConfig } from './types';

/**
 * Guided tour for the deductions section.
 */
export const deductionsTour: TourConfig = {
	id: 'deductions',
	section: '/deductions',
	adminOnly: false,
	steps: [
		{
			target: '[data-tour="deductions-header-actions"]',
			contentKey: 'deductions.step1',
			placement: 'left',
		},
		{
			target: '[data-tour="deductions-filters"]',
			contentKey: 'deductions.step2',
			placement: 'bottom',
		},
		{
			target: '[data-tour="deductions-list"]',
			contentKey: 'deductions.step3',
			placement: 'top',
		},
	],
};
