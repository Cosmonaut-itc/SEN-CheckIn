import { expect, test } from '@playwright/test';

import {
	expectNoHorizontalOverflow,
	provisionResponsiveUser,
	RESPONSIVE_VIEWPORTS,
	setActiveResponsiveOrganization,
	seedResponsiveEmployeeDataViaBrowser,
} from './helpers';

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
});
