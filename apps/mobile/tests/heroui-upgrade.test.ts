import { existsSync } from 'fs';

/**
 * Read the installed HeroUI Native package manifest used by the mobile app.
 *
 * @returns Installed package metadata relevant to the dependency upgrade
 */
function readHeroUiPackage(): { version: string; main?: string; module?: string } {
	return require('heroui-native/package.json') as {
		version: string;
		main?: string;
		module?: string;
	};
}

describe('HeroUI Native dependency upgrade', () => {
	it('pins heroui-native to 1.0.0', () => {
		const heroUiPackage = readHeroUiPackage();

		expect(heroUiPackage.version).toBe('1.0.0');
	});

	it('keeps the package entry points available after the upgrade', () => {
		const heroUiPackage = readHeroUiPackage();
		const resolvedPackagePath = require.resolve('heroui-native/package.json');
		const packageRoot = resolvedPackagePath.replace(/package\.json$/, '');
		const candidateEntries = [heroUiPackage.module, heroUiPackage.main].filter(
			(entry): entry is string => typeof entry === 'string' && entry.length > 0,
		);

		expect(candidateEntries.length).toBeGreaterThan(0);
		expect(
			candidateEntries.some((entry) => existsSync(require.resolve(`${packageRoot}${entry}`))),
		).toBe(true);
	});
});
