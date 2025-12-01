import type { AttendanceRecord, AttendanceType, Device, Location } from '@sen-checkin/types';

import { API_BASE_URL } from './api';

type PaginatedResponse<T> = {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore?: boolean;
  };
};

type DeviceDetail = Device & { organizationId?: string | null };

export async function fetchLocationsList(
  params?: { search?: string; limit?: number; offset?: number; organizationId?: string | null },
): Promise<PaginatedResponse<Location>> {
  const searchParams = new URLSearchParams();
  searchParams.set('limit', String(params?.limit ?? 100));
  searchParams.set('offset', String(params?.offset ?? 0));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.organizationId) searchParams.set('organizationId', params.organizationId);

  const response = await fetch(`${API_BASE_URL}/locations?${searchParams.toString()}`, {
    credentials: 'include',
  });

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

export async function fetchDeviceDetail(deviceId: string): Promise<DeviceDetail | null> {
  const response = await fetch(`${API_BASE_URL}/devices/${deviceId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to load device');
  }

  const json = (await response.json()) as { data?: DeviceDetail };
  return json.data ?? null;
}

export async function updateDeviceSettings(
  deviceId: string,
  payload: Partial<Pick<Device, 'name' | 'locationId'>>,
): Promise<DeviceDetail> {
  const response = await fetch(`${API_BASE_URL}/devices/${deviceId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to update device settings');
  }

  const json = (await response.json()) as { data?: DeviceDetail };
  if (!json.data) {
    throw new Error('Device update returned no data');
  }
  return json.data;
}

export async function createAttendanceRecord(
  input: {
    employeeId: string;
    deviceId: string;
    type: AttendanceType;
    metadata?: Record<string, unknown>;
    timestamp?: Date;
  },
): Promise<AttendanceRecord> {
  const response = await fetch(`${API_BASE_URL}/attendance`, {
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
  });

  if (!response.ok) {
    throw new Error('Failed to create attendance record');
  }

  const json = (await response.json()) as { data?: AttendanceRecord };
  if (!json.data) {
    throw new Error('Attendance response missing data');
  }

  return json.data;
}
