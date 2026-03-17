import type { JSX, PropsWithChildren } from 'react';
import {
	Platform,
	Pressable,
	type PressableProps,
	type PressableStateCallbackType,
	type StyleProp,
	type ViewStyle,
} from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

type PlatformPressableProps = PropsWithChildren<
	PressableProps & {
		pressedOpacity?: number;
		style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
	}
>;

/**
 * Apply platform-native press feedback for custom interactive surfaces.
 *
 * Android uses ripple feedback while iOS fades opacity on press.
 *
 * @param props - Pressable props plus optional pressed opacity override
 * @returns {JSX.Element} Pressable with platform-specific feedback behavior
 */
export function PlatformPressable({
	children,
	pressedOpacity = 0.82,
	style,
	...props
}: PlatformPressableProps): JSX.Element {
	const rippleColor = useThemeColor('default-hover');

	return (
		<Pressable
			{...props}
			android_ripple={Platform.OS === 'android' ? { color: rippleColor } : undefined}
			style={(state) => {
				const resolvedStyle = typeof style === 'function' ? style(state) : style;
				const opacityStyle =
					Platform.OS === 'ios' && state.pressed && !props.disabled
						? { opacity: pressedOpacity }
						: null;

				return [resolvedStyle, opacityStyle];
			}}
		>
			{children}
		</Pressable>
	);
}
