import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import {
	createTestClient,
	getAdminSession,
	getSeedData,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';
import { setupRekognitionMocks } from '../test-utils/contract-mocks.js';

setupRekognitionMocks();

describe('employee routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;
	let baseEmployeeId: string;

	beforeAll(async () => {
		client = createTestClient();
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
			status: 'ACTIVE',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		const createPayload = requireResponseData(createResponse);
		const createdEmployee = createPayload.data;
		if (!createdEmployee) {
			throw new Error('Expected employee record in create response.');
		}
		if (!createdEmployee.id) {
			throw new Error('Expected employee ID in create response.');
		}
		baseEmployeeId = createdEmployee.id;
	});

	afterAll(async () => {
		if (!baseEmployeeId) {
			return;
		}

		const employeeRoutes = requireRoute(client.employees[baseEmployeeId], 'Employee route');
		await employeeRoutes.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});
	});

	it('lists employees with pagination', async () => {
		const response = await client.employees.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
	});

	it('returns employee detail with schedule', async () => {
		const employeeRoutes = requireRoute(client.employees[baseEmployeeId], 'Employee route');
		const response = await employeeRoutes.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		const employeeRecord = payload.data;
		if (!employeeRecord) {
			throw new Error('Expected employee record in detail response.');
		}
		expect(employeeRecord.id).toBe(baseEmployeeId);
		expect(Array.isArray(employeeRecord.schedule)).toBe(true);
	});

	it('updates an employee record', async () => {
		const employeeRoutes = requireRoute(client.employees[baseEmployeeId], 'Employee route');
		const response = await employeeRoutes.put({
			department: 'Operaciones',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		const employeeRecord = payload.data;
		if (!employeeRecord) {
			throw new Error('Expected employee record in update response.');
		}
		expect(employeeRecord.department).toBe('Operaciones');
	});

	it('returns insights for an employee', async () => {
		const employeeRoutes = requireRoute(client.employees[baseEmployeeId], 'Employee route');
		const insightsRoute = requireRoute(employeeRoutes.insights, 'Employee insights route');
		const response = await insightsRoute.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		const insights = payload.data;
		if (!insights) {
			throw new Error('Expected insights data for employee.');
		}
		expect(insights.employeeId).toBe(baseEmployeeId);
	});

	it('returns audit events for an employee', async () => {
		const employeeRoutes = requireRoute(client.employees[baseEmployeeId], 'Employee route');
		const auditRoute = requireRoute(employeeRoutes.audit, 'Employee audit route');
		const response = await auditRoute.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 10, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
	});

	it('manages rekognition enrollment for an employee', async () => {
		const employeeRoutes = requireRoute(client.employees[baseEmployeeId], 'Employee route');
		const enrollFaceRoute = requireRoute(
			employeeRoutes['enroll-face'],
			'Employee enroll-face route',
		);
		const createUserRoute = requireRoute(
			employeeRoutes['create-rekognition-user'],
			'Employee create-rekognition-user route',
		);
		const deleteUserRoute = requireRoute(
			employeeRoutes['rekognition-user'],
			'Employee rekognition-user route',
		);
		const noUserResponse = await enrollFaceRoute.post({
			image: Buffer.from('test').toString('base64'),
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(noUserResponse.status).toBe(400);

		const createUserResponse = await createUserRoute.post({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createUserResponse.status).toBe(200);
		const createUserPayload = requireResponseData(createUserResponse);
		expect(createUserPayload.success).toBe(true);

		const duplicateResponse = await createUserRoute.post({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(duplicateResponse.status).toBe(409);

		const enrollResponse = await enrollFaceRoute.post({
			image: Buffer.from('enroll').toString('base64'),
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(enrollResponse.status).toBe(200);
		const enrollPayload = requireResponseData(enrollResponse);
		expect(enrollPayload.success).toBe(true);

		const deleteResponse = await deleteUserRoute.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(deleteResponse.status).toBe(200);
		const deletePayload = requireResponseData(deleteResponse);
		expect(deletePayload.success).toBe(true);
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
			status: 'ACTIVE',
			$headers: { cookie: adminSession.cookieHeader },
		});

		const createPayload = requireResponseData(createResponse);
		const createdEmployee = createPayload.data;
		if (!createdEmployee) {
			throw new Error('Expected employee record in delete setup response.');
		}
		const employeeId = createdEmployee.id;
		if (!employeeId) {
			throw new Error('Expected employee ID in delete setup response.');
		}
		const employeeRoutes = requireRoute(client.employees[employeeId], 'Employee route');
		const deleteResponse = await employeeRoutes.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(deleteResponse.status).toBe(200);
	});
});
