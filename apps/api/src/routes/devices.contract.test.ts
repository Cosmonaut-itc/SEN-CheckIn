import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

import { createTestClient, getAdminSession, getSeedData } from '../test-utils/contract-helpers.js';

describe('device routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = await createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
	});

	it('lists devices for the organization', async () => {
		const response = await client.devices.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		expect(Array.isArray(response.data?.data)).toBe(true);
	});

	it('creates, updates, heartbeats, and deletes a device', async () => {
		const deviceCode = `KIOSK-${randomUUID().slice(0, 8)}`;
		const createResponse = await client.devices.post({
			code: deviceCode,
			name: 'Kiosco de prueba',
			deviceType: 'KIOSK',
			status: 'OFFLINE',
			locationId: seed.locationId,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		const deviceId = createResponse.data?.data?.id ?? '';

		const updateResponse = await client.devices[deviceId].put({
			name: 'Kiosco actualizado',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(updateResponse.status).toBe(200);
		expect(updateResponse.data?.data?.name).toBe('Kiosco actualizado');

		const heartbeatResponse = await client.devices[deviceId].heartbeat.post({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(heartbeatResponse.status).toBe(200);
		expect(heartbeatResponse.data?.data?.status).toBe('ONLINE');

		const deleteResponse = await client.devices[deviceId].delete({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(deleteResponse.status).toBe(200);
	});

	it('prevents duplicate device codes', async () => {
		const duplicateCode = `KIOSK-${randomUUID().slice(0, 8)}`;
		const firstResponse = await client.devices.post({
			code: duplicateCode,
			name: 'Kiosco duplicado',
			deviceType: 'KIOSK',
			status: 'OFFLINE',
			locationId: seed.locationId,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(firstResponse.status).toBe(201);

		const secondResponse = await client.devices.post({
			code: duplicateCode,
			name: 'Kiosco duplicado 2',
			deviceType: 'KIOSK',
			status: 'OFFLINE',
			locationId: seed.locationId,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(secondResponse.status).toBe(409);
	});

	it('registers devices by code', async () => {
		const code = `REG-${randomUUID().slice(0, 8)}`;
		const firstResponse = await client.devices.register.post({
			code,
			name: 'Registro 1',
			platform: 'android',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(firstResponse.status).toBe(201);
		expect(firstResponse.data?.isNew).toBe(true);

		const secondResponse = await client.devices.register.post({
			code,
			name: 'Registro 2',
			platform: 'android',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(secondResponse.status).toBe(200);
		expect(secondResponse.data?.isNew).toBe(false);
	});

	it('returns 404 for unknown devices', async () => {
		const response = await client.devices[randomUUID()].get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(404);
	});
});
