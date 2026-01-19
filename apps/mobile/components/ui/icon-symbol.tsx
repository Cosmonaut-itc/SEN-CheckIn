import type { JSX } from 'react';
import { SymbolView, type SymbolViewProps, type SymbolWeight } from 'expo-symbols';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

const FALLBACK_SYMBOLS: Record<string, string> = {
	'arrow.left.arrow.right': '↔︎',
	'checkmark.circle': '✅',
	'camera': '📷',
	'chevron.right': '›',
	'doc.on.doc': '📄',
	'exclamationmark.circle': '⚠️',
	'gearshape': '⚙️',
	'link': '🔗',
	'list.dash': '≡',
	'nosign': '⛔️',
	'square.and.arrow.up': '↗︎',
	'trash': '🗑️',
	'viewfinder': '📷',
	'xmark.circle': '❌',
};

/**
 * Resolve a fallback glyph for platforms that do not support native SF Symbols.
 *
 * @param symbolName - SF Symbols name requested by the caller
 * @returns Fallback glyph string
 */
function resolveFallbackSymbol(symbolName: SymbolViewProps['name']): string {
	if (typeof symbolName !== 'string') return '•';
	return FALLBACK_SYMBOLS[symbolName] ?? '•';
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
			<View
				style={[
					{
						width: size,
						height: size,
						alignItems: 'center',
						justifyContent: 'center',
					},
					style,
				]}
			>
				<Text
					style={{
						fontSize: size,
						lineHeight: size,
						color,
						textAlign: 'center',
					}}
					allowFontScaling={false}
				>
					{resolveFallbackSymbol(name)}
				</Text>
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
