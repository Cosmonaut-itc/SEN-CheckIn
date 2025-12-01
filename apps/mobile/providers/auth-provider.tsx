import type { JSX, PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { primeAuthStorage, useSession } from '@/lib/auth-client';

type AuthContextValue = {
  session: ReturnType<typeof useSession>['data'];
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren): JSX.Element {
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    primeAuthStorage().finally(() => setStorageReady(true));
  }, []);

  const session = useSession();

  const value = useMemo<AuthContextValue>(
    () => ({
      session: session.data,
      isLoading: !storageReady || session.isPending,
    }),
    [session.data, session.isPending, storageReady],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return ctx;
}
