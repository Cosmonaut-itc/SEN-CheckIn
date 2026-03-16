import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Scanner haptic feedback', () => {
	it('keeps success and error haptics in the scanner flow', () => {
		const scannerContent = readFileSync(
			resolve(__dirname, '../app/(main)/scanner.tsx'),
			'utf-8',
		);

		expect(scannerContent).toContain('Haptics.NotificationFeedbackType.Success');
		expect(scannerContent).toContain('Haptics.NotificationFeedbackType.Error');
		expect(scannerContent).toContain('Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)');
	});
});
