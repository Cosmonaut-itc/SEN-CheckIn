import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('app.json configuration', () => {
	const config = JSON.parse(readFileSync(resolve(__dirname, '../app.json'), 'utf-8')) as {
		expo: {
			name: string;
			slug: string;
			ios: { bundleIdentifier: string };
			android: {
				adaptiveIcon: { backgroundColor: string };
				predictiveBackGestureEnabled: boolean;
			};
			plugins: unknown[];
		};
	};
	const { expo } = config;

	it('app name is checa.', () => {
		expect(expo.name).toBe('checa.');
	});

	it('splash backgroundColor is Cobre Michoacano', () => {
		const splashPlugin = expo.plugins.find(
			(plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
		) as [string, { backgroundColor: string }] | undefined;

		expect(splashPlugin).toBeDefined();
		expect(splashPlugin?.[1].backgroundColor).toBe('#B8602A');
	});

	it('dark splash backgroundColor is Noche Moreliana', () => {
		const splashPlugin = expo.plugins.find(
			(plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
		) as [string, { dark: { backgroundColor: string } }] | undefined;

		expect(splashPlugin).toBeDefined();
		expect(splashPlugin?.[1].dark.backgroundColor).toBe('#110D0A');
	});

	it('android adaptiveIcon backgroundColor is Cobre Michoacano', () => {
		expect(expo.android.adaptiveIcon.backgroundColor).toBe('#B8602A');
	});

	it('android predictive back gesture remains enabled', () => {
		expect(expo.android.predictiveBackGestureEnabled).toBe(true);
	});

	it('slug stays unchanged', () => {
		expect(expo.slug).toBe('sen-checkin');
	});

	it('bundleIdentifier stays unchanged', () => {
		expect(expo.ios.bundleIdentifier).toBe('com.senapps.sencheckin');
	});

	it('camera permission text references checa.', () => {
		const cameraPlugin = expo.plugins.find(
			(plugin) => Array.isArray(plugin) && plugin[0] === 'expo-camera',
		) as [string, { cameraPermission: string }] | undefined;

		expect(cameraPlugin).toBeDefined();
		expect(cameraPlugin?.[1].cameraPermission).toContain('checa.');
	});
});
