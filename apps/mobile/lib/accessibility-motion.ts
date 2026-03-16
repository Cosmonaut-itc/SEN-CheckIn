/**
 * Resolve an animation duration while respecting reduce-motion accessibility.
 *
 * @param duration - Default duration in milliseconds
 * @param shouldReduceMotion - Whether the user prefers reduced motion
 * @returns Duration to use for the animation
 */
export function getAnimationDuration(
	duration: number,
	shouldReduceMotion: boolean,
): number {
	return shouldReduceMotion ? 0 : duration;
}
