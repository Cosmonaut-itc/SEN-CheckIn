import type { PropsWithChildren, JSX } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

import type { Device } from '@sen-checkin/types';
import { fetchDeviceDetail, updateDeviceSettings } from './client-functions';

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

const DeviceContext = createContext<DeviceContextValue | undefined>(undefined);

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

export function DeviceProvider({ children }: PropsWithChildren): JSX.Element {
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    readStoredSettings().then((stored) => {
      if (stored) {
        setSettings(stored);
      }
      setIsHydrated(true);
    });
  }, []);

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

export function useDeviceContext(): DeviceContextValue {
  const ctx = useContext(DeviceContext);
  if (!ctx) {
    throw new Error('useDeviceContext must be used within DeviceProvider');
  }
  return ctx;
}
