import { expect, test } from '@playwright/test';

import { provisionResponsiveUser, RESPONSIVE_VIEWPORTS } from './helpers';

test.describe('responsive shared components', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		await provisionResponsiveUser(page);
	});

	test('renders ResponsivePageHeader on employees at 375px', async ({ page }) => {
		await page.goto('/employees');

		await expect(page.getByTestId('responsive-page-header')).toBeVisible({ timeout: 2_000 });
		await expect(
			page.getByTestId('responsive-page-header-actions').getByRole('button'),
		).toHaveCSS('min-height', '44px', { timeout: 2_000 });
	});

	test('renders ResponsiveDataView cards instead of the table on employees at 375px', async ({
		page,
	}) => {
		await page.goto('/employees');

		await expect(page.getByTestId('responsive-data-view-mobile')).toBeVisible({
			timeout: 2_000,
		});
		await expect(page.getByTestId('responsive-data-card').first()).toBeVisible({
			timeout: 2_000,
		});
		await expect(page.getByRole('table')).toHaveCount(0);
	});

	test('renders MobileDayCalendar on schedules at 375px', async ({ page }) => {
		await page.goto('/schedules');

		await expect(page.getByTestId('mobile-day-calendar')).toBeVisible({ timeout: 2_000 });
		await expect(page.getByTestId('mobile-day-calendar-previous')).toBeVisible({
			timeout: 2_000,
		});
		await expect(page.getByTestId('mobile-day-calendar-next')).toBeVisible({
			timeout: 2_000,
		});
	});
});
