import { beforeAll, describe, expect, it } from 'bun:test';

import { addDaysToDateKey, parseDateKey, toDateKeyUtc } from '../utils/date-key.js';
import {
	createTestClient,
	getAdminSession,
	getSeedData,
	getUserSession,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

describe('vacation routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let userSession: Awaited<ReturnType<typeof getUserSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		userSession = await getUserSession();
		seed = await getSeedData();
	});

	it('returns vacation balance for the current user', async () => {
		const response = await client.vacations.me.balance.get({
			$headers: { cookie: userSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.data).toBeDefined();
	});

	it('lists vacation requests for the current user', async () => {
		const response = await client.vacations.me.requests.get({
			$headers: { cookie: userSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
	});

	it('creates and cancels a vacation request for the current user', async () => {
		const startDateKey = '2030-01-15';
		const endDateKey = addDaysToDateKey(startDateKey, 1);

		const createResponse = await client.vacations.me.requests.post({
			startDateKey,
			endDateKey,
			requestedNotes: 'Solicitud de vacaciones',
			$headers: { cookie: userSession.cookieHeader },
		});

		expect(createResponse.status).toBe(200);
		const createPayload = requireResponseData(createResponse);
		const createdRequest = createPayload.data;
		if (!createdRequest) {
			throw new Error('Expected vacation request in create response.');
		}
		const requestId = createdRequest.id;
		if (!requestId) {
			throw new Error('Expected vacation request ID in create response.');
		}

		const userRequestRoutes = requireRoute(
			client.vacations.me.requests[requestId],
			'Vacation request route',
		);
		const cancelRoute = requireRoute(userRequestRoutes.cancel, 'Vacation request cancel route');
		const cancelResponse = await cancelRoute.post({
			decisionNotes: 'Cancelado por pruebas',
			$headers: { cookie: userSession.cookieHeader },
		});

		expect(cancelResponse.status).toBe(200);
		const cancelPayload = requireResponseData(cancelResponse);
		const cancelledRequest = cancelPayload.data;
		if (!cancelledRequest) {
			throw new Error('Expected vacation request in cancel response.');
		}
		expect(cancelledRequest.status).toBe('CANCELLED');
	});

	it('lists vacation requests for admins', async () => {
		const response = await client.vacations.requests.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
	});

	it('rejects invalid vacation request status for admins', async () => {
		const startDateKey = addDaysToDateKey('2030-01-15', 5);
		const endDateKey = addDaysToDateKey(startDateKey, 1);

		const response = await client.vacations.requests.post({
			employeeId: seed.employeeId,
			startDateKey,
			endDateKey,
			status: 'APPROVED',
			requestedNotes: 'Estado invalido',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(400);
		const errorPayload = requireErrorResponse(response, 'invalid vacation status');
		expect(errorPayload.error.message).toBe('Invalid status for vacation request');
		expect(errorPayload.error.code).toBe('VACATION_INVALID_STATUS');
	});

	it('rejects ranges that exceed the supported vacation engine limit', async () => {
		const startDateKey = '2030-01-01';
		const response = await client.vacations.me.requests.post({
			startDateKey,
			endDateKey: addDaysToDateKey(startDateKey, 366),
			requestedNotes: 'Rango invalido',
			$headers: { cookie: userSession.cookieHeader },
		});

		expect(response.status).toBe(400);
		const errorPayload = requireErrorResponse(response, 'vacation range validation');
		expect(errorPayload.error.message).toBe('Validation failed');
		expect(errorPayload.error.code).toBe('VALIDATION_ERROR');
	});

	it('creates and approves vacation requests as admin', async () => {
		const hireDate = new Date('2020-01-01T00:00:00Z');
		const createEmployeeResponse = await client.employees.post({
			code: `VAC-${Date.now()}`,
			firstName: 'Vacaciones',
			lastName: 'Admin',
			email: `vacaciones.admin.${Date.now()}@example.com`,
			phone: '+52 55 0000 0000',
			jobPositionId: seed.jobPositionId,
			locationId: seed.locationId,
			organizationId: seed.organizationId,
			scheduleTemplateId: seed.scheduleTemplateId,
			status: 'ACTIVE',
			hireDate,
			dailyPay: 500,
			paymentFrequency: 'BIWEEKLY',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createEmployeeResponse.status).toBe(201);
		const createEmployeePayload = requireResponseData(createEmployeeResponse);
		const createdEmployee = createEmployeePayload.data;
		if (!createdEmployee?.id) {
			throw new Error('Expected employee record in admin vacation create test.');
		}

		const startDateKey = '2026-12-15';
		const endDateKey = addDaysToDateKey(startDateKey, 1);

		const createResponse = await client.vacations.requests.post({
			employeeId: createdEmployee.id,
			startDateKey,
			endDateKey,
			status: 'SUBMITTED',
			requestedNotes: 'Solicitud admin',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(200);
		const createPayload = requireResponseData(createResponse);
		const createdRequest = createPayload.data;
		if (!createdRequest) {
			throw new Error('Expected vacation request in admin create response.');
		}
		const requestId = createdRequest.id;
		if (!requestId) {
			throw new Error('Expected vacation request ID in admin create response.');
		}

		const adminRequestRoutes = requireRoute(
			client.vacations.requests[requestId],
			'Vacation admin request route',
		);
		const approveRoute = requireRoute(
			adminRequestRoutes.approve,
			'Vacation request approve route',
		);
		const approveResponse = await approveRoute.post({
			decisionNotes: 'Aprobado',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(approveResponse.status).toBe(200);
		const approvePayload = requireResponseData(approveResponse);
		const approvedRequest = approvePayload.data;
		if (!approvedRequest) {
			throw new Error('Expected vacation request in approve response.');
		}
		if (!('status' in approvedRequest)) {
			throw new Error('Expected vacation request status in approve response.');
		}
		expect(approvedRequest.status).toBe('APPROVED');
	});

	it('rejects approval when an existing schedule exception already covers the date', async () => {
		const hireDate = new Date('2020-01-01T00:00:00Z');
		const createEmployeeResponse = await client.employees.post({
			code: `VAC-UTC-${Date.now()}`,
			firstName: 'Vacaciones',
			lastName: 'UTC',
			email: `vacaciones.utc.${Date.now()}@example.com`,
			phone: '+52 55 1111 1111',
			jobPositionId: seed.jobPositionId,
			locationId: seed.locationId,
			organizationId: seed.organizationId,
			scheduleTemplateId: seed.scheduleTemplateId,
			status: 'ACTIVE',
			hireDate,
			dailyPay: 500,
			paymentFrequency: 'BIWEEKLY',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createEmployeeResponse.status).toBe(201);
		const createEmployeePayload = requireResponseData(createEmployeeResponse);
		const createdEmployee = createEmployeePayload.data;
		if (!createdEmployee?.id) {
			throw new Error('Expected employee record in UTC conflict test.');
		}

		let conflictDateKey = addDaysToDateKey(toDateKeyUtc(new Date()), 30);
		while (true) {
			const conflictWeekday = new Date(`${conflictDateKey}T00:00:00Z`).getUTCDay();
			if (conflictWeekday !== 0 && conflictWeekday !== 6) {
				break;
			}
			conflictDateKey = addDaysToDateKey(conflictDateKey, 1);
		}
		const { year: conflictYear, month: conflictMonth, day: conflictDay } =
			parseDateKey(conflictDateKey);
		const conflictDate = new Date(conflictYear, conflictMonth - 1, conflictDay, 12, 0, 0, 0);
		const existingExceptionResponse = await client['schedule-exceptions'].post({
			employeeId: createdEmployee.id,
			exceptionDate: conflictDate,
			exceptionType: 'EXTRA_DAY',
			startTime: '09:00',
			endTime: '18:00',
			reason: 'Cobertura UTC',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(existingExceptionResponse.status).toBe(201);

		const createResponse = await client.vacations.requests.post({
			employeeId: createdEmployee.id,
			startDateKey: conflictDateKey,
			endDateKey: conflictDateKey,
			status: 'SUBMITTED',
			requestedNotes: 'Solicitud con conflicto UTC',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(200);
		const createPayload = requireResponseData(createResponse);
		const createdRequest = createPayload.data;
		if (!createdRequest?.id) {
			throw new Error('Expected vacation request in UTC conflict test.');
		}

		const adminRequestRoutes = requireRoute(
			client.vacations.requests[createdRequest.id],
			'Vacation admin request route',
		);
		const approveRoute = requireRoute(
			adminRequestRoutes.approve,
			'Vacation request approve route',
		);
		const approveResponse = await approveRoute.post({
			decisionNotes: 'Aprobado',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(approveResponse.status).toBe(409);
		const errorPayload = requireErrorResponse(approveResponse, 'UTC schedule exception conflict');
		expect(errorPayload.error.message).toBe(
			'Schedule exceptions already exist for the requested dates',
		);
		expect(errorPayload.error.code).toBe('SCHEDULE_EXCEPTION_CONFLICT');
		expect(errorPayload.error.details).toEqual({
			conflicts: [conflictDateKey],
		});
	});

	it('rejects vacation requests as admin', async () => {
		const startDateKey = addDaysToDateKey('2030-01-15', 20);
		const endDateKey = addDaysToDateKey(startDateKey, 1);

		const createResponse = await client.vacations.requests.post({
			employeeId: seed.employeeId,
			startDateKey,
			endDateKey,
			status: 'SUBMITTED',
			requestedNotes: 'Solicitud admin rechazo',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(200);
		const createPayload = requireResponseData(createResponse);
		const createdRequest = createPayload.data;
		if (!createdRequest) {
			throw new Error('Expected vacation request in reject create response.');
		}
		const requestId = createdRequest.id;
		if (!requestId) {
			throw new Error('Expected vacation request ID in reject create response.');
		}

		const adminRequestRoutes = requireRoute(
			client.vacations.requests[requestId],
			'Vacation admin request route',
		);
		const rejectRoute = requireRoute(
			adminRequestRoutes.reject,
			'Vacation request reject route',
		);
		const rejectResponse = await rejectRoute.post({
			decisionNotes: 'Rechazado',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(rejectResponse.status).toBe(200);
		const rejectPayload = requireResponseData(rejectResponse);
		const rejectedRequest = rejectPayload.data;
		if (!rejectedRequest) {
			throw new Error('Expected vacation request in reject response.');
		}
		expect(rejectedRequest.status).toBe('REJECTED');
	});

	it('cancels vacation requests as admin', async () => {
		const startDateKey = addDaysToDateKey('2030-01-15', 30);
		const endDateKey = addDaysToDateKey(startDateKey, 1);

		const createResponse = await client.vacations.requests.post({
			employeeId: seed.employeeId,
			startDateKey,
			endDateKey,
			status: 'SUBMITTED',
			requestedNotes: 'Solicitud admin cancelar',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(200);
		const createPayload = requireResponseData(createResponse);
		const createdRequest = createPayload.data;
		if (!createdRequest) {
			throw new Error('Expected vacation request in cancel create response.');
		}
		const requestId = createdRequest.id;
		if (!requestId) {
			throw new Error('Expected vacation request ID in cancel create response.');
		}

		const adminRequestRoutes = requireRoute(
			client.vacations.requests[requestId],
			'Vacation admin request route',
		);
		const cancelRoute = requireRoute(
			adminRequestRoutes.cancel,
			'Vacation request cancel route',
		);
		const cancelResponse = await cancelRoute.post({
			decisionNotes: 'Cancelado admin',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(cancelResponse.status).toBe(200);
		const cancelPayload = requireResponseData(cancelResponse);
		const cancelledRequest = cancelPayload.data;
		if (!cancelledRequest) {
			throw new Error('Expected vacation request in cancel response.');
		}
		expect(cancelledRequest.status).toBe('CANCELLED');
	});
});
