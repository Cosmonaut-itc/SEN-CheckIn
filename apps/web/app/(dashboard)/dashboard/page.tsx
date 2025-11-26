import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/get-query-client';
import { prefetchDashboardCounts } from '@/lib/server-functions';
import { DashboardPageClient } from './dashboard-client';
import React from 'react';

/**
 * Force dynamic rendering to ensure fresh data on each request.
 * This is required for pages that need authentication cookies.
 */
export const dynamic = 'force-dynamic';

/**
 * Dashboard page server component.
 *
 * This server component prefetches dashboard data without awaiting,
 * enabling Next.js to stream the response as data becomes available.
 * The prefetched data is dehydrated and passed to the client via HydrationBoundary.
 *
 * @returns The dashboard page with hydrated query state
 */
export default function DashboardPage(): React.ReactElement {
	const queryClient = getQueryClient();

	// Prefetch without await for streaming support
	prefetchDashboardCounts(queryClient);

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<DashboardPageClient />
		</HydrationBoundary>
	);
}
