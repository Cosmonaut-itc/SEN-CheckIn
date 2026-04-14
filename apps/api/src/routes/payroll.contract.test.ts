import { beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';

import { addDaysToDateKey, toDateKeyUtc } from '../utils/date-key.js';
import {
	createTestClient,
	getAdminSession,
	getTestApiKey,
	getUserSession,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

/**
 * Seeds dual payroll tax breakdown data into the first payroll run employee row.
 *
 * @param runId - Payroll run identifier
 * @returns The seeded payroll run employee identifiers
 * @throws If the payroll run has no employee rows to update
 */
async function seedDualPayrollTaxBreakdown(runId: string): Promise<{
	payrollRunEmployeeId: string;
	employeeId: string;
	restore: () => Promise<void>;
}> {
	const [{ default: db }, { payrollRunEmployee }] = await Promise.all([
		import('../db/index.js'),
		import('../db/schema.js'),
	]);

	const payrollRunEmployees = await db
		.select({
			employeeId: payrollRunEmployee.employeeId,
			id: payrollRunEmployee.id,
			taxBreakdown: payrollRunEmployee.taxBreakdown,
		})
		.from(payrollRunEmployee)
		.where(eq(payrollRunEmployee.payrollRunId, runId))
		.limit(1);

	const payrollRunEmployeeRow = payrollRunEmployees[0];
	if (!payrollRunEmployeeRow) {
		throw new Error('Expected payroll run employee rows to seed dual payroll data.');
	}
	const previousTaxBreakdown = payrollRunEmployeeRow.taxBreakdown ?? null;

	await db
		.update(payrollRunEmployee)
		.set({
			taxBreakdown: {
				grossPay: 1143.75,
				realCompensation: {
					vacationPayAmount: 12.34,
					vacationPremiumAmount: 5.67,
				},
			} as Record<string, unknown>,
		})
		.where(eq(payrollRunEmployee.id, payrollRunEmployeeRow.id));

	return {
		payrollRunEmployeeId: payrollRunEmployeeRow.id,
		employeeId: payrollRunEmployeeRow.employeeId,
		restore: async () => {
			await db
				.update(payrollRunEmployee)
				.set({
					taxBreakdown: previousTaxBreakdown as Record<string, unknown> | null,
				})
				.where(eq(payrollRunEmployee.id, payrollRunEmployeeRow.id));
		},
	};
}

/**
 * Seeds dual-payroll-only settings into a payroll run snapshot.
 *
 * @param runId - Payroll run identifier
 * @returns Restore callback for the original payroll run snapshot
 * @throws If the payroll run does not exist
 */
async function seedDualPayrollRunSettings(runId: string): Promise<{
	restore: () => Promise<void>;
}> {
	const [{ default: db }, { payrollRun }] = await Promise.all([
		import('../db/index.js'),
		import('../db/schema.js'),
	]);

	const payrollRuns = await db
		.select({
			id: payrollRun.id,
			taxSummary: payrollRun.taxSummary,
		})
		.from(payrollRun)
		.where(eq(payrollRun.id, runId))
		.limit(1);

	const payrollRunRow = payrollRuns[0];
	if (!payrollRunRow) {
		throw new Error('Expected payroll run to seed dual payroll settings.');
	}

	const previousTaxSummary = payrollRunRow.taxSummary ?? null;
	const currentTaxSummary =
		previousTaxSummary && typeof previousTaxSummary === 'object' && !Array.isArray(previousTaxSummary)
			? previousTaxSummary
			: {};
	const currentSettings =
		currentTaxSummary.settings &&
		typeof currentTaxSummary.settings === 'object' &&
		!Array.isArray(currentTaxSummary.settings)
			? (currentTaxSummary.settings as Record<string, unknown>)
			: {};

	await db
		.update(payrollRun)
		.set({
			taxSummary: {
				...currentTaxSummary,
				settings: {
					...currentSettings,
					vacationPremiumRate: 0.25,
					realVacationPremiumRate: 0.35,
					enableDualPayroll: true,
				},
			},
		})
		.where(eq(payrollRun.id, payrollRunRow.id));

	return {
		restore: async () => {
			await db
				.update(payrollRun)
				.set({
					taxSummary: previousTaxSummary as Record<string, unknown> | null,
				})
				.where(eq(payrollRun.id, payrollRunRow.id));
		},
	};
}

/**
 * Returns the payroll run tax summary settings payload.
 *
 * @param run - Payroll run payload from an API response
 * @returns Payroll run tax summary settings payload
 * @throws When the snapshot is missing
 */
function getDualPayrollSettings(run: unknown): Record<string, unknown> {
	if (!run || typeof run !== 'object') {
		throw new Error('Expected payroll run payload.');
	}

	const taxSummary = (run as { taxSummary?: Record<string, unknown> | null }).taxSummary;
	if (!taxSummary || typeof taxSummary !== 'object') {
		throw new Error('Expected payroll run tax summary payload.');
	}

	const settings = (taxSummary as { settings?: Record<string, unknown> | null }).settings;
	if (!settings || typeof settings !== 'object') {
		throw new Error('Expected payroll run tax summary settings payload.');
	}

	return settings;
}

/**
 * Asserts that a payroll run snapshot does not expose dual-payroll-only settings.
 *
 * @param run - Payroll run payload from an API response
 * @returns Nothing
 * @throws When the snapshot is missing or still exposes dual-payroll-only settings
 */
function expectDualPayrollSettingsRedacted(run: unknown): void {
	const settings = getDualPayrollSettings(run);

	expect('realVacationPremiumRate' in settings).toBe(false);
	expect('enableDualPayroll' in settings).toBe(false);
}

/**
 * Asserts that a payroll run snapshot keeps dual-payroll-only settings visible.
 *
 * @param run - Payroll run payload from an API response
 * @returns Nothing
 * @throws When the snapshot is missing or dual-payroll-only settings are absent
 */
function expectDualPayrollSettingsVisible(run: unknown): void {
	const settings = getDualPayrollSettings(run);

	expect('realVacationPremiumRate' in settings).toBe(true);
	expect('enableDualPayroll' in settings).toBe(true);
}

/**
 * Asserts that a payroll calculation snapshot does not expose dual-payroll-only settings.
 *
 * @param settingsSnapshot - Payroll calculation settings snapshot
 * @returns Nothing
 * @throws When the snapshot is missing or still exposes dual-payroll-only settings
 */
function expectDualPayrollSnapshotRedacted(settingsSnapshot: unknown): void {
	if (!settingsSnapshot || typeof settingsSnapshot !== 'object') {
		throw new Error('Expected payroll settings snapshot payload.');
	}

	expect('realVacationPremiumRate' in settingsSnapshot).toBe(false);
	expect('enableDualPayroll' in settingsSnapshot).toBe(false);
}

/**
 * Asserts that a payroll calculation snapshot keeps dual-payroll-only settings visible.
 *
 * @param settingsSnapshot - Payroll calculation settings snapshot
 * @returns Nothing
 * @throws When the snapshot is missing or dual-payroll-only settings are absent
 */
function expectDualPayrollSnapshotVisible(settingsSnapshot: unknown): void {
	if (!settingsSnapshot || typeof settingsSnapshot !== 'object') {
		throw new Error('Expected payroll settings snapshot payload.');
	}

	expect('realVacationPremiumRate' in settingsSnapshot).toBe(true);
	expect('enableDualPayroll' in settingsSnapshot).toBe(true);
}

/**
 * Creates an isolated payroll run fixture with one employee row for route tests.
 *
 * @param args - Fixture selection arguments
 * @param args.organizationId - Organization that should own the cloned run
 * @returns Isolated payroll run identifiers plus a cleanup callback
 * @throws If no payroll runs with employees exist in the test database
 */
async function createPayrollRunFixture(args: {
	organizationId: string;
}): Promise<{
	runId: string;
	employeeId: string;
	cleanup: () => Promise<void>;
}> {
	const [{ default: db }, { payrollRun, payrollRunEmployee }] = await Promise.all([
		import('../db/index.js'),
		import('../db/schema.js'),
	]);

	const sourceRows = await db
		.select({
			sourceEmployee: payrollRunEmployee,
			sourceRun: payrollRun,
		})
		.from(payrollRunEmployee)
		.innerJoin(payrollRun, eq(payrollRun.id, payrollRunEmployee.payrollRunId))
		.where(eq(payrollRun.organizationId, args.organizationId))
		.orderBy(desc(payrollRun.createdAt), desc(payrollRunEmployee.createdAt))
		.limit(1);

	const sourceRow = sourceRows[0];
	if (!sourceRow) {
		throw new Error('Expected payroll run employee rows in test database.');
	}
	const { sourceEmployee, sourceRun } = sourceRow;

	const runId = randomUUID();
	const payrollRunEmployeeId = randomUUID();
	const now = new Date();

	await db.insert(payrollRun).values({
		...sourceRun,
		id: runId,
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(payrollRunEmployee).values({
		...sourceEmployee,
		id: payrollRunEmployeeId,
		payrollRunId: runId,
		createdAt: now,
		updatedAt: now,
	});

	return {
		runId,
		employeeId: sourceEmployee.employeeId,
		cleanup: async () => {
			await db.delete(payrollRunEmployee).where(eq(payrollRunEmployee.id, payrollRunEmployeeId));
			await db.delete(payrollRun).where(eq(payrollRun.id, runId));
		},
	};
}

describe('payroll routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let memberSession: Awaited<ReturnType<typeof getUserSession>>;
	let apiKey: string;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		memberSession = await getUserSession();
		apiKey = await getTestApiKey();
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

	it('keeps dual payroll fields in payroll previews for api key callers', async () => {
		const todayKey = toDateKeyUtc(new Date());
		const startKey = addDaysToDateKey(todayKey, -14);

		const response = await client.payroll.calculate.post({
			periodStartDateKey: startKey,
			periodEndDateKey: todayKey,
			paymentFrequency: 'MONTHLY',
			$headers: { 'x-api-key': apiKey },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		const calculation = payload.data;
		if (!calculation || typeof calculation !== 'object') {
			throw new Error('Expected payroll calculation payload.');
		}
		if (Array.isArray(calculation.employees) && calculation.employees.length > 0) {
			const firstEmployee = calculation.employees[0];
			if (!firstEmployee) {
				throw new Error('Expected at least one payroll calculation employee.');
			}
			expect('fiscalDailyPay' in firstEmployee).toBe(true);
			expect('fiscalGrossPay' in firstEmployee).toBe(true);
			expect('complementPay' in firstEmployee).toBe(true);
			expect('totalRealPay' in firstEmployee).toBe(true);
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
		expectDualPayrollSettingsRedacted((result as { run?: unknown }).run);
		expectDualPayrollSnapshotRedacted(
			(
				result as {
					calculation?: { payrollSettingsSnapshot?: unknown };
				}
			).calculation?.payrollSettingsSnapshot,
		);

		for (const employee of calculationEmployees) {
			expect('fiscalDailyPay' in employee).toBe(false);
			expect('fiscalGrossPay' in employee).toBe(false);
			expect('complementPay' in employee).toBe(false);
			expect('totalRealPay' in employee).toBe(false);
		}
	});

	it('preserves processed payroll calculation payloads for api key callers', async () => {
		const todayKey = toDateKeyUtc(new Date());
		const startKey = addDaysToDateKey(todayKey, -7);

		const response = await client.payroll.process.post({
			periodStartDateKey: startKey,
			periodEndDateKey: todayKey,
			paymentFrequency: 'MONTHLY',
			$headers: { 'x-api-key': apiKey },
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
			throw new Error('Expected payroll process calculation employees array.');
		}

		if (calculationEmployees.length === 0) {
			return;
		}
		expectDualPayrollSettingsVisible((result as { run?: unknown }).run);
		expectDualPayrollSnapshotVisible(
			(
				result as {
					calculation?: { payrollSettingsSnapshot?: unknown };
				}
			).calculation?.payrollSettingsSnapshot,
		);
		const firstEmployee = calculationEmployees[0];
		if (!firstEmployee) {
			throw new Error('Expected at least one processed payroll employee.');
		}
		expect('fiscalDailyPay' in firstEmployee).toBe(true);
		expect('fiscalGrossPay' in firstEmployee).toBe(true);
		expect('complementPay' in firstEmployee).toBe(true);
		expect('totalRealPay' in firstEmployee).toBe(true);
	});

	it('lists payroll runs', async () => {
		const fixture = await createPayrollRunFixture({
			organizationId: adminSession.organizationId,
		});
		try {
			await seedDualPayrollRunSettings(fixture.runId);
			const response = await client.payroll.runs.get({
				$headers: { cookie: adminSession.cookieHeader },
				$query: { limit: 100, offset: 0 },
			});

			expect(response.status).toBe(200);
			const payload = requireResponseData(response);
			expect(Array.isArray(payload.data)).toBe(true);
			if (!Array.isArray(payload.data)) {
				throw new Error('Expected payroll run list payload.');
			}

			const run = payload.data.find(
				(entry) =>
					!!entry &&
					typeof entry === 'object' &&
					(entry as { id?: string }).id === fixture.runId,
			);
			if (!run) {
				throw new Error('Expected payroll run fixture in admin list response.');
			}
			expectDualPayrollSettingsVisible(run);
		} finally {
			await fixture.cleanup();
		}
	});

	it('redacts dual payroll settings from payroll run lists for members', async () => {
		const fixture = await createPayrollRunFixture({
			organizationId: adminSession.organizationId,
		});
		try {
			await seedDualPayrollRunSettings(fixture.runId);
			const response = await client.payroll.runs.get({
				$headers: { cookie: memberSession.cookieHeader },
				$query: { limit: 100, offset: 0 },
			});

			expect(response.status).toBe(200);
			const payload = requireResponseData(response);
			if (!Array.isArray(payload.data)) {
				throw new Error('Expected payroll run list payload.');
			}

			const run = payload.data.find(
				(entry) =>
					!!entry &&
					typeof entry === 'object' &&
					(entry as { id?: string }).id === fixture.runId,
			);
			if (!run) {
				throw new Error('Expected payroll run fixture in member list response.');
			}
			expectDualPayrollSettingsRedacted(run);
		} finally {
			await fixture.cleanup();
		}
	});

	it('returns payroll run details', async () => {
		const fixture = await createPayrollRunFixture({
			organizationId: adminSession.organizationId,
		});
		try {
			await seedDualPayrollRunSettings(fixture.runId);
			const payrollRunRoutes = requireRoute(
				client.payroll.runs[fixture.runId],
				'Payroll run route',
			);
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
			expect(run.id).toBe(fixture.runId);
			expectDualPayrollSettingsVisible(run);
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
		} finally {
			await fixture.cleanup();
		}
	});

	it('redacts dual payroll fields from payroll run details for members', async () => {
		const fixture = await createPayrollRunFixture({
			organizationId: adminSession.organizationId,
		});
		try {
			await seedDualPayrollRunSettings(fixture.runId);
			await seedDualPayrollTaxBreakdown(fixture.runId);
			const payrollRunRoutes = requireRoute(
				client.payroll.runs[fixture.runId],
				'Payroll run route',
			);
			const response = await payrollRunRoutes.get({
				$headers: { cookie: memberSession.cookieHeader },
			});

			expect(response.status).toBe(200);
			const payload = requireResponseData(response);
			const detail = payload.data;
			if (!detail || typeof detail !== 'object') {
				throw new Error('Expected payroll run detail payload.');
			}
			expectDualPayrollSettingsRedacted((detail as { run?: unknown }).run);
			const employees = (detail as { employees?: unknown[] }).employees;
			if (!employees || !Array.isArray(employees)) {
				throw new Error('Expected payroll run employees in detail response.');
			}

			const employee = employees.find(
				(entry) =>
					!!entry &&
					typeof entry === 'object' &&
					(entry as { employeeId?: string }).employeeId === fixture.employeeId,
			);
			if (!employee || typeof employee !== 'object') {
				throw new Error('Expected seeded payroll run employee in detail response.');
			}

			expect('fiscalDailyPay' in employee).toBe(false);
			expect('fiscalGrossPay' in employee).toBe(false);
			expect('complementPay' in employee).toBe(false);
			expect('totalRealPay' in employee).toBe(false);
			expect('realVacationPayAmount' in employee).toBe(false);
			expect('realVacationPremiumAmount' in employee).toBe(false);
			const taxBreakdown = (employee as {
				taxBreakdown?: Record<string, unknown> | null;
			}).taxBreakdown;
			if (!taxBreakdown || typeof taxBreakdown !== 'object') {
				throw new Error('Expected payroll run tax breakdown in member detail response.');
			}
			expect('grossPay' in taxBreakdown).toBe(true);
			expect('realCompensation' in taxBreakdown).toBe(false);
		} finally {
			await fixture.cleanup();
		}
	});

	it('keeps dual payroll fields in payroll run details for api key callers', async () => {
		const fixture = await createPayrollRunFixture({
			organizationId: adminSession.organizationId,
		});
		try {
			await seedDualPayrollRunSettings(fixture.runId);
			await seedDualPayrollTaxBreakdown(fixture.runId);
			const payrollRunRoutes = requireRoute(
				client.payroll.runs[fixture.runId],
				'Payroll run route',
			);
			const response = await payrollRunRoutes.get({
				$headers: { 'x-api-key': apiKey },
			});

			expect(response.status).toBe(200);
			const payload = requireResponseData(response);
			const detail = payload.data;
			if (!detail || typeof detail !== 'object') {
				throw new Error('Expected payroll run detail payload.');
			}
			expectDualPayrollSettingsVisible((detail as { run?: unknown }).run);
			const employees = (detail as { employees?: unknown[] }).employees;
			if (!employees || !Array.isArray(employees) || employees.length === 0) {
				throw new Error('Expected payroll run employees in detail response.');
			}

			const firstEmployee = employees.find(
				(entry) =>
					!!entry &&
					typeof entry === 'object' &&
					(entry as { employeeId?: string }).employeeId === fixture.employeeId,
			);
			if (!firstEmployee || typeof firstEmployee !== 'object') {
				throw new Error('Expected seeded payroll run employee to be an object.');
			}

			expect('fiscalDailyPay' in firstEmployee).toBe(true);
			expect('fiscalGrossPay' in firstEmployee).toBe(true);
			expect('complementPay' in firstEmployee).toBe(true);
			expect('totalRealPay' in firstEmployee).toBe(true);
			expect('realVacationPayAmount' in firstEmployee).toBe(true);
			expect('realVacationPremiumAmount' in firstEmployee).toBe(true);
			const taxBreakdown = (firstEmployee as {
				taxBreakdown?: Record<string, unknown> | null;
			}).taxBreakdown;
			if (!taxBreakdown || typeof taxBreakdown !== 'object') {
				throw new Error('Expected payroll run tax breakdown in api key detail response.');
			}
			expect('realCompensation' in taxBreakdown).toBe(true);
		} finally {
			await fixture.cleanup();
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
