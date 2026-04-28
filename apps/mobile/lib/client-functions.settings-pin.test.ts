import { fetchDeviceSettingsPinStatus, verifyDeviceSettingsPin } from './client-functions';

const mockAuthedFetchForEden = jest.fn();

jest.mock('./api', () => ({
	API_BASE_URL: 'http://localhost:3000',
	authedFetchForEden: (...args: unknown[]) => mockAuthedFetchForEden(...args),
	api: {},
}));

jest.mock('./auth-client', () => ({
	getAccessToken: () => 'token-1',
}));

jest.mock(
	'expo-battery',
	() => ({
		getBatteryLevelAsync: jest.fn(),
	}),
	{ virtual: true },
);

describe('device settings PIN client functions', () => {
	beforeEach(() => {
		mockAuthedFetchForEden.mockReset();
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('fetches the online settings PIN status for a device', async () => {
		mockAuthedFetchForEden.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				data: {
					deviceId: 'device-1',
					mode: 'GLOBAL',
					pinRequired: true,
					source: 'GLOBAL',
					globalPinConfigured: true,
					deviceOverrideConfigured: false,
				},
			}),
		});

		await expect(fetchDeviceSettingsPinStatus('device-1')).resolves.toEqual({
			deviceId: 'device-1',
			mode: 'GLOBAL',
			pinRequired: true,
			source: 'GLOBAL',
			globalPinConfigured: true,
			deviceOverrideConfigured: false,
		});
		expect(mockAuthedFetchForEden).toHaveBeenCalledWith(
			'http://localhost:3000/devices/device-1/settings-pin-status',
			expect.objectContaining({
				method: 'GET',
			}),
		);
	});

	it('sends only the entered PIN when verifying settings access', async () => {
		mockAuthedFetchForEden.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				data: {
					valid: true,
				},
			}),
		});

		await expect(verifyDeviceSettingsPin('device-1', '1234')).resolves.toEqual({
			valid: true,
		});
		expect(mockAuthedFetchForEden).toHaveBeenCalledWith(
			'http://localhost:3000/devices/device-1/settings-pin-verify',
			expect.objectContaining({
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					pin: '1234',
				}),
			}),
		);
	});

	it('throws a typed error when verification is rate limited', async () => {
		mockAuthedFetchForEden.mockResolvedValue({
			ok: false,
			status: 429,
			json: async () => ({
				error: {
					code: 'RATE_LIMITED',
					message: 'Too many invalid PIN attempts',
				},
			}),
		});

		await expect(verifyDeviceSettingsPin('device-1', '9999')).rejects.toMatchObject({
			name: 'DeviceSettingsPinError',
			status: 429,
			code: 'RATE_LIMITED',
		});
	});

	it('throws when the status response has no data', async () => {
		mockAuthedFetchForEden.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({}),
		});

		await expect(fetchDeviceSettingsPinStatus('device-1')).rejects.toMatchObject({
			name: 'DeviceSettingsPinError',
			code: 'MISSING_DATA',
		});
	});
});
