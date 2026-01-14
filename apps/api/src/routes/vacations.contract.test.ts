import { beforeAll, describe, expect, it } from 'bun:test';

import { addDaysToDateKey } from '../utils/date-key.js';
import {
	createTestClient,
	getAdminSession,
	getSeedData,
	getUserSession,
} from '../test-utils/contract-helpers.js';

describe('vacation routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let userSession: Awaited<ReturnType<typeof getUserSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = await createTestClient();
		adminSession = await getAdminSession();
		userSession = await getUserSession();
		seed = await getSeedData();
	});

	it('returns vacation balance for the current user', async () => {
		const response = await client.vacations.me.balance.get({
			$headers: { cookie: userSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		expect(response.data?.data).toBeDefined();
	});

	it('lists vacation requests for the current user', async () => {
		const response = await client.vacations.me.requests.get({
			$headers: { cookie: userSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		expect(Array.isArray(response.data?.data)).toBe(true);
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
		const requestId = createResponse.data?.data?.id ?? '';

		const cancelResponse = await client.vacations.me.requests[requestId].cancel.post({
			decisionNotes: 'Cancelado por pruebas',
			$headers: { cookie: userSession.cookieHeader },
		});

		expect(cancelResponse.status).toBe(200);
		expect(cancelResponse.data?.data?.status).toBe('CANCELLED');
	});

	it('lists vacation requests for admins', async () => {
		const response = await client.vacations.requests.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		expect(Array.isArray(response.data?.data)).toBe(true);
	});

	it('creates and approves vacation requests as admin', async () => {
		const startDateKey = addDaysToDateKey('2030-01-15', 10);
		const endDateKey = addDaysToDateKey(startDateKey, 1);

		const createResponse = await client.vacations.requests.post({
			employeeId: seed.employeeId,
			startDateKey,
			endDateKey,
			status: 'SUBMITTED',
			requestedNotes: 'Solicitud admin',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(200);
		const requestId = createResponse.data?.data?.id ?? '';

		const approveResponse = await client.vacations.requests[requestId].approve.post({
			decisionNotes: 'Aprobado',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(approveResponse.status).toBe(200);
		expect(approveResponse.data?.data?.status).toBe('APPROVED');
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
		const requestId = createResponse.data?.data?.id ?? '';

		const rejectResponse = await client.vacations.requests[requestId].reject.post({
			decisionNotes: 'Rechazado',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(rejectResponse.status).toBe(200);
		expect(rejectResponse.data?.data?.status).toBe('REJECTED');
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
		const requestId = createResponse.data?.data?.id ?? '';

		const cancelResponse = await client.vacations.requests[requestId].cancel.post({
			decisionNotes: 'Cancelado admin',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(cancelResponse.status).toBe(200);
		expect(cancelResponse.data?.data?.status).toBe('CANCELLED');
	});
});
