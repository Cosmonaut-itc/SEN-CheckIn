import type { JSX } from 'react';
import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/stack';

import { useAuthContext } from '@/providers/auth-provider';
import { i18n } from '@/lib/i18n';

export default function MainLayout(): JSX.Element {
	const { session, isLoading, authState } = useAuthContext();

	if (!isLoading && authState === 'locked') {
		return <Redirect href="/(auth)/locked" />;
	}

	if (!isLoading && !session && authState !== 'grace' && authState !== 'refreshing') {
		return <Redirect href="/(auth)/login" />;
	}

	return (
		<Stack screenOptions={{ headerTitleAlign: 'center' }}>
			<Stack.Screen name="scanner" options={{ title: i18n.t('Scanner.title') }} />
			<Stack.Screen name="settings" options={{ title: i18n.t('Settings.title') }} />
		</Stack>
	);
}
