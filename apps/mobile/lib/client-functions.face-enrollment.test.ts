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

import { fetchFaceEnrollmentEmployees, fullEnrollmentFlow } from './client-functions';

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

describe('fetchFaceEnrollmentEmployees', () => {
	beforeEach(() => {
		mockEmployeesGet.mockReset();
	});

	it('paginates in batches of 100 until reaching the requested mobile limit', async () => {
		const firstPage = Array.from({ length: 100 }, (_, index) => ({
			id: `employee-${index + 1}`,
			code: `EMP-${index + 1}`,
			firstName: 'Empleado',
			lastName: `${index + 1}`,
			status: 'ACTIVE',
			rekognitionUserId: null,
		}));
		const secondPage = Array.from({ length: 50 }, (_, index) => ({
			id: `employee-${index + 101}`,
			code: `EMP-${index + 101}`,
			firstName: 'Empleado',
			lastName: `${index + 101}`,
			status: 'ACTIVE',
			rekognitionUserId: null,
		}));

		mockEmployeesGet
			.mockResolvedValueOnce({
				status: 200,
				error: null,
				data: {
					data: firstPage,
					pagination: { total: 150, limit: 100, offset: 0, hasMore: true },
				},
			})
			.mockResolvedValueOnce({
				status: 200,
				error: null,
				data: {
					data: secondPage,
					pagination: { total: 150, limit: 100, offset: 100, hasMore: false },
				},
			});

		const response = await fetchFaceEnrollmentEmployees({ limit: 200 });

		expect(mockEmployeesGet).toHaveBeenCalledTimes(2);
		expect(mockEmployeesGet).toHaveBeenNthCalledWith(1, {
			$query: { limit: 100, offset: 0, status: 'ACTIVE' },
		});
		expect(mockEmployeesGet).toHaveBeenNthCalledWith(2, {
			$query: { limit: 100, offset: 100, status: 'ACTIVE' },
		});
		expect(response.data).toHaveLength(150);
		expect(response.pagination.total).toBe(150);
		expect(response.pagination.limit).toBe(200);
	});

	it('forwards organizationId when provided for scoped employee fetching', async () => {
		mockEmployeesGet.mockResolvedValueOnce({
			status: 200,
			error: null,
			data: {
				data: [],
				pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
			},
		});

		await fetchFaceEnrollmentEmployees({ limit: 50, organizationId: 'org-1' });

		expect(mockEmployeesGet).toHaveBeenCalledTimes(1);
		expect(mockEmployeesGet).toHaveBeenCalledWith({
			$query: {
				limit: 50,
				offset: 0,
				status: 'ACTIVE',
				organizationId: 'org-1',
			},
		});
	});
});
