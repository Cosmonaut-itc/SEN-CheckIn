const mockCreateUserPost: jest.Mock = jest.fn();
const mockEnrollFacePost: jest.Mock = jest.fn();
const mockEmployeesGet: jest.Mock = jest.fn();

jest.mock('./auth-client', () => ({
	getAccessToken: jest.fn(() => null),
}));

jest.mock('./api', () => {
	const employeeRoute = {
		'create-rekognition-user': {
			post: (...args: unknown[]) => mockCreateUserPost(...args),
		},
		'enroll-face': {
			post: (...args: unknown[]) => mockEnrollFacePost(...args),
		},
	};

	return {
		API_BASE_URL: 'http://localhost:3000',
		authedFetchForEden: jest.fn(),
		api: {
			employees: new Proxy(
				{
					get: (...args: unknown[]) => mockEmployeesGet(...args),
				},
				{
					get: (
						target: { get: (...args: unknown[]) => unknown },
						property: string | symbol,
					): unknown => {
						if (property === 'get') {
							return target.get;
						}
						return employeeRoute;
					},
				},
			),
			locations: {
				get: jest.fn(),
			},
			devices: {
				get: jest.fn(),
			},
			attendance: {
				get: jest.fn(),
				post: jest.fn(),
			},
		},
	};
});

import { fullEnrollmentFlow } from './client-functions';

/**
 * Contract tests for mobile face enrollment flow helper.
 */
describe('fullEnrollmentFlow', () => {
	beforeEach(() => {
		mockCreateUserPost.mockReset();
		mockEnrollFacePost.mockReset();
		mockEmployeesGet.mockReset();
	});

	it('creates Rekognition user first and then enrolls face', async () => {
		mockCreateUserPost.mockResolvedValue({
			status: 200,
			error: null,
			data: {
				success: true,
				userId: 'employee-1',
				employeeId: 'employee-1',
			},
		});
		mockEnrollFacePost.mockResolvedValue({
			status: 200,
			error: null,
			data: {
				success: true,
				faceId: 'face-1',
				employeeId: 'employee-1',
				associated: true,
			},
		});

		const result = await fullEnrollmentFlow({
			employeeId: 'employee-1',
			imageBase64: 'base64-data',
			hasRekognitionUser: false,
		});

		expect(mockCreateUserPost).toHaveBeenCalledTimes(1);
		expect(mockEnrollFacePost).toHaveBeenCalledTimes(1);
		expect(result.success).toBe(true);
		expect(result.faceId).toBe('face-1');
	});

	it('continues enrollment when user creation returns REKOGNITION_USER_EXISTS (409)', async () => {
		mockCreateUserPost.mockResolvedValue({
			status: 409,
			error: {
				value: {
					errorCode: 'REKOGNITION_USER_EXISTS',
					message: 'Employee already has a Rekognition user',
				},
			},
			data: null,
		});
		mockEnrollFacePost.mockResolvedValue({
			status: 200,
			error: null,
			data: {
				success: true,
				faceId: 'face-2',
				employeeId: 'employee-1',
				associated: true,
			},
		});

		const result = await fullEnrollmentFlow({
			employeeId: 'employee-1',
			imageBase64: 'base64-data',
			hasRekognitionUser: false,
		});

		expect(mockCreateUserPost).toHaveBeenCalledTimes(1);
		expect(mockEnrollFacePost).toHaveBeenCalledTimes(1);
		expect(result.success).toBe(true);
		expect(result.faceId).toBe('face-2');
	});

	it('retries enrollment when API reports missing Rekognition user', async () => {
		mockEnrollFacePost
			.mockResolvedValueOnce({
				status: 400,
				error: {
					value: {
						errorCode: 'REKOGNITION_USER_MISSING',
						message: 'Employee does not have a Rekognition user. Create one first.',
					},
				},
				data: null,
			})
			.mockResolvedValueOnce({
				status: 200,
				error: null,
				data: {
					success: true,
					faceId: 'face-3',
					employeeId: 'employee-1',
					associated: true,
				},
			});
		mockCreateUserPost.mockResolvedValue({
			status: 200,
			error: null,
			data: {
				success: true,
				userId: 'employee-1',
				employeeId: 'employee-1',
			},
		});

		const result = await fullEnrollmentFlow({
			employeeId: 'employee-1',
			imageBase64: 'base64-data',
			hasRekognitionUser: true,
		});

		expect(mockCreateUserPost).toHaveBeenCalledTimes(1);
		expect(mockEnrollFacePost).toHaveBeenCalledTimes(2);
		expect(result.success).toBe(true);
		expect(result.faceId).toBe('face-3');
	});
});
