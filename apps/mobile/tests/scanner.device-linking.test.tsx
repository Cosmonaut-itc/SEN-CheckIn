import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Animated } from 'react-native';

import ScannerScreen from '@/app/(main)/scanner';
import esTranslations from '@/lib/translations/es.json';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSignOut = jest.fn();
const mockClearAuthStorage = jest.fn();
const mockClearSettings = jest.fn();
const mockClearPendingAttendanceQueue = jest.fn();
const mockRequestReauth = jest.fn();
const mockPrepareRecognitionImage = jest.fn();
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
const mockDeviceContext = jest.fn();

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
	Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

jest.mock('@/constants/env', () => ({
	ENV: {
		apiUrl: 'https://api.example.com',
		webVerifyUrl: 'https://example.com/verificar',
	},
	envErrors: null,
}));

jest.mock('@/lib/api', () => ({
	API_BASE_URL: 'https://api.example.com',
	API_ENV_VALID: true,
}));

jest.mock('heroui-native', () => {
	const ReactNativeActual = jest.requireActual<typeof import('react-native')>('react-native');
	const { Pressable, Text, View } = ReactNativeActual;

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

	const Spinner = function MockSpinner() {
		return <Text>Cargando...</Text>;
	};

	return {
		Button,
		Card,
		Spinner,
		useToast: () => ({
			toast: {
				show: jest.fn(),
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
	useAuthContext: () => ({
		requestReauth: (...args: unknown[]) => mockRequestReauth(...args),
	}),
}));

jest.mock('@/lib/auth-client', () => ({
	clearAuthStorage: () => mockClearAuthStorage(),
	signOut: () => mockSignOut(),
}));

jest.mock('@/lib/offline-attendance', () => {
	const actual = jest.requireActual<typeof import('@/lib/offline-attendance')>(
		'@/lib/offline-attendance',
	);

	return {
		...actual,
		clearPendingAttendanceQueue: () => mockClearPendingAttendanceQueue(),
	};
});

jest.mock('@/lib/attendance-capture-lock', () => ({
	releaseAttendanceCaptureLock: jest.fn(),
	tryAcquireAttendanceCaptureLock: jest.fn(() => true),
}));

jest.mock('@/lib/face-recognition', () => ({
	FaceVerificationError: class FaceVerificationError extends Error {
		public readonly status = 500;
		public readonly errorCode: string | null = null;
		public readonly retryable = false;
		public readonly requestId: string | null = null;
	},
	recordAttendance: jest.fn(),
	verifyFace: jest.fn(),
}));

jest.mock('@/lib/recognition-image', () => ({
	cleanupRecognitionImage: jest.fn(),
	prepareRecognitionImage: (...args: unknown[]) => mockPrepareRecognitionImage(...args),
}));

describe('ScannerScreen device linking state', () => {
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
		mockSignOut.mockReset();
		mockClearAuthStorage.mockReset();
		mockClearSettings.mockReset();
		mockClearPendingAttendanceQueue.mockReset();
		mockRequestReauth.mockReset();
		mockPrepareRecognitionImage.mockReset();
		mockDeviceContext.mockReturnValue({
			settings: null,
			clearSettings: mockClearSettings,
		});
		mockPrepareRecognitionImage.mockResolvedValue({
			previewUri: 'file://processed.jpg',
			base64: 'processed-base64',
			payloadBytes: 1024,
			preprocessMs: 25,
		});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('shows the setup-required status below the unlinked device label and resets auth before opening login', async () => {
		mockSignOut.mockResolvedValue(undefined);
		mockClearAuthStorage.mockResolvedValue(undefined);
		mockClearSettings.mockResolvedValue(undefined);
		mockClearPendingAttendanceQueue.mockResolvedValue(undefined);

		render(<ScannerScreen />);

		expect(esTranslations.Scanner.status.deviceNotLinked).toBe(
			'Dispositivo no vinculado. Toca para volver a vincularlo.',
		);
		expect(screen.getByText('Configura este dispositivo')).toBeOnTheScreen();
		expect(
			screen.getByText('Vincula la terminal para empezar a registrar asistencia desde aquí.'),
		).toBeOnTheScreen();

		fireEvent.press(screen.getByText('Vincular dispositivo'));

		await waitFor(() => {
			expect(mockSignOut).toHaveBeenCalledTimes(1);
			expect(mockClearAuthStorage).toHaveBeenCalledTimes(1);
			expect(mockClearPendingAttendanceQueue).toHaveBeenCalledTimes(1);
			expect(mockClearSettings).toHaveBeenCalledTimes(1);
			expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
		});
		expect(mockPush).not.toHaveBeenCalled();
	});

	it('redirects to device setup when the kiosk has a device but no configured location', () => {
		mockDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				locationId: null,
				name: 'Terminal A',
			},
			clearSettings: mockClearSettings,
		});

		render(<ScannerScreen />);

		expect(mockReplace).toHaveBeenCalledWith('/(auth)/device-setup');
	});

	it('shows the live clock when the device is linked', () => {
		jest.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('08:15:30');
		mockDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				locationId: 'location-1',
				name: 'Terminal A',
			},
			clearSettings: mockClearSettings,
		});

		render(<ScannerScreen />);

		expect(screen.getByText('08:15:30')).toBeOnTheScreen();
	});

	it('updates the live clock every second when the device is linked', () => {
		jest.useFakeTimers();
		let clockCallCount = 0;
		jest.spyOn(Date.prototype, 'toLocaleTimeString').mockImplementation(() => {
			clockCallCount += 1;
			return clockCallCount === 1 ? '08:15:30' : '08:15:31';
		});
		mockDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				locationId: 'location-1',
				name: 'Terminal A',
			},
			clearSettings: mockClearSettings,
		});

		render(<ScannerScreen />);

		expect(screen.getByText('08:15:30')).toBeOnTheScreen();

		act(() => {
			jest.advanceTimersByTime(1000);
		});

		expect(screen.getByText('08:15:31')).toBeOnTheScreen();
		jest.useRealTimers();
	});

	it('locks auth state before routing to login when sign out fails', async () => {
		mockSignOut.mockRejectedValue(new Error('network error'));
		mockClearAuthStorage.mockResolvedValue(undefined);
		mockClearSettings.mockResolvedValue(undefined);
		mockClearPendingAttendanceQueue.mockResolvedValue(undefined);
		mockRequestReauth.mockResolvedValue(undefined);

		render(<ScannerScreen />);

		fireEvent.press(screen.getByText('Vincular dispositivo'));

		await waitFor(() => {
			expect(mockRequestReauth).toHaveBeenCalledWith({
				forceLock: true,
				reason: 'manual',
			});
		});

		expect(mockClearAuthStorage).toHaveBeenCalledTimes(1);
		expect(mockClearPendingAttendanceQueue).toHaveBeenCalledTimes(1);
		expect(mockClearSettings).toHaveBeenCalledTimes(1);
		expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
	});

	it('still clears auth and returns to login when reauth fails during relinking', async () => {
		mockSignOut.mockRejectedValue(new Error('network error'));
		mockRequestReauth.mockRejectedValue(new Error('reauth failed'));
		mockClearAuthStorage.mockResolvedValue(undefined);
		mockClearSettings.mockResolvedValue(undefined);
		mockClearPendingAttendanceQueue.mockResolvedValue(undefined);

		render(<ScannerScreen />);

		fireEvent.press(screen.getByText('Vincular dispositivo'));

		await waitFor(() => {
			expect(mockRequestReauth).toHaveBeenCalledWith({
				forceLock: true,
				reason: 'manual',
			});
			expect(mockClearAuthStorage).toHaveBeenCalledTimes(1);
			expect(mockClearPendingAttendanceQueue).toHaveBeenCalledTimes(1);
			expect(mockClearSettings).toHaveBeenCalledTimes(1);
			expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
		});
	});

	it('still navigates to login when auth storage cleanup fails during relinking', async () => {
		mockSignOut.mockResolvedValue(undefined);
		mockClearAuthStorage.mockRejectedValue(new Error('secure-store unavailable'));
		mockClearSettings.mockResolvedValue(undefined);
		mockClearPendingAttendanceQueue.mockResolvedValue(undefined);

		render(<ScannerScreen />);

		fireEvent.press(screen.getByText('Vincular dispositivo'));

		await waitFor(() => {
			expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
		});

		expect(mockClearPendingAttendanceQueue).toHaveBeenCalledTimes(1);
		expect(mockClearSettings).toHaveBeenCalledTimes(1);
	});
});
