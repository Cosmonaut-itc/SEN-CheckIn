import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Face enrollment color migration', () => {
	const content = readFileSync(
		resolve(__dirname, '../app/(main)/face-enrollment.tsx'),
		'utf-8',
	);

	it('does not contain the previous warning and success icon colors', () => {
		expect(content).not.toContain('#f59e0b');
		expect(content).not.toContain('#22c55e');
	});

	it('does not contain the previous placeholder rgba color', () => {
		expect(content).not.toContain('rgba(115,115,115,0.9)');
	});
});
