/**
 * Client-side data fetching functions for TanStack Query.
 *
 * This module centralizes all API calls used by queries and mutations,
 * providing a consistent interface for data fetching across the application.
 *
 * @module client-functions
 */

import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import type {
	ListQueryParams,
	AttendanceQueryParams,
	UsersQueryParams,
} from '@/lib/query-keys';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Employee status enum values.
 */
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';

/**
 * Device status enum values.
 */
export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';

/**
 * Attendance type enum values.
 */
export type AttendanceType = 'CHECK_IN' | 'CHECK_OUT';

/**
 * Employee record interface.
 */
export interface Employee {
	id: string;
	code: string;
	firstName: string;
	lastName: string;
	email: string | null;
	phone: string | null;
	jobPositionId: string | null;
	department: string | null;
	status: EmployeeStatus;
	hireDate: Date | null;
	locationId: string | null;
	rekognitionUserId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Device record interface.
 */
export interface Device {
	id: string;
	code: string;
	name: string | null;
	deviceType: string | null;
	status: DeviceStatus;
	lastHeartbeat: Date | null;
	locationId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Location record interface.
 */
export interface Location {
	id: string;
	name: string;
	code: string;
	address: string | null;
	clientId: string;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Client record interface.
 */
export interface Client {
	id: string;
	name: string;
	apiKeyId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Attendance record interface.
 */
export interface AttendanceRecord {
	id: string;
	employeeId: string;
	deviceId: string;
	timestamp: Date;
	type: AttendanceType;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * API Key record interface from better-auth.
 */
export interface ApiKey {
	id: string;
	name: string | null;
	start: string | null;
	prefix: string | null;
	key?: string;
	userId: string;
	enabled: boolean | null;
	expiresAt: Date | null;
	createdAt: Date;
	lastRequest: Date | null;
}

/**
 * Organization record interface from better-auth.
 */
export interface Organization {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
}

/**
 * User record interface from better-auth admin.
 */
export interface User {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image: string | null;
	role: string;
	banned: boolean;
	createdAt: Date;
}

/**
 * Pagination metadata from API responses.
 */
export interface PaginationMeta {
	total: number;
	limit: number;
	offset: number;
}

/**
 * Generic paginated response structure.
 */
export interface PaginatedResponse<T> {
	data: T[];
	pagination: PaginationMeta;
}

/**
 * Dashboard entity counts.
 */
export interface DashboardCounts {
	employees: number;
	devices: number;
	locations: number;
	clients: number;
	attendance: number;
}

// ============================================================================
// Employee Functions
// ============================================================================

/**
 * Fetches a paginated list of employees from the API.
 *
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated employees response
 * @throws Error if the API request fails
 *
 * @example
 * ```ts
 * const { data, pagination } = await fetchEmployeesList({ search: 'john', limit: 10 });
 * ```
 */
export async function fetchEmployeesList(
	params?: ListQueryParams,
): Promise<PaginatedResponse<Employee>> {
	const response = await api.employees.get({
		$query: {
			limit: params?.limit ?? 100,
			offset: params?.offset ?? 0,
			search: params?.search || undefined,
		},
	});

	if (response.error) {
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
 * Fetches a paginated list of devices from the API.
 *
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated devices response
 * @throws Error if the API request fails
 *
 * @example
 * ```ts
 * const { data, pagination } = await fetchDevicesList({ limit: 50 });
 * ```
 */
export async function fetchDevicesList(
	params?: ListQueryParams,
): Promise<PaginatedResponse<Device>> {
	const response = await api.devices.get({
		$query: {
			limit: params?.limit ?? 100,
			offset: params?.offset ?? 0,
			search: params?.search || undefined,
		},
	});

	if (response.error) {
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
 * Fetches a paginated list of locations from the API.
 *
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated locations response
 * @throws Error if the API request fails
 *
 * @example
 * ```ts
 * const { data, pagination } = await fetchLocationsList({ search: 'main' });
 * ```
 */
export async function fetchLocationsList(
	params?: ListQueryParams,
): Promise<PaginatedResponse<Location>> {
	const response = await api.locations.get({
		$query: {
			limit: params?.limit ?? 100,
			offset: params?.offset ?? 0,
			search: params?.search || undefined,
		},
	});

	if (response.error) {
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
 * Fetches a paginated list of clients from the API.
 *
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated clients response
 * @throws Error if the API request fails
 *
 * @example
 * ```ts
 * const { data, pagination } = await fetchClientsList({ search: 'acme' });
 * ```
 */
export async function fetchClientsList(
	params?: ListQueryParams,
): Promise<PaginatedResponse<Client>> {
	const response = await api.clients.get({
		$query: {
			limit: params?.limit ?? 100,
			offset: params?.offset ?? 0,
			search: params?.search || undefined,
		},
	});

	if (response.error) {
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
 * Fetches a paginated list of attendance records from the API.
 *
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated attendance records response
 * @throws Error if the API request fails
 *
 * @example
 * ```ts
 * const { data, pagination } = await fetchAttendanceRecords({
 *   fromDate: startOfDay(new Date()),
 *   toDate: endOfDay(new Date()),
 *   type: 'CHECK_IN',
 * });
 * ```
 */
export async function fetchAttendanceRecords(
	params?: AttendanceQueryParams,
): Promise<PaginatedResponse<AttendanceRecord>> {
	// Build query object, only including type if it's defined
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

	// Only add type if it's a valid enum value (not undefined)
	if (params?.type) {
		query.type = params.type;
	}

	const response = await api.attendance.get({ $query: query });

	if (response.error) {
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
 * Fetches dashboard entity counts from the API.
 *
 * This function fetches all entity counts in parallel for optimal performance.
 *
 * @returns A promise resolving to the dashboard counts object
 * @throws Error if any API request fails
 *
 * @example
 * ```ts
 * const counts = await fetchDashboardCounts();
 * console.log(`Total employees: ${counts.employees}`);
 * ```
 */
export async function fetchDashboardCounts(): Promise<DashboardCounts> {
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
 * Fetches the list of API keys for the current user.
 *
 * @returns A promise resolving to the array of API keys
 * @throws Error if the API request fails
 *
 * @example
 * ```ts
 * const apiKeys = await fetchApiKeys();
 * ```
 */
export async function fetchApiKeys(): Promise<ApiKey[]> {
	const response = await authClient.apiKey.list();

	if (response.error) {
		throw new Error('Failed to fetch API keys');
	}

	return (response.data ?? []) as ApiKey[];
}

// ============================================================================
// Organization Functions (via better-auth)
// ============================================================================

/**
 * Fetches the list of organizations for the current user.
 *
 * @returns A promise resolving to the array of organizations
 * @throws Error if the API request fails
 *
 * @example
 * ```ts
 * const organizations = await fetchOrganizations();
 * ```
 */
export async function fetchOrganizations(): Promise<Organization[]> {
	const response = await authClient.organization.list();

	if (response.error) {
		throw new Error('Failed to fetch organizations');
	}

	return (response.data ?? []) as Organization[];
}

// ============================================================================
// User Functions (via better-auth admin)
// ============================================================================

/**
 * Fetches the list of users (admin only).
 *
 * @param params - Optional query parameters for pagination
 * @returns A promise resolving to the array of users
 * @throws Error if the API request fails
 *
 * @example
 * ```ts
 * const users = await fetchUsers({ limit: 100, offset: 0 });
 * ```
 */
export async function fetchUsers(params?: UsersQueryParams): Promise<User[]> {
	const response = await authClient.admin.listUsers({
		query: {
			limit: params?.limit ?? 100,
			offset: params?.offset ?? 0,
		},
	});

	if (response.error) {
		throw new Error('Failed to fetch users');
	}

	return (response.data?.users ?? []) as User[];
}

