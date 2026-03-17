/**
 * Client functions for mobile app API communication.
 * All functions use the Eden Treaty client for type-safe API calls.
 *
 * @module lib/client-functions
 */

import type {
	AttendanceRecord,
	CheckOutReason,
	AttendanceType,
	Device,
	FaceEnrollmentResult,
	Location,
	UserCreationResult,
} from '@sen-checkin/types';

import { API_BASE_URL, api, authedFetchForEden } from './api';
import { getAccessToken } from './auth-client';
import { i18n } from './i18n';
import type {
	AttendanceQueryParams,
	FaceEnrollmentEmployeeListQueryParams,
	ListQueryParams,
} from './query-keys';

// ============================================================================
// Common Types
// ============================================================================

/**
 * Standard paginated response shape from API endpoints.
 */
type PaginatedResponse<T> = {
	/** Array of data items */
	data: T[];
	/** Pagination metadata */
	pagination: {
		/** Total count of available records */
		total: number;
		/** Number of records per page */
		limit: number;
		/** Number of records skipped */
		offset: number;
		/** Whether more records exist beyond this page */
		hasMore?: boolean;
	};
};

/**
 * Mobile-specific employee payload used in face enrollment selection.
 */
export interface FaceEnrollmentEmployee {
	/** Employee identifier */
	id: string;
	/** Employee code shown in selection list */
	code: string;
	/** Employee first name */
	firstName: string;
	/** Employee last name */
	lastName: string;
	/** Current employee status */
	status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
	/** Rekognition user ID when already provisioned */
	rekognitionUserId: string | null;
}

/**
 * Error codes returned by Rekognition enrollment endpoints.
 */
export type FaceEnrollmentApiErrorCode =
	| 'REKOGNITION_USER_EXISTS'
	| 'REKOGNITION_USER_MISSING'
	| 'INVALID_IMAGE_BASE64'
	| 'EMPLOYEE_NOT_FOUND'
	| 'EMPLOYEE_FORBIDDEN'
	| 'REKOGNITION_USER_CREATE_FAILED'
	| 'REKOGNITION_INDEX_FAILED'
	| 'UNKNOWN';

/**
 * Structured error for face enrollment API operations.
 */
export class FaceEnrollmentApiError extends Error {
	readonly code: FaceEnrollmentApiErrorCode;
	readonly status: number;

	/**
	 * Creates a new face enrollment API error.
	 *
	 * @param message - Human-readable error message
	 * @param status - HTTP status code received from API
	 * @param code - API error code
	 */
	constructor(message: string, status: number, code: FaceEnrollmentApiErrorCode) {
		super(message);
		this.name = 'FaceEnrollmentApiError';
		this.code = code;
		this.status = status;
	}
}

/**
 * Type guard for face enrollment API errors.
 *
 * @param error - Unknown error instance
 * @returns True when the error is a FaceEnrollmentApiError
 */
export function isFaceEnrollmentApiError(error: unknown): error is FaceEnrollmentApiError {
	return error instanceof FaceEnrollmentApiError;
}

/**
 * API payload shape returned by employee list route for face enrollment use cases.
 */
type FaceEnrollmentEmployeeApiRecord = {
	id?: unknown;
	code?: unknown;
	firstName?: unknown;
	lastName?: unknown;
	status?: unknown;
	rekognitionUserId?: unknown;
};

/**
 * Extracts message and error code from Eden Treaty error payloads.
 *
 * @param status - HTTP status code from response
 * @param value - Unknown error payload returned by Eden Treaty
 * @returns Parsed message and normalized error code
 */
