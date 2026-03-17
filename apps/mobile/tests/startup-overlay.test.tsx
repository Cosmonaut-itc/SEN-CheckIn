import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Startup intro overlay', () => {
	const content = readFileSync(
		resolve(__dirname, '../components/startup/startup-intro-overlay.tsx'),
		'utf-8',
	);

	it('does not contain legacy hardcoded dark background', () => {
		expect(content).not.toContain('#000000');
	});

	it('does not contain legacy hardcoded light background', () => {
		expect(content).not.toContain('#ffffff');
	});

	it('does not contain legacy hardcoded spinner color', () => {
		expect(content).not.toContain('#0f172a');
	});

	it('uses useThemeColor for DS token-based colors', () => {
		expect(content).toContain('useThemeColor');
	});
});
