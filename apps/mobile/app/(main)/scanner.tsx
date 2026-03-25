import { type CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Redirect, useFocusEffect, useRouter, type Href } from 'expo-router';
import { Button, Card, Spinner } from 'heroui-native';
import type { CheckOutReason } from '@sen-checkin/types';
import { converter, formatRgb, parse } from 'culori';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
	AccessibilityInfo,
	Animated,
	Platform,
	ScrollView,
	Text,
	View,
	useWindowDimensions,
	type TextStyle,
	type ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { EmptyState } from '@/components/ui/empty-state';
import { CheckOutReasonSheet } from '@/components/attendance/check-out-reason-sheet';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getAnimationDuration } from '@/lib/accessibility-motion';
import {
	releaseAttendanceCaptureLock,
	tryAcquireAttendanceCaptureLock,
} from '@/lib/attendance-capture-lock';
import { clearAuthStorage, signOut } from '@/lib/auth-client';
import { useDeviceContext } from '@/lib/device-context';
import { i18n } from '@/lib/i18n';
import {
	FaceVerificationError,
	recordAttendance,
	verifyFace,
} from '@/lib/face-recognition';
import { clearPendingAttendanceQueue, isOfflineNetInfoState } from '@/lib/offline-attendance';
import type { AttendanceType } from '@/lib/query-keys';
import {
	cleanupRecognitionImage,
	prepareRecognitionImage,
} from '@/lib/recognition-image';
import { useAuthContext } from '@/providers/auth-provider';
import { useTheme } from '@/providers/theme-provider';

/** Represents the current status of the face scanning operation */
type ScanStatus =
	| { state: 'idle'; message: string }
	| { state: 'scanning'; message: string }
	| { state: 'success'; message: string; employeeName?: string }
	| { state: 'error'; message: string };

type ScannerThemeColors = {
	background: string;
	border: string;
	content1: string;
	error: string;
	foreground: string;
	foreground400: string;
	foreground500: string;
	overlay: string;
	overlayMuted: string;
	primary: string;
	success: string;
	text: string;
	warning: string;
};

/** Maximum size for face guide circle on larger devices (tablets) */
const MAX_FACE_GUIDE_SIZE = 400;
const ATTENDANCE_TYPE_ORDER: AttendanceType[] = ['CHECK_IN', 'CHECK_OUT_AUTHORIZED', 'CHECK_OUT'];
const DEVICE_SETUP_ROUTE = '/(auth)/device-setup' as Href;
const convertResolvedThemeColorToRgb = converter('rgb');

/**
 * Returns the current network type for recognition diagnostics.
 *
 * @returns Promise resolving to the current network type or null when unavailable
 */
async function getRecognitionNetworkType(): Promise<string | null> {
	try {
		const networkState = await NetInfo.fetch();
		return networkState.type ?? null;
	} catch (error) {
		console.warn('[scanner] Failed to resolve network type for recognition', error);
		return null;
	}
}

/**
 * Emits a structured client-side recognition timing log.
 *
 * @param diagnostics - Timing and payload metrics for a recognition attempt
 * @returns No return value
 */
function logRecognitionAttempt(diagnostics: {
	captureMs: number;
	preprocessMs: number;
	payloadBytes: number;
	uploadServerMs: number;
	totalMs: number;
	networkType: string | null;
	status: number;
	outcome: 'match' | 'no-match' | 'retryable-failure' | 'failure';
	errorCode?: string | null;
	requestId?: string | null;
}): void {
	console.info('[scanner] recognition attempt', diagnostics);
}

/**
 * Cross-platform link icon for the device-link CTA.
 *
 * Uses SVG instead of SF Symbols so it renders consistently on Android and iOS.
 *
 * @param props - Size and stroke color for the icon
 * @returns {JSX.Element} Link icon
 */
function DeviceLinkIcon({
	size,
	color,
}: {
	size: number;
	color: string;
}): JSX.Element {
	return (
		<Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
			<Path
				d="M10.5 13.5L13.5 10.5"
				stroke={color}
				strokeWidth={1.9}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<Path
				d="M8.2 15.8H6.75C4.68 15.8 3 14.12 3 12.05C3 9.98 4.68 8.3 6.75 8.3H9.2"
				stroke={color}
				strokeWidth={1.9}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<Path
				d="M15.8 8.2H17.25C19.32 8.2 21 9.88 21 11.95C21 14.02 19.32 15.7 17.25 15.7H14.8"
				stroke={color}
				strokeWidth={1.9}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</Svg>
	);
}

/**
 * Calculates the responsive face guide size based on screen dimensions
 * @param {number} width - Screen width in pixels
 * @param {number} height - Screen height in pixels
 * @returns {number} The calculated face guide size capped at MAX_FACE_GUIDE_SIZE
 */
const calculateFaceGuideSize = (width: number, height: number): number => {
	// Use the smaller dimension to ensure the circle fits on any orientation
	const smallerDimension = Math.min(width, height);
	// Use 70% of smaller dimension, capped at max size for tablets
	return Math.min(smallerDimension * 0.7, MAX_FACE_GUIDE_SIZE);
};