function parseFaceEnrollmentError(
	status: number,
	value: unknown,
): { message: string; code: FaceEnrollmentApiErrorCode } {
	const payload =
		value && typeof value === 'object'
			? (value as { message?: unknown; errorCode?: unknown })
			: null;
	const message =
		typeof payload?.message === 'string' && payload.message.length > 0
			? payload.message
			: 'No se pudo completar el enrolamiento facial';
	const rawCode = payload?.errorCode;
	const code =
		rawCode === 'REKOGNITION_USER_EXISTS' ||
		rawCode === 'REKOGNITION_USER_MISSING' ||
		rawCode === 'INVALID_IMAGE_BASE64' ||
		rawCode === 'EMPLOYEE_NOT_FOUND' ||
		rawCode === 'EMPLOYEE_FORBIDDEN' ||
		rawCode === 'REKOGNITION_USER_CREATE_FAILED' ||
		rawCode === 'REKOGNITION_INDEX_FAILED'
			? rawCode
			: 'UNKNOWN';

	if (status >= 500 && code === 'UNKNOWN') {
		return {
			message,
			code: 'REKOGNITION_INDEX_FAILED',
		};
	}

	return { message, code };
}

/**
 * Normalizes employee payload records into typed face enrollment records.
 *
 * @param record - Unknown employee payload from API
 * @returns Typed employee record or null when payload is invalid
 */
function normalizeFaceEnrollmentEmployee(record: unknown): FaceEnrollmentEmployee | null {
	if (!record || typeof record !== 'object') {
		return null;
	}

	const value = record as FaceEnrollmentEmployeeApiRecord;
	if (
		typeof value.id !== 'string' ||
		typeof value.code !== 'string' ||
		typeof value.firstName !== 'string' ||
		typeof value.lastName !== 'string'
	) {
		return null;
	}

	const status =
		value.status === 'ACTIVE' || value.status === 'INACTIVE' || value.status === 'ON_LEAVE'
			? value.status
			: null;

	if (!status) {
		return null;
	}

	return {
		id: value.id,
		code: value.code,
		firstName: value.firstName,
		lastName: value.lastName,
		status,
		rekognitionUserId:
			typeof value.rekognitionUserId === 'string' ? value.rekognitionUserId : null,
	};
}

/**
 * Removes image data URL prefixes before sending payload to the API.
 *
 * @param imageBase64 - Base64 image payload with or without data URL prefix
 * @returns Clean base64 payload expected by the API
 */
function toRawBase64Image(imageBase64: string): string {
	return imageBase64.replace(/^data:image\/\w+;base64,/, '');
}

// ============================================================================
// Device Types
// ============================================================================

/**
 * Extended device type including organization relationship.
 */
export type DeviceDetail = Device & { organizationId?: string | null };

/**
 * Input payload for registering a device.
 */
export interface RegisterDeviceInput {
	/** Stable device code generated by the mobile client */
	code: string;
	/** Friendly device name */
	name?: string;
	/** Device type label (e.g., iPhone, Android) */
	deviceType?: string;
	/** Platform identifier (ios, android) */
	platform?: string;
	/** Organization ID to register device under */
	organizationId?: string | null;
}

/**
 * Response from device registration endpoint.
 */
export interface RegisterDeviceResponse {
	/** Registered device details */
	device: DeviceDetail;
	/** Whether this is a newly created device */
	isNew: boolean;
}

/**
 * Fetch a paginated list of locations using the Eden Treaty client.
 *
 * @param params - Optional filters for search, organization, and pagination
 * @returns Locations with pagination metadata
 * @throws Error when the API response is not OK
 */
export async function fetchLocationsList(
	params?: ListQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<Location>> {
	const limit = params?.limit ?? 100;
	const offset = params?.offset ?? 0;

	// Build query object conditionally to avoid sending "undefined" strings
	const query: {
		limit: number;
		offset: number;
		search?: string;
		organizationId?: string;
	} = {
		limit,
		offset,
	};

	if (params?.search) {
		query.search = params.search;
	}

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}

	const { data, error } = await api.locations.get({
		$query: query,
	});

	if (error) {
		console.error('[fetchLocationsList] Eden Treaty error:', error);
		throw new Error(i18n.t('Errors.api.loadLocations'));
	}

	// Type guard: check if data has the expected shape
	if (!data || 'error' in data) {
		const errorMessage = data && 'error' in data ? String(data.error) : 'Unknown error';
		console.error('[fetchLocationsList] API error:', errorMessage);
		throw new Error(i18n.t('Errors.api.loadLocations'));
	}

	return {
		data: (data.data ?? []) as Location[],
		pagination: data.pagination ?? {
			total: 0,
			limit,
			offset,
		},
	};
}

