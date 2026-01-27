import { expect, test } from '@playwright/test';
import { buildTestRegistrationPayload, registerTestAccounts, signIn } from './helpers/auth';

test('admin users see admin navigation', async ({ page }) => {
	const registration = buildTestRegistrationPayload();
	await registerTestAccounts(page, registration);
	await signIn(page, registration.admin.email, registration.admin.password);
	await expect(page.getByTestId('app-sidebar-admin-group')).toBeVisible();
});

test('member users do not see admin navigation', async ({ page }) => {
	const registration = buildTestRegistrationPayload();
	await registerTestAccounts(page, registration);
	await signIn(page, registration.member.email, registration.member.password);
	await expect(page.getByTestId('app-sidebar-admin-group')).toHaveCount(0);
});
