import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Spinner } from 'heroui-native';

import { useAuthContext } from '@/providers/auth-provider';
import { useDeviceContext } from '@/lib/device-context';

function generateCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let value = '';
  for (let i = 0; i < 6; i += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}

export default function LoginScreen(): JSX.Element {
  const router = useRouter();
  const { session, isLoading } = useAuthContext();
  const { updateLocalSettings } = useDeviceContext();

  const [deviceCode, setDeviceCode] = useState<string>(generateCode);
  const [status, setStatus] = useState('Waiting for authorization...');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const authUrl = useMemo(
    () => `https://sen-checkin.app/device/${deviceCode}`,
    [deviceCode],
  );

  useEffect(() => {
    if (!isLoading && session) {
      router.replace('/(main)/scanner');
    }
  }, [isLoading, session, router]);

  useEffect(() => {
    const interval = setInterval(() => {
      // TODO: poll /api/auth/device-code/:code/status when backend is ready
    }, 4000);

    return () => clearInterval(interval);
  }, [deviceCode]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setStatus('Waiting for authorization...');
    setDeviceCode(generateCode());
    setTimeout(() => setIsRefreshing(false), 400);
  };

  const handleDevBypass = async () => {
    await updateLocalSettings({ deviceId: 'dev-device-id' });
    router.replace('/(main)/scanner');
  };

  return (
    <View className="flex-1 bg-background px-5 pt-16">
      <Text className="text-3xl font-bold text-foreground mb-3">Device Login</Text>
      <Text className="text-base text-foreground-500 mb-6">
        Show this code to an administrator to link this kiosk. This flow will poll the API once the
        device-code endpoints land.
      </Text>

      <Card className="p-6 gap-4">
        <Text className="text-sm font-medium text-foreground-500 uppercase tracking-wide">
          Device Code
        </Text>
        <Text className="text-5xl font-extrabold tracking-widest text-center">{deviceCode}</Text>

        <View className="border border-dashed border-default-200 rounded-2xl p-6 items-center justify-center">
          <Text className="text-sm text-foreground-500 mb-2">QR code placeholder</Text>
          <Text className="text-xs text-foreground-400">{authUrl}</Text>
        </View>

        <View className="flex-row items-center gap-2">
          <Spinner size="sm" />
          <Text className="text-foreground">{status}</Text>
        </View>

        <View className="flex-row gap-3">
          <Button onPress={handleRefresh} isDisabled={isRefreshing} className="flex-1">
            <Button.Label>{isRefreshing ? 'Refreshing…' : 'Refresh code'}</Button.Label>
          </Button>
          <Button variant="secondary" className="flex-1" onPress={handleDevBypass}>
            <Button.Label>Skip (dev)</Button.Label>
          </Button>
        </View>

        <View className="bg-warning-50 border border-warning-200 rounded-xl p-3">
          <Text className="text-warning-700 font-semibold mb-1">TODO</Text>
          <Text className="text-warning-700">
            Hook up to POST /api/auth/device-code and status polling once the backend endpoints are
            available.
          </Text>
        </View>
      </Card>
    </View>
  );
}
