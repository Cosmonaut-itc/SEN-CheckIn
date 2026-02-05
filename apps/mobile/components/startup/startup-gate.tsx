import type { JSX } from 'react';
import { useEffect } from 'react';

import { useDeviceContext } from '@/lib/device-context';
import { useAuthContext } from '@/providers/auth-provider';

import { StartupIntroOverlay } from './startup-intro-overlay';

type StartupGateProps = {
	isVisible: boolean;
	isDarkMode: boolean;
	onMounted: () => void;
	onFinished: () => void;
};

/**
 * Startup gate that computes readiness and drives the intro overlay lifecycle.
 *
 * @param props - Visibility, theme, and lifecycle callbacks
 * @returns Startup intro overlay element
 */
export function StartupGate({
	isVisible,
	isDarkMode,
	onMounted,
	onFinished,
}: StartupGateProps): JSX.Element {
	const { isLoading: isAuthLoading } = useAuthContext();
	const { isHydrated: isDeviceHydrated } = useDeviceContext();
	const isAppReady = !isAuthLoading && isDeviceHydrated;

	useEffect(() => {
		if (!isVisible) {
			return;
		}
		onMounted();
	}, [isVisible, onMounted]);

	return (
		<StartupIntroOverlay
			isVisible={isVisible}
			isAppReady={isAppReady}
			isDarkMode={isDarkMode}
			onFinished={onFinished}
		/>
	);
}
