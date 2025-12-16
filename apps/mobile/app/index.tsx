import type { JSX } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';

import { useAuthContext } from '@/providers/auth-provider';

export default function Index(): JSX.Element {
	const { session, isLoading } = useAuthContext();

	if (isLoading) {
		return (
			<View className="flex-1 items-center justify-center bg-background">
				<ActivityIndicator />
			</View>
		);
	}

	if (session) {
		return <Redirect href="/(main)/scanner" />;
	}

	return <Redirect href="/(auth)/login" />;
}
