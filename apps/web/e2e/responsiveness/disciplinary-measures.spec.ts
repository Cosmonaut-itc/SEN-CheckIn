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
 * Enables the disciplinary module and creates one disciplinary measure for responsive assertions.
 *
 * @param page - Authenticated browser page instance
 * @param employeeId - Employee identifier used for the seeded measure
 * @returns Promise that resolves after the module and measure are ready
 * @throws {Error} When any setup request fails
 */
async function seedResponsiveDisciplinaryMeasure(
	page: Page,
	employeeId: string,
): Promise<void> {
	await page.evaluate(async (targetEmployeeId) => {
		/**
		 * Parses a JSON response and throws a detailed error when it fails.
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

		await readJson(
			await fetch('/api/payroll-settings', {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					enableDisciplinaryMeasures: true,
				}),
			}),
		);

		await readJson(
			await fetch('/api/disciplinary-measures', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					employeeId: targetEmployeeId,
					incidentDateKey: '2026-02-10',
					reason: 'Incumplimiento de lineamientos operativos durante auditoría.',
					outcome: 'warning',
				}),
			}),
		);
	}, employeeId);
}

test.describe('disciplinary measures responsiveness', () => {
	test('renders mobile cards without horizontal overflow and preserves touch targets', async ({
		page,
	}) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		const registration = await provisionResponsiveUser(page);
		await setActiveResponsiveOrganization(page, registration.organizationSlug);
		const { employeeId } = await seedResponsiveEmployeeDataViaBrowser(
			page,
			registration.organizationName,
		);
		await seedResponsiveDisciplinaryMeasure(page, employeeId);

		await page.goto(`/disciplinary-measures?responsiveTest=${Date.now()}`);
		await page.reload();

		await expectNoHorizontalOverflow(page);
		await expect(page.getByTestId('responsive-page-header')).toBeVisible();
		await expect(page.getByTestId('responsive-data-view-mobile')).toBeVisible();
		await expect(page.getByTestId('responsive-data-card').first()).toBeVisible();
		await expect(page.getByRole('table')).toHaveCount(0);

		await expectMinimumTouchHeight(page.getByRole('button', { name: 'Crear medida' }));
		await expectMinimumTouchHeight(page.getByRole('button', { name: 'Ver detalle' }).first());
	});
});
