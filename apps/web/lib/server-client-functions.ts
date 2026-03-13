/**
 * Server-side data fetching functions with cookie forwarding.
 *
 * This module provides server-specific versions of the client fetch functions
 * that accept forwarded cookies from the incoming request. These functions
 * are used by the server prefetch helpers to make authenticated requests
 * from Next.js Server Components.
 *
 * @module server-client-functions
 */

import { authClient } from '@/lib/auth-client';
import { getApiResponseData } from '@/lib/api-response';
import type {
	ApiKey,
	AttendanceRecord,
	AttendanceType,
	DisciplinaryMeasureRecord,
	DashboardCounts,
	Device,
	DeviceClient,
	Employee,
	JobPosition,
	Location,
	IncapacityRecord,
	Organization,
	OrganizationsAllResponse,
	OrganizationMember,
	OvertimeAuthorization,
	PaginatedResponse,
	PayrollCalculationResult,
	PayrollRun,
	PayrollRunEmployee,
	PayrollSettings,
	PtuRun,
	PtuRunEmployee,
	AguinaldoRun,
	AguinaldoRunEmployee,
	VacationRequest,
	CalendarEmployee,
	ScheduleException,
	ScheduleTemplate,
	User,
} from '@/lib/client-functions';
import { normalizeUserCode } from '@/lib/device-code-utils';
import type {
	AttendanceQueryParams,
	CalendarQueryParams,
	DisciplinaryKpisQueryParams,
	DisciplinaryMeasuresQueryParams,
	JobPositionQueryParams,
	IncapacityQueryParams,
	ListQueryParams,
	OvertimeAuthorizationQueryParams,
	OrganizationAllQueryParams,
	PayrollCalculateParams,
	ScheduleExceptionQueryParams,
	ScheduleTemplateQueryParams,
	VacationRequestQueryParams,
	UsersQueryParams,
} from '@/lib/query-keys';
import { clampPaginationLimit, clampPaginationOffset } from '@/lib/pagination';
import { type ServerApiClient, createServerApiClient } from '@/lib/server-api';
import { serverAuthClient } from '@/lib/server-auth-client';
import type { DisciplinaryKpis } from '@sen-checkin/types';

const AUTH_ORIGIN: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const AUTH_BASE_URL: string = AUTH_ORIGIN.endsWith('/api/auth')
	? AUTH_ORIGIN
	: `${AUTH_ORIGIN}/api/auth`;

// ============================================================================
// Employee Functions
// ============================================================================

type EmployeePayload = Omit<
	Employee,
	'dailyPay' | 'sbcDailyOverride' | 'platformHoursYear' | 'aguinaldoDaysOverride'
> & {
	dailyPay?: number | string;
	sbcDailyOverride?: number | string | null;
	platformHoursYear?: number | string | null;
	aguinaldoDaysOverride?: number | string | null;
};

/**
 * Normalizes employee payloads with numeric strings into typed values.
 *
 * @param record - Raw employee payload from the API
 * @returns Normalized employee record
 */
function normalizeEmployeeRecord(record: EmployeePayload): Employee {
	return {
		...record,
		dailyPay: Number(record.dailyPay ?? 0),
		employmentType: record.employmentType ?? 'PERMANENT',
		isTrustEmployee: Boolean(record.isTrustEmployee ?? false),
		isDirectorAdminGeneralManager: Boolean(record.isDirectorAdminGeneralManager ?? false),
		isDomesticWorker: Boolean(record.isDomesticWorker ?? false),
		isPlatformWorker: Boolean(record.isPlatformWorker ?? false),
		platformHoursYear: Number(record.platformHoursYear ?? 0),
		ptuEligibilityOverride: record.ptuEligibilityOverride ?? 'DEFAULT',
		aguinaldoDaysOverride:
			record.aguinaldoDaysOverride === null || record.aguinaldoDaysOverride === undefined
				? null
				: Number(record.aguinaldoDaysOverride),
		sbcDailyOverride:
			record.sbcDailyOverride === null || record.sbcDailyOverride === undefined
				? null
				: Number(record.sbcDailyOverride),
		documentProgressPercent:
			record.documentProgressPercent === undefined
				? undefined
				: Number(record.documentProgressPercent),
		documentMissingCount:
			record.documentMissingCount === undefined
				? undefined
				: Number(record.documentMissingCount),
		documentWorkflowStatus: record.documentWorkflowStatus,
		disciplinaryMeasuresCount:
			record.disciplinaryMeasuresCount === undefined
				? undefined
				: Number(record.disciplinaryMeasuresCount),
		disciplinaryOpenMeasuresCount:
			record.disciplinaryOpenMeasuresCount === undefined
				? undefined
				: Number(record.disciplinaryOpenMeasuresCount),
	};
}

/**
 * Fetches a paginated list of employees from the API (server-side).
 *
 * @param cookieHeader - The cookie header string from the incoming request
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated employees response
 * @throws Error if the API request fails
 */
export async function fetchEmployeesListServer(
	cookieHeader: string,
	params?: ListQueryParams & {
		organizationId?: string | null;
		locationId?: string;
		jobPositionId?: string;
		status?: Employee['status'];
	},
): Promise<PaginatedResponse<Employee>> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);
	const limit = clampPaginationLimit(params?.limit);
	const offset = clampPaginationOffset(params?.offset);

	// Resolve organization ID from params or BetterAuth session
	let organizationId = params?.organizationId ?? null;
	if (!organizationId && cookieHeader) {
		const session = await serverAuthClient.getSession(undefined, {
			headers: new Headers({ cookie: cookieHeader }),
		});
		if (!session.error) {
			organizationId = session.data?.session?.activeOrganizationId ?? null;
		}
	}

	if (!organizationId) {
		return {
			data: [],
			pagination: { total: 0, limit, offset },
		};
	}

	const query: {
		limit: number;
		offset: number;
		organizationId?: string;
		search?: string;
		locationId?: string;
		jobPositionId?: string;
		status?: Employee['status'];
	} = {
		limit,
		offset,
	};

	if (params?.search) {
		query.search = params.search;
	}

	if (params?.locationId) {
		query.locationId = params.locationId;
	}

	if (params?.jobPositionId) {
		query.jobPositionId = params.jobPositionId;
	}

	if (params?.status) {
		query.status = params.status;
	}

	query.organizationId = organizationId;

	const response = await api.employees.get({ $query: query });

	if (response.error) {
		console.error(
			'[Server] Failed to fetch employees:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch employees');
	}

	const payload = getApiResponseData(response);
	const employees = (payload?.data ?? []) as EmployeePayload[];
	return {
		data: employees.map(normalizeEmployeeRecord),
		pagination: payload?.pagination ?? { total: 0, limit, offset },
	};
}

