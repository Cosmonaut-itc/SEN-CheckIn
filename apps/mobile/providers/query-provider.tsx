import type { PropsWithChildren, JSX } from 'react';
import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

import { configureQueryManagers, queryClient } from '@/lib/query-client';
import { QueryDevtoolsBridgeSafe } from './query-devtools';

/**
 * Provides the shared QueryClient instance and configures native lifecycle managers.
 * Includes rn-better-dev-tools integration for development debugging.
 *
 * @see https://github.com/LovesWorking/rn-better-dev-tools
 * @param children - React nodes that should have access to TanStack Query
 * @returns Provider tree with optional devtools bridge in development
 */
export function QueryProvider({ children }: PropsWithChildren): JSX.Element {
	useEffect(() => {
		configureQueryManagers();
	}, []);

	return (
		<QueryClientProvider client={queryClient}>
			<QueryDevtoolsBridgeSafe queryClient={queryClient} />
			{children}
		</QueryClientProvider>
	);
}
