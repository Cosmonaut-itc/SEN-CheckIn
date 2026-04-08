import { expect, test } from '@playwright/test';

import {
	expectNoHorizontalOverflow,
	provisionResponsiveUser,
	RESPONSIVE_VIEWPORTS,
	type ResponsiveEmployeeSeed,
	seedResponsiveEmployeeDataViaBrowser,
	setActiveResponsiveOrganization,
} from './helpers';

test.describe.configure({ timeout: 120_000 });

/**
 * Opens the first seeded employee detail dialog from the employees page.
 *
 * @param page - Playwright page instance
 * @returns Promise that resolves after the dialog becomes visible
 * @throws {Error} When the seeded employee card is not rendered
 */
async function openSeededEmployeeDetail(page: import('@playwright/test').Page): Promise<void> {
	await page.goto(`/employees?responsiveModalTest=${Date.now()}`, {
		waitUntil: 'domcontentloaded',
		timeout: 90_000,
	});

	const viewportWidth = page.viewportSize()?.width ?? RESPONSIVE_VIEWPORTS.mobile.width;
	if (viewportWidth <= RESPONSIVE_VIEWPORTS.mobile.width) {
		const mobileCard = page.getByTestId('responsive-data-card').first();
		await expect(mobileCard).toBeVisible();
		await mobileCard.click();
		await expect(page.getByTestId('employee-mobile-detail-tabs')).toBeVisible();
	} else {
		const desktopRow = page.locator('tbody tr').first();
		await expect(desktopRow).toBeVisible();
		await desktopRow.locator('td').nth(1).click();
	}
	await expect(page.getByRole('dialog')).toBeVisible();
}

/**
 * Provisions a fresh organization, seeds one employee, and opens its detail dialog.
 *
 * @param page - Playwright page instance
 * @returns Seed identifiers for the created responsive employee records
 * @throws {Error} When the organization or seeded employee cannot be opened
 */
async function openEmployeeDetail(
	page: import('@playwright/test').Page,
): Promise<ResponsiveEmployeeSeed> {
	const registration = await provisionResponsiveUser(page);
	await setActiveResponsiveOrganization(page, registration.organizationSlug);
	const seed = await seedResponsiveEmployeeDataViaBrowser(page, registration.organizationName);
	await openSeededEmployeeDetail(page);

	return seed;
}

/**
 * Creates a vacation request for the seeded responsive employee.
 *
 * @param page - Authenticated Playwright page instance
 * @param employeeId - Employee identifier that owns the request
 * @returns Promise that resolves after the request is created
 * @throws {Error} When the vacation request cannot be created
 */
async function seedVacationRequest(
	page: import('@playwright/test').Page,
	employeeId: string,
): Promise<void> {
	await page.evaluate(async (targetEmployeeId) => {
		const response = await fetch('/api/vacations/requests', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				employeeId: targetEmployeeId,
				startDateKey: '2026-12-15',
				endDateKey: '2026-12-16',
				status: 'SUBMITTED',
				requestedNotes: 'Cobertura responsive modal',
			}),
		});

		if (!response.ok) {
			throw new Error(
				`Failed to create vacation request (${response.status}) at ${response.url}: ${await response.text()}`,
			);
		}
	}, employeeId);
}

/**
 * Processes one payroll run so the employee detail dialog has payroll history to render.
 *
 * @param request - Playwright API request context
 * @param periodStartDateKey - Period start date key
 * @param periodEndDateKey - Period end date key
 * @returns Promise that resolves after the payroll run is processed
 * @throws {Error} When the payroll run request fails
 */
async function processResponsivePayrollRun(
	request: import('@playwright/test').APIRequestContext,
	periodStartDateKey: string,
	periodEndDateKey: string,
): Promise<void> {
	const response = await request.post('/api/payroll/process', {
		data: {
			periodStartDateKey,
			periodEndDateKey,
			paymentFrequency: 'WEEKLY',
		},
	});

	expect(response.ok()).toBeTruthy();
}

/**
 * Opens a tab from the horizontal mobile employee detail tab strip.
 *
 * @param page - Playwright page instance
 * @param tabName - Exact tab label to activate
 * @returns Promise that resolves after the tab click is issued
 * @throws {Error} When the requested tab cannot be found in the mobile strip
 */
async function openMobileDetailTab(
	page: import('@playwright/test').Page,
	tabName: string,
): Promise<void> {
	const tabStrip = page.getByTestId('employee-mobile-detail-tabs');
	await expect(tabStrip).toBeVisible();
	await tabStrip.evaluate((element, expectedTabName) => {
		const targetTab = Array.from(element.querySelectorAll<HTMLElement>('[role="tab"]')).find(
			(candidate) => candidate.textContent?.trim() === expectedTabName,
		);
		if (!targetTab) {
			throw new Error(`Could not find mobile detail tab "${expectedTabName}".`);
		}
		targetTab.scrollIntoView({ block: 'nearest', inline: 'center' });
	}, tabName);

	const targetTab = tabStrip.getByRole('tab', { name: tabName, exact: true });
	await targetTab.click();
	await expect(targetTab).toHaveAttribute('data-state', 'active');
}

