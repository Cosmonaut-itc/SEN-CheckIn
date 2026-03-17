const PLATFORM = process.env.EXPO_OS ?? 'unknown';

export const Fonts =
	PLATFORM === 'ios'
		? {
				sans: 'system-ui',
				serif: 'ui-serif',
				rounded: 'ui-rounded',
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
