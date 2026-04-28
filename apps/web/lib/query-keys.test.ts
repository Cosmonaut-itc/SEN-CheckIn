import { describe, expect, it } from 'vitest';

import { mutationKeys, queryKeys } from '@/lib/query-keys';

describe('staffing coverage query keys', () => {
	it('builds typed staffing requirement list and detail keys', () => {
		expect(
			queryKeys.staffingRequirements.list({
				organizationId: 'org-1',
				locationId: 'location-1',
				jobPositionId: 'job-position-1',
				limit: 20,
				offset: 0,
			}),
		).toEqual([
			'staffingRequirements',
			'list',
			{
				organizationId: 'org-1',
				locationId: 'location-1',
				jobPositionId: 'job-position-1',
				limit: 20,
				offset: 0,
			},
		]);
		expect(queryKeys.staffingRequirements.detail('requirement-1')).toEqual([
			'staffingRequirements',
			'detail',
			'requirement-1',
		]);
	});

	it('builds typed attendance staffing coverage keys', () => {
		expect(
			queryKeys.attendance.staffingCoverage({
				organizationId: 'org-1',
				locationId: 'location-1',
				date: '2026-04-20',
			}),
		).toEqual([
			'attendance',
			'staffingCoverage',
			{
				organizationId: 'org-1',
				locationId: 'location-1',
				date: '2026-04-20',
			},
		]);
		expect(
			queryKeys.attendance.staffingCoverageStats({
				organizationId: 'org-1',
				days: 30,
			}),
		).toEqual([
			'attendance',
			'staffingCoverageStats',
			{
				organizationId: 'org-1',
				days: 30,
			},
		]);
	});

	it('builds dashboard staffing coverage stats keys', () => {
		expect(
			queryKeys.dashboard.staffingCoverage({
				organizationId: 'org-1',
				locationId: 'location-1',
				date: '2026-04-20',
			}),
		).toEqual([
			'dashboard',
			'staffingCoverage',
			{
				organizationId: 'org-1',
				locationId: 'location-1',
				date: '2026-04-20',
			},
		]);
		expect(
			queryKeys.dashboard.staffingCoverageStats({
				organizationId: 'org-1',
				days: 14,
			}),
		).toEqual([
			'dashboard',
			'staffingCoverageStats',
			{
				organizationId: 'org-1',
				days: 14,
			},
		]);
	});

	it('exposes staffing requirement mutation keys', () => {
		expect(mutationKeys.staffingRequirements.create).toEqual([
			'staffingRequirements',
			'create',
		]);
		expect(mutationKeys.staffingRequirements.update).toEqual([
			'staffingRequirements',
			'update',
		]);
		expect(mutationKeys.staffingRequirements.delete).toEqual([
			'staffingRequirements',
			'delete',
		]);
	});
});
