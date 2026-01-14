import { beforeAll, describe, expect, it } from 'bun:test';

import { addDaysToDateKey, toDateKeyUtc } from '../utils/date-key.js';
import { createTestClient, getAdminSession, getSeedData } from '../test-utils/contract-helpers.js';

describe('payroll routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = await createTestClient();
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
		expect(response.data?.data?.employees).toBeDefined();
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
		expect(response.data?.data?.run?.organizationId).toBeDefined();
	});

	it('lists payroll runs', async () => {
		const response = await client.payroll.runs.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		expect(Array.isArray(response.data?.data)).toBe(true);
	});

	it('returns payroll run details', async () => {
		const runId = seed.payrollRunId;
		expect(runId).toBeDefined();
		if (!runId) {
			return;
		}

		const response = await client.payroll.runs[runId].get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		expect(response.data?.data?.run?.id).toBe(runId);
	});
});
