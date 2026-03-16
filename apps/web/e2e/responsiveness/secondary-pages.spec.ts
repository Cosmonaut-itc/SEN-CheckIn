import { expect, test, type Page } from '@playwright/test';

import {
	expectMinimumTouchHeight,
	expectNoHorizontalOverflow,
	provisionResponsiveUser,
	RESPONSIVE_VIEWPORTS,
	seedResponsiveEmployeeDataViaBrowser,
	setActiveResponsiveOrganization,
} from './helpers';

/**
 * Resolves the active organization identifier for a provisioned responsive test org.
 *
 * @param page - Authenticated browser page instance
 * @param organizationSlug - Slug assigned during responsive user provisioning
 * @returns Organization identifier matching the requested slug
 * @throws {Error} When the organization cannot be resolved from the auth endpoint
 */
async function resolveOrganizationId(
	page: Page,
	organizationSlug: string,
): Promise<string> {
	return page.evaluate(async (slug) => {
		/**
		 * Reads a JSON response and throws when the request fails.
		 *
		 * @param response - Fetch response to inspect
		 * @returns Parsed JSON payload
		 * @throws {Error} When the response status is not OK
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
		)) as
			| Array<{ id?: string; slug?: string | null }>
			| {
					organizations?: Array<{ id?: string; slug?: string | null }>;
					data?: Array<{ id?: string; slug?: string | null }>;
			  };
		const organizations = Array.isArray(payload)
			? payload
			: payload.organizations ?? payload.data ?? [];
		const organization = organizations.find((entry) => entry.slug === slug);

		if (!organization?.id) {
			throw new Error(`Expected organization id for slug "${slug}".`);
		}

		return organization.id;
	}, organizationSlug);
}

/**
 * Creates a device for responsive devices-page assertions.
 *
 * @param page - Authenticated browser page instance
 * @param locationId - Location identifier used by the seeded device
 * @returns Promise that resolves after the device is created
 * @throws {Error} When the device request fails
 */
async function seedResponsiveDevice(page: Page, locationId: string): Promise<void> {
	const suffix = `${Date.now()}`;

	await page.evaluate(
		async ({ seedSuffix, targetLocationId }) => {
			const response = await fetch('/api/devices', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					code: `RESP-DEV-${seedSuffix.slice(-6)}`,
					name: 'Reloj de acceso responsive',
					deviceType: 'KIOSK',
					status: 'ONLINE',
					locationId: targetLocationId,
				}),
			});

			if (!response.ok) {
				throw new Error(
					`Failed to create device (${response.status}) at ${response.url}: ${await response.text()}`,
				);
			}
		},
		{
			seedSuffix: suffix,
			targetLocationId: locationId,
		},
	);
}

/**
 * Creates an employee with a historical hire date so vacation accrual rules pass.
 *
 * @param page - Authenticated browser page instance
 * @param locationId - Location identifier assigned to the employee
 * @param jobPositionId - Job position identifier assigned to the employee
 * @returns Created employee identifier
 * @throws {Error} When the employee cannot be created
 */
async function seedVacationEligibleEmployee(
	page: Page,
	locationId: string,
	jobPositionId: string,
): Promise<string> {
	const suffix = `${Date.now()}`;

	return page.evaluate(
		async ({ seedSuffix, targetLocationId, targetJobPositionId }) => {
			const response = await fetch('/api/employees', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					code: `VAC-${seedSuffix.slice(-6)}`,
					firstName: 'Vacaciones',
					lastName: 'Responsive',
					email: `vacaciones.${seedSuffix}@sen-checkin.test`,
					phone: '+52 55 1234 5678',
					locationId: targetLocationId,
					jobPositionId: targetJobPositionId,
					status: 'ACTIVE',
					hireDate: '2020-01-01T00:00:00.000Z',
					dailyPay: 520,
					paymentFrequency: 'WEEKLY',
					periodPay: 3640,
					rfc: `RESP${seedSuffix.slice(-6)}ABC`,
					nss: `12345${seedSuffix.slice(-6)}`,
				}),
			});

			if (!response.ok) {
				throw new Error(
					`Failed to create vacation employee (${response.status}) at ${response.url}: ${await response.text()}`,
				);
			}

			const payload = (await response.json()) as { data?: { id?: string } };
			const employeeId = payload.data?.id;

			if (!employeeId) {
				throw new Error('Expected employee id from /api/employees.');
			}

			return employeeId;
		},
		{
			seedSuffix: suffix,
			targetLocationId: locationId,
			targetJobPositionId: jobPositionId,
		},
	);
}

/**
 * Creates a vacation request visible in the admin vacations listing.
 *
 * @param page - Authenticated browser page instance
 * @param employeeId - Employee identifier that owns the request
 * @returns Promise that resolves after the request is created
 * @throws {Error} When the vacation request cannot be created
 */
