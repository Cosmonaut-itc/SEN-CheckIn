import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/get-query-client';
import { prefetchEmployeesList, prefetchOrganizationMembers } from '@/lib/server-functions';
import { EmployeesPageClient } from './employees-client';
import React from 'react';
import { getAdminAccessContext } from '@/lib/organization-context';
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
	const { organization, organizationRole, userRole } = await getAdminAccessContext();

	// Prefetch without await for streaming support
	prefetchEmployeesList(queryClient, {
		limit: 10,
		offset: 0,
		organizationId: organization.organizationId,
	});
	prefetchOrganizationMembers(queryClient, {
		organizationId: organization.organizationId ?? null,
		limit: 200,
		offset: 0,
	});

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrgProvider
				value={{
					...organization,
					organizationRole,
					userRole,
				}}
			>
				<EmployeesPageClient />
			</OrgProvider>
		</HydrationBoundary>
	);
}
