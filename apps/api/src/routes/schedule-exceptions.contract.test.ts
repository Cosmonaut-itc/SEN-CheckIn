import { beforeAll, describe, expect, it } from 'bun:test';
import { addDays } from 'date-fns';

import { createTestClient, getAdminSession, getSeedData } from '../test-utils/contract-helpers.js';

describe('schedule exception routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = await createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
	});

	it('lists schedule exceptions', async () => {
		const response = await client['schedule-exceptions'].get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		expect(Array.isArray(response.data?.data)).toBe(true);
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
		const exceptionId = createResponse.data?.data?.id ?? '';

		const updateResponse = await client['schedule-exceptions'][exceptionId].put({
			reason: 'Cambio actualizado',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(updateResponse.status).toBe(200);
		expect(updateResponse.data?.data?.reason).toBe('Cambio actualizado');

		const deleteResponse = await client['schedule-exceptions'][exceptionId].delete({
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