// ============================================================================
// Disciplinary Measures Functions
// ============================================================================

type DisciplinaryMeasurePayload = Omit<
	DisciplinaryMeasureRecord,
	'createdAt' | 'updatedAt' | 'closedAt'
> & {
	createdAt: string | Date;
	updatedAt: string | Date;
	closedAt?: string | Date | null;
};

/**
 * Normalizes disciplinary measure payload timestamps.
 *
 * @param record - Raw disciplinary measure payload
 * @returns Normalized disciplinary measure
 */
function normalizeDisciplinaryMeasure(
	record: DisciplinaryMeasurePayload,
): DisciplinaryMeasureRecord {
	return {
		...record,
		employeeCode: record.employeeCode ?? null,
		employeeFirstName: record.employeeFirstName ?? null,
		employeeLastName: record.employeeLastName ?? null,
		createdAt: new Date(record.createdAt),
		updatedAt: new Date(record.updatedAt),
		closedAt: record.closedAt ? new Date(record.closedAt) : null,
	};
}

/**
 * Fetches a paginated list of disciplinary measures (server-side).
 *
 * @param cookieHeader - Request cookie header
 * @param params - Optional filter and pagination params
 * @returns Paginated disciplinary measure response
 * @throws Error when the API request fails
 */
export async function fetchDisciplinaryMeasuresServer(
	cookieHeader: string,
	params?: DisciplinaryMeasuresQueryParams,
): Promise<PaginatedResponse<DisciplinaryMeasureRecord>> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);
	const query: {
		limit: number;
		offset: number;
		employeeId?: string;
		search?: string;
		fromDateKey?: string;
		toDateKey?: string;
		status?: DisciplinaryMeasuresQueryParams['status'];
		outcome?: DisciplinaryMeasuresQueryParams['outcome'];
	} = {
		limit: clampPaginationLimit(params?.limit),
		offset: clampPaginationOffset(params?.offset),
	};

	if (params?.employeeId) {
		query.employeeId = params.employeeId;
	}
	if (params?.search) {
		query.search = params.search;
	}
	if (params?.fromDateKey) {
		query.fromDateKey = params.fromDateKey;
	}
	if (params?.toDateKey) {
		query.toDateKey = params.toDateKey;
	}
	if (params?.status) {
		query.status = params.status;
	}
	if (params?.outcome) {
		query.outcome = params.outcome;
	}

	const response = await api['disciplinary-measures'].get({
		$query: query,
	});

	if (response.error) {
		console.error(
			'[Server] Failed to fetch disciplinary measures:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch disciplinary measures');
	}

	const payload = getApiResponseData(response);
	const rows = (payload?.data as DisciplinaryMeasurePayload[] | undefined) ?? [];
	return {
		data: rows.map((row) => normalizeDisciplinaryMeasure(row)),
		pagination: payload?.pagination ?? {
			total: 0,
			limit: query.limit,
			offset: query.offset,
		},
	};
}

/**
 * Fetches disciplinary KPI summary (server-side).
 *
 * @param cookieHeader - Request cookie header
 * @param params - Optional date-range filters
 * @returns KPI summary or null when unavailable
 */
export async function fetchDisciplinaryKpisServer(
	cookieHeader: string,
	params?: DisciplinaryKpisQueryParams,
): Promise<DisciplinaryKpis | null> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);
	const query: {
		fromDateKey?: string;
		toDateKey?: string;
	} = {};
	if (params?.fromDateKey) {
		query.fromDateKey = params.fromDateKey;
	}
	if (params?.toDateKey) {
		query.toDateKey = params.toDateKey;
	}

	const response = await api['disciplinary-measures'].kpis.get({
		$query: query,
	});

	if (response.error) {
		console.error(
			'[Server] Failed to fetch disciplinary KPIs:',
			response.error,
			'Status:',
			response.status,
		);
		return null;
	}

	const payload = getApiResponseData(response);
	const raw = (payload?.data ?? null) as
		| (Partial<DisciplinaryKpis> & {
				actasInPeriod?: number;
				suspensionsActive?: number;
		  })
		| null;
	if (!raw) {
		return null;
	}

	return {
		employeesWithMeasures: Number(raw.employeesWithMeasures ?? 0),
		measuresInPeriod: Number(raw.measuresInPeriod ?? raw.actasInPeriod ?? 0),
		activeSuspensions: Number(raw.activeSuspensions ?? raw.suspensionsActive ?? 0),
		terminationEscalations: Number(raw.terminationEscalations ?? 0),
		openMeasures: Number(raw.openMeasures ?? 0),
	};
}

// ============================================================================
// Device Functions
// ============================================================================

/**
 * Fetches a paginated list of devices from the API (server-side).
 *
 * @param cookieHeader - The cookie header string from the incoming request
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated devices response
 * @throws Error if the API request fails
 */
export async function fetchDevicesListServer(
	cookieHeader: string,
	params?: ListQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<Device>> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);

	if (params?.organizationId === null) {
		return {
			data: [],
			pagination: { total: 0, limit: params?.limit ?? 100, offset: params?.offset ?? 0 },
		};
	}

	const query: {
		limit: number;
		offset: number;
		organizationId?: string;
		search?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
	};

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}

	if (params?.search) {
		query.search = params.search;
	}

	const response = await api.devices.get({ $query: query });

	if (response.error) {
		console.error(
			'[Server] Failed to fetch devices:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch devices');
	}

	const payload = getApiResponseData(response);
	return {
		data: (payload?.data ?? []) as Device[],
		pagination: payload?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}

// ============================================================================
// Location Functions
// ============================================================================

/**
 * Fetches a paginated list of locations from the API (server-side).
 *
 * @param cookieHeader - The cookie header string from the incoming request
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated locations response
 * @throws Error if the API request fails
 */
export async function fetchLocationsListServer(
	cookieHeader: string,
	params?: ListQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<Location>> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);

	if (params?.organizationId === null) {
		return {
			data: [],
			pagination: { total: 0, limit: params?.limit ?? 100, offset: params?.offset ?? 0 },
		};
	}

	const query: {
		limit: number;
		offset: number;
		organizationId?: string;
		search?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
	};

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}

	if (params?.search) {
		query.search = params.search;
	}

	const response = await api.locations.get({ $query: query });

	if (response.error) {
		console.error(
			'[Server] Failed to fetch locations:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch locations');
	}

	const payload = getApiResponseData(response);
	return {
		data: (payload?.data ?? []) as Location[],
		pagination: payload?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}

// ============================================================================
// Job Position Functions
// ============================================================================

