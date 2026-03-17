import { readFileSync } from 'fs';
import { resolve } from 'path';

const MOBILE_ROOT = resolve(__dirname, '..');

describe('Font scaling safeguards', () => {
	it('caps HeroUI text scaling while keeping text legible', () => {
		const layoutContent = readFileSync(resolve(MOBILE_ROOT, 'app/_layout.tsx'), 'utf-8');

		expect(layoutContent).toContain('minimumFontScale: 0.5');
		expect(layoutContent).toContain('maxFontSizeMultiplier: 1.5');
	});

	it('keeps descriptive screens scrollable under larger text sizes', () => {
		const loginContent = readFileSync(resolve(MOBILE_ROOT, 'app/(auth)/login.tsx'), 'utf-8');
		const deviceSetupContent = readFileSync(
			resolve(MOBILE_ROOT, 'app/(auth)/device-setup.tsx'),
			'utf-8',
		);
		const settingsContent = readFileSync(
			resolve(MOBILE_ROOT, 'app/(main)/settings.tsx'),
			'utf-8',
		);

		expect(loginContent).toContain('<ScrollView');
		expect(deviceSetupContent).toContain('<ScrollView');
		expect(settingsContent).toContain('<ScrollView');
	});
});
