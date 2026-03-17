import type { JSX } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Redirect, type Href } from 'expo-router';

import { useDeviceContext } from '@/lib/device-context';
import { useAuthContext } from '@/providers/auth-provider';

const LOCKED_ROUTE = '/(auth)/locked' as Href;
const DEVICE_SETUP_ROUTE = '/(auth)/device-setup' as Href;

export default function Index(): JSX.Element {
	const { session, isLoading, authState } = useAuthContext();
	const { settings, isHydrated } = useDeviceContext();
	const hasActiveSession = Boolean(session?.session);
	const needsDeviceSetup =
		hasActiveSession && isHydrated && Boolean(settings?.deviceId) && !settings?.locationId;

	if (isLoading || !isHydrated) {
		return (
			<ScrollView
				className="flex-1 bg-background"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerClassName="flex-1 items-center justify-center"
				showsVerticalScrollIndicator={false}
			>
				<View>
					<ActivityIndicator />
				</View>
			</ScrollView>
		);
	}

	if (authState === 'locked') {
		return <Redirect href={LOCKED_ROUTE} />;
	}

	if (needsDeviceSetup) {
		return <Redirect href={DEVICE_SETUP_ROUTE} />;
	}

	if (session) {
		return <Redirect href="/(main)/scanner" />;
	}

	if (authState === 'grace' || authState === 'refreshing') {
		return <Redirect href="/(main)/scanner" />;
	}

	return <Redirect href="/(auth)/login" />;
}
