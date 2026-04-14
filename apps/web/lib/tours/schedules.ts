import type { TourConfig } from './types';

/**
 * Guided tour for the schedules section.
 */
export const schedulesTour: TourConfig = {
	id: 'schedules',
	section: '/schedules',
	adminOnly: false,
	steps: [
		{
			target: '[data-tour="schedules-tabs"]',
			contentKey: 'schedules.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="schedules-calendar"]',
			contentKey: 'schedules.step2',
			placement: 'top',
		},
		{
			target: '[data-tour="schedule-templates-add"]',
			contentKey: 'schedules.step3',
			placement: 'bottom',
		},
	],
};