/**
 * Device status enumeration matching API schema.
 */
export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';

/**
 * Query parameters for fetching devices list.
 */
export interface DevicesListParams extends ListQueryParams {
	/** Filter devices by name or code */
	search?: string;
	/** Filter by location ID */
	locationId?: string;
	/** Filter by device status */
	status?: DeviceStatus;
	/** Filter by organization ID */
	organizationId?: string | null;
}

/**
 * Fetch the list of devices with optional filters using the Eden Treaty client.
 *
 * @param params - Filter and pagination options
 * @returns Devices with pagination metadata
 * @throws Error when the API response is not OK
 */
export async function fetchDevicesList(
	params?: DevicesListParams,
): Promise<PaginatedResponse<Device>> {
	const limit = params?.limit ?? 100;
	const offset = params?.offset ?? 0;

	// Build query object conditionally to avoid sending "undefined" strings
	const query: {
		limit: number;
		offset: number;
		search?: string;
		locationId?: string;
		status?: DeviceStatus;
		organizationId?: string;
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

	if (params?.status) {
		query.status = params.status;
	}

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}

	const { data, error } = await api.devices.get({
		$query: query,
	});

	if (error) {
		console.error('[fetchDevicesList] Eden Treaty error:', error);
		throw new Error(i18n.t('Errors.api.loadDevices'));
	}

	if (!data || 'error' in data) {
		const errorMessage = data && 'error' in data ? String(data.error) : 'Unknown error';
		console.error('[fetchDevicesList] API error:', errorMessage);
		throw new Error(i18n.t('Errors.api.loadDevices'));
	}

	return {
		data: (data.data ?? []) as Device[],
		pagination: data.pagination ?? {
			total: 0,
			limit,
			offset,
		},
	};
}

/**
 * Retrieve a single device by ID using the Eden Treaty client.
 *
 * @param deviceId - Device identifier (UUID)
 * @returns Device detail or null if not found
 * @throws Error when the API response is not OK
 */
export async function fetchDeviceDetail(deviceId: string): Promise<DeviceDetail | null> {
	const deviceEndpoint = api.devices[deviceId];
	if (!deviceEndpoint) {
		throw new Error(i18n.t('Errors.api.invalidDeviceEndpoint'));
	}

	const { data, error } = await deviceEndpoint.get();

	if (error) {
		console.error('[fetchDeviceDetail] Eden Treaty error:', error);
		throw new Error(i18n.t('Errors.api.loadDevice'));
	}

	if (!data || 'error' in data) {
		const errorMessage = data && 'error' in data ? String(data.error) : 'Unknown error';
		console.error('[fetchDeviceDetail] API error:', errorMessage);
		throw new Error(i18n.t('Errors.api.loadDevice'));
	}

	return (data.data as DeviceDetail) ?? null;
}

/**
 * Register or upsert a device using a stable device code via the Eden Treaty client.
 * When the code already exists for the same organization, metadata is refreshed.
 * Otherwise, a new device is created.
 *
 * @param input - Registration payload including stable code and metadata
 * @returns Registered device payload and creation flag from the API
 * @throws Error when the API call fails or returns no data
 */
export async function registerDevice(input: RegisterDeviceInput): Promise<RegisterDeviceResponse> {
	const { data, error } = await api.devices.register.post({
		code: input.code,
		name: input.name,
		deviceType: input.deviceType,
		platform: input.platform,
		organizationId: input.organizationId ?? undefined,
	});

	if (error) {
		console.error('[registerDevice] Eden Treaty error:', error);
		throw new Error(i18n.t('Errors.api.registerDevice'));
	}

	if (!data || 'error' in data) {
		const errorMessage = data && 'error' in data ? String(data.error) : 'Unknown error';
		console.error('[registerDevice] API error:', errorMessage);
		throw new Error(i18n.t('Errors.api.registerDevice'));
	}

	if (!data.data) {
		throw new Error(i18n.t('Errors.api.registerDeviceMissingData'));
	}

	return {
		device: data.data as DeviceDetail,
		isNew: Boolean(data.isNew),
	};
}

/**
 * Payload for updating device settings.
 */
