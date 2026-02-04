import { beforeAll, describe, expect, it } from 'bun:test';

import {
	createTestClient,
	getAdminSession,
	getSeedData,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

type AguinaldoRunDetail = {
	run?: { id?: string; status?: string; calendarYear?: number };
	employees?: Array<{ employeeId?: string }>;
};

/**
 * Builds an aguinaldo override payload for a given employee.
 *
 * @param employeeId - Employee identifier
 * @returns Aguinaldo override payload
 */
function buildAguinaldoOverride(employeeId: string): {
	employeeId: string;
	daysCounted: number;
	dailySalaryBase: number;
	aguinaldoDaysPolicy: number;
} {
	return {
		employeeId,
		daysCounted: 365,
		dailySalaryBase: 500,
		aguinaldoDaysPolicy: 15,
	};
}

/**
 * Updates aguinaldo settings for the active organization.
 *
 * @param client - API test client
 * @param cookieHeader - Auth cookie header
 * @param enabled - Whether Aguinaldo is enabled
 * @returns Nothing
 */
async function updateAguinaldoSettings(
	client: Awaited<ReturnType<typeof createTestClient>>,
	cookieHeader: string,
	enabled: boolean,
): Promise<void> {
	const response = await client['payroll-settings'].put({
		aguinaldoEnabled: enabled,
		$headers: { cookie: cookieHeader },
	});

	expect(response.status).toBe(200);
}

describe('aguinaldo routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
		await updateAguinaldoSettings(client, adminSession.cookieHeader, true);
	});

	it('calculates aguinaldo preview', async () => {
		const response = await client.aguinaldo.calculate.post({
			calendarYear: 2026,
			paymentDateKey: '2026-12-15',
			employeeOverrides: [buildAguinaldoOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		const data = payload.data as { run?: { calendarYear?: number } } | undefined;
		if (!data?.run) {
			throw new Error('Expected aguinaldo calculation payload.');
		}
		expect(data.run.calendarYear).toBe(2026);
	});

	it('creates and updates aguinaldo runs', async () => {
		const createResponse = await client.aguinaldo.runs.post({
			calendarYear: 2025,
			paymentDateKey: '2025-12-15',
			employeeOverrides: [buildAguinaldoOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(200);
		const createPayload = requireResponseData(createResponse);
		const run = (createPayload.data as { run?: { id?: string; status?: string } }).run;
		if (!run?.id) {
			throw new Error('Expected aguinaldo run id in create response.');
		}
		expect(run.status).toBe('DRAFT');

		const runRoutes = requireRoute(client.aguinaldo.runs[run.id], 'Aguinaldo run route');
		const updateResponse = await runRoutes.put({
			paymentDateKey: '2025-12-20',
			employeeOverrides: [buildAguinaldoOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(updateResponse.status).toBe(200);
		const updatePayload = requireResponseData(updateResponse);
		const updatedRun = (updatePayload.data as { run?: { paymentDate?: string } }).run;
		if (!updatedRun) {
			throw new Error('Expected aguinaldo run in update response.');
		}
		expect(updatedRun.paymentDate).toBeDefined();
	});

	it('processes aguinaldo runs and returns details + CSV', async () => {
		const createResponse = await client.aguinaldo.runs.post({
			calendarYear: 2026,
			paymentDateKey: '2026-12-15',
			employeeOverrides: [buildAguinaldoOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(200);
		const createPayload = requireResponseData(createResponse);
		const run = (createPayload.data as { run?: { id?: string } }).run;
		if (!run?.id) {
			throw new Error('Expected aguinaldo run id in create response.');
		}

		const runRoutes = requireRoute(client.aguinaldo.runs[run.id], 'Aguinaldo run route');
		const processRoute = requireRoute(runRoutes.process, 'Aguinaldo process route');
		const processResponse = await processRoute.post({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(processResponse.status).toBe(200);

		const detailResponse = await runRoutes.get({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(detailResponse.status).toBe(200);
		const detailPayload = requireResponseData(detailResponse);
		const detail = detailPayload.data as AguinaldoRunDetail | undefined;
		if (!detail?.run?.id) {
			throw new Error('Expected aguinaldo run detail payload.');
		}
		expect(detail.run.status).toBe('PROCESSED');

		const csvRoute = requireRoute(runRoutes.csv, 'Aguinaldo run CSV route');
		const csvResponse = await csvRoute.get({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(csvResponse.status).toBe(200);
		const contentType = csvResponse.headers.get('content-type');
		expect(contentType).toContain('text/csv');
	});

	it('lists aguinaldo runs', async () => {
		const response = await client.aguinaldo.runs.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
	});

	it('cancels aguinaldo runs', async () => {
		const createResponse = await client.aguinaldo.runs.post({
			calendarYear: 2025,
			paymentDateKey: '2025-12-15',
			employeeOverrides: [buildAguinaldoOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(200);
		const createPayload = requireResponseData(createResponse);
		const run = (createPayload.data as { run?: { id?: string } }).run;
		if (!run?.id) {
			throw new Error('Expected aguinaldo run id in create response.');
		}

		const runRoutes = requireRoute(client.aguinaldo.runs[run.id], 'Aguinaldo run route');
		const cancelRoute = requireRoute(runRoutes.cancel, 'Aguinaldo cancel route');
		const cancelResponse = await cancelRoute.post({
			reason: 'Cancelación de prueba',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(cancelResponse.status).toBe(200);
		const cancelPayload = requireResponseData(cancelResponse);
		expect(cancelPayload.data?.success).toBe(true);
	});

	it('blocks aguinaldo when disabled', async () => {
		await updateAguinaldoSettings(client, adminSession.cookieHeader, false);

		const response = await client.aguinaldo.calculate.post({
			calendarYear: 2026,
			paymentDateKey: '2026-12-15',
			employeeOverrides: [buildAguinaldoOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(409);
		const errorPayload = requireErrorResponse(response, 'aguinaldo disabled');
		expect(errorPayload.error.message).toBe('Aguinaldo is disabled for this organization');
		expect(errorPayload.error.code).toBe('CONFLICT');

		await updateAguinaldoSettings(client, adminSession.cookieHeader, true);
	});
});
