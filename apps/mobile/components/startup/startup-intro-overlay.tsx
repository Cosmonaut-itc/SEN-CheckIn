import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
	Easing,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';

const LOGO_SOURCE = require('../../assets/images/splash-icon.png');

const ENTRANCE_DURATION_MS = 220;
const EXIT_DURATION_MS = 160;
const REDUCED_MOTION_DURATION_MS = 90;
const MIN_VISIBLE_DURATION_MS = 500;
const LOGO_SIZE = 180;

export type StartupPhase = 'animating' | 'waiting-ready' | 'exiting' | 'done';

export type StartupIntroOverlayProps = {
	isVisible: boolean;
	isAppReady: boolean;
	isDarkMode: boolean;
	onFinished: () => void;
};

/**
 * Resolve transition duration based on reduced-motion preference.
 *
 * @param isReduceMotionEnabled - Whether reduce-motion accessibility is active
 * @returns Transition duration in milliseconds
 */
function getTransitionDuration(isReduceMotionEnabled: boolean): number {
	return isReduceMotionEnabled ? REDUCED_MOTION_DURATION_MS : ENTRANCE_DURATION_MS;
}

/**
 * Resolve overlay background color from the active theme.
 *
 * @param isDarkMode - Whether dark mode is active
 * @returns Hex color for the splash overlay background
 */
function getOverlayBackgroundColor(isDarkMode: boolean): string {
	return isDarkMode ? '#000000' : '#ffffff';
}

/**
 * Resolve spinner color from the active theme.
 *
 * @param isDarkMode - Whether dark mode is active
 * @returns Hex color for the loading spinner
 */
function getSpinnerColor(isDarkMode: boolean): string {
	return isDarkMode ? '#ffffff' : '#0f172a';
}

/**
 * Full-screen startup overlay that animates the app logo during boot.
 *
 * @param props - Overlay visibility, readiness state, and completion callback
 * @returns Animated startup overlay or null when hidden
 */
