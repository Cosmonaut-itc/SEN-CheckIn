import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

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
 * @param args.firstName - Employee first name
 * @param args.lastName - Employee last name
 * @returns Created employee identifier
 */
async function createEmployee(
	request: APIRequestContext,
	args: { jobPositionId: string; locationId: string; firstName: string; lastName: string },
): Promise<string> {
	const response = await request.post('/api/employees', {
		data: {
			code: `EMP-${randomUUID().slice(0, 6)}`,
			firstName: args.firstName,
			lastName: args.lastName,
			jobPositionId: args.jobPositionId,
			locationId: args.locationId,
			status: 'ACTIVE',
			hireDate: '2024-01-01',
			dailyPay: 500,
			paymentFrequency: 'WEEKLY',
			periodPay: 3500,
			rfc: 'PTU010101ABC',
			nss: '12345678901',
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
 * Updates payroll settings to enable PTU/Aguinaldo.
 *
 * @param request - Playwright API request context
 * @returns Nothing
 */
async function enableExtraPayments(request: APIRequestContext): Promise<void> {
	const response = await request.put('/api/payroll-settings', {
		data: {
			ptuEnabled: true,
			ptuMode: 'DEFAULT_RULES',
			ptuIsExempt: false,
			aguinaldoEnabled: true,
		},
	});

	expect(response.ok()).toBeTruthy();
}

/**
 * Creates a PTU run via the API.
 *
 * @param request - Playwright API request context
 * @param args - Run creation inputs
 * @param args.fiscalYear - Fiscal year
 * @param args.paymentDateKey - Payment date key
 * @param args.taxableIncome - Taxable income
 * @param args.employeeOverrides - Employee overrides payload
 * @returns Created PTU run identifier
 */
async function createPtuRun(
	request: APIRequestContext,
	args: {
		fiscalYear: number;
		paymentDateKey: string;
		taxableIncome: number;
		employeeOverrides: Array<{ employeeId: string; daysCounted: number; dailyQuota: number }>;
	},
): Promise<string> {
	const response = await request.post('/api/ptu/runs', {
		data: {
			fiscalYear: args.fiscalYear,
			paymentDateKey: args.paymentDateKey,
			taxableIncome: args.taxableIncome,
			ptuPercentage: 0.1,
			employeeOverrides: args.employeeOverrides,
		},
	});

	expect(response.ok()).toBeTruthy();
	const payload = await response.json();
	const runId = payload?.data?.run?.id as string | undefined;
	if (!runId) {
		throw new Error('Expected PTU run id from API response.');
	}
	return runId;
}

/**
 * Processes a PTU run via the API.
 *
 * @param request - Playwright API request context
 * @param runId - PTU run identifier
 * @returns Nothing
 */
async function processPtuRun(request: APIRequestContext, runId: string): Promise<void> {
	const response = await request.post(`/api/ptu/runs/${runId}/process`, {
		data: {},
	});

	expect(response.ok()).toBeTruthy();
}

/**
 * Creates an Aguinaldo run via the API.
 *
 * @param request - Playwright API request context
 * @param args - Run creation inputs
 * @param args.calendarYear - Calendar year
 * @param args.paymentDateKey - Payment date key
 * @param args.employeeOverrides - Employee overrides payload
 * @returns Created aguinaldo run identifier
 */
async function createAguinaldoRun(
	request: APIRequestContext,
	args: {
		calendarYear: number;
		paymentDateKey: string;
		employeeOverrides: Array<{
			employeeId: string;
			daysCounted: number;
			dailySalaryBase: number;
			aguinaldoDaysPolicy: number;
		}>;
	},
): Promise<string> {
	const response = await request.post('/api/aguinaldo/runs', {
		data: {
			calendarYear: args.calendarYear,
			paymentDateKey: args.paymentDateKey,
			employeeOverrides: args.employeeOverrides,
		},
	});

	expect(response.ok()).toBeTruthy();
	const payload = await response.json();
	const runId = payload?.data?.run?.id as string | undefined;
	if (!runId) {
		throw new Error('Expected aguinaldo run id from API response.');
	}
	return runId;
}

/**
 * Processes an Aguinaldo run via the API.
 *
 * @param request - Playwright API request context
 * @param runId - Aguinaldo run identifier
 * @returns Nothing
 */
async function processAguinaldoRun(request: APIRequestContext, runId: string): Promise<void> {
	const response = await request.post(`/api/aguinaldo/runs/${runId}/process`, {
		data: {},
	});

	expect(response.ok()).toBeTruthy();
}

test('downloads PTU and Aguinaldo receipts + CSV exports', async ({ page }) => {
	const registration = buildTestRegistrationPayload();
	await registerTestAccounts(page, registration);
	await signIn(page, registration.admin.email, registration.admin.password);

	const request = page.request;
	await enableExtraPayments(request);

	const locationId = await createLocation(request, registration.organizationName);
	const jobPositionId = await createJobPosition(request);
	const employeeId = await createEmployee(request, {
		jobPositionId,
		locationId,
		firstName: 'PTU',
		lastName: 'Empleado',
	});
	const employeeIdTwo = await createEmployee(request, {
		jobPositionId,
		locationId,
		firstName: 'Aguinaldo',
		lastName: 'Empleado',
	});

	const ptuRunId = await createPtuRun(request, {
		fiscalYear: 2026,
		paymentDateKey: '2026-05-15',
		taxableIncome: 200000,
		employeeOverrides: [
			{ employeeId, daysCounted: 200, dailyQuota: 500 },
			{ employeeId: employeeIdTwo, daysCounted: 180, dailyQuota: 450 },
		],
	});
	await processPtuRun(request, ptuRunId);

	const aguinaldoRunId = await createAguinaldoRun(request, {
		calendarYear: 2026,
		paymentDateKey: '2026-12-15',
		employeeOverrides: [
			{
				employeeId,
				daysCounted: 365,
				dailySalaryBase: 500,
				aguinaldoDaysPolicy: 15,
			},
			{
				employeeId: employeeIdTwo,
				daysCounted: 365,
				dailySalaryBase: 450,
				aguinaldoDaysPolicy: 15,
			},
		],
	});
	await processAguinaldoRun(request, aguinaldoRunId);

	await page.goto('/payroll');

	await page.getByRole('tab', { name: 'PTU' }).click();
	const ptuRow = page.getByRole('row', { name: /2026/ }).first();
	await expect(ptuRow).toBeVisible();

	const [ptuCsvDownload] = await Promise.all([
		page.waitForEvent('download'),
		ptuRow.getByRole('link', { name: 'CSV' }).click(),
	]);
	expect(ptuCsvDownload.suggestedFilename()).toMatch(/\.csv$/);
	const ptuCsvPath = await ptuCsvDownload.path();
	if (!ptuCsvPath) {
		throw new Error('Expected PTU CSV download path.');
	}
	const ptuCsvContent = await readFile(ptuCsvPath, 'utf8');
	expect(ptuCsvContent.split('\n')[0]).toContain('employeeId');

	await ptuRow.getByRole('button', { name: 'Recibos' }).click();
	await expect(page.getByRole('heading', { name: 'Recibos de PTU' })).toBeVisible();

	const [ptuZipDownload] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('link', { name: 'Descargar ZIP' }).click(),
	]);
	expect(ptuZipDownload.suggestedFilename()).toMatch(/\.zip$/);
	const ptuZipPath = await ptuZipDownload.path();
	if (!ptuZipPath) {
		throw new Error('Expected PTU ZIP download path.');
	}
	const ptuZipBuffer = await readFile(ptuZipPath);
	expect(ptuZipBuffer.subarray(0, 2).toString('utf8')).toBe('PK');
	const ptuZip = await JSZip.loadAsync(ptuZipBuffer);
	const ptuZipEntries = Object.values(ptuZip.files).filter(
		(entry) => !entry.dir && entry.name.endsWith('.pdf'),
	);
	expect(ptuZipEntries.length).toBeGreaterThan(0);

	const [ptuPdfDownload] = await Promise.all([
		page.waitForEvent('download'),
		page
			.getByRole('link', { name: /^Descargar$/ })
			.first()
			.click(),
	]);
	expect(ptuPdfDownload.suggestedFilename()).toMatch(/\.pdf$/);
	const ptuPdfPath = await ptuPdfDownload.path();
	if (!ptuPdfPath) {
		throw new Error('Expected PTU PDF download path.');
	}
	const ptuPdfBuffer = await readFile(ptuPdfPath);
	expect(ptuPdfBuffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');

	await page.keyboard.press('Escape');

	await page.getByRole('tab', { name: 'Aguinaldo' }).click();
	const aguinaldoRow = page.getByRole('row', { name: /2026/ }).first();
	await expect(aguinaldoRow).toBeVisible();

	const [aguinaldoCsvDownload] = await Promise.all([
		page.waitForEvent('download'),
		aguinaldoRow.getByRole('link', { name: 'CSV' }).click(),
	]);
	expect(aguinaldoCsvDownload.suggestedFilename()).toMatch(/\.csv$/);
	const aguinaldoCsvPath = await aguinaldoCsvDownload.path();
	if (!aguinaldoCsvPath) {
		throw new Error('Expected Aguinaldo CSV download path.');
	}
	const aguinaldoCsvContent = await readFile(aguinaldoCsvPath, 'utf8');
	expect(aguinaldoCsvContent.split('\n')[0]).toContain('employeeId');

	await aguinaldoRow.getByRole('button', { name: 'Recibos' }).click();
	await expect(page.getByRole('heading', { name: 'Recibos de Aguinaldo' })).toBeVisible();

	const [aguinaldoZipDownload] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('link', { name: 'Descargar ZIP' }).click(),
	]);
	expect(aguinaldoZipDownload.suggestedFilename()).toMatch(/\.zip$/);
	const aguinaldoZipPath = await aguinaldoZipDownload.path();
	if (!aguinaldoZipPath) {
		throw new Error('Expected Aguinaldo ZIP download path.');
	}
	const aguinaldoZipBuffer = await readFile(aguinaldoZipPath);
	expect(aguinaldoZipBuffer.subarray(0, 2).toString('utf8')).toBe('PK');
	const aguinaldoZip = await JSZip.loadAsync(aguinaldoZipBuffer);
	const aguinaldoZipEntries = Object.values(aguinaldoZip.files).filter(
		(entry) => !entry.dir && entry.name.endsWith('.pdf'),
	);
	expect(aguinaldoZipEntries.length).toBeGreaterThan(0);

	const [aguinaldoPdfDownload] = await Promise.all([
		page.waitForEvent('download'),
		page
			.getByRole('link', { name: /^Descargar$/ })
			.first()
			.click(),
	]);
	expect(aguinaldoPdfDownload.suggestedFilename()).toMatch(/\.pdf$/);
	const aguinaldoPdfPath = await aguinaldoPdfDownload.path();
	if (!aguinaldoPdfPath) {
		throw new Error('Expected Aguinaldo PDF download path.');
	}
	const aguinaldoPdfBuffer = await readFile(aguinaldoPdfPath);
	expect(aguinaldoPdfBuffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');
});
