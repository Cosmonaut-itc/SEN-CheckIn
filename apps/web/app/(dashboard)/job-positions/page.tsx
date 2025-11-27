import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/get-query-client';
import { prefetchJobPositionsList } from '@/lib/server-functions';
import { JobPositionsPageClient } from './job-positions-client';
import React from 'react';

/**
 * Force dynamic rendering to ensure fresh data on each request.
 * This is required for pages that need authentication cookies.
 */
export const dynamic = 'force-dynamic';

/**
 * Job Positions page server component.
 *
 * This server component prefetches job positions data without awaiting,
 * enabling Next.js to stream the response as data becomes available.
 * The prefetched data is dehydrated and passed to the client via HydrationBoundary.
 *
 * @returns The job positions page with hydrated query state
 */
export default function JobPositionsPage(): React.ReactElement {
	const queryClient = getQueryClient();

	// Prefetch without await for streaming support
	prefetchJobPositionsList(queryClient, { limit: 100, offset: 0 });

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<JobPositionsPageClient />
		</HydrationBoundary>
	);
}

