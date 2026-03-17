const mockAttendancePost = jest.fn();

jest.mock('./api', () => ({
	API_BASE_URL: 'http://localhost:3000',
	authedFetchForEden: jest.fn(),
	api: {
		attendance: {
			post: (...args: unknown[]) => mockAttendancePost(...args),
		},
	},
}));

jest.mock('./auth-client', () => ({
	getAccessToken: jest.fn(() => null),
}));

jest.mock('./i18n', () => ({
	i18n: {
		t: (key: string) => key,
	},
}));

import { createAttendanceRecord } from './client-functions';

describe('createAttendanceRecord', () => {
	beforeEach(() => {
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
		mockAttendancePost.mockReset();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('preserves the original network error as the thrown cause', async () => {
		const networkError = new Error('network request failed');
		mockAttendancePost.mockResolvedValue({
			data: null,
			error: networkError,
		});

		await expect(
			createAttendanceRecord({
				employeeId: 'employee-1',
				deviceId: 'device-1',
				type: 'CHECK_IN',
			}),
		).rejects.toMatchObject({
			message: 'Errors.api.createAttendanceRecord',
			cause: networkError,
		});
	});

	it('preserves the HTTP status for permanent attendance API errors', async () => {
		mockAttendancePost.mockResolvedValue({
			data: null,
			error: {
				value: {
					message: 'Device no longer exists',
				},
			},
			status: 404,
		});

		await expect(
			createAttendanceRecord({
				employeeId: 'employee-1',
				deviceId: 'device-1',
				type: 'CHECK_IN',
			}),
		).rejects.toMatchObject({
			message: 'Errors.api.createAttendanceRecord',
			status: 404,
		});
	});
});