export interface UpdateDevicePayload {
	/** Device friendly name */
	name?: string | null;
	/** Location ID reference */
	locationId?: string | null;
}

/**
 * Update device metadata (name/location) via the Eden Treaty client.
 *
 * @param deviceId - Device identifier (UUID)
 * @param payload - Fields to update (name, locationId)
 * @returns Updated device payload
 * @throws Error when the API response is not OK or lacks data
 */
export async function updateDeviceSettings(
	deviceId: string,
	payload: UpdateDevicePayload,
): Promise<DeviceDetail> {
	const deviceEndpoint = api.devices[deviceId];
	if (!deviceEndpoint) {
		throw new Error(i18n.t('Errors.api.invalidDeviceEndpoint'));
	}

	const { data, error } = await deviceEndpoint.put(payload);

	if (error) {
		console.error('[updateDeviceSettings] Eden Treaty error:', error);
		throw new Error(i18n.t('Errors.api.updateDeviceSettings'));
	}

	if (!data || 'error' in data) {
		const errorMessage = data && 'error' in data ? String(data.error) : 'Unknown error';
		console.error('[updateDeviceSettings] API error:', errorMessage);
		throw new Error(i18n.t('Errors.api.updateDeviceSettings'));
	}

	if (!data.data) {
		throw new Error(i18n.t('Errors.api.updateDeviceMissingData'));
	}

	return data.data as DeviceDetail;
}

// ============================================================================
// Face Enrollment Types
// ============================================================================

/**
 * Parameters for the face enrollment employee list endpoint.
 */
export interface FaceEnrollmentEmployeesParams extends FaceEnrollmentEmployeeListQueryParams {
	/** Status filter for employee search. Defaults to ACTIVE */
	status?: 'ACTIVE';
}

/**
 * Fetches ACTIVE employees for face enrollment with a hard limit of 200 records.
 * Filtering by text must be done locally by the caller.
 *
 * @param params - Optional organization filter and custom limit
 * @returns Employee list and pagination metadata capped to 200 records
 * @throws Error when the API call fails
 */
export async function fetchFaceEnrollmentEmployees(
	params?: FaceEnrollmentEmployeesParams,
): Promise<PaginatedResponse<FaceEnrollmentEmployee>> {
	const requestedLimit = Math.min(params?.limit ?? 200, 200);
	const apiPageLimit = 100;

	const employees: FaceEnrollmentEmployee[] = [];
	let offset = 0;
	let total = 0;
	let hasMore = true;

	while (employees.length < requestedLimit && hasMore) {
		const query: {
			limit: number;
			offset: number;
			status: 'ACTIVE';
			organizationId?: string;
		} = {
			limit: Math.min(apiPageLimit, requestedLimit - employees.length),
			offset,
			status: 'ACTIVE',
		};

		if (params?.organizationId) {
			query.organizationId = params.organizationId;
		}

		const response = await api.employees.get({ $query: query });

		if (response.error) {
			const message = (() => {
				const payload = response.error?.value as { message?: unknown } | undefined;
				return typeof payload?.message === 'string'
					? payload.message
					: i18n.t('Errors.api.loadFaceEnrollmentEmployees');
			})();
			console.error('[fetchFaceEnrollmentEmployees] Eden Treaty error:', {
				status: response.status,
				error: response.error?.value ?? response.error,
			});
			throw new Error(message);
		}

		const payload = response.data as
			| {
					data?: unknown[];
					pagination?: PaginatedResponse<FaceEnrollmentEmployee>['pagination'];
			  }
			| undefined;

		const pageRecords = payload?.data ?? [];
		const normalizedPage = pageRecords
			.map((record) => normalizeFaceEnrollmentEmployee(record))
			.filter((record): record is FaceEnrollmentEmployee => record !== null)
			.filter((record) => record.status === 'ACTIVE');
		employees.push(...normalizedPage);

		const pagination = payload?.pagination;
		total = pagination?.total ?? Math.max(total, employees.length);
		const nextOffset = offset + pageRecords.length;
		hasMore =
			pagination?.hasMore ??
			(Boolean(pagination) ? nextOffset < (pagination?.total ?? nextOffset) : false);

		if (pageRecords.length === 0) {
			hasMore = false;
		}
		offset = nextOffset;
	}

	const limitedEmployees = employees.slice(0, requestedLimit);

	return {
		data: limitedEmployees,
		pagination: {
			total: total > 0 ? total : limitedEmployees.length,
			limit: requestedLimit,
			offset: 0,
		},
	};
}

