import { sendDeviceHeartbeat } from './client-functions';

const mockGetAccessToken = jest.fn();
const mockAuthedFetchForEden = jest.fn();

jest.mock('./auth-client', () => ({
	getAccessToken: () => mockGetAccessToken(),
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
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('maps 404 heartbeat responses to DEVICE_NOT_FOUND', async () => {
		mockGetAccessToken.mockReturnValue('token-1');
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
});