/**
 * Fetches a paginated list of job positions from the API (server-side).
 *
 * @param cookieHeader - The cookie header string from the incoming request
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated job positions response
 * @throws Error if the API request fails
 */
export async function fetchJobPositionsListServer(
	cookieHeader: string,
	params?: JobPositionQueryParams,
): Promise<PaginatedResponse<JobPosition>> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);

	// Resolve organization ID from params or session (fallback for server prefetch)
	let organizationId = params?.organizationId ?? null;
	if (!organizationId && cookieHeader) {
		const session = await serverAuthClient.getSession(undefined, {
			headers: new Headers({ cookie: cookieHeader }),
		});
		if (!session.error) {
			organizationId = session.data?.session?.activeOrganizationId ?? null;
		}
	}

	if (!organizationId) {
		return {
			data: [],
			pagination: { total: 0, limit: params?.limit ?? 100, offset: params?.offset ?? 0 },
		};
	}

	const query: {
		limit: number;
		offset: number;
		organizationId?: string;
		search?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
	};

	query.organizationId = organizationId;

	if (params?.search) {
		query.search = params.search;
	}

	const response = await api['job-positions'].get({ $query: query });

	if (response.error) {
		console.error(
			'[Server] Failed to fetch job positions:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch job positions');
	}

	const payload = getApiResponseData(response);
	const positions = (payload?.data as JobPosition[] | undefined) ?? [];

	return {
		data: positions,
		pagination: payload?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}

// ============================================================================
// Attendance Functions
// ============================================================================

/**
 * Fetches a paginated list of attendance records from the API (server-side).
 *
 * @param cookieHeader - The cookie header string from the incoming request
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated attendance records response
 * @throws Error if the API request fails
 */
export async function fetchAttendanceRecordsServer(
	cookieHeader: string,
	params?: AttendanceQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<AttendanceRecord>> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);

	// Resolve organization ID from params or BetterAuth session
	let organizationId = params?.organizationId ?? null;
	if (!organizationId && cookieHeader) {
		const session = await serverAuthClient.getSession(undefined, {
			headers: new Headers({ cookie: cookieHeader }),
		});
		if (!session.error) {
			organizationId = session.data?.session?.activeOrganizationId ?? null;
		}
	}

	if (!organizationId) {
		return {
			data: [],
			pagination: { total: 0, limit: params?.limit ?? 100, offset: params?.offset ?? 0 },
		};
	}

	const query: {
		limit: number;
		offset: number;
		employeeId?: string;
		fromDate?: Date;
		toDate?: Date;
		type?: AttendanceType;
		offsiteDayKind?: 'LABORABLE' | 'NO_LABORABLE';
		search?: string;
		deviceLocationId?: string;
		organizationId?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
		fromDate: params?.fromDate,
		toDate: params?.toDate,
	};

	if (params?.type) {
		query.type = params.type;
	}

	if (params?.employeeId) {
		query.employeeId = params.employeeId;
	}

	if (params?.offsiteDayKind) {
		query.offsiteDayKind = params.offsiteDayKind;
	}

	if (params?.search?.trim()) {
		query.search = params.search.trim();
	}

	if (params?.deviceLocationId) {
		query.deviceLocationId = params.deviceLocationId;
	}

	query.organizationId = organizationId;

	const response = await api.attendance.get({ $query: query });

	if (response.error) {
		console.error(
			'[Server] Failed to fetch attendance records:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch attendance records');
	}

	const payload = getApiResponseData(response);
	return {
		data: (payload?.data ?? []) as AttendanceRecord[],
		pagination: payload?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}

// ============================================================================
// Dashboard Functions
// ============================================================================

export async function fetchDashboardCountsServer(
	cookieHeader: string,
	organizationId?: string | null,
): Promise<DashboardCounts> {
	if (organizationId === null) {
		return {
			employees: 0,
			devices: 0,
			locations: 0,
			organizations: 0,
			attendance: 0,
		};
	}

	const api: ServerApiClient = createServerApiClient(cookieHeader);
	const forwardedHeaders: HeadersInit = cookieHeader ? { cookie: cookieHeader } : {};

	const baseQuery = {
		limit: 1,
		offset: 0,
		...(organizationId ? { organizationId } : {}),
	};

	const [employeesRes, devicesRes, locationsRes, organizationsRes, attendanceRes] =
		await Promise.all([
			api.employees.get({ $query: baseQuery }),
			api.devices.get({ $query: baseQuery }),
			api.locations.get({ $query: baseQuery }),
			authClient.organization.list(undefined, {
				headers: forwardedHeaders,
			}),
			api.attendance.get({ $query: baseQuery }),
		]);

	const employeesPayload = getApiResponseData(employeesRes);
	const devicesPayload = getApiResponseData(devicesRes);
	const locationsPayload = getApiResponseData(locationsRes);
	const organizationsPayload = getApiResponseData(organizationsRes);
	const attendancePayload = getApiResponseData(attendanceRes);

	return {
		employees: employeesPayload?.pagination?.total ?? 0,
		devices: devicesPayload?.pagination?.total ?? 0,
		locations: locationsPayload?.pagination?.total ?? 0,
		organizations: organizationsPayload?.length ?? 0,
		attendance: attendancePayload?.pagination?.total ?? 0,
	};
}

// ============================================================================
// API Key Functions (via better-auth)
// ============================================================================

/**
 * Fetches the list of API keys for the current user (server-side).
 *
 * @param headers - The headers object from the incoming request
 * @returns A promise resolving to the array of API keys
 * @throws Error if the API request fails
 */
export async function fetchApiKeysServer(headers: Headers): Promise<ApiKey[]> {
	const response = await authClient.apiKey.list(undefined, { headers });

	if (response.error) {
		console.error('[Server] Failed to fetch API keys:', response.error);
		throw new Error('Failed to fetch API keys');
	}

	const payload = getApiResponseData(response);
	return (payload ?? []) as ApiKey[];
}

// ============================================================================
// Organization Functions (via better-auth)
// ============================================================================

/**
 * Fetches the list of organizations for the current user (server-side).
 *
 * @param headers - The headers object from the incoming request
 * @returns A promise resolving to the array of organizations
 * @throws Error if the API request fails
 */
export async function fetchOrganizationsServer(headers: Headers): Promise<Organization[]> {
	const response = await authClient.organization.list(undefined, { headers });

	if (response.error) {
		console.error('[Server] Failed to fetch organizations:', response.error);
		throw new Error('Failed to fetch organizations');
	}

	const payload = getApiResponseData(response);
	return (payload ?? []) as Organization[];
}

