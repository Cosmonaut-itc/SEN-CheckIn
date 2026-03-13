import * as React from 'react';

const MOBILE_BREAKPOINT = 1024;

/**
 * Determines whether the current viewport should use mobile-responsive behavior.
 *
 * @returns True when the viewport width is at or below the mobile breakpoint
 */
export function useIsMobile() {
	const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

	React.useEffect(() => {
		const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
		const onChange = () => {
			setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
		};
		mql.addEventListener('change', onChange);
		setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
		return () => mql.removeEventListener('change', onChange);
	}, []);

	return !!isMobile;
}
