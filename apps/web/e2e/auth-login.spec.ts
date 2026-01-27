import { expect, test } from '@playwright/test';
import { buildTestRegistrationPayload, registerTestAccounts, signIn } from './helpers/auth';

test('signs in and lands on the dashboard', async ({ page }) => {
	const registration = buildTestRegistrationPayload();
	await registerTestAccounts(page, registration);
	await signIn(page, registration.admin.email, registration.admin.password);
	await expect(page).toHaveURL(/\/dashboard/);
});
