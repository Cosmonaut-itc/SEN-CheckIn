import type { EdgeInsets } from 'react-native-safe-area-context';
import { Uniwind } from 'uniwind';

type UniwindWithInsets = typeof Uniwind & {
	updateInsets?: (insets: EdgeInsets) => void;
};

const uniwindWithInsets = Uniwind as UniwindWithInsets;

/**
 * No-op fallback when Uniwind does not expose updateInsets yet.
 *
 * @param _insets - Safe area insets provided by react-native-safe-area-context.
 * @returns {void} No return value.
 */
const noopUpdateInsets = (_insets: EdgeInsets): void => {
	// Intentionally empty: Uniwind safe-area updates are optional for now.
};

if (typeof uniwindWithInsets.updateInsets !== 'function') {
	uniwindWithInsets.updateInsets = noopUpdateInsets;
}
