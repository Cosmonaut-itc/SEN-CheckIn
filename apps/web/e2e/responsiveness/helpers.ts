import { expect, type Page, type ViewportSize } from '@playwright/test';

import {
	buildTestRegistrationPayload,
	registerTestAccounts,
	signIn,
	type TestRegistrationPayload,
} from '../helpers/auth';

/**
 * Shared responsive viewport sizes for Playwright assertions.
 */
export const RESPONSIVE_VIEWPORTS: Record<'mobile' | 'tablet', ViewportSize> = {
	mobile: {
		width: 375,
		height: 812,
	},
	tablet: {
		width: 1024,
		height: 768,
	},
};

/**
 * Provisions a fresh organization and signs the test user into the dashboard.
 *
 * @param page - Playwright page instance used for the flow
 * @returns Registration payload used to create and authenticate the user
 * @throws {Error} When provisioning or sign-in fails
 */
export async function provisionResponsiveUser(
	page: Page,
): Promise<TestRegistrationPayload> {
	const registration = buildTestRegistrationPayload();
	await registerTestAccounts(page, registration);
	await signIn(page, registration.admin.email, registration.admin.password);
	return registration;
}

/**
 * Ensures the current page does not overflow horizontally.
 *
 * @param page - Playwright page under test
 * @returns Promise that resolves when the assertion passes
 * @throws {Error} When the document width exceeds the viewport width
 */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
	const dimensions = await page.evaluate(() => ({
		scrollWidth: document.body.scrollWidth,
		innerWidth: window.innerWidth,
	}));

	expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth);
}
