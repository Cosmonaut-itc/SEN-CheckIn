import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import type { JSX } from 'react';
import type { GestureResponderEvent } from 'react-native';

/**
 * Tab bar button that triggers light haptic feedback on iOS.
 *
 * @param props - React Navigation tab bar button props
 * @returns {JSX.Element} PlatformPressable with optional haptics
 */
export function HapticTab(props: BottomTabBarButtonProps): JSX.Element {
	return (
		<PlatformPressable
			{...props}
			onPressIn={(ev: GestureResponderEvent) => {
				if (process.env.EXPO_OS === 'ios') {
					// Add a soft haptic feedback when pressing down on the tabs.
					Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				}
				props.onPressIn?.(ev);
			}}
		/>
	);
}
