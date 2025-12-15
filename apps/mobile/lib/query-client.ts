import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

const defaultQueryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 60 * 1000,
			retry: 1,
		},
	},
});

let managersConfigured = false;

function handleAppStateChange(status: AppStateStatus) {
	focusManager.setFocused(status === 'active');
}

/**
 * Configure focus/online managers for React Native.
 * Call once during app bootstrap (see QueryProvider).
 */
export function configureQueryManagers() {
	if (managersConfigured) {
		return;
	}

	managersConfigured = true;

	onlineManager.setEventListener((setOnline) => {
		const unsubscribe = NetInfo.addEventListener((state) => {
			setOnline(Boolean(state.isConnected));
		});

		return () => unsubscribe();
	});

	AppState.addEventListener('change', handleAppStateChange);
}

export const queryClient = defaultQueryClient;
