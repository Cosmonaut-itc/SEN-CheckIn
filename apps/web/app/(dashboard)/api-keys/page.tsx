import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/get-query-client';
import { prefetchApiKeys } from '@/lib/server-functions';
import { ApiKeysPageClient } from './api-keys-client';
import React from 'react';

/**
 * Force dynamic rendering to ensure fresh data on each request.
 * This is required for pages that need authentication cookies.
 */
export const dynamic = 'force-dynamic';

/**
 * API Keys page server component.
 *
 * This server component prefetches API keys data without awaiting,
 * enabling Next.js to stream the response as data becomes available.
 * The prefetched data is dehydrated and passed to the client via HydrationBoundary.
 *
 * @returns The API keys page with hydrated query state
 */
export default function ApiKeysPage(): React.ReactElement {
	const queryClient = getQueryClient();

	// Prefetch without await for streaming support
	prefetchApiKeys(queryClient);

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<ApiKeysPageClient />
		</HydrationBoundary>
	);
}
