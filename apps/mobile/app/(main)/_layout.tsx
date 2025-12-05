import type { JSX } from 'react';
import { Redirect, Stack } from 'expo-router';

import { useAuthContext } from '@/providers/auth-provider';

export default function MainLayout(): JSX.Element {
  const { session, isLoading } = useAuthContext();

  if (!isLoading && !session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="scanner" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
