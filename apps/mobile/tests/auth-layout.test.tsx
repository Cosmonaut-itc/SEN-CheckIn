import { render } from '@testing-library/react-native';
import type { JSX } from 'react';

import { Colors } from '@/constants/theme';
import AuthLayout from '@/app/(auth)/_layout';

const mockStack = jest.fn();
const mockStackScreen = jest.fn();

jest.mock('expo-router', () => ({
	Redirect: () => null,
	useSegments: () => [],
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
		session: null,
		isLoading: false,
		authState: 'ok',
	}),
}));

jest.mock('@/lib/device-context', () => ({
	useDeviceContext: () => ({
		settings: null,
		isHydrated: true,
	}),
}));

jest.mock('@/providers/theme-provider', () => ({
	useTheme: () => ({
		colorScheme: 'dark',
		isDarkMode: true,
	}),
}));

jest.mock('@/lib/i18n', () => ({
	i18n: {
		t: (key: string) => key,
	},
}));

describe('AuthLayout', () => {
	beforeEach(() => {
		mockStack.mockReset();
		mockStackScreen.mockReset();
	});

	it('uses dark themed native header colors when the app is in dark mode', () => {
		render(<AuthLayout />);

		expect(mockStack).toHaveBeenCalledWith(
			expect.objectContaining({
				screenOptions: expect.objectContaining({
					headerStyle: {
						backgroundColor: Colors.dark.background,
					},
					headerTintColor: Colors.dark.foreground,
					headerTitleStyle: {
						color: Colors.dark.foreground,
					},
				}),
			}),
		);
	});
});
