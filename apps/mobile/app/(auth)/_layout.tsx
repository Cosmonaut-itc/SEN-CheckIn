import type { JSX } from 'react';
import { Redirect, Stack } from 'expo-router';

import { useAuthContext } from '@/providers/auth-provider';

export default function AuthLayout(): JSX.Element {
  const { session, isLoading } = useAuthContext();

  if (!isLoading && session) {
    return <Redirect href="/(main)/scanner" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
