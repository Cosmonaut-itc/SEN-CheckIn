import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import Constants from 'expo-constants';
import * as ExpoDevice from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import type { QueryClient } from '@tanstack/react-query';
import { useSyncQueriesExternal } from 'react-query-external-sync';

/** Port used by rn-better-dev-tools macOS app */
const DEVTOOLS_PORT = 42831;

/** SecureStore key for persistent device identifier */
const DEVICE_ID_STORAGE_KEY = 'sen-checkin-devtools-device-id';

/** Props for QueryDevtoolsBridge component */
type QueryDevtoolsBridgeProps = {
	/** Application-wide QueryClient instance to sync with DevTools */
	queryClient: QueryClient;
};

/**
 * Resolve the Metro/Expo dev server host so the device/emulator can reach the devtools socket.
 * Extracts the hostname from the Expo debugger configuration.
 *
 * @returns Hostname portion of the debugger URL or null when it cannot be derived
 */
function resolveDevServerHost(): string | null {
	const debuggerHost = Constants.expoGoConfig?.debuggerHost ?? Constants.expoConfig?.hostUri;
	if (!debuggerHost) {
		return null;
	}
	const host = debuggerHost.split(':')[0];
	return host ?? null;
}

/**
 * Generate a unique, persistent device identifier.
 * Combines platform with timestamp for uniqueness.
 *
 * @returns Unique device identifier string
 */
function generateDeviceId(): string {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 8);
	const platform = process.env.EXPO_OS ?? 'unknown';
	return `${platform}-${timestamp}-${random}`;
}

/**
 * Hook to manage persistent device ID for DevTools.
 * Stores the ID in SecureStore to persist across app reinstalls.
 *
 * @returns Current device ID or null while loading
 */
function usePersistedDeviceId(): string | null {
	const [deviceId, setDeviceId] = useState<string | null>(null);

	useEffect(() => {
		/**
		 * Load existing device ID from storage or generate a new one.
		 */
		async function loadOrCreateDeviceId(): Promise<void> {
			try {
				// Try to load existing ID
				const storedId = await SecureStore.getItemAsync(DEVICE_ID_STORAGE_KEY);

				if (storedId) {
					setDeviceId(storedId);
					return;
				}

				// First launch - generate and store a persistent ID
				const newId = generateDeviceId();
				await SecureStore.setItemAsync(DEVICE_ID_STORAGE_KEY, newId);
				setDeviceId(newId);
			} catch {
				// Fallback if SecureStore fails (e.g., web platform)
				const fallbackId =
					ExpoDevice.osInternalBuildId ?? ExpoDevice.osBuildId ?? generateDeviceId();
				setDeviceId(fallbackId);
			}
		}

		loadOrCreateDeviceId();
	}, []);

	return deviceId;
}

/**
 * Bridges the shared TanStack QueryClient to rn-better-dev-tools during development.
 * This component syncs query state in real-time to the macOS DevTools app via WebSocket.
 *
 * Features:
 * - Automatic host detection for simulators/devices
 * - Persistent device ID across app restarts
 * - Real-time query state synchronization
 * - Automatic production safety (disabled in production builds)
 *
 * @see https://github.com/LovesWorking/rn-better-dev-tools
 * @param props - Component props containing the QueryClient instance
 * @returns Null-rendering component that maintains the DevTools connection
 */
export function QueryDevtoolsBridge({ queryClient }: QueryDevtoolsBridgeProps): JSX.Element | null {
	// Persistent device ID across app restarts
	const deviceId = usePersistedDeviceId();

	// Build socket URL from dev server host
	const socketURL = useMemo(() => {
		const host = resolveDevServerHost() ?? 'localhost';
		return `http://${host}:${DEVTOOLS_PORT}`;
	}, []);
	const platform = useMemo((): 'ios' | 'android' | 'web' => {
		const envPlatform = process.env.EXPO_OS;
		if (envPlatform === 'ios' || envPlatform === 'android' || envPlatform === 'web') {
			return envPlatform;
		}
		return 'web';
	}, []);

	// Build extra device info for DevTools display (must be Record<string, string>)
	const extraDeviceInfo = useMemo(
		(): Record<string, string> => ({
			brand: ExpoDevice.brand ?? 'Unknown',
			modelName: ExpoDevice.modelName ?? 'Unknown',
			osName: ExpoDevice.osName ?? process.env.EXPO_OS ?? 'unknown',
			osVersion: ExpoDevice.osVersion ?? 'Unknown',
			appVersion: Constants.expoConfig?.version ?? '1.0.0',
			deviceType: ExpoDevice.isDevice ? 'Physical Device' : 'Simulator/Emulator',
		}),
		[],
	);

	// Connect to DevTools when device ID is ready
	useSyncQueriesExternal({
		queryClient,
		socketURL,
		platform,
		isDevice: ExpoDevice.isDevice,
		deviceId: deviceId ?? `${process.env.EXPO_OS ?? 'unknown'}-initializing`,
		deviceName:
			ExpoDevice.deviceName ??
			`${process.env.EXPO_OS ?? 'unknown'} ${ExpoDevice.isDevice ? 'Device' : 'Simulator'}`,
		extraDeviceInfo,
		enableLogs: false, // Set to true to debug connection issues
	});

	// Component renders nothing - just maintains the WebSocket connection
	return null;
}

/**
 * Wrapper that only renders DevTools bridge in development mode.
 * Use this in your QueryProvider for automatic production safety.
 *
 * @param props - Component props containing the QueryClient instance
 * @returns DevTools bridge in DEV, null in production
 */
export function QueryDevtoolsBridgeSafe({
	queryClient,
}: QueryDevtoolsBridgeProps): JSX.Element | null {
	if (!__DEV__) {
		return null;
	}
	return <QueryDevtoolsBridge queryClient={queryClient} />;
}
