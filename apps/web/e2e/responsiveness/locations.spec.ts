import { expect, test } from '@playwright/test';

import {
	expectMinimumTouchHeight,
	expectNoHorizontalOverflow,
	provisionResponsiveUser,
	RESPONSIVE_VIEWPORTS,
	seedResponsiveEmployeeDataViaBrowser,
	setActiveResponsiveOrganization,
} from './helpers';

test.describe('locations responsiveness', () => {
	test('renders stacked cards and touch-friendly actions on mobile', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		const registration = await provisionResponsiveUser(page);
		await setActiveResponsiveOrganization(page, registration.organizationSlug);
		await seedResponsiveEmployeeDataViaBrowser(page, registration.organizationName);
		await page.goto(`/locations?responsiveTest=${Date.now()}`);
		await page.reload();

		await expectNoHorizontalOverflow(page);
		await expect(page.getByTestId('responsive-page-header')).toBeVisible();
		await expect(page.getByTestId('responsive-data-view-mobile')).toBeVisible();
		await expect(page.getByTestId('responsive-data-card').first()).toBeVisible();

		await expectMinimumTouchHeight(page.getByTestId('locations-add-button'));
	});

	test('keeps the table layout on desktop', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		const registration = await provisionResponsiveUser(page);
		await setActiveResponsiveOrganization(page, registration.organizationSlug);
		await seedResponsiveEmployeeDataViaBrowser(page, registration.organizationName);
		await page.goto(`/locations?responsiveTest=${Date.now()}`);
		await page.reload();

		await expect(page.getByRole('table')).toBeVisible();
		await expect(page.getByTestId('responsive-data-view-mobile')).toHaveCount(0);
	});
});
