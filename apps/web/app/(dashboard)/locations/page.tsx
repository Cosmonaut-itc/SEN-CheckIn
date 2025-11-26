import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/get-query-client';
import { prefetchLocationsList } from '@/lib/server-functions';
import { LocationsPageClient } from './locations-client';
import React from 'react';

/**
 * Force dynamic rendering to ensure fresh data on each request.
 * This is required for pages that need authentication cookies.
 */
export const dynamic = 'force-dynamic';

/**
 * Locations page server component.
 *
 * This server component prefetches locations data without awaiting,
 * enabling Next.js to stream the response as data becomes available.
 * The prefetched data is dehydrated and passed to the client via HydrationBoundary.
 *
 * @returns The locations page with hydrated query state
 */
export default function LocationsPage(): React.ReactElement {
	const queryClient = getQueryClient();

	// Prefetch without await for streaming support
	prefetchLocationsList(queryClient, { limit: 100, offset: 0 });

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<LocationsPageClient />
		</HydrationBoundary>
	);
}
