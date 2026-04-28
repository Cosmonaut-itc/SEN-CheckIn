import { beforeEach, describe, expect, it, vi } from 'vitest';

const employeeFiscalProfileGetMock = vi.fn();
const employeeFiscalProfilePutMock = vi.fn();
const organizationFiscalProfileGetMock = vi.fn();
const organizationFiscalProfilePutMock = vi.fn();
const payrollFiscalPreflightGetMock = vi.fn();
const payrollFiscalVouchersPreparePostMock = vi.fn();

vi.mock('@/lib/api', () => ({
	api: {
		employees: new Proxy<Record<string, unknown>>(
			{},
			{
				get: () => ({
					'fiscal-profile': {
						get: employeeFiscalProfileGetMock,
						put: employeeFiscalProfilePutMock,
					},
				}),
			},
		),
		organizations: new Proxy<Record<string, unknown>>(
			{},
			{
				get: () => ({
					'fiscal-profile': {
						get: organizationFiscalProfileGetMock,
						put: organizationFiscalProfilePutMock,
					},
				}),
			},
		),
		payroll: {
			runs: new Proxy<Record<string, unknown>>(
				{},
				{
					get: () => ({
						'fiscal-preflight': {
							get: payrollFiscalPreflightGetMock,
						},
						'fiscal-vouchers': {
							prepare: {
								post: payrollFiscalVouchersPreparePostMock,
							},
						},
					}),
				},
			),
		},
	},
}));

import {
	fetchEmployeeFiscalProfile,
	fetchOrganizationFiscalProfile,
	fetchPayrollFiscalPreflight,
	preparePayrollFiscalVouchers,
	saveEmployeeFiscalProfile,
	saveOrganizationFiscalProfile,
} from '@/lib/fiscal-profiles';

describe('fiscal profile client fetchers', () => {
	beforeEach(() => {
		employeeFiscalProfileGetMock.mockReset();
		employeeFiscalProfilePutMock.mockReset();
		organizationFiscalProfileGetMock.mockReset();
		organizationFiscalProfilePutMock.mockReset();
		payrollFiscalPreflightGetMock.mockReset();
		payrollFiscalVouchersPreparePostMock.mockReset();
	});

	it('reads organization fiscal profiles from the organization endpoint', async () => {
		organizationFiscalProfileGetMock.mockResolvedValue({
			data: { data: { id: 'profile-1', organizationId: 'org-1' } },
			error: null,
		});

		const result = await fetchOrganizationFiscalProfile('org-1');

		expect(organizationFiscalProfileGetMock).toHaveBeenCalledTimes(1);
		expect(result?.id).toBe('profile-1');
	});

	it('saves organization fiscal profiles with the profile payload', async () => {
		organizationFiscalProfilePutMock.mockResolvedValue({
			data: { data: { id: 'profile-1', organizationId: 'org-1', legalName: 'ACME SA' } },
			error: null,
		});

		const result = await saveOrganizationFiscalProfile({
			organizationId: 'org-1',
			legalName: 'ACME SA',
			rfc: 'AAA010101AAA',
		});

		expect(organizationFiscalProfilePutMock).toHaveBeenCalledWith({
			legalName: 'ACME SA',
			rfc: 'AAA010101AAA',
		});
		expect(result?.legalName).toBe('ACME SA');
	});

	it('reads employee fiscal profiles from the employee endpoint', async () => {
		employeeFiscalProfileGetMock.mockResolvedValue({
			data: { data: { id: 'employee-profile-1', employeeId: 'emp-1' } },
			error: null,
		});

		const result = await fetchEmployeeFiscalProfile('emp-1');

		expect(employeeFiscalProfileGetMock).toHaveBeenCalledTimes(1);
		expect(result?.employeeId).toBe('emp-1');
	});

	it('saves employee fiscal profiles with the profile payload', async () => {
		employeeFiscalProfilePutMock.mockResolvedValue({
			data: { data: { id: 'employee-profile-1', employeeId: 'emp-1', satName: 'ANA' } },
			error: null,
		});

		const result = await saveEmployeeFiscalProfile({
			employeeId: 'emp-1',
			satName: 'ANA',
			rfc: 'PEGA900101ABC',
		});

		expect(employeeFiscalProfilePutMock).toHaveBeenCalledWith({
			satName: 'ANA',
			rfc: 'PEGA900101ABC',
		});
		expect(result?.satName).toBe('ANA');
	});

	it('reads payroll fiscal preflight from the payroll run endpoint', async () => {
		payrollFiscalPreflightGetMock.mockResolvedValue({
			data: {
				data: {
					organizationId: 'org-1',
					payrollRunId: 'run-1',
					canPrepareFiscalVouchers: true,
					summary: {
						employeesTotal: 1,
						employeesReady: 1,
						employeesBlocked: 0,
						unsupportedConcepts: 0,
					},
					organizationIssues: [],
					employeeResults: [],
				},
			},
			error: null,
		});

		const result = await fetchPayrollFiscalPreflight('run-1');

		expect(payrollFiscalPreflightGetMock).toHaveBeenCalledTimes(1);
		expect(result.canPrepareFiscalVouchers).toBe(true);
	});

	it('prepares fiscal vouchers for a payroll run', async () => {
		payrollFiscalVouchersPreparePostMock.mockResolvedValue({
			data: {
				data: {
					statusSummary: {
						total: 1,
						blocked: 0,
						ready: 1,
						stamped: 0,
						failed: 0,
						cancelled: 0,
					},
					vouchers: [],
				},
			},
			error: null,
		});

		const result = await preparePayrollFiscalVouchers('run-1');

		expect(payrollFiscalVouchersPreparePostMock).toHaveBeenCalledWith({});
		expect(result.statusSummary.ready).toBe(1);
	});
});
