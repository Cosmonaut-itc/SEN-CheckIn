import type { JSX } from 'react';
import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/stack';

/**
 * Screenshot preview layout used only for curated store-listing captures.
 *
 * @returns Hidden-header stack for preview routes
 */
export default function PreviewLayout(): JSX.Element {
	if (process.env.EXPO_PUBLIC_ENABLE_PREVIEW_ROUTES !== 'true') {
		return <Redirect href="/(main)/scanner" />;
	}

	return <Stack screenOptions={{ headerShown: false }} />;
}
