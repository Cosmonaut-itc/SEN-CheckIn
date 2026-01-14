import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import {
	createTestClient,
	getAdminSession,
	getSeedData,
} from '../test-utils/contract-helpers.js';
import { setupRekognitionMocks } from '../test-utils/contract-mocks.js';

setupRekognitionMocks();

describe('employee routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;
	let baseEmployeeId: string;

	beforeAll(async () => {
		client = await createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();

		const createResponse = await client.employees.post({
			code: `EMP-${randomUUID().slice(0, 8)}`,
			firstName: 'Empleado',
			lastName: 'Contrato',
			email: `empleado.${Date.now()}@example.com`,
			phone: '+52 55 1234 5678',
			jobPositionId: seed.jobPositionId,
			locationId: seed.locationId,
			organizationId: seed.organizationId,
			scheduleTemplateId: seed.scheduleTemplateId,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		baseEmployeeId = createResponse.data?.data?.id ?? '';
	});

	afterAll(async () => {
		if (!baseEmployeeId) {
			return;
		}

		await client.employees[baseEmployeeId].delete({
			$headers: { cookie: adminSession.cookieHeader },
		});
	});

	it('lists employees with pagination', async () => {
		const response = await client.employees.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		expect(Array.isArray(response.data?.data)).toBe(true);
	});

	it('returns employee detail with schedule', async () => {
		const response = await client.employees[baseEmployeeId].get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		expect(response.data?.data?.id).toBe(baseEmployeeId);
		expect(Array.isArray(response.data?.data?.schedule)).toBe(true);
	});

	it('updates an employee record', async () => {
		const response = await client.employees[baseEmployeeId].put({
			department: 'Operaciones',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		expect(response.data?.data?.department).toBe('Operaciones');
	});

	it('returns insights for an employee', async () => {
		const response = await client.employees[baseEmployeeId].insights.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		expect(response.data?.data?.employeeId).toBe(baseEmployeeId);
	});

	it('returns audit events for an employee', async () => {
		const response = await client.employees[baseEmployeeId].audit.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 10, offset: 0 },
		});

		expect(response.status).toBe(200);
		expect(Array.isArray(response.data?.data)).toBe(true);
	});

	it('manages rekognition enrollment for an employee', async () => {
		const noUserResponse = await client.employees[baseEmployeeId]['enroll-face'].post({
			image: Buffer.from('test').toString('base64'),
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(noUserResponse.status).toBe(400);

		const createUserResponse = await client.employees[baseEmployeeId][
			'create-rekognition-user'
		].post({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createUserResponse.status).toBe(200);
		expect(createUserResponse.data?.success).toBe(true);

		const duplicateResponse = await client.employees[baseEmployeeId][
			'create-rekognition-user'
		].post({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(duplicateResponse.status).toBe(409);

		const enrollResponse = await client.employees[baseEmployeeId]['enroll-face'].post({
			image: Buffer.from('enroll').toString('base64'),
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(enrollResponse.status).toBe(200);
		expect(enrollResponse.data?.success).toBe(true);

		const deleteResponse = await client.employees[baseEmployeeId]['rekognition-user'].delete({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(deleteResponse.status).toBe(200);
		expect(deleteResponse.data?.success).toBe(true);
	});

	it('deletes an employee record', async () => {
		const createResponse = await client.employees.post({
			code: `EMP-${randomUUID().slice(0, 8)}`,
			firstName: 'Eliminar',
			lastName: 'Empleado',
			email: `delete.${Date.now()}@example.com`,
			phone: '+52 55 9999 0000',
			jobPositionId: seed.jobPositionId,
			locationId: seed.locationId,
			organizationId: seed.organizationId,
			scheduleTemplateId: seed.scheduleTemplateId,
			$headers: { cookie: adminSession.cookieHeader },
		});

		const employeeId = createResponse.data?.data?.id ?? '';
		const deleteResponse = await client.employees[employeeId].delete({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(deleteResponse.status).toBe(200);
	});
});
