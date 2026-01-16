import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

import {
	createTestClient,
	getAdminSession,
	getSeedData,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

describe('schedule template routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
	});

	it('lists schedule templates', async () => {
		const response = await client['schedule-templates'].get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
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
		const createPayload = requireResponseData(createResponse);
		const createdTemplate = createPayload.data;
		if (!createdTemplate) {
			throw new Error('Expected schedule template record in create response.');
		}
		const templateId = createdTemplate.id;
		if (!templateId) {
			throw new Error('Expected schedule template ID in create response.');
		}

		const templateRoutes = requireRoute(
			client['schedule-templates'][templateId],
			'Schedule template route',
		);
		const getResponse = await templateRoutes.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(getResponse.status).toBe(200);
		const getPayload = requireResponseData(getResponse);
		const fetchedTemplate = getPayload.data;
		if (!fetchedTemplate) {
			throw new Error('Expected schedule template record in get response.');
		}
		expect(Array.isArray(fetchedTemplate.days)).toBe(true);

		const updateResponse = await templateRoutes.put({
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
		const updatePayload = requireResponseData(updateResponse);
		const updatedTemplate = updatePayload.data;
		if (!updatedTemplate) {
			throw new Error('Expected schedule template record in update response.');
		}
		expect(updatedTemplate.name).toBe('Turno actualizado');

		const deleteResponse = await templateRoutes.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(deleteResponse.status).toBe(200);
	});

	it('returns 404 for unknown schedule templates', async () => {
		const unknownTemplate = requireRoute(
			client['schedule-templates'][randomUUID()],
			'Schedule template route',
		);
		const response = await unknownTemplate.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(404);
		const errorPayload = requireErrorResponse(response, 'unknown schedule template');
		expect(errorPayload.error.message).toBe('Schedule template not found');
		expect(errorPayload.error.code).toBe('NOT_FOUND');
	});
});
