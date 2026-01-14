import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

import { createTestClient, getAdminSession, getSeedData } from '../test-utils/contract-helpers.js';

describe('location routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = await createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
	});

	it('lists locations', async () => {
		const response = await client.locations.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		expect(Array.isArray(response.data?.data)).toBe(true);
	});

	it('creates, updates, and deletes a location', async () => {
		const locationCode = `LOC-${randomUUID().slice(0, 8)}`;
		const createResponse = await client.locations.post({
			name: 'Sucursal Contrato',
			code: locationCode,
			address: 'Calle prueba 123',
			geographicZone: 'GENERAL',
			timeZone: 'America/Mexico_City',
			organizationId: seed.organizationId,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		const locationId = createResponse.data?.data?.id ?? '';

		const updateResponse = await client.locations[locationId].put({
			name: 'Sucursal Actualizada',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(updateResponse.status).toBe(200);
		expect(updateResponse.data?.data?.name).toBe('Sucursal Actualizada');

		const deleteResponse = await client.locations[locationId].delete({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(deleteResponse.status).toBe(200);
	});

	it('prevents duplicate location codes', async () => {
		const code = `LOC-${randomUUID().slice(0, 8)}`;
		const firstResponse = await client.locations.post({
			name: 'Sucursal Duplicada',
			code,
			address: 'Direccion 1',
			geographicZone: 'GENERAL',
			timeZone: 'America/Mexico_City',
			organizationId: seed.organizationId,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(firstResponse.status).toBe(201);

		const secondResponse = await client.locations.post({
			name: 'Sucursal Duplicada 2',
			code,
			address: 'Direccion 2',
			geographicZone: 'GENERAL',
			timeZone: 'America/Mexico_City',
			organizationId: seed.organizationId,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(secondResponse.status).toBe(409);
	});
});
