import { expect, test } from '@playwright/test';

import {
	expectNoHorizontalOverflow,
	provisionResponsiveUser,
	RESPONSIVE_VIEWPORTS,
	setActiveResponsiveOrganization,
	seedResponsiveEmployeeDataViaBrowser,
} from './helpers';

test.describe.configure({ timeout: 120_000 });

/**
 * Seeds the employees page and opens the first employee detail dialog on mobile.
 *
 * @param page - Playwright page instance
 * @returns Promise that resolves once the employee detail dialog is visible
 * @throws {Error} When the seeded data is not rendered
 */
async function openResponsiveEmployeeDetail(page: import('@playwright/test').Page): Promise<void> {
	const registration = await provisionResponsiveUser(page);
	await setActiveResponsiveOrganization(page, registration.organizationSlug);
	await seedResponsiveEmployeeDataViaBrowser(page, registration.organizationName);
	await page.goto(`/employees?responsiveTest=${Date.now()}`, {
		waitUntil: 'domcontentloaded',
		timeout: 90_000,
	});
	await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });

	await expect(page.getByTestId('responsive-data-card').first()).toBeVisible();
	await page.getByTestId('responsive-data-card').first().click();
	await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('employees responsiveness', () => {
	test('renders stacked cards and full-width primary action on mobile', async ({ page }) => {
		await page.setViewportSize({
			width: RESPONSIVE_VIEWPORTS.mobile.width,
			height: 900,
		});
		const registration = await provisionResponsiveUser(page);
		await setActiveResponsiveOrganization(page, registration.organizationSlug);
		await seedResponsiveEmployeeDataViaBrowser(page, registration.organizationName);
		await page.goto(`/employees?responsiveTest=${Date.now()}`, {
			waitUntil: 'domcontentloaded',
			timeout: 90_000,
		});
		await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });

		await expectNoHorizontalOverflow(page);
		await expect(page.getByTestId('responsive-page-header')).toBeVisible();
		await expect(page.getByTestId('responsive-data-view-mobile')).toBeVisible();
		await expect(page.getByTestId('responsive-data-card').first()).toBeVisible();

		const actionsBox = await page.getByTestId('responsive-page-header-actions').boundingBox();
		const addButton = page.getByTestId('employees-add-button');
		const importButton = page.getByTestId('employees-import-button');
		const addButtonBox = await addButton.boundingBox();
		const importButtonBox = await importButton.boundingBox();

		await expect(addButton).toBeVisible();
		await expect(importButton).toBeVisible();
		await expect(page.getByTestId('employees-add-menu-button')).toBeHidden();

		expect(actionsBox).not.toBeNull();
		expect(addButtonBox).not.toBeNull();
		expect(importButtonBox).not.toBeNull();
		expect(addButtonBox?.x ?? -1).toBeGreaterThanOrEqual(0);
		expect(importButtonBox?.x ?? -1).toBeGreaterThanOrEqual(0);
		expect((addButtonBox?.x ?? 0) + (addButtonBox?.width ?? 0)).toBeLessThanOrEqual(
			(actionsBox?.x ?? 0) + (actionsBox?.width ?? 0) + 1,
		);
		expect((importButtonBox?.x ?? 0) + (importButtonBox?.width ?? 0)).toBeLessThanOrEqual(
			(actionsBox?.x ?? 0) + (actionsBox?.width ?? 0) + 1,
		);
	});

	test('keeps the table layout on desktop', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		const registration = await provisionResponsiveUser(page);
		await setActiveResponsiveOrganization(page, registration.organizationSlug);
		await seedResponsiveEmployeeDataViaBrowser(page, registration.organizationName);
		await page.goto(`/employees?responsiveTest=${Date.now()}`, {
			waitUntil: 'domcontentloaded',
			timeout: 90_000,
		});
		await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });

		await expect(page.getByRole('table')).toBeVisible();
		await expect(page.getByTestId('responsive-data-view-mobile')).toHaveCount(0);
	});

	test('keeps the employee detail modal usable on mobile', async ({ page }) => {
		await page.setViewportSize({
			width: RESPONSIVE_VIEWPORTS.mobile.width,
			height: 812,
		});

		await openResponsiveEmployeeDetail(page);

		await expect(page.getByRole('tab', { name: 'Info' })).toBeVisible();
		await expect(page.getByRole('tab', { name: 'Resumen' })).toBeVisible();
		await expect(page.getByTestId('employee-mobile-detail-panel')).toBeVisible();
		await expectNoHorizontalOverflow(page);
	});

	test('uses a five-step wizard for editing employees on mobile', async ({ page }) => {
		await page.setViewportSize({
			width: RESPONSIVE_VIEWPORTS.mobile.width,
			height: 740,
		});

		await openResponsiveEmployeeDetail(page);
		await page.getByRole('button', { name: 'Editar' }).click();
		const wizardDialog = page.getByRole('dialog', {
			name: /Agregar empleado|Editar empleado/i,
		});

		const stepLabels = [
			'Paso 1 de 5: Personal',
			'Paso 2 de 5: Laboral',
			'Paso 3 de 5: Salario',
			'Paso 4 de 5: PTU y Aguinaldo',
			'Paso 5 de 5: Horario',
		];

		await expect(wizardDialog.getByText(stepLabels[0], { exact: true })).toBeVisible();
		await expect(wizardDialog.getByTestId('employee-mobile-wizard-footer')).toBeVisible();
		await expect(wizardDialog.getByRole('button', { name: 'Siguiente' })).toBeVisible();

		for (let index = 0; index < 4; index += 1) {
			await expect(wizardDialog.getByTestId('employee-mobile-wizard-footer')).toBeVisible();
			await expect(wizardDialog.getByRole('button', { name: 'Siguiente' })).toBeVisible();
			await wizardDialog.getByRole('button', { name: 'Siguiente' }).click();
			await expect(
				wizardDialog.getByText(stepLabels[index + 1], { exact: true }),
			).toBeVisible({ timeout: 15_000 });
		}

		await expect(wizardDialog.getByRole('button', { name: 'Guardar' })).toBeVisible();
		await expectNoHorizontalOverflow(page);
	});
});
