import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { redirect } from 'next/navigation';
import React from 'react';

import { getQueryClient } from '@/lib/get-query-client';
import { getAdminAccessContext } from '@/lib/organization-context';
import { prefetchAllOrganizations, prefetchOrganizations } from '@/lib/server-functions';

import { OrganizationsPageClient } from './organizations-client';

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
export default async function OrganizationsPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const { isSuperUser, canAccessAdminRoutes } = await getAdminAccessContext();

	if (!canAccessAdminRoutes) {
		redirect('/acceso-restringido');
	}

	// Prefetch without await for streaming support
	if (isSuperUser) {
		prefetchAllOrganizations(queryClient, { limit: 10, offset: 0 });
	} else {
		prefetchOrganizations(queryClient);
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrganizationsPageClient />
		</HydrationBoundary>
	);
}
