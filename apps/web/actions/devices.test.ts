import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createServerApiClientMock, settingsPinConfigPutMock, settingsPinPutMock } = vi.hoisted(
	() => ({
		createServerApiClientMock: vi.fn(),
		settingsPinConfigPutMock: vi.fn(),
		settingsPinPutMock: vi.fn(),
	}),
);

vi.mock('next/headers', () => ({
	headers: vi.fn(async () => ({
		get: (key: string) => (key === 'cookie' ? 'session=mock' : null),
	})),
}));

vi.mock('@/lib/server-api', () => ({
	createServerApiClient: (...args: unknown[]) => createServerApiClientMock(...args),
}));

import { updateDeviceSettingsPin, updateDeviceSettingsPinConfig } from '@/actions/devices';

/**
 * Creates the mocked server API client used by device action tests.
 *
 * @returns Mocked Treaty client subset
 */
function createMockApiClient(): unknown {
	const devicesResource = new Proxy<Record<string | symbol, unknown>>(
		{},
		{
			get: (_target, property: string | symbol): unknown => {
				if (property === 'settings-pin-config') {
					return { put: settingsPinConfigPutMock };
				}
				if (typeof property === 'string') {
					return {
						'settings-pin': {
							put: settingsPinPutMock,
						},
					};
				}
				return undefined;
			},
		},
	);

	return {
		devices: devicesResource,
	};
}

describe('device settings PIN actions', () => {
	beforeEach(() => {
		createServerApiClientMock.mockReset();
		settingsPinConfigPutMock.mockReset();
		settingsPinPutMock.mockReset();
		createServerApiClientMock.mockReturnValue(createMockApiClient());
	});

	it('updates organization settings PIN config through the API endpoint', async () => {
		settingsPinConfigPutMock.mockResolvedValue({
			data: { data: { mode: 'PER_DEVICE', globalPinConfigured: true, devices: [] } },
		});

		const result = await updateDeviceSettingsPinConfig({
			mode: 'PER_DEVICE',
			globalPin: '1234',
			organizationId: 'org-1',
		});

		expect(settingsPinConfigPutMock).toHaveBeenCalledWith({
			mode: 'PER_DEVICE',
			globalPin: '1234',
			organizationId: 'org-1',
		});
		expect(result).toEqual({
			success: true,
			data: { data: { mode: 'PER_DEVICE', globalPinConfigured: true, devices: [] } },
		});
	});

	it('rejects invalid organization settings PINs before calling the API', async () => {
		const result = await updateDeviceSettingsPinConfig({
			mode: 'GLOBAL',
			globalPin: '12a4',
			organizationId: 'org-1',
		});

		expect(settingsPinConfigPutMock).not.toHaveBeenCalled();
		expect(result.success).toBe(false);
		expect(result.error).toBe('PIN must be exactly four numeric digits');
	});

	it('returns API error messages when config updates fail', async () => {
		settingsPinConfigPutMock.mockResolvedValue({
			error: {
				value: {
					error: {
						message: 'Only owner/admin can manage device settings PIN',
					},
				},
			},
		});

		const result = await updateDeviceSettingsPinConfig({
			mode: 'GLOBAL',
			globalPin: '1234',
			organizationId: 'org-1',
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe('Only owner/admin can manage device settings PIN');
	});

	it('updates device settings PIN overrides through the device endpoint', async () => {
		settingsPinPutMock.mockResolvedValue({
			data: {
				data: {
					deviceId: 'device-1',
					mode: 'PER_DEVICE',
					pinRequired: true,
					source: 'DEVICE',
					globalPinConfigured: true,
					deviceOverrideConfigured: true,
				},
			},
		});

		const result = await updateDeviceSettingsPin({
			deviceId: 'device-1',
			pin: '4321',
		});

		expect(settingsPinPutMock).toHaveBeenCalledWith({ pin: '4321' });
		expect(result.success).toBe(true);
	});

	it('rejects invalid device settings PIN overrides before calling the API', async () => {
		const result = await updateDeviceSettingsPin({
			deviceId: 'device-1',
			pin: '12345',
		});

		expect(settingsPinPutMock).not.toHaveBeenCalled();
		expect(result.success).toBe(false);
		expect(result.error).toBe('PIN must be exactly four numeric digits');
	});
});
