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
 * Marks an aguinaldo run as processed directly in the test database.
 *
 * @param runId - Aguinaldo run identifier
 * @returns Nothing
 */
async function markAguinaldoRunProcessed(runId: string): Promise<void> {
	const [{ default: db }, { aguinaldoRun }] = await Promise.all([
		import('../db/index.js'),
		import('../db/schema.js'),
	]);
	await db
		.update(aguinaldoRun)
		.set({ status: 'PROCESSED', processedAt: new Date() })
		.where(eq(aguinaldoRun.id, runId));
}

/**
 * Marks all aguinaldo run employees as ineligible and attaches an error warning.
 *
 * @param runId - Aguinaldo run identifier
 * @returns Nothing
 */
async function markAguinaldoRunEmployeesIneligibleWithError(runId: string): Promise<void> {
	const [{ default: db }, { aguinaldoRunEmployee }] = await Promise.all([
		import('../db/index.js'),
		import('../db/schema.js'),
	]);
	await db
		.update(aguinaldoRunEmployee)
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
		.where(eq(aguinaldoRunEmployee.aguinaldoRunId, runId));
}

/**
 * Overrides aguinaldo run total amount directly in the test database.
 *
 * @param runId - Aguinaldo run identifier
 * @param totalAmount - Total amount value
 * @returns Nothing
 */
async function setAguinaldoRunTotalAmount(runId: string, totalAmount: number): Promise<void> {
	const [{ default: db }, { aguinaldoRun }] = await Promise.all([
		import('../db/index.js'),
		import('../db/schema.js'),
	]);
	await db
		.update(aguinaldoRun)
		.set({ totalAmount: totalAmount.toFixed(2) })
		.where(eq(aguinaldoRun.id, runId));
}

/**
 * Seeds processed payroll runs that cross the calendar-year boundary.
 *
 * @param organizationId - Organization identifier
 * @param employeeId - Employee identifier
 * @returns Nothing
 */
