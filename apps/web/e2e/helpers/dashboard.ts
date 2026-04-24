import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import {
	provisionResponsiveUser,
	setActiveResponsiveOrganization,
} from '../responsiveness/helpers';

const DASHBOARD_SCREENSHOT_DIR = path.resolve(process.cwd(), '..', 'output', 'dashboard-v2');

/**
 * Minimal seeded dashboard data returned to tests for stable assertions.
 */
export interface SeededDashboardScenario {
	primaryLocationId: string;
	primaryLocationName: string;
	secondaryLocationId: string;
	secondaryLocationName: string;
}

/**
 * Waits for the redesigned dashboard root to become visible.
 *
 * @param page - Playwright page instance
 * @returns Promise that resolves once the dashboard is ready
 */
export async function waitForDashboardV2(page: Page): Promise<void> {
	await page.waitForURL('**/dashboard**', { timeout: 90_000 });
	await page.getByTestId('dashboard-v2-layout').waitFor({
		state: 'visible',
		timeout: 30_000,
	});
}

/**
 * Waits for seeded dashboard data to replace loading states before assertions.
 *
 * @param page - Playwright page instance
 * @returns Promise that resolves once the seeded dashboard sections are visible
 */
export async function waitForDashboardSeededData(page: Page): Promise<void> {
	const viewportWidth = page.viewportSize()?.width ?? 1440;
	const isMobileViewport = viewportWidth <= 1024;

	await page.locator('.maplibregl-canvas').first().waitFor({
		state: 'visible',
		timeout: 30_000,
	});
	await page.getByTestId('map-loader').waitFor({
		state: 'detached',
		timeout: 30_000,
	});
	await page.getByTestId('activity-timeline-pill').first().waitFor({
		state: 'visible',
		timeout: 30_000,
	});
	await page.locator('[data-testid^="weather-card-item-"]').first().waitFor({
		state: 'visible',
		timeout: 30_000,
	});
	await page.getByText(/a tiempo hoy/i).waitFor({
		state: 'visible',
		timeout: 30_000,
	});

	const railLoading = page.getByTestId('location-rail-loading');
	if ((await railLoading.count()) > 0) {
		await railLoading.waitFor({
			state: 'detached',
			timeout: 30_000,
		});
	}

	const railItems = page.locator('[data-testid^="location-rail-item-"]');
	const mobileRailToggle = page.getByTestId('location-rail-mobile-toggle');

	if (isMobileViewport) {
		await mobileRailToggle.waitFor({
			state: 'visible',
			timeout: 30_000,
		});
		const wasCollapsed = (await mobileRailToggle.getAttribute('aria-expanded')) !== 'true';

		if (wasCollapsed) {
			await mobileRailToggle.click();
		}

		await railItems.first().waitFor({
			state: 'visible',
			timeout: 30_000,
		});

		if (wasCollapsed) {
			await mobileRailToggle.click();
			await page.waitForFunction(
				() => {
					const toggle = document.querySelector(
						'[data-testid="location-rail-mobile-toggle"]',
					);
					return toggle?.getAttribute('aria-expanded') === 'false';
				},
				undefined,
				{ timeout: 30_000 },
			);
		}

		return;
	}

	await page.getByTestId('location-rail').waitFor({
		state: 'visible',
		timeout: 30_000,
	});
	await railItems.first().waitFor({
		state: 'visible',
		timeout: 30_000,
	});
}

/**
 * Provisions a fresh organization, signs in, and prepares the dashboard session.
 *
 * @param page - Playwright page instance
 * @returns Promise that resolves after the dashboard loads
 */
export async function signInToSeededDashboard(page: Page): Promise<void> {
	const registration = await provisionResponsiveUser(page);
	await setActiveResponsiveOrganization(page, registration.organizationSlug);
	await page.goto(`/dashboard?e2e=bootstrap-${Date.now()}`);
	await waitForDashboardV2(page);
}

/**
 * Mocks weather responses so the weather card always has deterministic content in e2e.
 *
 * @param page - Playwright page instance
 * @returns Promise that resolves after the route is installed
 */
export async function mockDashboardWeather(page: Page): Promise<void> {
	await page.route('**/api/weather*', async (route) => {
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({
				data: [
					{
						locationId: 'mock-weather-primary',
						locationName: 'Matriz Centro',
						temperature: 26,
						condition: 'clear',
						high: 29,
						low: 17,
						humidity: 38,
					},
					{
						locationId: 'mock-weather-secondary',
						locationName: 'Sucursal Sur',
						temperature: 24,
						condition: 'cloudy',
						high: 27,
						low: 16,
						humidity: 51,
					},
				],
				cachedAt: new Date().toISOString(),
			}),
		});
	});
}

/**
 * Mocks the remote Carto basemap style so dashboard screenshots do not rely on external CDNs.
 *
 * @param page - Playwright page instance
 * @returns Promise that resolves after the route is installed
 */
export async function mockDashboardMapStyle(page: Page): Promise<void> {
	await page.route('**/basemaps.cartocdn.com/**/style.json*', async (route) => {
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({
				version: 8,
				name: 'dashboard-test-style',
				sources: {},
				layers: [],
			}),
		});
	});
}

/**
 * Seeds a stable two-location dashboard scenario through authenticated browser requests.
 *
 * @param page - Authenticated Playwright page instance
 * @returns Identifiers and names used by dashboard assertions
 */
