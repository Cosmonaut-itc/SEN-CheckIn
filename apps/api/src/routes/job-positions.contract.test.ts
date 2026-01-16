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

describe('job position routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
	});

	it('lists job positions', async () => {
		const response = await client['job-positions'].get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
	});

	it('creates, updates, and deletes a job position with warnings', async () => {
		const createResponse = await client['job-positions'].post({
			name: `Contrato ${Date.now()}`,
			description: 'Posicion de prueba',
			dailyPay: 1,
			paymentFrequency: 'WEEKLY',
			organizationId: seed.organizationId,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		const createPayload = requireResponseData(createResponse);
		if ('warnings' in createPayload) {
			const warnings = createPayload.warnings;
			if (!Array.isArray(warnings)) {
				throw new Error('Expected minimum wage warnings array.');
			}
			expect(warnings.length).toBeGreaterThan(0);
		} else {
			throw new Error('Expected minimum wage warnings in create response.');
		}

		if (!('data' in createPayload) || !createPayload.data) {
			throw new Error('Expected job position data in create response.');
		}
		const createdPosition = createPayload.data;
		const positionId = createdPosition.id;
		if (!positionId) {
			throw new Error('Expected job position ID in create response.');
		}
		const jobPositionRoutes = requireRoute(
			client['job-positions'][positionId],
			'Job position route',
		);
		const updateResponse = await jobPositionRoutes.put({
			description: 'Posicion actualizada',
			dailyPay: 2,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(updateResponse.status).toBe(200);
		const updatePayload = requireResponseData(updateResponse);
		if (!('data' in updatePayload) || !updatePayload.data) {
			throw new Error('Expected job position data in update response.');
		}
		const updatedPosition = updatePayload.data;
		expect(updatedPosition.description).toBe('Posicion actualizada');

		const deleteResponse = await jobPositionRoutes.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(deleteResponse.status).toBe(200);
	});

	it('returns 404 for unknown job positions', async () => {
		const unknownJobPosition = requireRoute(
			client['job-positions'][randomUUID()],
			'Job position route',
		);
		const response = await unknownJobPosition.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(404);
		const errorPayload = requireErrorResponse(response, 'unknown job position');
		expect(errorPayload.error.message).toBe('Job position not found');
		expect(errorPayload.error.code).toBe('NOT_FOUND');
	});
});
