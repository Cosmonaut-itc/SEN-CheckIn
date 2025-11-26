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

import { createServerApiClient, type ServerApiClient } from '@/lib/server-api';
import { authClient } from '@/lib/auth-client';
import type {
	AttendanceQueryParams,
	ListQueryParams,
	UsersQueryParams,
} from '@/lib/query-keys';
import type {
	Employee,
	Device,
	Location,
	Client,
	AttendanceRecord,
	AttendanceType,
	DashboardCounts,
	PaginatedResponse,
	ApiKey,
	Organization,
	User,
} from '@/lib/client-functions';

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
	params?: ListQueryParams,
): Promise<PaginatedResponse<Employee>> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);

	const query: {
		limit: number;
		offset: number;
		search?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
	};

	if (params?.search) {
		query.search = params.search;
	}

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
	params?: ListQueryParams,
): Promise<PaginatedResponse<Device>> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);

	const query: {
		limit: number;
		offset: number;
		search?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
	};

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
	params?: ListQueryParams,
): Promise<PaginatedResponse<Location>> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);

	const query: {
		limit: number;
		offset: number;
		search?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
	};

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
// Client Functions
// ============================================================================

/**
 * Fetches a paginated list of clients from the API (server-side).
 *
 * @param cookieHeader - The cookie header string from the incoming request
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated clients response
 * @throws Error if the API request fails
 */
export async function fetchClientsListServer(
	cookieHeader: string,
	params?: ListQueryParams,
): Promise<PaginatedResponse<Client>> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);

	const query: {
		limit: number;
		offset: number;
		search?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
	};

	if (params?.search) {
		query.search = params.search;
	}

	const response = await api.clients.get({ $query: query });

	if (response.error) {
		console.error(
			'[Server] Failed to fetch clients:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch clients');
	}

	return {
		data: (response.data?.data ?? []) as Client[],
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
	params?: AttendanceQueryParams,
): Promise<PaginatedResponse<AttendanceRecord>> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);

	const query: {
		limit: number;
		offset: number;
		fromDate?: Date;
		toDate?: Date;
		type?: AttendanceType;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
		fromDate: params?.fromDate,
		toDate: params?.toDate,
	};

	if (params?.type) {
		query.type = params.type;
	}

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

/**
 * Fetches dashboard entity counts from the API (server-side).
 *
 * This function fetches all entity counts in parallel for optimal performance.
 *
 * @param cookieHeader - The cookie header string from the incoming request
 * @returns A promise resolving to the dashboard counts object
 * @throws Error if any API request fails
 */
export async function fetchDashboardCountsServer(
	cookieHeader: string,
): Promise<DashboardCounts> {
	const api: ServerApiClient = createServerApiClient(cookieHeader);

	const [employeesRes, devicesRes, locationsRes, clientsRes, attendanceRes] =
		await Promise.all([
			api.employees.get({ $query: { limit: 1, offset: 0 } }),
			api.devices.get({ $query: { limit: 1, offset: 0 } }),
			api.locations.get({ $query: { limit: 1, offset: 0 } }),
			api.clients.get({ $query: { limit: 1, offset: 0 } }),
			api.attendance.get({ $query: { limit: 1, offset: 0 } }),
		]);

	return {
		employees: employeesRes.data?.pagination?.total ?? 0,
		devices: devicesRes.data?.pagination?.total ?? 0,
		locations: locationsRes.data?.pagination?.total ?? 0,
		clients: clientsRes.data?.pagination?.total ?? 0,
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
	const response = await authClient.apiKey.list({
		fetchOptions: {
			headers,
		},
	});

	if (response.error) {
		console.error(
			'[Server] Failed to fetch API keys:',
			response.error,
		);
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
export async function fetchOrganizationsServer(
	headers: Headers,
): Promise<Organization[]> {
	const response = await authClient.organization.list({
		fetchOptions: {
			headers,
		},
	});

	if (response.error) {
		console.error(
			'[Server] Failed to fetch organizations:',
			response.error,
		);
		throw new Error('Failed to fetch organizations');
	}

	return (response.data ?? []) as Organization[];
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
	const response = await authClient.admin.listUsers({
		query: {
			limit: params?.limit ?? 100,
			offset: params?.offset ?? 0,
		},
		fetchOptions: {
			headers,
		},
	});

	if (response.error) {
		console.error(
			'[Server] Failed to fetch users:',
			response.error,
		);
		throw new Error('Failed to fetch users');
	}

	return (response.data?.users ?? []) as User[];
}

