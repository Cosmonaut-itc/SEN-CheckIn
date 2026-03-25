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
	recognitionAuthPlugin: new Elysia({ name: 'mock-recognition-auth' }).derive(
		{ as: 'scoped' },
		({ request }) => ({
			authTimingMs: Number(request.headers.get('x-test-auth-timing-ms') ?? '0'),
			requestId: 'test-request-id',
		}),
	),
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
 * @param headers - Additional request headers for the test request
 * @returns Request instance
 */
function createJsonRequest(
	body: Record<string, unknown>,
	headers?: Record<string, string>,
): Request {
	return new Request('http://localhost/recognition/identify', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-client-platform': 'android',
			'x-client-network-type': 'wifi',
			...headers,
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
		expect(response.headers.get('x-request-id')).toBe('test-request-id');
		expect(response.headers.get('server-timing')).toContain('rekognition;dur=');
		expect(response.headers.get('server-timing')).toContain('db;dur=');
	});

	it('parses recognition request bodies from already-materialized objects', async () => {
		const { parseRecognitionRequestBody } = await import('./recognition-body.js');
		const body = {
			image: Buffer.from('match').toString('base64'),
		};

		expect(parseRecognitionRequestBody(body)).toEqual({
			image: body.image,
			payloadBytes: Buffer.byteLength(JSON.stringify(body)),
		});
	});

	it('includes auth timing in the total server timing metric', async () => {
		const { recognitionRoutes } = await import('./recognition.js');
		const app = new Elysia().use(errorHandlerPlugin).use(recognitionRoutes);
		const response = await app.handle(
			createJsonRequest(
				{
					image: Buffer.from('timing').toString('base64'),
				},
				{
					'x-test-auth-timing-ms': '87.5',
				},
			),
		);
		const serverTiming = response.headers.get('server-timing');
		const totalEntry = serverTiming
			?.split(',')
			.map((entry: string) => entry.trim())
			.find((entry: string) => entry.startsWith('total;dur='));

		expect(response.status).toBe(200);
		expect(totalEntry).toBeTruthy();
		expect(Number(totalEntry?.replace('total;dur=', ''))).toBeGreaterThanOrEqual(87.5);
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

	it('preserves diagnostics headers for unexpected internal errors', async () => {
		rekognitionMockState.error = new Error('unexpected failure');

		const { recognitionRoutes } = await import('./recognition.js');
		const app = new Elysia().use(errorHandlerPlugin).use(recognitionRoutes);
		const response = await app.handle(
			createJsonRequest({
				image: Buffer.from('unexpected').toString('base64'),
			}),
		);
		const payload = (await response.json()) as {
			error?: {
				code?: string;
				message?: string;
			};
		};

		expect(response.status).toBe(500);
		expect(payload.error?.code).toBe('INTERNAL_ERROR');
		expect(payload.error?.message).toBe('unexpected failure');
		expect(response.headers.get('x-request-id')).toBe('test-request-id');
		expect(response.headers.get('server-timing')).toContain('rekognition;dur=');
		expect(response.headers.get('server-timing')).toContain('total;dur=');
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
