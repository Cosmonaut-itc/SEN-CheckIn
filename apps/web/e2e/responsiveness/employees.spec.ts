import { expect, test } from '@playwright/test';

import {
	expectNoHorizontalOverflow,
	provisionResponsiveUser,
	RESPONSIVE_VIEWPORTS,
	setActiveResponsiveOrganization,
	seedResponsiveEmployeeDataViaBrowser,
} from './helpers';

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
	await page.goto(`/employees?responsiveTest=${Date.now()}`);
	await page.reload();

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
		await page.goto(`/employees?responsiveTest=${Date.now()}`);
		await page.reload();

		await expectNoHorizontalOverflow(page);
		await expect(page.getByTestId('responsive-page-header')).toBeVisible();
		await expect(page.getByTestId('responsive-data-view-mobile')).toBeVisible();
		await expect(page.getByTestId('responsive-data-card').first()).toBeVisible();

		const actionsBox = await page
			.getByTestId('responsive-page-header-actions')
			.boundingBox();
		const addButtonBox = await page.getByTestId('employees-add-button').boundingBox();

		expect(actionsBox).not.toBeNull();
		expect(addButtonBox).not.toBeNull();
		expect((addButtonBox?.width ?? 0) + 8).toBeGreaterThanOrEqual(actionsBox?.width ?? 0);
	});

	test('keeps the table layout on desktop', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		const registration = await provisionResponsiveUser(page);
		await setActiveResponsiveOrganization(page, registration.organizationSlug);
		await seedResponsiveEmployeeDataViaBrowser(page, registration.organizationName);
		await page.goto(`/employees?responsiveTest=${Date.now()}`);
		await page.reload();

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
			height: 812,
		});

		await openResponsiveEmployeeDetail(page);
		await page.getByRole('button', { name: 'Editar' }).click();

		await expect(page.getByText('Paso 1 de 5: Personal')).toBeVisible();

		for (let index = 0; index < 4; index += 1) {
			await page.getByRole('button', { name: 'Siguiente' }).click();
		}

		await expect(page.getByText('Paso 5 de 5: Horario')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Guardar' })).toBeVisible();
		await expectNoHorizontalOverflow(page);
	});
});
