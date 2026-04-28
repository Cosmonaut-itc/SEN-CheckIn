import { API_BASE_URL, authedFetchForEden } from './api';
import { i18n } from './i18n';

/**
 * Effective settings PIN mode returned by the API.
 */
export type DeviceSettingsPinMode = 'GLOBAL' | 'DEVICE' | 'DISABLED';

/**
 * Source that determines whether a settings PIN is required.
 */
export type DeviceSettingsPinSource = 'GLOBAL' | 'DEVICE' | 'NONE';

/**
 * Settings PIN status payload for a device.
 */
export interface DeviceSettingsPinStatus {
	/** Device identifier */
	deviceId: string;
	/** Effective PIN mode */
	mode: DeviceSettingsPinMode;
	/** Whether opening settings requires PIN verification */
	pinRequired: boolean;
	/** Source of the effective PIN requirement */
	source: DeviceSettingsPinSource;
	/** Whether the organization has a global PIN configured */
	globalPinConfigured: boolean;
	/** Whether the device has an override PIN configured */
	deviceOverrideConfigured: boolean;
}

/**
 * Settings PIN verification payload returned by the API.
 */
export interface DeviceSettingsPinVerification {
	/** Whether the submitted PIN was valid */
	valid: boolean;
}

/**
 * Error codes normalized for settings PIN API operations.
 */
export type DeviceSettingsPinErrorCode =
	| 'RATE_LIMITED'
	| 'MISSING_DATA'
	| 'UNAUTHORIZED'
	| 'FORBIDDEN'
	| 'DEVICE_NOT_FOUND'
	| 'UNKNOWN';

/**
 * Structured error for settings PIN API operations.
 */
export class DeviceSettingsPinError extends Error {
	readonly status: number;
	readonly code: DeviceSettingsPinErrorCode;

	/**
	 * Creates a new settings PIN API error.
	 *
	 * @param message - Human-readable error message
	 * @param status - HTTP status code received from API
	 * @param code - Normalized error code
	 */
	constructor(message: string, status: number, code: DeviceSettingsPinErrorCode) {
		super(message);
		this.name = 'DeviceSettingsPinError';
		this.status = status;
		this.code = code;
	}
}

/**
 * Type guard for settings PIN API errors.
 *
 * @param error - Unknown error instance
 * @returns True when the error is a DeviceSettingsPinError
 */
export function isDeviceSettingsPinError(error: unknown): error is DeviceSettingsPinError {
	return error instanceof DeviceSettingsPinError;
}

/**
 * Reads a normalized error from settings PIN API responses.
 *
 * @param response - Fetch response returned by the API
 * @returns Structured settings PIN error
 */
async function toDeviceSettingsPinError(response: Response): Promise<DeviceSettingsPinError> {
	const payload = await response
		.json()
		.catch(() => null)
		.then(
			(data) =>
				data as {
					error?: { code?: unknown; message?: unknown };
					message?: unknown;
				} | null,
		);
	const rawCode = payload?.error?.code;
	const code: DeviceSettingsPinErrorCode =
		rawCode === 'RATE_LIMITED'
			? 'RATE_LIMITED'
			: rawCode === 'UNAUTHORIZED'
				? 'UNAUTHORIZED'
				: rawCode === 'FORBIDDEN'
					? 'FORBIDDEN'
					: rawCode === 'DEVICE_NOT_FOUND'
						? 'DEVICE_NOT_FOUND'
						: 'UNKNOWN';
	const message =
		typeof payload?.error?.message === 'string'
			? payload.error.message
			: typeof payload?.message === 'string'
				? payload.message
				: i18n.t('Errors.api.settingsPinAccess');

	return new DeviceSettingsPinError(message, response.status, code);
}

/**
 * Fetches online settings PIN status for a device.
 *
 * @param deviceId - Device identifier
 * @returns Settings PIN status payload
 * @throws DeviceSettingsPinError when the API response is not OK or lacks data
 */
export async function fetchDeviceSettingsPinStatus(
	deviceId: string,
): Promise<DeviceSettingsPinStatus> {
	const response = await authedFetchForEden(
		`${API_BASE_URL}/devices/${encodeURIComponent(deviceId)}/settings-pin-status`,
		{
			method: 'GET',
		},
	);

	if (!response.ok) {
		throw await toDeviceSettingsPinError(response);
	}

	const json = (await response.json()) as { data?: DeviceSettingsPinStatus };
	if (!json.data) {
		throw new DeviceSettingsPinError(
			i18n.t('Errors.api.settingsPinMissingData'),
			response.status,
			'MISSING_DATA',
		);
	}

	return json.data;
}

/**
 * Verifies a settings PIN online for a device.
 *
 * @param deviceId - Device identifier
 * @param pin - Four-digit PIN entered by the user
 * @returns Verification result
 * @throws DeviceSettingsPinError when the API response is not OK or lacks data
 */
export async function verifyDeviceSettingsPin(
	deviceId: string,
	pin: string,
): Promise<DeviceSettingsPinVerification> {
	const response = await authedFetchForEden(
		`${API_BASE_URL}/devices/${encodeURIComponent(deviceId)}/settings-pin-verify`,
		{
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({ pin }),
		},
	);

	if (!response.ok) {
		throw await toDeviceSettingsPinError(response);
	}

	const json = (await response.json()) as { data?: DeviceSettingsPinVerification };
	if (!json.data) {
		throw new DeviceSettingsPinError(
			i18n.t('Errors.api.settingsPinMissingData'),
			response.status,
			'MISSING_DATA',
		);
	}

	return json.data;
}
