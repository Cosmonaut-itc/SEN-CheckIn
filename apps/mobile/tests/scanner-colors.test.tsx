import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Scanner color migration', () => {
	const content = readFileSync(resolve(__dirname, '../app/(main)/scanner.tsx'), 'utf-8');

	it('does not contain the previous semantic color literals', () => {
		expect(content).not.toContain('rgba(251, 191, 36, 0.18)');
		expect(content).not.toContain('rgba(245, 158, 11, 0.12)');
		expect(content).not.toContain('rgba(180, 83, 9, 0.22)');
		expect(content).not.toContain('#FCD34D');
		expect(content).not.toContain('#92400E');
	});

	it('does not reference Colors from constants/theme', () => {
		expect(content).not.toContain("from '@/constants/theme'");
	});
});
