import { expect, test } from '@playwright/test';

import {
	captureDashboardScreenshot,
	mockDashboardMapStyle,
	mockDashboardWeather,
	type SeededDashboardScenario,
	seedDashboardScenario,
	setDashboardTheme,
	signInToSeededDashboard,
	waitForDashboardSeededData,
	waitForDashboardV2,
} from './helpers/dashboard';

test.describe('dashboard v2', () => {
	let scenario: SeededDashboardScenario;

	test.beforeEach(async ({ page }) => {
		await mockDashboardMapStyle(page);
		await mockDashboardWeather(page);
		await signInToSeededDashboard(page);
		scenario = await seedDashboardScenario(page);
		await page.goto(`/dashboard?e2e=${Date.now()}`);
		await waitForDashboardV2(page);
		await waitForDashboardSeededData(page);
	});

	test('captures desktop and mobile screenshots in light and dark themes', async ({ page }) => {
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
		const hero = page.getByTestId('dashboard-v2-hero');
		await expect(hero).toBeVisible();
		await expect(hero.getByRole('heading')).toBeVisible();
		await expect(page.getByTestId('hero-stat-on-time')).toBeVisible();
	});

	test('shows the editorial grid with map, rail, timeline and auxiliary cards', async ({
		page,
	}) => {
		await expect(page.getByTestId('dashboard-v2-map-card')).toBeVisible();
		await expect(page.getByTestId('location-rail')).toBeVisible();
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
		const primaryWeatherCard = page.getByTestId('weather-card-item-mock-weather-primary');
		const secondaryWeatherCard = page.getByTestId('weather-card-item-mock-weather-secondary');

		await expect(primaryWeatherCard).toContainText('Matriz Centro');
		await expect(primaryWeatherCard).toContainText('26°C');
		await expect(primaryWeatherCard.getByTestId('weather-icon-cielo-claro')).toBeVisible();
		await expect(secondaryWeatherCard).toContainText('Sucursal Sur');
		await expect(secondaryWeatherCard).toContainText('24°C');
		await expect(secondaryWeatherCard.getByTestId('weather-icon-nubes')).toBeVisible();
	});

	test('filters locations from the search input', async ({ page }) => {
		const searchInput = page.getByTestId('location-rail-search');

		await searchInput.fill('Sur');

		await expect(
			page.getByTestId(`location-rail-item-${scenario.primaryLocationId}`),
		).toBeHidden();
		await expect(
			page.getByTestId(`location-rail-item-${scenario.secondaryLocationId}`),
		).toBeVisible();
	});

	test('changes the dashboard theme from the theme toggle', async ({ page }) => {
		await page.getByTestId('theme-mode-toggle').click();
		await page.getByTestId('theme-mode-option-dark').click();

		await expect(page.locator('html')).toHaveClass(/dark/);
	});
});
