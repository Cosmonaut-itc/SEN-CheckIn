import type { JSX } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView, type SymbolViewProps, type SymbolWeight } from 'expo-symbols';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { resolveFallbackSymbol } from './icon-symbol-fallbacks';

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
	if (process.env.EXPO_OS !== 'ios') {
		return (
			<View style={style}>
				<MaterialIcons name={resolveFallbackSymbol(name)} size={size} color={color} />
			</View>
		);
	}
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
