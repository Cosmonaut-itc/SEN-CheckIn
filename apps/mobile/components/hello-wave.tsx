import type { ReactElement } from 'react';
import Animated from 'react-native-reanimated';

/**
 * Animated wave emoji component for greeting displays.
 *
 * @returns JSX element containing an animated waving hand emoji
 */
export function HelloWave(): ReactElement {
	return (
		<Animated.Text
			style={{
				fontSize: 28,
				lineHeight: 32,
				transform: [{ translateY: -6 }],
				animationName: {
					'0%': { transform: [{ translateY: -6 }, { rotate: '0deg' }] },
					'50%': { transform: [{ translateY: -6 }, { rotate: '25deg' }] },
					'100%': { transform: [{ translateY: -6 }, { rotate: '0deg' }] },
				},
				animationIterationCount: 4,
				animationDuration: '300ms',
			}}
		>
			👋
		</Animated.Text>
	);
}
