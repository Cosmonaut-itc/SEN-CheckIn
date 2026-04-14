import type { TourConfig } from './types';

/**
 * Guided tour for the organizations section.
 */
export const organizationsTour: TourConfig = {
	id: 'organizations',
	section: '/organizations',
	adminOnly: false,
	steps: [
		{
			target: '[data-testid="organizations-create-button"]',
			contentKey: 'organizations.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="organizations-list"]',
			contentKey: 'organizations.step2',
			placement: 'top',
		},
	],
};
