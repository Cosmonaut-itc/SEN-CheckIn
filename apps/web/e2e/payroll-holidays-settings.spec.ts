import { expect, test, type APIRequestContext } from '@playwright/test';

import { buildTestRegistrationPayload, registerTestAccounts, signIn } from './helpers/auth';

type AuthOrganization = {
	id: string;
	slug?: string | null;
};

/**
 * Resolves an organization ID by slug from the authenticated Better Auth session.
 *
 * @param request - Playwright API request context
 * @param organizationSlug - Organization slug from test registration
 * @returns Resolved organization id
 */
async function resolveOrganizationId(
	request: APIRequestContext,
	organizationSlug: string,
): Promise<string> {
	const response = await request.get('/api/auth/organization/list');
	expect(response.ok()).toBeTruthy();

	const payload = (await response.json()) as unknown;
	const organizations = Array.isArray(payload)
		? (payload as AuthOrganization[])
		: ((payload as { organizations?: AuthOrganization[]; data?: AuthOrganization[] }).organizations ??
			(payload as { data?: AuthOrganization[] }).data ??
			[]);
	const organization = organizations.find((item) => item.slug === organizationSlug);
	if (!organization?.id) {
		throw new Error(`Expected organization id for slug "${organizationSlug}".`);
	}

	const setActiveResponse = await request.post('/api/auth/organization/set-active', {
		data: { organizationId: organization.id },
	});
	expect(setActiveResponse.ok()).toBeTruthy();
	return organization.id;
}

/**
 * Creates a custom payroll holiday through the API.
 *
 * @param request - Playwright API request context
 * @param organizationId - Organization id used by holidays API
 * @param args - Holiday input
 * @returns Created holiday id
 */
async function createCustomHoliday(
	request: APIRequestContext,
	organizationId: string,
	args: {
		dateKey: string;
		name: string;
		kind?: 'MANDATORY' | 'OPTIONAL';
		recurrence?: 'ONE_TIME' | 'ANNUAL';
	},
): Promise<string> {
	const response = await request.post('/api/payroll-settings/holidays/custom', {
		data: {
			organizationId,
			dateKey: args.dateKey,
			name: args.name,
			kind: args.kind ?? 'MANDATORY',
			recurrence: args.recurrence ?? 'ONE_TIME',
		},
	});

	if (!response.ok()) {
		const body = await response.text();
		throw new Error(
			`Failed to create holiday (${response.status()}) at ${response.url()}: ${body}`,
		);
	}
	const payload = await response.json();
	const createdId = payload?.data?.[0]?.id as string | undefined;
	if (!createdId) {
		throw new Error('Expected created holiday id.');
	}
	return createdId;
}

test('admin can view and deactivate a custom holiday from payroll settings', async ({ page }) => {
	const registration = buildTestRegistrationPayload();
	await registerTestAccounts(page, registration);
	await signIn(page, registration.admin.email, registration.admin.password);

	const organizationId = await resolveOrganizationId(page.request, registration.organizationSlug);
	const customHolidayName = `Feriado E2E ${Date.now()}`;
	await createCustomHoliday(page.request, organizationId, {
		dateKey: '2026-09-16',
		name: customHolidayName,
		kind: 'MANDATORY',
	});

	await page.goto('/payroll-settings');
	await expect(page.getByText('Feriados y descansos obligatorios')).toBeVisible();
	await expect(page.getByText(customHolidayName)).toBeVisible();

	await page.getByRole('button', { name: 'Editar' }).first().click();
	const editDialog = page.getByRole('dialog');
	await editDialog
		.getByText('Estatus activo')
		.locator('..')
		.getByRole('combobox')
		.click();
	await page.getByRole('option', { name: 'Inactivo' }).click();
	await editDialog.getByLabel('Motivo').fill('Desactivación por validación e2e');
	await editDialog.getByRole('button', { name: 'Guardar cambios' }).click();

	await expect(page.getByText('Desactivado')).toBeVisible();
});