/**
 * Applies an alpha channel to a resolved theme color without introducing new hardcoded color literals.
 *
 * Supports 3-digit and 6-digit hex colors, and converts functional color strings to 8-digit hex.
 * Unsupported formats are returned unchanged.
 *
 * @param color - Resolved theme color string
 * @param alpha - Opacity value from 0 to 1
 * @returns Color string with the requested alpha channel when parsing succeeds
 */
export function withAlpha(color: string, alpha: number): string {
	const normalizedColor = color.trim();
	const normalizedAlpha = Math.max(0, Math.min(1, alpha));
	const alphaHex = Math.round(normalizedAlpha * 255)
		.toString(16)
		.padStart(2, '0')
		.toUpperCase();
	const optionalAlphaSegment = '(?:a)?';
	const functionalColorPattern = new RegExp(
		`^rgb${optionalAlphaSegment}\\(\\s*(?<red>\\d{1,3})\\s*,\\s*(?<green>\\d{1,3})\\s*,\\s*(?<blue>\\d{1,3})(?:\\s*,\\s*[\\d.]+)?\\s*\\)$`,
	);
	const fullHexMatch = normalizedColor.match(
		/^#(?<red>[0-9a-fA-F]{2})(?<green>[0-9a-fA-F]{2})(?<blue>[0-9a-fA-F]{2})(?:[0-9a-fA-F]{2})?$/,
	);

	if (
		fullHexMatch?.groups?.red &&
		fullHexMatch.groups.green &&
		fullHexMatch.groups.blue
	) {
		return `#${fullHexMatch.groups.red}${fullHexMatch.groups.green}${fullHexMatch.groups.blue}${alphaHex}`;
	}

	const shortHexMatch = normalizedColor.match(
		/^#(?<red>[0-9a-fA-F])(?<green>[0-9a-fA-F])(?<blue>[0-9a-fA-F])(?:[0-9a-fA-F])?$/,
	);

	if (
		shortHexMatch?.groups?.red &&
		shortHexMatch.groups.green &&
		shortHexMatch.groups.blue
	) {
		return `#${shortHexMatch.groups.red.repeat(2)}${shortHexMatch.groups.green.repeat(2)}${shortHexMatch.groups.blue.repeat(2)}${alphaHex}`;
	}

	const rgbMatch = normalizedColor.match(functionalColorPattern);

	if (rgbMatch?.groups?.red && rgbMatch.groups.green && rgbMatch.groups.blue) {
		const redHex = Number(rgbMatch.groups.red).toString(16).padStart(2, '0').toUpperCase();
		const greenHex = Number(rgbMatch.groups.green)
			.toString(16)
			.padStart(2, '0')
			.toUpperCase();
		const blueHex = Number(rgbMatch.groups.blue).toString(16).padStart(2, '0').toUpperCase();
		return `#${redHex}${greenHex}${blueHex}${alphaHex}`;
	}

	const parsedColor = parse(normalizedColor);
	const rgbColor = parsedColor ? convertResolvedThemeColorToRgb(parsedColor) : null;

	if (rgbColor) {
		return formatRgb({ ...rgbColor, alpha: normalizedAlpha });
	}

	return color;
}

/**
 * Face scanner screen component for attendance verification
 * @returns {JSX.Element} The scanner screen with camera view and controls
 */
