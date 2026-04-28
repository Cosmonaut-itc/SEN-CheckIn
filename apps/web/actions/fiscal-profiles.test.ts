import { beforeEach, describe, expect, it, vi } from 'vitest';

const employeeFiscalProfileGetMock = vi.fn();
const employeeFiscalProfilePutMock = vi.fn();
const organizationFiscalProfileGetMock = vi.fn();
const organizationFiscalProfilePutMock = vi.fn();
const payrollFiscalPreflightGetMock = vi.fn();

vi.mock('next/headers', () => ({
	headers: vi.fn(async () => ({
		get: (key: string) => (key === 'cookie' ? 'session=mock' : null),
	})),
}));

vi.mock('@/lib/server-api', () => ({
	createServerApiClient: vi.fn(() => ({
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
					}),
				},
			),
		},
	})),
}));

import {
	getEmployeeFiscalProfileAction,
	getOrganizationFiscalProfileAction,
	getPayrollFiscalPreflightAction,
	saveEmployeeFiscalProfileAction,
	saveOrganizationFiscalProfileAction,
} from '@/actions/fiscal-profiles';

describe('fiscal profile server actions', () => {
	beforeEach(() => {
		employeeFiscalProfileGetMock.mockReset();
		employeeFiscalProfilePutMock.mockReset();
		organizationFiscalProfileGetMock.mockReset();
		organizationFiscalProfilePutMock.mockReset();
		payrollFiscalPreflightGetMock.mockReset();
	});

	it('returns organization fiscal profile data', async () => {
		organizationFiscalProfileGetMock.mockResolvedValue({
			data: { data: { id: 'profile-1', organizationId: 'org-1' } },
			error: null,
		});

		const result = await getOrganizationFiscalProfileAction('org-1');

		expect(result.success).toBe(true);
		expect(result.data?.id).toBe('profile-1');
	});

	it('returns failure when saving an organization fiscal profile fails', async () => {
		organizationFiscalProfilePutMock.mockResolvedValue({
			error: {
				value: {
					error: {
						message: 'Payroll fiscal access required',
					},
				},
			},
		});

		const result = await saveOrganizationFiscalProfileAction({
			organizationId: 'org-1',
			legalName: 'ACME SA',
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe('Payroll fiscal access required');
	});

	it('returns employee fiscal profile data', async () => {
		employeeFiscalProfileGetMock.mockResolvedValue({
			data: { data: { id: 'employee-profile-1', employeeId: 'emp-1' } },
			error: null,
		});

		const result = await getEmployeeFiscalProfileAction('emp-1');

		expect(result.success).toBe(true);
		expect(result.data?.employeeId).toBe('emp-1');
	});

	it('saves employee fiscal profile data', async () => {
		employeeFiscalProfilePutMock.mockResolvedValue({
			data: { data: { id: 'employee-profile-1', employeeId: 'emp-1', satName: 'ANA' } },
			error: null,
		});

		const result = await saveEmployeeFiscalProfileAction({
			employeeId: 'emp-1',
			satName: 'ANA',
		});

		expect(employeeFiscalProfilePutMock).toHaveBeenCalledWith({ satName: 'ANA' });
		expect(result.success).toBe(true);
		expect(result.data?.satName).toBe('ANA');
	});

	it('returns payroll fiscal preflight data', async () => {
		payrollFiscalPreflightGetMock.mockResolvedValue({
			data: {
				data: {
					organizationId: 'org-1',
					payrollRunId: 'run-1',
					canPrepareFiscalVouchers: false,
					summary: {
						employeesTotal: 1,
						employeesReady: 0,
						employeesBlocked: 1,
						unsupportedConcepts: 0,
					},
					organizationIssues: [],
					employeeResults: [],
				},
			},
			error: null,
		});

		const result = await getPayrollFiscalPreflightAction('run-1');

		expect(result.success).toBe(true);
		expect(result.data?.canPrepareFiscalVouchers).toBe(false);
	});
});
