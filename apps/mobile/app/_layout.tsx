import type { JSX } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { HeroUINativeProvider, type HeroUINativeConfig } from 'heroui-native';
import { View } from 'react-native';
import 'react-native-reanimated';

import { QueryProvider } from '@/providers/query-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { ThemeProvider, useTheme } from '@/providers/theme-provider';
import { DeviceProvider } from '@/lib/device-context';

import '../global.css';
import '@/lib/uniwind-compat';

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

	return (
		<View
			style={{ flex: 1 }}
			className={isDarkMode ? 'dark' : undefined}
			dataSet={{ theme: colorScheme }}
		>
			<HeroUINativeProvider config={heroUiConfig}>
				<QueryProvider>
					<AuthProvider>
						<DeviceProvider>
							<Stack
								screenOptions={{
									headerShown: false,
									// Use right-to-left slide animation for navigation transitions
									animation: 'slide_from_right',
								}}
							>
								<Stack.Screen name="(auth)" />
								<Stack.Screen name="(main)" />
							</Stack>
							<StatusBar style={statusBarStyle} />
						</DeviceProvider>
					</AuthProvider>
				</QueryProvider>
			</HeroUINativeProvider>
		</View>
	);
}
