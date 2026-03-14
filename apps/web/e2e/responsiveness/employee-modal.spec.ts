import { expect, test } from '@playwright/test';

import {
	provisionResponsiveUser,
	RESPONSIVE_VIEWPORTS,
	seedResponsiveEmployeeDataViaBrowser,
	setActiveResponsiveOrganization,
} from './helpers';

/**
 * Opens the first seeded employee detail dialog from the employees page.
 *
 * @param page - Playwright page instance
 * @returns Promise that resolves after the dialog becomes visible
 * @throws {Error} When the seeded employee card is not rendered
 */
async function openEmployeeDetail(page: import('@playwright/test').Page): Promise<void> {
	const registration = await provisionResponsiveUser(page);
	await setActiveResponsiveOrganization(page, registration.organizationSlug);
	await seedResponsiveEmployeeDataViaBrowser(page, registration.organizationName);
	await page.goto(`/employees?responsiveModalTest=${Date.now()}`);
	await page.reload();

	await expect(page.getByTestId('responsive-data-card').first()).toBeVisible();
	await page.getByTestId('responsive-data-card').first().click();
	await expect(page.getByRole('dialog')).toBeVisible();
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
		await page.getByRole('button', { name: 'Editar' }).click();

		await expect(page.getByText('Paso 1 de 5: Personal')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Siguiente' })).toBeVisible();
	});

	test('keeps the desktop modal header and more menu unchanged', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });

		await openEmployeeDetail(page);

		await expect(page.getByRole('tab', { name: 'Info' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Más' })).toBeVisible();
		await expect(page.getByText('Ubicación')).toBeVisible();
		await expect(page.getByText('Puesto')).toBeVisible();
		await expect(page.getByText('Fecha de ingreso')).toBeVisible();
		await expect(page.getByText('Tipo de turno')).toBeVisible();
		await expect(page.getByText('Correo electrónico')).toBeVisible();
		await expect(page.getByText('Teléfono')).toBeVisible();
		await expect(page.getByText('NSS')).toBeVisible();
		await expect(page.getByText('RFC')).toBeVisible();
		await expect(page.getByText('Departamento')).toBeVisible();
		await expect(page.getByText('Usuario')).toBeVisible();
	});
});
