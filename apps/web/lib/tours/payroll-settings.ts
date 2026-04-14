import type { TourConfig } from './types';

/**
 * Guided tour for the payroll settings section.
 */
export const payrollSettingsTour: TourConfig = {
	id: 'payroll-settings',
	section: '/payroll-settings',
	adminOnly: false,
	steps: [
		{
			target: '[data-tour="payroll-settings-title"]',
			contentKey: 'payrollSettings.step1',
			placement: 'bottom',
		},
		{
			target: '[data-tour="payroll-settings-week-start"]',
			contentKey: 'payrollSettings.step2',
			placement: 'bottom',
		},
		{
			target: '[data-tour="payroll-holidays-sync"]',
			contentKey: 'payrollSettings.step3',
			placement: 'left',
		},
	],
};
