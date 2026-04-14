import type { TourConfig } from './types';

/**
 * Guided tour for the attendance section.
 */
export const attendanceTour: TourConfig = {
	id: 'attendance',
	section: '/attendance',
	adminOnly: false,
	steps: [
		{
			target: '[data-tour="attendance-actions"]',
			contentKey: 'attendance.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="attendance-filters"]',
			contentKey: 'attendance.step2',
			placement: 'bottom',
		},
		{
			target: '[data-tour="attendance-list"]',
			contentKey: 'attendance.step3',
			placement: 'top',
		},
	],
};
