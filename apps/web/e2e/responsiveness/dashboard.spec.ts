import { expect, test, type Page } from '@playwright/test';

import {
	expectMinimumTouchHeight,
	expectNoHorizontalOverflow,
	RESPONSIVE_VIEWPORTS,
	signInAsSeedAdmin,
} from './helpers';

/**
 * Signs into the dashboard with the shared responsive test account.
 *
 * @param page - Playwright page instance
 * @returns Promise that resolves after the dashboard is ready
 * @throws {Error} When sign-in does not complete
 */
async function signInToDashboard(page: Page): Promise<void> {
	await signInAsSeedAdmin(page);
	await page.waitForURL('**/dashboard', { timeout: 90_000 });
	await page.getByTestId('dashboard-map-hero').waitFor({ state: 'visible', timeout: 30_000 });
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
		const locationsPanel = page.getByTestId('dashboard-locations-panel');

		const mapBox = await mapHero.boundingBox();
		const statsBox = await statsStrip.boundingBox();
		const actionsBox = await actions.boundingBox();
		const locationsBox = await locationsPanel.boundingBox();
		const refreshButton = page.getByTestId('dashboard-refresh-button');
		const locationsButton = page.getByTestId('dashboard-locations-button');
		const refreshButtonBox = await refreshButton.boundingBox();
		const locationsButtonBox = await locationsButton.boundingBox();

		expect(mapBox).not.toBeNull();
		expect(statsBox).not.toBeNull();
		expect(actionsBox).not.toBeNull();
		expect(locationsBox).not.toBeNull();
		expect(refreshButtonBox).not.toBeNull();
		expect(locationsButtonBox).not.toBeNull();

		expect(mapBox?.height ?? 0).toBeGreaterThanOrEqual(viewportHeight * 0.5);
		expect((statsBox?.y ?? 0) >= (mapBox?.y ?? 0) + (mapBox?.height ?? 0)).toBe(true);
		expect((actionsBox?.y ?? 0) >= (statsBox?.y ?? 0) + (statsBox?.height ?? 0)).toBe(true);
		expect((locationsBox?.y ?? 0) >= (actionsBox?.y ?? 0) + (actionsBox?.height ?? 0)).toBe(
			true,
		);

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
		await expect(page.getByTestId('dashboard-locations-panel')).toBeVisible();
	});
});
