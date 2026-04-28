import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockEmployeesListGet,
	mockEmployeeDetailGet,
	mockEmployeesActiveCountsByLocationGet,
	mockAttendancePresentGet,
	mockAttendanceTimelineGet,
	mockAttendanceHourlyGet,
	mockAttendanceStaffingCoverageGet,
	mockAttendanceStaffingCoverageStatsGet,
	mockStaffingRequirementsGet,
	mockDevicesStatusSummaryGet,
	mockWeatherGet,
} = vi.hoisted(() => ({
	mockEmployeesListGet: vi.fn(),
	mockEmployeeDetailGet: vi.fn(),
	mockEmployeesActiveCountsByLocationGet: vi.fn(),
	mockAttendancePresentGet: vi.fn(),
	mockAttendanceTimelineGet: vi.fn(),
	mockAttendanceHourlyGet: vi.fn(),
	mockAttendanceStaffingCoverageGet: vi.fn(),
	mockAttendanceStaffingCoverageStatsGet: vi.fn(),
	mockStaffingRequirementsGet: vi.fn(),
	mockDevicesStatusSummaryGet: vi.fn(),
	mockWeatherGet: vi.fn(),
}));

vi.mock('@/lib/api', () => {
	const employeesResource = new Proxy<Record<string | symbol, unknown>>(
		{},
		{
			get: (_target, property: string | symbol): unknown => {
				if (property === 'get') {
					return mockEmployeesListGet;
				}
				if (property === 'active-counts-by-location') {
					return { get: mockEmployeesActiveCountsByLocationGet };
				}
				if (typeof property === 'string') {
					return { get: mockEmployeeDetailGet };
				}
				return undefined;
			},
		},
	);

	const devicesResource = new Proxy<Record<string | symbol, unknown>>(
		{},
		{
			get: (_target, property: string | symbol): unknown => {
				if (property === 'status-summary') {
					return { get: mockDevicesStatusSummaryGet };
				}
				return undefined;
			},
		},
	);

	return {
		API_BASE_URL: 'http://localhost:3000',
		api: {
			employees: employeesResource,
			attendance: {
				present: { get: mockAttendancePresentGet },
				timeline: { get: mockAttendanceTimelineGet },
				hourly: { get: mockAttendanceHourlyGet },
				'staffing-coverage': {
					get: mockAttendanceStaffingCoverageGet,
					stats: { get: mockAttendanceStaffingCoverageStatsGet },
				},
			},
			'staffing-requirements': { get: mockStaffingRequirementsGet },
			devices: devicesResource,
			weather: { get: mockWeatherGet },
		},
	};
});

vi.mock('@/lib/auth-client', () => ({
	authClient: {},
}));

import type {
	AttendanceType,
	DailyStaffingCoverage,
	DeviceStatusRecord,
	Employee,
	StaffingCoverageStats,
	StaffingRequirement,
	TimelineEvent,
	WeatherRecord,
} from '@/lib/client-functions';
import {
	fetchAttendancePresent,
	fetchAttendanceHourly,
	fetchAttendanceStaffingCoverage,
	fetchAttendanceStaffingCoverageStats,
	fetchAttendanceTimeline,
	fetchDashboardLocationCapacity,
	fetchDeviceStatusSummary,
	fetchEmployeeById,
	fetchEmployeesList,
	fetchStaffingRequirementsList,
	fetchWeather,
} from '@/lib/client-functions';

type EmployeeApiPayload = Omit<
	Employee,
	'dailyPay' | 'platformHoursYear' | 'hireDate' | 'createdAt' | 'updatedAt' | 'lastPayrollDate'
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

/**
 * Builds a dashboard timeline event payload fixture.
 *
 * @param overrides - Partial payload overrides
 * @returns Timeline event fixture
 */
function createTimelineEventFixture(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
	return {
		id: 'attendance-1',
		employeeId: 'employee-1',
		employeeName: 'Ana Pérez',
		employeeCode: 'EMP-0001',
		locationId: 'location-1',
		locationName: 'Sucursal Centro',
		timestamp: '2026-04-21T14:05:00.000Z',
		type: 'CHECK_IN' as AttendanceType,
		isLate: false,
		...overrides,
	};
}

/**
 * Builds a device status summary payload fixture.
 *
 * @param overrides - Partial payload overrides
 * @returns Device status fixture
 */
