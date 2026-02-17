import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

import {
	createTestClient,
	getAdminSession,
	getSeedData,
	getTestApiKey,
	getUserSession,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

describe('attendance routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let memberSession: Awaited<ReturnType<typeof getUserSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;
	let apiKey: string;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		memberSession = await getUserSession();
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

	it('creates a WORK_OFFSITE record and returns it in offsite today endpoint', async () => {
		const offsiteTodayResponse = await client.attendance.offsite.today.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {},
		});
		expect(offsiteTodayResponse.status).toBe(200);
		const offsiteTodayPayload = requireResponseData(offsiteTodayResponse);
		const todayDateKey = String(offsiteTodayPayload.dateKey);
		expect(todayDateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);

		const createResponse = await client.attendance.post({
			employeeId: seed.employeeId,
			timestamp: new Date(),
			type: 'WORK_OFFSITE',
			offsiteDateKey: todayDateKey,
			offsiteDayKind: 'LABORABLE',
			offsiteReason: 'Trabajo fuera por visita operativa.',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const createPayload = requireResponseData(createResponse);
		const recordId = createPayload.data?.id;
		if (!recordId) {
			throw new Error('Expected WORK_OFFSITE record id.');
		}

		const getResponse = await client.attendance.offsite.today.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {},
		});
		expect(getResponse.status).toBe(200);
		const payload = requireResponseData(getResponse);
		const records = payload.data ?? [];
		expect(records.some((row: { id: string }) => row.id === recordId)).toBe(true);
	});

	it('updates and deletes a WORK_OFFSITE record', async () => {
		const offsiteTodayResponse = await client.attendance.offsite.today.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {},
		});
		const offsiteTodayPayload = requireResponseData(offsiteTodayResponse);
		const todayDateKey = String(offsiteTodayPayload.dateKey);
		const tomorrowDate = new Date(`${todayDateKey}T00:00:00.000Z`);
		tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
		const tomorrowDateKey = tomorrowDate.toISOString().slice(0, 10);

		const createResponse = await client.attendance.post({
			employeeId: seed.employeeId,
			timestamp: new Date(),
			type: 'WORK_OFFSITE',
			offsiteDateKey: tomorrowDateKey,
			offsiteDayKind: 'NO_LABORABLE',
			offsiteReason: 'Cobertura en sitio externo de cliente.',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const createPayload = requireResponseData(createResponse);
		const recordId = createPayload.data?.id;
		if (!recordId) {
			throw new Error('Expected WORK_OFFSITE record id.');
		}

		const attendanceByIdRoute = requireRoute(
			client.attendance[recordId],
			'Attendance record route',
		);
		const updateRoute = requireRoute(
			attendanceByIdRoute.offsite,
			'Attendance offsite route',
		);
		const updateResponse = await updateRoute.put({
			offsiteDateKey: tomorrowDateKey,
			offsiteDayKind: 'LABORABLE',
			offsiteReason: 'Cobertura en sitio externo ajustada.',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(updateResponse.status).toBe(200);
		const updatedPayload = requireResponseData(updateResponse);
		if (!updatedPayload.data) {
			throw new Error('Expected updated WORK_OFFSITE payload.');
		}
		expect(updatedPayload.data.offsiteDayKind).toBe('LABORABLE');

		const deleteResponse = await updateRoute.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(deleteResponse.status).toBe(200);
		const deletedPayload = requireResponseData(deleteResponse);
		expect(deletedPayload.data.deleted).toBe(true);
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

	it('rejects WORK_OFFSITE creation for member role', async () => {
		const offsiteTodayResponse = await client.attendance.offsite.today.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {},
		});
		const offsiteTodayPayload = requireResponseData(offsiteTodayResponse);
		const todayDateKey = String(offsiteTodayPayload.dateKey);

		const response = await client.attendance.post({
			employeeId: seed.employeeId,
			timestamp: new Date(),
			type: 'WORK_OFFSITE',
			offsiteDateKey: todayDateKey,
			offsiteDayKind: 'LABORABLE',
			offsiteReason: 'Intento de miembro sin permisos.',
			$headers: { cookie: memberSession.cookieHeader },
		});

		expect(response.status).toBe(403);
		const errorPayload = requireErrorResponse(response, 'member offsite forbidden');
		expect(errorPayload.error.code).toBe('FORBIDDEN');
	});

	it('rejects WORK_OFFSITE creation via API key', async () => {
		const offsiteTodayResponse = await client.attendance.offsite.today.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {},
		});
		const offsiteTodayPayload = requireResponseData(offsiteTodayResponse);
		const todayDateKey = String(offsiteTodayPayload.dateKey);

		const response = await client.attendance.post({
			employeeId: seed.employeeId,
			timestamp: new Date(),
			type: 'WORK_OFFSITE',
			offsiteDateKey: todayDateKey,
			offsiteDayKind: 'LABORABLE',
			offsiteReason: 'Intento vía API key sin sesión.',
			$headers: { 'x-api-key': apiKey },
		});

		expect(response.status).toBe(403);
		const errorPayload = requireErrorResponse(response, 'api key offsite forbidden');
		expect(errorPayload.error.code).toBe('FORBIDDEN');
	});

	it('rejects WORK_OFFSITE when check events already exist for the same day', async () => {
		const offsiteTodayResponse = await client.attendance.offsite.today.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {},
		});
		const offsiteTodayPayload = requireResponseData(offsiteTodayResponse);
		const todayDateKey = String(offsiteTodayPayload.dateKey);
		const targetDate = new Date(`${todayDateKey}T00:00:00.000Z`);
		targetDate.setUTCDate(targetDate.getUTCDate() + 2);
		const targetDateKey = targetDate.toISOString().slice(0, 10);

		const checkInTimestamp = new Date(`${targetDateKey}T15:00:00.000Z`);
		const checkInResponse = await client.attendance.post({
			employeeId: seed.employeeId,
			deviceId: seed.deviceId,
			timestamp: checkInTimestamp,
			type: 'CHECK_IN',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(checkInResponse.status).toBe(201);

		const offsiteResponse = await client.attendance.post({
			employeeId: seed.employeeId,
			timestamp: new Date(),
			type: 'WORK_OFFSITE',
			offsiteDateKey: targetDateKey,
			offsiteDayKind: 'LABORABLE',
			offsiteReason: 'Intento conflictivo con checada existente.',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(offsiteResponse.status).toBe(409);
		const errorPayload = requireErrorResponse(offsiteResponse, 'offsite conflict check events');
		expect(errorPayload.error.code).toBe('CONFLICT');
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
