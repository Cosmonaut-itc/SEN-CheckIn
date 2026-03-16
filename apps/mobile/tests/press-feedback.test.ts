import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const MOBILE_ROOT = resolve(__dirname, '..');

describe('Platform press feedback', () => {
	it('provides a shared custom pressable with android ripple and iOS opacity', () => {
		const componentPath = resolve(MOBILE_ROOT, 'components/ui/platform-pressable.tsx');
		expect(existsSync(componentPath)).toBe(true);

		const content = readFileSync(componentPath, 'utf-8');
		expect(content).toContain('android_ripple');
		expect(content).toContain('Platform.OS === \'ios\'');
		expect(content).toContain('opacity');
	});

	it('uses the shared pressable in custom touchable surfaces', () => {
		const formsContent = readFileSync(resolve(MOBILE_ROOT, 'lib/forms.tsx'), 'utf-8');
		const collapsibleContent = readFileSync(
			resolve(MOBILE_ROOT, 'components/ui/collapsible.tsx'),
			'utf-8',
		);

		expect(formsContent).toContain("from '@/components/ui/platform-pressable'");
		expect(formsContent).toContain('<PlatformPressable');
		expect(collapsibleContent).toContain("from '@/components/ui/platform-pressable'");
		expect(collapsibleContent).toContain('<PlatformPressable');
	});
});
