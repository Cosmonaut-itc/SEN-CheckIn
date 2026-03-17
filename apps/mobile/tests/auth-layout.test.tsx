import { render } from '@testing-library/react-native';
import type { JSX } from 'react';

import AuthLayout from '@/app/(auth)/_layout';

const mockStack = jest.fn();
const mockStackScreen = jest.fn();
const mockUseThemeColor = jest.fn();
const mockRedirect = jest.fn();
const mockUseAuthContext = jest.fn();
const mockUseDeviceContext = jest.fn();
const mockUseSegments = jest.fn();

jest.mock('expo-router', () => ({
	Redirect: ({ href }: { href: string }) => {
		mockRedirect(href);
		return null;
	},
	useSegments: () => mockUseSegments(),
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
	useAuthContext: () => mockUseAuthContext(),
}));

jest.mock('@/lib/device-context', () => ({
	useDeviceContext: () => mockUseDeviceContext(),
}));

jest.mock('@/lib/i18n', () => ({
	i18n: {
		t: (key: string) => key,
	},
}));

describe('AuthLayout', () => {
	beforeEach(() => {
		mockRedirect.mockReset();
		mockStack.mockReset();
		mockStackScreen.mockReset();
		mockUseThemeColor.mockReset();
		mockUseAuthContext.mockReset();
		mockUseDeviceContext.mockReset();
		mockUseSegments.mockReset();
		mockUseThemeColor.mockImplementation((themeColor: string | string[]) => {
			if (Array.isArray(themeColor)) {
				return ['#110D0A', '#F0EAE4'];
			}

			return '#110D0A';
		});
		mockUseAuthContext.mockReturnValue({
			session: null,
			isLoading: false,
			authState: 'ok',
		});
		mockUseDeviceContext.mockReturnValue({
			settings: null,
			isHydrated: true,
		});
		mockUseSegments.mockReturnValue([]);
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

	it('waits for device hydration before redirecting authenticated users away from auth routes', () => {
		mockUseAuthContext.mockReturnValue({
			session: { session: { id: 'session-1' } },
			isLoading: false,
			authState: 'ok',
		});
		mockUseDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				locationId: null,
				organizationId: 'org-1',
			},
			isHydrated: false,
		});

		render(<AuthLayout />);

		expect(mockRedirect).not.toHaveBeenCalled();
	});
});
