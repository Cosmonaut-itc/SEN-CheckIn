import type { Employee } from '@/lib/client-functions';

/**
 * Builds an employee fixture for employee component tests.
 *
 * @param overrides - Partial employee overrides for the current test case
 * @returns Employee fixture
 */
export function createEmployeeFixture(overrides: Partial<Employee> = {}): Employee {
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
		hireDate: new Date('2024-01-10T00:00:00.000Z'),
		dailyPay: 500,
		paymentFrequency: 'WEEKLY',
		employmentType: 'PERMANENT',
		isTrustEmployee: false,
		isDirectorAdminGeneralManager: false,
		isDomesticWorker: false,
		isPlatformWorker: false,
		platformHoursYear: 0,
		ptuEligibilityOverride: 'DEFAULT',
		aguinaldoDaysOverride: null,
		sbcDailyOverride: null,
		locationId: 'location-1',
		organizationId: 'org-1',
		userId: 'user-1',
		rekognitionUserId: null,
		shiftType: 'DIURNA',
		createdAt: new Date('2024-01-01T00:00:00.000Z'),
		updatedAt: new Date('2024-01-01T00:00:00.000Z'),
		...overrides,
	};
}