export default function ScannerScreen(): JSX.Element {
	const cameraRef = useRef<CameraView | null>(null);
	const [permission, requestPermission] = useCameraPermissions();
	const router = useRouter();
	const { clearSettings, settings } = useDeviceContext();
	const { requestReauth } = useAuthContext();
	const { isDarkMode } = useTheme();
	const insets = useSafeAreaInsets();
	const [
		backgroundColor,
		themeBorderColor,
		surfaceColor,
		defaultHoverColor,
		dangerColor,
		foregroundColor,
		mutedColor,
		overlayColor,
		primaryColor,
		successColor,
		warningColor,
	] = useThemeColor([
		'background',
		'border',
		'surface',
		'default-hover',
		'danger',
		'foreground',
		'muted',
		'overlay',
		'primary',
		'success',
		'warning',
	]);
	const themeColors = useMemo<ScannerThemeColors>(
		() => ({
			background: backgroundColor,
			border: themeBorderColor,
			content1: surfaceColor,
			error: dangerColor,
			foreground: foregroundColor,
			foreground400: mutedColor,
			foreground500: mutedColor,
			overlay: overlayColor,
			overlayMuted: defaultHoverColor,
			primary: primaryColor,
			success: successColor,
			text: foregroundColor,
			warning: warningColor,
		}),
		[
			backgroundColor,
			themeBorderColor,
			dangerColor,
			defaultHoverColor,
			foregroundColor,
			mutedColor,
			overlayColor,
			primaryColor,
			successColor,
			surfaceColor,
			warningColor,
		],
	);
	const styles = useMemo(
		() => createScannerStyles(themeColors, isDarkMode, insets.top, insets.bottom),
		[insets.bottom, insets.top, isDarkMode, themeColors],
	);
	const continuousCurve = useMemo(() => ({ borderCurve: 'continuous' as const }), []);
	const shouldReduceMotion = useReducedMotion();

	// Use state for camera facing to ensure proper initialization
	// This fixes a race condition where the camera may initialize with the wrong facing direction
	const [cameraFacing, setCameraFacing] = useState<CameraType>('front');
	const [isCameraReady, setIsCameraReady] = useState(false);

	// Get responsive dimensions
	const { width: screenWidth, height: screenHeight } = useWindowDimensions();
	const faceGuideSize = useMemo(
		() => calculateFaceGuideSize(screenWidth, screenHeight),
		[screenWidth, screenHeight],
	);

	// Animation values
	const pulseAnim = useRef(new Animated.Value(1)).current;
	const statusOpacity = useRef(new Animated.Value(1)).current;
	const borderColorAnim = useRef(new Animated.Value(0)).current;
	const scanStatusResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [attendanceType, setAttendanceType] = useState<AttendanceType>('CHECK_IN');
	const [isCheckOutReasonSheetOpen, setIsCheckOutReasonSheetOpen] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [isOffline, setIsOffline] = useState(false);
	const captureLockRef = useRef(false);
	const [scanStatus, setScanStatus] = useState<ScanStatus>({
		state: 'idle',
		message: i18n.t('Scanner.status.idle'),
	});
	const attendanceLabels: Record<AttendanceType, string> = {
		CHECK_IN: i18n.t('Scanner.attendanceType.checkIn'),
		CHECK_OUT_AUTHORIZED: i18n.t('Scanner.attendanceType.checkOutAuthorized'),
		CHECK_OUT: i18n.t('Scanner.attendanceType.checkOut'),
		WORK_OFFSITE: i18n.t('Scanner.attendanceType.workOffsite'),
	};
	const attendanceActionLabels: Record<AttendanceType, string> = {
		CHECK_IN: i18n.t('Scanner.actions.scanCheckIn'),
		CHECK_OUT_AUTHORIZED: i18n.t('Scanner.actions.scanCheckOutAuthorized'),
		CHECK_OUT: i18n.t('Scanner.actions.scanCheckOut'),
		WORK_OFFSITE: i18n.t('Scanner.actions.scanWorkOffsite'),
	};
	const attendanceSuccessMessages: Record<AttendanceType, string> = {
		CHECK_IN: i18n.t('Scanner.success.checkedIn'),
		CHECK_OUT_AUTHORIZED: i18n.t('Scanner.success.checkedOutAuthorized'),
		CHECK_OUT: i18n.t('Scanner.success.checkedOut'),
		WORK_OFFSITE: i18n.t('Scanner.success.workOffsiteNotSupported'),
	};
	const attendanceAccent =
		attendanceType === 'CHECK_IN'
			? themeColors.success
			: attendanceType === 'CHECK_OUT_AUTHORIZED'
				? themeColors.warning
				: themeColors.error;
	const neutralGuideColor = withAlpha(themeColors.foreground, 0.8);
	const ctaBackground = attendanceAccent;
	const ctaContentColor = 'white';
	const linkButtonContentColor = isDarkMode ? themeColors.warning : themeColors.primary;
	const needsDeviceSetup = Boolean(settings?.deviceId) && !settings?.locationId;

	/**
	 * Clear any pending scan-status reset timeout.
	 *
	 * @returns {void} No return value
	 */
	const clearPendingScanStatusReset = useCallback((): void => {
		if (!scanStatusResetTimeoutRef.current) {
			return;
		}

		clearTimeout(scanStatusResetTimeoutRef.current);
		scanStatusResetTimeoutRef.current = null;
	}, []);

	/**
	 * Schedule a reset back to the idle scanner state.
	 *
	 * @param delayMs - Delay before clearing the current status
	 * @returns {void} No return value
	 */
	const scheduleScanStatusReset = useCallback(
		(delayMs: number): void => {
			clearPendingScanStatusReset();
			scanStatusResetTimeoutRef.current = setTimeout(() => {
				setScanStatus({
					state: 'idle',
					message: i18n.t('Scanner.status.idle'),
				});
				scanStatusResetTimeoutRef.current = null;
			}, delayMs);
		},
		[clearPendingScanStatusReset],
	);

	/**
	 * Reset the current auth state and return to device authorization.
	 *
	 * Used when the kiosk has no linked device and must start the binding flow again.
	 *
	 * @returns {Promise<void>} Resolves after local auth/device state is cleared and navigation occurs
	 */
	const handleStartDeviceLinking = useCallback(async (): Promise<void> => {
		let shouldLockAuth = false;

		try {
			await signOut();
		} catch (error) {
			shouldLockAuth = true;
			console.warn('[scanner] Failed to sign out before relinking device', error);
		} finally {
			if (shouldLockAuth) {
				try {
					await requestReauth({ forceLock: true, reason: 'manual' });
				} catch (error) {
					console.warn('[scanner] Reauth lock failed during device relinking', error);
				}
			}
			try {
				await clearAuthStorage();
			} catch (error) {
				console.warn('[scanner] Auth cleanup error during device relinking', error);
			}
			try {
				await clearPendingAttendanceQueue();
			} catch (error) {
				console.warn('[scanner] Offline queue cleanup error during device relinking', error);
			}
			try {
				await clearSettings();
			} catch (error) {
				console.warn('[scanner] Device cleanup error during device relinking', error);
			}
			router.replace('/(auth)/login');
		}
	}, [clearSettings, requestReauth, router]);

	/**
	 * Cycles between CHECK_IN, CHECK_OUT_AUTHORIZED, and CHECK_OUT attendance types
	 * @returns {void} Updates the attendance type toggle value and triggers haptics
	 */
	const toggleAttendanceType = useCallback(() => {
		setAttendanceType((prev) => {
			const currentIndex = ATTENDANCE_TYPE_ORDER.indexOf(prev);
			const nextIndex =
				currentIndex >= 0 ? (currentIndex + 1) % ATTENDANCE_TYPE_ORDER.length : 0;
			return ATTENDANCE_TYPE_ORDER[nextIndex] ?? 'CHECK_IN';
		});
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
	}, []);

	/**
	 * Starts a pulsing animation for the face guide during scanning
	 * @returns {void} Initiates the continuous pulse animation loop
	 */
	const startPulseAnimation = useCallback(() => {
		if (shouldReduceMotion) {
			pulseAnim.setValue(1);
			return;
		}

		Animated.loop(
			Animated.sequence([
				Animated.timing(pulseAnim, {
					toValue: 1.05,
					duration: getAnimationDuration(800, shouldReduceMotion),
					useNativeDriver: true,
				}),
				Animated.timing(pulseAnim, {
					toValue: 1,
					duration: getAnimationDuration(800, shouldReduceMotion),
					useNativeDriver: true,
				}),
			]),
		).start();
	}, [pulseAnim, shouldReduceMotion]);

	/**
	 * Stops all animations and resets to default state
	 * @returns {void} Halts pulse animations and resets scale
	 */
	const stopAnimations = useCallback(() => {
		pulseAnim.stopAnimation();
		pulseAnim.setValue(1);
	}, [pulseAnim]);

	/**
	 * Animates the border color based on scan result
	 * @param {number} toValue - 0 for neutral, 1 for success, 2 for error
	 * @returns {void} Starts the border color transition
	 */
	const animateBorderColor = useCallback(
		(toValue: number) => {
			Animated.timing(borderColorAnim, {
				toValue,
				duration: getAnimationDuration(300, shouldReduceMotion),
				useNativeDriver: false,
			}).start();
		},
		[borderColorAnim, shouldReduceMotion],
	);

	// Request camera permissions on mount if not granted
	useEffect(() => {
		if (!permission) return;
		if (!permission.granted) {
			requestPermission();
		}
	}, [permission, requestPermission]);

	useEffect(() => {
		let isMounted = true;

		void NetInfo.fetch().then((state) => {
			if (!isMounted) {
				return;
			}

			setIsOffline(isOfflineNetInfoState(state));
		});

		const unsubscribe = NetInfo.addEventListener((state) => {
			setIsOffline(isOfflineNetInfoState(state));
		});

		return () => {
			isMounted = false;
			unsubscribe();
		};
	}, []);

	// Reset camera state when screen comes into focus
	// This ensures the camera initializes with the correct facing direction
	useFocusEffect(
		useCallback(() => {
			// Reset camera ready state to force re-initialization
			setIsCameraReady(false);
			setCameraFacing('front');

			// Small delay to ensure the camera reinitializes properly
			const timer = setTimeout(() => {
				setIsCameraReady(true);
			}, 100);

			return () => {
				clearTimeout(timer);
				setIsCameraReady(false);
			};
		}, []),
	);

	// Handle animation state based on scan status
	useEffect(() => {
		if (scanStatus.state === 'scanning') {
			startPulseAnimation();
			animateBorderColor(0);
		} else if (scanStatus.state === 'success') {
			stopAnimations();
			animateBorderColor(1);
		} else if (scanStatus.state === 'error') {
			stopAnimations();
			animateBorderColor(2);
		} else {
			stopAnimations();
			animateBorderColor(0);
		}
	}, [scanStatus.state, startPulseAnimation, stopAnimations, animateBorderColor]);

	useEffect(() => {
		const employeeName =
			scanStatus.state === 'success' && 'employeeName' in scanStatus
				? scanStatus.employeeName
				: undefined;
		const announcement =
			scanStatus.state === 'success' && employeeName
				? `${employeeName}. ${scanStatus.message}`
				: scanStatus.message;

		void AccessibilityInfo.announceForAccessibility(announcement);
	}, [scanStatus, scanStatus.message, scanStatus.state]);

	useEffect(() => {
		return () => {
			clearPendingScanStatusReset();
		};
	}, [clearPendingScanStatusReset]);

	if (needsDeviceSetup) {
		return <Redirect href={DEVICE_SETUP_ROUTE} />;
	}

	/**
	 * Captures a photo and verifies the face against the recognition API
	 * Records attendance on successful verification
	 * @returns {Promise<void>} Resolves after attempting verification and recording attendance
	 */
	const processAttendanceCapture = async (checkOutReason?: CheckOutReason) => {
		if (!tryAcquireAttendanceCaptureLock(captureLockRef, isProcessing)) {
			return;
		}

		clearPendingScanStatusReset();

		if (!cameraRef.current || !settings?.deviceId) {
			setScanStatus({ state: 'error', message: i18n.t('Scanner.status.deviceNotLinked') });
			void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
			releaseAttendanceCaptureLock(captureLockRef);
			return;
		}

		setIsProcessing(true);
		setScanStatus({ state: 'scanning', message: i18n.t('Scanner.status.verifying') });
		let captureMs = 0;
		let preprocessMs = 0;
		let payloadBytes = 0;
		let networkType: string | null = null;
		const totalStartedAt = performance.now();
		let verificationStartedAt: number | null = null;
		let processedPreviewUri: string | null = null;

		try {
			const captureStartedAt = performance.now();
			const photo = await cameraRef.current.takePictureAsync({
				quality: 1,
				base64: false,
				skipProcessing: false,
			});
			captureMs = performance.now() - captureStartedAt;

			if (!photo?.uri) {
				setScanStatus({ state: 'error', message: i18n.t('Scanner.status.captureFailed') });
				void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
				scheduleScanStatusReset(4000);
				return;
			}

			const processedPhoto = await prepareRecognitionImage({
				uri: photo.uri,
				width: photo.width,
				height: photo.height,
			});
			processedPreviewUri = processedPhoto.previewUri;
			preprocessMs = processedPhoto.preprocessMs;
			payloadBytes = processedPhoto.payloadBytes;
			networkType = await getRecognitionNetworkType();
			verificationStartedAt = performance.now();
			const match = await verifyFace({
				imageBase64: processedPhoto.base64,
				payloadBytes: processedPhoto.payloadBytes,
				platform: Platform.OS === 'ios' ? 'ios' : 'android',
				networkType,
			});
			const uploadServerMs = performance.now() - verificationStartedAt;
			const totalMs = performance.now() - captureStartedAt;

			if (match.matched && match.employee) {
				logRecognitionAttempt({
					captureMs,
					preprocessMs,
					payloadBytes,
					uploadServerMs,
					totalMs,
					networkType,
					status: 200,
					outcome: 'match',
					errorCode: null,
				});

				const metadata =
					attendanceType === 'CHECK_OUT_AUTHORIZED'
						? {
								reason: i18n.t('Scanner.attendanceType.checkOutAuthorizedReason'),
								similarity: match.match?.similarity,
								searchedFaceConfidence: match.searchedFaceConfidence,
							}
						: {
								similarity: match.match?.similarity,
								searchedFaceConfidence: match.searchedFaceConfidence,
							};

				const attendanceResult = await recordAttendance(
					match.employee.id,
					settings.deviceId,
					attendanceType,
					metadata,
					checkOutReason,
				);

				const displayName = [match.employee.firstName, match.employee.lastName]
					.filter(Boolean)
					.join(' ');

				setScanStatus({
					state: 'success',
					message:
						attendanceResult.delivery === 'queued'
							? i18n.t('Scanner.success.queuedOffline')
							: attendanceSuccessMessages[attendanceType],
					employeeName: displayName || i18n.t('Scanner.success.employeeFallback'),
				});

				// Success haptic feedback
				void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

				// Reset status after 3 seconds
				scheduleScanStatusReset(3000);
			} else {
				logRecognitionAttempt({
					captureMs,
					preprocessMs,
					payloadBytes,
					uploadServerMs,
					totalMs,
					networkType,
					status: 200,
					outcome: 'no-match',
					errorCode: match.errorCode ?? null,
				});
				setScanStatus({
					state: 'error',
					message: i18n.t('Scanner.status.faceNotRecognized'),
				});
				void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

				// Reset status after 2 seconds
				scheduleScanStatusReset(2000);
			}
		} catch (error) {
			console.error('Face verification failed:', error);
			const retryableFailure =
				error instanceof FaceVerificationError && error.retryable;
			logRecognitionAttempt({
				captureMs,
				preprocessMs,
				payloadBytes,
				uploadServerMs:
					verificationStartedAt === null
						? 0
						: performance.now() - verificationStartedAt,
				totalMs: performance.now() - totalStartedAt,
				networkType,
				status: error instanceof FaceVerificationError ? error.status : 500,
				outcome: retryableFailure ? 'retryable-failure' : 'failure',
				errorCode: error instanceof FaceVerificationError ? error.errorCode : null,
				requestId: error instanceof FaceVerificationError ? error.requestId : null,
			});
			setScanStatus({
				state: 'error',
				message: i18n.t(
					retryableFailure
						? 'Scanner.status.verificationRetryable'
						: 'Scanner.status.verificationFailed',
				),
			});
			void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
			scheduleScanStatusReset(retryableFailure ? 3000 : 4000);
		} finally {
			void cleanupRecognitionImage(processedPreviewUri);
			releaseAttendanceCaptureLock(captureLockRef);
			setIsProcessing(false);
		}
	};

	/**
	 * Opens the reason selector for regular check-outs and otherwise starts capture immediately.
	 *
	 * @returns Promise that resolves once the interaction is handled
	 */
	const handleCapture = async (): Promise<void> => {
		if (attendanceType === 'CHECK_OUT') {
			setIsCheckOutReasonSheetOpen(true);
			return;
		}

		await processAttendanceCapture();
	};

	/**
	 * Continues the check-out flow after the user selects the reason.
	 *
	 * @param checkOutReason - Selected check-out reason
	 * @returns Promise that resolves after the capture flow finishes
	 */
	const handleCheckOutReasonSelect = async (checkOutReason: CheckOutReason): Promise<void> => {
		if (captureLockRef.current || isProcessing) {
			return;
		}

		setIsCheckOutReasonSheetOpen(false);
		await processAttendanceCapture(checkOutReason);
	};

	// Interpolate border color based on animation value
	const borderColor = borderColorAnim.interpolate({
		inputRange: [0, 1, 2],
		outputRange: [neutralGuideColor, themeColors.success, themeColors.error],
	});

	// Loading state while permissions are being determined
	if (!permission) {
		return (
			<ScrollView
				style={styles.scroll}
				contentInsetAdjustmentBehavior="never"
				contentContainerStyle={styles.scrollContent}
				scrollEnabled={false}
			>
				<View style={styles.centeredContainer}>
					<Spinner size="lg" color={themeColors.primary} />
					<Text style={styles.loadingText}>
						{i18n.t('Scanner.permission.initializing')}
					</Text>
				</View>
			</ScrollView>
		);
	}

	// Permission denied state
	if (!permission.granted) {
		return (
			<ScrollView
				style={styles.scroll}
				contentInsetAdjustmentBehavior="never"
				contentContainerStyle={styles.scrollContent}
				scrollEnabled={false}
			>
				<View style={styles.centeredContainer}>
					<Card variant="default" className="max-w-xs w-full border-default-200">
						<Card.Body className="gap-4 p-6 items-center">
							<IconSymbol
								name="camera"
								size={64}
								color={themeColors.primary}
								weight="regular"
							/>
							<View className="gap-2">
								<Card.Title className="text-center text-xl">
									{i18n.t('Scanner.permission.title')}
								</Card.Title>
								<Card.Description className="text-center text-base">
									{i18n.t('Scanner.permission.description')}
								</Card.Description>
							</View>
							<Button onPress={requestPermission} className="w-full">
								<Button.Label>{i18n.t('Scanner.permission.grant')}</Button.Label>
							</Button>
						</Card.Body>
					</Card>
				</View>
			</ScrollView>
		);
	}

	return (
		<>
			<ScrollView
				style={styles.scroll}
				contentInsetAdjustmentBehavior="never"
				contentContainerStyle={styles.scrollContent}
				scrollEnabled={false}
			>
			<View style={styles.container}>
				{/* Camera View */}
				{/* Key prop forces re-mount when camera facing changes to fix initialization issues */}
				{isCameraReady && (
					<CameraView
						key={`camera-${cameraFacing}`}
						ref={cameraRef}
						pointerEvents="none"
						style={styles.camera}
						facing={cameraFacing}
						enableTorch={false}
						animateShutter
					/>
				)}

				{/* Top Bar - Attendance Type Toggle & Settings */}
				<View style={styles.topBar}>
					<Button
						variant="secondary"
						size="md"
						className="flex-1 flex-row items-center gap-2 justify-center rounded-full"
						onPress={toggleAttendanceType}
						accessibilityLabel={i18n.t('Scanner.accessibility.toggleAttendanceType')}
					>
						<View style={styles.toggleIndicator}>
							<View
								style={[styles.toggleDot, { backgroundColor: attendanceAccent }]}
							/>
						</View>
						<Button.Label className="text-base font-semibold">
							{attendanceLabels[attendanceType]}
						</Button.Label>
						<IconSymbol
							name="arrow.left.arrow.right"
							size={18}
							color={themeColors.foreground500}
						/>
					</Button>
					<Button
						variant="secondary"
						isIconOnly
						size="md"
						className="w-12 h-12 rounded-full"
						onPress={() => router.push('/(main)/face-enrollment')}
						accessibilityLabel={i18n.t('Scanner.actions.openFaceEnrollment')}
					>
						<IconSymbol
							name="person.crop.circle.badge.plus"
							size={20}
							color={themeColors.foreground}
						/>
					</Button>
					<Button
						variant="secondary"
						isIconOnly
						size="md"
						className="w-12 h-12 rounded-full"
						onPress={() => router.push('/(main)/settings')}
						accessibilityLabel={i18n.t('Scanner.accessibility.openSettings')}
					>
						<IconSymbol name="gearshape" size={20} color={themeColors.foreground} />
					</Button>
				</View>

				{/* Face Guide Overlay */}
				<View style={styles.faceGuideContainer}>
					<Animated.View
						style={[
							styles.faceGuideWrapper,
							{
								width: faceGuideSize,
								height: faceGuideSize,
								transform: [{ scale: pulseAnim }],
							},
						]}
					>
						<Animated.View
							style={[
								styles.faceGuide,
								{
									width: '100%',
									height: '100%',
									borderRadius: faceGuideSize / 2,
									borderColor: borderColor as unknown as string,
								},
							]}
						>
							{/* Corner accents */}
							<View style={[styles.cornerAccent, styles.cornerTopLeft]} />
							<View style={[styles.cornerAccent, styles.cornerTopRight]} />
							<View style={[styles.cornerAccent, styles.cornerBottomLeft]} />
							<View style={[styles.cornerAccent, styles.cornerBottomRight]} />
						</Animated.View>
					</Animated.View>

					{/* Instruction text below face guide */}
					<Animated.View
						accessible
						accessibilityLiveRegion="polite"
						accessibilityRole="alert"
						style={[styles.instructionContainer, { opacity: statusOpacity }]}
					>
						{scanStatus.state === 'success' && scanStatus.employeeName ? (
							<>
								<IconSymbol
									name="checkmark.circle"
									size={28}
									color={themeColors.success}
								/>
								<Text style={styles.employeeName}>{scanStatus.employeeName}</Text>
							</>
						) : scanStatus.state === 'error' ? (
							<IconSymbol name="xmark.circle" size={28} color={themeColors.error} />
						) : scanStatus.state === 'scanning' ? (
							<Spinner size="sm" color={themeColors.foreground} />
						) : null}
						<Text style={styles.instructionText}>{scanStatus.message}</Text>
					</Animated.View>
				</View>

				{/* Bottom Status Card */}
				<View style={styles.bottomContainer}>
					<Card
						variant="default"
						className="bg-background/90 backdrop-blur-md border-default-200"
						style={continuousCurve}
					>
						<Card.Body className="p-4 gap-4">
							{isOffline ? (
								<View className="rounded-2xl border border-warning-500/30 bg-warning-500/10 px-4 py-3 flex-row items-start gap-3">
									<IconSymbol
										name="wifi.slash"
										size={18}
										color={themeColors.warning}
									/>
									<View className="flex-1 gap-1">
										<Text className="text-sm font-semibold text-foreground">
											{i18n.t('Scanner.offline.title')}
										</Text>
										<Text className="text-xs text-foreground-500 leading-5">
											{i18n.t('Scanner.offline.description')}
										</Text>
									</View>
								</View>
							) : null}
							{!settings?.deviceId ? (
								<EmptyState
									title={i18n.t('Scanner.emptyState.title')}
									description={i18n.t('Scanner.emptyState.description')}
									actionLabel={i18n.t('Scanner.emptyState.action')}
									onAction={() => {
										void handleStartDeviceLinking();
									}}
									icon={<DeviceLinkIcon size={20} color={linkButtonContentColor} />}
								/>
							) : (
								<>
							{/* Device status row */}
							<View className="flex-row items-start justify-between gap-3">
								<View className="flex-1 gap-1.5">
									<View className="flex-row items-center gap-2">
										<View
											className={`w-2.5 h-2.5 rounded-full ${settings?.deviceId ? 'bg-success-500' : 'bg-warning-500'}`}
										/>
										<Text className="text-foreground text-sm font-medium">
											{settings?.deviceId
												? settings.name ||
													i18n.t('Scanner.deviceStatus.terminalFallback')
												: i18n.t('Scanner.deviceStatus.deviceNotLinked')}
										</Text>
									</View>
									{!settings?.deviceId ? (
										<Text className="text-foreground-400 text-xs leading-5 pl-[18px]">
											{i18n.t('Scanner.deviceStatus.setupRequired')}
										</Text>
									) : null}
								</View>
								<View className="flex-row items-center gap-1 pt-0.5">
									<IconSymbol
										name={
											settings?.deviceId
												? 'checkmark.circle'
												: 'exclamationmark.circle'
										}
										size={14}
										color={
											settings?.deviceId
												? themeColors.success
												: themeColors.warning
										}
									/>
									{settings?.deviceId ? (
										<Text className="text-foreground-400 text-xs">
											{i18n.t('Scanner.deviceStatus.connected')}
										</Text>
									) : null}
								</View>
							</View>

							{/* Scan button */}
							<Button
								onPress={handleCapture}
								isDisabled={isProcessing || !settings?.deviceId}
								variant="primary"
								className="w-full h-14"
								accessibilityLabel={attendanceActionLabels[attendanceType]}
								style={{
									backgroundColor: ctaBackground,
									borderColor: ctaBackground,
								}}
							>
								{isProcessing ? (
									<View className="flex-row items-center gap-3">
										<Spinner size="sm" color={ctaContentColor} />
										<Button.Label className="text-lg">
											{i18n.t('Scanner.actions.verifying')}
										</Button.Label>
									</View>
								) : (
									<View className="flex-row items-center gap-2">
										<IconSymbol
											name="viewfinder"
											size={22}
											color={ctaContentColor}
										/>
										<Button.Label
											className="text-lg"
											style={{ color: ctaContentColor }}
										>
											{attendanceActionLabels[attendanceType]}
										</Button.Label>
									</View>
								)}
							</Button>

								</>
							)}
						</Card.Body>
					</Card>
				</View>
			</View>
			</ScrollView>
			<CheckOutReasonSheet
				isOpen={isCheckOutReasonSheetOpen}
				onClose={() => setIsCheckOutReasonSheetOpen(false)}
				onSelectReason={handleCheckOutReasonSelect}
			/>
		</>
	);
}

