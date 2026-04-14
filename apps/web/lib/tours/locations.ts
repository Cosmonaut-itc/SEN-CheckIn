import type { TourConfig } from './types';

/**
 * Guided tour for the locations section.
 */
export const locationsTour: TourConfig = {
	id: 'locations',
	section: '/locations',
	adminOnly: false,
	steps: [
		{
			target: '[data-testid="locations-add-button"]',
			contentKey: 'locations.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="locations-list"]',
			contentKey: 'locations.step2',
			placement: 'top',
		},
	],
};
