import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/get-query-client';
import { prefetchLocationsList } from '@/lib/server-functions';
import { LocationsPageClient } from './locations-client';
import React from 'react';
import { getActiveOrganizationContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';

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
export default async function LocationsPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const orgContext = await getActiveOrganizationContext();

	// Prefetch without await for streaming support
	if (orgContext.organizationId) {
		prefetchLocationsList(queryClient, {
			limit: 10,
			offset: 0,
			organizationId: orgContext.organizationId,
		});
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrgProvider value={orgContext}>
				<LocationsPageClient />
			</OrgProvider>
		</HydrationBoundary>
	);
}
