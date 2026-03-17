/**
 * Canonical screen options for the root Expo Router stack.
 * Keeps back gestures and slide transition behavior consistent across the app.
 */
export const ROOT_STACK_SCREEN_OPTIONS = {
	headerShown: false,
	animation: 'slide_from_right',
} as const;