export function StartupIntroOverlay({
	isVisible,
	isAppReady,
	isDarkMode,
	onFinished,
}: StartupIntroOverlayProps): JSX.Element | null {
	const [phase, setPhase] = useState<StartupPhase>('animating');
	const [isReduceMotionEnabled, setIsReduceMotionEnabled] = useState(false);
	const hasStartedRef = useRef(false);
	const hasFinishedRef = useRef(false);
	const visibleSinceRef = useRef(Date.now());
	const logoOpacity = useSharedValue(0);
	const logoScale = useSharedValue(0.94);
	const overlayOpacity = useSharedValue(1);

	/**
	 * Complete the intro overlay and notify the parent once.
	 *
	 * @returns No return value
	 */
	const finishOverlay = useCallback((): void => {
		if (hasFinishedRef.current) {
			return;
		}

		hasFinishedRef.current = true;
		setPhase('done');
		onFinished();
	}, [onFinished]);

	/**
	 * Transition the overlay into the waiting phase.
	 *
	 * @returns No return value
	 */
	const moveToWaitingPhase = useCallback((): void => {
		if (hasFinishedRef.current) {
			return;
		}

		setPhase('waiting-ready');
	}, []);

	/**
	 * Start the exit fade animation and finish when complete.
	 *
	 * @returns No return value
	 */
	const startExitAnimation = useCallback((): void => {
		if (hasFinishedRef.current) {
			return;
		}

		setPhase('exiting');

		try {
			const duration = isReduceMotionEnabled ? REDUCED_MOTION_DURATION_MS : EXIT_DURATION_MS;
			logoOpacity.value = withTiming(0, {
				duration,
				easing: Easing.out(Easing.quad),
			});
			overlayOpacity.value = withTiming(
				0,
				{
					duration,
					easing: Easing.out(Easing.quad),
				},
				() => {
					runOnJS(finishOverlay)();
				},
			);
		} catch (error) {
			console.warn('[StartupIntroOverlay] Failed to run exit animation', error);
			finishOverlay();
		}
	}, [finishOverlay, isReduceMotionEnabled, logoOpacity, overlayOpacity]);

	useEffect(() => {
		let isSubscribed = true;
		const subscription = AccessibilityInfo.addEventListener(
			'reduceMotionChanged',
			(enabled: boolean) => {
				setIsReduceMotionEnabled(enabled);
			},
		);

		/**
		 * Fetch current reduce-motion preference.
		 *
		 * @returns Promise that resolves when preference is loaded
		 */
		const resolveReduceMotionPreference = async (): Promise<void> => {
			try {
				const enabled = await AccessibilityInfo.isReduceMotionEnabled();
				if (!isSubscribed) {
					return;
				}
				setIsReduceMotionEnabled(enabled);
			} catch (error) {
				console.warn('[StartupIntroOverlay] Failed to read reduce-motion setting', error);
			}
		};

		void resolveReduceMotionPreference();

		return () => {
			isSubscribed = false;
			subscription.remove();
		};
	}, []);

	useEffect(() => {
		if (!isVisible || hasStartedRef.current) {
			return;
		}

		hasStartedRef.current = true;
		visibleSinceRef.current = Date.now();

		try {
			const duration = getTransitionDuration(isReduceMotionEnabled);
			logoOpacity.value = withTiming(1, {
				duration,
				easing: Easing.out(Easing.cubic),
			});

			if (isReduceMotionEnabled) {
				logoScale.value = 1;
				moveToWaitingPhase();
			} else {
				logoScale.value = withTiming(
					1,
					{
						duration,
						easing: Easing.out(Easing.cubic),
					},
					() => {
						runOnJS(moveToWaitingPhase)();
					},
				);
			}
		} catch (error) {
			console.warn('[StartupIntroOverlay] Failed to run entrance animation', error);
			finishOverlay();
			return;
		}

		const fallbackDuration = getTransitionDuration(isReduceMotionEnabled) + 150;
		const fallbackTimer = setTimeout(() => {
			moveToWaitingPhase();
		}, fallbackDuration);

		return () => {
			clearTimeout(fallbackTimer);
		};
	}, [finishOverlay, isReduceMotionEnabled, isVisible, logoOpacity, logoScale, moveToWaitingPhase]);

	useEffect(() => {
		if (!isVisible || phase !== 'waiting-ready' || !isAppReady) {
			return;
		}

		const elapsed = Date.now() - visibleSinceRef.current;
		const remaining = Math.max(0, MIN_VISIBLE_DURATION_MS - elapsed);
		const exitTimer = setTimeout(() => {
			startExitAnimation();
		}, remaining);

		return () => {
			clearTimeout(exitTimer);
		};
	}, [isAppReady, isVisible, phase, startExitAnimation]);

	const overlayAnimatedStyle = useAnimatedStyle(() => ({
		opacity: overlayOpacity.value,
	}));

	const logoAnimatedStyle = useAnimatedStyle(() => ({
		opacity: logoOpacity.value,
		transform: [{ scale: logoScale.value }],
	}));

	if (!isVisible || phase === 'done') {
		return null;
	}

	const shouldShowSpinner = phase === 'waiting-ready' && !isAppReady;
	const backgroundColor = getOverlayBackgroundColor(isDarkMode);
	const spinnerColor = getSpinnerColor(isDarkMode);

	return (
		<Animated.View
			pointerEvents="auto"
			style={[styles.overlay, { backgroundColor }, overlayAnimatedStyle]}
		>
			<Animated.View style={logoAnimatedStyle}>
				<Image source={LOGO_SOURCE} style={styles.logo} contentFit="contain" />
			</Animated.View>
			{shouldShowSpinner ? (
				<View style={styles.spinnerContainer}>
					<ActivityIndicator color={spinnerColor} />
				</View>
			) : null}
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	overlay: {
		...StyleSheet.absoluteFillObject,
		alignItems: 'center',
		justifyContent: 'center',
		zIndex: 999,
	},
	logo: {
		height: LOGO_SIZE,
		width: LOGO_SIZE,
	},
	spinnerContainer: {
		marginTop: 24,
	},
});
