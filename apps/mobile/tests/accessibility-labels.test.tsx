import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

import ScannerScreen from '@/app/(main)/scanner';
import FaceEnrollmentScreen from '@/app/(main)/face-enrollment';
import LoginScreen from '@/app/(auth)/login';
import LockedScreen from '@/app/(auth)/locked';
import { CheckOutReasonSheet } from '@/components/attendance/check-out-reason-sheet';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
const mockUseDeviceContext = jest.fn();
const mockUseQuery = jest.fn();
const mockUseMutation = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockRequestPermission = jest.fn();
const mockTakePictureAsync = jest.fn();
const mockRequestDeviceCode = jest.fn();
const mockPollDeviceToken = jest.fn();
const mockAnnounceForAccessibility = jest.fn();
const mockUseAuthContext = jest.fn();

jest.mock('@tanstack/react-query', () => ({
	useQuery: (...args: unknown[]) => mockUseQuery(...args),
	useMutation: (...args: unknown[]) => mockUseMutation(...args),
	useQueryClient: () => ({
		invalidateQueries: mockInvalidateQueries,
	}),
}));

jest.mock('expo-router', () => ({
	useRouter: () => ({
		push: mockPush,
		replace: mockReplace,
	}),
	useNavigation: () => ({
		canGoBack: mockCanGoBack,
		goBack: mockGoBack,
	}),
	useFocusEffect: (callback: () => void | (() => void)) => {
		const ReactActual = jest.requireActual<typeof import('react')>('react');
		ReactActual.useEffect(() => callback(), [callback]);
	},
	Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	Stack: {
		Screen: () => null,
	},
}));

jest.mock('expo-camera', () => {
	const mockReact = require('react') as typeof React;
	const mockReactNative = require('react-native') as typeof import('react-native');

	const CameraView = mockReact.forwardRef(
		(
			props: unknown,
			ref: React.Ref<{ takePictureAsync: () => Promise<{ base64: string }> }>,
		) => {
			mockReact.useImperativeHandle(ref, () => ({
				takePictureAsync: mockTakePictureAsync,
			}));
			return (
				<mockReactNative.View
					testID="camera-view"
					{...(props as Record<string, unknown>)}
				/>
			);
		},
	);
	CameraView.displayName = 'MockCameraView';

	return {
		CameraView,
		useCameraPermissions: () => [{ granted: true }, mockRequestPermission],
	};
});

jest.mock('expo-haptics', () => ({
	ImpactFeedbackStyle: { Light: 'light' },
	NotificationFeedbackType: { Error: 'error', Success: 'success' },
	impactAsync: jest.fn(),
	notificationAsync: jest.fn(),
}));