/**
 * Fetches the list of all organizations (superuser only, server-side).
 *
 * @param headers - The headers object from the incoming request
 * @param params - Optional query parameters for pagination, search, and sorting
 * @returns A promise resolving to the organizations response
 * @throws Error if the API request fails
 */
export async function fetchAllOrganizationsServer(
	headers: Headers,
	params?: OrganizationAllQueryParams,
): Promise<OrganizationsAllResponse> {
	const cookieHeader = headers.get('cookie') ?? '';
	const api: ServerApiClient = createServerApiClient(cookieHeader);

	const query: {
		limit: number;
		offset: number;
		search?: string;
		sortBy?: OrganizationAllQueryParams['sortBy'];
		sortDir?: OrganizationAllQueryParams['sortDir'];
	} = {
		limit: params?.limit ?? 50,
		offset: params?.offset ?? 0,
	};

	if (params?.search?.trim()) {
		query.search = params.search.trim();
	}
	if (params?.sortBy) {
		query.sortBy = params.sortBy;
	}
	if (params?.sortDir) {
		query.sortDir = params.sortDir;
	}

	const response = await api.organization.all.get({ $query: query });

	if (response.error) {
		console.error('[Server] Failed to fetch all organizations:', response.error);
		throw new Error('Failed to fetch organizations');
	}

	const payload = getApiResponseData(response);
	return {
		organizations: (payload?.organizations ?? []) as Organization[],
		total: payload?.total ?? 0,
	};
}

/**
 * Fetches organization members for the current user (server-side).
 *
 * @param headers - The headers object from the incoming request
 * @param params - Organization ID and optional pagination
 * @returns A promise resolving to the members response
 * @throws Error if the API request fails
 */
export async function fetchOrganizationMembersServer(
	headers: Headers,
	params: {
		organizationId: string | null;
		limit?: number;
		offset?: number;
		search?: string;
	},
): Promise<{ members: OrganizationMember[]; total: number }> {
	if (!params.organizationId) {
		return { members: [], total: 0 };
	}

	const cookieHeader = headers.get('cookie') ?? '';
	const api: ServerApiClient = createServerApiClient(cookieHeader);
	const query: {
		organizationId: string;
		limit: number;
		offset: number;
		search?: string;
	} = {
		organizationId: params.organizationId,
		limit: params.limit ?? 100,
		offset: params.offset ?? 0,
	};

	if (params.search?.trim()) {
		query.search = params.search.trim();
	}

	const response = await api.organization.members.get({ $query: query });

	if (response.error) {
		console.error('[Server] Failed to fetch organization members:', response.error);
		throw new Error('Failed to fetch organization members');
	}

	const payload = getApiResponseData(response);
	return {
		members: (payload?.members ?? []) as OrganizationMember[],
		total: payload?.total ?? 0,
	};
}

// ============================================================================
// User Functions (via better-auth admin)
// ============================================================================

/**
 * Fetches the list of users (admin only, server-side).
 *
 * @param headers - The headers object from the incoming request
 * @param params - Optional query parameters for pagination
 * @returns A promise resolving to the array of users
 * @throws Error if the API request fails
 */
export async function fetchUsersServer(
	headers: Headers,
	params?: UsersQueryParams,
): Promise<User[]> {
	const response = await authClient.admin.listUsers(
		{
			query: {
				limit: params?.limit ?? 100,
				offset: params?.offset ?? 0,
			},
		},
		{ headers },
	);

	if (response.error) {
		console.error('[Server] Failed to fetch users:', response.error);
		throw new Error('Failed to fetch users');
	}

	const payload = getApiResponseData(response);
	return (payload?.users ?? []) as User[];
}

// ============================================================================
// Payroll Functions
// ============================================================================

type PayrollSettingsPayload = Omit<
	PayrollSettings,
	| 'riskWorkRate'
	| 'statePayrollTaxRate'
	| 'aguinaldoDays'
	| 'vacationPremiumRate'
	| 'absorbImssEmployeeShare'
	| 'absorbIsr'
	| 'enableSeventhDayPay'
	| 'countSaturdayAsWorkedForSeventhDay'
	| 'ptuEnabled'
	| 'ptuMode'
	| 'ptuIsExempt'
	| 'ptuExemptReason'
	| 'employerType'
	| 'aguinaldoEnabled'
	| 'enableDisciplinaryMeasures'
> & {
	riskWorkRate?: number | string | null;
	statePayrollTaxRate?: number | string | null;
	aguinaldoDays?: number | string | null;
	vacationPremiumRate?: number | string | null;
	absorbImssEmployeeShare?: boolean | null;
	absorbIsr?: boolean | null;
	enableSeventhDayPay?: boolean | null;
	countSaturdayAsWorkedForSeventhDay?: boolean | null;
	ptuEnabled?: boolean | null;
	ptuMode?: 'DEFAULT_RULES' | 'MANUAL' | null;
	ptuIsExempt?: boolean | null;
	ptuExemptReason?: string | null;
	employerType?: 'PERSONA_MORAL' | 'PERSONA_FISICA' | null;
	aguinaldoEnabled?: boolean | null;
	enableDisciplinaryMeasures?: boolean | null;
	autoDeductLunchBreak: boolean | null;
	lunchBreakMinutes: number | string | null;
	lunchBreakThresholdHours: number | string | null;
};

/**
 * Normalizes numeric values that may arrive as strings.
 *
 * @param value - Incoming value from the API
 * @param fallback - Fallback value when missing or invalid
 * @returns Normalized numeric value
 */
function normalizeNumber(value: number | string | null | undefined, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return fallback;
}

/**
 * Normalizes payroll settings payload to ensure numeric values are numbers.
 *
 * @param payload - Raw payroll settings payload
 * @returns Normalized payroll settings or null when missing
 */
function normalizePayrollSettings(payload?: PayrollSettingsPayload | null): PayrollSettings | null {
	if (!payload) {
		return null;
	}
	return {
		...payload,
		riskWorkRate: normalizeNumber(payload.riskWorkRate, 0),
		statePayrollTaxRate: normalizeNumber(payload.statePayrollTaxRate, 0),
		aguinaldoDays: normalizeNumber(payload.aguinaldoDays, 15),
		vacationPremiumRate: normalizeNumber(payload.vacationPremiumRate, 0.25),
		absorbImssEmployeeShare: Boolean(payload.absorbImssEmployeeShare ?? false),
		absorbIsr: Boolean(payload.absorbIsr ?? false),
		enableSeventhDayPay: Boolean(payload.enableSeventhDayPay ?? false),
		countSaturdayAsWorkedForSeventhDay: Boolean(
			payload.countSaturdayAsWorkedForSeventhDay ?? false,
		),
		ptuEnabled: Boolean(payload.ptuEnabled ?? false),
		ptuMode: payload.ptuMode ?? 'DEFAULT_RULES',
		ptuIsExempt: Boolean(payload.ptuIsExempt ?? false),
		ptuExemptReason: payload.ptuExemptReason ?? null,
		employerType: payload.employerType ?? 'PERSONA_MORAL',
		aguinaldoEnabled: Boolean(payload.aguinaldoEnabled ?? true),
		enableDisciplinaryMeasures: Boolean(payload.enableDisciplinaryMeasures ?? true),
		autoDeductLunchBreak: Boolean(payload.autoDeductLunchBreak ?? false),
		lunchBreakMinutes: normalizeNumber(payload.lunchBreakMinutes, 60),
		lunchBreakThresholdHours: normalizeNumber(payload.lunchBreakThresholdHours, 6),
	};
}

