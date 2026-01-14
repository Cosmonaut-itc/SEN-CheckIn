import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

import { createTestClient, getAdminSession, getSeedData } from '../test-utils/contract-helpers.js';

describe('job position routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = await createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
	});

	it('lists job positions', async () => {
		const response = await client['job-positions'].get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		expect(Array.isArray(response.data?.data)).toBe(true);
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
		expect(createResponse.data?.warnings?.length).toBeGreaterThan(0);

		const positionId = createResponse.data?.data?.id ?? '';
		const updateResponse = await client['job-positions'][positionId].put({
			description: 'Posicion actualizada',
			dailyPay: 2,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(updateResponse.status).toBe(200);
		expect(updateResponse.data?.data?.description).toBe('Posicion actualizada');

		const deleteResponse = await client['job-positions'][positionId].delete({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(deleteResponse.status).toBe(200);
	});

	it('returns 404 for unknown job positions', async () => {
		const response = await client['job-positions'][randomUUID()].get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(404);
	});
});
