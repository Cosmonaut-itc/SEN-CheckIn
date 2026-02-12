import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/get-query-client';
import { prefetchJobPositionsList } from '@/lib/server-functions';
import { JobPositionsPageClient } from './job-positions-client';
import React from 'react';
import { getActiveOrganizationContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';

/**
 * Force dynamic rendering to ensure fresh data on each request.
 * This is required for pages that need authentication cookies.
 */
export const dynamic = 'force-dynamic';

/**
 * Job Positions page server component.
 *
 * This server component prefetches job positions data without awaiting to
 * enable streaming. The prefetched data is dehydrated and passed to the client
 * via HydrationBoundary.
 *
 * @returns The job positions page with hydrated query state
 */
export default async function JobPositionsPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const orgContext = await getActiveOrganizationContext();

	// Prefetch without await for streaming support
	if (orgContext.organizationId) {
		prefetchJobPositionsList(queryClient, {
			limit: 10,
			offset: 0,
			organizationId: orgContext.organizationId,
		});
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrgProvider value={orgContext}>
				<JobPositionsPageClient />
			</OrgProvider>
		</HydrationBoundary>
	);
}
