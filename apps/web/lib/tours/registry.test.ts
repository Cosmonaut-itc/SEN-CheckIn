import { describe, expect, it } from 'vitest';

import { dashboardTour } from './dashboard';
import { getAllTourIds, getTourById, getTourByPath } from './registry';

describe('tour registry', () => {
	it('registers the dashboard tour with the expected step selectors', () => {
		expect(dashboardTour).toEqual({
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
					target: '[data-tour="dashboard-map"]',
					contentKey: 'dashboard.step3',
					placement: 'top',
				},
			],
		});
	});

	it('looks up tours by id', () => {
		expect(getTourById('dashboard')).toEqual(dashboardTour);
		expect(getTourById('employees')?.section).toBe('/employees');
		expect(getTourById('payroll-settings')?.section).toBe('/payroll-settings');
		expect(getTourById('unknown-tour')).toBeUndefined();
	});

	it('matches tours by pathname prefix', () => {
		expect(getTourByPath('/dashboard')).toEqual(dashboardTour);
		expect(getTourByPath('/dashboard/summary')).toEqual(dashboardTour);
		expect(getTourByPath('/employees')?.id).toBe('employees');
		expect(getTourByPath('/payroll-settings')?.id).toBe('payroll-settings');
	});

	it('returns the registered tour ids', () => {
		expect(getAllTourIds()).toEqual([
			'dashboard',
			'employees',
			'locations',
			'devices',
			'job-positions',
			'attendance',
			'schedules',
			'vacations',
			'incapacities',
			'payroll',
			'payroll-settings',
			'users',
			'organizations',
			'api-keys',
			'overtime-authorizations',
			'deductions',
			'disciplinary-measures',
		]);
	});
});
