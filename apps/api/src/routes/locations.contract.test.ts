import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

import {
	createTestClient,
	getAdminSession,
	getSeedData,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

describe('location routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
	});

	it('lists locations', async () => {
		const response = await client.locations.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
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
		const createPayload = requireResponseData(createResponse);
		const createdLocation = createPayload.data;
		if (!createdLocation) {
			throw new Error('Expected location record in create response.');
		}
		const locationId = createdLocation.id;
		if (!locationId) {
			throw new Error('Expected location ID in create response.');
		}

		const locationRoutes = requireRoute(client.locations[locationId], 'Location route');
		const updateResponse = await locationRoutes.put({
			name: 'Sucursal Actualizada',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(updateResponse.status).toBe(200);
		const updatePayload = requireResponseData(updateResponse);
		const updatedLocation = updatePayload.data;
		if (!updatedLocation) {
			throw new Error('Expected location record in update response.');
		}
		expect(updatedLocation.name).toBe('Sucursal Actualizada');

		const deleteResponse = await locationRoutes.delete({
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
