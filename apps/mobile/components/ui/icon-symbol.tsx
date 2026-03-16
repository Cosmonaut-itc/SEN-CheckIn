import type { ComponentProps, JSX } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView, type SymbolViewProps, type SymbolWeight } from 'expo-symbols';
import { View, type StyleProp, type ViewStyle } from 'react-native';

const FALLBACK_SYMBOLS: Record<string, ComponentProps<typeof MaterialIcons>['name']> = {
	'arrow.left.arrow.right': 'swap-horiz',
	'building.2': 'business',
	'checkmark.circle': 'check-circle',
	'checkmark.circle.fill': 'check-circle',
	'checkmark.seal.fill': 'check-circle',
	camera: 'photo-camera',
	'chevron.left': 'chevron-left',
	'chevron.right': 'chevron-right',
	clock: 'schedule',
	'doc.on.doc': 'content-copy',
	'exclamationmark.circle': 'warning',
	'exclamationmark.triangle.fill': 'warning',
	gearshape: 'settings',
	iphone: 'smartphone',
	'lightbulb.fill': 'lightbulb-outline',
	link: 'link',
	'list.dash': 'list',
	magnifyingglass: 'search',
	nosign: 'block',
	'person.crop.circle.badge.plus': 'person-add-alt-1',
	'square.and.arrow.up': 'share',
	trash: 'delete-outline',
	viewfinder: 'center-focus-strong',
	'wifi.slash': 'wifi-off',
	'xmark.circle': 'cancel',
	'xmark.circle.fill': 'cancel',
};

/**
 * Resolve a fallback glyph for platforms that do not support native SF Symbols.
 *
 * @param symbolName - SF Symbols name requested by the caller
 * @returns Fallback glyph string
 */
function resolveFallbackSymbol(
	symbolName: SymbolViewProps['name'],
): ComponentProps<typeof MaterialIcons>['name'] {
	if (typeof symbolName !== 'string') return 'radio-button-unchecked';
	return FALLBACK_SYMBOLS[symbolName] ?? 'radio-button-unchecked';
}

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
