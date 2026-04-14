import type { TourConfig } from './types';

/**
 * Guided tour for the API keys section.
 */
export const apiKeysTour: TourConfig = {
	id: 'api-keys',
	section: '/api-keys',
	adminOnly: false,
	steps: [
		{
			target: '[data-testid="api-keys-create-button"]',
			contentKey: 'apiKeys.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="api-keys-list"]',
			contentKey: 'apiKeys.step2',
			placement: 'top',
		},
	],
};
