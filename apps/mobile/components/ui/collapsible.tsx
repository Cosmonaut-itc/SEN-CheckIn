import type { JSX, PropsWithChildren } from 'react';
import { useState } from 'react';
import { TouchableOpacity, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

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
	const theme = useColorScheme() ?? 'light';

	return (
		<ThemedView>
			<TouchableOpacity
				style={styles.heading}
				onPress={() => setIsOpen((value) => !value)}
				activeOpacity={0.8}
			>
				<IconSymbol
					name="chevron.right"
					size={18}
					weight="medium"
					color={theme === 'light' ? Colors.light.icon : Colors.dark.icon}
					style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}
				/>

				<ThemedText type="defaultSemiBold">{title}</ThemedText>
			</TouchableOpacity>
			{isOpen && <ThemedView style={styles.content}>{children}</ThemedView>}
		</ThemedView>
	);
}

const styles: Record<string, ViewStyle> = {
	heading: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
	},
	content: {
		paddingTop: 6,
		paddingLeft: 24,
	},
};
