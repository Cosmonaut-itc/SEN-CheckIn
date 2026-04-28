import { beforeAll, describe, expect, it } from 'bun:test';
import { parseSetCookieHeader } from 'better-auth/cookies';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import {
	createTestClient,
	getAdminSession,
	getSeedData,
	getTestApp,
	getUserIdByEmail,
	getUserSession,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';
import { device, deviceSettingsPinOverride, member, organization } from '../db/schema.js';

let authInstance: typeof import('../../utils/auth.js').auth;
let db: typeof import('../db/index.js').default;

describe('device routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let memberSession: Awaited<ReturnType<typeof getUserSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;
	let app: Awaited<ReturnType<typeof getTestApp>>;

	type JsonRecord = Record<string, unknown>;

	/**
	 * Builds a cookie header string from a Better Auth Set-Cookie response.
	 *
	 * @param setCookieHeader - Raw Set-Cookie header
	 * @returns Cookie header value
	 * @throws Error when no cookies are present
	 */
	function buildCookieHeader(setCookieHeader: string | null): string {
		if (!setCookieHeader) {
			throw new Error('Missing Set-Cookie header from auth response.');
		}

		const parsedCookies = parseSetCookieHeader(setCookieHeader);
		const cookiePairs = Array.from(parsedCookies.entries()).map(
			([cookieName, cookieValue]) => `${cookieName}=${cookieValue.value}`,
		);

		if (cookiePairs.length === 0) {
			throw new Error('No cookies found in Set-Cookie header.');
		}

		return cookiePairs.join('; ');
	}

	/**
	 * Merges new Set-Cookie values into an existing cookie header.
	 *
	 * @param cookieHeader - Existing Cookie header
	 * @param setCookieHeader - Raw Set-Cookie header
	 * @returns Updated Cookie header
	 */
	function mergeCookieHeader(cookieHeader: string, setCookieHeader: string | null): string {
		if (!setCookieHeader) {
			return cookieHeader;
		}

		const cookieMap = new Map<string, string>();
		cookieHeader
			.split(';')
			.map((cookie) => cookie.trim())
			.filter(Boolean)
			.forEach((cookie) => {
				const [name, ...valueParts] = cookie.split('=');
				const value = valueParts.join('=');
				if (name && value) {
					cookieMap.set(name, value);
				}
			});

		parseSetCookieHeader(setCookieHeader).forEach((value, name) => {
			cookieMap.set(name, value.value);
		});

		return Array.from(cookieMap.entries())
			.map(([name, value]) => `${name}=${value}`)
			.join('; ');
	}

	/**
	 * Creates a non-platform organization admin session for the seeded organization.
	 *
	 * @returns Cookie header for the organization admin session
	 */
	async function createSeedOrganizationAdminCookie(): Promise<string> {
		const suffix = randomUUID().slice(0, 8);
		const email = `device-org-admin-${suffix}@sen-checkin.test`;
		const password = 'User123!Test';
		const signUpResult = await authInstance.api.signUpEmail({
			body: {
				name: 'Admin de Organización',
				email,
				password,
				username: `device_org_admin_${suffix}`,
			},
		});

		if ((signUpResult as { error?: unknown }).error) {
			throw new Error('Failed to create device org admin test user.');
		}

		const userId = await getUserIdByEmail(email);
		await db.insert(member).values({
			id: randomUUID(),
			userId,
			organizationId: seed.organizationId,
			role: 'admin',
		});

		const signInResponse = await authInstance.api.signInEmail({
			body: { email, password },
			asResponse: true,
		});
		const cookieHeader = buildCookieHeader(signInResponse.headers.get('set-cookie'));
		const activeOrgResponse = await authInstance.api.setActiveOrganization({
			body: { organizationId: seed.organizationId },
			headers: { cookie: cookieHeader },
			asResponse: true,
		});

		return mergeCookieHeader(cookieHeader, activeOrgResponse.headers.get('set-cookie'));
	}

	/**
	 * Sends a JSON request through the in-memory app.
	 *
	 * @param method - HTTP method
	 * @param path - Absolute API path
	 * @param cookieHeader - Authentication cookie header
	 * @param body - Optional JSON body
	 * @param extraHeaders - Optional request headers
	 * @returns Response status and parsed JSON payload
	 */
	async function requestJson(
		method: string,
		path: string,
		cookieHeader: string,
		body?: unknown,
		extraHeaders?: Record<string, string>,
	): Promise<{ status: number; payload: unknown }> {
		const headers = new Headers({
			cookie: cookieHeader,
		});
		Object.entries(extraHeaders ?? {}).forEach(([name, value]) => {
			headers.set(name, value);
		});
		const init: RequestInit = {
			method,
			headers,
		};
		if (body !== undefined) {
			headers.set('content-type', 'application/json');
			init.body = JSON.stringify(body);
		}

		const response = await app.handle(new Request(`http://localhost${path}`, init));
		const text = await response.text();
		const payload = text ? (JSON.parse(text) as unknown) : null;

		return {
			status: response.status,
			payload,
		};
	}

	/**
	 * Extracts a data envelope from an API response payload.
	 *
	 * @param payload - Parsed JSON payload
	 * @returns Data record from the payload
	 * @throws Error when the payload has no object data envelope
	 */
	function requirePayloadData(payload: unknown): JsonRecord {
		if (!payload || typeof payload !== 'object' || !('data' in payload)) {
			throw new Error('Expected payload to include data.');
		}
		const data = (payload as { data?: unknown }).data;
		if (!data || typeof data !== 'object' || Array.isArray(data)) {
			throw new Error('Expected payload data to be an object.');
		}
		return data as JsonRecord;
	}

	/**
	 * Reads the stored global PIN hash for an organization through raw SQL.
	 *
	 * @param organizationId - Organization ID to inspect
	 * @returns Persisted hash or null when no config exists
	 */
	async function readStoredGlobalPinHash(organizationId: string): Promise<string | null> {
		const result = await db.execute(sql`
			SELECT global_pin_hash
			FROM organization_device_settings_pin_config
			WHERE organization_id = ${organizationId}
			LIMIT 1
		`);
		const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
		const first = rows[0];
		if (!first || typeof first !== 'object') {
			return null;
		}
		const hash = (first as { global_pin_hash?: unknown }).global_pin_hash;
		return typeof hash === 'string' ? hash : null;
	}

	/**
	 * Normalizes Drizzle raw SQL results into row arrays.
	 *
	 * @param result - Raw Drizzle execution result
	 * @returns Query rows
	 */
	function getSqlRows(result: unknown): unknown[] {
		return Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
	}

	/**
	 * Deletes settings PIN state for the seeded organization between tests.
	 *
	 * @returns Nothing
	 */
	async function cleanupSettingsPinState(): Promise<void> {
		const tableCheck = await db.execute(sql`
			SELECT to_regclass('public.organization_device_settings_pin_config') AS config_table
		`);
		const rows = getSqlRows(tableCheck);
		const first = rows[0];
		const configTable =
			first && typeof first === 'object'
				? (first as { config_table?: unknown }).config_table
				: null;
		if (typeof configTable !== 'string') {
			return;
		}

		await db.execute(sql`
			DELETE FROM device_settings_pin_override
			WHERE organization_id = ${seed.organizationId}
				OR device_id = ${seed.deviceId}
		`);
		await db.execute(sql`
			DELETE FROM organization_device_settings_pin_config
			WHERE organization_id = ${seed.organizationId}
		`);
	}

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		memberSession = await getUserSession();
		seed = await getSeedData();
		app = await getTestApp();
		authInstance = (await import('../../utils/auth.js')).auth;
		({ default: db } = await import('../db/index.js'));
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
			summaryPayload.data.some(
				(record: { code: string }) => record.code === foreignDeviceCode,
			),
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

	it('hashes configured global PINs and verifies them online', async () => {
		await cleanupSettingsPinState();

		const configResponse = await requestJson(
			'PUT',
			'/devices/settings-pin-config',
			adminSession.cookieHeader,
			{
				mode: 'GLOBAL',
				globalPin: '1234',
			},
		);

		expect(configResponse.status).toBe(200);
		const storedHash = await readStoredGlobalPinHash(seed.organizationId);
		expect(typeof storedHash).toBe('string');
		expect(storedHash).not.toBe('1234');
		expect(storedHash).not.toContain('1234');

		const invalidResponse = await requestJson(
			'POST',
			`/devices/${seed.deviceId}/settings-pin-verify`,
			adminSession.cookieHeader,
			{ pin: '9999' },
		);
		expect(invalidResponse.status).toBe(200);
		expect(requirePayloadData(invalidResponse.payload).valid).toBe(false);

		const validResponse = await requestJson(
			'POST',
			`/devices/${seed.deviceId}/settings-pin-verify`,
			adminSession.cookieHeader,
			{ pin: '1234' },
		);
		expect(validResponse.status).toBe(200);
		expect(requirePayloadData(validResponse.payload).valid).toBe(true);
	});

	it('rate limits repeated failed settings PIN verification attempts without trusting forwarded headers and clears after success', async () => {
		await cleanupSettingsPinState();

		const deviceCode = `PIN-LIMIT-${randomUUID().slice(0, 8)}`;
		const createResponse = await client.devices.post({
			code: deviceCode,
			name: 'Kiosco PIN limite',
			deviceType: 'KIOSK',
			status: 'OFFLINE',
			locationId: seed.locationId,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const createdDevice = requireResponseData(createResponse).data;
		if (!createdDevice?.id) {
			throw new Error('Expected device ID in create response.');
		}

		const configResponse = await requestJson(
			'PUT',
			'/devices/settings-pin-config',
			adminSession.cookieHeader,
			{
				mode: 'PER_DEVICE',
				globalPin: '1357',
			},
		);
		expect(configResponse.status).toBe(200);

		const overrideResponse = await requestJson(
			'PUT',
			`/devices/${createdDevice.id}/settings-pin`,
			adminSession.cookieHeader,
			{ pin: '1357' },
		);
		expect(overrideResponse.status).toBe(200);

		for (let attempt = 0; attempt < 4; attempt += 1) {
			const response = await requestJson(
				'POST',
				`/devices/${createdDevice.id}/settings-pin-verify`,
				adminSession.cookieHeader,
				{ pin: '0000' },
				{ 'x-forwarded-for': '203.0.113.10' },
			);
			expect(response.status).toBe(200);
			expect(requirePayloadData(response.payload).valid).toBe(false);
		}

		const successResponse = await requestJson(
			'POST',
			`/devices/${createdDevice.id}/settings-pin-verify`,
			adminSession.cookieHeader,
			{ pin: '1357' },
			{ 'x-forwarded-for': '203.0.113.10' },
		);
		expect(successResponse.status).toBe(200);
		expect(requirePayloadData(successResponse.payload).valid).toBe(true);

		for (let attempt = 0; attempt < 5; attempt += 1) {
			const response = await requestJson(
				'POST',
				`/devices/${createdDevice.id}/settings-pin-verify`,
				adminSession.cookieHeader,
				{ pin: '0000' },
				{ 'x-forwarded-for': `203.0.113.${attempt + 20}` },
			);
			expect(response.status).toBe(200);
			expect(requirePayloadData(response.payload).valid).toBe(false);
		}

		const lockedResponse = await requestJson(
			'POST',
			`/devices/${createdDevice.id}/settings-pin-verify`,
			adminSession.cookieHeader,
			{ pin: '0000' },
			{ 'x-forwarded-for': '203.0.113.250' },
		);
		expect(lockedResponse.status).toBe(429);
	});

	it('rate limits global settings PIN failures across devices using the shared global scope', async () => {
		await cleanupSettingsPinState();

		const deviceCode = `PIN-GLOBAL-SCOPE-${randomUUID().slice(0, 8)}`;
		const createResponse = await client.devices.post({
			code: deviceCode,
			name: 'Kiosco PIN global compartido',
			deviceType: 'KIOSK',
			status: 'OFFLINE',
			locationId: seed.locationId,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(201);
		const createdDevice = requireResponseData(createResponse).data;
		if (!createdDevice?.id) {
			throw new Error('Expected device ID in create response.');
		}

		const configResponse = await requestJson(
			'PUT',
			'/devices/settings-pin-config',
			adminSession.cookieHeader,
			{
				mode: 'GLOBAL',
				globalPin: '8642',
			},
		);
		expect(configResponse.status).toBe(200);

		const attemptDeviceIds = [
			seed.deviceId,
			createdDevice.id,
			seed.deviceId,
			createdDevice.id,
			seed.deviceId,
		];
		for (const deviceId of attemptDeviceIds) {
			const response = await requestJson(
				'POST',
				`/devices/${deviceId}/settings-pin-verify`,
				adminSession.cookieHeader,
				{ pin: '0000' },
			);
			expect(response.status).toBe(200);
			expect(requirePayloadData(response.payload).valid).toBe(false);
		}

		const lockedResponse = await requestJson(
			'POST',
			`/devices/${createdDevice.id}/settings-pin-verify`,
			adminSession.cookieHeader,
			{ pin: '0000' },
		);
		expect(lockedResponse.status).toBe(429);
	});

	it('uses a device override before the global PIN in PER_DEVICE mode', async () => {
		await cleanupSettingsPinState();

		const deviceCode = `PIN-${randomUUID().slice(0, 8)}`;
		const createResponse = await client.devices.post({
			code: deviceCode,
			name: 'Kiosco PIN propio',
			deviceType: 'KIOSK',
			status: 'OFFLINE',
			locationId: seed.locationId,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		const createdDevice = requireResponseData(createResponse).data;
		if (!createdDevice?.id) {
			throw new Error('Expected device ID in create response.');
		}

		const configResponse = await requestJson(
			'PUT',
			'/devices/settings-pin-config',
			adminSession.cookieHeader,
			{
				mode: 'PER_DEVICE',
				globalPin: '1111',
			},
		);
		expect(configResponse.status).toBe(200);

		const overrideResponse = await requestJson(
			'PUT',
			`/devices/${createdDevice.id}/settings-pin`,
			adminSession.cookieHeader,
			{
				pin: '2222',
			},
		);
		expect(overrideResponse.status).toBe(200);

		const globalPinResponse = await requestJson(
			'POST',
			`/devices/${createdDevice.id}/settings-pin-verify`,
			adminSession.cookieHeader,
			{ pin: '1111' },
		);
		expect(globalPinResponse.status).toBe(200);
		expect(requirePayloadData(globalPinResponse.payload).valid).toBe(false);

		const devicePinResponse = await requestJson(
			'POST',
			`/devices/${createdDevice.id}/settings-pin-verify`,
			adminSession.cookieHeader,
			{ pin: '2222' },
		);
		expect(devicePinResponse.status).toBe(200);
		expect(requirePayloadData(devicePinResponse.payload).valid).toBe(true);

		const statusResponse = await requestJson(
			'GET',
			`/devices/${createdDevice.id}/settings-pin-status`,
			adminSession.cookieHeader,
		);
		expect(statusResponse.status).toBe(200);
		expect(requirePayloadData(statusResponse.payload)).toMatchObject({
			mode: 'PER_DEVICE',
			source: 'DEVICE',
			pinRequired: true,
			globalPinConfigured: true,
			deviceOverrideConfigured: true,
		});
	});

	it('uses the global PIN in PER_DEVICE mode when a device has no override', async () => {
		await cleanupSettingsPinState();

		const configResponse = await requestJson(
			'PUT',
			'/devices/settings-pin-config',
			adminSession.cookieHeader,
			{
				mode: 'PER_DEVICE',
				globalPin: '5555',
			},
		);
		expect(configResponse.status).toBe(200);

		const invalidResponse = await requestJson(
			'POST',
			`/devices/${seed.deviceId}/settings-pin-verify`,
			adminSession.cookieHeader,
			{ pin: '0000' },
		);
		expect(invalidResponse.status).toBe(200);
		expect(requirePayloadData(invalidResponse.payload).valid).toBe(false);

		const validResponse = await requestJson(
			'POST',
			`/devices/${seed.deviceId}/settings-pin-verify`,
			adminSession.cookieHeader,
			{ pin: '5555' },
		);
		expect(validResponse.status).toBe(200);
		expect(requirePayloadData(validResponse.payload).valid).toBe(true);

		const statusResponse = await requestJson(
			'GET',
			`/devices/${seed.deviceId}/settings-pin-status`,
			adminSession.cookieHeader,
		);
		expect(statusResponse.status).toBe(200);
		expect(requirePayloadData(statusResponse.payload)).toMatchObject({
			mode: 'PER_DEVICE',
			source: 'GLOBAL',
			pinRequired: true,
			globalPinConfigured: true,
			deviceOverrideConfigured: false,
		});
	});

	it('blocks organization members from updating settings PIN policy', async () => {
		await cleanupSettingsPinState();

		const response = await requestJson(
			'PUT',
			'/devices/settings-pin-config',
			memberSession.cookieHeader,
			{
				mode: 'GLOBAL',
				globalPin: '4321',
			},
		);

		expect(response.status).toBe(403);
		expect(JSON.stringify(response.payload)).toContain(
			'Only owner/admin can manage device settings PIN',
		);
	});

	it('allows platform admins to update settings PIN config for organizations where they are not members', async () => {
		await cleanupSettingsPinState();

		const targetOrganizationId = randomUUID();
		await db.insert(organization).values({
			id: targetOrganizationId,
			name: `Organización PIN ${targetOrganizationId.slice(0, 8)}`,
			slug: `organizacion-pin-${targetOrganizationId.slice(0, 8)}`,
			logo: null,
			metadata: null,
		});

		const adminMemberships = await db
			.select({ id: member.id })
			.from(member)
			.where(
				sql`${member.userId} = ${adminSession.userId} AND ${member.organizationId} = ${targetOrganizationId}`,
			);
		expect(adminMemberships.length).toBe(0);

		const response = await requestJson(
			'PUT',
			'/devices/settings-pin-config',
			adminSession.cookieHeader,
			{
				organizationId: targetOrganizationId,
				mode: 'GLOBAL',
				globalPin: '2468',
			},
		);

		expect(response.status).toBe(200);
		const targetStoredHash = await readStoredGlobalPinHash(targetOrganizationId);
		expect(typeof targetStoredHash).toBe('string');
		expect(targetStoredHash).not.toBe('2468');
		expect(await readStoredGlobalPinHash(seed.organizationId)).toBeNull();
	});

	it('allows platform admins to read settings PIN config for organizations where they are not members', async () => {
		await cleanupSettingsPinState();

		const targetOrganizationId = randomUUID();
		const targetDeviceId = randomUUID();
		const suffix = targetOrganizationId.slice(0, 8);
		await db.insert(organization).values({
			id: targetOrganizationId,
			name: `Organización PIN Lectura ${suffix}`,
			slug: `organizacion-pin-lectura-${suffix}`,
			logo: null,
			metadata: null,
		});
		await db.insert(device).values({
			id: targetDeviceId,
			code: `PIN-READ-${suffix}`,
			name: 'Kiosco PIN lectura',
			deviceType: 'KIOSK',
			status: 'OFFLINE',
			organizationId: targetOrganizationId,
		});

		const configResponse = await requestJson(
			'PUT',
			'/devices/settings-pin-config',
			adminSession.cookieHeader,
			{
				organizationId: targetOrganizationId,
				mode: 'GLOBAL',
				globalPin: '9753',
			},
		);
		expect(configResponse.status).toBe(200);

		const readResponse = await requestJson(
			'GET',
			`/devices/settings-pin-config?organizationId=${targetOrganizationId}`,
			adminSession.cookieHeader,
		);

		expect(readResponse.status).toBe(200);
		const readData = requirePayloadData(readResponse.payload);
		expect(readData.mode).toBe('GLOBAL');
		expect(readData.globalPinConfigured).toBe(true);
		expect(Array.isArray(readData.devices)).toBe(true);
		const deviceStatuses = readData.devices as JsonRecord[];
		expect(deviceStatuses.some((record) => record.id === targetDeviceId)).toBe(true);
		expect(deviceStatuses.some((record) => record.id === seed.deviceId)).toBe(false);
	});

	it('rejects foreign organizationId for non-platform org admins without writing the active organization', async () => {
		await cleanupSettingsPinState();

		const targetOrganizationId = randomUUID();
		await db.insert(organization).values({
			id: targetOrganizationId,
			name: `Organización Foránea ${targetOrganizationId.slice(0, 8)}`,
			slug: `organizacion-foranea-${targetOrganizationId.slice(0, 8)}`,
			logo: null,
			metadata: null,
		});
		const orgAdminCookie = await createSeedOrganizationAdminCookie();

		const response = await requestJson('PUT', '/devices/settings-pin-config', orgAdminCookie, {
			organizationId: targetOrganizationId,
			mode: 'GLOBAL',
			globalPin: '8642',
		});

		expect(response.status).toBe(403);
		expect(await readStoredGlobalPinHash(seed.organizationId)).toBeNull();
		expect(await readStoredGlobalPinHash(targetOrganizationId)).toBeNull();
	});

	it('returns list and status payloads without PIN hashes', async () => {
		await cleanupSettingsPinState();

		const configResponse = await requestJson(
			'PUT',
			'/devices/settings-pin-config',
			adminSession.cookieHeader,
			{
				mode: 'PER_DEVICE',
				globalPin: '3333',
			},
		);
		expect(configResponse.status).toBe(200);

		const overrideResponse = await requestJson(
			'PUT',
			`/devices/${seed.deviceId}/settings-pin`,
			adminSession.cookieHeader,
			{
				pin: '4444',
			},
		);
		expect(overrideResponse.status).toBe(200);

		const listResponse = await requestJson(
			'GET',
			`/devices/settings-pin-config?organizationId=${seed.organizationId}`,
			adminSession.cookieHeader,
		);
		expect(listResponse.status).toBe(200);
		const serializedListPayload = JSON.stringify(listResponse.payload);
		expect(serializedListPayload.toLowerCase()).not.toContain('hash');
		expect(serializedListPayload).not.toContain('3333');
		expect(serializedListPayload).not.toContain('4444');

		const listData = requirePayloadData(listResponse.payload);
		expect(listData.mode).toBe('PER_DEVICE');
		expect(listData.globalPinConfigured).toBe(true);
		expect(Array.isArray(listData.devices)).toBe(true);
		const deviceStatuses = listData.devices as JsonRecord[];
		const seedDeviceStatus = deviceStatuses.find((record) => record.id === seed.deviceId);
		expect(seedDeviceStatus).toMatchObject({
			id: seed.deviceId,
			pinSource: 'DEVICE',
			pinRequired: true,
			overrideConfigured: true,
			status: 'OWN_PIN',
		});

		const statusResponse = await requestJson(
			'GET',
			`/devices/${seed.deviceId}/settings-pin-status`,
			adminSession.cookieHeader,
		);
		expect(statusResponse.status).toBe(200);
		const serializedStatusPayload = JSON.stringify(statusResponse.payload);
		expect(serializedStatusPayload.toLowerCase()).not.toContain('hash');
		expect(serializedStatusPayload).not.toContain('3333');
		expect(serializedStatusPayload).not.toContain('4444');
		expect(requirePayloadData(statusResponse.payload)).toMatchObject({
			mode: 'PER_DEVICE',
			source: 'DEVICE',
			pinRequired: true,
			globalPinConfigured: true,
			deviceOverrideConfigured: true,
		});
	});

	it('reports per-device overrides by device ID when stored organization metadata is stale', async () => {
		await cleanupSettingsPinState();

		const staleOrganizationId = randomUUID();
		await db.insert(organization).values({
			id: staleOrganizationId,
			name: `Organización obsoleta ${staleOrganizationId.slice(0, 8)}`,
			slug: `organizacion-obsoleta-${staleOrganizationId.slice(0, 8)}`,
			logo: null,
			metadata: null,
		});

		const configResponse = await requestJson(
			'PUT',
			'/devices/settings-pin-config',
			adminSession.cookieHeader,
			{
				mode: 'PER_DEVICE',
				globalPin: '3333',
			},
		);
		expect(configResponse.status).toBe(200);

		const overrideResponse = await requestJson(
			'PUT',
			`/devices/${seed.deviceId}/settings-pin`,
			adminSession.cookieHeader,
			{
				pin: '4444',
			},
		);
		expect(overrideResponse.status).toBe(200);

		await db
			.update(deviceSettingsPinOverride)
			.set({ organizationId: staleOrganizationId })
			.where(eq(deviceSettingsPinOverride.deviceId, seed.deviceId));

		const listResponse = await requestJson(
			'GET',
			`/devices/settings-pin-config?organizationId=${seed.organizationId}`,
			adminSession.cookieHeader,
		);

		expect(listResponse.status).toBe(200);
		const listData = requirePayloadData(listResponse.payload);
		const deviceStatuses = listData.devices as JsonRecord[];
		const seedDeviceStatus = deviceStatuses.find((record) => record.id === seed.deviceId);
		expect(seedDeviceStatus).toMatchObject({
			id: seed.deviceId,
			pinSource: 'DEVICE',
			pinRequired: true,
			overrideConfigured: true,
			status: 'OWN_PIN',
		});
	});

	it('rejects settings PINs that are not exactly four numeric digits', async () => {
		await cleanupSettingsPinState();

		const response = await requestJson(
			'PUT',
			'/devices/settings-pin-config',
			adminSession.cookieHeader,
			{
				mode: 'GLOBAL',
				globalPin: '12a4',
			},
		);

		expect(response.status).toBe(400);
		expect(JSON.stringify(response.payload)).toContain('VALIDATION_ERROR');
	});
});
