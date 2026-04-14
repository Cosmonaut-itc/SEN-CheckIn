import type { TourConfig } from './types';

/**
 * Guided tour for the disciplinary measures section.
 */
export const disciplinaryMeasuresTour: TourConfig = {
	id: 'disciplinary-measures',
	section: '/disciplinary-measures',
	adminOnly: false,
	steps: [
		{
			target: '[data-testid="disciplinary-measures-create-button"]',
			contentKey: 'disciplinaryMeasures.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="disciplinary-measures-filters"]',
			contentKey: 'disciplinaryMeasures.step2',
			placement: 'bottom',
		},
		{
			target: '[data-tour="disciplinary-measures-list"]',
			contentKey: 'disciplinaryMeasures.step3',
			placement: 'top',
		},
	],
};
