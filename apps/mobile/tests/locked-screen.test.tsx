import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import LockedScreen from '@/app/(auth)/locked';

const mockReplace = jest.fn();
const mockSignOut = jest.fn();
const mockClearAuthStorage = jest.fn();
const mockRequestReauth = jest.fn();
const mockClearSettingsAccessGrants = jest.fn();

jest.mock('expo-router', () => ({
	useRouter: () => ({
		replace: mockReplace,
	}),
}));

jest.mock('heroui-native', () => {
	const ReactNativeActual = jest.requireActual<typeof import('react-native')>('react-native');
	const { Pressable, Text, View } = ReactNativeActual;

	const Button = function MockButton({
		children,
		onPress,
		isDisabled,
	}: {
		children: React.ReactNode;
		onPress?: () => void;
		isDisabled?: boolean;
	}) {
		return (
			<Pressable
				onPress={isDisabled ? undefined : onPress}
				accessibilityRole="button"
				disabled={isDisabled}
			>
				<View>{children}</View>
			</Pressable>
		);
	};
	Button.Label = function MockButtonLabel({ children }: { children: React.ReactNode }) {
		return <Text>{children}</Text>;
	};

	const Card = function MockCard({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
	};
	Card.Body = function MockCardBody({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
	};

	return {
		Button,
		Card,
	};
});

jest.mock('@/lib/i18n', () => ({
	i18n: {
		t: (key: string) => key,
	},
}));

jest.mock('@/lib/auth-client', () => ({
	clearAuthStorage: () => mockClearAuthStorage(),
	signOut: () => mockSignOut(),
}));

jest.mock('@/lib/settings-access-guard', () => ({
	clearSettingsAccessGrants: () => mockClearSettingsAccessGrants(),
}));

jest.mock('@/providers/auth-provider', () => ({
	useAuthContext: () => ({
		requestReauth: (...args: unknown[]) => mockRequestReauth(...args),
		lockReason: 'refresh_failed',
	}),
}));

describe('LockedScreen sign-in recovery', () => {
	beforeEach(() => {
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		mockReplace.mockReset();
		mockSignOut.mockReset();
		mockClearAuthStorage.mockReset();
		mockRequestReauth.mockReset();
		mockClearSettingsAccessGrants.mockReset();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('still routes to login when auth cleanup fails on the locked screen', async () => {
		mockSignOut.mockResolvedValue(undefined);
		mockClearAuthStorage.mockRejectedValue(new Error('secure-store unavailable'));

		render(<LockedScreen />);

		fireEvent.press(screen.getByText('Locked.actions.signIn'));

		await waitFor(
			() => {
				expect(mockClearSettingsAccessGrants).toHaveBeenCalledTimes(1);
				expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
			},
			{ timeout: 10_000 },
		);
	}, 15_000);

	it('clears temporary settings PIN grants before returning to sign-in', async () => {
		mockSignOut.mockResolvedValue(undefined);
		mockClearAuthStorage.mockResolvedValue(undefined);

		render(<LockedScreen />);

		fireEvent.press(screen.getByText('Locked.actions.signIn'));

		await waitFor(() => {
			expect(mockClearSettingsAccessGrants).toHaveBeenCalledTimes(1);
			expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
		});
	});
});
