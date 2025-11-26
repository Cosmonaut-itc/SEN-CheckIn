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
import { createServerApiClient } from '@/lib/server-api';
import type { DeviceStatus } from '@/lib/client-functions';

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
