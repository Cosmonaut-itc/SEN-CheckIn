import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { format } from 'date-fns';
import { readFile } from 'node:fs/promises';

import { buildTestRegistrationPayload, registerTestAccounts, signIn } from './helpers/auth';

/**
 * Creates a location via the API.
 *
 * @param request - Playwright API request context
 * @param organizationName - Organization label for the location
 * @returns Created location identifier
 */
async function createLocation(
	request: APIRequestContext,
	organizationName: string,
): Promise<string> {
	const response = await request.post('/api/locations', {
		data: {
			name: `${organizationName} HQ`,
			code: `LOC-${randomUUID().slice(0, 6)}`,
			timeZone: 'America/Mexico_City',
		},
	});

	expect(response.ok()).toBeTruthy();
	const payload = await response.json();
	const locationId = payload?.data?.id as string | undefined;
	if (!locationId) {
		throw new Error('Expected location id from API response.');
	}
	return locationId;
}

/**
 * Creates a job position via the API.
 *
 * @param request - Playwright API request context
 * @returns Created job position identifier
 */
async function createJobPosition(request: APIRequestContext): Promise<string> {
	const response = await request.post('/api/job-positions', {
		data: {
			name: `Operador ${randomUUID().slice(0, 4)}`,
		},
	});

	expect(response.ok()).toBeTruthy();
	const payload = await response.json();
	const jobPositionId = payload?.data?.id as string | undefined;
	if (!jobPositionId) {
		throw new Error('Expected job position id from API response.');
	}
	return jobPositionId;
}

/**
 * Creates an employee via the API.
 *
 * @param request - Playwright API request context
 * @param args - Employee creation inputs
 * @param args.jobPositionId - Job position identifier
 * @param args.locationId - Location identifier
 * @returns Created employee identifier
 */
async function createEmployee(
	request: APIRequestContext,
	args: { jobPositionId: string; locationId: string },
): Promise<string> {
	const response = await request.post('/api/employees', {
		data: {
			code: `EMP-${randomUUID().slice(0, 6)}`,
			firstName: 'Recibo',
			lastName: 'Nomina',
			jobPositionId: args.jobPositionId,
			locationId: args.locationId,
			status: 'ACTIVE',
			hireDate: '2024-01-01',
			dailyPay: 500,
			paymentFrequency: 'WEEKLY',
			periodPay: 3500,
		},
	});

	expect(response.ok()).toBeTruthy();
	const payload = await response.json();
	const employeeId = payload?.data?.id as string | undefined;
	if (!employeeId) {
		throw new Error('Expected employee id from API response.');
	}
	return employeeId;
}

/**
 * Processes payroll for a fixed period.
 *
 * @param request - Playwright API request context
 * @param args - Payroll processing inputs
 * @param args.periodStartDateKey - Period start date key
 * @param args.periodEndDateKey - Period end date key
 * @returns Payroll run identifier
 */
async function processPayroll(
	request: APIRequestContext,
	args: { periodStartDateKey: string; periodEndDateKey: string },
): Promise<string> {
	const response = await request.post('/api/payroll/process', {
		data: {
			periodStartDateKey: args.periodStartDateKey,
			periodEndDateKey: args.periodEndDateKey,
			paymentFrequency: 'WEEKLY',
		},
	});

	expect(response.ok()).toBeTruthy();
	const payload = await response.json();
	const runId = payload?.data?.run?.id as string | undefined;
	if (!runId) {
		throw new Error('Expected payroll run id from API response.');
	}
	return runId;
}

/**
 * Confirms employee termination via the API.
 *
 * @param request - Playwright API request context
 * @param employeeId - Employee identifier
 * @returns Nothing
 */
async function terminateEmployee(
	request: APIRequestContext,
	employeeId: string,
): Promise<void> {
	const response = await request.post(`/api/employees/${employeeId}/termination`, {
		data: {
			terminationDateKey: '2026-01-15',
			terminationReason: 'voluntary_resignation',
			contractType: 'indefinite',
			unpaidDays: 0,
			otherDue: 0,
			vacationBalanceDays: 0,
			terminationNotes: 'Prueba recibo',
		},
	});

	expect(response.ok()).toBeTruthy();
}

test('downloads payroll receipts and termination receipt PDFs', async ({ page }) => {
	const registration = buildTestRegistrationPayload();
	await registerTestAccounts(page, registration);
	await signIn(page, registration.admin.email, registration.admin.password);

	const request = page.request;
	const locationId = await createLocation(request, registration.organizationName);
	const jobPositionId = await createJobPosition(request);
	const employeeId = await createEmployee(request, { jobPositionId, locationId });

	const periodStartDateKey = '2026-01-01';
	const periodEndDateKey = '2026-01-07';
	await processPayroll(request, { periodStartDateKey, periodEndDateKey });

	await page.goto('/payroll');

	const periodLabel = `${format(new Date(`${periodStartDateKey}T00:00:00`), 'dd/MM/yyyy')} - ${format(
		new Date(`${periodEndDateKey}T00:00:00`),
		'dd/MM/yyyy',
	)}`;
	const periodCell = page.getByRole('cell', { name: periodLabel }).first();
	await expect(periodCell).toBeVisible();
	const row = periodCell.locator('..');

	await row.getByRole('button', { name: 'Recibos' }).click();
	await expect(page.getByRole('heading', { name: 'Recibos de nómina' })).toBeVisible();

	const [zipDownload] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('link', { name: 'Descargar todos (ZIP)' }).click(),
	]);
	expect(zipDownload.suggestedFilename()).toMatch(/\.zip$/);
	const zipPath = await zipDownload.path();
	if (!zipPath) {
		throw new Error('Expected ZIP download path.');
	}
	const zipBuffer = await readFile(zipPath);
	expect(zipBuffer.subarray(0, 2).toString('utf8')).toBe('PK');

	const [pdfDownload] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('link', { name: 'Descargar PDF' }).first().click(),
	]);
	expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/);
	const pdfPath = await pdfDownload.path();
	if (!pdfPath) {
		throw new Error('Expected PDF download path.');
	}
	const pdfBuffer = await readFile(pdfPath);
	expect(pdfBuffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');

	await terminateEmployee(request, employeeId);

	const terminationResponse = await request.get(
		`/api/employees/${employeeId}/termination/receipt`,
	);
	expect(terminationResponse.ok()).toBeTruthy();
	const terminationBuffer = await terminationResponse.body();
	expect(terminationBuffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');
});
