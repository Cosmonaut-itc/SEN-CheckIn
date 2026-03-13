import { randomUUID } from 'node:crypto';

import { expect, type APIRequestContext, type Locator, type Page, type ViewportSize } from '@playwright/test';

import {
	buildTestRegistrationPayload,
	registerTestAccounts,
	signIn,
	type TestRegistrationPayload,
} from '../helpers/auth';

const SEEDED_ADMIN_EMAIL = 'admin@sen-checkin.test';
const SEEDED_ADMIN_PASSWORD = 'Admin123!Test';

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
 * Signs into the seeded admin account prepared by the Playwright bootstrap.
 *
 * @param page - Playwright page instance used for the flow
 * @returns Promise that resolves after the dashboard is reached
 * @throws {Error} When sign-in fails
 */
export async function signInAsSeedAdmin(page: Page): Promise<void> {
	await signIn(page, SEEDED_ADMIN_EMAIL, SEEDED_ADMIN_PASSWORD);
}

/**
 * Minimum seed data required for responsive employee-based pages.
 */
export interface ResponsiveEmployeeSeed {
	locationId: string;
	jobPositionId: string;
	employeeId: string;
}

type AuthOrganization = {
	id: string;
	slug?: string | null;
};

/**
 * Seeds one location, one job position, and one employee for responsive dashboard tests.
 *
 * @param request - Authenticated Playwright request context
 * @param organizationName - Organization display name used in generated seed labels
 * @returns Identifiers for the created records
 * @throws {Error} When any API call fails or omits an identifier
 */
export async function seedResponsiveEmployeeData(
	request: APIRequestContext,
	organizationName: string,
): Promise<ResponsiveEmployeeSeed> {
	const locationResponse = await request.post('/api/locations', {
		data: {
			name: `${organizationName} Centro`,
			code: `LOC-${randomUUID().slice(0, 6)}`,
			timeZone: 'America/Mexico_City',
		},
	});
	expect(locationResponse.ok()).toBeTruthy();
	const locationPayload = await locationResponse.json();
	const locationId = locationPayload?.data?.id as string | undefined;
	if (!locationId) {
		throw new Error('Expected location id from /api/locations response.');
	}

	const jobPositionResponse = await request.post('/api/job-positions', {
		data: {
			name: `Operaciones ${randomUUID().slice(0, 4)}`,
		},
	});
	expect(jobPositionResponse.ok()).toBeTruthy();
	const jobPositionPayload = await jobPositionResponse.json();
	const jobPositionId = jobPositionPayload?.data?.id as string | undefined;
	if (!jobPositionId) {
		throw new Error('Expected job position id from /api/job-positions response.');
	}

	const employeeResponse = await request.post('/api/employees', {
		data: {
			code: `RESP-${randomUUID().slice(0, 6)}`,
			firstName: 'Empleado',
			lastName: 'Responsive',
			locationId,
			jobPositionId,
			status: 'ACTIVE',
			dailyPay: 420,
			paymentFrequency: 'WEEKLY',
			periodPay: 2940,
			rfc: 'RESP010101ABC',
			nss: '12345678901',
		},
	});
	expect(employeeResponse.ok()).toBeTruthy();
	const employeePayload = await employeeResponse.json();
	const employeeId = employeePayload?.data?.id as string | undefined;
	if (!employeeId) {
		throw new Error('Expected employee id from /api/employees response.');
	}

	return {
		locationId,
		jobPositionId,
		employeeId,
	};
}

/**
 * Seeds responsive employee data using the active browser session and organization context.
 *
 * @param page - Authenticated Playwright page instance
 * @param organizationName - Organization display name used in generated seed labels
 * @returns Identifiers for the created records
 * @throws {Error} When any browser-side API request fails
 */
