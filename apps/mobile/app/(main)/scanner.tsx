import { type CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { Button, Card, Spinner } from 'heroui-native';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	Animated,
	ScrollView,
	Text,
	View,
	useWindowDimensions,
	type TextStyle,
	type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, type ThemeColors } from '@/constants/theme';
import { useDeviceContext } from '@/lib/device-context';
import { i18n } from '@/lib/i18n';
import { recordAttendance, verifyFace } from '@/lib/face-recognition';
import type { AttendanceType } from '@/lib/query-keys';
import { useTheme } from '@/providers/theme-provider';

/** Represents the current status of the face scanning operation */
type ScanStatus =
	| { state: 'idle'; message: string }
	| { state: 'scanning'; message: string }
	| { state: 'success'; message: string; employeeName?: string }
	| { state: 'error'; message: string };

/** Maximum size for face guide circle on larger devices (tablets) */
const MAX_FACE_GUIDE_SIZE = 400;
const ATTENDANCE_TYPE_ORDER: AttendanceType[] = ['CHECK_IN', 'CHECK_OUT_AUTHORIZED', 'CHECK_OUT'];

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
 * Face scanner screen component for attendance verification
 * @returns {JSX.Element} The scanner screen with camera view and controls
 */
export default function ScannerScreen(): JSX.Element {
	const cameraRef = useRef<CameraView | null>(null);
	const [permission, requestPermission] = useCameraPermissions();
	const router = useRouter();
	const { settings } = useDeviceContext();
	const { colorScheme, isDarkMode } = useTheme();
	const insets = useSafeAreaInsets();
	const themeColors = useMemo<ThemeColors>(
		() => (colorScheme === 'dark' ? Colors.dark : Colors.light),
		[colorScheme],
	);
	const styles = useMemo(
		() => createScannerStyles(themeColors, isDarkMode, insets.top, insets.bottom),
		[insets.bottom, insets.top, isDarkMode, themeColors],
	);
	const continuousCurve = useMemo(() => ({ borderCurve: 'continuous' as const }), []);
	const isIOS = process.env.EXPO_OS === 'ios';
	const isAndroid = process.env.EXPO_OS === 'android';

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

	const [attendanceType, setAttendanceType] = useState<AttendanceType>('CHECK_IN');
	const [isProcessing, setIsProcessing] = useState(false);
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
	const neutralGuideColor = 'rgba(255, 255, 255, 0.8)';
	const ctaBackground = attendanceAccent;
	const ctaContentColor = '#ffffff';

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
		if (isIOS) {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		}
	}, [isIOS]);

	/**
	 * Starts a pulsing animation for the face guide during scanning
	 * @returns {void} Initiates the continuous pulse animation loop
	 */
	const startPulseAnimation = useCallback(() => {
		Animated.loop(
			Animated.sequence([
				Animated.timing(pulseAnim, {
					toValue: 1.05,
					duration: 800,
					useNativeDriver: true,
				}),
				Animated.timing(pulseAnim, {
					toValue: 1,
					duration: 800,
					useNativeDriver: true,
				}),
			]),
		).start();
	}, [pulseAnim]);

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
				duration: 300,
				useNativeDriver: false,
			}).start();
		},
		[borderColorAnim],
	);

	// Request camera permissions on mount if not granted
	useEffect(() => {
		if (!permission) return;
		if (!permission.granted) {
			requestPermission();
		}
	}, [permission, requestPermission]);

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

	/**
	 * Captures a photo and verifies the face against the recognition API
	 * Records attendance on successful verification
	 * @returns {Promise<void>} Resolves after attempting verification and recording attendance
	 */
	const handleCapture = async () => {
		if (!cameraRef.current || !settings?.deviceId) {
			setScanStatus({ state: 'error', message: i18n.t('Scanner.status.deviceNotLinked') });
			if (isIOS) {
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
			}
			return;
		}

		setIsProcessing(true);
		setScanStatus({ state: 'scanning', message: i18n.t('Scanner.status.verifying') });

		try {
			const photo = await cameraRef.current.takePictureAsync({
				quality: 0.5,
				base64: true,
				skipProcessing: isAndroid, // Skip processing on Android for speed
			});

			if (!photo?.base64) {
				setScanStatus({ state: 'error', message: i18n.t('Scanner.status.captureFailed') });
				if (isIOS) {
					Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
				}
				return;
			}

			const match = await verifyFace(photo.base64);

			if (match.matched && match.employee) {
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

				await recordAttendance(
					match.employee.id,
					settings.deviceId,
					attendanceType,
					metadata,
				);

				const displayName = [match.employee.firstName, match.employee.lastName]
					.filter(Boolean)
					.join(' ');

				setScanStatus({
					state: 'success',
					message: attendanceSuccessMessages[attendanceType],
					employeeName: displayName || i18n.t('Scanner.success.employeeFallback'),
				});

				// Success haptic feedback
				if (isIOS) {
					Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
				}

				// Reset status after 3 seconds
				setTimeout(() => {
					setScanStatus({
						state: 'idle',
						message: i18n.t('Scanner.status.idle'),
					});
				}, 3000);
			} else {
				setScanStatus({
					state: 'error',
					message: i18n.t('Scanner.status.faceNotRecognized'),
				});
				if (isIOS) {
					Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
				}

				// Reset status after 2 seconds
				setTimeout(() => {
					setScanStatus({
						state: 'idle',
						message: i18n.t('Scanner.status.idle'),
					});
				}, 2000);
			}
		} catch (error) {
			console.error('Face verification failed:', error);
			setScanStatus({
				state: 'error',
				message: i18n.t('Scanner.status.verificationFailed'),
			});
			if (isIOS) {
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
			}
		} finally {
			setIsProcessing(false);
		}
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
							{/* Device status row */}
							<View className="flex-row items-center justify-between">
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
								<View className="flex-row items-center gap-1">
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
									<Text className="text-foreground-400 text-xs">
										{settings?.deviceId
											? i18n.t('Scanner.deviceStatus.connected')
											: i18n.t('Scanner.deviceStatus.setupRequired')}
									</Text>
								</View>
							</View>

							{/* Scan button */}
							<Button
								onPress={handleCapture}
								isDisabled={isProcessing || !settings?.deviceId}
								variant="primary"
								className="w-full h-14"
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

							{/* Link device prompt */}
							{!settings?.deviceId && (
								<Link href="/(main)/settings">
									<Link.Trigger>
										<Button variant="tertiary" size="sm">
											<View className="flex-row items-center gap-2">
												<IconSymbol
													name="link"
													size={16}
													color={themeColors.warning}
												/>
												<Button.Label className="text-warning-500 font-semibold">
													{i18n.t('Scanner.actions.tapToLink')}
												</Button.Label>
											</View>
										</Button>
									</Link.Trigger>
									<Link.Preview />
								</Link>
							)}
						</Card.Body>
					</Card>
				</View>
			</View>
		</ScrollView>
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
	themeColors: ThemeColors,
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
		borderColor: '#FFFFFF',
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
		color: '#FFFFFF',
		textAlign: 'center',
		textShadowColor: isDarkMode ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.65)',
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
