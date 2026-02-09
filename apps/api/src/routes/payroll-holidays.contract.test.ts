import { beforeAll, describe, expect, it } from 'bun:test';

import {
	createTestClient,
	getAdminSession,
	getSeedData,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

type MockHolidayRow = {
	date: string;
	localName: string;
	name: string;
	countryCode: string;
	fixed: boolean;
	global: boolean;
	counties: string[] | null;
	launchYear: number | null;
	types: string[];
};

/**
 * Executes a callback with a mocked Nager.Date provider response.
 *
 * @param rows - Provider rows to return
 * @param callback - Callback executed while fetch is mocked
 * @returns Callback result
 */
async function withMockedHolidayProvider<T>(
	rows: MockHolidayRow[],
	callback: () => Promise<T>,
): Promise<T> {
	const originalFetch = globalThis.fetch;

	globalThis.fetch = (async (input, init) => {
		const url =
			typeof input === 'string'
				? input
				: input instanceof URL
					? input.toString()
					: input.url;

		if (url.includes('/PublicHolidays/') && url.includes('/MX')) {
			return new Response(JSON.stringify(rows), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		}

		return originalFetch(input as RequestInfo | URL, init);
	}) as typeof fetch;

	try {
		return await callback();
	} finally {
		globalThis.fetch = originalFetch;
	}
}

describe('payroll holidays routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
	});

	it('creates, updates and lists custom holiday entries', async () => {
		const createResponse = await client['payroll-settings'].holidays.custom.post({
			organizationId: seed.organizationId,
			dateKey: '2026-03-19',
			name: 'Conmemoración interna',
			kind: 'MANDATORY',
			recurrence: 'ONE_TIME',
			legalReference: 'LFT Art. 74',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(200);
		const createPayload = requireResponseData(createResponse);
		const created = createPayload.data?.[0];
		if (!created) {
			throw new Error('Expected at least one created holiday entry.');
		}
		expect(created.source).toBe('CUSTOM');
		expect(created.status).toBe('APPROVED');

		const holidayRoute = requireRoute(
			client['payroll-settings'].holidays[created.id],
			'Payroll holidays detail route',
		);
		const patchResponse = await holidayRoute.patch({
			name: 'Conmemoración interna actualizada',
			active: false,
			reason: 'Desactivación por política interna',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(patchResponse.status).toBe(200);
		const patchPayload = requireResponseData(patchResponse);
		expect(patchPayload.data?.status).toBe('DEACTIVATED');
		expect(patchPayload.data?.active).toBe(false);

		const listResponse = await client['payroll-settings'].holidays.get({
			$query: {
				organizationId: seed.organizationId,
				year: 2026,
			},
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(listResponse.status).toBe(200);
		const listPayload = requireResponseData(listResponse);
		expect(Array.isArray(listPayload.data)).toBe(true);
	});

	it('imports and exports holiday CSV data with partial validation', async () => {
		const importResponse = await client['payroll-settings'].holidays.import.csv.post({
			organizationId: seed.organizationId,
			csvContent:
				'dateKey,name,kind,recurrence,legalReference\n' +
				'2026-11-20,Día de prueba,OPTIONAL,ONE_TIME,\n' +
				'2026-11-21,,MANDATORY,ONE_TIME,\n',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(importResponse.status).toBe(200);
		const importPayload = requireResponseData(importResponse);
		expect(importPayload.data?.appliedRows).toBe(1);
		expect(importPayload.data?.rejectedRows).toBe(1);
		expect(importPayload.data?.errors?.length).toBeGreaterThan(0);

		const exportResponse = await client['payroll-settings'].holidays.export.csv.get({
			$query: {
				organizationId: seed.organizationId,
				year: 2026,
			},
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(exportResponse.status).toBe(200);
		const exportPayload = requireResponseData(exportResponse);
		expect(exportPayload.data?.fileName).toContain('feriados');
		expect(exportPayload.data?.csvContent).toContain('dateKey,name,kind,source,status');
	});

	it('syncs provider holidays and supports approve/reject workflow', async () => {
		const providerRows: MockHolidayRow[] = [
			{
				date: '2026-01-01',
				localName: 'Año Nuevo',
				name: 'New Year',
				countryCode: 'MX',
				fixed: true,
				global: true,
				counties: null,
				launchYear: null,
				types: ['Public'],
			},
			{
				date: '2026-05-10',
				localName: 'Feriado local',
				name: 'Regional Holiday',
				countryCode: 'MX',
				fixed: true,
				global: false,
				counties: ['MX-SON'],
				launchYear: null,
				types: ['Public'],
			},
		];

		const syncResponse = await withMockedHolidayProvider(providerRows, () =>
			client['payroll-settings'].holidays.sync.post({
				organizationId: seed.organizationId,
				year: 2026,
				$headers: { cookie: adminSession.cookieHeader },
			}),
		);

		expect(syncResponse.status).toBe(200);
		const syncPayload = requireResponseData(syncResponse);
		const runId = syncPayload.data?.run?.id;
		if (!runId) {
			throw new Error('Expected sync run id.');
		}
		expect(Number(syncPayload.data?.pendingCount ?? 0)).toBeGreaterThan(0);

		const syncRunRoute = client['payroll-settings'].holidays.sync[runId];
		if (!syncRunRoute) {
			throw new Error('Expected sync run route for approval.');
		}
		const approveRoute = requireRoute(
			syncRunRoute.approve,
			'Payroll holiday sync approve route',
		);
		const approveResponse = await approveRoute.post({
			reason: 'Aprobado por administración',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(approveResponse.status).toBe(200);
		const approvePayload = requireResponseData(approveResponse);
		expect(Number(approvePayload.data?.approvedCount ?? 0)).toBeGreaterThan(0);

		const secondSyncResponse = await withMockedHolidayProvider(providerRows, () =>
			client['payroll-settings'].holidays.sync.post({
				organizationId: seed.organizationId,
				year: 2026,
				$headers: { cookie: adminSession.cookieHeader },
			}),
		);

		expect(secondSyncResponse.status).toBe(200);
		const secondSyncPayload = requireResponseData(secondSyncResponse);
		const secondRunId = secondSyncPayload.data?.run?.id;
		if (!secondRunId) {
			throw new Error('Expected second sync run id.');
		}

		const secondSyncRunRoute = client['payroll-settings'].holidays.sync[secondRunId];
		if (!secondSyncRunRoute) {
			throw new Error('Expected sync run route for rejection.');
		}
		const rejectRoute = requireRoute(
			secondSyncRunRoute.reject,
			'Payroll holiday sync reject route',
		);
		const rejectResponse = await rejectRoute.post({
			reason: 'Rechazado por revisión interna',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(rejectResponse.status).toBe(200);
		const rejectPayload = requireResponseData(rejectResponse);
		expect(Number(rejectPayload.data?.rejectedCount ?? 0)).toBeGreaterThan(0);

		const statusResponse = await client['payroll-settings'].holidays.sync.status.get({
			$query: { organizationId: seed.organizationId },
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(statusResponse.status).toBe(200);
		const statusPayload = requireResponseData(statusResponse);
		expect(statusPayload.data?.lastRun).toBeDefined();
	});
});
