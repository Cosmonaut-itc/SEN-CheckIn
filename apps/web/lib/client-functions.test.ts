import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEmployeesListGet, mockEmployeeDetailGet } = vi.hoisted(() => ({
	mockEmployeesListGet: vi.fn(),
	mockEmployeeDetailGet: vi.fn(),
}));

vi.mock('@/lib/api', () => {
	const employeesResource = new Proxy<Record<string | symbol, unknown>>(
		{},
		{
			get: (_target, property: string | symbol): unknown => {
				if (property === 'get') {
					return mockEmployeesListGet;
				}
				if (typeof property === 'string') {
					return { get: mockEmployeeDetailGet };
				}
				return undefined;
			},
		},
	);

	return {
		API_BASE_URL: 'http://localhost:3000',
		api: {
			employees: employeesResource,
		},
	};
});

vi.mock('@/lib/auth-client', () => ({
	authClient: {},
}));

import type { Employee } from '@/lib/client-functions';
import { fetchEmployeeById, fetchEmployeesList } from '@/lib/client-functions';

type EmployeeApiPayload = Omit<
	Employee,
	| 'dailyPay'
	| 'platformHoursYear'
	| 'hireDate'
	| 'createdAt'
	| 'updatedAt'
	| 'lastPayrollDate'
> & {
	dailyPay: number | string;
	platformHoursYear: number | string | null;
	hireDate: string | null;
	createdAt: string;
	updatedAt: string;
	lastPayrollDate?: string | null;
};

/**
 * Builds an employee API payload fixture with serialized date fields.
 *
 * @param overrides - Partial payload overrides
 * @returns Employee payload fixture
 */
function createEmployeePayloadFixture(
	overrides: Partial<EmployeeApiPayload> = {},
): EmployeeApiPayload {
	return {
		id: 'employee-1',
		code: 'EMP-0001',
		firstName: 'Ana',
		lastName: 'Pérez',
		nss: '12345678901',
		rfc: 'PEGA900101ABC',
		email: 'ana@example.com',
		phone: '5512345678',
		jobPositionId: 'job-1',
		jobPositionName: 'Supervisora',
		department: 'Operaciones',
		status: 'ACTIVE',
		hireDate: '2024-01-10T00:00:00.000Z',
		dailyPay: '500',
		paymentFrequency: 'WEEKLY',
		employmentType: 'PERMANENT',
		isTrustEmployee: false,
		isDirectorAdminGeneralManager: false,
		isDomesticWorker: false,
		isPlatformWorker: false,
		platformHoursYear: '0',
		ptuEligibilityOverride: 'DEFAULT',
		aguinaldoDaysOverride: null,
		sbcDailyOverride: null,
		locationId: 'location-1',
		organizationId: 'org-1',
		userId: 'user-1',
		rekognitionUserId: null,
		documentProgressPercent: 80,
		documentMissingCount: 2,
		documentWorkflowStatus: 'IN_REVIEW',
		disciplinaryMeasuresCount: 1,
		disciplinaryOpenMeasuresCount: 1,
		lastPayrollDate: '2024-01-15T00:00:00.000Z',
		shiftType: 'DIURNA',
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-20T00:00:00.000Z',
		...overrides,
	};
}

/**
 * Verifies that employee date fields are normalized into Date instances.
 *
 * @param employee - Normalized employee record
 * @returns Nothing
 */
function expectNormalizedEmployeeDates(employee: Employee): void {
	expect(employee.hireDate).toBeInstanceOf(Date);
	expect(employee.createdAt).toBeInstanceOf(Date);
	expect(employee.updatedAt).toBeInstanceOf(Date);
	expect(employee.lastPayrollDate).toBeInstanceOf(Date);
	expect(employee.hireDate?.toISOString()).toBe('2024-01-10T00:00:00.000Z');
	expect(employee.createdAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');
	expect(employee.updatedAt.toISOString()).toBe('2024-01-20T00:00:00.000Z');
	expect(employee.lastPayrollDate?.toISOString()).toBe('2024-01-15T00:00:00.000Z');
}

describe('employee client functions', () => {
	beforeEach(() => {
		mockEmployeesListGet.mockReset();
		mockEmployeeDetailGet.mockReset();
	});

	it('normalizes serialized employee dates in list responses', async () => {
		mockEmployeesListGet.mockResolvedValue({
			data: {
				data: [createEmployeePayloadFixture()],
				pagination: { total: 1, limit: 50, offset: 0 },
			},
			error: null,
			status: 200,
		});

		const response = await fetchEmployeesList();

		expect(response.data).toHaveLength(1);
		expectNormalizedEmployeeDates(response.data[0]);
	});

	it('normalizes serialized employee dates in detail responses', async () => {
		mockEmployeeDetailGet.mockResolvedValue({
			data: {
				data: createEmployeePayloadFixture(),
			},
			error: null,
			status: 200,
		});

		const employee = await fetchEmployeeById('employee-1');

		expect(employee).not.toBeNull();
		expectNormalizedEmployeeDates(employee as Employee);
	});
});