/**
 * Creates the Rekognition user vector for a specific employee.
 *
 * @param employeeId - Employee identifier to provision in Rekognition
 * @returns Successful user creation payload
 * @throws FaceEnrollmentApiError when the API responds with an error
 */
export async function createEmployeeRekognitionUser(
	employeeId: string,
): Promise<UserCreationResult> {
	const employeeRoute = api.employees[employeeId];
	if (!employeeRoute) {
		throw new Error(i18n.t('Errors.api.invalidEmployeeRoute'));
	}

	const response = await employeeRoute['create-rekognition-user'].post({});

	if (response.error) {
		const parsed = parseFaceEnrollmentError(response.status, response.error.value);
		throw new FaceEnrollmentApiError(parsed.message, response.status, parsed.code);
	}

	const payload = response.data as UserCreationResult | null;
	if (!payload) {
		throw new Error(i18n.t('Errors.api.createRekognitionUserMissingData'));
	}

	return payload;
}

/**
 * Enrolls a face image for a specific employee.
 *
 * @param employeeId - Employee identifier for face enrollment
 * @param imageBase64 - Base64 image payload from camera capture
 * @returns Face enrollment result payload
 * @throws FaceEnrollmentApiError when the API responds with an enrollment error
 */
export async function enrollEmployeeFace(
	employeeId: string,
	imageBase64: string,
): Promise<FaceEnrollmentResult> {
	const employeeRoute = api.employees[employeeId];
	if (!employeeRoute) {
		throw new Error(i18n.t('Errors.api.invalidEmployeeRoute'));
	}

	const response = await employeeRoute['enroll-face'].post({
		image: toRawBase64Image(imageBase64),
	});

	if (response.error) {
		const parsed = parseFaceEnrollmentError(response.status, response.error.value);
		throw new FaceEnrollmentApiError(parsed.message, response.status, parsed.code);
	}

	const payload = response.data as FaceEnrollmentResult | null;
	if (!payload) {
		throw new Error(i18n.t('Errors.api.faceEnrollmentMissingData'));
	}

	return payload;
}

/**
 * Runs the idempotent mobile enrollment flow.
 * Attempts to create a user when missing and always continues on
 * REKOGNITION_USER_EXISTS (HTTP 409).
 *
 * @param input - Enrollment flow arguments
 * @param input.employeeId - Target employee ID
 * @param input.imageBase64 - Base64 camera image payload
 * @param input.hasRekognitionUser - Local flag indicating existing Rekognition user
 * @returns Face enrollment result payload
 * @throws FaceEnrollmentApiError when enrollment cannot be completed
 */
export async function fullEnrollmentFlow(input: {
	employeeId: string;
	imageBase64: string;
	hasRekognitionUser: boolean;
}): Promise<FaceEnrollmentResult> {
	const shouldCreateUser = !input.hasRekognitionUser;

	if (shouldCreateUser) {
		try {
			await createEmployeeRekognitionUser(input.employeeId);
		} catch (error: unknown) {
			if (!isFaceEnrollmentApiError(error) || error.code !== 'REKOGNITION_USER_EXISTS') {
				throw error;
			}
		}
	}

	try {
		return await enrollEmployeeFace(input.employeeId, input.imageBase64);
	} catch (error: unknown) {
		if (!isFaceEnrollmentApiError(error) || error.code !== 'REKOGNITION_USER_MISSING') {
			throw error;
		}

		try {
			await createEmployeeRekognitionUser(input.employeeId);
		} catch (createError: unknown) {
			if (
				!isFaceEnrollmentApiError(createError) ||
				createError.code !== 'REKOGNITION_USER_EXISTS'
			) {
				throw createError;
			}
		}

		return enrollEmployeeFace(input.employeeId, input.imageBase64);
	}
}

