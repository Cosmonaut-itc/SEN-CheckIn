import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { buildTestRegistrationPayload, registerTestAccounts, signIn } from './helpers/auth';

interface CreateEntityResponse {
	data?: {
		id?: string;
	};
}

interface CreateJobPositionInput {
	name: string;
}

interface UploadPreviewOptions {
	locationName: string;
	jobPositionName: string;
}

interface PlaywrightFileUpload {
	name: string;
	mimeType: string;
	buffer: Buffer;
}

const FIXTURE_PATH = path.resolve(process.cwd(), 'e2e', 'fixtures', 'NOMINA_TEST.jpg');
const STORAGE_STATE_PATH = path.resolve(process.cwd(), 'e2e', '.auth-state.json');
const AI_PROCESSING_TIMEOUT = 90_000;

mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });

if (!existsSync(STORAGE_STATE_PATH)) {
	writeFileSync(STORAGE_STATE_PATH, JSON.stringify({ cookies: [], origins: [] }));
}

/**
 * Creates a location record for E2E setup.
 *
 * @param request - Playwright API request context
 * @param organizationName - Organization display name
 * @returns Created location identifier
 * @throws Error when the API response does not include the created identifier
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
	const payload = (await response.json()) as CreateEntityResponse;
	const locationId = payload.data?.id;

	if (!locationId) {
		throw new Error('Expected location id from POST /api/locations.');
	}

	return locationId;
}

/**
 * Creates a job position record for E2E setup.
 *
 * @param request - Playwright API request context
 * @param input - Job position creation values
 * @returns Created job position identifier
 * @throws Error when the API response does not include the created identifier
 */
async function createJobPosition(
	request: APIRequestContext,
	input: CreateJobPositionInput,
): Promise<string> {
	const response = await request.post('/api/job-positions', {
		data: {
			name: input.name,
		},
	});
	expect(response.ok()).toBeTruthy();
	const payload = (await response.json()) as CreateEntityResponse;
	const jobPositionId = payload.data?.id;

	if (!jobPositionId) {
		throw new Error('Expected job position id from POST /api/job-positions.');
	}

	return jobPositionId;
}

/**
 * Returns the preview row locator collection.
 *
 * @param page - Playwright page instance
 * @returns Locator for preview rows
 */
function getPreviewRows(page: Page): Locator {
	return page.locator('table tbody tr');
}

/**
 * Selects the default location and job position in the import wizard.
 *
 * @param page - Playwright page instance
 * @param options - Display names for the default selectors
 * @returns Nothing
 */
async function selectDefaultImportValues(
	page: Page,
	options: UploadPreviewOptions,
): Promise<void> {
	await page.locator('#employee-import-default-location').click();
	await page.getByRole('option', { name: new RegExp(options.locationName, 'i') }).click();

	await page.locator('#employee-import-default-job-position').click();
	await page.getByRole('option', { name: new RegExp(options.jobPositionName, 'i') }).click();
}

/**
 * Uploads the payroll fixture and waits for the preview grid to render rows.
 *
 * @param page - Playwright page instance
 * @param options - Display names for the default selectors
 * @returns Number of preview rows rendered after analysis
 */
async function uploadAndWaitForPreview(
	page: Page,
	options: UploadPreviewOptions,
): Promise<number> {
	await page.goto('/employees/import');
	await selectDefaultImportValues(page, options);

	const fileInput = page.locator('input[type="file"]');
	await fileInput.setInputFiles(FIXTURE_PATH);
	await page.getByRole('button', { name: /analizar documentos/i }).click();

	const previewRows = getPreviewRows(page);
	await expect(previewRows.first()).toBeVisible({ timeout: AI_PROCESSING_TIMEOUT });

	return await previewRows.count();
}

/**
 * Removes every preview row that still has validation errors.
 *
 * @param page - Playwright page instance
 * @returns Number of deleted rows
 */
async function removePreviewRowsWithErrors(page: Page): Promise<number> {
	let deletedRows = 0;
	let rowsWithErrors = getPreviewRows(page).filter({ hasText: /\berror(?:es)?\b/i });

	while ((await rowsWithErrors.count()) > 0) {
		await rowsWithErrors.first().getByRole('button', { name: /eliminar fila/i }).click();
		deletedRows += 1;
		rowsWithErrors = getPreviewRows(page).filter({ hasText: /\berror(?:es)?\b/i });
	}

	return deletedRows;
}

/**
 * Creates a second upload payload from the payroll fixture using a distinct filename.
 *
 * @returns Playwright file upload payload
 */
