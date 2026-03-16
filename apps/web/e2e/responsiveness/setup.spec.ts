import { expect, test } from '@playwright/test';

import {
	expectNoHorizontalOverflow,
	provisionResponsiveUser,
	RESPONSIVE_VIEWPORTS,
} from './helpers';

const PUBLIC_BASELINE_ROUTES: readonly string[] = ['/', '/sign-in', '/sign-up', '/registrate'];

test.describe('responsive setup baseline', () => {
	test('uses the mobile sidebar sheet at 1024px', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.tablet);
		await provisionResponsiveUser(page);

		await expect(page).toHaveURL(/\/dashboard/);

		await page.locator('[data-slot="sidebar-trigger"]').click();

		await expect(page.getByRole('dialog', { name: 'Sidebar' })).toBeVisible();
	});

	for (const route of PUBLIC_BASELINE_ROUTES) {
		test(`prevents horizontal overflow on ${route} at 375px`, async ({ page }) => {
			await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
			await page.goto(route);

			await expectNoHorizontalOverflow(page);
		});
	}
});
