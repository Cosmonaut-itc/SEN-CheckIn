import type { TourConfig } from './types';

/**
 * Guided tour for the users section.
 */
export const usersTour: TourConfig = {
	id: 'users',
	section: '/users',
	adminOnly: false,
	steps: [
		{
			target: '[data-testid="users-create-button"]',
			contentKey: 'users.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="users-filters"]',
			contentKey: 'users.step2',
			placement: 'bottom',
		},
		{
			target: '[data-tour="users-list"]',
			contentKey: 'users.step3',
			placement: 'top',
		},
	],
};