/**
 * Error payload for heartbeat failures.
 */
export type HeartbeatErrorCode =
	| 'DEVICE_DISABLED'
	| 'DEVICE_NOT_FOUND'
	| 'UNAUTHORIZED'
	| 'FORBIDDEN'
	| 'UNKNOWN';

/**
 * Specialized error for heartbeat request failures.
 */
export class HeartbeatError extends Error {
	readonly status: number;
	readonly code: HeartbeatErrorCode;

	/**
	 * Construct a heartbeat error.
	 *
	 * @param message - Error message
	 * @param status - HTTP status code
	 * @param code - Optional error code
	 */
	constructor(message: string, status: number, code?: HeartbeatErrorCode) {
		super(message);
		this.name = 'HeartbeatError';
		this.status = status;
		this.code = code ?? 'UNKNOWN';
	}
}

/**
 * Type guard for heartbeat errors.
 *
 * @param error - Unknown error value
 * @returns True when the error is a HeartbeatError
 */
export function isHeartbeatError(error: unknown): error is HeartbeatError {
	return error instanceof HeartbeatError;
}

/**
 * Send a heartbeat to mark the device as online.
 * Updates the device's lastHeartbeat timestamp and sets status to ONLINE.
 *
 * Returns null if no access token is available (e.g., before OAuth 2.0 device
 * authorization completes). This allows the heartbeat to be called at any time
 * without failing during the initial authentication flow.
 *
 * Note: Uses direct fetch instead of Eden Treaty due to nested dynamic route limitations.
 *
 * @param deviceId - Device identifier (UUID) to ping
 * @returns Updated device payload with the latest heartbeat timestamp, or null if not authenticated
 * @throws HeartbeatError when the API response is not OK or lacks data (after authentication)
 */
export async function sendDeviceHeartbeat(deviceId: string): Promise<DeviceDetail | null> {
	// Check if we have an access token before attempting the request
	// This prevents errors during the initial OAuth 2.0 device authorization flow
	const accessToken = getAccessToken();
	if (!accessToken) {
		return null;
	}

	const response = await authedFetchForEden(`${API_BASE_URL}/devices/${deviceId}/heartbeat`, {
		method: 'POST',
	});

	if (!response.ok) {
		const payload = await response
			.json()
			.catch(() => null)
			.then(
				(data) =>
					data as {
						error?: { code?: string; message?: string };
					} | null,
			);
		const rawCode = payload?.error?.code;
		const code: HeartbeatErrorCode =
			rawCode === 'DEVICE_DISABLED'
				? 'DEVICE_DISABLED'
				: rawCode === 'DEVICE_NOT_FOUND'
					? 'DEVICE_NOT_FOUND'
					: rawCode === 'UNAUTHORIZED'
						? 'UNAUTHORIZED'
						: rawCode === 'FORBIDDEN'
							? 'FORBIDDEN'
							: 'UNKNOWN';
		const message =
			typeof payload?.error?.message === 'string'
				? payload.error.message
				: i18n.t('Errors.api.sendDeviceHeartbeat');
		console.error('[sendDeviceHeartbeat] API error:', response.status, message);
		throw new HeartbeatError(message, response.status, code);
	}

	const json = (await response.json()) as { data?: DeviceDetail; error?: string };

	if ('error' in json && json.error) {
		console.error('[sendDeviceHeartbeat] API error:', json.error);
		throw new Error(i18n.t('Errors.api.sendDeviceHeartbeat'));
	}

	if (!json.data) {
		throw new Error(i18n.t('Errors.api.heartbeatMissingData'));
	}

	return json.data;
}

/**
 * Query parameters for fetching attendance records.
 */
export interface AttendanceListParams extends AttendanceQueryParams {
	/** Filter by organization ID */
	organizationId?: string | null;
}

/**
 * Fetch attendance records with optional filters via the Eden Treaty client.
 * Supports filtering by employee, device, type, and date range.
 *
 * @param params - Attendance query filters
 * @returns Attendance records with pagination info
 * @throws Error when the API response is not OK
 */
