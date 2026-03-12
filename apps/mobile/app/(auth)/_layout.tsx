import type { JSX } from 'react';
import { Redirect, type Href, useSegments } from 'expo-router';
import { Stack } from 'expo-router/stack';

import { Colors } from '@/constants/theme';
import { useAuthContext } from '@/providers/auth-provider';
import { useDeviceContext } from '@/lib/device-context';
import { i18n } from '@/lib/i18n';
import { useTheme } from '@/providers/theme-provider';

const LOCKED_ROUTE = '/(auth)/locked' as Href;

/**
 * Layout for authentication screens.
 * Redirects to scanner if the user already has a session,
 * except when on the device-setup screen (post-auth onboarding step).
 *
 * @returns Auth layout JSX element
 */
export default function AuthLayout(): JSX.Element {
	const { session, isLoading, authState } = useAuthContext();
	const { settings, isHydrated } = useDeviceContext();
	const { colorScheme } = useTheme();
	const segments = useSegments();
	const segmentList = Array.isArray(segments) ? (segments as readonly string[]) : [];
	const themeColors = Colors[colorScheme];

	// Allow device-setup even with session (it's a post-auth onboarding step)
	const isOnDeviceSetup = segmentList.includes('device-setup');
	const isOnLocked = segmentList.includes('locked');
	const isOnLogin = segmentList.includes('login');
	const needsDeviceSetup = isHydrated && Boolean(settings?.deviceId) && !settings?.locationId;

	if (!isLoading && authState === 'locked' && !isOnLocked && !isOnLogin) {
		return <Redirect href={LOCKED_ROUTE} />;
	}

	if (!isLoading && session && !isOnDeviceSetup && !needsDeviceSetup && authState !== 'locked') {
		return <Redirect href="/(main)/scanner" />;
	}

	return (
		<Stack
			screenOptions={{
				headerTitleAlign: 'center',
				headerStyle: {
					backgroundColor: themeColors.background,
				},
				headerTintColor: themeColors.foreground,
				headerTitleStyle: {
					color: themeColors.foreground,
				},
			}}
		>
			<Stack.Screen name="login" options={{ headerShown: false }} />
			<Stack.Screen
				name="device-setup"
				options={{ title: i18n.t('DeviceSetup.header.title') }}
			/>
			<Stack.Screen name="locked" options={{ title: i18n.t('Locked.title') }} />
		</Stack>
	);
}
