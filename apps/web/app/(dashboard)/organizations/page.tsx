import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/get-query-client';
import { prefetchOrganizations } from '@/lib/server-functions';
import { OrganizationsPageClient } from './organizations-client';
import React from 'react';

/**
 * Force dynamic rendering to ensure fresh data on each request.
 * This is required for pages that need authentication cookies.
 */
export const dynamic = 'force-dynamic';

/**
 * Organizations page server component.
 *
 * This server component prefetches organizations data without awaiting,
 * enabling Next.js to stream the response as data becomes available.
 * The prefetched data is dehydrated and passed to the client via HydrationBoundary.
 *
 * @returns The organizations page with hydrated query state
 */
export default function OrganizationsPage(): React.ReactElement {
	const queryClient = getQueryClient();

	// Prefetch without await for streaming support
	prefetchOrganizations(queryClient);

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrganizationsPageClient />
		</HydrationBoundary>
	);
}