export async function fetchAttendanceList(
	params?: AttendanceListParams,
): Promise<PaginatedResponse<AttendanceRecord>> {
	const limit = params?.limit ?? 50;
	const offset = params?.offset ?? 0;

	// Build query object conditionally to avoid sending "undefined" strings
	const query: {
		limit: number;
		offset: number;
		employeeId?: string;
		deviceId?: string;
		type?: AttendanceType;
		fromDate?: Date;
		toDate?: Date;
		organizationId?: string;
	} = {
		limit,
		offset,
	};

	if (params?.employeeId) {
		query.employeeId = params.employeeId;
	}

	if (params?.deviceId) {
		query.deviceId = params.deviceId;
	}

	if (params?.type) {
		query.type = params.type;
	}

	if (params?.fromDate) {
		query.fromDate = params.fromDate;
	}

	if (params?.toDate) {
		query.toDate = params.toDate;
	}

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}

	const { data, error } = await api.attendance.get({
		$query: query,
	});

	if (error) {
		console.error('[fetchAttendanceList] Eden Treaty error:', error);
		throw new Error(i18n.t('Errors.api.loadAttendanceRecords'));
	}

	if (!data || 'error' in data) {
		const errorMessage = data && 'error' in data ? String(data.error) : 'Unknown error';
		console.error('[fetchAttendanceList] API error:', errorMessage);
		throw new Error(i18n.t('Errors.api.loadAttendanceRecords'));
	}

	return {
		data: (data.data ?? []) as AttendanceRecord[],
		pagination: data.pagination ?? {
			total: 0,
			limit,
			offset,
		},
	};
}

/**
 * Input payload for creating an attendance record.
 */
export interface CreateAttendanceInput {
	/** Employee ID (UUID) */
	employeeId: string;
	/** Device ID (UUID) */
	deviceId: string;
	/** Attendance type (CHECK_IN or CHECK_OUT) */
	type: AttendanceType;
	/** Additional metadata (optional) */
	metadata?: Record<string, unknown>;
	/** Check-out reason for check-out style attendance events */
	checkOutReason?: CheckOutReason;
	/** Timestamp of the attendance event (defaults to now) */
	timestamp?: Date;
}

/**
 * Specialized error for attendance creation failures.
 */
export class AttendanceApiError extends Error {
	readonly status: number;

	/**
	 * Creates a new attendance API error.
	 *
	 * @param message - Human-readable error message
	 * @param status - HTTP status code associated with the failure
	 * @param options - Optional error metadata such as the original cause
	 */
	constructor(message: string, status: number, options?: ErrorOptions) {
		super(message, options);
		this.name = 'AttendanceApiError';
		this.status = status;
	}
}

/**
 * Create an attendance record after successful face verification via the Eden Treaty client.
 *
 * @param input - Attendance payload including employeeId, deviceId, type, and optional metadata
 * @returns The created attendance record
 * @throws Error when the API response is not OK or lacks data
 */
export async function createAttendanceRecord(
	input: CreateAttendanceInput,
): Promise<AttendanceRecord> {
	const timestamp = input.timestamp ?? new Date();

	const response = await api.attendance.post({
		employeeId: input.employeeId,
		deviceId: input.deviceId,
		type: input.type,
		checkOutReason: input.checkOutReason,
		metadata: input.metadata,
		timestamp,
	});
	const { data, error, status } = response;

	if (error) {
		console.error('[createAttendanceRecord] Eden Treaty error:', error);
		const errorCause = error instanceof Error ? error : new Error(String(error));
		throw new AttendanceApiError(i18n.t('Errors.api.createAttendanceRecord'), status, {
			cause: errorCause,
		});
	}

	if (!data || 'error' in data) {
		const errorMessage = data && 'error' in data ? String(data.error) : 'Unknown error';
		console.error('[createAttendanceRecord] API error:', errorMessage);
		throw new AttendanceApiError(
			i18n.t('Errors.api.createAttendanceRecord'),
			status >= 400 ? status : 500,
		);
	}

	if (!data.data) {
		throw new AttendanceApiError(i18n.t('Errors.api.attendanceRecordMissingData'), 422);
	}

	return data.data as AttendanceRecord;
}
