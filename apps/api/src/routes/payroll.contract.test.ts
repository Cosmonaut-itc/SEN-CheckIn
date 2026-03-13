import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';

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

describe('payroll routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let memberSession: Awaited<ReturnType<typeof getUserSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		memberSession = await getUserSession();
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
		expect(Array.isArray(calculation.holidayNotices ?? [])).toBe(true);
		if (Array.isArray(calculation.employees) && calculation.employees.length > 0) {
			const firstEmployee = calculation.employees[0];
			if (!firstEmployee) {
				throw new Error('Expected at least one payroll calculation employee.');
			}
			expect('fiscalGrossPay' in firstEmployee).toBe(true);
			expect('complementPay' in firstEmployee).toBe(true);
			expect('totalRealPay' in firstEmployee).toBe(true);
		}
	});

	it('redacts dual payroll fields from payroll previews for members', async () => {
		const todayKey = toDateKeyUtc(new Date());
		const startKey = addDaysToDateKey(todayKey, -14);

		const response = await client.payroll.calculate.post({
			periodStartDateKey: startKey,
			periodEndDateKey: todayKey,
			paymentFrequency: 'MONTHLY',
			$headers: { cookie: memberSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		const calculation = payload.data;
		if (!calculation || typeof calculation !== 'object') {
			throw new Error('Expected payroll calculation payload.');
		}
		if (Array.isArray(calculation.employees)) {
			for (const employee of calculation.employees) {
				expect('fiscalDailyPay' in employee).toBe(false);
				expect('fiscalGrossPay' in employee).toBe(false);
				expect('complementPay' in employee).toBe(false);
				expect('totalRealPay' in employee).toBe(false);
			}
		}
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
		expect(
			Array.isArray((result as { calculation?: { holidayNotices?: unknown[] } }).calculation?.holidayNotices ?? []),
		).toBe(true);
		expect(Array.isArray((run as { holidayNotices?: unknown[] }).holidayNotices ?? [])).toBe(true);
		const calculationEmployees = (
			result as {
				calculation?: { employees?: Array<Record<string, unknown>> };
			}
		).calculation?.employees;
		if (Array.isArray(calculationEmployees) && calculationEmployees.length > 0) {
			const firstEmployee = calculationEmployees[0];
			if (!firstEmployee) {
				throw new Error('Expected at least one processed payroll employee.');
			}
			expect('fiscalGrossPay' in firstEmployee).toBe(true);
			expect('complementPay' in firstEmployee).toBe(true);
			expect('totalRealPay' in firstEmployee).toBe(true);
		}
	});

	it('redacts dual payroll fields from processed payroll calculations for members', async () => {
		const todayKey = toDateKeyUtc(new Date());
		const startKey = addDaysToDateKey(todayKey, -7);

		const response = await client.payroll.process.post({
			periodStartDateKey: startKey,
			periodEndDateKey: todayKey,
			paymentFrequency: 'MONTHLY',
			$headers: { cookie: memberSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		const result = payload.data;
		if (!result || typeof result !== 'object') {
			throw new Error('Expected payroll process payload.');
		}
		const calculationEmployees = (
			result as {
				calculation?: { employees?: Array<Record<string, unknown>> };
			}
		).calculation?.employees;
		if (!Array.isArray(calculationEmployees)) {
			throw new Error('Expected payroll process calculation employees.');
		}

		for (const employee of calculationEmployees) {
			expect('fiscalDailyPay' in employee).toBe(false);
			expect('fiscalGrossPay' in employee).toBe(false);
			expect('complementPay' in employee).toBe(false);
			expect('totalRealPay' in employee).toBe(false);
		}
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
		const employees = (
			detail as { employees?: Array<{ employeeName?: string; employeeCode?: string }> }
		).employees;
		if (!employees) {
			throw new Error('Expected payroll run employees in detail response.');
		}
		if (employees.length > 0) {
			for (const employee of employees) {
				expect(typeof employee.employeeName).toBe('string');
				expect(employee.employeeName?.length).toBeGreaterThan(0);
				expect(typeof employee.employeeCode).toBe('string');
				expect(employee.employeeCode?.length).toBeGreaterThan(0);
				expect('fiscalDailyPay' in employee).toBe(true);
				expect('fiscalGrossPay' in employee).toBe(true);
				expect('complementPay' in employee).toBe(true);
				expect('totalRealPay' in employee).toBe(true);
			}
		}
	});

	it('redacts dual payroll fields from payroll run details for members', async () => {
		const runId = seed.payrollRunId;
		expect(runId).toBeDefined();
		if (!runId) {
			return;
		}

		const payrollRunRoutes = requireRoute(client.payroll.runs[runId], 'Payroll run route');
		const response = await payrollRunRoutes.get({
			$headers: { cookie: memberSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		const detail = payload.data;
		if (!detail || typeof detail !== 'object') {
			throw new Error('Expected payroll run detail payload.');
		}
		const employees = (detail as { employees?: unknown[] }).employees;
		if (!employees || !Array.isArray(employees)) {
			throw new Error('Expected payroll run employees in detail response.');
		}

		for (const employee of employees) {
			if (!employee || typeof employee !== 'object') {
				throw new Error('Expected payroll run employee to be an object.');
			}

			expect('fiscalDailyPay' in employee).toBe(false);
			expect('fiscalGrossPay' in employee).toBe(false);
			expect('complementPay' in employee).toBe(false);
			expect('totalRealPay' in employee).toBe(false);
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