export async function seedResponsiveEmployeeDataViaBrowser(
	page: Page,
	organizationName: string,
): Promise<ResponsiveEmployeeSeed> {
	const suffix = randomUUID().slice(0, 6);

	return page.evaluate(
		async ({ orgName, seedSuffix }) => {
			/**
			 * Parses a JSON response and throws a detailed error when it fails.
			 *
			 * @param response - Fetch response to inspect
			 * @returns Parsed JSON payload
			 * @throws {Error} When the response is not OK
			 */
			const readJson = async (response: Response): Promise<unknown> => {
				if (!response.ok) {
					throw new Error(
						`Request failed (${response.status}) at ${response.url}: ${await response.text()}`,
					);
				}
				return response.json();
			};

			const locationPayload = (await readJson(
				await fetch('/api/locations', {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
					},
					body: JSON.stringify({
						name: `${orgName} Centro`,
						code: `LOC-${seedSuffix}`,
						timeZone: 'America/Mexico_City',
					}),
				}),
			)) as { data?: { id?: string } };
			const locationId = locationPayload.data?.id;
			if (!locationId) {
				throw new Error('Expected location id from browser /api/locations response.');
			}

			const jobPositionPayload = (await readJson(
				await fetch('/api/job-positions', {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
					},
					body: JSON.stringify({
						name: `Operaciones ${seedSuffix}`,
					}),
				}),
			)) as { data?: { id?: string } };
			const jobPositionId = jobPositionPayload.data?.id;
			if (!jobPositionId) {
				throw new Error(
					'Expected job position id from browser /api/job-positions response.',
				);
			}

			const employeePayload = (await readJson(
				await fetch('/api/employees', {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
					},
					body: JSON.stringify({
						code: `RESP-${seedSuffix}`,
						firstName: 'Empleado',
						lastName: 'Responsive',
						locationId,
						jobPositionId,
						status: 'ACTIVE',
						dailyPay: 420,
						paymentFrequency: 'WEEKLY',
						periodPay: 2940,
						rfc: 'RESP010101ABC',
						nss: '12345678901',
					}),
				}),
			)) as { data?: { id?: string } };
			const employeeId = employeePayload.data?.id;
			if (!employeeId) {
				throw new Error('Expected employee id from browser /api/employees response.');
			}

			const employeesPayload = (await readJson(
				await fetch('/api/employees?limit=20&offset=0'),
			)) as { data?: Array<{ id?: string }> };
			const canReadSeededEmployee = Boolean(
				employeesPayload.data?.some((employee) => employee.id === employeeId),
			);
			if (!canReadSeededEmployee) {
				throw new Error(
					'Seeded employee was not visible from browser /api/employees listing.',
				);
			}

			return {
				locationId,
				jobPositionId,
				employeeId,
			};
		},
		{
			orgName: organizationName,
			seedSuffix: suffix,
		},
	);
}

/**
 * Forces the newly provisioned organization to be the active Better Auth organization.
 *
 * @param page - Authenticated Playwright page instance
 * @param organizationSlug - Organization slug returned during test registration
 * @returns Promise that resolves when the organization is active for the browser session
 * @throws {Error} When the organization cannot be resolved or activated
 */
export async function setActiveResponsiveOrganization(
	page: Page,
	organizationSlug: string,
): Promise<void> {
	await page.evaluate(async (slug) => {
		/**
		 * Parses a JSON response and throws a detailed error when it fails.
		 *
		 * @param response - Fetch response to inspect
		 * @returns Parsed JSON payload
		 * @throws {Error} When the response is not OK
		 */
		const readJson = async (response: Response): Promise<unknown> => {
			if (!response.ok) {
				throw new Error(
					`Request failed (${response.status}) at ${response.url}: ${await response.text()}`,
				);
			}
			return response.json();
		};

		const payload = (await readJson(
			await fetch('/api/auth/organization/list'),
		)) as { organizations?: AuthOrganization[]; data?: AuthOrganization[] } | AuthOrganization[];
		const organizations = Array.isArray(payload)
			? payload
			: payload.organizations ?? payload.data ?? [];
		const organization = organizations.find((item) => item.slug === slug);
		if (!organization?.id) {
			throw new Error(`Expected organization id for slug "${slug}".`);
		}

		await readJson(
			await fetch('/api/auth/organization/set-active', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					organizationId: organization.id,
				}),
			}),
		);
	}, organizationSlug);
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

/**
 * Asserts that an interactive element meets the minimum touch target height.
 *
 * @param locator - Locator for the interactive element
 * @param minimumHeight - Minimum acceptable height in pixels
 * @returns Promise that resolves when the assertion passes
 * @throws {Error} When the element height is below the required minimum
 */
export async function expectMinimumTouchHeight(
	locator: Locator,
	minimumHeight = 44,
): Promise<void> {
	await expect(locator).toBeVisible({ timeout: 2_000 });
	const box = await locator.boundingBox();

	expect(box).not.toBeNull();
	expect(box?.height ?? 0).toBeGreaterThanOrEqual(minimumHeight);
}
