/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';
const primaryColor = '#6366f1';
const successColor = '#22c55e';
const warningColor = '#f59e0b';
const errorColor = '#ef4444';

export const Colors = {
	light: {
		text: '#11181C',
		foreground: '#11181C',
		foreground500: '#687076',
		foreground400: '#9BA1A6',
		background: '#fff',
		content1: '#f4f4f5',
		content2: '#e4e4e7',
		surface: '#ffffff',
		border: '#e4e4e7',
		default200: '#e4e4e7',
		overlay: 'rgba(255, 255, 255, 0.82)',
		overlayMuted: 'rgba(17, 24, 28, 0.08)',
		tint: tintColorLight,
		primary: primaryColor,
		icon: '#687076',
		tabIconDefault: '#687076',
		tabIconSelected: tintColorLight,
		success: successColor,
		warning: warningColor,
		error: errorColor,
	},
	dark: {
		text: '#ECEDEE',
		foreground: '#ECEDEE',
		foreground500: '#9BA1A6',
		foreground400: '#71767A',
		background: '#151718',
		content1: '#27272a',
		content2: '#3f3f46',
		surface: '#151718',
		border: '#3f3f46',
		default200: '#3f3f46',
		overlay: 'rgba(0, 0, 0, 0.78)',
		overlayMuted: 'rgba(255, 255, 255, 0.1)',
		tint: tintColorDark,
		primary: primaryColor,
		icon: '#9BA1A6',
		tabIconDefault: '#9BA1A6',
		tabIconSelected: tintColorDark,
		success: successColor,
		warning: warningColor,
		error: errorColor,
	},
} as const;

export type ThemeColors = (typeof Colors)[ThemeName];
export type ThemeName = keyof typeof Colors;

export const Fonts = Platform.select({
	ios: {
		/** iOS `UIFontDescriptorSystemDesignDefault` */
		sans: 'system-ui',
		/** iOS `UIFontDescriptorSystemDesignSerif` */
		serif: 'ui-serif',
		/** iOS `UIFontDescriptorSystemDesignRounded` */
		rounded: 'ui-rounded',
		/** iOS `UIFontDescriptorSystemDesignMonospaced` */
		mono: 'ui-monospace',
	},
	default: {
		sans: 'normal',
		serif: 'serif',
		rounded: 'normal',
		mono: 'monospace',
	},
	web: {
		sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
		serif: "Georgia, 'Times New Roman', serif",
		rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
		mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
	},
});
