import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

import { addDaysToDateKey, toDateKeyUtc } from '../utils/date-key.js';
import {
	createTestClient,
	getAdminSession,
	getSeedData,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

describe('payroll routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
	});

	it('calculates payroll for a period', async () => {
		const todayKey = toDateKeyUtc(new Date());
		const startKey = addDaysToDateKey(todayKey, -14);

		const response = await client.payroll.calculate.post({
			periodStartDateKey: startKey,
			periodEndDateKey: todayKey,
			paymentFrequency: 'MONTHLY',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		const calculation = payload.data;
		if (!calculation) {
			throw new Error('Expected payroll calculation payload.');
		}
		expect(calculation.employees).toBeDefined();
	});

	it('processes payroll runs', async () => {
		const todayKey = toDateKeyUtc(new Date());
		const startKey = addDaysToDateKey(todayKey, -7);

		const response = await client.payroll.process.post({
			periodStartDateKey: startKey,
			periodEndDateKey: todayKey,
			paymentFrequency: 'MONTHLY',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		const result = payload.data;
		if (!result || typeof result !== 'object') {
			throw new Error('Expected payroll process payload.');
		}
		const run = (result as { run?: { organizationId?: string } }).run;
		if (!run) {
			throw new Error('Expected payroll run in process response.');
		}
		expect(run.organizationId).toBeDefined();
	});

	it('lists payroll runs', async () => {
		const response = await client.payroll.runs.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
	});

	it('returns payroll run details', async () => {
		const runId = seed.payrollRunId;
		expect(runId).toBeDefined();
		if (!runId) {
			return;
		}

		const payrollRunRoutes = requireRoute(client.payroll.runs[runId], 'Payroll run route');
		const response = await payrollRunRoutes.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		const detail = payload.data;
		if (!detail || typeof detail !== 'object') {
			throw new Error('Expected payroll run detail payload.');
		}
		const run = (detail as { run?: { id?: string } }).run;
		if (!run) {
			throw new Error('Expected payroll run in detail response.');
		}
		expect(run.id).toBe(runId);
		const employees = (detail as { employees?: Array<{ employeeName?: string; employeeCode?: string }> })
			.employees;
		if (!employees) {
			throw new Error('Expected payroll run employees in detail response.');
		}
		if (employees.length > 0) {
			for (const employee of employees) {
				expect(typeof employee.employeeName).toBe('string');
				expect(employee.employeeName?.length).toBeGreaterThan(0);
				expect(typeof employee.employeeCode).toBe('string');
				expect(employee.employeeCode?.length).toBeGreaterThan(0);
			}
		}
	});

	it('returns 404 for unknown payroll runs', async () => {
		const payrollRunRoutes = requireRoute(
			client.payroll.runs[randomUUID()],
			'Payroll run route',
		);
		const response = await payrollRunRoutes.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(404);
		const errorPayload = requireErrorResponse(response, 'unknown payroll run');
		expect(errorPayload.error.message).toBe('Payroll run not found');
		expect(errorPayload.error.code).toBe('NOT_FOUND');
	});
});
