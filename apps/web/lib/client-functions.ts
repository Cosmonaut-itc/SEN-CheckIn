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
import type { AttendanceQueryParams, ListQueryParams, UsersQueryParams } from '@/lib/query-keys';
import { normalizeUserCode } from '@/lib/device-code-utils';

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
	/** Job position name (from joined job_position table) */
	jobPositionName: string | null;
	department: string | null;
	status: EmployeeStatus;
	hireDate: Date | null;
	locationId: string | null;
	organizationId: string | null;
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
	organizationId: string | null;
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
	organizationId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Job position record interface.
 */
export interface JobPosition {
	id: string;
	name: string;
	description: string | null;
	organizationId: string | null;
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
 * Organization member record from better-auth organization plugin.
 */
export interface OrganizationMember {
	id: string;
	userId: string;
	organizationId: string;
	role: string;
	createdAt: Date;
	user: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	};
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
	organizations: number;
	attendance: number;
}

/**
 * Device authorization status values.
 */
export type DeviceAuthStatus = 'pending' | 'approved' | 'denied';

/**
 * Verification result from BetterAuth device authorization.
 */
export interface DeviceVerificationResult {
	userCode: string;
	status: DeviceAuthStatus;
}

/**
 * Convenience accessor for the BetterAuth device client.
 */
function getDeviceClient(): {
	verify: (input: { query: { user_code: string } }) => Promise<{ data?: any; error?: any }>;
	approve: (input: { userCode: string }) => Promise<{ data?: any; error?: any }>;
	deny: (input: { userCode: string }) => Promise<{ data?: any; error?: any }>;
} {
	return (authClient as unknown as { device: any }).device;
}

// ============================================================================
// Device Authorization (BetterAuth Device Flow)
// ============================================================================

/**
 * Verifies a device user code via BetterAuth.
 *
 * @param userCode - Raw or formatted user code (dashes allowed)
 * @returns Verification result containing normalized user code and status
 */
export async function verifyDeviceCode(userCode: string): Promise<DeviceVerificationResult> {
	const deviceClient = getDeviceClient();
	const normalized = normalizeUserCode(userCode);

	const response = await deviceClient.verify({ query: { user_code: normalized } });
	if (response.error || !response.data) {
		const message = response.error?.body?.error_description ?? 'Invalid or expired code';
		throw new Error(message);
	}

	return {
		userCode: normalizeUserCode(response.data.user_code ?? normalized),
		status: (response.data.status as DeviceAuthStatus) ?? 'pending',
	};
}

/**
 * Approves a pending device authorization request.
 *
 * @param userCode - User-facing code (formatted or raw)
 * @returns Success boolean from BetterAuth
 */
export async function approveDeviceCode(userCode: string): Promise<boolean> {
	const deviceClient = getDeviceClient();
	const normalized = normalizeUserCode(userCode);
	const response = await deviceClient.approve({ userCode: normalized });

	if (response.error) {
		const message = response.error?.body?.error_description ?? 'Failed to approve device';
		throw new Error(message);
	}
	return Boolean(response.data?.success ?? true);
}

/**
 * Denies a pending device authorization request.
 *
 * @param userCode - User-facing code (formatted or raw)
 * @returns Success boolean from BetterAuth
 */
export async function denyDeviceCode(userCode: string): Promise<boolean> {
	const deviceClient = getDeviceClient();
	const normalized = normalizeUserCode(userCode);
	const response = await deviceClient.deny({ userCode: normalized });

	if (response.error) {
		const message = response.error?.body?.error_description ?? 'Failed to deny device';
		throw new Error(message);
	}
	return Boolean(response.data?.success ?? true);
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
	params?: ListQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<Employee>> {
	if (params?.organizationId === null) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit: params?.limit ?? 100,
				offset: params?.offset ?? 0,
			},
		};
	}

	// Build query object, only including defined values
	// Eden Treaty converts undefined to string "undefined" which breaks search
	const query: {
		limit: number;
		offset: number;
		organizationId?: string;
		search?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
	};

	// Only add search if it has a non-empty value
	if (params?.search) {
		query.search = params.search;
	}

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}

	const response = await api.employees.get({ $query: query });

	if (response.error) {
		console.error('Failed to fetch employees:', response.error, 'Status:', response.status);
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
	params?: ListQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<Device>> {
	if (params?.organizationId === null) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit: params?.limit ?? 100,
				offset: params?.offset ?? 0,
			},
		};
	}

	// Build query object, only including defined values
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
	params?: ListQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<Location>> {
	if (params?.organizationId === null) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit: params?.limit ?? 100,
				offset: params?.offset ?? 0,
			},
		};
	}

	// Build query object, only including defined values
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

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}

	const response = await api.locations.get({ $query: query });

	if (response.error) {
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
 * Query parameters specific to job positions.
 */
export interface JobPositionQueryParams extends ListQueryParams {
	/** Filter by organization ID (optional for API key usage) */
	organizationId?: string;
}

/**
 * Fetches a paginated list of job positions from the API.
 *
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated job positions response
 * @throws Error if the API request fails
 *
 * @example
 * ```ts
 * const { data, pagination } = await fetchJobPositionsList({ search: 'engineer' });
 * ```
 */
export async function fetchJobPositionsList(
	params?: JobPositionQueryParams,
): Promise<PaginatedResponse<JobPosition>> {
	// Require organization context; avoid hitting API with missing org
	if (!params?.organizationId) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit: params?.limit ?? 100,
				offset: params?.offset ?? 0,
			},
		};
	}
	// Build query object, only including defined values
	// Eden Treaty converts undefined to string "undefined" which breaks search
	const query: {
		limit: number;
		offset: number;
		organizationId?: string;
		search?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
	};

	// Only add organizationId if it has a non-empty value
	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}

	// Only add search if it has a non-empty value
	if (params?.search) {
		query.search = params.search;
	}

	const response = await api['job-positions'].get({ $query: query });

	if (response.error) {
		console.error('Failed to fetch job positions:', response.error, 'Status:', response.status);
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
	params?: AttendanceQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<AttendanceRecord>> {
	if (params?.organizationId === null) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit: params?.limit ?? 100,
				offset: params?.offset ?? 0,
			},
		};
	}

	// Build query object, only including type if it's defined
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

	// Only add type if it's a valid enum value (not undefined)
	if (params?.type) {
		query.type = params.type;
	}

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
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
export async function fetchDashboardCounts(params?: {
	organizationId?: string | null;
}): Promise<DashboardCounts> {
	if (params?.organizationId === null) {
		return {
			employees: 0,
			devices: 0,
			locations: 0,
			organizations: 0,
			attendance: 0,
		};
	}

	const organizationId = params?.organizationId ?? undefined;

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
			authClient.organization.list(),
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
// Organization Member Functions (via better-auth organization plugin)
// ============================================================================

export interface OrganizationMembersResponse {
	members: OrganizationMember[];
	total: number;
}

export async function fetchOrganizationMembers(params: {
	organizationId: string | null;
	limit?: number;
	offset?: number;
}): Promise<OrganizationMembersResponse> {
	if (!params.organizationId) {
		return { members: [], total: 0 };
	}

	const response = await authClient.organization.listMembers({
		query: {
			organizationId: params.organizationId,
			limit: params.limit ?? 100,
			offset: params.offset ?? 0,
		},
	});

	if (response.error) {
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
