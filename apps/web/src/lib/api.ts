import { treaty } from "@elysiajs/eden";

/**
 * Base URL for the Sen Checkin API.
 * Defaults to localhost:3000 for development.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * Pagination response interface.
 */
interface PaginationInfo {
	total: number;
	limit: number;
	offset: number;
	hasMore: boolean;
}

/**
 * Generic list response interface.
 */
interface ListResponse<T> {
	data: T[];
	pagination?: PaginationInfo;
	total?: number;
}

/**
 * Generic item response interface.
 */
interface ItemResponse<T> {
	data: T;
}

/**
 * Query parameters for list endpoints.
 */
interface ListQueryParams {
	limit?: number;
	offset?: number;
	search?: string;
	[key: string]: string | number | undefined;
}

/**
 * Employee status enum.
 */
type EmployeeStatus = "ACTIVE" | "INACTIVE" | "ON_LEAVE";

/**
 * Device status enum.
 */
type DeviceStatus = "ONLINE" | "OFFLINE" | "MAINTENANCE";

/**
 * Attendance type enum.
 */
type AttendanceType = "CHECK_IN" | "CHECK_OUT";

/**
 * Employee interface.
 */
interface Employee {
	id: string;
	code: string;
	firstName: string;
	lastName: string;
	email: string | null;
	phone: string | null;
	jobPositionId: string | null;
	department: string | null;
	status: EmployeeStatus;
	hireDate: string | null;
	locationId: string | null;
	rekognitionUserId: string | null;
	createdAt: string;
	updatedAt: string;
}

/**
 * Device interface.
 */
interface Device {
	id: string;
	code: string;
	name: string | null;
	deviceType: string | null;
	status: DeviceStatus;
	lastHeartbeat: string | null;
	locationId: string | null;
	createdAt: string;
	updatedAt: string;
}

/**
 * Location interface.
 */
interface Location {
	id: string;
	name: string;
	code: string;
	address: string | null;
	clientId: string;
	createdAt: string;
	updatedAt: string;
}

/**
 * Client interface.
 */
interface Client {
	id: string;
	name: string;
	apiKeyId: string | null;
	createdAt: string;
	updatedAt: string;
}

/**
 * Attendance record interface.
 */
interface AttendanceRecord {
	id: string;
	employeeId: string;
	deviceId: string;
	timestamp: string;
	type: AttendanceType;
	metadata: Record<string, unknown> | null;
	createdAt: string;
	updatedAt: string;
}

/**
 * Create employee payload.
 */
interface CreateEmployeePayload {
	code: string;
	firstName: string;
	lastName: string;
	email?: string;
	phone?: string;
	jobPositionId?: string;
	department?: string;
	status?: EmployeeStatus;
	hireDate?: string;
	locationId?: string;
}

/**
 * Create device payload.
 */
interface CreateDevicePayload {
	code: string;
	name?: string;
	deviceType?: string;
	status?: DeviceStatus;
	locationId?: string;
}

/**
 * Create location payload.
 */
interface CreateLocationPayload {
	name: string;
	code: string;
	address?: string;
	clientId: string;
}

/**
 * Create client payload.
 */
interface CreateClientPayload {
	name: string;
}

/**
 * Eden Treaty API client type wrapper for type-safe API calls.
 */
interface ApiClient {
	employees: {
		get: (options: { query: ListQueryParams }) => Promise<{ data: ListResponse<Employee> | null; error: unknown }>;
		post: (body: CreateEmployeePayload) => Promise<{ data: ItemResponse<Employee> | null; error: unknown }>;
		(params: { id: string }): {
			get: () => Promise<{ data: ItemResponse<Employee> | null; error: unknown }>;
			put: (body: Partial<CreateEmployeePayload>) => Promise<{ data: ItemResponse<Employee> | null; error: unknown }>;
			delete: () => Promise<{ data: { message: string } | null; error: unknown }>;
		};
	};
	devices: {
		get: (options: { query: ListQueryParams }) => Promise<{ data: ListResponse<Device> | null; error: unknown }>;
		post: (body: CreateDevicePayload) => Promise<{ data: ItemResponse<Device> | null; error: unknown }>;
		(params: { id: string }): {
			get: () => Promise<{ data: ItemResponse<Device> | null; error: unknown }>;
			put: (body: Partial<CreateDevicePayload>) => Promise<{ data: ItemResponse<Device> | null; error: unknown }>;
			delete: () => Promise<{ data: { message: string } | null; error: unknown }>;
		};
	};
	locations: {
		get: (options: { query: ListQueryParams }) => Promise<{ data: ListResponse<Location> | null; error: unknown }>;
		post: (body: CreateLocationPayload) => Promise<{ data: ItemResponse<Location> | null; error: unknown }>;
		(params: { id: string }): {
			get: () => Promise<{ data: ItemResponse<Location> | null; error: unknown }>;
			put: (body: Partial<CreateLocationPayload>) => Promise<{ data: ItemResponse<Location> | null; error: unknown }>;
			delete: () => Promise<{ data: { message: string } | null; error: unknown }>;
		};
	};
	clients: {
		get: (options: { query: ListQueryParams }) => Promise<{ data: ListResponse<Client> | null; error: unknown }>;
		post: (body: CreateClientPayload) => Promise<{ data: ItemResponse<Client> | null; error: unknown }>;
		(params: { id: string }): {
			get: () => Promise<{ data: ItemResponse<Client> | null; error: unknown }>;
			put: (body: Partial<CreateClientPayload>) => Promise<{ data: ItemResponse<Client> | null; error: unknown }>;
			delete: () => Promise<{ data: { message: string } | null; error: unknown }>;
		};
	};
	attendance: {
		get: (options: { query: ListQueryParams }) => Promise<{ data: ListResponse<AttendanceRecord> | null; error: unknown }>;
	};
}

/**
 * Creates a typed API client for the Sen Checkin API.
 * Uses Eden Treaty under the hood for HTTP communication.
 *
 * @param baseUrl - The base URL of the API server
 * @returns Typed API client instance
 */
function createApiClient(baseUrl: string): ApiClient {
	const client = treaty(baseUrl);
	return client as unknown as ApiClient;
}

/**
 * Fully typed Eden Treaty client for API communication.
 * All API interactions MUST go through this client for type safety.
 *
 * @example
 * ```typescript
 * // Fetching clients with type-safe response
 * const { data, error } = await api.clients.get({ query: { limit: 50, offset: 0 } });
 *
 * // Creating a new client
 * const { data: newClient } = await api.clients.post({ name: 'Acme Corp' });
 * ```
 */
export const api = createApiClient(API_URL);

/**
 * Export types for use in components.
 */
export type {
	Employee,
	Device,
	Location,
	Client,
	AttendanceRecord,
	CreateEmployeePayload,
	CreateDevicePayload,
	CreateLocationPayload,
	CreateClientPayload,
	ListResponse,
	ItemResponse,
	PaginationInfo,
	EmployeeStatus,
	DeviceStatus,
	AttendanceType,
};