function createDeviceStatusFixture(
	overrides: Partial<DeviceStatusRecord> = {},
): DeviceStatusRecord {
	return {
		id: 'device-1',
		code: 'DEV-001',
		name: 'Kiosco centro',
		status: 'ONLINE',
		batteryLevel: 82,
		lastHeartbeat: '2026-04-21T15:10:00.000Z',
		locationId: 'location-1',
		locationName: 'Sucursal Centro',
		...overrides,
	};
}

/**
 * Builds a weather payload fixture.
 *
 * @param overrides - Partial payload overrides
 * @returns Weather fixture
 */
function createWeatherFixture(overrides: Partial<WeatherRecord> = {}): WeatherRecord {
	return {
		locationId: 'location-1',
		locationName: 'Sucursal Centro',
		temperature: 28,
		condition: 'cielo claro',
		high: 31,
		low: 22,
		humidity: 54,
		...overrides,
	};
}

/**
 * Builds a staffing requirement payload fixture.
 *
 * @param overrides - Partial payload overrides
 * @returns Staffing requirement payload fixture
 */
function createStaffingRequirementFixture(
	overrides: Partial<StaffingRequirement> = {},
): StaffingRequirement {
	return {
		id: 'requirement-1',
		organizationId: 'org-1',
		locationId: 'location-1',
		jobPositionId: 'job-position-1',
		minimumRequired: 3,
		createdAt: new Date('2026-04-01T00:00:00.000Z'),
		updatedAt: new Date('2026-04-02T00:00:00.000Z'),
		...overrides,
	};
}

/**
 * Builds a daily staffing coverage fixture.
 *
 * @param overrides - Partial payload overrides
 * @returns Daily staffing coverage fixture
 */
function createDailyStaffingCoverageFixture(
	overrides: Partial<DailyStaffingCoverage> = {},
): DailyStaffingCoverage {
	return {
		dateKey: '2026-04-20',
		data: [
			{
				requirementId: 'requirement-1',
				locationId: 'location-1',
				locationName: 'Sucursal Centro',
				jobPositionId: 'job-position-1',
				jobPositionName: 'Guardia',
				minimumRequired: 2,
				scheduledCount: 2,
				arrivedCount: 1,
				missingCount: 1,
				coveragePercent: 50,
				isComplete: false,
				employees: [
					{
						employeeId: 'employee-1',
						employeeName: 'Ana Pérez',
						employeeCode: 'EMP-001',
						status: 'ARRIVED',
						checkedInAt: new Date('2026-04-20T14:00:00.000Z'),
						attendanceType: 'CHECK_IN',
					},
					{
						employeeId: 'employee-2',
						employeeName: 'Luis García',
						employeeCode: 'EMP-002',
						status: 'MISSING',
						checkedInAt: null,
						attendanceType: null,
					},
				],
			},
		],
		...overrides,
	};
}

/**
 * Builds a staffing coverage stats fixture.
 *
 * @param overrides - Partial payload overrides
 * @returns Staffing coverage stats fixture
 */
function createStaffingCoverageStatsFixture(
	overrides: Partial<StaffingCoverageStats> = {},
): StaffingCoverageStats {
	return {
		data: [
			{
				requirementId: 'requirement-1',
				locationId: 'location-1',
				locationName: 'Sucursal Centro',
				jobPositionId: 'job-position-1',
				jobPositionName: 'Guardia',
				minimumRequired: 2,
				daysEvaluated: 30,
				completeDays: 20,
				incompleteDays: 10,
				averageCoveragePercent: 87.5,
				worstCoveragePercent: 50,
				currentStreakIncompleteDays: 1,
				lastIncompleteDateKey: '2026-04-20',
			},
		],
		summary: {
			requirementsEvaluated: 1,
			completeToday: 0,
			incompleteToday: 1,
			averageCoveragePercent30d: 87.5,
			days: 30,
		},
		...overrides,
	};
}

