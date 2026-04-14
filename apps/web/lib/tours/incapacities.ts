import type { TourConfig } from './types';

/**
 * Guided tour for the incapacities section.
 */
export const incapacitiesTour: TourConfig = {
	id: 'incapacities',
	section: '/incapacities',
	adminOnly: false,
	steps: [
		{
			target: '[data-tour="incapacities-create"]',
			contentKey: 'incapacities.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="incapacities-filters"]',
			contentKey: 'incapacities.step2',
			placement: 'bottom',
		},
		{
			target: '[data-tour="incapacities-list"]',
			contentKey: 'incapacities.step3',
			placement: 'top',
		},
	],
};
