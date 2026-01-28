import type { Page } from '@playwright/test';

/**
 * Credentials for a provisioned test account.
 */
export interface TestAccountCredentials {
	email: string;
	password: string;
}

/**
 * Payload for provisioning test registration data.
 */
export interface TestRegistrationPayload {
	organizationName: string;
	organizationSlug: string;
	admin: TestAccountCredentials & { name: string };
	member: TestAccountCredentials & { name: string };
}

/**
 * Builds deterministic-but-unique registration data for e2e runs.
 *
 * @returns Registration payload for the test registration page
 */
export function buildTestRegistrationPayload(): TestRegistrationPayload {
	const timestamp = Date.now();
	const suffix = `${timestamp}-${Math.floor(Math.random() * 1000)}`;
	const organizationSlug = `sen-checkin-e2e-${suffix}`;
	return {
		organizationName: `SEN CheckIn E2E ${suffix}`,
		organizationSlug,
		admin: {
			name: 'Admin E2E',
			email: `admin+${suffix}@sen-checkin.test`,
			password: `Admin123!${suffix}`,
		},
		member: {
			name: 'Miembro E2E',
			email: `member+${suffix}@sen-checkin.test`,
			password: `Member123!${suffix}`,
		},
	};
}

/**
 * Completes the dev/test registration workflow for provisioning accounts.
 *
 * @param page - Playwright page instance
 * @param payload - Registration payload data to submit
 * @returns Promise that resolves after provisioning completes
 */
export async function registerTestAccounts(
	page: Page,
	payload: TestRegistrationPayload,
): Promise<void> {
	await page.goto('/registro-pruebas');

	const form = page.getByTestId('test-registration-form');

	await form.locator('input[name="organizationName"]').fill(payload.organizationName);
	await form.locator('input[name="organizationSlug"]').fill(payload.organizationSlug);

	await form.locator('input[name="adminName"]').fill(payload.admin.name);
	await form.locator('input[name="adminEmail"]').fill(payload.admin.email);
	await form.locator('input[name="adminPassword"]').fill(payload.admin.password);
	await form.locator('input[name="adminConfirmPassword"]').fill(payload.admin.password);

	await form.locator('input[name="memberName"]').fill(payload.member.name);
	await form.locator('input[name="memberEmail"]').fill(payload.member.email);
	await form.locator('input[name="memberPassword"]').fill(payload.member.password);
	await form.locator('input[name="memberConfirmPassword"]').fill(payload.member.password);

	const signUpResponsePromise = page.waitForResponse((response) => {
		if (response.request().method() !== 'POST') {
			return false;
		}
		return response.url().includes('/api/auth/sign-up');
	});

	await page.getByTestId('test-registration-submit').click();

	const signUpResponse = await signUpResponsePromise;
	if (!signUpResponse.ok()) {
		const responseBody = await signUpResponse.text();
		throw new Error(
			`Test registration sign-up failed (${signUpResponse.status()}) at ${signUpResponse.url()}: ${responseBody}`,
		);
	}

	await page.getByTestId('test-registration-success').waitFor();
	await page.getByTestId('test-registration-go-sign-in').click();
	await page.waitForURL('**/sign-in');
}

/**
 * Signs into the application using the sign-in form.
 *
 * @param page - Playwright page instance
 * @param email - Login email
 * @param password - Login password
 * @returns Promise that resolves after the dashboard is reached
 */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
	await page.goto('/sign-in');
	const form = page.getByTestId('sign-in-form');
	await form.locator('input[name="email"]').fill(email);
	await form.locator('input[name="password"]').fill(password);
	await page.getByTestId('sign-in-submit').click();
	await page.waitForURL('**/dashboard');
}
