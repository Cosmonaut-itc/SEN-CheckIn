import type { JSX } from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
	lightColor?: string;
	darkColor?: string;
	type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

/**
 * Theme-aware text component that applies typographic presets.
 *
 * @param props - Text props plus theme overrides and type preset
 * @returns {JSX.Element} Styled Text element
 */
export function ThemedText({
	style,
	lightColor,
	darkColor,
	type = 'default',
	...rest
}: ThemedTextProps): JSX.Element {
	const colorScheme = useColorScheme() ?? 'light';
	const themeColor = useThemeColor(type === 'link' ? 'accent' : 'foreground');
	const color =
		colorScheme === 'dark' ? (darkColor ?? themeColor) : (lightColor ?? themeColor);

	return (
		<Text
			style={[
				{ color },
				type === 'default' ? styles.default : undefined,
				type === 'title' ? styles.title : undefined,
				type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
				type === 'subtitle' ? styles.subtitle : undefined,
				type === 'link' ? styles.link : undefined,
				style,
			]}
			{...rest}
		/>
	);
}

const styles: Record<string, TextStyle> = {
	default: {
		fontSize: 16,
		lineHeight: 24,
	},
	defaultSemiBold: {
		fontSize: 16,
		lineHeight: 24,
		fontWeight: '600',
	},
	title: {
		fontSize: 32,
		fontWeight: 'bold',
		lineHeight: 32,
	},
	subtitle: {
		fontSize: 20,
		fontWeight: 'bold',
	},
	link: {
		lineHeight: 30,
		fontSize: 16,
		fontWeight: '600',
	},
};
