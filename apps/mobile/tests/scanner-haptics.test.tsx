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

	it('does not gate check-out reason haptics behind an iOS-only condition', () => {
		const checkOutReasonSheetContent = readFileSync(
			resolve(__dirname, '../components/attendance/check-out-reason-sheet.tsx'),
			'utf-8',
		);

		expect(checkOutReasonSheetContent).not.toMatch(
			/if \(isIOS\)\s*\{\s*void Haptics\.impactAsync/s,
		);
	});
});
