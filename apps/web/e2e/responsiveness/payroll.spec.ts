import { expect, test, type APIRequestContext } from '@playwright/test';

import {
	expectMinimumTouchHeight,
	expectNoHorizontalOverflow,
	provisionResponsiveUser,
	RESPONSIVE_VIEWPORTS,
	seedResponsiveEmployeeDataViaBrowser,
	setActiveResponsiveOrganization,
} from './helpers';

/**
 * Processes a payroll run for the active organization.
 *
 * @param request - Authenticated Playwright request context
 * @param periodStartDateKey - Period start date key
 * @param periodEndDateKey - Period end date key
 * @returns Nothing
 * @throws {Error} When the payroll process request fails
 */
async function processResponsivePayrollRun(
	request: APIRequestContext,
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

test.describe('payroll responsiveness', () => {
	test('renders payroll history cards and mobile-friendly actions on mobile', async ({
		page,
	}) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		const registration = await provisionResponsiveUser(page);
		await setActiveResponsiveOrganization(page, registration.organizationSlug);
		await seedResponsiveEmployeeDataViaBrowser(page, registration.organizationName);
		await processResponsivePayrollRun(page.request, '2026-01-01', '2026-01-07');
		await page.goto(`/payroll?responsiveTest=${Date.now()}`);
		await page.reload();

		await expectNoHorizontalOverflow(page);
		await expect(page.getByTestId('responsive-page-header')).toBeVisible();
		await expect(page.getByTestId('responsive-data-view-mobile')).toBeVisible();
		await expect(page.getByTestId('responsive-data-card').first()).toBeVisible();

		await expectMinimumTouchHeight(
			page.getByRole('button', { name: 'Procesar nómina' }),
		);
	});

	test('keeps the payroll run history table on desktop', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		const registration = await provisionResponsiveUser(page);
		await setActiveResponsiveOrganization(page, registration.organizationSlug);
		await seedResponsiveEmployeeDataViaBrowser(page, registration.organizationName);
		await processResponsivePayrollRun(page.request, '2026-01-01', '2026-01-07');
		await page.goto(`/payroll?responsiveTest=${Date.now()}`);
		await page.reload();

		await expect(page.getByRole('table').last()).toBeVisible();
		await expect(page.getByTestId('responsive-data-view-mobile')).toHaveCount(0);
	});
});
