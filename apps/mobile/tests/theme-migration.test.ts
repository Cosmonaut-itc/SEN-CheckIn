import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

/**
 * Recursively collect TypeScript source files in the mobile app.
 *
 * @param directoryPath - Absolute directory path to scan
 * @returns Absolute file paths for .ts and .tsx files
 */
function collectTypeScriptFiles(directoryPath: string): string[] {
	const entries = readdirSync(directoryPath, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const entryPath = resolve(directoryPath, entry.name);

		if (entry.isDirectory()) {
			if (['node_modules', 'dist'].includes(entry.name)) {
				continue;
			}

			files.push(...collectTypeScriptFiles(entryPath));
			continue;
		}

		if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
			files.push(entryPath);
		}
	}

	return files;
}

describe('Theme migration', () => {
	const mobileRoot = resolve(__dirname, '..');

	it('removes the legacy constants/theme.ts file', () => {
		expect(existsSync(resolve(mobileRoot, 'constants/theme.ts'))).toBe(false);
	});

	it('keeps Fonts in constants/fonts.ts', () => {
		const fontsPath = resolve(mobileRoot, 'constants/fonts.ts');

		expect(existsSync(fontsPath)).toBe(true);
		expect(readFileSync(fontsPath, 'utf-8')).toContain('export const Fonts');
	});

	it('removes all imports from constants/theme', () => {
		const sourceFiles = collectTypeScriptFiles(mobileRoot).filter((filePath) => {
			const relativePath = filePath.replace(`${mobileRoot}/`, '');

			return !relativePath.startsWith('tests/');
		});

		for (const filePath of sourceFiles) {
			const content = readFileSync(filePath, 'utf-8');

			expect(content).not.toContain("from '@/constants/theme'");
			expect(content).not.toContain('from "@/constants/theme"');
		}
	});
});
