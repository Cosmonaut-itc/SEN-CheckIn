import { expect, test } from '@playwright/test';

import {
	provisionResponsiveUser,
	RESPONSIVE_VIEWPORTS,
	seedResponsiveEmployeeDataViaBrowser,
	setActiveResponsiveOrganization,
} from './helpers';

/**
 * Seeds the minimum organization state required for schedules responsiveness checks.
 *
 * @param page - Playwright page used to provision browser-side data
 * @returns Promise that resolves once the organization is ready
 */
async function prepareSchedulesScenario(page: import('@playwright/test').Page): Promise<void> {
	const registration = await provisionResponsiveUser(page);
	await setActiveResponsiveOrganization(page, registration.organizationSlug);
	await seedResponsiveEmployeeDataViaBrowser(page, registration.organizationName);
}

test.describe('schedules responsiveness', () => {
	test('renders the mobile day calendar on mobile', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		await prepareSchedulesScenario(page);
		await page.goto(`/schedules?responsiveTest=${Date.now()}`);
		await page.reload();

		await expect(page.getByTestId('mobile-day-calendar')).toBeVisible();
		await expect(page.getByTestId('mobile-day-calendar-previous')).toBeVisible();
		await expect(page.getByTestId('mobile-day-calendar-next')).toBeVisible();
	});

	test('renders responsive data views for templates and exceptions on mobile', async ({
		page,
	}) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		await prepareSchedulesScenario(page);
		await page.goto(`/schedules?responsiveTest=${Date.now()}`);
		await page.reload();

		await page.getByRole('tab', { name: 'Plantillas' }).click();
		await expect(page.getByTestId('responsive-data-view-mobile')).toBeVisible();
		await expect(page.getByRole('table')).toHaveCount(0);

		await page.getByRole('tab', { name: 'Excepciones' }).click();
		await expect(page.getByTestId('responsive-data-view-mobile')).toBeVisible();
		await expect(page.getByRole('table')).toHaveCount(0);
	});

	test('keeps desktop tables for templates and exceptions', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await prepareSchedulesScenario(page);
		await page.goto(`/schedules?responsiveTest=${Date.now()}`);
		await page.reload();

		await page.getByRole('tab', { name: 'Plantillas' }).click();
		await expect(page.getByRole('table')).toBeVisible();
		await expect(page.getByTestId('responsive-data-view-mobile')).toHaveCount(0);

		await page.getByRole('tab', { name: 'Excepciones' }).click();
		await expect(page.getByRole('table')).toBeVisible();
		await expect(page.getByTestId('responsive-data-view-mobile')).toHaveCount(0);
	});
});