/**
 * Builds themed styles for the scanner screen.
 *
 * @param themeColors - Palette derived from the active color scheme
 * @param isDarkMode - Whether dark mode is currently enabled
 * @param bottomInset - Safe area inset for bottom padding
 * @returns Theme-aware style object for the scanner screen
 */
type ScannerStyles = {
	scroll: ViewStyle;
	scrollContent: ViewStyle;
	container: ViewStyle;
	camera: ViewStyle;
	centeredContainer: ViewStyle;
	loadingText: TextStyle;
	permissionCard: ViewStyle;
	permissionTitle: TextStyle;
	permissionDescription: TextStyle;
	topBar: ViewStyle;
	attendanceToggle: ViewStyle;
	checkInToggle: ViewStyle;
	checkOutToggle: ViewStyle;
	toggleIndicator: ViewStyle;
	toggleDot: ViewStyle;
	toggleText: TextStyle;
	settingsButton: ViewStyle;
	faceGuideContainer: ViewStyle;
	faceGuideWrapper: ViewStyle;
	faceGuide: ViewStyle;
	cornerAccent: ViewStyle;
	cornerTopLeft: ViewStyle;
	cornerTopRight: ViewStyle;
	cornerBottomLeft: ViewStyle;
	cornerBottomRight: ViewStyle;
	instructionContainer: ViewStyle;
	employeeName: TextStyle;
	instructionText: TextStyle;
	bottomContainer: ViewStyle;
};

