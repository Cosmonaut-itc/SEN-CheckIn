import {
	isServer,
	QueryClient,
	defaultShouldDehydrateQuery,
} from '@tanstack/react-query';

/**
 * Default stale time for queries (1 minute).
 * With SSR, we usually want to set some default staleTime
 * above 0 to avoid refetching immediately on the client.
 */
const DEFAULT_STALE_TIME = 60 * 1000;

/**
 * Creates a new QueryClient instance configured for SSR streaming.
 *
 * The client is configured to:
 * - Set a default staleTime to avoid immediate refetching on the client
 * - Include pending queries in dehydration for streaming support
 * - Not redact errors so Next.js can properly detect dynamic pages
 *
 * @returns A new QueryClient instance
 */
function makeQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: DEFAULT_STALE_TIME,
			},
			dehydrate: {
				// Include pending queries in dehydration for streaming support
				shouldDehydrateQuery: (query) =>
					defaultShouldDehydrateQuery(query) ||
					query.state.status === 'pending',
				shouldRedactErrors: () => {
					// We should not catch Next.js server errors
					// as that's how Next.js detects dynamic pages
					// so we cannot redact them.
					// Next.js also automatically redacts errors for us
					// with better digests.
					return false;
				},
			},
		},
	});
}

/**
 * Singleton QueryClient instance for the browser.
 * This ensures we don't re-create the client if React suspends during initial render.
 */
let browserQueryClient: QueryClient | undefined = undefined;

/**
 * Returns a QueryClient instance appropriate for the current environment.
 *
 * - Server: Always creates a new QueryClient to avoid sharing state between requests
 * - Browser: Returns a singleton QueryClient to maintain cache across renders
 *
 * This pattern is essential for proper SSR streaming support with React Query.
 * The browser singleton prevents re-creating the client if React suspends
 * during the initial render.
 *
 * @returns The QueryClient instance for the current environment
 *
 * @example
 * ```tsx
 * // In a Server Component
 * export default function Page() {
 *   const queryClient = getQueryClient();
 *   queryClient.prefetchQuery({ queryKey: ['posts'], queryFn: getPosts });
 *   return (
 *     <HydrationBoundary state={dehydrate(queryClient)}>
 *       <Posts />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 */
export function getQueryClient(): QueryClient {
	if (isServer) {
		// Server: always make a new query client
		return makeQueryClient();
	} else {
		// Browser: make a new query client if we don't already have one
		// This is very important, so we don't re-make a new client if React
		// suspends during the initial render. This may not be needed if we
		// have a suspense boundary BELOW the creation of the query client
		if (!browserQueryClient) {
			browserQueryClient = makeQueryClient();
		}
		return browserQueryClient;
	}
}