export async function fetchPayrollSettingsServer(
	cookieHeader: string,
	organizationId?: string,
): Promise<PayrollSettings | null> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);
	const response = await api['payroll-settings'].get({
		$query: organizationId ? { organizationId } : undefined,
	});

	if (response.error) {
		console.error('[Server] Failed to fetch payroll settings:', response.error);
		return null;
	}

	const payload = getApiResponseData(response);
	return normalizePayrollSettings(payload?.data as PayrollSettingsPayload | undefined);
}

export async function calculatePayrollServer(
	cookieHeader: string,
	params: PayrollCalculateParams,
): Promise<PayrollCalculationResult> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);
	const response = await api.payroll.calculate.post(params);

	if (response.error) {
		console.error('[Server] Failed to calculate payroll:', response.error);
		throw new Error('Failed to calculate payroll');
	}

	const payload = getApiResponseData(response);
	if (!payload?.data) {
		throw new Error('Failed to calculate payroll');
	}
	return payload.data as PayrollCalculationResult;
}

export async function fetchPayrollRunsServer(
	cookieHeader: string,
	params?: { organizationId?: string; limit?: number; offset?: number },
): Promise<PayrollRun[]> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);
	const response = await api.payroll.runs.get({
		$query: {
			limit: params?.limit ?? 100,
			offset: params?.offset ?? 0,
			organizationId: params?.organizationId,
		},
	});

	if (response.error) {
		console.error('[Server] Failed to fetch payroll runs:', response.error);
		throw new Error('Failed to fetch payroll runs');
	}

	const runs =
		(getApiResponseData(response)?.data as
			| (PayrollRun & { totalAmount?: number | string })[]
			| undefined) ?? [];
	return runs.map((run) => ({
		...run,
		totalAmount: Number(run.totalAmount ?? 0),
	}));
}

/**
 * Fetches overtime authorizations for server-side prefetching.
 *
 * @param cookieHeader - Forwarded cookie header
 * @param params - Organization, filters, and pagination params
 * @returns Paginated overtime authorization response
 * @throws Error when the API request fails
 */
export async function fetchOvertimeAuthorizationsListServer(
	cookieHeader: string,
	params?: OvertimeAuthorizationQueryParams,
): Promise<PaginatedResponse<OvertimeAuthorization>> {
	if (!params?.organizationId) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit: clampPaginationLimit(params?.limit, 20),
				offset: clampPaginationOffset(params?.offset),
			},
		};
	}

	const api: ServerApiClient = createServerApiClient(cookieHeader);
	const query: {
		limit: number;
		offset: number;
		employeeId?: string;
		startDate?: string;
		endDate?: string;
		status?: OvertimeAuthorizationQueryParams['status'];
	} = {
		limit: clampPaginationLimit(params.limit, 20),
		offset: clampPaginationOffset(params.offset),
	};

	if (params.employeeId) {
		query.employeeId = params.employeeId;
	}
	if (params.startDate) {
		query.startDate = params.startDate;
	}
	if (params.endDate) {
		query.endDate = params.endDate;
	}
	if (params.status) {
		query.status = params.status;
	}

	const response = await api.organizations[params.organizationId]['overtime-authorizations'].get({
		$query: query,
	});

	if (response.error) {
		console.error('[Server] Failed to fetch overtime authorizations:', response.error);
		throw new Error('Failed to fetch overtime authorizations');
	}

	const payload = getApiResponseData(response);
	const rows =
		(payload?.data as
			| Array<{
					id: string;
					organizationId: string;
					employeeId: string;
					employeeName?: string;
					dateKey: string;
					authorizedHours?: number | string;
					authorizedByUserId: string | null;
					authorizedByName?: string | null;
					status: 'PENDING' | 'ACTIVE' | 'CANCELLED';
					notes: string | null;
					createdAt: string | Date;
					updatedAt: string | Date;
			  }>
			| undefined) ?? [];

	return {
		data: rows.map((row) => ({
			...row,
			authorizedHours: Number(row.authorizedHours ?? 0),
			createdAt: new Date(row.createdAt),
			updatedAt: new Date(row.updatedAt),
		})),
		pagination: payload?.pagination ?? {
			total: 0,
			limit: query.limit,
			offset: query.offset,
		},
	};
}

