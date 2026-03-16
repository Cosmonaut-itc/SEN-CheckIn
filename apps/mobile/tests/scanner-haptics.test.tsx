import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Scanner haptic feedback', () => {
	it('does not gate scanner haptics behind an iOS-only condition', () => {
		const scannerContent = readFileSync(
			resolve(__dirname, '../app/(main)/scanner.tsx'),
			'utf-8',
		);

		expect(scannerContent).not.toMatch(/if \(isIOS\)\s*\{\s*Haptics\.impactAsync/s);
		expect(scannerContent).not.toMatch(
			/if \(isIOS\)\s*\{\s*Haptics\.notificationAsync/s,
		);
	});
});
