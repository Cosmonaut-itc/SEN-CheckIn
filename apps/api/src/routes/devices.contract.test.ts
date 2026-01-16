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

describe('device routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
	});

	it('lists devices for the organization', async () => {
		const response = await client.devices.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
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
		const createPayload = requireResponseData(createResponse);
		const createdDevice = createPayload.data;
		if (!createdDevice) {
			throw new Error('Expected device record in create response.');
		}
		const deviceId = createdDevice.id;
		if (!deviceId) {
			throw new Error('Expected device ID in create response.');
		}

		const deviceRoutes = requireRoute(client.devices[deviceId], 'Device route');
		const updateResponse = await deviceRoutes.put({
			name: 'Kiosco actualizado',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(updateResponse.status).toBe(200);
		const updatePayload = requireResponseData(updateResponse);
		const updatedDevice = updatePayload.data;
		if (!updatedDevice) {
			throw new Error('Expected device record in update response.');
		}
		expect(updatedDevice.name).toBe('Kiosco actualizado');

		const heartbeatResponse = await deviceRoutes.heartbeat.post({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(heartbeatResponse.status).toBe(200);
		const heartbeatPayload = requireResponseData(heartbeatResponse);
		const heartbeatDevice = heartbeatPayload.data;
		if (!heartbeatDevice) {
			throw new Error('Expected device record in heartbeat response.');
		}
		expect(heartbeatDevice.status).toBe('ONLINE');

		const deleteResponse = await deviceRoutes.delete({
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
		const errorPayload = requireErrorResponse(secondResponse, 'duplicate device code');
		expect(errorPayload.error.message).toBe('Device code already exists');
		expect(errorPayload.error.code).toBe('CONFLICT');
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
		const firstPayload = requireResponseData(firstResponse);
		expect(firstPayload.isNew).toBe(true);

		const secondResponse = await client.devices.register.post({
			code,
			name: 'Registro 2',
			platform: 'android',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(secondResponse.status).toBe(200);
		const secondPayload = requireResponseData(secondResponse);
		expect(secondPayload.isNew).toBe(false);
	});

	it('returns 404 for unknown devices', async () => {
		const unknownDevice = requireRoute(client.devices[randomUUID()], 'Device route');
		const response = await unknownDevice.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(404);
		const errorPayload = requireErrorResponse(response, 'unknown device');
		expect(errorPayload.error.message).toBe('Device not found');
		expect(errorPayload.error.code).toBe('NOT_FOUND');
	});
});
