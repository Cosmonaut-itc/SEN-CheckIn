import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Animated } from 'react-native';

import ScannerScreen from '@/app/(main)/scanner';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockFetchDeviceSettingsPinStatus = jest.fn();
const mockVerifyDeviceSettingsPin = jest.fn();
const mockGrantSettingsAccess = jest.fn();
const mockToastShow = jest.fn();
const mockRequestReauth = jest.fn();
const mockSignOut = jest.fn();
const mockClearAuthStorage = jest.fn();
const mockClearPendingAttendanceQueue = jest.fn();
const mockDeviceContext = jest.fn();

type MockAuthContext = {
	authState: 'ok' | 'refreshing' | 'grace' | 'locked';
	isLoading: boolean;
	requestReauth: typeof mockRequestReauth;
	session: { session: { id: string } } | null;
};

const mockAuthContext: MockAuthContext = {
	authState: 'ok',
	isLoading: false,
	requestReauth: mockRequestReauth,
	session: { session: { id: 'session-1' } },
};
const mockThemeColors: Record<string, string> = {
	background: '#110D0A',
	border: '#3D3028',
	danger: '#E8605A',
	'default-hover': '#342A24',
	foreground: '#F0EAE4',
	muted: '#9A8B80',
	overlay: '#342A24',
	primary: '#B8602A',
	success: '#5CC98A',
	surface: '#1C1613',
	warning: '#F0B840',
};

jest.mock('expo-router', () => ({
	Redirect: ({ href }: { href: string }) => {
		mockReplace(href);
		return null;
	},
	useRouter: () => ({
		push: mockPush,
		replace: mockReplace,
	}),
	useFocusEffect: (callback: () => void | (() => void)) => {
		const ReactActual = jest.requireActual<typeof import('react')>('react');
		ReactActual.useEffect(() => callback(), [callback]);
	},
}));

jest.mock('expo-camera', () => {
	const ReactActual = jest.requireActual<typeof import('react')>('react');
	const ReactNativeActual = jest.requireActual<typeof import('react-native')>('react-native');

	const CameraView = ReactActual.forwardRef((props: unknown, ref: React.Ref<unknown>) => {
		ReactActual.useImperativeHandle(ref, () => ({
			takePictureAsync: jest.fn(),
		}));
		return <ReactNativeActual.View testID="camera-view" {...(props as object)} />;
	});
	CameraView.displayName = 'MockCameraView';

	return {
		CameraView,
		useCameraPermissions: () => [{ granted: true }, jest.fn()],
	};
});

