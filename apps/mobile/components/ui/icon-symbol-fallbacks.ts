import type { ComponentProps } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

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
	'person.crop.circle': 'account-circle',
	'square.and.arrow.up': 'share',
	sparkles: 'auto-awesome',
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
export function resolveFallbackSymbol(
	symbolName: string | undefined,
): ComponentProps<typeof MaterialIcons>['name'] {
	if (typeof symbolName !== 'string') return 'radio-button-unchecked';
	return FALLBACK_SYMBOLS[symbolName] ?? 'radio-button-unchecked';
}
