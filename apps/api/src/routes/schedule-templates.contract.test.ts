import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

import { createTestClient, getAdminSession, getSeedData } from '../test-utils/contract-helpers.js';

describe('schedule template routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = await createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
	});

	it('lists schedule templates', async () => {
		const response = await client['schedule-templates'].get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		expect(Array.isArray(response.data?.data)).toBe(true);
	});

	it('creates, updates, and deletes a schedule template', async () => {
		const createResponse = await client['schedule-templates'].post({
			name: `Turno contrato ${randomUUID().slice(0, 6)}`,
			description: 'Horario base',
			shiftType: 'DIURNA',
			organizationId: seed.organizationId,
			days: [
				{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isWorkingDay: true },
				{ dayOfWeek: 2, startTime: '09:00', endTime: '17:00', isWorkingDay: true },
				{ dayOfWeek: 3, startTime: '09:00', endTime: '17:00', isWorkingDay: true },
				{ dayOfWeek: 4, startTime: '09:00', endTime: '17:00', isWorkingDay: true },
				{ dayOfWeek: 5, startTime: '09:00', endTime: '17:00', isWorkingDay: true },
				{ dayOfWeek: 6, startTime: '09:00', endTime: '13:00', isWorkingDay: true },
				{ dayOfWeek: 0, startTime: '00:00', endTime: '00:00', isWorkingDay: false },
			],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		const templateId = createResponse.data?.data?.id ?? '';

		const getResponse = await client['schedule-templates'][templateId].get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(getResponse.status).toBe(200);
		expect(Array.isArray(getResponse.data?.data?.days)).toBe(true);

		const updateResponse = await client['schedule-templates'][templateId].put({
			name: 'Turno actualizado',
			days: [
				{ dayOfWeek: 1, startTime: '08:00', endTime: '16:00', isWorkingDay: true },
				{ dayOfWeek: 2, startTime: '08:00', endTime: '16:00', isWorkingDay: true },
				{ dayOfWeek: 3, startTime: '08:00', endTime: '16:00', isWorkingDay: true },
				{ dayOfWeek: 4, startTime: '08:00', endTime: '16:00', isWorkingDay: true },
				{ dayOfWeek: 5, startTime: '08:00', endTime: '16:00', isWorkingDay: true },
				{ dayOfWeek: 0, startTime: '00:00', endTime: '00:00', isWorkingDay: false },
			],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(updateResponse.status).toBe(200);
		expect(updateResponse.data?.data?.name).toBe('Turno actualizado');

		const deleteResponse = await client['schedule-templates'][templateId].delete({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(deleteResponse.status).toBe(200);
	});
});
