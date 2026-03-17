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

	it('keeps accent aliases mapped to accent instead of collapsing into primary', () => {
		expect(cssContent).toContain('--color-accent: var(--accent);');
		expect(cssContent).toContain('--color-accent-foreground: var(--accent-foreground);');
		expect(cssContent).toContain('--color-accent-bg: var(--accent-bg);');
		expect(cssContent).not.toContain('--color-accent: var(--primary);');
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

	it('defines DS spacing, radius, and shadow tokens for utility classes', () => {
		expect(cssContent).toContain('--spacing: 4px;');
		expect(cssContent).toContain('--radius-sm: 6px;');
		expect(cssContent).toContain('--radius-md: 10px;');
		expect(cssContent).toContain('--radius-md-ios: 10px;');
		expect(cssContent).toContain('--radius-md-android: 12px;');
		expect(cssContent).toContain('--radius-lg: 14px;');
		expect(cssContent).toContain('--radius-lg-ios: 14px;');
		expect(cssContent).toContain('--radius-lg-android: 16px;');
		expect(cssContent).toContain('--radius-xl: 20px;');
		expect(cssContent).toContain('--shadow-sm-token');
		expect(cssContent).toContain('--shadow-md-token');
		expect(cssContent).toContain('--shadow-lg-token');
		expect(cssContent).toContain('--shadow-sm: var(--shadow-sm-token);');
		expect(cssContent).toContain('--shadow-md: var(--shadow-md-token);');
		expect(cssContent).toContain('--shadow-lg: var(--shadow-lg-token);');
	});
});
