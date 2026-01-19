import type { JSX } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Redirect } from 'expo-router';

import { useAuthContext } from '@/providers/auth-provider';

export default function Index(): JSX.Element {
	const { session, isLoading } = useAuthContext();

	if (isLoading) {
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

	if (session) {
		return <Redirect href="/(main)/scanner" />;
	}

	return <Redirect href="/(auth)/login" />;
}
