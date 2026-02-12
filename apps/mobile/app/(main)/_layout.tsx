import type { JSX } from 'react';
import { Redirect, type Href } from 'expo-router';
import { Stack } from 'expo-router/stack';

import { useAuthContext } from '@/providers/auth-provider';
import { i18n } from '@/lib/i18n';

const LOCKED_ROUTE = '/(auth)/locked' as Href;

export default function MainLayout(): JSX.Element {
	const { session, isLoading, authState } = useAuthContext();

	if (!isLoading && authState === 'locked') {
		return <Redirect href={LOCKED_ROUTE} />;
	}

	if (!isLoading && !session && authState !== 'grace' && authState !== 'refreshing') {
		return <Redirect href="/(auth)/login" />;
	}

	return (
		<Stack screenOptions={{ headerShown: false, headerTitleAlign: 'center' }}>
			<Stack.Screen name="scanner" options={{ title: i18n.t('Scanner.title') }} />
			<Stack.Screen name="settings" options={{ title: i18n.t('Settings.title') }} />
			<Stack.Screen
				name="face-enrollment"
				options={{ title: i18n.t('FaceEnrollment.title'), headerShown: true }}
			/>
		</Stack>
	);
}
