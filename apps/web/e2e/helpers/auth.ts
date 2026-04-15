import { expect, type Page } from '@playwright/test';

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

interface BrowserSignInResult {
	ok: boolean;
	status: number;
	body: string;
}

type BrowserOrganization = {
	id?: string;
};

/**
 * Waits until the Next.js dev server finishes compiling the current page.
 *
 * @param page - Playwright page instance
 * @returns Promise that resolves once the transient compiling indicator disappears
 */
async function waitForNextDevCompilation(page: Page): Promise<void> {
	const devToolsButton = page.getByRole('button', {
		name: /Open Next\.js Dev Tools/i,
	});

	if ((await devToolsButton.count()) === 0) {
		return;
	}

	await expect(devToolsButton).not.toContainText(/Compiling/i, { timeout: 90_000 });
}

/**
 * Signs into Better Auth directly from the browser context so session cookies
 * are stored in the active Playwright browser context.
 *
 * @param page - Playwright page instance
 * @param email - Login email
 * @param password - Login password
 * @returns Raw sign-in response details
 */
async function signInViaBrowserRequest(
	page: Page,
	email: string,
	password: string,
): Promise<BrowserSignInResult> {
	return page.evaluate(
		async (credentials) => {
			const response = await fetch('/api/auth/sign-in/email', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				credentials: 'include',
				body: JSON.stringify(credentials),
			});

			return {
				ok: response.ok,
				status: response.status,
				body: await response.text(),
			};
		},
		{ email, password },
	);
}

/**
 * Ensures the authenticated browser session has an active organization set.
 *
 * @param page - Playwright page instance
 * @returns Promise that resolves after the first available organization is active
 */
async function ensureActiveOrganization(page: Page): Promise<void> {
	const result = await page.evaluate(async () => {
		const listResponse = await fetch('/api/auth/organization/list', {
			credentials: 'include',
		});

		if (!listResponse.ok) {
			return {
				ok: false,
				status: listResponse.status,
				body: await listResponse.text(),
			};
		}

		const payload = (await listResponse.json()) as
			| { organizations?: BrowserOrganization[]; data?: BrowserOrganization[] }
			| BrowserOrganization[];
		const organizations = Array.isArray(payload)
			? payload
			: (payload.organizations ?? payload.data ?? []);
		const organizationId = organizations[0]?.id;

		if (!organizationId) {
			return { ok: true, status: 200, body: '' };
		}

		const setActiveResponse = await fetch('/api/auth/organization/set-active', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			credentials: 'include',
			body: JSON.stringify({ organizationId }),
		});

		return {
			ok: setActiveResponse.ok,
			status: setActiveResponse.status,
			body: await setActiveResponse.text(),
		};
	});

	if (!result.ok) {
		throw new Error(
			`Failed to activate browser organization (${result.status}): ${result.body}`,
		);
	}
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
	await page.goto('/registro-pruebas', { waitUntil: 'domcontentloaded' });
	await waitForNextDevCompilation(page);

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
	await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
	await waitForNextDevCompilation(page);

	const form = page.getByTestId('sign-in-form');
	await form.locator('input[name="email"]').fill(email);
	await form.locator('input[name="password"]').fill(password);

	const submitButton = page.getByTestId('sign-in-submit');
	await submitButton.click();

	try {
		await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/, { timeout: 8_000 });
		await ensureActiveOrganization(page);
		return;
	} catch {
		if (/\/sign-in\?(?:.*(?:email|password)=).*/.test(page.url())) {
			await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
			await waitForNextDevCompilation(page);
		}

		if (/\/sign-in(?:\?.*)?$/.test(page.url())) {
			const response = await signInViaBrowserRequest(page, email, password);
			if (!response.ok) {
				throw new Error(
					`Browser auth sign-in failed (${response.status}): ${response.body}`,
				);
			}

			await ensureActiveOrganization(page);
			if (!/\/dashboard(?:\?.*)?$/.test(page.url())) {
				await page.goto('/dashboard', {
					waitUntil: 'commit',
					timeout: 90_000,
				});
			}
			await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
			await waitForNextDevCompilation(page);
			await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/, { timeout: 90_000 });
			return;
		}
	}

	await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/, { timeout: 90_000 });
	await ensureActiveOrganization(page);
}
