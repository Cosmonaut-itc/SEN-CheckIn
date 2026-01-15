import { beforeAll, describe, expect, it } from 'bun:test';
import { addDays } from 'date-fns';

import {
	createTestClient,
	getAdminSession,
	getSeedData,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

describe('schedule exception routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
	});

	it('lists schedule exceptions', async () => {
		const response = await client['schedule-exceptions'].get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
	});

	it('creates, updates, and deletes a schedule exception', async () => {
		const exceptionDate = addDays(new Date(), 10);
		const createResponse = await client['schedule-exceptions'].post({
			employeeId: seed.employeeId,
			exceptionDate,
			exceptionType: 'MODIFIED',
			startTime: '10:00',
			endTime: '16:00',
			reason: 'Cambio de horario',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		const createPayload = requireResponseData(createResponse);
		const createdException = createPayload.data;
		if (!createdException) {
			throw new Error('Expected schedule exception record in create response.');
		}
		const exceptionId = createdException.id;
		if (!exceptionId) {
			throw new Error('Expected schedule exception ID in create response.');
		}

		const scheduleExceptionRoutes = requireRoute(
			client['schedule-exceptions'][exceptionId],
			'Schedule exception route',
		);
		const updateResponse = await scheduleExceptionRoutes.put({
			reason: 'Cambio actualizado',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(updateResponse.status).toBe(200);
		const updatePayload = requireResponseData(updateResponse);
		const updatedException = updatePayload.data;
		if (!updatedException) {
			throw new Error('Expected schedule exception record in update response.');
		}
		expect(updatedException.reason).toBe('Cambio actualizado');

		const deleteResponse = await scheduleExceptionRoutes.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(deleteResponse.status).toBe(200);
	});

	it('rejects duplicate schedule exceptions for a date', async () => {
		const exceptionDate = addDays(new Date(), 12);
		const firstResponse = await client['schedule-exceptions'].post({
			employeeId: seed.employeeId,
			exceptionDate,
			exceptionType: 'EXTRA_DAY',
			startTime: '09:00',
			endTime: '15:00',
			reason: 'Turno extra',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(firstResponse.status).toBe(201);

		const secondResponse = await client['schedule-exceptions'].post({
			employeeId: seed.employeeId,
			exceptionDate,
			exceptionType: 'EXTRA_DAY',
			startTime: '09:00',
			endTime: '15:00',
			reason: 'Turno extra',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(secondResponse.status).toBe(409);
	});
});
