import { expect, test, type Page } from '@playwright/test';

import {
	expectMinimumTouchHeight,
	expectNoHorizontalOverflow,
	RESPONSIVE_VIEWPORTS,
} from './helpers';

const DASHBOARD_TEST_EMAIL = 'felixddhs@outlook.com';
const DASHBOARD_TEST_PASSWORD = '2jzTNzMsX2oHaq@8oKWN';

/**
 * Signs into the dashboard with the shared responsive test account.
 *
 * @param page - Playwright page instance
 * @returns Promise that resolves after the dashboard is ready
 * @throws {Error} When sign-in does not complete
 */
async function signInToDashboard(page: Page): Promise<void> {
	await page.goto('/sign-in');
	await page.getByLabel('Correo electrónico').fill(DASHBOARD_TEST_EMAIL);
	await page.getByLabel('Contraseña').fill(DASHBOARD_TEST_PASSWORD);
	await page.getByTestId('sign-in-submit').click();
	await page.waitForURL('**/dashboard');
	await page.getByTestId('dashboard-map-hero').waitFor({ state: 'visible' });
}

test.describe('dashboard responsiveness', () => {
	test('renders the mobile map hero layout at 375px', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		await signInToDashboard(page);

		await expectNoHorizontalOverflow(page);

		const viewportHeight = RESPONSIVE_VIEWPORTS.mobile.height;
		const mapHero = page.getByTestId('dashboard-map-hero');
		const statsStrip = page.getByTestId('dashboard-stats-strip');
		const actions = page.getByTestId('dashboard-actions');

		const mapBox = await mapHero.boundingBox();
		const statsBox = await statsStrip.boundingBox();
		const actionsBox = await actions.boundingBox();
		const refreshButton = page.getByTestId('dashboard-refresh-button');
		const locationsButton = page.getByTestId('dashboard-locations-button');
		const refreshButtonBox = await refreshButton.boundingBox();
		const locationsButtonBox = await locationsButton.boundingBox();

		expect(mapBox).not.toBeNull();
		expect(statsBox).not.toBeNull();
		expect(actionsBox).not.toBeNull();
		expect(refreshButtonBox).not.toBeNull();
		expect(locationsButtonBox).not.toBeNull();

		expect(mapBox?.height ?? 0).toBeGreaterThanOrEqual(viewportHeight * 0.5);
		expect((statsBox?.y ?? 0) >= (mapBox?.y ?? 0) + (mapBox?.height ?? 0)).toBe(true);
		expect((actionsBox?.y ?? 0) >= (statsBox?.y ?? 0) + (statsBox?.height ?? 0)).toBe(true);

		expect((refreshButtonBox?.width ?? 0) + 8).toBeGreaterThanOrEqual(
			actionsBox?.width ?? 0,
		);
		expect((locationsButtonBox?.width ?? 0) + 8).toBeGreaterThanOrEqual(
			actionsBox?.width ?? 0,
		);

		await expectMinimumTouchHeight(refreshButton);
		await expectMinimumTouchHeight(locationsButton);
	});

	test('keeps the dashboard accessible and without overflow at 1024px', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.tablet);
		await signInToDashboard(page);

		await expectNoHorizontalOverflow(page);
		await expect(page.getByTestId('dashboard-map-hero')).toBeVisible();
		await expect(page.getByTestId('dashboard-stats-strip')).toBeVisible();
	});
});
