import { expect, test } from '@playwright/test';

import {
	provisionResponsiveUser,
	RESPONSIVE_VIEWPORTS,
	seedResponsiveEmployeeDataViaBrowser,
	setActiveResponsiveOrganization,
} from './helpers';

test.describe.configure({ timeout: 120_000 });

test.describe('responsive shared components', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		const registration = await provisionResponsiveUser(page);
		await setActiveResponsiveOrganization(page, registration.organizationSlug);
		await seedResponsiveEmployeeDataViaBrowser(page, registration.organizationName);
	});

	test('renders ResponsivePageHeader on employees at 375px', async ({ page }) => {
		await page.goto(`/employees?responsiveTest=${Date.now()}`, {
			waitUntil: 'domcontentloaded',
			timeout: 90_000,
		});
		await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });

		await expect(page.getByTestId('responsive-page-header')).toBeVisible({ timeout: 10_000 });
		await expect(
			page.getByTestId('responsive-page-header-actions').getByRole('button').first(),
		).toHaveCSS('min-height', '44px', { timeout: 10_000 });
	});

	test('renders ResponsiveDataView cards instead of the table on employees at 375px', async ({
		page,
	}) => {
		await page.goto(`/employees?responsiveTest=${Date.now()}`, {
			waitUntil: 'domcontentloaded',
			timeout: 90_000,
		});
		await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });

		await expect(page.getByTestId('responsive-data-view-mobile')).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.getByTestId('responsive-data-card').first()).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.getByRole('table')).toHaveCount(0);
	});

	test('renders MobileDayCalendar on schedules at 375px', async ({ page }) => {
		await page.goto(`/schedules?responsiveTest=${Date.now()}`, {
			waitUntil: 'domcontentloaded',
			timeout: 90_000,
		});
		await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });

		await expect(page.getByTestId('mobile-day-calendar')).toBeVisible({ timeout: 10_000 });
		await expect(page.getByTestId('mobile-day-calendar-previous')).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.getByTestId('mobile-day-calendar-next')).toBeVisible({
			timeout: 10_000,
		});
	});
});
