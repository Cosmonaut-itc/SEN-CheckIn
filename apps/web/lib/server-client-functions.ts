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
import { serverAuthClient } from '@/lib/server-auth-client';
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
	User,
} from '@/lib/client-functions';
import type {
	AttendanceQueryParams,
	JobPositionQueryParams,
	ListQueryParams,
	UsersQueryParams,
} from '@/lib/query-keys';
import { normalizeUserCode } from '@/lib/device-code-utils';
import { createServerApiClient, type ServerApiClient } from '@/lib/server-api';

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
	params?: ListQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<Employee>> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);

	// Resolve organization ID from params or BetterAuth session
	let organizationId = params?.organizationId ?? null;
	if (!organizationId && cookieHeader) {
		const session = await serverAuthClient.getSession(
			undefined,
			{ headers: new Headers({ cookie: cookieHeader }) },
		);
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

	if (params?.search) {
		query.search = params.search;
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
		const session = await serverAuthClient.getSession(
			undefined,
			{ headers: new Headers({ cookie: cookieHeader }) },
		);
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

	return {
		data: (response.data?.data ?? []) as JobPosition[],
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
		const session = await serverAuthClient.getSession(
			undefined,
			{ headers: new Headers({ cookie: cookieHeader }) },
		);
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
	params: { organizationId: string | null; limit?: number; offset?: number },
): Promise<{ members: OrganizationMember[]; total: number }> {
	if (!params.organizationId) {
		return { members: [], total: 0 };
	}

	const response = await authClient.organization.listMembers({
		query: {
			organizationId: params.organizationId,
			limit: params.limit ?? 100,
			offset: params.offset ?? 0,
		},
	}, { headers });

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
export async function approveDeviceCodeServer(headers: Headers, userCode: string): Promise<boolean> {
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
