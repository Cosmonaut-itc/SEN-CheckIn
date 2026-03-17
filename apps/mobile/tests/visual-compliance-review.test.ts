import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Visual DS compliance regressions', () => {
	it('avoids placeholder emoji iconography in production mobile surfaces', () => {
		const files = [
			'../app/(auth)/device-setup.tsx',
			'../app/(auth)/login.tsx',
			'../app/(main)/settings.tsx',
			'../components/ui/icon-symbol.tsx',
		].map((relativePath) => readFileSync(resolve(__dirname, relativePath), 'utf-8'));

		const joinedContent = files.join('\n');

		expect(joinedContent).not.toMatch(/[⚠📱💡🏢✓✕⏱✅📷👤🗑❌]/u);
	});
});
