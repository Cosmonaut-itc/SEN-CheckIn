import { readFileSync } from 'fs';
import { resolve } from 'path';

const MOBILE_ROOT = resolve(__dirname, '..');

describe('Safe area compliance', () => {
	it('keeps edge-to-edge screens aware of device insets', () => {
		const scannerContent = readFileSync(
			resolve(MOBILE_ROOT, 'app/(main)/scanner.tsx'),
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

		expect(scannerContent).toContain('useSafeAreaInsets()');
		expect(settingsContent).toContain('useSafeAreaInsets()');
		expect(faceEnrollmentContent).toContain('useSafeAreaInsets()');
	});

	it('keeps auth flows using automatic content inset adjustment', () => {
		const loginContent = readFileSync(resolve(MOBILE_ROOT, 'app/(auth)/login.tsx'), 'utf-8');
		const deviceSetupContent = readFileSync(
			resolve(MOBILE_ROOT, 'app/(auth)/device-setup.tsx'),
			'utf-8',
		);

		expect(loginContent).toContain('contentInsetAdjustmentBehavior="automatic"');
		expect(deviceSetupContent).toContain('contentInsetAdjustmentBehavior="automatic"');
	});
});
