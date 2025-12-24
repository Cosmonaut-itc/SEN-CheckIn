import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/get-query-client';
import { prefetchEmployeesList, prefetchOrganizationMembers } from '@/lib/server-functions';
import { EmployeesPageClient } from './employees-client';
import React from 'react';
import { getActiveOrganizationContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';

/**
 * Force dynamic rendering to ensure fresh data on each request.
 * This is required for pages that need authentication cookies.
 */
export const dynamic = 'force-dynamic';

/**
 * Employees page server component.
 *
 * This server component prefetches employees data without awaiting,
 * enabling Next.js to stream the response as data becomes available.
 * The prefetched data is dehydrated and passed to the client via HydrationBoundary.
 *
 * @returns The employees page with hydrated query state
 */
export default async function EmployeesPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const orgContext = await getActiveOrganizationContext();

	// Prefetch without await for streaming support
	prefetchEmployeesList(queryClient, {
		limit: 100,
		offset: 0,
		organizationId: orgContext.organizationId,
	});
	prefetchOrganizationMembers(queryClient, {
		organizationId: orgContext.organizationId ?? null,
		limit: 200,
		offset: 0,
	});

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrgProvider value={orgContext}>
				<EmployeesPageClient />
			</OrgProvider>
		</HydrationBoundary>
	);
}
