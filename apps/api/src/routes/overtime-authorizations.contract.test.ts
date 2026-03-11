import { beforeAll, describe, expect, it } from 'bun:test';

import { addDaysToDateKey, toDateKeyUtc } from '../utils/date-key.js';
import {
	createTestClient,
	getAdminSession,
	getSeedData,
	getUserSession,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

describe('overtime authorizations routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let userSession: Awaited<ReturnType<typeof getUserSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		userSession = await getUserSession();
		seed = await getSeedData();
	});

	it('creates, lists, updates, and cancels overtime authorizations', async () => {
		const dateKey = addDaysToDateKey(
			toDateKeyUtc(new Date()),
			30 + (Math.floor(Date.now() / 1000) % 365),
		);
		const organizationRoute = requireRoute(
			client.organizations[seed.organizationId]?.['overtime-authorizations'],
			'Overtime authorization route',
		);

		const createResponse = await organizationRoute.post({
			employeeId: seed.employeeId,
			dateKey,
			authorizedHours: 2,
			notes: 'Autorización para cierre de turno',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		const createPayload = requireResponseData(createResponse);
		if (!createPayload.data) {
			throw new Error('Expected created overtime authorization payload.');
		}
		expect(createPayload.data.employeeId).toBe(seed.employeeId);
		expect(createPayload.data.authorizedHours).toBe(2);
		expect(createPayload.data.status).toBe('ACTIVE');

		const listResponse = await organizationRoute.get({
			$query: { limit: 10, offset: 0, employeeId: seed.employeeId, status: 'ACTIVE' },
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(listResponse.status).toBe(200);
		const listPayload = requireResponseData(listResponse);
		expect(Array.isArray(listPayload.data)).toBe(true);
		expect(listPayload.data.some((item) => item.id === createPayload.data?.id)).toBe(true);

		const detailRoute = requireRoute(
			organizationRoute[createPayload.data.id],
			'Single overtime authorization route',
		);

		const updateResponse = await detailRoute.put({
			authorizedHours: 3,
			notes: 'Se actualizó por carga extraordinaria',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(updateResponse.status).toBe(200);
		const updatePayload = requireResponseData(updateResponse);
		expect(updatePayload.data?.authorizedHours).toBe(3);
		expect(updatePayload.data?.notes).toBe('Se actualizó por carga extraordinaria');

		const deleteResponse = await detailRoute.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(deleteResponse.status).toBe(200);
		const deletePayload = requireResponseData(deleteResponse);
		expect(deletePayload.data?.status).toBe('CANCELLED');
	});

	it('rejects overtime authorization creation for non-admin members', async () => {
		const dateKey = addDaysToDateKey(
			toDateKeyUtc(new Date()),
			400 + (Math.floor(Date.now() / 1000) % 365),
		);
		const organizationRoute = requireRoute(
			client.organizations[seed.organizationId]?.['overtime-authorizations'],
			'Overtime authorization route',
		);

		const response = await organizationRoute.post({
			employeeId: seed.employeeId,
			dateKey,
			authorizedHours: 1.5,
			$headers: { cookie: userSession.cookieHeader },
		});

		expect(response.status).toBe(403);
		const errorPayload = requireErrorResponse(response, 'member overtime authorization create');
		expect(errorPayload.error.message).toBe(
			'Only owner/admin can manage overtime authorizations',
		);
	});

	it('rejects duplicate authorizations for the same employee and date', async () => {
		const dateKey = addDaysToDateKey(
			toDateKeyUtc(new Date()),
			800 + (Math.floor(Date.now() / 1000) % 365),
		);
		const organizationRoute = requireRoute(
			client.organizations[seed.organizationId]?.['overtime-authorizations'],
			'Overtime authorization route',
		);

		const firstResponse = await organizationRoute.post({
			employeeId: seed.employeeId,
			dateKey,
			authorizedHours: 2,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(firstResponse.status).toBe(201);

		const secondResponse = await organizationRoute.post({
			employeeId: seed.employeeId,
			dateKey,
			authorizedHours: 1,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(secondResponse.status).toBe(409);
		const errorPayload = requireErrorResponse(secondResponse, 'duplicate authorization');
		expect(errorPayload.error.message).toBe(
			'An overtime authorization already exists for this employee and date',
		);
	});

	it('rejects authorizations for past dates', async () => {
		const organizationRoute = requireRoute(
			client.organizations[seed.organizationId]?.['overtime-authorizations'],
			'Overtime authorization route',
		);

		const response = await organizationRoute.post({
			employeeId: seed.employeeId,
			dateKey: addDaysToDateKey(toDateKeyUtc(new Date()), -1),
			authorizedHours: 2,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(400);
		const errorPayload = requireErrorResponse(response, 'past date authorization');
		expect(errorPayload.error.message).toBe('dateKey must be today or a future date');
	});

	it('includes a legal warning when authorized hours exceed three in creation', async () => {
		const dateKey = addDaysToDateKey(
			toDateKeyUtc(new Date()),
			1200 + (Math.floor(Date.now() / 1000) % 365),
		);
		const organizationRoute = requireRoute(
			client.organizations[seed.organizationId]['overtime-authorizations'],
			'Overtime authorization route',
		);

		const response = await organizationRoute.post({
			employeeId: seed.employeeId,
			dateKey,
			authorizedHours: 4,
			notes: 'Cobertura extraordinaria',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(201);
		const payload = requireResponseData(response);
		expect(payload.data?.authorizedHours).toBe(4);
		expect(payload.warning).toBe(
			'Las horas autorizadas exceden el limite diario de 3 horas establecido por la LFT. Horas superiores a 3 se pagan a tasa triple.',
		);
	});
});
