import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { HeroUINativeProvider, type HeroUINativeConfig } from 'heroui-native';
import { View, type LayoutChangeEvent } from 'react-native';
import 'react-native-reanimated';

import { DeviceProvider } from '@/lib/device-context';
import { ROOT_STACK_SCREEN_OPTIONS } from '@/lib/navigation-config';
import { StartupGate } from '@/components/startup/startup-gate';
import { QueryProvider } from '@/providers/query-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { ThemeProvider, useTheme } from '@/providers/theme-provider';

import '../global.css';
import '@/lib/uniwind-compat';

const NATIVE_SPLASH_FADE_DURATION_MS = 180;

/**
 * Determine whether splash-screen native controls should run on this platform.
 *
 * @returns True when running on iOS or Android
 */
function isNativeMobilePlatform(): boolean {
	return process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android';
}

const isNativeMobile = isNativeMobilePlatform();
let hasConfiguredNativeSplashHold = false;
let hasCompletedStartupIntro = false;

/**
 * Configure native splash behavior once per process.
 *
 * @returns No return value
 */
function configureNativeSplash(): void {
	if (!isNativeMobile || hasConfiguredNativeSplashHold) {
		return;
	}

	hasConfiguredNativeSplashHold = true;

	SplashScreen.preventAutoHideAsync().catch((error: unknown) => {
		console.warn('[RootLayout] Failed to prevent splash auto-hide', error);
	});

	try {
		SplashScreen.setOptions({
			fade: true,
			duration: NATIVE_SPLASH_FADE_DURATION_MS,
		});
	} catch (error) {
		console.warn('[RootLayout] Failed to configure splash fade', error);
	}
}

configureNativeSplash();

const heroUiConfig: HeroUINativeConfig = {
	textProps: {
		minimumFontScale: 0.5,
		maxFontSizeMultiplier: 1.5,
	},
};

/**
 * Root layout entry point for the Expo Router app.
 *
 * @returns {JSX.Element} Wrapped provider tree with gesture support
 */
export default function RootLayout(): JSX.Element {
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<ThemeProvider>
				<AppProviders />
			</ThemeProvider>
		</GestureHandlerRootView>
	);
}

/**
 * Composes app-wide providers with theme-aware configuration.
 *
 * @returns {JSX.Element} Provider stack including navigation and status bar
 */
function AppProviders(): JSX.Element {
	const { colorScheme, isDarkMode } = useTheme();
	const statusBarStyle = isDarkMode ? 'light' : 'dark';
	const [isRootLayoutReady, setIsRootLayoutReady] = useState(false);
	const [isStartupIntroVisible, setIsStartupIntroVisible] = useState<boolean>(
		() => isNativeMobile && !hasCompletedStartupIntro,
	);
	const [isStartupIntroMounted, setIsStartupIntroMounted] = useState(false);
	const [hasHiddenNativeSplash, setHasHiddenNativeSplash] = useState(() => !isNativeMobile);

	/**
	 * Mark root layout as ready after its first layout pass.
	 *
	 * @param event - Root view layout event
	 * @returns No return value
	 */
	const handleRootLayout = useCallback((event: LayoutChangeEvent): void => {
		if (event.nativeEvent.layout.width <= 0 || event.nativeEvent.layout.height <= 0) {
			return;
		}
		setIsRootLayoutReady(true);
	}, []);

	/**
	 * Track when the startup intro has mounted and is safe to reveal.
	 *
	 * @returns No return value
	 */
	const handleStartupIntroMounted = useCallback((): void => {
		setIsStartupIntroMounted(true);
	}, []);

	/**
	 * Finalize startup intro visibility for this process.
	 *
	 * @returns No return value
	 */
	const handleStartupIntroFinished = useCallback((): void => {
		hasCompletedStartupIntro = true;
		setIsStartupIntroVisible(false);
	}, []);

	useEffect(() => {
		if (!isNativeMobile || hasHiddenNativeSplash || !isRootLayoutReady) {
			return;
		}

		if (isStartupIntroVisible && !isStartupIntroMounted) {
			return;
		}

		SplashScreen.hideAsync()
			.catch((error: unknown) => {
				console.warn('[RootLayout] Failed to hide splash screen', error);
			})
			.finally(() => {
				setHasHiddenNativeSplash(true);
			});
	}, [
		hasHiddenNativeSplash,
		isRootLayoutReady,
		isStartupIntroMounted,
		isStartupIntroVisible,
	]);

	return (
		<View
			style={{ flex: 1 }}
			className={isDarkMode ? 'dark' : undefined}
			dataSet={{ theme: colorScheme }}
			onLayout={handleRootLayout}
		>
			<HeroUINativeProvider config={heroUiConfig}>
				<QueryProvider>
					<AuthProvider>
						<DeviceProvider>
							<Stack
								screenOptions={ROOT_STACK_SCREEN_OPTIONS}
							>
								<Stack.Screen name="(auth)" />
								<Stack.Screen name="(main)" />
							</Stack>
							<StartupGate
								isVisible={isStartupIntroVisible}
								isDarkMode={isDarkMode}
								onMounted={handleStartupIntroMounted}
								onFinished={handleStartupIntroFinished}
							/>
							<StatusBar style={statusBarStyle} />
						</DeviceProvider>
					</AuthProvider>
				</QueryProvider>
			</HeroUINativeProvider>
		</View>
	);
}
