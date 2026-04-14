import type { TourConfig } from './types';

/**
 * Guided tour for the devices section.
 */
export const devicesTour: TourConfig = {
	id: 'devices',
	section: '/devices',
	adminOnly: false,
	steps: [
		{
			target: '[data-testid="devices-setup-button"]',
			contentKey: 'devices.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="devices-list"]',
			contentKey: 'devices.step2',
			placement: 'top',
		},
	],
};
