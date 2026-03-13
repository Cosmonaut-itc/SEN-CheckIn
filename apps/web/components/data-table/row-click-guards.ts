'use client';

const INTERACTIVE_ROW_ELEMENT_SELECTOR =
	'button, a, input, [role="checkbox"], [data-radix-collection-item]';

/**
 * Determines whether a row click should be ignored because it originated from
 * an interactive descendant element.
 *
 * @param target - Event target from the click interaction
 * @returns True when the click should not trigger the row action
 */
export function isInteractiveRowClickTarget(target: EventTarget | null): boolean {
	if (!(target instanceof Element)) {
		return false;
	}

	return Boolean(target.closest(INTERACTIVE_ROW_ELEMENT_SELECTOR));
}

/**
 * Detects whether the user currently has text selected in the document.
 *
 * @returns True when there is a non-empty text selection
 */
export function hasSelectedText(): boolean {
	if (typeof window === 'undefined' || typeof window.getSelection !== 'function') {
		return false;
	}

	return Boolean(window.getSelection()?.toString().trim());
}
