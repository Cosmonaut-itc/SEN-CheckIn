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
		expect(getTourById('unknown-tour')).toBeUndefined();
	});

	it('matches tours by pathname prefix', () => {
		expect(getTourByPath('/dashboard')).toEqual(dashboardTour);
		expect(getTourByPath('/dashboard/summary')).toEqual(dashboardTour);
		expect(getTourByPath('/employees')).toBeUndefined();
	});

	it('returns the registered tour ids', () => {
		expect(getAllTourIds()).toEqual(['dashboard']);
	});
});