export async function seedDashboardScenario(page: Page): Promise<SeededDashboardScenario> {
	return page.evaluate(async () => {
		/**
		 * Parses a successful API response or throws a detailed error.
		 *
		 * @param response - Fetch response returned by the API
		 * @returns Parsed payload with an optional `data.id`
		 * @throws {Error} When the response is not OK
		 */
		const assertOk = async (response: Response): Promise<{ data?: { id?: string } }> => {
			if (!response.ok) {
				throw new Error(
					`Request failed (${response.status}) at ${response.url}: ${await response.text()}`,
				);
			}

			return response.json() as Promise<{ data?: { id?: string } }>;
		};

		const suffix = globalThis.crypto.randomUUID().slice(0, 8);
		const mexicoDateFormatter = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'America/Mexico_City',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		});
		const todayDateKey = mexicoDateFormatter.format(new Date());

		const primaryLocationName = 'Matriz Centro';
		const secondaryLocationName = 'Sucursal Sur';
		const primaryLocation = await assertOk(
			await fetch('/api/locations', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					name: primaryLocationName,
					code: `MAT-${suffix}`,
					address: 'Av. Madero 10, Morelia',
					latitude: 19.7026,
					longitude: -101.1921,
					geographicZone: 'GENERAL',
					timeZone: 'America/Mexico_City',
				}),
			}),
		);
		const secondaryLocation = await assertOk(
			await fetch('/api/locations', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					name: secondaryLocationName,
					code: `SUR-${suffix}`,
					address: 'Calz. La Huerta 200, Morelia',
					latitude: 19.6836,
					longitude: -101.2123,
					geographicZone: 'GENERAL',
					timeZone: 'America/Mexico_City',
				}),
			}),
		);
		const jobPosition = await assertOk(
			await fetch('/api/job-positions', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					name: `Operaciones ${suffix.slice(-4)}`,
				}),
			}),
		);

		/**
		 * Creates one employee assigned to the provided location.
		 *
		 * @param code - Employee code
		 * @param firstName - Employee first name
		 * @param locationId - Assigned location id
		 * @returns Created employee payload
		 */
		const createEmployee = async (
			code: string,
			firstName: string,
			locationId: string,
		): Promise<{ data?: { id?: string } }> => {
			return assertOk(
				await fetch('/api/employees', {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
					},
					body: JSON.stringify({
						code,
						firstName,
						lastName: 'Dashboard',
						hireDate: '2025-01-01',
						locationId,
						jobPositionId: jobPosition.data?.id,
						status: 'ACTIVE',
						dailyPay: 420,
						paymentFrequency: 'WEEKLY',
						periodPay: 2940,
						rfc: `RFC${code.slice(-6)}ABC`,
						nss: `12345${code.slice(-6)}`,
					}),
				}),
			);
		};

		const primaryEmployeeA = await createEmployee(
			`MATA-${suffix}`,
			'Alma',
			primaryLocation.data?.id ?? '',
		);
		const primaryEmployeeB = await createEmployee(
			`MATB-${suffix}`,
			'Bruno',
			primaryLocation.data?.id ?? '',
		);
		const secondaryEmployee = await createEmployee(
			`SURC-${suffix}`,
			'Carla',
			secondaryLocation.data?.id ?? '',
		);

		const device = await assertOk(
			await fetch('/api/devices', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					code: `KIO-${suffix}`,
					name: 'Kiosco principal',
					deviceType: 'KIOSK',
					status: 'ONLINE',
					locationId: primaryLocation.data?.id,
				}),
			}),
		);

		await assertOk(
			await fetch(`/api/devices/${device.data?.id}/heartbeat`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					batteryLevel: 76,
				}),
			}),
		);

		/**
		 * Creates one attendance record for the seeded employees.
		 *
		 * @param payload - Attendance payload posted to the API
		 * @returns Nothing
		 */
		const createAttendance = async (payload: Record<string, unknown>): Promise<void> => {
			await assertOk(
				await fetch('/api/attendance', {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
					},
					body: JSON.stringify(payload),
				}),
			);
		};

		await createAttendance({
			employeeId: primaryEmployeeA.data?.id,
			deviceId: device.data?.id,
			timestamp: `${todayDateKey}T14:05:00.000Z`,
			type: 'CHECK_IN',
		});
		await createAttendance({
			employeeId: primaryEmployeeB.data?.id,
			deviceId: device.data?.id,
			timestamp: `${todayDateKey}T15:15:00.000Z`,
			type: 'CHECK_IN',
		});
		await createAttendance({
			employeeId: secondaryEmployee.data?.id,
			type: 'WORK_OFFSITE',
			offsiteDateKey: todayDateKey,
			offsiteDayKind: 'LABORABLE',
			offsiteReason: 'Cobertura comercial',
		});

		return {
			primaryLocationId: primaryLocation.data?.id ?? '',
			primaryLocationName,
			secondaryLocationId: secondaryLocation.data?.id ?? '',
			secondaryLocationName,
		};
	});
}

/**
 * Forces the dashboard theme and waits for the refreshed page to settle.
 *
 * @param page - Playwright page instance
 * @param theme - Requested theme name
 * @returns Promise that resolves once the dashboard is visible again
 */
export async function setDashboardTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
	await page.evaluate((nextTheme) => {
		window.localStorage.setItem('theme', nextTheme);
	}, theme);
	await page.goto(`/dashboard?theme=${theme}&e2e=theme-${Date.now()}`);
	await waitForDashboardV2(page);
	await waitForDashboardSeededData(page);
}

/**
 * Captures a dashboard screenshot to the shared output directory.
 *
 * @param page - Playwright page instance
 * @param filename - Screenshot filename
 * @returns Promise that resolves after the file is written
 */
export async function captureDashboardScreenshot(page: Page, filename: string): Promise<void> {
	await mkdir(DASHBOARD_SCREENSHOT_DIR, { recursive: true });
	await page.screenshot({
		path: path.join(DASHBOARD_SCREENSHOT_DIR, filename),
		fullPage: true,
	});
}
