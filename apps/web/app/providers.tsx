'use client';

import React, { type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { getQueryClient } from '@/lib/get-query-client';

/**
 * Props for the Providers component.
 */
interface ProvidersProps {
	/** Child components to render within the providers */
	children: ReactNode;
}

/**
 * Root providers component for the application.
 *
 * This component sets up the QueryClientProvider for TanStack Query,
 * enabling data fetching, caching, and synchronization throughout the app.
 * It also mounts the ReactQueryDevtools in development mode for debugging.
 *
 * The QueryClient is obtained via getQueryClient() which handles:
 * - Server: Creates a new client per request to avoid state leakage
 * - Browser: Returns a singleton to maintain cache across renders
 *
 * Note: We avoid useState when initializing the query client because
 * React will throw away the client on the initial render if it suspends
 * and there is no boundary.
 *
 * @param props - Component props containing children
 * @returns The providers wrapper JSX element
 *
 * @example
 * ```tsx
 * // In app/layout.tsx
 * export default function RootLayout({ children }: { children: ReactNode }) {
 *   return (
 *     <html lang="en">
 *       <body>
 *         <Providers>{children}</Providers>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function Providers({ children }: ProvidersProps): React.ReactElement {
	const queryClient = getQueryClient();

	return (
		<QueryClientProvider client={queryClient}>
			{children}
			{process.env.NODE_ENV === 'development' && (
				<ReactQueryDevtools initialIsOpen={false} />
			)}
		</QueryClientProvider>
	);
}

