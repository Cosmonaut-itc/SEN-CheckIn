import { expect, test } from '@playwright/test';

import {
	expectMinimumTouchHeight,
	expectNoHorizontalOverflow,
	RESPONSIVE_VIEWPORTS,
} from './helpers';

test.describe('marketing responsiveness', () => {
	test('stacks the bento grid, trust section, and CTAs on mobile', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		await page.goto('/');

		await expectNoHorizontalOverflow(page);
		await expect(page.getByTestId('landing-bento-grid')).toBeVisible({ timeout: 2_000 });
		await expect(page.getByTestId('landing-trust-section')).toBeVisible({ timeout: 2_000 });

		const bentoColumns = await page
			.getByTestId('landing-bento-grid')
			.evaluate((element) => window.getComputedStyle(element).gridTemplateColumns);
		expect(bentoColumns.split(' ').filter(Boolean)).toHaveLength(1);

		const trustCopyBox = await page.getByTestId('landing-trust-copy').boundingBox();
		const trustTestimonialsBox = await page
			.getByTestId('landing-trust-testimonials')
			.boundingBox();

		expect(trustCopyBox).not.toBeNull();
		expect(trustTestimonialsBox).not.toBeNull();
		expect((trustTestimonialsBox?.y ?? 0) > (trustCopyBox?.y ?? 0)).toBe(true);

		const heroActions = page.getByTestId('landing-hero-actions').getByRole('link');
		await expect(heroActions).toHaveCount(2);

		const primaryHeroButton = heroActions.first();
		const heroActionsBox = await page.getByTestId('landing-hero-actions').boundingBox();
		const primaryHeroButtonBox = await primaryHeroButton.boundingBox();

		expect(heroActionsBox).not.toBeNull();
		expect(primaryHeroButtonBox).not.toBeNull();
		expect((primaryHeroButtonBox?.width ?? 0) + 8).toBeGreaterThanOrEqual(
			heroActionsBox?.width ?? 0,
		);
	});

	test('uses 44px touch targets for marketing navigation and auth CTAs', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		await page.goto('/');

		await expectMinimumTouchHeight(page.getByTestId('marketing-nav-sign-up'));
		await expectMinimumTouchHeight(page.getByTestId('marketing-nav-login'));
		await expectMinimumTouchHeight(page.getByTestId('landing-hero-primary-cta'));
		await expectMinimumTouchHeight(page.getByTestId('landing-hero-secondary-cta'));
	});

	test('uses 44px inputs and submit button on sign-in', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		await page.goto('/sign-in');

		await expectMinimumTouchHeight(page.getByLabel('Correo electrónico'));
		await expectMinimumTouchHeight(page.getByLabel('Contraseña'));
		await expectMinimumTouchHeight(page.getByTestId('sign-in-submit'));
	});

	test('uses 44px inputs and submit button on sign-up', async ({ page }) => {
		await page.setViewportSize(RESPONSIVE_VIEWPORTS.mobile);
		await page.goto('/sign-up');

		await expectMinimumTouchHeight(page.getByLabel('Nombre'));
		await expectMinimumTouchHeight(page.getByLabel('Correo electrónico'));
		await expectMinimumTouchHeight(page.getByLabel('Contraseña').first());
		await expectMinimumTouchHeight(page.getByRole('button', { name: 'Crear cuenta' }));
	});
});
