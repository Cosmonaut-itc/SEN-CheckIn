import { sendDeviceHeartbeat } from './client-functions';

const mockGetAccessToken = jest.fn();
const mockAuthedFetchForEden = jest.fn();
const mockGetBatteryLevelAsync = jest.fn();

jest.mock('./auth-client', () => ({
	getAccessToken: () => mockGetAccessToken(),
}));

jest.mock('expo-battery', () => ({
	getBatteryLevelAsync: () => mockGetBatteryLevelAsync(),
}));

jest.mock('./api', () => ({
	API_BASE_URL: 'http://localhost:3000',
	authedFetchForEden: (...args: unknown[]) => mockAuthedFetchForEden(...args),
	api: {},
}));

describe('sendDeviceHeartbeat', () => {
	beforeEach(() => {
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
		mockGetAccessToken.mockReset();
		mockAuthedFetchForEden.mockReset();
		mockGetBatteryLevelAsync.mockReset();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('maps 404 heartbeat responses to DEVICE_NOT_FOUND', async () => {
		mockGetAccessToken.mockReturnValue('token-1');
		mockGetBatteryLevelAsync.mockRejectedValue(new Error('Battery unavailable'));
		mockAuthedFetchForEden.mockResolvedValue({
			ok: false,
			status: 404,
			json: async () => ({
				error: {
					code: 'DEVICE_NOT_FOUND',
					message: 'Device not found',
				},
			}),
		});

		await expect(sendDeviceHeartbeat('device-1')).rejects.toMatchObject({
			name: 'HeartbeatError',
			status: 404,
			code: 'DEVICE_NOT_FOUND',
		});
	});

	it('keeps non-device 404 heartbeat responses as UNKNOWN', async () => {
		mockGetAccessToken.mockReturnValue('token-1');
		mockGetBatteryLevelAsync.mockResolvedValue(0.84);
		mockAuthedFetchForEden.mockResolvedValue({
			ok: false,
			status: 404,
			json: async () => ({
				error: {
					code: 'ROUTE_NOT_READY',
					message: 'Route not ready',
				},
			}),
		});

		await expect(sendDeviceHeartbeat('device-1')).rejects.toMatchObject({
			name: 'HeartbeatError',
			status: 404,
			code: 'UNKNOWN',
		});
	});

	it('sends the current battery percentage with heartbeat requests', async () => {
		mockGetAccessToken.mockReturnValue('token-1');
		mockGetBatteryLevelAsync.mockResolvedValue(0.84);
		mockAuthedFetchForEden.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				data: {
					id: 'device-1',
				},
			}),
		});

		await sendDeviceHeartbeat('device-1');

		expect(mockAuthedFetchForEden).toHaveBeenCalledWith(
			'http://localhost:3000/devices/device-1/heartbeat',
			expect.objectContaining({
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					batteryLevel: 84,
				}),
			}),
		);
	});

	it('skips batteryLevel when Expo battery access fails', async () => {
		mockGetAccessToken.mockReturnValue('token-1');
		mockGetBatteryLevelAsync.mockRejectedValue(new Error('Battery unavailable'));
		mockAuthedFetchForEden.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				data: {
					id: 'device-1',
				},
			}),
		});

		await sendDeviceHeartbeat('device-1');

		expect(mockAuthedFetchForEden).toHaveBeenCalledWith(
			'http://localhost:3000/devices/device-1/heartbeat',
			expect.objectContaining({
				method: 'POST',
				body: undefined,
			}),
		);
	});
});
