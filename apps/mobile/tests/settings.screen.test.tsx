import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import SettingsScreen from '@/app/(main)/settings';

const mockUseQuery = jest.fn();
const mockUseAuthContext = jest.fn();
const mockUseDeviceContext = jest.fn();
const mockSetFieldValue = jest.fn();
const mockToastShow = jest.fn();
const mockSignOut = jest.fn();
const mockClearAuthStorage = jest.fn();
const mockClearPendingAttendanceQueue = jest.fn();
const mockClearSettings = jest.fn();
const mockRouterReplace = jest.fn();
const mockRequestReauth = jest.fn();
let capturedFormConfig:
	| {
			onSubmit: (input: {
				value: {
					name: string;
					locationId: string;
				};
			}) => Promise<void>;
	  }
	| null = null;

jest.mock('@tanstack/react-query', () => ({
	useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

jest.mock('expo-router', () => ({
	useNavigation: () => ({
		canGoBack: () => false,
		goBack: jest.fn(),
	}),
	useRouter: () => ({
		replace: mockRouterReplace,
	}),
}));

jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('heroui-native', () => {
	const ReactNativeActual = jest.requireActual<typeof import('react-native')>('react-native');
	const { Pressable, Text, TextInput, View } = ReactNativeActual;

	const Button = function MockButton({
		children,
		onPress,
		isDisabled,
		accessibilityLabel,
	}: {
		children: React.ReactNode;
		onPress?: () => void;
		isDisabled?: boolean;
		accessibilityLabel?: string;
	}) {
		return (
			<Pressable
				onPress={isDisabled ? undefined : onPress}
				accessibilityRole="button"
				accessibilityLabel={accessibilityLabel}
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
	Card.Header = function MockCardHeader({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
	};
	Card.Footer = function MockCardFooter({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
	};
	Card.Title = function MockCardTitle({ children }: { children: React.ReactNode }) {
		return <Text>{children}</Text>;
	};
	Card.Description = function MockCardDescription({ children }: { children: React.ReactNode }) {
		return <Text>{children}</Text>;
	};

	const Select = function MockSelect({
		children,
		isDisabled,
	}: {
		children: React.ReactNode;
		isDisabled?: boolean;
	}) {
		return (
			<View>
				<Text testID="location-select-disabled-state">
					{isDisabled ? 'disabled' : 'enabled'}
				</Text>
				{children}
			</View>
		);
	};
	Select.Trigger = function MockSelectTrigger({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
	};
	Select.Portal = function MockSelectPortal({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
	};
	Select.Overlay = function MockSelectOverlay() {
		return <View />;
	};
	Select.Content = function MockSelectContent({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
	};
	Select.Close = function MockSelectClose() {
		return <View />;
	};
	Select.ListLabel = function MockSelectListLabel({ children }: { children: React.ReactNode }) {
		return <Text>{children}</Text>;
	};
	Select.Item = function MockSelectItem({ children }: { children: React.ReactNode }) {
		return <View>{children}</View>;
	};
	Select.ItemIndicator = function MockSelectItemIndicator() {
		return <View />;
	};
	Select.TriggerIndicator = function MockSelectTriggerIndicator() {
		return <View />;
	};

	return {
		Button,
		Card,
		Select,
		Separator: () => <View />,
		useThemeColor: () => '#111827',
		useToast: () => ({
			toast: {
				show: mockToastShow,
			},
		}),
		Input: TextInput,
	};
});

jest.mock('@/components/ui/icon-symbol', () => ({
	IconSymbol: () => null,
}));

jest.mock('@/lib/auth-client', () => ({
	clearAuthStorage: (...args: unknown[]) => mockClearAuthStorage(...args),
	signOut: (...args: unknown[]) => mockSignOut(...args),
}));

jest.mock('@/lib/client-functions', () => ({
	fetchLocationsList: jest.fn(),
}));

jest.mock('@/lib/device-context', () => ({
	useDeviceContext: () => mockUseDeviceContext(),
}));

jest.mock('@/lib/forms', () => ({
	useAppForm: (config: {
		onSubmit: (input: {
			value: {
				name: string;
				locationId: string;
			};
		}) => Promise<void>;
	}) => {
		capturedFormConfig = config;

		return {
		setFieldValue: mockSetFieldValue,
		AppField: ({
			children,
			name,
		}: {
			children: (field: {
				state: { value: string; meta: { errors: string[] } };
				handleChange: (value: string) => void;
				TextField: (props: {
					label: string;
					placeholder?: string;
					description?: string;
				}) => React.JSX.Element;
			}) => React.ReactNode;
			name: string;
		}) =>
			children({
				state: {
					value: '',
					meta: { errors: [] },
				},
				handleChange: jest.fn(),
				TextField: ({ label, placeholder, description }) => {
					const ReactNativeActual =
						jest.requireActual<typeof import('react-native')>('react-native');

					return (
						<>
							<ReactNativeActual.Text>{label}</ReactNativeActual.Text>
							{placeholder ? (
								<ReactNativeActual.Text>{placeholder}</ReactNativeActual.Text>
							) : null}
							{description ? (
								<ReactNativeActual.Text>{description}</ReactNativeActual.Text>
							) : null}
						</>
					);
				},
			}),
		AppForm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
		SubmitButton: ({ label }: { label: string }) => {
			const ReactNativeActual =
				jest.requireActual<typeof import('react-native')>('react-native');

			return <ReactNativeActual.Text>{label}</ReactNativeActual.Text>;
		},
		};
	},
}));

jest.mock('@/lib/i18n', () => ({
	i18n: {
		t: (key: string) => key,
	},
}));

jest.mock('@/lib/offline-attendance', () => ({
	clearPendingAttendanceQueue: (...args: unknown[]) => mockClearPendingAttendanceQueue(...args),
}));

jest.mock('@/lib/query-keys', () => ({
	queryKeys: {
		locations: {
			list: ({ organizationId }: { organizationId?: string }) => ['locations', organizationId],
		},
	},
}));

jest.mock('@/lib/typography', () => ({
	BODY_TEXT_CLASS_NAME: 'body-text',
}));

jest.mock('@/providers/auth-provider', () => ({
	useAuthContext: () => mockUseAuthContext(),
}));

describe('SettingsScreen organization gating', () => {
	beforeEach(() => {
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
		mockUseQuery.mockReset();
		mockUseAuthContext.mockReset();
		mockUseDeviceContext.mockReset();
		mockSetFieldValue.mockReset();
		mockToastShow.mockReset();
		mockSignOut.mockReset();
		mockClearAuthStorage.mockReset();
		mockClearPendingAttendanceQueue.mockReset();
		mockClearSettings.mockReset();
		mockRouterReplace.mockReset();
		mockRequestReauth.mockReset();
		capturedFormConfig = null;

		mockUseQuery.mockReturnValue({
			data: null,
			isError: false,
			isPending: false,
		});
		mockUseAuthContext.mockReturnValue({
			session: null,
			requestReauth: mockRequestReauth,
		});
		mockUseDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				name: 'Terminal A',
				locationId: null,
				organizationId: null,
			},
			isHydrated: true,
			isUpdating: false,
			saveRemoteSettings: jest.fn(),
			updateLocalSettings: jest.fn(),
			clearSettings: mockClearSettings,
		});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('disables the location select when there is no active organization', () => {
		render(<SettingsScreen />);

		expect(mockUseQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				enabled: false,
			}),
		);
		expect(screen.getByTestId('location-select-disabled-state')).toHaveTextContent('disabled');
	});

	it('clears the pending offline queue when signing out', async () => {
		mockSignOut.mockResolvedValue(undefined);
		mockClearAuthStorage.mockResolvedValue(undefined);
		mockClearPendingAttendanceQueue.mockResolvedValue(undefined);

		render(<SettingsScreen />);

		fireEvent.press(screen.getByText('Settings.actions.signOut'));

		await waitFor(() => {
			expect(mockSignOut).toHaveBeenCalledTimes(1);
			expect(mockClearAuthStorage).toHaveBeenCalledTimes(1);
			expect(mockClearPendingAttendanceQueue).toHaveBeenCalledTimes(1);
			expect(mockClearSettings).toHaveBeenCalledTimes(1);
			expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/login');
			expect(mockToastShow).toHaveBeenCalled();
		});
	});

	it('still clears local settings when offline queue cleanup fails during sign-out', async () => {
		mockSignOut.mockResolvedValue(undefined);
		mockClearAuthStorage.mockResolvedValue(undefined);
		mockClearPendingAttendanceQueue.mockRejectedValue(new Error('secure-store unavailable'));

		render(<SettingsScreen />);

		fireEvent.press(screen.getByText('Settings.actions.signOut'));

		await waitFor(() => {
			expect(mockSignOut).toHaveBeenCalledTimes(1);
			expect(mockClearAuthStorage).toHaveBeenCalledTimes(1);
			expect(mockClearPendingAttendanceQueue).toHaveBeenCalledTimes(1);
			expect(mockClearSettings).toHaveBeenCalledTimes(1);
			expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/login');
			expect(mockToastShow).toHaveBeenCalledWith(
				expect.objectContaining({
					variant: 'success',
				}),
			);
		});
	});

	it('logs the underlying save failure before showing the fallback toast', async () => {
		const saveError = new Error('save failed');
		const mockSaveRemoteSettings = jest.fn().mockRejectedValue(saveError);
		mockUseDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				name: 'Terminal A',
				locationId: null,
				organizationId: 'org-1',
			},
			isHydrated: true,
			isUpdating: false,
			saveRemoteSettings: mockSaveRemoteSettings,
			updateLocalSettings: jest.fn(),
			clearSettings: mockClearSettings,
		});

		render(<SettingsScreen />);

		expect(capturedFormConfig).not.toBeNull();

		if (!capturedFormConfig) {
			throw new Error('Expected SettingsScreen to provide a form config');
		}

		await capturedFormConfig.onSubmit({
			value: {
				name: 'Terminal B',
				locationId: 'location-1',
			},
		});

		expect(console.error).toHaveBeenCalledWith(
			'[settings] Failed to save device settings',
			saveError,
		);
		expect(mockToastShow).toHaveBeenCalledWith(
			expect.objectContaining({
				variant: 'danger',
			}),
		);
	});

	it('logs the underlying sign-out failure before showing the fallback toast', async () => {
		const signOutError = new Error('sign out failed');
		mockSignOut.mockRejectedValue(signOutError);
		mockRequestReauth.mockResolvedValue(undefined);
		mockClearAuthStorage.mockResolvedValue(undefined);
		mockClearPendingAttendanceQueue.mockResolvedValue(undefined);
		mockClearSettings.mockResolvedValue(undefined);

		render(<SettingsScreen />);

		fireEvent.press(screen.getByText('Settings.actions.signOut'));

		await waitFor(() => {
			expect(console.error).toHaveBeenCalledWith(
				'[settings] Failed to sign out from settings',
				signOutError,
			);
			expect(mockRequestReauth).toHaveBeenCalledWith({
				forceLock: true,
				reason: 'manual',
			});
			expect(mockClearAuthStorage).toHaveBeenCalledTimes(1);
			expect(mockClearPendingAttendanceQueue).toHaveBeenCalledTimes(1);
			expect(mockClearSettings).toHaveBeenCalledTimes(1);
			expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/login');
			expect(mockToastShow).toHaveBeenCalledWith(
				expect.objectContaining({
					variant: 'danger',
				}),
			);
		});
	});

	it('still clears local state and routes to login when reauth lock fails during sign-out fallback', async () => {
		mockSignOut.mockRejectedValue(new Error('sign out failed'));
		mockRequestReauth.mockRejectedValue(new Error('reauth failed'));
		mockClearAuthStorage.mockResolvedValue(undefined);
		mockClearPendingAttendanceQueue.mockResolvedValue(undefined);
		mockClearSettings.mockResolvedValue(undefined);

		render(<SettingsScreen />);

		fireEvent.press(screen.getByText('Settings.actions.signOut'));

		await waitFor(() => {
			expect(mockRequestReauth).toHaveBeenCalledWith({
				forceLock: true,
				reason: 'manual',
			});
			expect(mockClearAuthStorage).toHaveBeenCalledTimes(1);
			expect(mockClearPendingAttendanceQueue).toHaveBeenCalledTimes(1);
			expect(mockClearSettings).toHaveBeenCalledTimes(1);
			expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/login');
		});
	});
});
