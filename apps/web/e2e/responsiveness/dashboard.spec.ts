import { expect, test } from '@playwright/test';

import {
	mockDashboardWeather,
	type SeededDashboardScenario,
	seedDashboardScenario,
	signInToSeededDashboard,
	waitForDashboardV2,
} from '../helpers/dashboard';
import { expectNoHorizontalOverflow, RESPONSIVE_VIEWPORTS } from './helpers';

test.describe('dashboard responsiveness', () => {
	let scenario: SeededDashboardScenario;

	test.beforeEach(async ({ page }) => {
		await mockDashboardWeather(page);
		await signInToSeededDashboard(page);
		scenario = await seedDashboardScenario(page);
		await page.goto(`/dashboard?responsiveTest=${Date.now()}`);
		await waitForDashboardV2(page);
	});

	test('renders the stacked mobile layout with collapsible location rail', async ({
		page,
	}) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		await page.goto(`/dashboard?responsiveTest=${Date.now()}`);
		await waitForDashboardV2(page);

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

	test('keeps the two-column editorial grid on tablet', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.tablet);
		await page.goto(`/dashboard?responsiveTest=${Date.now()}`);
		await waitForDashboardV2(page);

		await expectNoHorizontalOverflow(page);
		await expect(page.getByTestId('dashboard-v2-grid')).toBeVisible();
		await expect(
			page.getByTestId(`location-rail-item-${scenario.secondaryLocationId}`),
		).toBeVisible();
		await expect(page.getByTestId('dashboard-v2-aux')).toBeVisible();
	});
});
