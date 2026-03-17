import { readFileSync } from 'fs';
import { resolve } from 'path';
import type React from 'react';

jest.mock('expo-camera', () => ({
	CameraView: function MockCameraView() {
		return null;
	},
	useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

jest.mock('expo-haptics', () => ({
	ImpactFeedbackStyle: { Light: 'light' },
	NotificationFeedbackType: { Error: 'error', Success: 'success' },
	impactAsync: jest.fn(),
	notificationAsync: jest.fn(),
}));

jest.mock('expo-router', () => ({
	Redirect: () => null,
	useFocusEffect: jest.fn(),
	useRouter: () => ({
		push: jest.fn(),
		replace: jest.fn(),
	}),
}));

jest.mock('@react-native-community/netinfo', () => ({
	__esModule: true,
	default: {
		fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
		addEventListener: jest.fn(() => jest.fn()),
	},
}));

jest.mock('react-native-reanimated', () => ({
	useReducedMotion: () => false,
}));

jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-svg', () => ({
	__esModule: true,
	default: function MockSvg() {
		return null;
	},
	Path: function MockPath() {
		return null;
	},
}));

jest.mock('heroui-native', () => {
	const MockButton = function MockButton({
		children,
	}: {
		children?: React.ReactNode;
	}) {
		return children ?? null;
	};
	MockButton.Label = function MockButtonLabel({
		children,
	}: {
		children?: React.ReactNode;
	}) {
		return children ?? null;
	};

	const MockCard = function MockCard({
		children,
	}: {
		children?: React.ReactNode;
	}) {
		return children ?? null;
	};
	MockCard.Body = function MockCardBody({
		children,
	}: {
		children?: React.ReactNode;
	}) {
		return children ?? null;
	};

	return {
		Button: MockButton,
		Card: MockCard,
		Spinner: () => null,
	};
});

jest.mock('@/components/ui/icon-symbol', () => ({
	IconSymbol: function MockIconSymbol() {
		return null;
	},
}));

jest.mock('@/components/ui/empty-state', () => ({
	EmptyState: function MockEmptyState() {
		return null;
	},
}));

jest.mock('@/components/attendance/check-out-reason-sheet', () => ({
	CheckOutReasonSheet: function MockCheckOutReasonSheet() {
		return null;
	},
}));

jest.mock('@/hooks/use-theme-color', () => ({
	useThemeColor: () => '#111827',
}));

jest.mock('@/lib/accessibility-motion', () => ({
	getAnimationDuration: () => 0,
}));

jest.mock('@/lib/attendance-capture-lock', () => ({
	releaseAttendanceCaptureLock: jest.fn(),
	tryAcquireAttendanceCaptureLock: jest.fn(() => true),
}));

jest.mock('@/lib/auth-client', () => ({
	clearAuthStorage: jest.fn(),
	signOut: jest.fn(),
}));

jest.mock('@/lib/device-context', () => ({
	useDeviceContext: () => ({
		clearSettings: jest.fn(),
		settings: {
			deviceId: 'device-1',
			name: 'Terminal 1',
			locationId: 'location-1',
		},
	}),
}));

jest.mock('@/lib/i18n', () => ({
	i18n: {
		t: (key: string) => key,
	},
}));

jest.mock('@/lib/face-recognition', () => ({
	recordAttendance: jest.fn(),
	verifyFace: jest.fn(),
}));

jest.mock('@/lib/offline-attendance', () => ({
	flushPendingAttendanceQueue: jest.fn(),
	isOfflineNetInfoState: (state: {
		isConnected: boolean | null;
		isInternetReachable?: boolean | null;
	}) => state.isConnected === false || state.isInternetReachable === false,
}));

jest.mock('@/providers/auth-provider', () => ({
	useAuthContext: () => ({
		requestReauth: jest.fn(),
	}),
}));

jest.mock('@/providers/theme-provider', () => ({
	useTheme: () => ({
		isDarkMode: true,
	}),
}));

describe('Scanner color migration', () => {
	const content = readFileSync(resolve(__dirname, '../app/(main)/scanner.tsx'), 'utf-8');

	it('does not contain the previous semantic color literals', () => {
		expect(content).not.toContain('rgba(251, 191, 36, 0.18)');
		expect(content).not.toContain('rgba(245, 158, 11, 0.12)');
		expect(content).not.toContain('rgba(180, 83, 9, 0.22)');
		expect(content).not.toContain('#FCD34D');
		expect(content).not.toContain('#92400E');
	});

	it('does not reference Colors from constants/theme', () => {
		expect(content).not.toContain("from '@/constants/theme'");
	});

	it('uses the primary token instead of accent for scanner primary affordances', () => {
		expect(content).toContain("'primary'");
		expect(content).not.toContain("'accent'");
	});

	it('tracks scan status reset timers with cleanup refs', () => {
		expect(content).toContain('scanStatusResetTimeoutRef');
		expect(content).toContain('clearTimeout(scanStatusResetTimeoutRef.current);');
	});

	it('applies alpha when theme tokens resolve to oklch colors', () => {
		const scannerModule = jest.requireActual('../app/(main)/scanner') as {
			withAlpha?: (color: string, alpha: number) => string;
		};

		expect(scannerModule.withAlpha).toBeDefined();
		expect(scannerModule.withAlpha?.('oklch(0.9401 0.0103 67.70)', 0.8)).toBe(
			'rgba(240, 234, 228, 0.8)',
		);
	});
});