export async function fetchPayrollRunDetailServer(
	cookieHeader: string,
	id: string,
): Promise<{ run: PayrollRun; employees: PayrollRunEmployee[] } | null> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);
	const response = await api.payroll.runs[id].get();

	if (response.error) {
		console.error('[Server] Failed to fetch payroll run detail:', response.error);
		return null;
	}

	const payload =
		(getApiResponseData(response)?.data as
			| {
					run: PayrollRun & { totalAmount?: number | string };
					employees: (PayrollRunEmployee & {
						hoursWorked?: number | string;
						hourlyPay?: number | string;
						totalPay?: number | string;
						normalHours?: number | string;
						normalPay?: number | string;
						overtimeDoubleHours?: number | string;
						overtimeDoublePay?: number | string;
						overtimeTripleHours?: number | string;
						overtimeTriplePay?: number | string;
						authorizedOvertimeHours?: number | string;
						unauthorizedOvertimeHours?: number | string;
						sundayPremiumAmount?: number | string;
						mandatoryRestDayPremiumAmount?: number | string;
						vacationDaysPaid?: number | string;
						vacationPayAmount?: number | string;
						vacationPremiumAmount?: number | string;
						lunchBreakAutoDeductedDays?: number | string;
						lunchBreakAutoDeductedMinutes?: number | string;
						periodStart: string | Date;
						periodEnd: string | Date;
						createdAt: string | Date;
						updatedAt: string | Date;
					})[];
			  }
			| undefined) ?? undefined;
	if (!payload) {
		return null;
	}
	const normalizedRun: PayrollRun = {
		...payload.run,
		organizationName: payload.run.organizationName ?? null,
		totalAmount: Number(payload.run.totalAmount ?? 0),
		periodStart: new Date(payload.run.periodStart),
		periodEnd: new Date(payload.run.periodEnd),
		processedAt: payload.run.processedAt ? new Date(payload.run.processedAt) : null,
		createdAt: new Date(payload.run.createdAt),
		updatedAt: new Date(payload.run.updatedAt),
	};
	const normalizedEmployees: PayrollRunEmployee[] = payload.employees.map((employee) => ({
		...employee,
		hoursWorked: Number(employee.hoursWorked ?? 0),
		hourlyPay: Number(employee.hourlyPay ?? 0),
		totalPay: Number(employee.totalPay ?? 0),
		normalHours: Number(employee.normalHours ?? 0),
		normalPay: Number(employee.normalPay ?? 0),
		overtimeDoubleHours: Number(employee.overtimeDoubleHours ?? 0),
		overtimeDoublePay: Number(employee.overtimeDoublePay ?? 0),
		overtimeTripleHours: Number(employee.overtimeTripleHours ?? 0),
		overtimeTriplePay: Number(employee.overtimeTriplePay ?? 0),
		authorizedOvertimeHours: Number(employee.authorizedOvertimeHours ?? 0),
		unauthorizedOvertimeHours: Number(employee.unauthorizedOvertimeHours ?? 0),
		sundayPremiumAmount: Number(employee.sundayPremiumAmount ?? 0),
		mandatoryRestDayPremiumAmount: Number(employee.mandatoryRestDayPremiumAmount ?? 0),
		vacationDaysPaid: Number(employee.vacationDaysPaid ?? 0),
		vacationPayAmount: Number(employee.vacationPayAmount ?? 0),
		vacationPremiumAmount: Number(employee.vacationPremiumAmount ?? 0),
		lunchBreakAutoDeductedDays: Number(employee.lunchBreakAutoDeductedDays ?? 0),
		lunchBreakAutoDeductedMinutes: Number(employee.lunchBreakAutoDeductedMinutes ?? 0),
		periodStart: new Date(employee.periodStart),
		periodEnd: new Date(employee.periodEnd),
		createdAt: new Date(employee.createdAt),
		updatedAt: new Date(employee.updatedAt),
	}));
	return {
		run: normalizedRun,
		employees: normalizedEmployees,
	};
}

type PtuRunPayload = Omit<
	PtuRun,
	| 'paymentDate'
	| 'processedAt'
	| 'cancelledAt'
	| 'createdAt'
	| 'updatedAt'
	| 'taxableIncome'
	| 'ptuPercentage'
	| 'totalAmount'
	| 'employeeCount'
> & {
	paymentDate: string | Date;
	processedAt?: string | Date | null;
	cancelledAt?: string | Date | null;
	createdAt: string | Date;
	updatedAt: string | Date;
	taxableIncome?: number | string;
	ptuPercentage?: number | string;
	totalAmount?: number | string;
	employeeCount?: number | string;
};

type PtuRunEmployeePayload = Omit<
	PtuRunEmployee,
	| 'daysCounted'
	| 'dailyQuota'
	| 'annualSalaryBase'
	| 'ptuByDays'
	| 'ptuBySalary'
	| 'ptuPreCap'
	| 'capThreeMonths'
	| 'capAvgThreeYears'
	| 'capFinal'
	| 'ptuFinal'
	| 'exemptAmount'
	| 'taxableAmount'
	| 'withheldIsr'
	| 'netAmount'
	| 'createdAt'
	| 'updatedAt'
> & {
	daysCounted?: number | string;
	dailyQuota?: number | string;
	annualSalaryBase?: number | string;
	ptuByDays?: number | string;
	ptuBySalary?: number | string;
	ptuPreCap?: number | string;
	capThreeMonths?: number | string;
	capAvgThreeYears?: number | string;
	capFinal?: number | string;
	ptuFinal?: number | string;
	exemptAmount?: number | string;
	taxableAmount?: number | string;
	withheldIsr?: number | string;
	netAmount?: number | string;
	createdAt: string | Date;
	updatedAt: string | Date;
};

type AguinaldoRunPayload = Omit<
	AguinaldoRun,
	| 'paymentDate'
	| 'processedAt'
	| 'cancelledAt'
	| 'createdAt'
	| 'updatedAt'
	| 'totalAmount'
	| 'employeeCount'
> & {
	paymentDate: string | Date;
	processedAt?: string | Date | null;
	cancelledAt?: string | Date | null;
	createdAt: string | Date;
	updatedAt: string | Date;
	totalAmount?: number | string;
	employeeCount?: number | string;
};

type AguinaldoRunEmployeePayload = Omit<
	AguinaldoRunEmployee,
	| 'daysCounted'
	| 'dailySalaryBase'
	| 'aguinaldoDaysPolicy'
	| 'yearDays'
	| 'grossAmount'
	| 'exemptAmount'
	| 'taxableAmount'
	| 'withheldIsr'
	| 'netAmount'
	| 'createdAt'
	| 'updatedAt'
> & {
	daysCounted?: number | string;
	dailySalaryBase?: number | string;
	aguinaldoDaysPolicy?: number | string;
	yearDays?: number | string;
	grossAmount?: number | string;
	exemptAmount?: number | string;
	taxableAmount?: number | string;
	withheldIsr?: number | string;
	netAmount?: number | string;
	createdAt: string | Date;
	updatedAt: string | Date;
};

/**
 * Retrieves a PTU run detail for a specific run.
 *
 * @param cookieHeader - Cookie header for authentication
 * @param id - PTU run identifier
 * @returns PTU run detail or null when missing
 */
