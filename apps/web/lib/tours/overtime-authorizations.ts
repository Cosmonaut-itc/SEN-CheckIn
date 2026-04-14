import type { TourConfig } from './types';

/**
 * Guided tour for the overtime authorizations section.
 */
export const overtimeAuthorizationsTour: TourConfig = {
	id: 'overtime-authorizations',
	section: '/overtime-authorizations',
	adminOnly: false,
	steps: [
		{
			target: '[data-testid="overtime-create-trigger"]',
			contentKey: 'overtimeAuthorizations.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="overtime-filters"]',
			contentKey: 'overtimeAuthorizations.step2',
			placement: 'bottom',
		},
		{
			target: '[data-tour="overtime-list"]',
			contentKey: 'overtimeAuthorizations.step3',
			placement: 'top',
		},
	],
};
