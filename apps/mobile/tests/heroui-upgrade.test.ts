import { existsSync } from 'fs';

/**
 * Read the mobile app package manifest.
 *
 * @returns Mobile package metadata relevant to dependency policy checks
 */
function readMobilePackage(): {
	dependencies?: Record<string, string>;
	scripts?: Record<string, string>;
} {
	return require('../package.json') as {
		dependencies?: Record<string, string>;
		scripts?: Record<string, string>;
	};
}

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
	it('pins heroui-native to 1.0.2 in the mobile manifest', () => {
		const mobilePackage = readMobilePackage();

		expect(mobilePackage.dependencies?.['heroui-native']).toBe('1.0.2');
	});

	it('keeps the installed package at 1.0.2', () => {
		const heroUiPackage = readHeroUiPackage();

		expect(heroUiPackage.version).toBe('1.0.2');
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

describe('Expo Go development script', () => {
	it('starts Expo Go in offline mode to avoid remote development certificate API failures', () => {
		const mobilePackage = readMobilePackage();

		expect(mobilePackage.scripts?.dev).toContain('--offline');
	});
});
