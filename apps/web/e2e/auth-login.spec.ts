import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@sen-checkin.test';
const ADMIN_PASSWORD = 'Admin123!Test';

/**
 * Signs into the application using the sign-in form.
 *
 * @param page - Playwright page instance
 * @param email - Login email
 * @param password - Login password
 * @returns Promise that resolves when navigation completes
 */
async function signIn(page: Page, email: string, password: string): Promise<void> {
	await page.goto('/sign-in');
	const form = page.getByTestId('sign-in-form');
	await form.locator('input[name="email"]').fill(email);
	await form.locator('input[name="password"]').fill(password);
	await page.getByTestId('sign-in-submit').click();
	await page.waitForURL('**/dashboard');
}

test('signs in and lands on the dashboard', async ({ page }) => {
	await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
	await expect(page).toHaveURL(/\/dashboard/);
});
