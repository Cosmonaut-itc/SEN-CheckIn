import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Forms color migration', () => {
	const content = readFileSync(resolve(__dirname, '../lib/forms.tsx'), 'utf-8');

	it('does not contain the previous hardcoded select shadow', () => {
		expect(content).not.toContain('rgba(15, 23, 42, 0.2)');
	});
});
