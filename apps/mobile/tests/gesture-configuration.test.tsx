import { render } from '@testing-library/react-native';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import type { JSX } from 'react';

import MainLayout from '@/app/(main)/_layout';
import { ROOT_STACK_SCREEN_OPTIONS } from '@/lib/navigation-config';

const APP_ROOT = resolve(__dirname, '../app');
const mockStack = jest.fn();
const mockStackScreen = jest.fn();

jest.mock('expo-router', () => ({
	Redirect: () => null,
}));

jest.mock('expo-router/stack', () => {
	function MockStack({
		children,
		...props
	}: {
		children?: React.ReactNode;
	}): JSX.Element | null {
		mockStack(props);
		return <>{children}</>;
	}
	MockStack.displayName = 'MockStack';

	function MockStackScreen(props: unknown): null {
		mockStackScreen(props);
		return null;
	}
	MockStackScreen.displayName = 'MockStackScreen';
	MockStack.Screen = MockStackScreen;

	return { Stack: MockStack };
});

jest.mock('@/providers/auth-provider', () => ({
	useAuthContext: () => ({
		session: { session: { id: 'session-1' } },
		isLoading: false,
		authState: 'ok',
	}),
}));

jest.mock('@/lib/i18n', () => ({
	i18n: {
		t: (key: string) => key,
	},
}));

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
	beforeEach(() => {
		mockStack.mockReset();
		mockStackScreen.mockReset();
	});

	it('uses slide_from_right transitions in the root Expo Router stack', () => {
		expect(ROOT_STACK_SCREEN_OPTIONS.headerShown).toBe(false);
		expect(ROOT_STACK_SCREEN_OPTIONS.animation).toBe('slide_from_right');
	});

	it('keeps native back gestures enabled in the rendered main stack', () => {
		render(<MainLayout />);

		expect(mockStack).toHaveBeenCalledWith(
			expect.objectContaining({
				screenOptions: expect.objectContaining({
					headerShown: false,
					headerTitleAlign: 'center',
				}),
			}),
		);

		for (const [props] of mockStackScreen.mock.calls as Array<[Record<string, unknown>]>) {
			expect(props.options).not.toEqual(
				expect.objectContaining({
					gestureEnabled: false,
				}),
			);
			expect(props.options).not.toEqual(
				expect.objectContaining({
					headerLeft: expect.anything(),
				}),
			);
		}
	});

	it('does not disable gestures or override the default back affordance anywhere in app routes', () => {
		const routeSources = collectRouteSourceFiles(APP_ROOT).map((filePath) =>
			readFileSync(filePath, 'utf-8'),
		);

		for (const source of routeSources) {
			expect(source).not.toMatch(/gestureEnabled\s*:\s*false/);
			expect(source).not.toMatch(/headerLeft\s*:/);
		}
	});
});
