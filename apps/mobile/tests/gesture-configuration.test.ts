import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

import { ROOT_STACK_SCREEN_OPTIONS } from '@/lib/navigation-config';

const APP_ROOT = resolve(__dirname, '../app');

/**
 * Recursively collect Expo Router source files under the app directory.
 *
 * @param directory - Absolute directory path to inspect
 * @returns Absolute file paths for route source files
 */
function collectRouteSourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			return collectRouteSourceFiles(entryPath);
		}

		return entry.name.endsWith('.tsx') ? [entryPath] : [];
	});
}

describe('Gesture navigation configuration', () => {
	it('uses slide_from_right transitions in the root Expo Router stack', () => {
		expect(ROOT_STACK_SCREEN_OPTIONS.headerShown).toBe(false);
		expect(ROOT_STACK_SCREEN_OPTIONS.animation).toBe('slide_from_right');
	});

	it('does not disable gestures or override the default back affordance in screens', () => {
		const routeSources = collectRouteSourceFiles(APP_ROOT).map((filePath) =>
			readFileSync(filePath, 'utf-8'),
		);

		for (const source of routeSources) {
			expect(source).not.toMatch(/gestureEnabled\s*:\s*false/);
			expect(source).not.toMatch(/headerLeft\s*:/);
		}
	});
});
