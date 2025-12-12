import type { PropsWithChildren, JSX } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import * as ExpoDevice from 'expo-device';
import * as Crypto from 'expo-crypto';

import type { Device } from '@sen-checkin/types';
import { fetchDeviceDetail, sendDeviceHeartbeat, updateDeviceSettings } from './client-functions';
import { useAuthContext } from '@/providers/auth-provider';

type DeviceSettings = {
  deviceId: string;
  name: string;
  locationId: string | null;
  organizationId: string | null;
};

type DeviceContextValue = {
  settings: DeviceSettings | null;
  isHydrated: boolean;
  isUpdating: boolean;
  updateLocalSettings: (input: Partial<DeviceSettings>) => Promise<DeviceSettings | null>;
  refreshFromServer: (deviceId?: string) => Promise<DeviceSettings | null>;
  saveRemoteSettings: (input: Partial<Pick<Device, 'name' | 'locationId'>>) => Promise<DeviceSettings | null>;
  clearSettings: () => Promise<void>;
};

const STORAGE_KEY = 'sen-checkin_device_settings';
const DEVICE_CODE_KEY = 'sen-checkin_device_code';
const HEARTBEAT_INTERVAL_MS = 60_000;

const DeviceContext = createContext<DeviceContextValue | undefined>(undefined);

/**
 * Convert a byte array into a hexadecimal string.
 *
 * @param bytes - Byte array to convert
 * @returns Hexadecimal string representation
 */
const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

/**
 * Generate a deterministic fingerprint from hardware and installation metadata.
 *
 * @returns Combined fingerprint string or null when unavailable
 */
const buildDeviceFingerprint = async (): Promise<string | null> => {
  try {
    const installTime = await Application.getInstallationTimeAsync();
    const platformId =
      Platform.OS === 'android'
        ? Application.getAndroidId?.()
        : await Application.getIosIdForVendorAsync?.();

    const parts = [
      platformId ?? null,
      ExpoDevice.modelName ?? null,
      ExpoDevice.osName ?? null,
      ExpoDevice.osVersion ?? null,
      installTime ? installTime.getTime().toString() : null,
    ].filter(Boolean);

    if (parts.length === 0) {
      return null;
    }

    return parts.join('|');
  } catch (error) {
    console.warn('[device-context] Failed to build device fingerprint', error);
    return null;
  }
};

/**
 * Derive or retrieve the stable device code used for registration.
 * Persists the hashed code in SecureStore for reuse across restarts.
 *
 * @returns Stable device code string
 * @throws Error when hashing fails unexpectedly
 */
export const getStableDeviceCode = async (): Promise<string> => {
  const cached = await SecureStore.getItemAsync(DEVICE_CODE_KEY);
  if (cached) return cached;

  const fingerprint = await buildDeviceFingerprint();

  const entropy =
    fingerprint ??
    bytesToHex(await Crypto.getRandomBytesAsync(16));

  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    entropy,
  );

  const stableCode = `DEV-${digest.slice(0, 16).toUpperCase()}`;

  try {
    await SecureStore.setItemAsync(DEVICE_CODE_KEY, stableCode);
  } catch (error) {
    console.warn('[device-context] Failed to persist stable device code', error);
  }

  return stableCode;
};

/**
 * Read stored device settings from SecureStore.
 *
 * @returns Parsed device settings or null when not found/invalid
 */
async function readStoredSettings(): Promise<DeviceSettings | null> {
  try {
    const stored = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as DeviceSettings;
  } catch (error) {
    console.warn('Failed to read device settings', error);
    return null;
  }
}

/**
 * Persist device settings into SecureStore.
 *
 * @param settings - Settings to save or null to clear
 */
async function writeStoredSettings(settings: DeviceSettings | null) {
  try {
    if (settings) {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(settings));
    } else {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Failed to persist device settings', error);
  }
}

/**
 * Provider component that exposes device settings, persistence helpers, and heartbeat tracking.
 *
 * @param children - React nodes to render within the provider
 * @returns Provider element wrapping descendants
 */
