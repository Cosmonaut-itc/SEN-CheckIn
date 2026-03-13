import * as React from 'react';

const MOBILE_BREAKPOINT = 1024;
const useIsomorphicLayoutEffect =
	typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

/**
 * Determines whether the current viewport should use mobile-responsive behavior.
 *
 * @returns True when the viewport width is at or below the mobile breakpoint
 */
export function useIsMobile() {
	const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

	useIsomorphicLayoutEffect(() => {
		const onChange = () => {
			setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
		};
		const mql =
			typeof window.matchMedia === 'function'
				? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
				: undefined;

		if (!mql) {
			onChange();
			return undefined;
		}

		if (typeof mql.addEventListener === 'function') {
			mql.addEventListener('change', onChange);
		} else {
			mql.addListener(onChange);
		}

		setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
		return () => {
			if (typeof mql.removeEventListener === 'function') {
				mql.removeEventListener('change', onChange);
				return;
			}
			mql.removeListener(onChange);
		};
	}, []);

	return !!isMobile;
}