async function seedCrossYearPayrollRuns(
	organizationId: string,
	employeeId: string,
): Promise<void> {
	const [{ default: db }, { payrollRun, payrollRunEmployee }] = await Promise.all([
		import('../db/index.js'),
		import('../db/schema.js'),
	]);

	const crossRunId = crypto.randomUUID();
	await db.insert(payrollRun).values({
		id: crossRunId,
		organizationId,
		periodStart: new Date('2097-12-26T00:00:00.000Z'),
		periodEnd: new Date('2098-01-02T23:59:59.000Z'),
		paymentFrequency: 'WEEKLY',
		status: 'PROCESSED',
		totalAmount: '800.00',
		employeeCount: 1,
		processedAt: new Date('2098-01-03T00:00:00.000Z'),
	});
	await db.insert(payrollRunEmployee).values({
		payrollRunId: crossRunId,
		employeeId,
		totalPay: '800.00',
		taxBreakdown: { grossPay: 800 },
		periodStart: new Date('2097-12-26T00:00:00.000Z'),
		periodEnd: new Date('2098-01-02T23:59:59.000Z'),
	});

	const inYearRunId = crypto.randomUUID();
	await db.insert(payrollRun).values({
		id: inYearRunId,
		organizationId,
		periodStart: new Date('2098-06-01T00:00:00.000Z'),
		periodEnd: new Date('2098-06-01T23:59:59.000Z'),
		paymentFrequency: 'WEEKLY',
		status: 'PROCESSED',
		totalAmount: '1000.00',
		employeeCount: 1,
		processedAt: new Date('2098-06-02T00:00:00.000Z'),
	});
	await db.insert(payrollRunEmployee).values({
		payrollRunId: inYearRunId,
		employeeId,
		totalPay: '1000.00',
		taxBreakdown: { grossPay: 1000 },
		periodStart: new Date('2098-06-01T00:00:00.000Z'),
		periodEnd: new Date('2098-06-01T23:59:59.000Z'),
	});
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
		weekStartDay: 1,
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

	it('uses daily pay fallback when no payroll average exists for the year', async () => {
		const response = await client.aguinaldo.calculate.post({
			calendarYear: 2099,
			paymentDateKey: '2099-12-15',
			smgDailyOverride: 300,
			employeeOverrides: [
				{
					employeeId: seed.employeeId,
					daysCounted: 365,
				},
			],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		const data = payload.data as
			| {
					employees?: Array<{
						employeeId?: string;
						dailySalaryBase?: number;
					}>;
			  }
			| undefined;
		const employeeRow = data?.employees?.find((row) => row.employeeId === seed.employeeId);
		if (!employeeRow) {
			throw new Error('Expected aguinaldo employee row for fallback validation.');
		}
		expect(Number(employeeRow.dailySalaryBase ?? 0)).toBeGreaterThan(0);
	});

	it('prorates cross-year payroll runs when building aguinaldo daily base', async () => {
		await seedCrossYearPayrollRuns(seed.organizationId, seed.employeeId);

		const response = await client.aguinaldo.calculate.post({
			calendarYear: 2098,
			paymentDateKey: '2098-12-15',
			smgDailyOverride: 300,
			employeeOverrides: [
				{
					employeeId: seed.employeeId,
					daysCounted: 365,
				},
			],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		const data = payload.data as
			| {
					employees?: Array<{
						employeeId?: string;
						dailySalaryBase?: number;
					}>;
			  }
			| undefined;
		const employeeRow = data?.employees?.find((row) => row.employeeId === seed.employeeId);
		if (!employeeRow) {
			throw new Error('Expected aguinaldo employee row for cross-year proration validation.');
		}
		expect(Number(employeeRow.dailySalaryBase ?? 0)).toBeCloseTo(400, 2);
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
		const updatedRun = (updatePayload.data as unknown as { run?: { paymentDate?: Date | string } })
			.run;
		if (!updatedRun) {
			throw new Error('Expected aguinaldo run in update response.');
		}
		expect(updatedRun.paymentDate).toBeDefined();
	});

	it('blocks moving an aguinaldo draft into an already processed calendar year', async () => {
		const processedCreateResponse = await client.aguinaldo.runs.post({
			calendarYear: 2031,
			paymentDateKey: '2031-12-15',
			employeeOverrides: [buildAguinaldoOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(processedCreateResponse.status).toBe(200);
		const processedPayload = requireResponseData(processedCreateResponse);
		const processedRun = (processedPayload.data as { run?: { id?: string } }).run;
		if (!processedRun?.id) {
			throw new Error('Expected processed aguinaldo run id in create response.');
		}
		await markAguinaldoRunProcessed(processedRun.id);

		const draftCreateResponse = await client.aguinaldo.runs.post({
			calendarYear: 2032,
			paymentDateKey: '2032-12-15',
			employeeOverrides: [buildAguinaldoOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(draftCreateResponse.status).toBe(200);
		const draftPayload = requireResponseData(draftCreateResponse);
		const draftRun = (draftPayload.data as { run?: { id?: string } }).run;
		if (!draftRun?.id) {
			throw new Error('Expected draft aguinaldo run id in create response.');
		}
		const draftRunRoutes = requireRoute(client.aguinaldo.runs[draftRun.id], 'Aguinaldo run route');
		const updateResponse = await draftRunRoutes.put({
			calendarYear: 2031,
			employeeOverrides: [buildAguinaldoOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(updateResponse.status).toBe(409);
		const errorPayload = requireErrorResponse(
			updateResponse,
			'aguinaldo update processed year conflict',
		);
		expect(errorPayload.error.message).toBe(
			'Aguinaldo run already processed for this calendar year',
		);
		expect(errorPayload.error.code).toBe('CONFLICT');
	});

	it('processes aguinaldo runs and returns details + CSV', async () => {
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
		const headers = (
			csvResponse as {
				headers?: Headers | Record<string, string>;
			}
		).headers;
		const contentType = headers instanceof Headers
			? headers.get('content-type') ?? ''
			: headers?.['content-type'] ?? headers?.['Content-Type'] ?? '';
		expect(contentType).toContain('text/csv');
	});

	it('processes aguinaldo when only ineligible employees have error warnings', async () => {
		const createResponse = await client.aguinaldo.runs.post({
			calendarYear: 2044,
			paymentDateKey: '2044-12-15',
			employeeOverrides: [buildAguinaldoOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(200);
		const createPayload = requireResponseData(createResponse);
		const run = (createPayload.data as { run?: { id?: string } }).run;
		if (!run?.id) {
			throw new Error('Expected aguinaldo run id in create response.');
		}
		await markAguinaldoRunEmployeesIneligibleWithError(run.id);
		await setAguinaldoRunTotalAmount(run.id, 100);

		const runRoutes = requireRoute(client.aguinaldo.runs[run.id], 'Aguinaldo run route');
		const processRoute = requireRoute(runRoutes.process, 'Aguinaldo process route');
		const processResponse = await processRoute.post({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(processResponse.status).toBe(200);
	});

	it('blocks processing aguinaldo when another run is already processed for the same calendar year', async () => {
		const firstDraftResponse = await client.aguinaldo.runs.post({
			calendarYear: 2033,
			paymentDateKey: '2033-12-15',
			employeeOverrides: [buildAguinaldoOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(firstDraftResponse.status).toBe(200);
		const firstDraftPayload = requireResponseData(firstDraftResponse);
		const firstDraftRun = (firstDraftPayload.data as { run?: { id?: string } }).run;
		if (!firstDraftRun?.id) {
			throw new Error('Expected first draft aguinaldo run id in create response.');
		}

		const secondDraftResponse = await client.aguinaldo.runs.post({
			calendarYear: 2033,
			paymentDateKey: '2033-12-20',
			employeeOverrides: [buildAguinaldoOverride(seed.employeeId)],
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(secondDraftResponse.status).toBe(200);
		const secondDraftPayload = requireResponseData(secondDraftResponse);
		const secondDraftRun = (secondDraftPayload.data as { run?: { id?: string } }).run;
		if (!secondDraftRun?.id) {
			throw new Error('Expected second draft aguinaldo run id in create response.');
		}
		await markAguinaldoRunProcessed(firstDraftRun.id);

		const secondRunRoutes = requireRoute(
			client.aguinaldo.runs[secondDraftRun.id],
			'Aguinaldo run route',
		);
		const secondProcessRoute = requireRoute(secondRunRoutes.process, 'Aguinaldo process route');
		const secondProcessResponse = await secondProcessRoute.post({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(secondProcessResponse.status).toBe(409);
		const errorPayload = requireErrorResponse(
			secondProcessResponse,
			'aguinaldo process processed year conflict',
		);
		expect(errorPayload.error.message).toBe(
			'Aguinaldo run already processed for this calendar year',
		);
		expect(errorPayload.error.code).toBe('CONFLICT');
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
			calendarYear: 2027,
			paymentDateKey: '2027-12-15',
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