export function DeviceProvider({ children }: PropsWithChildren): JSX.Element {
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const { session, isLoading: isAuthLoading } = useAuthContext();

  useEffect(() => {
    readStoredSettings().then((stored) => {
      if (stored) {
        setSettings(stored);
      }
      setIsHydrated(true);
    });
  }, []);

  /**
   * Merge and persist device settings locally.
   *
   * @param input - Partial device settings to merge with existing state
   * @returns Stored device settings or null when no device ID is available
   */
  const updateLocalSettings = useCallback(
    async (input: Partial<DeviceSettings>) => {
      if (!settings && !input.deviceId) {
        return null;
      }

      const base: DeviceSettings =
        settings ??
        ({
          deviceId: input.deviceId!,
          name: '',
          locationId: null,
          organizationId: null,
        } satisfies DeviceSettings);

      const next: DeviceSettings = { ...base, ...input };
      setSettings(next);
      await writeStoredSettings(next);
      return next;
    },
    [settings],
  );

  /**
   * Refresh device settings from the server and persist them locally.
   *
   * @param deviceId - Optional override for the device ID to fetch
   * @returns Latest device settings or null when unavailable
   */
  const refreshFromServer = useCallback(
    async (deviceId?: string) => {
      const id = deviceId ?? settings?.deviceId;
      if (!id) return null;

      setIsUpdating(true);
      try {
        const remote = await fetchDeviceDetail(id);
        if (!remote) return null;

        const next: DeviceSettings = {
          deviceId: remote.id,
          name: remote.name ?? '',
          locationId: remote.locationId ?? null,
          organizationId: remote.organizationId ?? null,
        };
        setSettings(next);
        await writeStoredSettings(next);
        return next;
      } finally {
        setIsUpdating(false);
      }
    },
    [settings?.deviceId],
  );

  /**
   * Persist remote updates for device metadata to the server and cache locally.
   *
   * @param input - Remote changes for name or location
   * @returns Updated local settings or null when no device is linked
   */
  const saveRemoteSettings = useCallback(
    async (input: Partial<Pick<Device, 'name' | 'locationId'>>) => {
      if (!settings?.deviceId) return null;

      setIsUpdating(true);
      try {
        const updated = await updateDeviceSettings(settings.deviceId, {
          name: input.name,
          locationId: input.locationId,
        });

        const next: DeviceSettings = {
          deviceId: updated.id,
          name: updated.name ?? '',
          locationId: updated.locationId ?? null,
          organizationId: updated.organizationId ?? null,
        };
        setSettings(next);
        await writeStoredSettings(next);
        return next;
      } finally {
        setIsUpdating(false);
      }
    },
    [settings?.deviceId],
  );

  useEffect(() => {
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    if (!settings?.deviceId || isAuthLoading || !session) {
      return undefined;
    }

    const sendHeartbeat = async () => {
      if (!settings?.deviceId) return;
      try {
        await sendDeviceHeartbeat(settings.deviceId);
      } catch (error) {
        console.warn('[device-context] Heartbeat failed', error);
      }
    };

    const stopHeartbeat = () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    };

    const startHeartbeat = () => {
      if (heartbeatInterval || !settings?.deviceId) return;
      void sendHeartbeat();
      heartbeatInterval = setInterval(() => {
        void sendHeartbeat();
      }, HEARTBEAT_INTERVAL_MS);
    };

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        startHeartbeat();
      } else {
        stopHeartbeat();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    if (AppState.currentState === 'active') {
      startHeartbeat();
    }

    return () => {
      subscription.remove();
      stopHeartbeat();
    };
  }, [isAuthLoading, session, settings?.deviceId]);

  /**
   * Clear persisted device settings from memory and storage.
   *
   * @returns Promise that resolves when storage is cleared
   */
  const clearSettings = useCallback(async () => {
    setSettings(null);
    await writeStoredSettings(null);
  }, []);

  const value = useMemo<DeviceContextValue>(
    () => ({
      settings,
      isHydrated,
      isUpdating,
      updateLocalSettings,
      refreshFromServer,
      saveRemoteSettings,
      clearSettings,
    }),
    [settings, isHydrated, isUpdating, updateLocalSettings, refreshFromServer, saveRemoteSettings, clearSettings],
  );

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

/**
 * Retrieve the device context, ensuring the provider is present.
 *
 * @returns Current device context value
 * @throws Error when accessed outside of DeviceProvider
 */
export function useDeviceContext(): DeviceContextValue {
  const ctx = useContext(DeviceContext);
  if (!ctx) {
    throw new Error('useDeviceContext must be used within DeviceProvider');
  }
  return ctx;
}
