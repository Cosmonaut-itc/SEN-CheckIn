import { describe, expect, it } from 'vitest';

import rawMessages from '@/messages/es.json';

import { dashboardTour } from './dashboard';
import { schedulesTour } from './schedules';
import { getAllTourIds, getTourById, getTourByPath } from './registry';

const messages = (rawMessages as { default?: typeof rawMessages }).default ?? rawMessages;

describe('tour registry', () => {
	it('exposes complete spanish copy for payroll, PTU and aguinaldo tours', () => {
		expect(messages.Tours.payroll).toEqual({
			step1: expect.any(String),
			step2: expect.any(String),
			step3: expect.any(String),
			step4: expect.any(String),
			step5: expect.any(String),
			step6: expect.any(String),
			step7: expect.any(String),
			step8: expect.any(String),
		});
		expect(messages.Tours.payrollPtu).toEqual({
			step1: expect.any(String),
			step2: expect.any(String),
			step3: expect.any(String),
			step4: expect.any(String),
			step5: expect.any(String),
			step6: expect.any(String),
		});
		expect(messages.Tours.payrollAguinaldo).toEqual({
			step1: expect.any(String),
			step2: expect.any(String),
			step3: expect.any(String),
			step4: expect.any(String),
			step5: expect.any(String),
			step6: expect.any(String),
		});
	});

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
					target: '[data-tour="dashboard-map-summary"]',
					contentKey: 'dashboard.step3',
					placement: 'bottom',
				},
			],
		});
	});

	it('keeps the schedules tour bound to targets that exist on the default tab', () => {
		expect(schedulesTour.steps).toEqual([
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
				target: '[data-tour="schedules-templates-tab"]',
				contentKey: 'schedules.step3',
				placement: 'bottom',
			},
		]);
	});

	it('looks up tours by id', () => {
		expect(getTourById('dashboard')).toEqual(dashboardTour);
		expect(getTourById('employees')?.section).toBe('/employees');
		expect(getTourById('payroll-settings')?.section).toBe('/payroll-settings');
		expect(getTourById('payroll')?.steps).toEqual([
			{
				target: '[data-tour="payroll-tabs"]',
				contentKey: 'payroll.step1',
				placement: 'bottom',
			},
			{
				target: '[data-tour="payroll-legal-rules"]',
				contentKey: 'payroll.step2',
				placement: 'bottom',
			},
			{
				target: '[data-tour="payroll-insights"]',
				contentKey: 'payroll.step3',
				placement: 'bottom',
			},
			{
				target: '[data-tour="payroll-process"]',
				contentKey: 'payroll.step4',
				placement: 'left',
			},
			{
				target: '[data-tour="payroll-preview-table"]',
				contentKey: 'payroll.step5',
				placement: 'top',
			},
			{
				target: '[data-tour="payroll-run-history"]',
				contentKey: 'payroll.step6',
				placement: 'top',
			},
			{
				target: '[data-tour="payroll-tab-ptu"]',
				contentKey: 'payroll.step7',
				placement: 'bottom',
			},
			{
				target: '[data-tour="payroll-tab-aguinaldo"]',
				contentKey: 'payroll.step8',
				placement: 'bottom',
			},
		]);
		expect(getTourById('payroll-ptu')?.steps).toEqual([
			{
				target: '[data-tour="payroll-tab-ptu"]',
				contentKey: 'payrollPtu.step1',
				placement: 'bottom',
			},
			{
				target: '[data-tour="payroll-ptu-config"]',
				contentKey: 'payrollPtu.step2',
				placement: 'bottom',
			},
			{
				target: '[data-tour="payroll-ptu-actions"]',
				contentKey: 'payrollPtu.step3',
				placement: 'bottom',
			},
			{
				target: '[data-tour="payroll-ptu-summary"]',
				contentKey: 'payrollPtu.step4',
				placement: 'top',
			},
			{
				target: '[data-tour="payroll-ptu-table"]',
				contentKey: 'payrollPtu.step5',
				placement: 'top',
			},
			{
				target: '[data-tour="payroll-ptu-history"]',
				contentKey: 'payrollPtu.step6',
				placement: 'top',
			},
		]);
		expect(getTourById('payroll-aguinaldo')?.steps).toEqual([
			{
				target: '[data-tour="payroll-tab-aguinaldo"]',
				contentKey: 'payrollAguinaldo.step1',
				placement: 'bottom',
			},
			{
				target: '[data-tour="payroll-aguinaldo-config"]',
				contentKey: 'payrollAguinaldo.step2',
				placement: 'bottom',
			},
			{
				target: '[data-tour="payroll-aguinaldo-actions"]',
				contentKey: 'payrollAguinaldo.step3',
				placement: 'bottom',
			},
			{
				target: '[data-tour="payroll-aguinaldo-summary"]',
				contentKey: 'payrollAguinaldo.step4',
				placement: 'top',
			},
			{
				target: '[data-tour="payroll-aguinaldo-table"]',
				contentKey: 'payrollAguinaldo.step5',
				placement: 'top',
			},
			{
				target: '[data-tour="payroll-aguinaldo-history"]',
				contentKey: 'payrollAguinaldo.step6',
				placement: 'top',
			},
		]);
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
			'payroll-ptu',
			'payroll-aguinaldo',
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
