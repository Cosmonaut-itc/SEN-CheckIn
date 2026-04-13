import { describe, expect, it, vi } from 'vitest';

import { fetchAllEmployeesListResult, fetchAllEmployeesPages } from '@/lib/fetch-all-employees';

describe('fetchAllEmployeesPages', () => {
	it('loads every employee page until the full list is collected', async () => {
		const fetchEmployees = vi
			.fn()
			.mockResolvedValueOnce({
				data: [
					{ id: 'emp-1', firstName: 'Ada', lastName: 'Lovelace' },
					{ id: 'emp-2', firstName: 'Grace', lastName: 'Hopper' },
				],
				pagination: {
					total: 3,
					limit: 2,
					offset: 0,
				},
			})
			.mockResolvedValueOnce({
				data: [{ id: 'emp-3', firstName: 'Katherine', lastName: 'Johnson' }],
				pagination: {
					total: 3,
					limit: 2,
					offset: 2,
				},
			});

		const employees = await fetchAllEmployeesPages({
			fetchEmployees,
			params: {
				organizationId: 'org-1',
				status: 'ACTIVE',
			},
			pageSize: 2,
		});

		expect(employees).toEqual([
			{ id: 'emp-1', firstName: 'Ada', lastName: 'Lovelace' },
			{ id: 'emp-2', firstName: 'Grace', lastName: 'Hopper' },
			{ id: 'emp-3', firstName: 'Katherine', lastName: 'Johnson' },
		]);
		expect(fetchEmployees).toHaveBeenNthCalledWith(1, {
			organizationId: 'org-1',
			status: 'ACTIVE',
			limit: 2,
			offset: 0,
		});
		expect(fetchEmployees).toHaveBeenNthCalledWith(2, {
			organizationId: 'org-1',
			status: 'ACTIVE',
			limit: 2,
			offset: 2,
		});
	});

	it('returns a paginated response shape for full employee selectors', async () => {
		const fetchEmployees = vi
			.fn()
			.mockResolvedValueOnce({
				data: [
					{ id: 'emp-1', firstName: 'Ada', lastName: 'Lovelace' },
					{ id: 'emp-2', firstName: 'Grace', lastName: 'Hopper' },
				],
				pagination: {
					total: 3,
					limit: 2,
					offset: 0,
				},
			})
			.mockResolvedValueOnce({
				data: [{ id: 'emp-3', firstName: 'Katherine', lastName: 'Johnson' }],
				pagination: {
					total: 3,
					limit: 2,
					offset: 2,
				},
			});

		const response = await fetchAllEmployeesListResult({
			fetchEmployees,
			params: {
				organizationId: 'org-1',
			},
			pageSize: 2,
		});

		expect(response).toEqual({
			data: [
				{ id: 'emp-1', firstName: 'Ada', lastName: 'Lovelace' },
				{ id: 'emp-2', firstName: 'Grace', lastName: 'Hopper' },
				{ id: 'emp-3', firstName: 'Katherine', lastName: 'Johnson' },
			],
			pagination: {
				total: 3,
				limit: 3,
				offset: 0,
			},
		});
	});
});
