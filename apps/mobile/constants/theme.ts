/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#2563eb';
const tintColorDark = '#60a5fa';

export const Colors = {
	light: {
		text: '#11181C',
		foreground: '#11181C',
		foreground500: '#687076',
		foreground400: '#9BA1A6',
		background: '#f7f7f8',
		content1: '#f4f4f5',
		content2: '#e4e4e7',
		surface: '#ffffff',
		border: '#e4e4e7',
		default200: '#e4e4e7',
		overlay: '#ffffff',
		overlayMuted: 'rgba(17, 24, 28, 0.08)',
		tint: tintColorLight,
		primary: '#2563eb',
		icon: '#687076',
		tabIconDefault: '#687076',
		tabIconSelected: tintColorLight,
		success: '#16a34a',
		warning: '#f59e0b',
		error: '#dc2626',
	},
	dark: {
		text: '#ECEDEE',
		foreground: '#ECEDEE',
		foreground500: '#9BA1A6',
		foreground400: '#71767A',
		background: '#0f1115',
		content1: '#27272a',
		content2: '#3f3f46',
		surface: '#1c1f23',
		border: '#3f3f46',
		default200: '#3f3f46',
		overlay: '#24292e',
		overlayMuted: 'rgba(236, 237, 238, 0.1)',
		tint: tintColorDark,
		primary: '#60a5fa',
		icon: '#9BA1A6',
		tabIconDefault: '#9BA1A6',
		tabIconSelected: tintColorDark,
		success: '#22c55e',
		warning: '#fbbf24',
		error: '#f87171',
	},
} as const;

export type ThemeColors = (typeof Colors)[ThemeName];
export type ThemeName = keyof typeof Colors;

const PLATFORM = process.env.EXPO_OS ?? 'unknown';

export const Fonts =
	PLATFORM === 'ios'
		? {
				/** iOS `UIFontDescriptorSystemDesignDefault` */
				sans: 'system-ui',
				/** iOS `UIFontDescriptorSystemDesignSerif` */
				serif: 'ui-serif',
				/** iOS `UIFontDescriptorSystemDesignRounded` */
				rounded: 'ui-rounded',
				/** iOS `UIFontDescriptorSystemDesignMonospaced` */
				mono: 'ui-monospace',
			}
		: PLATFORM === 'web'
			? {
					sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
					serif: "Georgia, 'Times New Roman', serif",
					rounded:
						"'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
					mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
				}
			: {
					sans: 'normal',
					serif: 'serif',
					rounded: 'normal',
					mono: 'monospace',
				};