test.describe('employee modal responsiveness', () => {
	test('shows the compact mobile header and horizontal tabs without the more menu', async ({
		page,
	}) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);

		await openEmployeeDetail(page);

		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(page.getByRole('tab', { name: 'Info' })).toHaveAttribute(
			'data-state',
			'active',
		);
		await expect(page.getByRole('tab', { name: 'Resumen' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Más' })).toHaveCount(0);
	});

	test('opens the five-step mobile wizard when editing', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);

		await openEmployeeDetail(page);
		await page.getByRole('dialog').getByRole('button', { name: 'Editar' }).click();

		await expect(page.getByText('Paso 1 de 5: Personal')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Siguiente' })).toBeVisible();
	});

	test('renders vacation cards without horizontal overflow on mobile', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		const registration = await provisionResponsiveUser(page);
		await setActiveResponsiveOrganization(page, registration.organizationSlug);
		const { employeeId } = await seedResponsiveEmployeeDataViaBrowser(
			page,
			registration.organizationName,
		);
		await seedVacationRequest(page, employeeId);
		await openSeededEmployeeDetail(page);

		await openMobileDetailTab(page, 'Vacaciones');

		await expect(page.getByText('Balance de vacaciones')).toBeVisible();
		await expect(page.getByText(/^Tipo$/)).toBeVisible();
		await expectNoHorizontalOverflow(page);
	});

	test('renders payroll cards without horizontal overflow on mobile', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		const registration = await provisionResponsiveUser(page);
		await setActiveResponsiveOrganization(page, registration.organizationSlug);
		await seedResponsiveEmployeeDataViaBrowser(page, registration.organizationName);
		await processResponsivePayrollRun(page.request, '2026-01-01', '2026-01-07');
		await openSeededEmployeeDetail(page);

		await openMobileDetailTab(page, 'Nomina');

		await expect(page.getByText(/^Frecuencia$/)).toBeVisible();
		await expectNoHorizontalOverflow(page);
	});

	test('shows discard confirmation when closing wizard with unsaved changes', async ({
		page,
	}) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);

		await openEmployeeDetail(page);
		await page.getByRole('dialog').getByRole('button', { name: 'Editar' }).click();

		const wizardDialog = page.getByRole('dialog', {
			name: /Agregar empleado|Editar empleado/i,
		});
		await expect(wizardDialog.getByText('Paso 1 de 5: Personal')).toBeVisible();

		const editedName = `Empleado editado ${Date.now()}`;
		const firstNameField = wizardDialog.getByRole('textbox', { name: 'Nombre' });
		await firstNameField.fill(editedName);
		await expect(firstNameField).toHaveValue(editedName);
		await firstNameField.press('Tab');
		await wizardDialog.getByRole('button', { name: 'Cerrar' }).click();

		await expect(page.getByRole('alertdialog').getByText('¿Descartar cambios?')).toBeVisible();
		await page.getByRole('button', { name: 'Cancelar' }).click();
		await expect(wizardDialog.getByText('Paso 1 de 5: Personal')).toBeVisible();

		await wizardDialog.getByRole('button', { name: 'Cerrar' }).click();
		await expect(page.getByRole('alertdialog').getByText('¿Descartar cambios?')).toBeVisible();
		await page.getByRole('button', { name: 'Descartar' }).click();

		await expect(wizardDialog.getByText('Paso 1 de 5: Personal')).toHaveCount(0);
		await expect(page.getByTestId('responsive-data-card').first()).toBeVisible();
	});

	test('keeps the desktop modal header and more menu unchanged', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });

		await openEmployeeDetail(page);

		const dialog = page.getByRole('dialog');
		await expect(page.getByRole('tab', { name: 'Info' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Más' })).toBeVisible();
		await expect(dialog.getByText(/^Ubicación$/)).toBeVisible();
		await expect(dialog.getByText(/^Puesto$/)).toBeVisible();
		await expect(dialog.getByText(/^Fecha de ingreso$/)).toBeVisible();
		await expect(dialog.getByText(/^Tipo de turno$/)).toBeVisible();
		await expect(dialog.getByText(/^Correo electrónico$/)).toBeVisible();
		await expect(dialog.getByText(/^Teléfono$/)).toBeVisible();
		await expect(dialog.getByText(/^NSS$/)).toBeVisible();
		await expect(dialog.getByText(/^RFC$/)).toBeVisible();
		await expect(dialog.getByText(/^Departamento$/)).toBeVisible();
		await expect(dialog.getByText(/^Usuario$/)).toBeVisible();
	});
});
