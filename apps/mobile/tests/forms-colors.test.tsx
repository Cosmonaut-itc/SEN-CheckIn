import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Forms color migration', () => {
	const content = readFileSync(resolve(__dirname, '../lib/forms.tsx'), 'utf-8');

	it('does not contain the previous hardcoded select shadow', () => {
		expect(content).not.toContain('rgba(15, 23, 42, 0.2)');
	});

	it('uses design-system overlay tokens instead of raw black scrims', () => {
		expect(content).not.toContain('bg-black/40');
		expect(content).not.toContain('bg-black/50');
		expect(content).toContain('bg-overlay/80');
	});

	it('renders the shared submit CTA as a primary button', () => {
		expect(content).toContain('variant="primary"');
	});

	it('keeps the checkout reason sheet within the DS radius scale', () => {
		const sheetContent = readFileSync(
			resolve(__dirname, '../components/attendance/check-out-reason-sheet.tsx'),
			'utf-8',
		);

		expect(sheetContent).not.toContain('rounded-t-[32px]');
		expect(sheetContent).toContain('rounded-t-xl');
	});
});