export async function fetchPtuRunDetailServer(
	cookieHeader: string,
	id: string,
): Promise<{ run: PtuRun; employees: PtuRunEmployee[] } | null> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);
	const response = await api.ptu.runs[id].get();

	if (response.error) {
		console.error('[Server] Failed to fetch PTU run detail:', response.error);
		return null;
	}

	const payload = getApiResponseData(response)?.data as
		| { run: PtuRunPayload; employees: PtuRunEmployeePayload[] }
		| undefined;
	if (!payload) {
		return null;
	}

	const normalizedRun: PtuRun = {
		...payload.run,
		paymentDate: new Date(payload.run.paymentDate),
		taxableIncome: Number(payload.run.taxableIncome ?? 0),
		ptuPercentage: Number(payload.run.ptuPercentage ?? 0),
		totalAmount: Number(payload.run.totalAmount ?? 0),
		employeeCount: Number(payload.run.employeeCount ?? 0),
		processedAt: payload.run.processedAt ? new Date(payload.run.processedAt) : null,
		cancelledAt: payload.run.cancelledAt ? new Date(payload.run.cancelledAt) : null,
		createdAt: new Date(payload.run.createdAt),
		updatedAt: new Date(payload.run.updatedAt),
	};
	const normalizedEmployees: PtuRunEmployee[] = payload.employees.map((employee) => ({
		...employee,
		daysCounted: Number(employee.daysCounted ?? 0),
		dailyQuota: Number(employee.dailyQuota ?? 0),
		annualSalaryBase: Number(employee.annualSalaryBase ?? 0),
		ptuByDays: Number(employee.ptuByDays ?? 0),
		ptuBySalary: Number(employee.ptuBySalary ?? 0),
		ptuPreCap: Number(employee.ptuPreCap ?? 0),
		capThreeMonths: Number(employee.capThreeMonths ?? 0),
		capAvgThreeYears: Number(employee.capAvgThreeYears ?? 0),
		capFinal: Number(employee.capFinal ?? 0),
		ptuFinal: Number(employee.ptuFinal ?? 0),
		exemptAmount: Number(employee.exemptAmount ?? 0),
		taxableAmount: Number(employee.taxableAmount ?? 0),
		withheldIsr: Number(employee.withheldIsr ?? 0),
		netAmount: Number(employee.netAmount ?? 0),
		createdAt: new Date(employee.createdAt),
		updatedAt: new Date(employee.updatedAt),
	}));

	return { run: normalizedRun, employees: normalizedEmployees };
}

/**
 * Retrieves an Aguinaldo run detail for a specific run.
 *
 * @param cookieHeader - Cookie header for authentication
 * @param id - Aguinaldo run identifier
 * @returns Aguinaldo run detail or null when missing
 */
export async function fetchAguinaldoRunDetailServer(
	cookieHeader: string,
	id: string,
): Promise<{ run: AguinaldoRun; employees: AguinaldoRunEmployee[] } | null> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);
	const response = await api.aguinaldo.runs[id].get();

	if (response.error) {
		console.error('[Server] Failed to fetch Aguinaldo run detail:', response.error);
		return null;
	}

	const payload = getApiResponseData(response)?.data as
		| { run: AguinaldoRunPayload; employees: AguinaldoRunEmployeePayload[] }
		| undefined;
	if (!payload) {
		return null;
	}

	const normalizedRun: AguinaldoRun = {
		...payload.run,
		paymentDate: new Date(payload.run.paymentDate),
		totalAmount: Number(payload.run.totalAmount ?? 0),
		employeeCount: Number(payload.run.employeeCount ?? 0),
		processedAt: payload.run.processedAt ? new Date(payload.run.processedAt) : null,
		cancelledAt: payload.run.cancelledAt ? new Date(payload.run.cancelledAt) : null,
		createdAt: new Date(payload.run.createdAt),
		updatedAt: new Date(payload.run.updatedAt),
	};
	const normalizedEmployees: AguinaldoRunEmployee[] = payload.employees.map((employee) => ({
		...employee,
		daysCounted: Number(employee.daysCounted ?? 0),
		dailySalaryBase: Number(employee.dailySalaryBase ?? 0),
		aguinaldoDaysPolicy: Number(employee.aguinaldoDaysPolicy ?? 0),
		yearDays: Number(employee.yearDays ?? 0),
		grossAmount: Number(employee.grossAmount ?? 0),
		exemptAmount: Number(employee.exemptAmount ?? 0),
		taxableAmount: Number(employee.taxableAmount ?? 0),
		withheldIsr: Number(employee.withheldIsr ?? 0),
		netAmount: Number(employee.netAmount ?? 0),
		createdAt: new Date(employee.createdAt),
		updatedAt: new Date(employee.updatedAt),
	}));

	return { run: normalizedRun, employees: normalizedEmployees };
}

// ============================================================================
// Scheduling Functions
// ============================================================================

/**
 * Fetches schedule templates on the server with cookie forwarding.
 */
export async function fetchScheduleTemplatesListServer(
	cookieHeader: string,
	params?: ScheduleTemplateQueryParams,
): Promise<PaginatedResponse<ScheduleTemplate>> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);

	if (!params?.organizationId) {
		return {
			data: [],
			pagination: { total: 0, limit: params?.limit ?? 100, offset: params?.offset ?? 0 },
		};
	}

	const query: {
		limit: number;
		offset: number;
		organizationId: string;
		search?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
		organizationId: params.organizationId,
	};

	if (params?.search?.trim()) {
		query.search = params.search.trim();
	}

	const response = await api['schedule-templates'].get({ $query: query });

	if (response.error) {
		console.error('[Server] Failed to fetch schedule templates:', response.error);
		throw new Error('Failed to fetch schedule templates');
	}

	const payload = getApiResponseData(response);
	return {
		data: (payload?.data ?? []) as ScheduleTemplate[],
		pagination: payload?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}

/**
 * Fetches a schedule template by ID on the server.
 */
export async function fetchScheduleTemplateDetailServer(
	cookieHeader: string,
	id: string,
): Promise<ScheduleTemplate | null> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);
	const response = await api['schedule-templates'][id].get();

	if (response.error) {
		console.error('[Server] Failed to fetch schedule template detail:', response.error);
		return null;
	}

	const payload = getApiResponseData(response);
	return (payload?.data as ScheduleTemplate) ?? null;
}

/**
 * Fetches schedule exceptions with cookie forwarding.
 */
export async function fetchScheduleExceptionsListServer(
	cookieHeader: string,
	params?: ScheduleExceptionQueryParams,
): Promise<PaginatedResponse<ScheduleException>> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);

	if (!params?.organizationId) {
		return {
			data: [],
			pagination: { total: 0, limit: params?.limit ?? 100, offset: params?.offset ?? 0 },
		};
	}

	const query: {
		limit: number;
		offset: number;
		employeeId?: string;
		fromDate?: Date;
		toDate?: Date;
		organizationId: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
		organizationId: params.organizationId,
	};

	if (params.employeeId) {
		query.employeeId = params.employeeId;
	}
	if (params.fromDate) {
		query.fromDate =
			typeof params.fromDate === 'string' ? new Date(params.fromDate) : params.fromDate;
	}
	if (params.toDate) {
		query.toDate = typeof params.toDate === 'string' ? new Date(params.toDate) : params.toDate;
	}

	const response = await api['schedule-exceptions'].get({ $query: query });

	if (response.error) {
		console.error('[Server] Failed to fetch schedule exceptions:', response.error);
		throw new Error('Failed to fetch schedule exceptions');
	}

	const payload = getApiResponseData(response);
	return {
		data: (payload?.data ?? []) as ScheduleException[],
		pagination: payload?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}

