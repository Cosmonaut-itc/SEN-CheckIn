import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const MOBILE_ROOT = resolve(__dirname, '..');

describe('Empty states with CTA', () => {
	it('defines a reusable empty state component', () => {
		const componentPath = resolve(MOBILE_ROOT, 'components/ui/empty-state.tsx');
		expect(existsSync(componentPath)).toBe(true);

		const content = readFileSync(componentPath, 'utf-8');
		expect(content).toContain('actionLabel');
		expect(content).toContain('onAction');
		expect(content).toContain('Card');
	});

	it('uses the empty state on scanner and face enrollment empty paths', () => {
		const scannerContent = readFileSync(resolve(MOBILE_ROOT, 'app/(main)/scanner.tsx'), 'utf-8');
		const faceEnrollmentContent = readFileSync(
			resolve(MOBILE_ROOT, 'app/(main)/face-enrollment.tsx'),
			'utf-8',
		);

		expect(scannerContent).toContain("from '@/components/ui/empty-state'");
		expect(scannerContent).toContain('<EmptyState');
		expect(faceEnrollmentContent).toContain("from '@/components/ui/empty-state'");
		expect(faceEnrollmentContent).toContain('<EmptyState');
	});
});