const createScannerStyles = (
	themeColors: ScannerThemeColors,
	isDarkMode: boolean,
	topInset: number,
	bottomInset: number,
): ScannerStyles => ({
	scroll: {
		flex: 1,
		backgroundColor: themeColors.background,
	},
	scrollContent: {
		flexGrow: 1,
	},
	container: {
		flex: 1,
		backgroundColor: themeColors.background,
	},
	camera: {
		position: 'absolute',
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
	},
	centeredContainer: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: themeColors.background,
		padding: 24,
		gap: 16,
	},
	loadingText: {
		fontSize: 16,
		color: themeColors.foreground500,
	},
	permissionCard: {
		alignItems: 'center',
		backgroundColor: themeColors.content1,
		borderRadius: 24,
		padding: 32,
		width: '100%',
		maxWidth: 340,
		borderWidth: 1,
		borderColor: themeColors.border,
	},
	permissionTitle: {
		fontSize: 22,
		fontWeight: '700',
		color: themeColors.text,
		textAlign: 'center',
	},
	permissionDescription: {
		fontSize: 15,
		color: themeColors.foreground400,
		textAlign: 'center',
		lineHeight: 22,
	},
	topBar: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		flexDirection: 'row',
		justifyContent: 'flex-start',
		alignItems: 'center',
		gap: 12,
		paddingTop: Math.max(16, topInset + 8),
		paddingHorizontal: 16,
		paddingBottom: 12,
		zIndex: 2,
	},
	attendanceToggle: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: 28,
		borderWidth: 1,
		backgroundColor: themeColors.overlay,
	},
	checkInToggle: {
		borderColor: themeColors.success,
	},
	checkOutToggle: {
		borderColor: themeColors.error,
	},
	toggleIndicator: {
		width: 20,
		height: 20,
		borderRadius: 10,
		backgroundColor: themeColors.overlayMuted,
		alignItems: 'center',
		justifyContent: 'center',
	},
	toggleDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
	},
	toggleText: {
		color: themeColors.foreground,
		fontSize: 15,
		fontWeight: '600',
	},
	settingsButton: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: themeColors.overlay,
		alignItems: 'center',
		justifyContent: 'center',
		borderWidth: 1,
		borderColor: themeColors.border,
	},
	faceGuideContainer: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 160,
		alignItems: 'center',
		justifyContent: 'center',
		gap: 24,
	},
	faceGuideWrapper: {
		alignItems: 'center',
		justifyContent: 'center',
	},
	faceGuide: {
		borderWidth: 3,
		backgroundColor: 'transparent',
		position: 'relative',
		borderColor: themeColors.foreground500,
	},
	cornerAccent: {
		position: 'absolute',
		width: 30,
		height: 30,
		borderColor: 'white',
		borderWidth: 3,
	},
	cornerTopLeft: {
		top: 20,
		left: 20,
		borderRightWidth: 0,
		borderBottomWidth: 0,
		borderTopLeftRadius: 8,
	},
	cornerTopRight: {
		top: 20,
		right: 20,
		borderLeftWidth: 0,
		borderBottomWidth: 0,
		borderTopRightRadius: 8,
	},
	cornerBottomLeft: {
		bottom: 20,
		left: 20,
		borderRightWidth: 0,
		borderTopWidth: 0,
		borderBottomLeftRadius: 8,
	},
	cornerBottomRight: {
		bottom: 20,
		right: 20,
		borderLeftWidth: 0,
		borderTopWidth: 0,
		borderBottomRightRadius: 8,
	},
	instructionContainer: {
		alignItems: 'center',
		gap: 8,
		paddingHorizontal: 24,
	},
	employeeName: {
		fontSize: 20,
		fontWeight: '700',
		color: themeColors.success,
		textAlign: 'center',
	},
	instructionText: {
		fontSize: 16,
		color: 'white',
		textAlign: 'center',
		textShadowColor: withAlpha(themeColors.background, isDarkMode ? 0.8 : 0.65),
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 4,
	},
	bottomContainer: {
		position: 'absolute',
		bottom: 0,
		left: 0,
		right: 0,
		paddingHorizontal: 16,
		paddingBottom: Math.max(28, bottomInset + 28),
		zIndex: 2,
	},
});
