import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Michoacan theme tokens', () => {
	const cssContent = readFileSync(resolve(__dirname, '../global.css'), 'utf-8');

	it('contains the canonical light background token from the design system', () => {
		expect(cssContent.toLowerCase()).toContain('faf7f3');
	});

	it('contains Cobre Michoacano as the primary token source', () => {
		expect(cssContent.toLowerCase()).toContain('b8602a');
	});

	it('defines destructive with the canonical token name', () => {
		expect(cssContent).toContain('--destructive');
	});

	it('does not define danger as the canonical red token', () => {
		expect(cssContent).not.toMatch(/^\s*--danger\s*:/m);
	});

	it('overrides dark warning away from the accent bug value', () => {
		const darkSection = cssContent.split('@variant dark')[1] ?? '';

		expect(darkSection.toLowerCase()).toContain('f0b840');
		expect(darkSection.toLowerCase()).not.toContain('--warning: #c85a8a');
	});

	it('contains all required semantic tokens for both light and dark modes', () => {
		const requiredTokens = [
			'--background',
			'--foreground',
			'--primary',
			'--secondary',
			'--accent',
			'--muted',
			'--card',
			'--border',
			'--success',
			'--warning',
			'--destructive',
		];

		for (const token of requiredTokens) {
			expect(cssContent).toContain(token);
		}

		expect(cssContent).toContain('@variant light');
		expect(cssContent).toContain('@variant dark');
	});
});
