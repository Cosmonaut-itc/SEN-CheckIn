'use server';

/**
 * Server actions for device CRUD operations.
 *
 * These actions are called from client components via useMutation
 * and execute on the server with full access to the API.
 *
 * All actions forward the caller's session cookies to the API
 * for proper authentication.
 *
 * @module actions/devices
 */

import { headers } from 'next/headers';
import { SETTINGS_PIN_REGEX } from '@sen-checkin/types';

import { createServerApiClient } from '@/lib/server-api';
import type { DeviceSettingsPinMode, DeviceStatus } from '@/lib/client-functions';

/**
 * Input data for creating a new device.
 */
export interface CreateDeviceInput {
	/** Unique device code */
	code: string;
	/** Device name */
	name?: string;
	/** Device type (TABLET, KIOSK, MOBILE, etc.) */
	deviceType?: string;
	/** Device status */
	status: DeviceStatus;
	/** Optional location assignment */
	locationId?: string;
}

/**
 * Input data for updating an existing device.
 */
export interface UpdateDeviceInput {
	/** The device ID to update */
	id: string;
	/** Unique device code */
	code: string;
	/** Device name */
	name?: string;
	/** Device type (TABLET, KIOSK, MOBILE, etc.) */
	deviceType?: string;
	/** Device status */
	status: DeviceStatus;
	/** Optional location assignment */
	locationId?: string | null;
}

/**
 * Input data for updating organization settings PIN policy.
 */
export interface UpdateDeviceSettingsPinConfigInput {
	/** Settings PIN policy mode */
	mode: DeviceSettingsPinMode;
	/** New global PIN, null to clear, or undefined to preserve */
	globalPin?: string | null;
	/** Optional organization scope */
	organizationId?: string | null;
}

/**
 * Input data for updating a device settings PIN override.
 */
export interface UpdateDeviceSettingsPinInput {
	/** The device ID to update */
	deviceId: string;
	/** New device PIN or null to clear */
	pin: string | null;
}

/**
 * Result of a mutation operation.
 */
export interface MutationResult<T = unknown> {
	/** Whether the operation was successful */
	success: boolean;
	/** The data returned from the operation */
	data?: T;
	/** Error message if the operation failed */
	error?: string;
}

/**
 * Determines whether a value is a plain object.
 *
 * @param value - Value to inspect
 * @returns True when the value is a record-like object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object';
}

/**
 * Extracts a nested string property from an unknown payload.
 *
 * @param value - Payload to inspect
 * @param path - Property path to read
 * @returns The string value when present
 */
function getNestedString(value: unknown, path: string[]): string | null {
	let current: unknown = value;

	for (const segment of path) {
		if (!isRecord(current)) {
			return null;
		}
		current = current[segment];
	}

	return typeof current === 'string' ? current : null;
}

/**
 * Extracts the most useful Treaty/API error message.
 *
 * @param error - Treaty error payload
 * @param fallback - Fallback message
 * @returns API error message or fallback
 */
function getApiErrorMessage(error: unknown, fallback: string): string {
	return (
		getNestedString(error, ['value', 'error', 'message']) ??
		getNestedString(error, ['error', 'message']) ??
		getNestedString(error, ['message']) ??
		fallback
	);
}

/**
 * Validates an optional settings PIN.
 *
 * @param pin - PIN value to validate
 * @returns Error message when invalid, otherwise null
 */
function validateSettingsPin(pin: string | null | undefined): string | null {
	if (pin === null || pin === undefined) {
		return null;
	}

	return SETTINGS_PIN_REGEX.test(pin) ? null : 'PIN must be exactly four numeric digits';
}

/**
 * Creates a new device.
 *
 * @param input - The device data to create
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await createDevice({
 *   code: 'DEV001',
 *   name: 'Main Entrance Kiosk',
 *   deviceType: 'KIOSK',
 *   status: 'OFFLINE',
 * });
 * ```
 */
export async function createDevice(input: CreateDeviceInput): Promise<MutationResult> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api.devices.post({
			code: input.code,
			name: input.name || undefined,
			deviceType: input.deviceType || undefined,
			status: input.status,
			locationId: input.locationId,
		});

		if (response.error) {
			return {
				success: false,
				error: 'Failed to create device',
			};
		}

		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		console.error('Failed to create device:', error);
		return {
			success: false,
			error: 'Failed to create device',
		};
	}
}

/**
 * Updates an existing device.
 *
 * @param input - The device data to update
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await updateDevice({
 *   id: 'device-id',
 *   code: 'DEV001',
 *   name: 'Main Entrance Kiosk',
 *   status: 'ONLINE',
 * });
 * ```
 */
export async function updateDevice(input: UpdateDeviceInput): Promise<MutationResult> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api.devices[input.id].put({
			code: input.code,
			name: input.name || undefined,
			deviceType: input.deviceType || undefined,
			status: input.status,
			locationId: input.locationId ?? undefined,
		});

		if (response.error) {
			return {
				success: false,
				error: 'Failed to update device',
			};
		}

		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		console.error('Failed to update device:', error);
		return {
			success: false,
			error: 'Failed to update device',
		};
	}
}

/**
 * Deletes a device.
 *
 * @param id - The device ID to delete
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await deleteDevice('device-id');
 * ```
 */
export async function deleteDevice(id: string): Promise<MutationResult> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api.devices[id].delete();

		if (response.error) {
			return {
				success: false,
				error: 'Failed to delete device',
			};
		}

		return {
			success: true,
		};
	} catch (error) {
		console.error('Failed to delete device:', error);
		return {
			success: false,
			error: 'Failed to delete device',
		};
	}
}

/**
 * Updates organization settings PIN configuration.
 *
 * @param input - Settings PIN mode and optional global PIN update
 * @returns A promise resolving to the mutation result
 */
export async function updateDeviceSettingsPinConfig(
	input: UpdateDeviceSettingsPinConfigInput,
): Promise<MutationResult> {
	const validationError = validateSettingsPin(input.globalPin);
	if (validationError) {
		return {
			success: false,
			error: validationError,
		};
	}

	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api.devices['settings-pin-config'].put({
			mode: input.mode,
			globalPin: input.globalPin,
			organizationId: input.organizationId ?? undefined,
		});

		if (response.error) {
			return {
				success: false,
				error: getApiErrorMessage(
					response.error,
					'Failed to update device settings PIN config',
				),
			};
		}

		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		console.error('Failed to update device settings PIN config:', error);
		return {
			success: false,
			error: 'Failed to update device settings PIN config',
		};
	}
}

/**
 * Updates a device settings PIN override.
 *
 * @param input - Device identifier and optional PIN override
 * @returns A promise resolving to the mutation result
 */
export async function updateDeviceSettingsPin(
	input: UpdateDeviceSettingsPinInput,
): Promise<MutationResult> {
	const validationError = validateSettingsPin(input.pin);
	if (validationError) {
		return {
			success: false,
			error: validationError,
		};
	}

	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api.devices[input.deviceId]['settings-pin'].put({
			pin: input.pin,
		});

		if (response.error) {
			return {
				success: false,
				error: getApiErrorMessage(response.error, 'Failed to update device settings PIN'),
			};
		}

		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		console.error('Failed to update device settings PIN:', error);
		return {
			success: false,
			error: 'Failed to update device settings PIN',
		};
	}
}
