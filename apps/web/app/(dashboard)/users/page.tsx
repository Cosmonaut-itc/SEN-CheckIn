import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/get-query-client';
import { prefetchUsers } from '@/lib/server-functions';
import { UsersPageClient } from './users-client';
import React from 'react';

/**
 * Force dynamic rendering to ensure fresh data on each request.
 * This is required for pages that need authentication cookies.
 */
export const dynamic = 'force-dynamic';

/**
 * Users page server component.
 *
 * This server component prefetches users data without awaiting,
 * enabling Next.js to stream the response as data becomes available.
 * The prefetched data is dehydrated and passed to the client via HydrationBoundary.
 *
 * @returns The users page with hydrated query state
 */
export default function UsersPage(): React.ReactElement {
	const queryClient = getQueryClient();

	// Prefetch without await for streaming support
	prefetchUsers(queryClient, { limit: 100, offset: 0 });

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<UsersPageClient />
		</HydrationBoundary>
	);
}