/**
 * Fetches the scheduling calendar on the server.
 */
export async function fetchCalendarServer(
	cookieHeader: string,
	params: CalendarQueryParams,
): Promise<CalendarEmployee[]> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);
	const response = await api.scheduling.calendar.get({
		$query: {
			...params,
			startDate:
				typeof params.startDate === 'string'
					? new Date(params.startDate)
					: params.startDate,
			endDate: typeof params.endDate === 'string' ? new Date(params.endDate) : params.endDate,
		},
	});

	if (response.error) {
		console.error('[Server] Failed to fetch scheduling calendar:', response.error);
		throw new Error('Failed to fetch scheduling calendar');
	}

	const payload = getApiResponseData(response);
	return (payload?.data ?? []) as CalendarEmployee[];
}

// ============================================================================
// Vacation Functions
// ============================================================================

/**
 * Fetches vacation requests list for HR/admin workflows (server-side).
 *
 * @param cookieHeader - Cookie header string from incoming request
 * @param params - Query parameters for vacation requests
 * @returns Paginated vacation requests
 * @throws Error if the API request fails
 */
export async function fetchVacationRequestsListServer(
	cookieHeader: string,
	params?: VacationRequestQueryParams,
): Promise<PaginatedResponse<VacationRequest>> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);

	if (params?.organizationId === null) {
		return {
			data: [],
			pagination: { total: 0, limit: params?.limit ?? 50, offset: params?.offset ?? 0 },
		};
	}

	const query: {
		limit: number;
		offset: number;
		organizationId?: string;
		employeeId?: string;
		status?: VacationRequestQueryParams['status'];
		from?: string;
		to?: string;
	} = {
		limit: params?.limit ?? 50,
		offset: params?.offset ?? 0,
	};

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}
	if (params?.employeeId) {
		query.employeeId = params.employeeId;
	}
	if (params?.status) {
		query.status = params.status;
	}
	if (params?.from) {
		query.from = params.from;
	}
	if (params?.to) {
		query.to = params.to;
	}

	const response = await api.vacations.requests.get({ $query: query });

	if (response.error) {
		console.error(
			'[Server] Failed to fetch vacation requests:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch vacation requests');
	}

	const payload = getApiResponseData(response);
	return {
		data: (payload?.data ?? []) as VacationRequest[],
		pagination: payload?.pagination ?? {
			total: 0,
			limit: query.limit,
			offset: query.offset,
		},
	};
}

// ============================================================================
// Incapacity Functions
// ============================================================================

/**
 * Fetches incapacity records list for HR/admin workflows (server-side).
 *
 * @param cookieHeader - Cookie header string from incoming request
 * @param params - Query parameters for incapacity records
 * @returns Paginated incapacity records
 * @throws Error if the API request fails
 */
export async function fetchIncapacitiesListServer(
	cookieHeader: string,
	params?: IncapacityQueryParams,
): Promise<PaginatedResponse<IncapacityRecord>> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);

	if (params?.organizationId === null) {
		return {
			data: [],
			pagination: { total: 0, limit: params?.limit ?? 50, offset: params?.offset ?? 0 },
		};
	}

	const query: {
		limit: number;
		offset: number;
		organizationId?: string;
		search?: string;
		employeeId?: string;
		type?: IncapacityQueryParams['type'];
		status?: IncapacityQueryParams['status'];
		from?: string;
		to?: string;
	} = {
		limit: params?.limit ?? 50,
		offset: params?.offset ?? 0,
	};

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}
	if (params?.search) {
		query.search = params.search;
	}
	if (params?.employeeId) {
		query.employeeId = params.employeeId;
	}
	if (params?.type) {
		query.type = params.type;
	}
	if (params?.status) {
		query.status = params.status;
	}
	if (params?.from) {
		query.from = params.from;
	}
	if (params?.to) {
		query.to = params.to;
	}

	const response = await api.incapacities.get({ $query: query });

	if (response.error) {
		console.error(
			'[Server] Failed to fetch incapacity records:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch incapacity records');
	}

	const payload = getApiResponseData(response);
	return {
		data: (payload?.data ?? []) as IncapacityRecord[],
		pagination: payload?.pagination ?? {
			total: 0,
			limit: query.limit,
			offset: query.offset,
		},
	};
}

// ============================================================================
// Device Authorization (BetterAuth device flow)
// ============================================================================

export type DeviceAuthStatus = 'pending' | 'approved' | 'denied';

export interface DeviceVerificationResult {
	userCode: string;
	status: DeviceAuthStatus;
}

/**
 * Verify a device code server-side using BetterAuth and forwarded cookies.
 */
export async function verifyDeviceCodeServer(
	headers: Headers,
	userCode: string,
): Promise<DeviceVerificationResult> {
	const normalized = normalizeUserCode(userCode);

	const url = new URL(`${AUTH_BASE_URL}/device`);
	url.searchParams.set('user_code', normalized);

	const response = await fetch(url.toString(), {
		method: 'GET',
		headers,
	});

	const data = (await response.json().catch(() => null)) as {
		user_code?: string;
		status?: DeviceAuthStatus;
	} | null;

	if (!response.ok || !data) {
		const message = 'Invalid or expired code';
		throw new Error(message);
	}

	return {
		userCode: normalizeUserCode(data.user_code ?? normalized),
		status: (data.status as DeviceAuthStatus) ?? 'pending',
	};
}

/**
 * Approve a device authorization request server-side.
 */
export async function approveDeviceCodeServer(
	headers: Headers,
	userCode: string,
): Promise<boolean> {
	const deviceClient = (serverAuthClient as unknown as { device: DeviceClient }).device;
	const normalized = normalizeUserCode(userCode);
	const response = await deviceClient.approve({ userCode: normalized }, { headers });

	if (response.error) {
		const message = response.error?.body?.error_description ?? 'Failed to approve device';
		throw new Error(message);
	}
	return Boolean(response.data?.success ?? true);
}

/**
 * Deny a device authorization request server-side.
 */
export async function denyDeviceCodeServer(headers: Headers, userCode: string): Promise<boolean> {
	const deviceClient = (serverAuthClient as unknown as { device: DeviceClient }).device;
	const normalized = normalizeUserCode(userCode);
	const response = await deviceClient.deny({ userCode: normalized }, { headers });

	if (response.error) {
		const message = response.error?.body?.error_description ?? 'Failed to deny device';
		throw new Error(message);
	}
	return Boolean(response.data?.success ?? true);
}
