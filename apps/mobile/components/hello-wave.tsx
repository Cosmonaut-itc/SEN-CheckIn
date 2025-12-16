import Animated from 'react-native-reanimated';

/**
 * Animated wave emoji component for greeting displays.
 *
 * @returns JSX element containing an animated waving hand emoji
 */
export function HelloWave(): JSX.Element {
	return (
		<Animated.Text
			style={{
				fontSize: 28,
				lineHeight: 32,
				marginTop: -6,
				animationName: {
					'50%': { transform: [{ rotate: '25deg' }] },
				},
				animationIterationCount: 4,
				animationDuration: '300ms',
			}}
		>
			👋
		</Animated.Text>
	);
}
