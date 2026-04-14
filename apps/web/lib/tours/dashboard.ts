import type { TourConfig } from './types';

/**
 * Guided tour for the main dashboard section.
 */
export const dashboardTour: TourConfig = {
	id: 'dashboard',
	section: '/dashboard',
	adminOnly: false,
	steps: [
		{
			target: '[data-tour="dashboard-counters"]',
			contentKey: 'dashboard.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="dashboard-present"]',
			contentKey: 'dashboard.step2',
			placement: 'bottom',
		},
		{
			target: '[data-tour="dashboard-map-summary"]',
			contentKey: 'dashboard.step3',
			placement: 'bottom',
		},
	],
};
