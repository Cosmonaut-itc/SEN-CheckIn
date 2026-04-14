import type { TourConfig } from './types';

/**
 * Guided tour for the job positions section.
 */
export const jobPositionsTour: TourConfig = {
	id: 'job-positions',
	section: '/job-positions',
	adminOnly: false,
	steps: [
		{
			target: '[data-testid="job-positions-add-button"]',
			contentKey: 'jobPositions.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="job-positions-list"]',
			contentKey: 'jobPositions.step2',
			placement: 'top',
		},
	],
};
