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
import type {
	ApiKey,
	AttendanceRecord,
	AttendanceType,
	DashboardCounts,
	Device,
	DeviceClient,
	Employee,
	JobPosition,
	Location,
	Organization,
	OrganizationMember,
	PaginatedResponse,
	PayrollCalculationResult,
	PayrollRun,
	PayrollRunEmployee,
	PayrollSettings,
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
	JobPositionQueryParams,
	ListQueryParams,
	PayrollCalculateParams,
	ScheduleExceptionQueryParams,
	ScheduleTemplateQueryParams,
	VacationRequestQueryParams,
	UsersQueryParams,
} from '@/lib/query-keys';
import { type ServerApiClient, createServerApiClient } from '@/lib/server-api';
import { serverAuthClient } from '@/lib/server-auth-client';

const AUTH_ORIGIN: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const AUTH_BASE_URL: string = AUTH_ORIGIN.endsWith('/api/auth')
	? AUTH_ORIGIN
	: `${AUTH_ORIGIN}/api/auth`;

// ============================================================================
// Employee Functions
// ============================================================================

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
		organizationId?: string;
		search?: string;
		locationId?: string;
		jobPositionId?: string;
		status?: Employee['status'];
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
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

	return {
		data: (response.data?.data ?? []) as Employee[],
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
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

	return {
		data: (response.data?.data ?? []) as Device[],
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
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

	return {
		data: (response.data?.data ?? []) as Location[],
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
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

	const positions =
		(response.data?.data as
			| (Omit<JobPosition, 'dailyPay'> & { dailyPay?: number | string })[]
			| undefined) ?? [];

	return {
		data: positions.map((jp) => ({
			...jp,
			dailyPay: Number(jp.dailyPay ?? 0),
		})),
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
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
		fromDate?: Date;
		toDate?: Date;
		type?: AttendanceType;
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

	return {
		data: (response.data?.data ?? []) as AttendanceRecord[],
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
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

	return {
		employees: employeesRes.data?.pagination?.total ?? 0,
		devices: devicesRes.data?.pagination?.total ?? 0,
		locations: locationsRes.data?.pagination?.total ?? 0,
		organizations: organizationsRes.data?.length ?? 0,
		attendance: attendanceRes.data?.pagination?.total ?? 0,
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

	return (response.data ?? []) as ApiKey[];
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

	return (response.data ?? []) as Organization[];
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

	return {
		members: (response.data?.members ?? []) as OrganizationMember[],
		total: response.data?.total ?? 0,
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

	return (response.data?.users ?? []) as User[];
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
> & {
	riskWorkRate?: number | string | null;
	statePayrollTaxRate?: number | string | null;
	aguinaldoDays?: number | string | null;
	vacationPremiumRate?: number | string | null;
	absorbImssEmployeeShare?: boolean | null;
	absorbIsr?: boolean | null;
	enableSeventhDayPay?: boolean | null;
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

	return normalizePayrollSettings(response.data?.data as PayrollSettingsPayload | undefined);
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

	return response.data?.data as PayrollCalculationResult;
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
		(response.data?.data as (PayrollRun & { totalAmount?: number | string })[] | undefined) ??
		[];
	return runs.map((run) => ({
		...run,
		totalAmount: Number(run.totalAmount ?? 0),
	}));
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

	const payload = response.data?.data as
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
				sundayPremiumAmount?: number | string;
				mandatoryRestDayPremiumAmount?: number | string;
				vacationDaysPaid?: number | string;
				vacationPayAmount?: number | string;
				vacationPremiumAmount?: number | string;
				periodStart: string | Date;
				periodEnd: string | Date;
				createdAt: string | Date;
				updatedAt: string | Date;
				})[];
		  }
		| undefined;
	if (!payload) {
		return null;
	}
	const normalizedRun: PayrollRun = {
		...payload.run,
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
		sundayPremiumAmount: Number(employee.sundayPremiumAmount ?? 0),
		mandatoryRestDayPremiumAmount: Number(employee.mandatoryRestDayPremiumAmount ?? 0),
		vacationDaysPaid: Number(employee.vacationDaysPaid ?? 0),
		vacationPayAmount: Number(employee.vacationPayAmount ?? 0),
		vacationPremiumAmount: Number(employee.vacationPremiumAmount ?? 0),
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

	return {
		data: (response.data?.data ?? []) as ScheduleTemplate[],
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
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

	return (response.data?.data as ScheduleTemplate) ?? null;
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

	return {
		data: (response.data?.data ?? []) as ScheduleException[],
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
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

	return (response.data?.data ?? []) as CalendarEmployee[];
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

	return {
		data: (response.data?.data ?? []) as VacationRequest[],
		pagination: response.data?.pagination ?? {
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