async function buildAdditionalFixtureUpload(): Promise<PlaywrightFileUpload> {
	return {
		name: `NOMINA_TEST_APPEND_${randomUUID().slice(0, 6)}.jpg`,
		mimeType: 'image/jpeg',
		buffer: await readFile(FIXTURE_PATH),
	};
}

test.describe.serial('Employee Bulk Import', () => {
	let locationName = '';
	let jobPositionName = '';

	test.describe.configure({ timeout: 180_000 });

	test.beforeAll(async ({ browser }) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		const request = context.request;

		const registration = buildTestRegistrationPayload();
		await registerTestAccounts(page, registration);
		await signIn(page, registration.admin.email, registration.admin.password);

		await createLocation(request, registration.organizationName);
		locationName = `${registration.organizationName} HQ`;

		jobPositionName = `Operador ${randomUUID().slice(0, 4)}`;
		await createJobPosition(request, { name: jobPositionName });

		await context.storageState({ path: STORAGE_STATE_PATH });
		await context.close();
	});

	test.use({ storageState: STORAGE_STATE_PATH });

	test('uploads a payroll document, confirms import, and undoes it', async ({ page }) => {
		await page.goto('/employees/import');
		await expect(page).toHaveURL(/\/employees\/import/);

		await selectDefaultImportValues(page, { locationName, jobPositionName });

		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles(FIXTURE_PATH);
		await page.getByRole('button', { name: /analizar documentos/i }).click();

		const previewRows = getPreviewRows(page);
		await expect(previewRows.first()).toBeVisible({ timeout: AI_PROCESSING_TIMEOUT });

		const rowCount = await previewRows.count();
		expect(rowCount).toBeGreaterThan(0);
		await removePreviewRowsWithErrors(page);

		await page.getByRole('button', { name: /importar \d+ empleado/i }).click();
		await expect(
			page.getByText(/empleados? creados? correctamente/i),
		).toBeVisible({ timeout: 30_000 });

		await page.getByRole('button', { name: /deshacer importación/i }).click();
		await expect(page).toHaveURL(/\/employees/, { timeout: 15_000 });
	});

	test('rejects an invalid file type', async ({ page }) => {
		await page.goto('/employees/import');
		await selectDefaultImportValues(page, { locationName, jobPositionName });

		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles({
			name: 'invalid.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('this is not a valid payroll document'),
		});

		await expect(page.getByText(/formato soportado/i).first()).toBeVisible({
			timeout: 5_000,
		});
	});

	test('allows editing the preview before confirming', async ({ page }) => {
		const initialRowCount = await uploadAndWaitForPreview(page, {
			locationName,
			jobPositionName,
		});

		expect(initialRowCount).toBeGreaterThan(1);

		const firstRow = getPreviewRows(page).first();
		const firstNameInput = firstRow.getByRole('textbox').first();
		await firstNameInput.clear();
		await firstNameInput.fill('NombreEditado');

		const secondRow = getPreviewRows(page).nth(1);
		await secondRow.getByRole('button', { name: /eliminar fila/i }).click();

		await expect(getPreviewRows(page)).toHaveCount(initialRowCount - 1);

		const thirdRowLocationSelect = getPreviewRows(page).nth(2).getByRole('combobox').first();
		await expect(thirdRowLocationSelect).toBeVisible();
		await removePreviewRowsWithErrors(page);

		await page.getByRole('button', { name: /importar \d+ empleado/i }).click();
		await expect(
			page.getByText(/empleados? creados? correctamente/i),
		).toBeVisible({ timeout: 30_000 });

		await page.getByRole('button', { name: /deshacer importación/i }).click();
		await expect(page).toHaveURL(/\/employees/, { timeout: 15_000 });
	});

	test('appends rows when uploading additional files', async ({ page }) => {
		const initialRowCount = await uploadAndWaitForPreview(page, {
			locationName,
			jobPositionName,
		});

		expect(initialRowCount).toBeGreaterThan(0);

		await page.getByRole('button', { name: /agregar más archivos/i }).click();

		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles(await buildAdditionalFixtureUpload());

		await page.waitForFunction(
			(previousRowCount: number) => {
				return document.querySelectorAll('table tbody tr').length > previousRowCount;
			},
			initialRowCount,
			{ timeout: AI_PROCESSING_TIMEOUT },
		);

		const newRowCount = await getPreviewRows(page).count();
		expect(newRowCount).toBeGreaterThan(initialRowCount);

		await page.getByRole('button', { name: /cancelar/i }).click();
		await expect(page).toHaveURL(/\/employees/);
	});

	test('cancels import and returns to employees list', async ({ page }) => {
		await uploadAndWaitForPreview(page, {
			locationName,
			jobPositionName,
		});

		await page.getByRole('button', { name: /cancelar/i }).click();
		await expect(page).toHaveURL(/\/employees/);
	});
});