jest.mock('expo-image', () => ({
	Image: function MockExpoImage(props: unknown) {
		const mockReactNative = require('react-native') as typeof import('react-native');
		return <mockReactNative.View {...(props as Record<string, unknown>)} />;
	},
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
	const mockReactNative = require('react-native') as typeof import('react-native');
	const { Pressable, Text, TextInput, View } = mockReactNative;

	const Button = function MockButton({
		children,
		onPress,
		isDisabled,
		accessibilityLabel,
		accessibilityHint,
	}: {
		children: React.ReactNode;
		onPress?: () => void;
		isDisabled?: boolean;
		accessibilityLabel?: string;
		accessibilityHint?: string;
	}) {
		return (
			<Pressable
				onPress={isDisabled ? undefined : onPress}
				accessibilityRole="button"
				accessibilityLabel={accessibilityLabel}
				accessibilityHint={accessibilityHint}
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

	const Spinner = function MockSpinner() {
		return <Text>Cargando...</Text>;
	};

	return {
		Button,
		Card,
		Spinner,
		Input: TextInput,
		Label: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
		Description: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
		FieldError: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
		TextField: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
		Select: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
		Separator: () => <View />,
		useThemeColor: () => '#111827',
		useToast: () => ({
			toast: {
				show: jest.fn(),
			},
		}),
	};
});

jest.mock('heroui-native/bottom-sheet', () => {
	const mockReactNative = jest.requireActual<typeof import('react-native')>('react-native');
	const { Text, View } = mockReactNative;

	const BottomSheet = function MockBottomSheet({
		children,
		isOpen,
	}: {
		children: React.ReactNode;
		isOpen: boolean;
	}) {
		return isOpen ? <View>{children}</View> : null;
	};

	BottomSheet.Portal = function MockBottomSheetPortal({
		children,
	}: {
		children: React.ReactNode;
	}) {
		return <View>{children}</View>;
	};

	BottomSheet.Overlay = function MockBottomSheetOverlay() {
		return <View />;
	};

	BottomSheet.Content = function MockBottomSheetContent({
		children,
	}: {
		children: React.ReactNode;
	}) {
		return <View>{children}</View>;
	};

	BottomSheet.Title = function MockBottomSheetTitle({ children }: { children: React.ReactNode }) {
		return <Text>{children}</Text>;
	};

	BottomSheet.Description = function MockBottomSheetDescription({
		children,
	}: {
		children: React.ReactNode;
	}) {
		return <Text>{children}</Text>;
	};

	return {
		BottomSheet,
	};
});

jest.mock('react-qr-code', () => function MockQrCode() {
	const mockReactNative = require('react-native') as typeof import('react-native');
	return <mockReactNative.View testID="qr-code" />;
});

jest.mock('@/components/ui/icon-symbol', () => ({
	IconSymbol: function MockIconSymbol() {
		const mockReactNative = require('react-native') as typeof import('react-native');
		return <mockReactNative.View testID="icon-symbol" />;
	},
}));

jest.mock('@/providers/theme-provider', () => ({
	useTheme: () => ({
		colorScheme: 'dark',
		isDarkMode: true,
	}),
}));

jest.mock('@/hooks/use-theme-color', () => ({
	useThemeColor: (tokens: string | string[]) =>
		Array.isArray(tokens) ? tokens.map(() => '#111827') : '#111827',
}));

jest.mock('@/lib/device-context', () => ({
	useDeviceContext: () => mockUseDeviceContext(),
	getStableDeviceCode: () => Promise.resolve('DEVICE-CODE'),
}));

jest.mock('@/providers/auth-provider', () => ({
	useAuthContext: () => mockUseAuthContext(),
}));

jest.mock('@/lib/auth-client', () => ({
	authClient: {
		device: {
			code: () => mockRequestDeviceCode(),
			token: () => mockPollDeviceToken(),
		},
	},
	clearAuthStorage: jest.fn(),
	refreshSession: jest.fn(),
	saveAccessToken: jest.fn(),
	signOut: jest.fn(),
}));

jest.mock('@/lib/attendance-capture-lock', () => ({
	releaseAttendanceCaptureLock: jest.fn(),
	tryAcquireAttendanceCaptureLock: jest.fn(() => true),
}));

jest.mock('@/lib/face-recognition', () => ({
	recordAttendance: jest.fn(),
	verifyFace: jest.fn(),
}));

jest.mock('@/lib/client-functions', () => ({
	fetchFaceEnrollmentEmployees: jest.fn(),
	fullEnrollmentFlow: jest.fn(),
	isFaceEnrollmentApiError: jest.fn(() => false),
	registerDevice: jest.fn(),
}));

describe('Mobile accessibility labels', () => {
	beforeEach(() => {
		jest.useFakeTimers();
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
		jest
			.spyOn(AccessibilityInfo, 'announceForAccessibility')
			.mockImplementation((announcement: string) => {
				mockAnnounceForAccessibility(announcement);
				return Promise.resolve();
			});
		mockPush.mockReset();
		mockReplace.mockReset();
		mockGoBack.mockReset();
		mockCanGoBack.mockReset();
		mockCanGoBack.mockReturnValue(false);
		mockUseQuery.mockReset();
		mockUseMutation.mockReset();
		mockInvalidateQueries.mockReset();
		mockUseDeviceContext.mockReset();
		mockTakePictureAsync.mockReset();
		mockRequestDeviceCode.mockReset();
		mockPollDeviceToken.mockReset();
		mockAnnounceForAccessibility.mockReset();
		mockUseAuthContext.mockReset();

		mockUseAuthContext.mockReturnValue({
			requestReauth: jest.fn(),
			lockReason: 'refresh_failed',
			session: null,
			isLoading: false,
			authState: 'signed_out',
			setSession: jest.fn(),
		});

		mockUseDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				locationId: 'location-1',
				organizationId: 'org-1',
				name: 'Terminal A',
			},
			clearSettings: jest.fn(),
			saveRemoteSettings: jest.fn(),
			updateLocalSettings: jest.fn(),
			isHydrated: true,
			isUpdating: false,
		});

		mockUseQuery.mockReturnValue({
			data: {
				data: [
					{
						id: 'employee-1',
						code: 'EMP-001',
						firstName: 'Ana',
						lastName: 'Ruiz',
						status: 'ACTIVE',
						rekognitionUserId: null,
					},
				],
				pagination: {
					total: 1,
					limit: 200,
					offset: 0,
				},
			},
			isPending: false,
			isError: false,
		});

		mockUseMutation.mockImplementation((options: { mutationFn: () => Promise<void> }) => ({
			isPending: false,
			mutateAsync: async () => options.mutationFn(),
		}));

		mockRequestDeviceCode.mockResolvedValue({
			data: {
				device_code: 'device-code',
				user_code: 'ABCD1234',
				verification_uri: 'https://example.com/verificar',
				verification_uri_complete: 'https://example.com/verificar?user_code=ABCD1234',
				expires_in: 600,
				interval: 5,
			},
		});
		mockPollDeviceToken.mockResolvedValue({
			error: {
				body: {
					error: 'authorization_pending',
				},
			},
		});
	});

	it('labels scanner actions in Spanish for screen readers', () => {
		render(<ScannerScreen />);

		expect(screen.getByLabelText('Cambiar tipo de asistencia')).toBeOnTheScreen();
		expect(screen.getByLabelText('Registrar rostro')).toBeOnTheScreen();
		expect(screen.getByLabelText('Abrir configuración del dispositivo')).toBeOnTheScreen();
		expect(screen.getByLabelText('Escanear entrada')).toBeOnTheScreen();
	});

	it('announces scanner status changes for assistive technologies', async () => {
		mockTakePictureAsync.mockResolvedValue({ base64: null });

		render(<ScannerScreen />);

		await act(async () => {
			jest.advanceTimersByTime(150);
		});
		fireEvent.press(screen.getByLabelText('Escanear entrada'));

		await screen.findByText('No se pudo capturar la imagen. Inténtalo de nuevo.');

		expect(mockAnnounceForAccessibility).toHaveBeenCalledWith('Verificando rostro...');
		expect(mockAnnounceForAccessibility).toHaveBeenCalledWith(
			'No se pudo capturar la imagen. Inténtalo de nuevo.',
		);
	});

	it('adds labels and hints to face enrollment controls', () => {
		render(<FaceEnrollmentScreen />);

		expect(screen.getByLabelText('Buscar por nombre o código')).toBeOnTheScreen();
		expect(
			screen.getByHintText('Escribe el nombre o el código del empleado que quieres buscar.'),
		).toBeOnTheScreen();
		expect(screen.getByLabelText('Cambiar cámara')).toBeOnTheScreen();
		expect(screen.getByLabelText('Capturar')).toBeOnTheScreen();
	});

	it('announces login QR and primary actions', async () => {
		render(<LoginScreen />);

		expect(
			await screen.findByLabelText('Código QR para vincular el dispositivo'),
		).toBeOnTheScreen();
		expect(await screen.findByLabelText('Nuevo código')).toBeOnTheScreen();
		expect(await screen.findByLabelText('Abrir enlace')).toBeOnTheScreen();
	});

	it('does not redirect authenticated users to scanner until device hydration completes', () => {
		mockUseAuthContext.mockReturnValue({
			requestReauth: jest.fn(),
			lockReason: 'refresh_failed',
			session: { session: { id: 'session-1' } },
			isLoading: false,
			authState: 'ok',
			setSession: jest.fn(),
		});
		mockUseDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				locationId: null,
				organizationId: 'org-1',
				name: 'Terminal A',
			},
			clearSettings: jest.fn(),
			saveRemoteSettings: jest.fn(),
			updateLocalSettings: jest.fn(),
			isHydrated: false,
			isUpdating: false,
		});

		render(<LoginScreen />);

		expect(mockReplace).not.toHaveBeenCalled();
	});

	it('routes authenticated devices without location back to device setup after hydration', () => {
		mockUseAuthContext.mockReturnValue({
			requestReauth: jest.fn(),
			lockReason: 'refresh_failed',
			session: {
				session: {
					id: 'session-1',
					activeOrganizationId: 'org-1',
				},
			},
			isLoading: false,
			authState: 'ok',
			setSession: jest.fn(),
		});
		mockUseDeviceContext.mockReturnValue({
			settings: {
				deviceId: 'device-1',
				locationId: null,
				organizationId: 'org-1',
				name: 'Terminal A',
			},
			clearSettings: jest.fn(),
			saveRemoteSettings: jest.fn(),
			updateLocalSettings: jest.fn(),
			isHydrated: true,
			isUpdating: false,
		});

		render(<LoginScreen />);

		expect(mockReplace).toHaveBeenCalledWith({
			pathname: '/(auth)/device-setup',
			params: {
				deviceId: 'device-1',
				organizationId: 'org-1',
			},
		});
		expect(mockReplace).not.toHaveBeenCalledWith('/(main)/scanner');
	});

	it('labels locked-screen recovery actions', () => {
		render(<LockedScreen />);

		expect(screen.getByLabelText('Reintentar')).toBeOnTheScreen();
		expect(screen.getByLabelText('Iniciar sesión')).toBeOnTheScreen();
	});

	it('labels check-out reason actions in Spanish', () => {
		render(
			<CheckOutReasonSheet
				isOpen
				onClose={jest.fn()}
				onSelectReason={jest.fn()}
			/>,
		);

		expect(screen.getByLabelText('Seleccionar motivo de salida: Comida')).toBeOnTheScreen();
		expect(screen.getByLabelText('Seleccionar motivo de salida: Personal')).toBeOnTheScreen();
		expect(screen.getByLabelText('Cancelar')).toBeOnTheScreen();
	});

	afterEach(() => {
		jest.restoreAllMocks();
		jest.useRealTimers();
	});
});
