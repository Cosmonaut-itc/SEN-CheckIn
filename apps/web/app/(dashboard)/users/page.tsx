import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { redirect } from 'next/navigation';
import React from 'react';

import { getQueryClient } from '@/lib/get-query-client';
import { getAdminAccessContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';
import { prefetchAllOrganizations, prefetchOrganizationMembers } from '@/lib/server-functions';

import { UsersPageClient } from './users-client';

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
export default async function UsersPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const { organization, isSuperUser, canAccessAdminRoutes } = await getAdminAccessContext();

	if (!canAccessAdminRoutes) {
		redirect('/acceso-restringido');
	}

	// Prefetch without await for streaming support
	if (isSuperUser) {
		prefetchAllOrganizations(queryClient, { limit: 100, offset: 0 });
	}

	if (organization.organizationId) {
		prefetchOrganizationMembers(queryClient, {
			organizationId: organization.organizationId,
			limit: 100,
			offset: 0,
		});
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrgProvider value={organization}>
				<UsersPageClient />
			</OrgProvider>
		</HydrationBoundary>
	);
}
