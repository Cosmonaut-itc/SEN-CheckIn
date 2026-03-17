import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Login color migration', () => {
	const content = readFileSync(resolve(__dirname, '../app/(auth)/login.tsx'), 'utf-8');

	it('does not contain the previous hardcoded QR card shadow', () => {
		expect(content).not.toContain('rgba(15, 23, 42, 0.16)');
	});

	it('uses an inverse foreground token for QR modules in dark mode', () => {
		expect(content).toContain("'foreground-inverse'");
		expect(content).not.toContain("'background-inverse'");
	});

	it('keeps the secondary login CTA visually secondary', () => {
		expect(content).toMatch(/<Button\s+variant="secondary"[\s\S]*Login\.actions\.openLink/);
	});
});
