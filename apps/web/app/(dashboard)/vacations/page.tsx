import React from 'react';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { getQueryClient } from '@/lib/get-query-client';
import { getActiveOrganizationContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';
import { prefetchEmployeesList, prefetchVacationRequests } from '@/lib/server-functions';

import { VacationsPageClient } from './vacations-client';

export const dynamic = 'force-dynamic';

/**
 * Vacations page server component.
 *
 * Prefetches vacation requests and employees data for streaming and hydration.
 *
 * @returns Vacations page JSX
 */
export default async function VacationsPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const orgContext = await getActiveOrganizationContext();

	if (orgContext.organizationId) {
		prefetchEmployeesList(queryClient, {
			limit: 100,
			offset: 0,
			organizationId: orgContext.organizationId,
		});
		prefetchVacationRequests(queryClient, {
			limit: 50,
			offset: 0,
			organizationId: orgContext.organizationId,
		});
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrgProvider value={orgContext}>
				<VacationsPageClient />
			</OrgProvider>
		</HydrationBoundary>
	);
}
