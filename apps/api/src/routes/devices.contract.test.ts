import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

import db from '../db/index.js';
import {
	createTestClient,
	getAdminSession,
	getSeedData,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';
import { device, member, organization } from '../db/schema.js';

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

	it('returns a status summary for devices in the organization', async () => {
		const otherOrganizationId = randomUUID();
		await db.insert(organization).values({
			id: otherOrganizationId,
			name: `Organización ${otherOrganizationId.slice(0, 8)}`,
			slug: `organizacion-${otherOrganizationId.slice(0, 8)}`,
			logo: null,
			metadata: null,
		});
		await db.insert(member).values({
			id: randomUUID(),
			organizationId: otherOrganizationId,
			userId: adminSession.userId,
			role: 'admin',
		});

		const deviceCode = `SUMMARY-${randomUUID().slice(0, 8)}`;
		const createResponse = await client.devices.post({
			code: deviceCode,
			name: 'Kiosco resumen',
			deviceType: 'KIOSK',
			status: 'OFFLINE',
			locationId: seed.locationId,
			organizationId: seed.organizationId,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);

		const foreignDeviceCode = `SUMMARY-${randomUUID().slice(0, 8)}`;
		await db.insert(device).values({
			id: randomUUID(),
			code: foreignDeviceCode,
			name: 'Kiosco otro org',
			deviceType: 'KIOSK',
			status: 'OFFLINE',
			organizationId: otherOrganizationId,
		});
		const createPayload = requireResponseData(createResponse);
		const createdDevice = createPayload.data;
		if (!createdDevice?.id) {
			throw new Error('Expected device ID in create response.');
		}

		const deviceRoutes = requireRoute(client.devices[createdDevice.id], 'Device route');
		const heartbeatResponse = await deviceRoutes.heartbeat.post({
			batteryLevel: 55,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(heartbeatResponse.status).toBe(200);

		const summaryRoute = requireRoute(
			client.devices['status-summary'],
			'Device status summary route',
		);
		const summaryResponse = await summaryRoute.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				organizationId: seed.organizationId,
			},
		});

		expect(summaryResponse.status).toBe(200);
		const summaryPayload = requireResponseData(summaryResponse);
		expect(Array.isArray(summaryPayload.data)).toBe(true);
		expect(typeof summaryPayload.total).toBe('number');

		const summaryRecord = summaryPayload.data.find(
			(record: { code: string }) => record.code === deviceCode,
		);
		expect(summaryRecord).toBeDefined();
		expect(summaryRecord).toMatchObject({
			code: deviceCode,
			name: 'Kiosco resumen',
			status: 'ONLINE',
			batteryLevel: 55,
			locationId: seed.locationId,
		});
		expect(typeof summaryRecord?.id).toBe('string');
		expect(typeof summaryRecord?.locationName).toBe('string');
		expect(summaryRecord?.lastHeartbeat).not.toBeNull();
		expect(
			summaryPayload.data.some((record: { code: string }) => record.code === foreignDeviceCode),
		).toBe(false);
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
			batteryLevel: 84,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(heartbeatResponse.status).toBe(200);
		const heartbeatPayload = requireResponseData(heartbeatResponse);
		const heartbeatDevice = heartbeatPayload.data;
		if (!heartbeatDevice) {
			throw new Error('Expected device record in heartbeat response.');
		}
		expect(heartbeatDevice.status).toBe('ONLINE');
		expect(heartbeatDevice.batteryLevel).toBe(84);

		const refreshedResponse = await deviceRoutes.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(refreshedResponse.status).toBe(200);
		const refreshedPayload = requireResponseData(refreshedResponse);
		const refreshedDevice = refreshedPayload.data;
		if (!refreshedDevice) {
			throw new Error('Expected refreshed device record after heartbeat.');
		}
		expect(refreshedDevice.batteryLevel).toBe(84);

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

	it('returns DEVICE_NOT_FOUND when heartbeat targets an unknown device', async () => {
		const unknownDevice = requireRoute(client.devices[randomUUID()], 'Device route');
		const response = await unknownDevice.heartbeat.post({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(404);
		const errorPayload = requireErrorResponse(response, 'unknown device heartbeat');
		expect(errorPayload.error.message).toBe('Device not found');
		expect(errorPayload.error.code).toBe('DEVICE_NOT_FOUND');
	});

	it('rejects heartbeat battery levels outside the 0 to 100 range', async () => {
		const deviceCode = `KIOSK-${randomUUID().slice(0, 8)}`;
		const createResponse = await client.devices.post({
			code: deviceCode,
			name: 'Kiosco bateria invalida',
			deviceType: 'KIOSK',
			status: 'OFFLINE',
			locationId: seed.locationId,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		const createPayload = requireResponseData(createResponse);
		const createdDevice = createPayload.data;
		if (!createdDevice?.id) {
			throw new Error('Expected device ID in create response.');
		}

		const deviceRoutes = requireRoute(client.devices[createdDevice.id], 'Device route');
		for (const batteryLevel of [101, -1, 84.5]) {
			const response = await deviceRoutes.heartbeat.post({
				batteryLevel,
				$headers: { cookie: adminSession.cookieHeader },
			});

			expect(response.status).toBe(400);
			const errorPayload = requireErrorResponse(
				response,
				`invalid heartbeat battery level ${batteryLevel}`,
			);
			expect(errorPayload.error.code).toBe('VALIDATION_ERROR');
		}
	});
});
