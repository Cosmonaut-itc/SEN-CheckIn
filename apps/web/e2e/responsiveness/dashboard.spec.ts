import { expect, test } from '@playwright/test';

import {
	mockDashboardMapStyle,
	mockDashboardWeather,
	type SeededDashboardScenario,
	seedDashboardScenario,
	signInToSeededDashboard,
	waitForDashboardSeededData,
	waitForDashboardV2,
} from '../helpers/dashboard';
import { expectNoHorizontalOverflow, RESPONSIVE_VIEWPORTS } from './helpers';

const EDITORIAL_GRID_VIEWPORT = {
	width: 1100,
	height: 768,
};

test.describe('dashboard responsiveness', () => {
	let scenario: SeededDashboardScenario;

	test.beforeEach(async ({ page }) => {
		await mockDashboardMapStyle(page);
		await mockDashboardWeather(page);
		await signInToSeededDashboard(page);
		scenario = await seedDashboardScenario(page);
		await page.goto(`/dashboard?responsiveTest=${Date.now()}`);
		await waitForDashboardV2(page);
		await waitForDashboardSeededData(page);
	});

	test('renders the stacked mobile layout with collapsible location rail', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		await page.goto(`/dashboard?responsiveTest=${Date.now()}`);
		await waitForDashboardV2(page);
		await waitForDashboardSeededData(page);

		await expectNoHorizontalOverflow(page);

		const mapStage = page.getByTestId('dashboard-v2-map-stage');
		const railToggle = page.getByRole('button', { name: 'Por sucursal' });

		await expect(mapStage).toBeVisible();
		await expect(railToggle).toHaveAttribute('aria-expanded', 'false');
		await expect(page.getByTestId('dashboard-v2-timeline')).toBeVisible();

		await railToggle.click();

		await expect(railToggle).toHaveAttribute('aria-expanded', 'true');
		await expect(
			page.getByTestId(`location-rail-item-${scenario.primaryLocationId}`),
		).toBeVisible();
	});

	test('keeps the two-column editorial grid above the mobile breakpoint', async ({ page }) => {
		await page.setViewportSize(EDITORIAL_GRID_VIEWPORT);
		await page.goto(`/dashboard?responsiveTest=${Date.now()}`);
		await waitForDashboardV2(page);
		await waitForDashboardSeededData(page);

		await expectNoHorizontalOverflow(page);
		await expect(page.getByTestId('dashboard-v2-grid')).toBeVisible();
		await expect(
			page.getByTestId(`location-rail-item-${scenario.secondaryLocationId}`),
		).toBeVisible();
		await expect(page.getByTestId('dashboard-v2-aux')).toBeVisible();
		const gridTemplateColumns = await page
			.getByTestId('dashboard-v2-grid')
			.evaluate((element) => window.getComputedStyle(element).gridTemplateColumns);
		expect(gridTemplateColumns.split(' ').length).toBeGreaterThan(1);
		const mapCardBox = await page.getByTestId('dashboard-v2-map-card').boundingBox();
		const railBox = await page.getByTestId('location-rail').boundingBox();
		expect(mapCardBox).not.toBeNull();
		expect(railBox).not.toBeNull();
		expect(Math.abs((mapCardBox?.y ?? 0) - (railBox?.y ?? 0))).toBeLessThan(48);
		expect(railBox?.x ?? 0).toBeGreaterThan((mapCardBox?.x ?? 0) + 48);
	});
});
