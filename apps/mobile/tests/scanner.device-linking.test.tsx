import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import ScannerScreen from '@/app/(main)/scanner';
import esTranslations from '@/lib/translations/es.json';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSignOut = jest.fn();
const mockClearAuthStorage = jest.fn();
const mockClearSettings = jest.fn();
const mockRequestReauth = jest.fn();

jest.mock('expo-router', () => ({
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

jest.mock('@/lib/device-context', () => ({
	useDeviceContext: () => ({
		settings: null,
		clearSettings: mockClearSettings,
	}),
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

jest.mock('@/lib/attendance-capture-lock', () => ({
	releaseAttendanceCaptureLock: jest.fn(),
	tryAcquireAttendanceCaptureLock: jest.fn(() => true),
}));

jest.mock('@/lib/face-recognition', () => ({
	recordAttendance: jest.fn(),
	verifyFace: jest.fn(),
}));

describe('ScannerScreen device linking state', () => {
	beforeEach(() => {
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
		mockPush.mockReset();
		mockReplace.mockReset();
		mockSignOut.mockReset();
		mockClearAuthStorage.mockReset();
		mockClearSettings.mockReset();
		mockRequestReauth.mockReset();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('shows the setup-required status below the unlinked device label and resets auth before opening login', async () => {
		mockSignOut.mockResolvedValue(undefined);
		mockClearAuthStorage.mockResolvedValue(undefined);
		mockClearSettings.mockResolvedValue(undefined);

		render(<ScannerScreen />);

		expect(esTranslations.Scanner.status.deviceNotLinked).toBe(
			'Dispositivo no vinculado. Toca para volver a vincularlo.',
		);
		expect(screen.getByText('Dispositivo no vinculado')).toBeOnTheScreen();
		expect(screen.getByText('Configuración requerida')).toBeOnTheScreen();

		fireEvent.press(screen.getByText('Toca para vincular este dispositivo'));

		await waitFor(() => {
			expect(mockSignOut).toHaveBeenCalledTimes(1);
			expect(mockClearAuthStorage).toHaveBeenCalledTimes(1);
			expect(mockClearSettings).toHaveBeenCalledTimes(1);
			expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
		});
		expect(mockPush).not.toHaveBeenCalled();
	});

	it('locks auth state before routing to login when sign out fails', async () => {
		mockSignOut.mockRejectedValue(new Error('network error'));
		mockClearAuthStorage.mockResolvedValue(undefined);
		mockClearSettings.mockResolvedValue(undefined);
		mockRequestReauth.mockResolvedValue(undefined);

		render(<ScannerScreen />);

		fireEvent.press(screen.getByText('Toca para vincular este dispositivo'));

		await waitFor(() => {
			expect(mockRequestReauth).toHaveBeenCalledWith({
				forceLock: true,
				reason: 'manual',
			});
		});

		expect(mockClearAuthStorage).toHaveBeenCalledTimes(1);
		expect(mockClearSettings).toHaveBeenCalledTimes(1);
		expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
	});

	it('still navigates to login when auth storage cleanup fails during relinking', async () => {
		mockSignOut.mockResolvedValue(undefined);
		mockClearAuthStorage.mockRejectedValue(new Error('secure-store unavailable'));
		mockClearSettings.mockResolvedValue(undefined);

		render(<ScannerScreen />);

		fireEvent.press(screen.getByText('Toca para vincular este dispositivo'));

		await waitFor(() => {
			expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
		});

		expect(mockClearSettings).toHaveBeenCalledTimes(1);
	});
});
