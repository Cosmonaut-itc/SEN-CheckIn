import { render } from '@testing-library/react-native';
import type { JSX } from 'react';

import AuthLayout from '@/app/(auth)/_layout';

const mockStack = jest.fn();
const mockStackScreen = jest.fn();
const mockUseThemeColor = jest.fn();

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

jest.mock('@/hooks/use-theme-color', () => ({
	useThemeColor: (themeColor: string | string[]) => mockUseThemeColor(themeColor),
}));

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

jest.mock('@/lib/i18n', () => ({
	i18n: {
		t: (key: string) => key,
	},
}));

describe('AuthLayout', () => {
	beforeEach(() => {
		mockStack.mockReset();
		mockStackScreen.mockReset();
		mockUseThemeColor.mockReset();
		mockUseThemeColor.mockImplementation((themeColor: string | string[]) => {
			if (Array.isArray(themeColor)) {
				return ['#110D0A', '#F0EAE4'];
			}

			return '#110D0A';
		});
	});

	it('uses dark themed native header colors when the app is in dark mode', () => {
		render(<AuthLayout />);

		expect(mockStack).toHaveBeenCalledWith(
			expect.objectContaining({
				screenOptions: expect.objectContaining({
					headerStyle: {
						backgroundColor: '#110D0A',
					},
					headerTintColor: '#F0EAE4',
					headerTitleStyle: {
						color: '#F0EAE4',
					},
				}),
			}),
		);
	});
});
