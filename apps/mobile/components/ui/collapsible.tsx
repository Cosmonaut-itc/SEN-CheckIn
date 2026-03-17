import type { JSX, PropsWithChildren } from 'react';
import { useState } from 'react';
import { type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PlatformPressable } from '@/components/ui/platform-pressable';
import { useThemeColor } from '@/hooks/use-theme-color';

/**
 * Collapsible section that toggles visibility of its children.
 *
 * @param props - Title label and collapsible content
 * @returns {JSX.Element} Collapsible view with toggle control
 */
export function Collapsible({
	children,
	title,
}: PropsWithChildren & { title: string }): JSX.Element {
	const [isOpen, setIsOpen] = useState(false);
	const iconColor = useThemeColor('muted');

	return (
		<ThemedView>
			<PlatformPressable
				style={styles.heading}
				onPress={() => setIsOpen((value) => !value)}
				pressedOpacity={0.8}
				hitSlop={8}
			>
				<IconSymbol
					name="chevron.right"
					size={18}
					weight="medium"
					color={iconColor}
					style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}
				/>

				<ThemedText type="defaultSemiBold">{title}</ThemedText>
			</PlatformPressable>
			{isOpen && <ThemedView style={styles.content}>{children}</ThemedView>}
		</ThemedView>
	);
}

const styles: Record<string, ViewStyle> = {
	heading: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		minHeight: 48,
		minWidth: 48,
	},
	content: {
		paddingTop: 6,
		paddingLeft: 24,
	},
};
