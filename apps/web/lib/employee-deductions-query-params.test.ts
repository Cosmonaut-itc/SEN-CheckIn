import { describe, expect, it } from 'vitest';

import {
	buildEmployeeDeductionsQueryParams,
	buildOrganizationDeductionsQueryParams,
} from '@/lib/employee-deductions-query-params';

describe('employee deduction query param builders', () => {
	it('omits undefined employee filters from the employee-scoped query params', () => {
		expect(
			buildEmployeeDeductionsQueryParams({
				organizationId: 'org-1',
				employeeId: 'emp-1',
				status: undefined,
				type: undefined,
			}),
		).toEqual({
			organizationId: 'org-1',
			employeeId: 'emp-1',
		});
	});

	it('omits undefined organization filters from the organization-scoped query params', () => {
		expect(
			buildOrganizationDeductionsQueryParams({
				organizationId: 'org-1',
				limit: 20,
				offset: 0,
				employeeId: undefined,
				status: undefined,
				type: undefined,
			}),
		).toEqual({
			organizationId: 'org-1',
			limit: 20,
			offset: 0,
		});
	});
});
