import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const MOBILE_ROOT = resolve(__dirname, '..');
const BODY_TEXT_TOKEN = 'ios:text-[17px] android:text-[16px]';

describe('Platform typography sizes', () => {
	it('defines a shared body typography token', () => {
		const tokenPath = resolve(MOBILE_ROOT, 'lib/typography.ts');
		expect(existsSync(tokenPath)).toBe(true);

		const content = readFileSync(tokenPath, 'utf-8');
		expect(content).toContain(BODY_TEXT_TOKEN);
		expect(content).toContain('export const BODY_TEXT_CLASS_NAME');
	});

	it('applies the shared body text token on primary descriptive copy', () => {
		const loginContent = readFileSync(resolve(MOBILE_ROOT, 'app/(auth)/login.tsx'), 'utf-8');
		const deviceSetupContent = readFileSync(
			resolve(MOBILE_ROOT, 'app/(auth)/device-setup.tsx'),
			'utf-8',
		);
		const settingsContent = readFileSync(
			resolve(MOBILE_ROOT, 'app/(main)/settings.tsx'),
			'utf-8',
		);
		const faceEnrollmentContent = readFileSync(
			resolve(MOBILE_ROOT, 'app/(main)/face-enrollment.tsx'),
			'utf-8',
		);

		expect(loginContent).toContain('BODY_TEXT_CLASS_NAME');
		expect(deviceSetupContent).toContain('BODY_TEXT_CLASS_NAME');
		expect(settingsContent).toContain('BODY_TEXT_CLASS_NAME');
		expect(faceEnrollmentContent).toContain('BODY_TEXT_CLASS_NAME');
	});
});
