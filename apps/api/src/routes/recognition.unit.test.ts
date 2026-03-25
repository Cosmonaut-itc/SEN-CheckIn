import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';

import { errorHandlerPlugin } from '../plugins/error-handler.js';

interface FakeEmployeeRecord {
	id: string;
	firstName: string;
	lastName: string;
	code: string;
}

interface FakeDb {
	select: () => {
		from: () => {
			where: () => {
				limit: () => Promise<FakeEmployeeRecord[]>;
			};
		};
	};
}

const fakeDbState: {
	employeeRows: FakeEmployeeRecord[];
} = {
	employeeRows: [],
};

const fakeDb: FakeDb = {
	select: () => ({
		from: () => ({
			where: () => ({
				limit: async () => fakeDbState.employeeRows,
			}),
		}),
	}),
};

type MockSearchResult = {
	matched: boolean;
	userId: string | null;
	similarity: number | null;
	searchedFaceConfidence: number | null;
	message?: string;
};

const rekognitionMockState: {
	result: MockSearchResult;
	error: Error | null;
} = {
	result: {
		matched: false,
		userId: null,
		similarity: null,
		searchedFaceConfidence: 98,
	},
	error: null,
};

mock.module('../db/index.js', () => ({ default: fakeDb }));
mock.module('../plugins/auth.js', () => ({
	recognitionAuthPlugin: new Elysia({ name: 'mock-recognition-auth' }).derive(() => ({
		authTimingMs: 0,
		requestId: 'test-request-id',
	})),
}));
mock.module('../services/rekognition.js', () => ({
	RekognitionServiceError: class RekognitionServiceError extends Error {
		public readonly errorCode:
			| 'REKOGNITION_UPSTREAM_FAILURE'
			| 'REKOGNITION_UPSTREAM_TIMEOUT';
		public readonly httpStatus: 503 | 504;

		constructor(
			message: string,
			errorCode:
				| 'REKOGNITION_UPSTREAM_FAILURE'
				| 'REKOGNITION_UPSTREAM_TIMEOUT' = 'REKOGNITION_UPSTREAM_FAILURE',
			httpStatus: 503 | 504 = 503,
		) {
			super(message);
			this.name = 'RekognitionServiceError';
			this.errorCode = errorCode;
			this.httpStatus = httpStatus;
		}
	},
	searchUsersByImage: async (): Promise<MockSearchResult> => {
		if (rekognitionMockState.error) {
			throw rekognitionMockState.error;
		}

		return rekognitionMockState.result;
	},
}));

/**
 * Builds a JSON POST request for the recognition route.
 *
 * @param body - Request body payload
 * @returns Request instance
 */
function createJsonRequest(body: Record<string, unknown>): Request {
	return new Request('http://localhost/recognition/identify', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-client-platform': 'android',
			'x-client-network-type': 'wifi',
		},
		body: JSON.stringify(body),
	});
}

describe('recognition routes', () => {
	beforeEach(() => {
		fakeDbState.employeeRows = [];
		rekognitionMockState.result = {
			matched: false,
			userId: null,
			similarity: null,
			searchedFaceConfidence: 98,
		};
		rekognitionMockState.error = null;
	});

	it('adds request diagnostics headers for successful responses', async () => {
		rekognitionMockState.result = {
			matched: true,
			userId: 'employee-1',
			similarity: 99,
			searchedFaceConfidence: 97,
		};
		fakeDbState.employeeRows = [
			{
				id: 'employee-1',
				firstName: 'Ana',
				lastName: 'Ruiz',
				code: 'EMP-001',
			},
		];

		const { recognitionRoutes } = await import('./recognition.js');
		const app = new Elysia().use(errorHandlerPlugin).use(recognitionRoutes);
		const response = await app.handle(
			createJsonRequest({
				image: Buffer.from('match').toString('base64'),
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get('x-request-id')).toBeTruthy();
		expect(response.headers.get('server-timing')).toContain('rekognition;dur=');
		expect(response.headers.get('server-timing')).toContain('db;dur=');
	});

	it('returns retryable failures for upstream Rekognition errors', async () => {
		const { RekognitionServiceError } = await import('../services/rekognition.js');
		rekognitionMockState.error = new RekognitionServiceError(
			'upstream timeout',
			'REKOGNITION_UPSTREAM_FAILURE',
			503,
		);

		const { recognitionRoutes } = await import('./recognition.js');
		const app = new Elysia().use(errorHandlerPlugin).use(recognitionRoutes);
		const response = await app.handle(
			createJsonRequest({
				image: Buffer.from('retryable').toString('base64'),
			}),
		);
		const payload = (await response.json()) as {
			matched: boolean;
			errorCode?: string;
			message?: string;
		};

		expect(response.status).toBe(503);
		expect(payload.matched).toBe(false);
		expect(payload.errorCode).toBe('REKOGNITION_UPSTREAM_FAILURE');
		expect(payload.message).toBe('Face recognition service unavailable');
		expect(response.headers.get('x-request-id')).toBeTruthy();
		expect(response.headers.get('server-timing')).toContain('rekognition;dur=');
	});

	it('fails closed when more than one employee shares the same rekognition user id', async () => {
		rekognitionMockState.result = {
			matched: true,
			userId: 'employee-duplicate',
			similarity: 98,
			searchedFaceConfidence: 95,
		};
		fakeDbState.employeeRows = [
			{
				id: 'employee-1',
				firstName: 'Ana',
				lastName: 'Ruiz',
				code: 'EMP-001',
			},
			{
				id: 'employee-2',
				firstName: 'Beto',
				lastName: 'Lopez',
				code: 'EMP-002',
			},
		];

		const { recognitionRoutes } = await import('./recognition.js');
		const app = new Elysia().use(errorHandlerPlugin).use(recognitionRoutes);
		const response = await app.handle(
			createJsonRequest({
				image: Buffer.from('duplicate').toString('base64'),
			}),
		);
		const payload = (await response.json()) as {
			matched: boolean;
			errorCode?: string;
			message?: string;
		};

		expect(response.status).toBe(409);
		expect(payload.matched).toBe(false);
		expect(payload.errorCode).toBe('RECOGNITION_EMPLOYEE_LOOKUP_CONFLICT');
		expect(payload.message).toBe('Face recognition result is not uniquely mapped');
	});
});
