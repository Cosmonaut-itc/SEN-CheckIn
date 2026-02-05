import { beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import {
	createTestClient,
	getAdminSession,
	getSeedData,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

type PtuRunDetail = {
	run?: { id?: string; status?: string; fiscalYear?: number };
	employees?: Array<{ employeeId?: string }>;
};

/**
 * Builds a PTU override payload for a given employee.
 *
 * @param employeeId - Employee identifier
 * @returns PTU override payload
 */
function buildPtuOverride(employeeId: string): {
	employeeId: string;
	daysCounted: number;
	dailyQuota: number;
	annualSalaryBase: number;
} {
	return {
		employeeId,
		daysCounted: 200,
		dailyQuota: 500,
		annualSalaryBase: 100000,
	};
}

/**
 * Marks a PTU run as processed directly in the test database.
 *
 * @param runId - PTU run identifier
 * @returns Nothing
 */
async function markPtuRunProcessed(runId: string): Promise<void> {
	const [{ default: db }, { ptuRun }] = await Promise.all([
		import('../db/index.js'),
		import('../db/schema.js'),
	]);
	await db
		.update(ptuRun)
		.set({ status: 'PROCESSED', processedAt: new Date() })
		.where(eq(ptuRun.id, runId));
}

/**
 * Marks all PTU run employees as ineligible and attaches an error warning.
 *
 * @param runId - PTU run identifier
 * @returns Nothing
 */
async function markPtuRunEmployeesIneligibleWithError(runId: string): Promise<void> {
	const [{ default: db }, { ptuRunEmployee }] = await Promise.all([
		import('../db/index.js'),
		import('../db/schema.js'),
	]);
	await db
		.update(ptuRunEmployee)
		.set({
			isEligible: false,
			warnings: [
				{
					type: 'TEST_INELIGIBLE_ERROR',
					message: 'Error de prueba en empleado ineligible',
					severity: 'error',
				},
			] as unknown as Record<string, unknown>[],
		})
		.where(eq(ptuRunEmployee.ptuRunId, runId));
}

/**
 * Overrides PTU run total amount directly in the test database.
 *
 * @param runId - PTU run identifier
 * @param totalAmount - Total amount value
 * @returns Nothing
 */
async function setPtuRunTotalAmount(runId: string, totalAmount: number): Promise<void> {
	const [{ default: db }, { ptuRun }] = await Promise.all([
		import('../db/index.js'),
		import('../db/schema.js'),
	]);
	await db
		.update(ptuRun)
		.set({ totalAmount: totalAmount.toFixed(2) })
		.where(eq(ptuRun.id, runId));
}

/**
 * Updates PTU settings for the active organization.
 *
 * @param client - API test client
 * @param cookieHeader - Auth cookie header
 * @param enabled - Whether PTU is enabled
 * @param isExempt - Whether the org is exempt from PTU
 * @returns Nothing
 */
async function updatePtuSettings(
	client: Awaited<ReturnType<typeof createTestClient>>,
	cookieHeader: string,
	enabled: boolean,
	isExempt = false,
): Promise<void> {
	const response = await client['payroll-settings'].put({
		weekStartDay: 1,
		ptuEnabled: enabled,
		ptuMode: 'DEFAULT_RULES',
		ptuIsExempt: isExempt,
		ptuExemptReason: isExempt ? 'Exento por prueba' : null,
		$headers: { cookie: cookieHeader },
	});

	expect(response.status).toBe(200);
}

describe('ptu routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
		await updatePtuSettings(client, adminSession.cookieHeader, true, false);
	});

	it('calculates PTU preview', async () => {
		const response = await client.ptu.calculate.post({
			fiscalYear: 2026,
			paymentDateKey: '2026-05-15',
			taxableIncome: 100000,
			ptuPercentage: 0.1,
			employeeOverrides: [buildPtuOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		const data = payload.data as { run?: { fiscalYear?: number } } | undefined;
		if (!data?.run) {
			throw new Error('Expected PTU calculation payload.');
		}
		expect(data.run.fiscalYear).toBe(2026);
	});

	it('creates and updates PTU runs', async () => {
		const createResponse = await client.ptu.runs.post({
			fiscalYear: 2025,
			paymentDateKey: '2025-05-15',
			taxableIncome: 120000,
			ptuPercentage: 0.1,
			employeeOverrides: [buildPtuOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(200);
		const createPayload = requireResponseData(createResponse);
		const run = (createPayload.data as { run?: { id?: string; status?: string } }).run;
		if (!run?.id) {
			throw new Error('Expected PTU run id in create response.');
		}
		expect(run.status).toBe('DRAFT');

		const runRoutes = requireRoute(client.ptu.runs[run.id], 'PTU run route');
		const updateResponse = await runRoutes.put({
			taxableIncome: 150000,
			ptuPercentage: 0.12,
			employeeOverrides: [buildPtuOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(updateResponse.status).toBe(200);
		const updatePayload = requireResponseData(updateResponse);
		const updatedRun = (updatePayload.data as { run?: { taxableIncome?: number } }).run;
		if (!updatedRun) {
			throw new Error('Expected PTU run in update response.');
		}
		expect(updatedRun.taxableIncome).toBe(150000);
	});

	it('blocks moving a PTU draft into an already processed fiscal year', async () => {
		const processedCreateResponse = await client.ptu.runs.post({
			fiscalYear: 2031,
			paymentDateKey: '2031-05-15',
			taxableIncome: 125000,
			ptuPercentage: 0.1,
			employeeOverrides: [buildPtuOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(processedCreateResponse.status).toBe(200);
		const processedPayload = requireResponseData(processedCreateResponse);
		const processedRun = (processedPayload.data as { run?: { id?: string } }).run;
		if (!processedRun?.id) {
			throw new Error('Expected processed PTU run id in create response.');
		}
		await markPtuRunProcessed(processedRun.id);

		const draftCreateResponse = await client.ptu.runs.post({
			fiscalYear: 2032,
			paymentDateKey: '2032-05-15',
			taxableIncome: 125000,
			ptuPercentage: 0.1,
			employeeOverrides: [buildPtuOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(draftCreateResponse.status).toBe(200);
		const draftPayload = requireResponseData(draftCreateResponse);
		const draftRun = (draftPayload.data as { run?: { id?: string } }).run;
		if (!draftRun?.id) {
			throw new Error('Expected draft PTU run id in create response.');
		}
		const draftRunRoutes = requireRoute(client.ptu.runs[draftRun.id], 'PTU run route');
		const updateResponse = await draftRunRoutes.put({
			fiscalYear: 2031,
			employeeOverrides: [buildPtuOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(updateResponse.status).toBe(409);
		const errorPayload = requireErrorResponse(updateResponse, 'ptu update processed year conflict');
		expect(errorPayload.error.message).toBe('PTU run already processed for this fiscal year');
		expect(errorPayload.error.code).toBe('CONFLICT');
	});

	it('processes PTU runs and returns details + CSV', async () => {
		const createResponse = await client.ptu.runs.post({
			fiscalYear: 2026,
			paymentDateKey: '2026-05-15',
			taxableIncome: 200000,
			ptuPercentage: 0.1,
			employeeOverrides: [buildPtuOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(200);
		const createPayload = requireResponseData(createResponse);
		const run = (createPayload.data as { run?: { id?: string } }).run;
		if (!run?.id) {
			throw new Error('Expected PTU run id in create response.');
		}

		const runRoutes = requireRoute(client.ptu.runs[run.id], 'PTU run route');
		const processRoute = requireRoute(runRoutes.process, 'PTU process route');
		const processResponse = await processRoute.post({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(processResponse.status).toBe(200);

		const detailResponse = await runRoutes.get({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(detailResponse.status).toBe(200);
		const detailPayload = requireResponseData(detailResponse);
		const detail = detailPayload.data as PtuRunDetail | undefined;
		if (!detail?.run?.id) {
			throw new Error('Expected PTU run detail payload.');
		}
		expect(detail.run.status).toBe('PROCESSED');

		const csvRoute = requireRoute(runRoutes.csv, 'PTU run CSV route');
		const csvResponse = await csvRoute.get({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(csvResponse.status).toBe(200);
		const headers = (csvResponse as { headers?: Record<string, string> }).headers;
		const contentType = headers?.['content-type'] ?? headers?.['Content-Type'] ?? '';
		expect(contentType).toContain('text/csv');
	});

	it('processes PTU when only ineligible employees have error warnings', async () => {
		const createResponse = await client.ptu.runs.post({
			fiscalYear: 2044,
			paymentDateKey: '2044-05-15',
			taxableIncome: 210000,
			ptuPercentage: 0.1,
			employeeOverrides: [buildPtuOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(200);
		const createPayload = requireResponseData(createResponse);
		const run = (createPayload.data as { run?: { id?: string } }).run;
		if (!run?.id) {
			throw new Error('Expected PTU run id in create response.');
		}
		await markPtuRunEmployeesIneligibleWithError(run.id);
		await setPtuRunTotalAmount(run.id, 100);

		const runRoutes = requireRoute(client.ptu.runs[run.id], 'PTU run route');
		const processRoute = requireRoute(runRoutes.process, 'PTU process route');
		const processResponse = await processRoute.post({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(processResponse.status).toBe(200);
	});

	it('blocks processing PTU when another run is already processed for the same fiscal year', async () => {
		const firstDraftResponse = await client.ptu.runs.post({
			fiscalYear: 2033,
			paymentDateKey: '2033-05-15',
			taxableIncome: 175000,
			ptuPercentage: 0.1,
			employeeOverrides: [buildPtuOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(firstDraftResponse.status).toBe(200);
		const firstDraftPayload = requireResponseData(firstDraftResponse);
		const firstDraftRun = (firstDraftPayload.data as { run?: { id?: string } }).run;
		if (!firstDraftRun?.id) {
			throw new Error('Expected first draft PTU run id in create response.');
		}

		const secondDraftResponse = await client.ptu.runs.post({
			fiscalYear: 2033,
			paymentDateKey: '2033-05-20',
			taxableIncome: 180000,
			ptuPercentage: 0.1,
			employeeOverrides: [buildPtuOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(secondDraftResponse.status).toBe(200);
		const secondDraftPayload = requireResponseData(secondDraftResponse);
		const secondDraftRun = (secondDraftPayload.data as { run?: { id?: string } }).run;
		if (!secondDraftRun?.id) {
			throw new Error('Expected second draft PTU run id in create response.');
		}
		await markPtuRunProcessed(firstDraftRun.id);

		const secondRunRoutes = requireRoute(client.ptu.runs[secondDraftRun.id], 'PTU run route');
		const secondProcessRoute = requireRoute(secondRunRoutes.process, 'PTU process route');
		const secondProcessResponse = await secondProcessRoute.post({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(secondProcessResponse.status).toBe(409);
		const errorPayload = requireErrorResponse(
			secondProcessResponse,
			'ptu process processed year conflict',
		);
		expect(errorPayload.error.message).toBe('PTU run already processed for this fiscal year');
		expect(errorPayload.error.code).toBe('CONFLICT');
	});

	it('lists PTU runs', async () => {
		const response = await client.ptu.runs.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
	});

	it('cancels PTU runs', async () => {
		const createResponse = await client.ptu.runs.post({
			fiscalYear: 2025,
			paymentDateKey: '2025-12-15',
			taxableIncome: 90000,
			ptuPercentage: 0.1,
			employeeOverrides: [buildPtuOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(200);
		const createPayload = requireResponseData(createResponse);
		const run = (createPayload.data as { run?: { id?: string } }).run;
		if (!run?.id) {
			throw new Error('Expected PTU run id in create response.');
		}

		const runRoutes = requireRoute(client.ptu.runs[run.id], 'PTU run route');
		const cancelRoute = requireRoute(runRoutes.cancel, 'PTU cancel route');
		const cancelResponse = await cancelRoute.post({
			reason: 'Cancelación de prueba',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(cancelResponse.status).toBe(200);
		const cancelPayload = requireResponseData(cancelResponse);
		expect(cancelPayload.data?.success).toBe(true);
	});

	it('blocks PTU when disabled', async () => {
		await updatePtuSettings(client, adminSession.cookieHeader, false, false);

		const response = await client.ptu.calculate.post({
			fiscalYear: 2026,
			paymentDateKey: '2026-05-15',
			taxableIncome: 100000,
			ptuPercentage: 0.1,
			employeeOverrides: [buildPtuOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(409);
		const errorPayload = requireErrorResponse(response, 'ptu disabled');
		expect(errorPayload.error.message).toBe('PTU is disabled for this organization');
		expect(errorPayload.error.code).toBe('CONFLICT');

		await updatePtuSettings(client, adminSession.cookieHeader, true, false);
	});
});