jest.mock('expo-haptics', () => ({
	ImpactFeedbackStyle: { Light: 'light' },
	NotificationFeedbackType: { Error: 'error', Success: 'success' },
	impactAsync: jest.fn(),
	notificationAsync: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@react-native-community/netinfo', () => ({
	__esModule: true,
	default: {
		fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
		addEventListener: jest.fn(() => jest.fn()),
	},
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
	Card.Title = function MockCardTitle({ children }: { children: React.ReactNode }) {
		return <Text>{children}</Text>;
	};
	Card.Description = function MockCardDescription({ children }: { children: React.ReactNode }) {
		return <Text>{children}</Text>;
	};

	const InputOTP = function MockInputOTP({
		accessibilityLabel,
		children,
		value,
		onChange,
		maxLength,
		textInputProps,
	}: {
		accessibilityLabel?: string;
		children?: React.ReactNode;
		value?: string;
		onChange?: (value: string) => void;
		maxLength?: number;
		textInputProps?: {
			accessibilityLabel?: string;
			secureTextEntry?: boolean;
		};
	}) {
		return (
			<View>
				<TextInput
					accessibilityLabel={accessibilityLabel ?? textInputProps?.accessibilityLabel}
					value={value}
					onChangeText={onChange}
					maxLength={maxLength}
					secureTextEntry={textInputProps?.secureTextEntry}
				/>
				{children}
			</View>
		);
	};
	InputOTP.Slot = function MockInputOTPSlot({ children }: { children?: React.ReactNode }) {
		return <View>{children}</View>;
	};
	InputOTP.Group = function MockInputOTPGroup({ children }: { children?: React.ReactNode }) {
		return <View>{children}</View>;
	};
	InputOTP.SlotPlaceholder = function MockInputOTPSlotPlaceholder() {
		return <Text>-</Text>;
	};
	InputOTP.SlotCaret = function MockInputOTPSlotCaret() {
		return null;
	};

	return {
		Button,
		Card,
		InputOTP,
		REGEXP_ONLY_DIGITS: /^[0-9]+$/,
		Spinner: () => <Text>Cargando...</Text>,
		useToast: () => ({
			toast: {
				show: mockToastShow,
			},
		}),
	};
});

jest.mock('@/components/ui/icon-symbol', () => ({
	IconSymbol: function MockIconSymbol() {
		const ReactNativeActual = jest.requireActual<typeof import('react-native')>('react-native');
		return <ReactNativeActual.View testID="icon-symbol" />;
	},
}));

jest.mock('@/components/ui/empty-state', () => ({
	EmptyState: function MockEmptyState({
		title,
		description,
		actionLabel,
		onAction,
	}: {
		title: string;
		description: string;
		actionLabel: string;
		onAction: () => void;
	}) {
		const ReactNativeActual = jest.requireActual<typeof import('react-native')>('react-native');
		return (
			<ReactNativeActual.View>
				<ReactNativeActual.Text>{title}</ReactNativeActual.Text>
				<ReactNativeActual.Text>{description}</ReactNativeActual.Text>
				<ReactNativeActual.Pressable onPress={onAction}>
					<ReactNativeActual.Text>{actionLabel}</ReactNativeActual.Text>
				</ReactNativeActual.Pressable>
			</ReactNativeActual.View>
		);
	},
}));

jest.mock('@/components/attendance/check-out-reason-sheet', () => ({
	CheckOutReasonSheet: function MockCheckOutReasonSheet() {
		return null;
	},
}));

jest.mock('@/providers/theme-provider', () => ({
	useTheme: () => ({
		colorScheme: 'dark',
		isDarkMode: true,
	}),
}));

jest.mock('@/hooks/use-theme-color', () => ({
	useThemeColor: (themeColor: string | string[]) =>
		Array.isArray(themeColor)
			? themeColor.map((token) => mockThemeColors[token] ?? '#FFFFFF')
			: (mockThemeColors[themeColor] ?? '#FFFFFF'),
}));

jest.mock('@/lib/device-context', () => ({
	useDeviceContext: () => mockDeviceContext(),
}));

jest.mock('@/providers/auth-provider', () => ({
	useAuthContext: () => mockAuthContext,
}));

jest.mock('@/lib/auth-client', () => ({
	clearAuthStorage: (...args: unknown[]) => mockClearAuthStorage(...args),
	signOut: (...args: unknown[]) => mockSignOut(...args),
}));

jest.mock('@/lib/offline-attendance', () => {
	return {
		isOfflineNetInfoState: (state: {
			isConnected?: boolean | null;
			isInternetReachable?: boolean | null;
		}) => state.isConnected === false || state.isInternetReachable === false,
		clearPendingAttendanceQueue: (...args: unknown[]) =>
			mockClearPendingAttendanceQueue(...args),
	};
});

jest.mock('@/lib/attendance-capture-lock', () => ({
	releaseAttendanceCaptureLock: jest.fn(),
	tryAcquireAttendanceCaptureLock: jest.fn(() => true),
}));

jest.mock('@/lib/face-recognition', () => ({
	FaceVerificationError: class FaceVerificationError extends Error {},
	recordAttendance: jest.fn(),
	verifyFace: jest.fn(),
}));

jest.mock('@/lib/recognition-image', () => ({
	cleanupRecognitionImage: jest.fn(),
	prepareRecognitionImage: jest.fn(),
}));

jest.mock('@/lib/settings-pin-client', () => ({
	fetchDeviceSettingsPinStatus: (...args: unknown[]) => mockFetchDeviceSettingsPinStatus(...args),
	isDeviceSettingsPinError: (error: unknown) =>
		error instanceof Error && error.name === 'DeviceSettingsPinError',
	verifyDeviceSettingsPin: (...args: unknown[]) => mockVerifyDeviceSettingsPin(...args),
}));

jest.mock('@/lib/settings-access-guard', () => ({
	grantSettingsAccess: (...args: unknown[]) => mockGrantSettingsAccess(...args),
}));

describe('ScannerScreen settings PIN gate', () => {
	beforeEach(() => {
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		jest.spyOn(Animated, 'loop').mockImplementation(
			() =>
				({
					start: () => undefined,
					stop: () => undefined,
					reset: () => undefined,
				}) as Animated.CompositeAnimation,
		);
		jest.spyOn(Animated, 'timing').mockImplementation(
			() =>
				({
					start: () => undefined,
					stop: () => undefined,
					reset: () => undefined,
				}) as Animated.CompositeAnimation,
		);
		mockPush.mockReset();
		mockReplace.mockReset();
		mockFetchDeviceSettingsPinStatus.mockReset();
		mockVerifyDeviceSettingsPin.mockReset();
		mockGrantSettingsAccess.mockReset();
		mockToastShow.mockReset();
		mockRequestReauth.mockReset();
		mockSignOut.mockReset();
		mockClearAuthStorage.mockReset();
		mockClearPendingAttendanceQueue.mockReset();
		mockAuthContext.authState = 'ok';
		mockAuthContext.isLoading = false;
		mockAuthContext.session = { session: { id: 'session-1' } };
		mockDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				locationId: 'location-1',
				name: 'Terminal A',
			},
			clearSettings: jest.fn(),
		});
	});

	it('shows a forced sign-out action instead of scan when the device has no session', async () => {
		const mockClearSettings = jest.fn();
		mockAuthContext.authState = 'grace';
		mockAuthContext.session = null;
		mockDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				locationId: 'location-1',
				name: 'Terminal A',
			},
			clearSettings: mockClearSettings,
		});

		render(<ScannerScreen />);

		expect(screen.getByText('Cerrar sesión')).toBeOnTheScreen();
		expect(screen.queryByText('Escanear entrada')).not.toBeOnTheScreen();

		fireEvent.press(screen.getByText('Cerrar sesión'));

		await waitFor(() => {
			expect(mockSignOut).toHaveBeenCalled();
			expect(mockClearAuthStorage).toHaveBeenCalled();
			expect(mockClearPendingAttendanceQueue).toHaveBeenCalled();
			expect(mockClearSettings).toHaveBeenCalled();
			expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
		});
	});

	it('does not request settings PIN status while auth is recovering without a session', async () => {
		mockAuthContext.authState = 'grace';
		mockAuthContext.session = null;

		render(<ScannerScreen />);

		fireEvent.press(screen.getByLabelText('Abrir configuración del dispositivo'));

		await waitFor(() => {
			expect(mockFetchDeviceSettingsPinStatus).not.toHaveBeenCalled();
			expect(mockPush).not.toHaveBeenCalledWith('/(main)/settings');
			expect(mockToastShow).toHaveBeenCalledWith(
				expect.objectContaining({
					variant: 'danger',
					label: 'No se pudo validar el acceso',
				}),
			);
		});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('navigates immediately when the API says no settings PIN is required', async () => {
		mockFetchDeviceSettingsPinStatus.mockResolvedValue({
			deviceId: 'device-1',
			mode: 'GLOBAL',
			pinRequired: false,
			source: 'NONE',
			globalPinConfigured: false,
			deviceOverrideConfigured: false,
		});

		render(<ScannerScreen />);

		fireEvent.press(screen.getByLabelText('Abrir configuración del dispositivo'));

		await waitFor(() => {
			expect(mockFetchDeviceSettingsPinStatus).toHaveBeenCalledWith('device-1');
			expect(mockGrantSettingsAccess).toHaveBeenCalledWith('device-1');
			expect(mockPush).toHaveBeenCalledWith('/(main)/settings');
		});
	});

	it('opens the OTP gate when settings PIN is required', async () => {
		mockFetchDeviceSettingsPinStatus.mockResolvedValue({
			deviceId: 'device-1',
			mode: 'GLOBAL',
			pinRequired: true,
			source: 'GLOBAL',
			globalPinConfigured: true,
			deviceOverrideConfigured: false,
		});

		render(<ScannerScreen />);

		fireEvent.press(screen.getByLabelText('Abrir configuración del dispositivo'));

		expect(await screen.findByText('PIN de configuración')).toBeOnTheScreen();
		expect(mockPush).not.toHaveBeenCalledWith('/(main)/settings');
	});

	it('centers the OTP gate so the keyboard does not cover the confirmation action', async () => {
		mockFetchDeviceSettingsPinStatus.mockResolvedValue({
			deviceId: 'device-1',
			mode: 'GLOBAL',
			pinRequired: true,
			source: 'GLOBAL',
			globalPinConfigured: true,
			deviceOverrideConfigured: false,
		});

		render(<ScannerScreen />);

		fireEvent.press(screen.getByLabelText('Abrir configuración del dispositivo'));

		const backdrop = await screen.findByTestId('settings-pin-modal-backdrop');
		expect(backdrop).toHaveProp('className', expect.stringContaining('justify-center'));
		expect(backdrop).not.toHaveProp('className', expect.stringContaining('justify-end'));
	});

	it('masks the entered settings PIN digits in the gate', async () => {
		mockFetchDeviceSettingsPinStatus.mockResolvedValue({
			deviceId: 'device-1',
			mode: 'GLOBAL',
			pinRequired: true,
			source: 'GLOBAL',
			globalPinConfigured: true,
			deviceOverrideConfigured: false,
		});

		render(<ScannerScreen />);

		fireEvent.press(screen.getByLabelText('Abrir configuración del dispositivo'));
		fireEvent.changeText(await screen.findByLabelText('PIN de configuración'), '1234');

		expect(screen.getAllByText('*', { includeHiddenElements: true })).toHaveLength(4);
		expect(screen.getByLabelText('PIN de configuración')).toHaveProp('secureTextEntry', true);
		expect(screen.queryByText('1234')).not.toBeOnTheScreen();
	});

	it('keeps the user on scanner and shows an error when the PIN is incorrect', async () => {
		mockFetchDeviceSettingsPinStatus.mockResolvedValue({
			deviceId: 'device-1',
			mode: 'GLOBAL',
			pinRequired: true,
			source: 'GLOBAL',
			globalPinConfigured: true,
			deviceOverrideConfigured: false,
		});
		mockVerifyDeviceSettingsPin.mockResolvedValue({
			valid: false,
		});

		render(<ScannerScreen />);

		fireEvent.press(screen.getByLabelText('Abrir configuración del dispositivo'));
		fireEvent.changeText(await screen.findByLabelText('PIN de configuración'), '1234');
		fireEvent.press(screen.getByText('Validar PIN'));

		await waitFor(() => {
			expect(mockVerifyDeviceSettingsPin).toHaveBeenCalledWith('device-1', '1234');
			expect(screen.getByText('PIN incorrecto. Inténtalo de nuevo.')).toBeOnTheScreen();
			expect(mockPush).not.toHaveBeenCalledWith('/(main)/settings');
		});
	});

	it('keeps the user on scanner when PIN verification is rate limited', async () => {
		mockFetchDeviceSettingsPinStatus.mockResolvedValue({
			deviceId: 'device-1',
			mode: 'GLOBAL',
			pinRequired: true,
			source: 'GLOBAL',
			globalPinConfigured: true,
			deviceOverrideConfigured: false,
		});
		mockVerifyDeviceSettingsPin.mockRejectedValue(
			Object.assign(new Error('rate limited'), {
				name: 'DeviceSettingsPinError',
				status: 429,
				code: 'RATE_LIMITED',
			}),
		);

		render(<ScannerScreen />);

		fireEvent.press(screen.getByLabelText('Abrir configuración del dispositivo'));
		fireEvent.changeText(await screen.findByLabelText('PIN de configuración'), '1234');
		fireEvent.press(screen.getByText('Validar PIN'));

		await waitFor(() => {
			expect(mockPush).not.toHaveBeenCalledWith('/(main)/settings');
			expect(screen.getByLabelText('PIN de configuración')).toHaveProp('value', '');
			expect(mockToastShow).toHaveBeenCalledWith(
				expect.objectContaining({
					variant: 'danger',
					label: 'Acceso bloqueado temporalmente',
				}),
			);
		});
	});

	it('keeps the user on scanner when the status request fails', async () => {
		mockFetchDeviceSettingsPinStatus.mockRejectedValue(new Error('network unavailable'));

		render(<ScannerScreen />);

		fireEvent.press(screen.getByLabelText('Abrir configuración del dispositivo'));

		await waitFor(() => {
			expect(mockPush).not.toHaveBeenCalledWith('/(main)/settings');
			expect(mockToastShow).toHaveBeenCalledWith(
				expect.objectContaining({
					variant: 'danger',
					label: 'No se pudo validar el acceso',
				}),
			);
		});
	});
});
