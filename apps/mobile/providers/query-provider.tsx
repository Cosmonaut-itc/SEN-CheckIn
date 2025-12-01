import type { PropsWithChildren, JSX } from 'react';
import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

import { configureQueryManagers, queryClient } from '@/lib/query-client';

export function QueryProvider({ children }: PropsWithChildren): JSX.Element {
  useEffect(() => {
    configureQueryManagers();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