async function seedVacationRequest(page: Page, employeeId: string): Promise<void> {
	await page.evaluate(async (targetEmployeeId) => {
		const response = await fetch('/api/vacations/requests', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				employeeId: targetEmployeeId,
				startDateKey: '2026-12-15',
				endDateKey: '2026-12-16',
				status: 'SUBMITTED',
				requestedNotes: 'Cobertura responsive',
			}),
		});

		if (!response.ok) {
			throw new Error(
				`Failed to create vacation request (${response.status}) at ${response.url}: ${await response.text()}`,
			);
		}
	}, employeeId);
}

/**
 * Seeds one overtime authorization for responsive assertions.
 *
 * @param page - Authenticated browser page instance
 * @param organizationId - Active organization identifier
 * @param employeeId - Employee identifier for the authorization
 * @returns Promise that resolves after the authorization is created
 * @throws {Error} When the authorization cannot be created
 */
async function seedOvertimeAuthorization(
	page: Page,
	organizationId: string,
	employeeId: string,
): Promise<void> {
	await page.evaluate(
		async ({ targetOrganizationId, targetEmployeeId }) => {
			const response = await fetch(
				`/api/organizations/${targetOrganizationId}/overtime-authorizations`,
				{
					method: 'POST',
					headers: {
						'content-type': 'application/json',
					},
					body: JSON.stringify({
						employeeId: targetEmployeeId,
						dateKey: '2027-02-02',
						authorizedHours: 2,
						notes: 'Cobertura responsive',
					}),
				},
			);

			if (!response.ok) {
				throw new Error(
					`Failed to create overtime authorization (${response.status}) at ${response.url}: ${await response.text()}`,
				);
			}
		},
		{
			targetOrganizationId: organizationId,
			targetEmployeeId: employeeId,
		},
	);
}

test.describe('secondary responsive pages', () => {
	test('renders stacked cards on devices mobile layout', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		const registration = await provisionResponsiveUser(page);
		await setActiveResponsiveOrganization(page, registration.organizationSlug);
		const { locationId } = await seedResponsiveEmployeeDataViaBrowser(
			page,
			registration.organizationName,
		);
		await seedResponsiveDevice(page, locationId);
		await page.goto(`/devices?responsiveTest=${Date.now()}`);
		await page.reload();

		await expectNoHorizontalOverflow(page);
		await expect(page.getByTestId('responsive-page-header')).toBeVisible();
		await expect(page.getByTestId('responsive-data-view-mobile')).toBeVisible();
		await expect(page.getByTestId('responsive-data-card').first()).toBeVisible();
		await expectMinimumTouchHeight(page.getByTestId('devices-setup-button'));
	});

	test('renders cards and stacked filters on vacations mobile layout', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		const registration = await provisionResponsiveUser(page);
		await setActiveResponsiveOrganization(page, registration.organizationSlug);
		const { locationId, jobPositionId } = await seedResponsiveEmployeeDataViaBrowser(
			page,
			registration.organizationName,
		);
		const employeeId = await seedVacationEligibleEmployee(page, locationId, jobPositionId);
		await seedVacationRequest(page, employeeId);
		await page.goto(`/vacations?responsiveTest=${Date.now()}`);
		await page.reload();

		await expectNoHorizontalOverflow(page);
		await expect(page.getByTestId('responsive-page-header')).toBeVisible();
		await expect(page.getByTestId('responsive-data-view-mobile')).toBeVisible();
		await expect(page.getByTestId('responsive-data-card').first()).toBeVisible();
		await expectMinimumTouchHeight(page.getByTestId('vacations-create-button'));
	});

	test('keeps overtime cards and mobile-friendly dialogs without clipping', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		const registration = await provisionResponsiveUser(page);
		await setActiveResponsiveOrganization(page, registration.organizationSlug);
		const organizationId = await resolveOrganizationId(page, registration.organizationSlug);
		const { employeeId } = await seedResponsiveEmployeeDataViaBrowser(
			page,
			registration.organizationName,
		);
		await seedOvertimeAuthorization(page, organizationId, employeeId);
		await page.goto(`/users?responsiveTest=${Date.now()}`);
		await page.reload();

		await page.getByTestId('users-create-button').click();

		const dialog = page.getByTestId('users-create-dialog');
		await expect(dialog).toBeVisible();
		const dialogBox = await dialog.boundingBox();
		expect(dialogBox).not.toBeNull();
		expect(dialogBox?.width ?? 0).toBeLessThanOrEqual(
			RESPONSIVE_VIEWPORTS.mobile.width - 16,
		);

		await expectMinimumTouchHeight(page.getByTestId('users-create-submit'));

		await page.goto(`/overtime-authorizations?responsiveTest=${Date.now()}`);
		await page.reload();

		await expectNoHorizontalOverflow(page);
		await expect(page.getByTestId('responsive-page-header')).toBeVisible();
		await expect(page.getByTestId('responsive-data-view-mobile')).toBeVisible();
		await expect(page.getByTestId('responsive-data-card').first()).toBeVisible();
		await expectMinimumTouchHeight(page.getByTestId('overtime-create-trigger'));
	});
});
