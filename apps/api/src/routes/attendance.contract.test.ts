import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

import {
	createTestClient,
	getAdminSession,
	getSeedData,
	getTestApiKey,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

describe('attendance routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;
	let apiKey: string;

	beforeAll(async () => {
		client = createTestClient();
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
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
		expect(payload.pagination).toBeDefined();
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
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
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
		const createPayload = requireResponseData(createResponse);
		const createdRecord = createPayload.data;
		if (!createdRecord) {
			throw new Error('Expected created attendance record.');
		}
		expect(createdRecord.id).toBeDefined();

		const recordId = createdRecord.id;
		if (!recordId) {
			throw new Error('Expected attendance record ID.');
		}
		const attendanceById = requireRoute(client.attendance[recordId], 'Attendance record route');
		const getResponse = await attendanceById.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(getResponse.status).toBe(200);
		const getPayload = requireResponseData(getResponse);
		const record = getPayload.data;
		if (!record) {
			throw new Error('Expected attendance record.');
		}
		expect(record.id).toBe(recordId);
	});

	it('returns today attendance for an employee', async () => {
		const attendanceEmployee = requireRoute(
			client.attendance.employee,
			'Attendance employee route',
		);
		const attendanceEmployeeById = requireRoute(
			attendanceEmployee[seed.employeeId],
			'Attendance employee ID route',
		);
		const response = await attendanceEmployeeById.today.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.employeeId).toBe(seed.employeeId);
		expect(Array.isArray(payload.data)).toBe(true);
	});

	it('rejects unknown attendance record IDs', async () => {
		const unknownAttendance = requireRoute(
			client.attendance[randomUUID()],
			'Attendance record route',
		);
		const response = await unknownAttendance.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(404);
		const errorPayload = requireErrorResponse(response, 'unknown attendance record');
		expect(errorPayload.error.message).toBe('Attendance record not found');
		expect(errorPayload.error.code).toBe('NOT_FOUND');
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
		const errorPayload = requireErrorResponse(response, 'invalid employee');
		expect(errorPayload.error.message).toBe('Employee not found');
		expect(errorPayload.error.code).toBe('VALIDATION_ERROR');
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
		const errorPayload = requireErrorResponse(response, 'org access denial');
		expect(errorPayload.error.message).toBe('Organization is required or not permitted');
		expect(errorPayload.error.code).toBe('FORBIDDEN');
	});
});
