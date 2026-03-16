import { expect, test, type Page } from '@playwright/test';

import {
	expectMinimumTouchHeight,
	expectNoHorizontalOverflow,
	provisionResponsiveUser,
	RESPONSIVE_VIEWPORTS,
	seedResponsiveEmployeeDataViaBrowser,
	setActiveResponsiveOrganization,
} from './helpers';

/**
 * Seeds a minimal attendance record for the responsive attendance page.
 *
 * @param page - Authenticated browser page
 * @param employeeId - Employee identifier used by the attendance API
 * @returns Promise that resolves after the records are created
 * @throws {Error} When any attendance record cannot be created
 */
async function seedResponsiveAttendanceRecords(
	page: Page,
	employeeId: string,
): Promise<void> {
	await page.evaluate(async ({ targetEmployeeId }) => {
		/**
		 * Throws when the attendance POST request fails.
		 *
		 * @param response - Fetch response returned by the API
		 * @returns Nothing
		 * @throws {Error} When the response is not OK
		 */
		const assertOk = async (response: Response): Promise<void> => {
			if (response.ok) {
				return;
			}
			throw new Error(
				`Failed to create attendance (${response.status}) at ${response.url}: ${await response.text()}`,
			);
		};

		const today = new Date();
		const todayDateKey = [
			today.getFullYear(),
			String(today.getMonth() + 1).padStart(2, '0'),
			String(today.getDate()).padStart(2, '0'),
		].join('-');
		await assertOk(
			await fetch('/api/attendance', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					employeeId: targetEmployeeId,
					type: 'WORK_OFFSITE',
					offsiteDateKey: todayDateKey,
					offsiteDayKind: 'LABORABLE',
					offsiteReason: 'Cobertura responsive',
				}),
			}),
		);
	}, { targetEmployeeId: employeeId });
}

test.describe('attendance responsiveness', () => {
	test('renders stacked cards and touch-friendly actions on mobile', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		const registration = await provisionResponsiveUser(page);
		await setActiveResponsiveOrganization(page, registration.organizationSlug);
		const { employeeId } = await seedResponsiveEmployeeDataViaBrowser(
			page,
			registration.organizationName,
		);
		await seedResponsiveAttendanceRecords(page, employeeId);
		await page.goto(`/attendance?responsiveTest=${Date.now()}`);
		await page.reload();

		await expectNoHorizontalOverflow(page);
		await expect(page.getByTestId('responsive-page-header')).toBeVisible();
		await expect(page.getByTestId('responsive-data-view-mobile')).toBeVisible();
		await expect(page.getByTestId('responsive-data-card').first()).toBeVisible();

		await expectMinimumTouchHeight(
			page.getByTestId('responsive-page-header-actions').getByRole('button').first(),
		);
	});

	test('keeps the table layout on desktop', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		const registration = await provisionResponsiveUser(page);
		await setActiveResponsiveOrganization(page, registration.organizationSlug);
		const { employeeId } = await seedResponsiveEmployeeDataViaBrowser(
			page,
			registration.organizationName,
		);
		await seedResponsiveAttendanceRecords(page, employeeId);
		await page.goto(`/attendance?responsiveTest=${Date.now()}`);
		await page.reload();

		await expect(page.getByRole('table')).toBeVisible();
		await expect(page.getByTestId('responsive-data-view-mobile')).toHaveCount(0);
	});
});
