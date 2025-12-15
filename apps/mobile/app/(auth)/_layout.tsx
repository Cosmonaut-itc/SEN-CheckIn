import type { JSX } from 'react';
import { Redirect, Stack, useSegments } from 'expo-router';

import { useAuthContext } from '@/providers/auth-provider';
import { useDeviceContext } from '@/lib/device-context';

/**
 * Layout for authentication screens.
 * Redirects to scanner if the user already has a session,
 * except when on the device-setup screen (post-auth onboarding step).
 *
 * @returns Auth layout JSX element
 */
export default function AuthLayout(): JSX.Element {
	const { session, isLoading } = useAuthContext();
	const { settings, isHydrated } = useDeviceContext();
	const segments = useSegments();
	const segmentList = Array.isArray(segments) ? (segments as readonly string[]) : [];

	// Allow device-setup even with session (it's a post-auth onboarding step)
	const isOnDeviceSetup = segmentList.includes('device-setup');
	const needsDeviceSetup = isHydrated && Boolean(settings?.deviceId) && !settings?.locationId;

	if (!isLoading && session && !isOnDeviceSetup && !needsDeviceSetup) {
		return <Redirect href="/(main)/scanner" />;
	}

	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Screen name="login" />
			<Stack.Screen name="device-setup" />
		</Stack>
	);
}
