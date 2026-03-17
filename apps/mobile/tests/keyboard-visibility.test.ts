import { readFileSync } from 'fs';
import { resolve } from 'path';

const MOBILE_ROOT = resolve(__dirname, '..');
const KEYBOARD_AWARE_SCREENS = [
	'app/(auth)/login.tsx',
	'app/(auth)/device-setup.tsx',
	'app/(main)/settings.tsx',
	'app/(main)/face-enrollment.tsx',
] as const;

describe('Keyboard visibility safeguards', () => {
	it('wraps input-heavy screens in KeyboardAvoidingView with persistent taps', () => {
		for (const filePath of KEYBOARD_AWARE_SCREENS) {
			const content = readFileSync(resolve(MOBILE_ROOT, filePath), 'utf-8');
			expect(content).toContain('KeyboardAvoidingView');
			expect(content).toContain('keyboardShouldPersistTaps="handled"');
			expect(content).toContain('keyboardVerticalOffset');
		}
	});
});
