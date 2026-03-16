import type { JSX } from 'react';
import { View, type ViewProps } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedViewProps = ViewProps & {
	lightColor?: string;
	darkColor?: string;
};

/**
 * Theme-aware view wrapper that applies the background color token.
 *
 * @param props - View props plus optional theme color overrides
 * @returns {JSX.Element} View element with themed background
 */
export function ThemedView({
	style,
	lightColor,
	darkColor,
	...otherProps
}: ThemedViewProps): JSX.Element {
	const colorScheme = useColorScheme() ?? 'light';
	const themeColor = useThemeColor('background');
	const backgroundColor =
		colorScheme === 'dark' ? (darkColor ?? themeColor) : (lightColor ?? themeColor);

	return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
