import type { AttendanceRecord, AttendanceType, Device, Location } from '@sen-checkin/types';

import { API_BASE_URL } from './api';
import { authedFetch } from './auth-client';
import type { AttendanceQueryParams, ListQueryParams } from './query-keys';

type PaginatedResponse<T> = {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore?: boolean;
  };
};

export type DeviceDetail = Device & { organizationId?: string | null };

export interface RegisterDeviceInput {
  code: string;
  name?: string;
  deviceType?: string;
  platform?: string;
  organizationId?: string | null;
}

export interface RegisterDeviceResponse {
  device: DeviceDetail;
  isNew: boolean;
}

/**
 * Build a URLSearchParams instance from a key/value object while skipping empty values.
 *
 * @param params - Map of query keys to values
 * @returns URLSearchParams populated with non-empty entries
 */
function buildSearchParams(params: Record<string, string | number | undefined | null>): URLSearchParams {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.set(key, String(value));
  });

  return searchParams;
}

/**
 * Fetch a paginated list of locations.
 *
 * @param params - Optional filters for search, organization, and pagination
 * @returns Locations with pagination metadata
 * @throws Error when the API response is not OK
 */
export async function fetchLocationsList(
  params?: ListQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<Location>> {
  const searchParams = buildSearchParams({
    limit: params?.limit ?? 100,
    offset: params?.offset ?? 0,
    search: params?.search,
    organizationId: params?.organizationId ?? undefined,
  });

  const response = (await authedFetch(`${API_BASE_URL}/locations?${searchParams.toString()}`, {
    credentials: 'include',
  })) as Response;

  if (!response.ok) {
    throw new Error('Failed to load locations');
  }

  const json = (await response.json()) as {
    data?: Location[];
    pagination?: PaginatedResponse<Location>['pagination'];
  };

  return {
    data: json.data ?? [],
    pagination: json.pagination ?? {
      total: 0,
      limit: params?.limit ?? 100,
      offset: params?.offset ?? 0,
    },
  };
}

/**
 * Fetch the list of devices with optional filters.
 *
 * @param params - Filter and pagination options
 * @returns Devices with pagination metadata
 */
export async function fetchDevicesList(
  params?: ListQueryParams & {
    search?: string;
    locationId?: string;
    status?: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';
    organizationId?: string | null;
  },
): Promise<PaginatedResponse<Device>> {
  const searchParams = buildSearchParams({
    limit: params?.limit ?? 100,
    offset: params?.offset ?? 0,
    search: params?.search,
    locationId: params?.locationId,
    status: params?.status,
    organizationId: params?.organizationId ?? undefined,
  });

  const response = (await authedFetch(`${API_BASE_URL}/devices?${searchParams.toString()}`, {
    credentials: 'include',
  })) as Response;

  if (!response.ok) {
    throw new Error('Failed to load devices');
  }

  const json = (await response.json()) as {
    data?: Device[];
    pagination?: PaginatedResponse<Device>['pagination'];
  };

  return {
    data: json.data ?? [],
    pagination: json.pagination ?? {
      total: 0,
      limit: params?.limit ?? 100,
      offset: params?.offset ?? 0,
    },
  };
}

/**
 * Retrieve a single device by ID.
 *
 * @param deviceId - Device identifier
 * @returns Device detail or null if not found
 * @throws Error when the API response is not OK
 */
export async function fetchDeviceDetail(deviceId: string): Promise<DeviceDetail | null> {
  const response = (await authedFetch(`${API_BASE_URL}/devices/${deviceId}`, {
    credentials: 'include',
  })) as Response;

  if (!response.ok) {
    throw new Error('Failed to load device');
  }

	const json = (await response.json()) as { data?: DeviceDetail };
	return json.data ?? null;
}

/**
 * Register or upsert a device using a stable device code.
 *
 * @param input - Registration payload including stable code and metadata
 * @returns Registered device payload and creation flag from the API
 * @throws Error when the API call fails or returns no data
 */
export async function registerDevice(input: RegisterDeviceInput): Promise<RegisterDeviceResponse> {
  const response = (await authedFetch(`${API_BASE_URL}/devices/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code: input.code,
      name: input.name,
      deviceType: input.deviceType,
      platform: input.platform,
      organizationId: input.organizationId ?? undefined,
    }),
    credentials: 'include',
  })) as Response;

  if (!response.ok) {
    throw new Error('Failed to register device');
  }

  const json = (await response.json()) as { data?: DeviceDetail; isNew?: boolean };
  if (!json.data) {
    throw new Error('Device registration returned no data');
  }

  return {
    device: json.data,
    isNew: Boolean(json.isNew),
  };
}

/**
 * Update device metadata (name/location).
 *
 * @param deviceId - Device identifier
 * @param payload - Fields to update
 * @returns Updated device payload
 * @throws Error when the API response is not OK
 */
export async function updateDeviceSettings(
  deviceId: string,
  payload: Partial<Pick<Device, 'name' | 'locationId'>>,
): Promise<DeviceDetail> {
  const response = (await authedFetch(`${API_BASE_URL}/devices/${deviceId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    credentials: 'include',
  })) as Response;

  if (!response.ok) {
    throw new Error('Failed to update device settings');
  }

  const json = (await response.json()) as { data?: DeviceDetail };
	if (!json.data) {
		throw new Error('Device update returned no data');
	}
	return json.data;
}

/**
 * Send a heartbeat to mark the device as online.
 *
 * @param deviceId - Device identifier to ping
 * @returns Updated device payload with the latest heartbeat timestamp
 * @throws Error when the API response is not OK or lacks data
 */
export async function sendDeviceHeartbeat(deviceId: string): Promise<DeviceDetail> {
  const response = (await authedFetch(`${API_BASE_URL}/devices/${deviceId}/heartbeat`, {
    method: 'POST',
    credentials: 'include',
  })) as Response;

  if (!response.ok) {
    throw new Error('Failed to send device heartbeat');
  }

  const json = (await response.json()) as { data?: DeviceDetail };
  if (!json.data) {
    throw new Error('Heartbeat response missing data');
  }

  return json.data;
}

/**
 * Fetch attendance records with optional filters for employee/device/type/date.
 *
 * @param params - Attendance query filters
 * @returns Attendance records with pagination info
 */
export async function fetchAttendanceList(
  params?: AttendanceQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<AttendanceRecord>> {
  const searchParams = buildSearchParams({
    limit: params?.limit ?? 50,
    offset: params?.offset ?? 0,
    employeeId: params?.employeeId,
    deviceId: params?.deviceId,
    type: params?.type,
    fromDate: params?.fromDate ? params.fromDate.toISOString() : undefined,
    toDate: params?.toDate ? params.toDate.toISOString() : undefined,
    organizationId: params?.organizationId ?? undefined,
  });

  const response = (await authedFetch(`${API_BASE_URL}/attendance?${searchParams.toString()}`, {
    credentials: 'include',
  })) as Response;

  if (!response.ok) {
    throw new Error('Failed to load attendance records');
  }

  const json = (await response.json()) as {
    data?: AttendanceRecord[];
    pagination?: PaginatedResponse<AttendanceRecord>['pagination'];
  };

  return {
    data: json.data ?? [],
    pagination: json.pagination ?? {
      total: 0,
      limit: params?.limit ?? 50,
      offset: params?.offset ?? 0,
    },
  };
}

/**
 * Create an attendance record after successful face verification.
 *
 * @param input - Attendance payload
 * @returns The created attendance record
 * @throws Error when the API response is not OK
 */
export async function createAttendanceRecord(
  input: {
    employeeId: string;
    deviceId: string;
    type: AttendanceType;
    metadata?: Record<string, unknown>;
    timestamp?: Date;
  },
): Promise<AttendanceRecord> {
  const response = (await authedFetch(`${API_BASE_URL}/attendance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      employeeId: input.employeeId,
      deviceId: input.deviceId,
      type: input.type,
      metadata: input.metadata,
      timestamp: (input.timestamp ?? new Date()).toISOString(),
    }),
    credentials: 'include',
  })) as Response;

  if (!response.ok) {
    throw new Error('Failed to create attendance record');
  }

  const json = (await response.json()) as { data?: AttendanceRecord };
  if (!json.data) {
    throw new Error('Attendance response missing data');
  }

  return json.data;
}
