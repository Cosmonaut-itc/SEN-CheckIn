import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Buffer } from 'node:buffer';

import { createTestClient, getAdminSession, getSeedData } from '../test-utils/contract-helpers.js';
import { setSearchUsersByImageResult, setupRekognitionMocks } from '../test-utils/contract-mocks.js';

setupRekognitionMocks();

describe('recognition routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = await createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();

		await client.employees[seed.employeeId]['create-rekognition-user'].post({
			$headers: { cookie: adminSession.cookieHeader },
		});
	});

	afterAll(async () => {
		await client.employees[seed.employeeId]['rekognition-user'].delete({
			$headers: { cookie: adminSession.cookieHeader },
		});
	});

	it('rejects invalid base64 payloads', async () => {
		const response = await client.recognition.identify.post({
			image: 'not-base64',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(400);
		expect(response.data?.matched).toBe(false);
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

		expect(response.status).toBe(200);
		expect(response.data?.matched).toBe(false);
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

		expect(response.status).toBe(200);
		expect(response.data?.matched).toBe(true);
		expect(response.data?.employee?.id).toBe(seed.employeeId);
	});
});
