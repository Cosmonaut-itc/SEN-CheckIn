import type { JSX } from 'react';
import { SymbolView, type SymbolViewProps, type SymbolWeight } from 'expo-symbols';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Render a platform symbol using expo-symbols.
 *
 * @param props - Symbol configuration including name, size, color, weight, and style overrides
 * @returns {JSX.Element} SymbolView element for the requested symbol
 */
export function IconSymbol({
	name,
	size = 24,
	color,
	style,
	weight = 'regular',
}: {
	name: SymbolViewProps['name'];
	size?: number;
	color: string;
	style?: StyleProp<ViewStyle>;
	weight?: SymbolWeight;
}): JSX.Element {
	return (
		<SymbolView
			weight={weight}
			tintColor={color}
			resizeMode="scaleAspectFit"
			name={name}
			style={[
				{
					width: size,
					height: size,
				},
				style,
			]}
		/>
	);
}
