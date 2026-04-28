import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Animated } from 'react-native';

import ScannerScreen from '@/app/(main)/scanner';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCheckOutReasonSheet = jest.fn();
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

jest.mock('expo-router', () => ({
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
	CheckOutReasonSheet: function MockCheckOutReasonSheet(props: {
		isOpen: boolean;
		onClose: () => void;
		onSelectReason: (reason: string) => void;
	}) {
		const ReactNativeActual = jest.requireActual<typeof import('react-native')>('react-native');
		mockCheckOutReasonSheet(props);

		return props.isOpen ? <ReactNativeActual.Text>sheet-open</ReactNativeActual.Text> : null;
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
	useDeviceContext: () => ({
		settings: {
			deviceId: 'device-1',
			locationId: 'location-1',
			name: 'Terminal A',
		},
		clearSettings: jest.fn(),
	}),
}));

jest.mock('@/providers/auth-provider', () => ({
	useAuthContext: () => ({
		requestReauth: (...args: unknown[]) => mockRequestReauth(...args),
	}),
}));

jest.mock('@/lib/auth-client', () => ({
	clearAuthStorage: jest.fn(),
	signOut: jest.fn(),
}));

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

/**
 * Scanner flow coverage for the check-out reason sheet trigger rules.
 */
describe('ScannerScreen check-out reason flow', () => {
	beforeEach(() => {
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
		mockCheckOutReasonSheet.mockReset();
		mockRequestReauth.mockReset();
		mockPrepareRecognitionImage.mockReset();
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

	it('opens the reason sheet when the user scans a regular check-out', async () => {
		render(<ScannerScreen />);

		fireEvent.press(screen.getByText('Entrada'));
		fireEvent.press(screen.getByText('Salida autorizada'));
		fireEvent.press(screen.getByText('Escanear salida'));

		await waitFor(() => {
			expect(screen.getByText('sheet-open')).toBeOnTheScreen();
		});
	});

	it('does not open the reason sheet when the user scans an authorized check-out', async () => {
		render(<ScannerScreen />);

		fireEvent.press(screen.getByText('Entrada'));
		fireEvent.press(screen.getByText('Escanear salida autorizada'));

		await waitFor(() => {
			const latestCall = mockCheckOutReasonSheet.mock.calls.at(-1) as
				| [Record<string, unknown>]
				| undefined;
			expect(latestCall?.[0]?.isOpen).toBe(false);
		});
		expect(screen.queryByText('sheet-open')).not.toBeOnTheScreen();
	});
});
