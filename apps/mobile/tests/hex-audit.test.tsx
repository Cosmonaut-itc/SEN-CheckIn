import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const MOBILE_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(MOBILE_ROOT, '..', '..');
const TRACKED_FILES = [
	'app/(main)/scanner.tsx',
	'app/(main)/face-enrollment.tsx',
	'app/(auth)/login.tsx',
	'lib/forms.tsx',
] as const;
const COLOR_LITERAL_PATTERN = /#[0-9a-fA-F]{3,8}\b|rgba?\(/g;

describe('Epic 3 color audit', () => {
	it('keeps owned Epic 3 surfaces free of hardcoded hex and rgb literals', () => {
		const violations = TRACKED_FILES.flatMap((filePath) => {
			const content = readFileSync(resolve(MOBILE_ROOT, filePath), 'utf-8');
			const matches = content.match(COLOR_LITERAL_PATTERN) ?? [];
			return matches.map((match) => `${filePath}: ${match}`);
		});

		expect(violations).toEqual([]);
	});

	it('documents accepted color exceptions for owned surfaces', () => {
		const exceptionsPath = resolve(REPO_ROOT, 'docs/color-exceptions.md');
		expect(existsSync(exceptionsPath)).toBe(true);

		const content = readFileSync(exceptionsPath, 'utf-8');

		expect(content).toContain('apps/mobile/app/(auth)/login.tsx');
		expect(content).toContain('react-qr-code');
		expect(content).toContain('apps/mobile/app/(main)/scanner.tsx');
	});
});
