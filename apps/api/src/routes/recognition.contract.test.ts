import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Buffer } from 'node:buffer';

import {
	createTestClient,
	getAdminSession,
	getSeedData,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';
import {
	setSearchUsersByImageError,
	setSearchUsersByImageResult,
	setupRekognitionMocks,
} from '../test-utils/contract-mocks.js';

setupRekognitionMocks();

describe('recognition routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();

		const employeeRoutes = requireRoute(client.employees[seed.employeeId], 'Employee route');
		const createUserRoute = requireRoute(
			employeeRoutes['create-rekognition-user'],
			'Employee create-rekognition-user route',
		);
		await createUserRoute.post({
			$headers: { cookie: adminSession.cookieHeader },
		});
	});

	afterAll(async () => {
		const employeeRoutes = requireRoute(client.employees[seed.employeeId], 'Employee route');
		const deleteUserRoute = requireRoute(
			employeeRoutes['rekognition-user'],
			'Employee rekognition-user route',
		);
		await deleteUserRoute.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});
	});

	/**
	 * Normalizes response headers so tests can read diagnostic values with standard Headers APIs.
	 *
	 * @param response - Contract test response object
	 * @returns Headers instance for header lookups
	 */
	function getResponseHeaders(response: { headers: HeadersInit }): Headers {
		return new Headers(response.headers);
	}

	it('rejects invalid base64 payloads', async () => {
		const response = await client.recognition.identify.post({
			image: 'not-base64',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(400);
		const payload = requireResponseData(response);
		expect(payload.matched).toBe(false);
		expect(payload.errorCode).toBe('INVALID_IMAGE_BASE64');
		expect(payload.message).toBe('Invalid base64 image data');
	});

	it('returns no match when rekognition has no matches', async () => {
		setSearchUsersByImageResult({
			matched: false,
			userId: null,
			similarity: null,
			searchedFaceConfidence: 98,
			message: 'No match',
		});

		const response = await client.recognition.identify.post({
			image: Buffer.from('test').toString('base64'),
			$headers: { cookie: adminSession.cookieHeader },
		});
		const headers = getResponseHeaders(response);

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.matched).toBe(false);
		expect(headers.get('x-request-id')).toBeTruthy();
		expect(headers.get('server-timing')).toBeTruthy();
	});

	it('returns matched employees when rekognition finds a user', async () => {
		setSearchUsersByImageResult({
			matched: true,
			userId: seed.employeeId,
			similarity: 99,
			searchedFaceConfidence: 99,
		});

		const response = await client.recognition.identify.post({
			image: Buffer.from('match').toString('base64'),
			$headers: { cookie: adminSession.cookieHeader },
		});
		const headers = getResponseHeaders(response);

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.matched).toBe(true);
		expect(payload.employee?.id).toBe(seed.employeeId);
		expect(headers.get('x-request-id')).toBeTruthy();
		expect(headers.get('server-timing')).toContain('rekognition;dur=');
	});

	it('returns retryable upstream failures instead of no-match responses', async () => {
		const { RekognitionServiceError } = await import('../services/rekognition.js');
		setSearchUsersByImageError(
			new RekognitionServiceError(
				'Rekognition upstream failure',
				'REKOGNITION_UPSTREAM_FAILURE',
				503,
			),
		);

		const response = await client.recognition.identify.post({
			image: Buffer.from('retryable').toString('base64'),
			$headers: { cookie: adminSession.cookieHeader },
		});
		const headers = getResponseHeaders(response);

		expect(response.status).toBe(503);
		const payload = requireResponseData(response);
		expect(payload.matched).toBe(false);
		expect(payload.errorCode).toBe('REKOGNITION_UPSTREAM_FAILURE');
		expect(payload.message).toBe('Face recognition service unavailable');
		expect(headers.get('x-request-id')).toBeTruthy();
		expect(headers.get('server-timing')).toContain('rekognition;dur=');
	});

	it('returns 504 for timeout-shaped upstream failures', async () => {
		const { RekognitionServiceError } = await import('../services/rekognition.js');
		setSearchUsersByImageError(
			new RekognitionServiceError(
				'Rekognition upstream timeout',
				'REKOGNITION_UPSTREAM_TIMEOUT',
				504,
			),
		);

		const response = await client.recognition.identify.post({
			image: Buffer.from('timeout').toString('base64'),
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(504);
		const payload = requireResponseData(response);
		expect(payload.matched).toBe(false);
		expect(payload.errorCode).toBe('REKOGNITION_UPSTREAM_TIMEOUT');
		expect(payload.message).toBe('Face recognition service unavailable');
	});
});
