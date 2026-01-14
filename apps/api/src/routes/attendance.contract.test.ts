import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

import { createTestClient, getAdminSession, getSeedData, getTestApiKey } from '../test-utils/contract-helpers.js';

describe('attendance routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;
	let apiKey: string;

	beforeAll(async () => {
		client = await createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
		apiKey = await getTestApiKey();
	});

	it('lists attendance records with pagination', async () => {
		const response = await client.attendance.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		expect(Array.isArray(response.data?.data)).toBe(true);
		expect(response.data?.pagination).toBeDefined();
	});

	it('returns present attendance entries for a date range', async () => {
		const response = await client.attendance.present.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				fromDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
				toDate: new Date(),
			},
		});

		expect(response.status).toBe(200);
		expect(Array.isArray(response.data?.data)).toBe(true);
	});

	it('creates and fetches an attendance record', async () => {
		const createResponse = await client.attendance.post({
			employeeId: seed.employeeId,
			deviceId: seed.deviceId,
			timestamp: new Date(),
			type: 'CHECK_IN',
			metadata: { source: 'contract-test' },
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		expect(createResponse.data?.data?.id).toBeDefined();

		const recordId = createResponse.data?.data?.id ?? '';
		const getResponse = await client.attendance[recordId].get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(getResponse.status).toBe(200);
		expect(getResponse.data?.data?.id).toBe(recordId);
	});

	it('returns today attendance for an employee', async () => {
		const response = await client.attendance.employee[seed.employeeId].today.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		expect(response.data?.employeeId).toBe(seed.employeeId);
		expect(Array.isArray(response.data?.data)).toBe(true);
	});

	it('rejects unknown attendance record IDs', async () => {
		const response = await client.attendance[randomUUID()].get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(404);
		expect(response.error?.value).toEqual({ error: 'Attendance record not found' });
	});

	it('rejects invalid employee references on create', async () => {
		const response = await client.attendance.post({
			employeeId: randomUUID(),
			deviceId: seed.deviceId,
			timestamp: new Date(),
			type: 'CHECK_IN',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(400);
		expect(response.error?.value).toEqual({ error: 'Employee not found' });
	});

	it('rejects api key requests for other organizations', async () => {
		const response = await client.attendance.get({
			$headers: { 'x-api-key': apiKey },
			$query: {
				limit: 5,
				offset: 0,
				organizationId: randomUUID(),
			},
		});

		expect(response.status).toBe(403);
	});
});
