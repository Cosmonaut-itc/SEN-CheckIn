import type { TourConfig } from './types';

/**
 * Guided tour for the vacations section.
 */
export const vacationsTour: TourConfig = {
	id: 'vacations',
	section: '/vacations',
	adminOnly: false,
	steps: [
		{
			target: '[data-testid="vacations-create-button"]',
			contentKey: 'vacations.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="vacations-filters"]',
			contentKey: 'vacations.step2',
			placement: 'bottom',
		},
		{
			target: '[data-tour="vacations-list"]',
			contentKey: 'vacations.step3',
			placement: 'top',
		},
	],
};
