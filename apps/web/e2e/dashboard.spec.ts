import { expect, test } from '@playwright/test';

import {
	captureDashboardScreenshot,
	mockDashboardWeather,
	type SeededDashboardScenario,
	seedDashboardScenario,
	setDashboardTheme,
	signInToSeededDashboard,
	waitForDashboardV2,
} from './helpers/dashboard';

test.describe('dashboard v2', () => {
	let scenario: SeededDashboardScenario;

	test.beforeEach(async ({ page }) => {
		await mockDashboardWeather(page);
		await signInToSeededDashboard(page);
		scenario = await seedDashboardScenario(page);
		await page.goto(`/dashboard?e2e=${Date.now()}`);
		await waitForDashboardV2(page);
	});

	test('captures desktop and mobile screenshots in light and dark themes', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 1100 });
		await setDashboardTheme(page, 'light');
		await captureDashboardScreenshot(page, 'desktop-light.png');
		await setDashboardTheme(page, 'dark');
		await captureDashboardScreenshot(page, 'desktop-dark.png');

		await page.setViewportSize({ width: 390, height: 844 });
		await setDashboardTheme(page, 'light');
		await captureDashboardScreenshot(page, 'mobile-light.png');
		await setDashboardTheme(page, 'dark');
		await captureDashboardScreenshot(page, 'mobile-dark.png');
	});

	test('loads the dashboard with hero header and stat card', async ({ page }) => {
		await expect(page.getByTestId('dashboard-v2-hero')).toBeVisible();
		await expect(page.getByRole('heading', { name: /Todo el/i })).toBeVisible();
		await expect(page.getByText(/a tiempo hoy/i)).toBeVisible();
	});

	test('shows the editorial grid with map, rail, timeline and auxiliary cards', async ({
		page,
	}) => {
		await expect(page.getByTestId('dashboard-v2-map-card')).toBeVisible();
		await expect(page.getByTestId('dashboard-v2-location-rail')).toBeVisible();
		await expect(page.getByTestId('dashboard-v2-timeline')).toBeVisible();
		await expect(page.getByTestId('dashboard-v2-aux')).toBeVisible();
	});

	test('highlights the selected location in the rail and summary area', async ({ page }) => {
		const secondaryLocationButton = page.getByTestId(
			`location-rail-item-${scenario.secondaryLocationId}`,
		);

		await secondaryLocationButton.click();

		await expect(secondaryLocationButton).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByTestId('dashboard-v2-location-summary')).toContainText(
			scenario.secondaryLocationName,
		);
	});

	test('renders recent timeline events', async ({ page }) => {
		await expect(page.getByTestId('dashboard-v2-timeline')).toBeVisible();
		await expect(page.getByTestId('activity-timeline-pill').first()).toBeVisible();
	});

	test('shows seeded device status information', async ({ page }) => {
		await expect(page.getByText('Kiosco principal')).toBeVisible();
		await expect(page.getByText('76%')).toBeVisible();
	});

	test('renders weather information per location', async ({ page }) => {
		await expect(page.getByTestId('weather-icon-cielo-claro')).toBeVisible();
		await expect(page.getByTestId('weather-icon-nubes')).toBeVisible();
	});

	test('filters locations from the search input', async ({ page }) => {
		const searchInput = page.getByPlaceholder('Buscar...');

		await searchInput.fill('Sur');

		await expect(
			page.getByTestId(`location-rail-item-${scenario.primaryLocationId}`),
		).toBeHidden();
		await expect(
			page.getByTestId(`location-rail-item-${scenario.secondaryLocationId}`),
		).toBeVisible();
	});

	test('changes the dashboard theme from the theme toggle', async ({ page }) => {
		await page.getByLabel('Cambiar tema').click();
		await page.getByRole('menuitemradio', { name: 'Oscuro' }).click();

		await expect(page.locator('html')).toHaveClass(/dark/);
	});
});
