import 'react-native';

declare module 'react-native' {
	interface ViewProps {
		className?: string;
		/** Web-only: data attributes for CSS theming (e.g., data-theme) */
		dataSet?: Record<string, string | undefined>;
	}

	interface TextProps {
		className?: string;
	}

	interface ScrollViewProps {
		className?: string;
	}

	interface TouchableOpacityProps {
		className?: string;
	}
}
