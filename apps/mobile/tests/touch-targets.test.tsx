import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Minimum touch targets', () => {
	it('gives the collapsible header a 48x48 touch target with hit slop', () => {
		const collapsibleContent = readFileSync(
			resolve(__dirname, '../components/ui/collapsible.tsx'),
			'utf-8',
		);

		expect(collapsibleContent).toContain('<PlatformPressable');
		expect(collapsibleContent).toContain('hitSlop={8}');
		expect(collapsibleContent).toContain('minHeight: 48');
		expect(collapsibleContent).toContain('minWidth: 48');
	});

	it('uses 48dp floating back buttons on settings and face enrollment screens', () => {
		const settingsContent = readFileSync(
			resolve(__dirname, '../app/(main)/settings.tsx'),
			'utf-8',
		);
		const faceEnrollmentContent = readFileSync(
			resolve(__dirname, '../app/(main)/face-enrollment.tsx'),
			'utf-8',
		);

		expect(settingsContent).toContain('const floatingBackButtonSize = 48;');
		expect(settingsContent).toContain("className=\"w-12 h-12 rounded-full\"");
		expect(faceEnrollmentContent).toContain('const floatingBackButtonSize = 48;');
		expect(faceEnrollmentContent).toContain("className=\"w-12 h-12 rounded-full\"");
	});
});