describe('employee client functions', () => {
	beforeEach(() => {
		mockEmployeesListGet.mockReset();
		mockEmployeeDetailGet.mockReset();
		mockEmployeesActiveCountsByLocationGet.mockReset();
		mockAttendancePresentGet.mockReset();
		mockAttendanceTimelineGet.mockReset();
		mockAttendanceHourlyGet.mockReset();
		mockAttendanceStaffingCoverageGet.mockReset();
		mockAttendanceStaffingCoverageStatsGet.mockReset();
		mockStaffingRequirementsGet.mockReset();
		mockDevicesStatusSummaryGet.mockReset();
		mockWeatherGet.mockReset();
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

describe('dashboard v2 client functions', () => {
	beforeEach(() => {
		mockEmployeesActiveCountsByLocationGet.mockReset();
		mockAttendanceTimelineGet.mockReset();
		mockAttendanceHourlyGet.mockReset();
		mockAttendanceStaffingCoverageGet.mockReset();
		mockAttendanceStaffingCoverageStatsGet.mockReset();
		mockStaffingRequirementsGet.mockReset();
		mockDevicesStatusSummaryGet.mockReset();
		mockWeatherGet.mockReset();
	});

	it('returns an empty timeline when organizationId is null', async () => {
		const response = await fetchAttendanceTimeline({
			organizationId: null,
		});

		expect(response).toEqual({
			data: [],
			lateTotal: 0,
		});
		expect(mockAttendanceTimelineGet).not.toHaveBeenCalled();
	});

	it('normalizes serialized attendance present timestamps into Date instances', async () => {
		mockAttendancePresentGet.mockResolvedValue({
			data: {
				data: [
					{
						employeeId: 'employee-1',
						employeeName: 'Ana Pérez',
						employeeCode: 'EMP-0001',
						deviceId: 'device-1',
						locationId: 'location-1',
						locationName: 'Sucursal Centro',
						checkedInAt: '2026-04-21T14:05:00.000Z',
					},
				],
			},
			error: null,
			status: 200,
		});

		const response = await fetchAttendancePresent({
			organizationId: 'org-1',
			fromDate: new Date('2026-04-21T00:00:00.000Z'),
			toDate: new Date('2026-04-21T23:59:59.999Z'),
		});

		expect(response).toHaveLength(1);
		expect(response[0]?.checkedInAt).toBeInstanceOf(Date);
		expect(response[0]?.checkedInAt.toISOString()).toBe('2026-04-21T14:05:00.000Z');
		expect(mockAttendancePresentGet).toHaveBeenCalledWith({
			$query: {
				organizationId: 'org-1',
				fromDate: new Date('2026-04-21T00:00:00.000Z'),
				toDate: new Date('2026-04-21T23:59:59.999Z'),
			},
		});
	});

	it('fetches attendance present with no explicit date range', async () => {
		mockAttendancePresentGet.mockResolvedValue({
			data: {
				data: [],
			},
			error: null,
			status: 200,
		});

		const response = await fetchAttendancePresent();

		expect(response).toEqual([]);
		expect(mockAttendancePresentGet).toHaveBeenCalledWith({
			$query: {},
		});
		const query = mockAttendancePresentGet.mock.calls[0]?.[0]?.$query;
		expect(Object.hasOwn(query ?? {}, 'organizationId')).toBe(false);
	});

	it('fetches attendance timeline from the API', async () => {
		mockAttendanceTimelineGet.mockResolvedValue({
			data: {
				data: [createTimelineEventFixture()],
				pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
				summary: { lateTotal: 1 },
			},
			error: null,
			status: 200,
		});

		const response = await fetchAttendanceTimeline({
			organizationId: 'org-1',
			kind: 'late',
			limit: 50,
			offset: 0,
		});

		expect(response).toEqual({
			data: [createTimelineEventFixture()],
			lateTotal: 1,
		});
		expect(mockAttendanceTimelineGet).toHaveBeenCalledWith({
			$query: {
				organizationId: 'org-1',
				kind: 'late',
				limit: 50,
				offset: 0,
			},
		});
	});

	it('fetches every attendance timeline page while preserving late totals', async () => {
		mockAttendanceTimelineGet
			.mockResolvedValueOnce({
				data: {
					data: [createTimelineEventFixture()],
					pagination: { total: 2, limit: 1, offset: 0, hasMore: true },
					summary: { lateTotal: 2 },
				},
				error: null,
				status: 200,
			})
			.mockResolvedValueOnce({
				data: {
					data: [
						createTimelineEventFixture({
							id: 'attendance-2',
						}),
					],
					pagination: { total: 2, limit: 1, offset: 1, hasMore: false },
					summary: { lateTotal: 2 },
				},
				error: null,
				status: 200,
			});

		const response = await fetchAttendanceTimeline({
			organizationId: 'org-1',
			limit: 1,
		});

		expect(response).toEqual({
			data: [
				createTimelineEventFixture(),
				createTimelineEventFixture({
					id: 'attendance-2',
				}),
			],
			lateTotal: 2,
		});
		expect(mockAttendanceTimelineGet).toHaveBeenNthCalledWith(1, {
			$query: {
				organizationId: 'org-1',
				limit: 1,
				offset: 0,
			},
		});
		expect(mockAttendanceTimelineGet).toHaveBeenNthCalledWith(2, {
			$query: {
				organizationId: 'org-1',
				limit: 1,
				offset: 1,
			},
		});
	});

	it('uses a positive timeline page size when the requested limit is zero', async () => {
		mockAttendanceTimelineGet
			.mockResolvedValueOnce({
				data: {
					data: [createTimelineEventFixture()],
					pagination: { total: 2, offset: 0, hasMore: true },
					summary: { lateTotal: 2 },
				},
				error: null,
				status: 200,
			})
			.mockResolvedValueOnce({
				data: {
					data: [
						createTimelineEventFixture({
							id: 'attendance-2',
						}),
					],
					pagination: { total: 2, offset: 1, hasMore: false },
					summary: { lateTotal: 2 },
				},
				error: null,
				status: 200,
			});

		const response = await fetchAttendanceTimeline({
			organizationId: 'org-1',
			limit: 0,
		});

		expect(response.data).toHaveLength(2);
		expect(mockAttendanceTimelineGet).toHaveBeenNthCalledWith(1, {
			$query: {
				organizationId: 'org-1',
				limit: 1,
				offset: 0,
			},
		});
		expect(mockAttendanceTimelineGet).toHaveBeenNthCalledWith(2, {
			$query: {
				organizationId: 'org-1',
				limit: 1,
				offset: 1,
			},
		});
	});

	it('continues timeline pagination past the defensive page budget when total is known', async () => {
		mockAttendanceTimelineGet.mockImplementation(() => {
			const pageIndex = mockAttendanceTimelineGet.mock.calls.length - 1;

			return Promise.resolve({
				data: {
					data: [
						createTimelineEventFixture({
							id: `attendance-${pageIndex + 1}`,
						}),
					],
					pagination: { total: 21, limit: 1, offset: pageIndex, hasMore: pageIndex < 20 },
					summary: { lateTotal: 1 },
				},
				error: null,
				status: 200,
			});
		});

		const response = await fetchAttendanceTimeline({
			organizationId: 'org-1',
			limit: 1,
		});

		expect(response.data).toHaveLength(21);
		expect(mockAttendanceTimelineGet).toHaveBeenCalledTimes(21);
		expect(mockAttendanceTimelineGet).toHaveBeenLastCalledWith({
			$query: {
				organizationId: 'org-1',
				limit: 1,
				offset: 20,
			},
		});
	});

	it('stops timeline pagination at the known total when starting from a non-zero offset', async () => {
		mockAttendanceTimelineGet.mockResolvedValue({
			data: {
				data: [
					createTimelineEventFixture({
						id: 'attendance-21',
					}),
				],
				pagination: { total: 21, limit: 1, offset: 20, hasMore: true },
				summary: { lateTotal: 1 },
			},
			error: null,
			status: 200,
		});

		const response = await fetchAttendanceTimeline({
			organizationId: 'org-1',
			limit: 1,
			offset: 20,
		});

		expect(response.data).toHaveLength(1);
		expect(mockAttendanceTimelineGet).toHaveBeenCalledTimes(1);
	});

	it('throws when timeline pagination cannot establish a bounded total', async () => {
		mockAttendanceTimelineGet.mockResolvedValue({
			data: {
				data: [createTimelineEventFixture()],
				pagination: { limit: 1, hasMore: true },
				summary: { lateTotal: 1 },
			},
			error: null,
			status: 200,
		});

		await expect(
			fetchAttendanceTimeline({
				organizationId: 'org-1',
				limit: 1,
			}),
		).rejects.toThrow('Failed to fetch a bounded attendance timeline');
		expect(mockAttendanceTimelineGet).toHaveBeenCalledTimes(20);
	});

	it('throws when a timeline page is empty while the API still reports more data', async () => {
		mockAttendanceTimelineGet.mockResolvedValue({
			data: {
				data: [],
				pagination: { total: 2, limit: 1, offset: 0, hasMore: true },
				summary: { lateTotal: 1 },
			},
			error: null,
			status: 200,
		});

		await expect(
			fetchAttendanceTimeline({
				organizationId: 'org-1',
				limit: 1,
			}),
		).rejects.toThrow('Failed to fetch a bounded attendance timeline');
		expect(mockAttendanceTimelineGet).toHaveBeenCalledTimes(1);
	});

	it('fetches hourly attendance buckets from the API', async () => {
		mockAttendanceHourlyGet.mockResolvedValue({
			data: {
				data: [
					{ hour: 8, count: 4 },
					{ hour: 9, count: 7 },
				],
				date: '2026-04-21',
			},
			error: null,
			status: 200,
		});

		const response = await fetchAttendanceHourly({
			organizationId: 'org-1',
			date: '2026-04-21',
		});

		expect(response).toEqual({
			data: [
				{ hour: 8, count: 4 },
				{ hour: 9, count: 7 },
			],
			date: '2026-04-21',
		});
		expect(mockAttendanceHourlyGet).toHaveBeenCalledWith({
			$query: {
				organizationId: 'org-1',
				date: '2026-04-21',
			},
		});
	});

	it('returns an empty staffing requirements page when organizationId is null', async () => {
		const response = await fetchStaffingRequirementsList({
			organizationId: null,
			limit: 25,
			offset: 5,
		});

		expect(response).toEqual({
			data: [],
			pagination: {
				total: 0,
				limit: 25,
				offset: 5,
			},
		});
		expect(mockStaffingRequirementsGet).not.toHaveBeenCalled();
	});

	it('fetches staffing requirements and normalizes serialized dates', async () => {
		mockStaffingRequirementsGet.mockResolvedValue({
			data: {
				data: [
					{
						...createStaffingRequirementFixture(),
						createdAt: '2026-04-01T00:00:00.000Z',
						updatedAt: '2026-04-02T00:00:00.000Z',
					},
				],
				pagination: { total: 1, limit: 20, offset: 0 },
			},
			error: null,
			status: 200,
		});

		const response = await fetchStaffingRequirementsList({
			organizationId: 'org-1',
			locationId: 'location-1',
			jobPositionId: 'job-position-1',
			limit: 20,
			offset: 0,
		});

		expect(mockStaffingRequirementsGet).toHaveBeenCalledWith({
			$query: {
				organizationId: 'org-1',
				locationId: 'location-1',
				jobPositionId: 'job-position-1',
				limit: 20,
				offset: 0,
			},
		});
		expect(response.data[0]?.createdAt).toBeInstanceOf(Date);
		expect(response.data[0]?.updatedAt).toBeInstanceOf(Date);
		expect(response.data[0]?.createdAt.toISOString()).toBe('2026-04-01T00:00:00.000Z');
		expect(response.pagination).toEqual({ total: 1, limit: 20, offset: 0 });
	});

	it('fetches staffing requirements without an explicit organizationId', async () => {
		mockStaffingRequirementsGet.mockResolvedValue({
			data: {
				data: [],
				pagination: { total: 0, limit: 100, offset: 0 },
			},
			error: null,
			status: 200,
		});

		const response = await fetchStaffingRequirementsList();

		expect(response).toEqual({
			data: [],
			pagination: { total: 0, limit: 100, offset: 0 },
		});
		expect(mockStaffingRequirementsGet).toHaveBeenCalledWith({
			$query: {
				limit: 100,
				offset: 0,
			},
		});
	});

	it('returns empty staffing coverage when organizationId is null', async () => {
		const response = await fetchAttendanceStaffingCoverage({
			organizationId: null,
			date: '2026-04-20',
		});

		expect(response).toEqual({
			dateKey: '2026-04-20',
			data: [],
		});
		expect(mockAttendanceStaffingCoverageGet).not.toHaveBeenCalled();
	});

	it('fetches daily staffing coverage and normalizes employee check-in timestamps', async () => {
		const fixture = createDailyStaffingCoverageFixture();
		mockAttendanceStaffingCoverageGet.mockResolvedValue({
			data: {
				dateKey: fixture.dateKey,
				data: fixture.data.map((item) => ({
					...item,
					employees: item.employees.map((employee) => ({
						...employee,
						checkedInAt: employee.checkedInAt?.toISOString() ?? null,
					})),
				})),
			},
			error: null,
			status: 200,
		});

		const response = await fetchAttendanceStaffingCoverage({
			organizationId: 'org-1',
			locationId: 'location-1',
			date: '2026-04-20',
		});

		expect(mockAttendanceStaffingCoverageGet).toHaveBeenCalledWith({
			$query: {
				organizationId: 'org-1',
				locationId: 'location-1',
				date: '2026-04-20',
			},
		});
		expect(response.data[0]?.employees[0]?.checkedInAt).toBeInstanceOf(Date);
		expect(response.data[0]?.employees[0]?.checkedInAt?.toISOString()).toBe(
			'2026-04-20T14:00:00.000Z',
		);
		expect(response.data[0]?.employees[1]?.checkedInAt).toBeNull();
	});

	it('returns empty staffing coverage stats when organizationId is null', async () => {
		const response = await fetchAttendanceStaffingCoverageStats({
			organizationId: null,
			days: 14,
		});

		expect(response).toEqual({
			data: [],
			summary: {
				requirementsEvaluated: 0,
				completeToday: 0,
				incompleteToday: 0,
				averageCoveragePercent30d: 0,
				days: 14,
			},
		});
		expect(mockAttendanceStaffingCoverageStatsGet).not.toHaveBeenCalled();
	});

	it('fetches staffing coverage stats from the API', async () => {
		const fixture = createStaffingCoverageStatsFixture();
		mockAttendanceStaffingCoverageStatsGet.mockResolvedValue({
			data: fixture,
			error: null,
			status: 200,
		});

		const response = await fetchAttendanceStaffingCoverageStats({
			organizationId: 'org-1',
			locationId: 'location-1',
			days: 30,
		});

		expect(mockAttendanceStaffingCoverageStatsGet).toHaveBeenCalledWith({
			$query: {
				organizationId: 'org-1',
				locationId: 'location-1',
				days: 30,
			},
		});
		expect(response).toEqual(fixture);
	});

	it('fetches device status summary from the API', async () => {
		mockDevicesStatusSummaryGet.mockResolvedValue({
			data: {
				data: [
					createDeviceStatusFixture({
						batteryLevel: '82.5' as unknown as number,
					}),
				],
				total: 1,
			},
			error: null,
			status: 200,
		});

		const response = await fetchDeviceStatusSummary({
			organizationId: 'org-1',
		});

		expect(response).toEqual([
			createDeviceStatusFixture({
				batteryLevel: 82.5,
			}),
		]);
		expect(mockDevicesStatusSummaryGet).toHaveBeenCalledWith({
			$query: {
				organizationId: 'org-1',
			},
		});
	});

	it('fetches weather data from the API', async () => {
		mockWeatherGet.mockResolvedValue({
			data: {
				data: [createWeatherFixture()],
				cachedAt: '2026-04-21T15:30:00.000Z',
			},
			error: null,
			status: 200,
		});

		const response = await fetchWeather({
			organizationId: 'org-1',
		});

		expect(response).toEqual({
			data: [createWeatherFixture()],
			cachedAt: '2026-04-21T15:30:00.000Z',
		});
		expect(mockWeatherGet).toHaveBeenCalledWith({
			$query: {
				organizationId: 'org-1',
			},
		});
	});

	it('fetches aggregated dashboard location capacity in a single API call', async () => {
		mockEmployeesActiveCountsByLocationGet.mockResolvedValue({
			data: {
				data: [
					{ locationId: 'location-1', count: 3 },
					{ locationId: 'location-2', count: 7 },
					{ locationId: null, count: 2 },
				],
			},
			error: null,
			status: 200,
		});

		const response = await fetchDashboardLocationCapacity({
			organizationId: 'org-1',
		});

		expect(mockEmployeesActiveCountsByLocationGet).toHaveBeenCalledWith({
			$query: {
				organizationId: 'org-1',
			},
		});
		expect(response).toEqual(
			new Map<string, number>([
				['location-1', 3],
				['location-2', 7],
				['unassigned', 2],
			]),
		);
	});
});
