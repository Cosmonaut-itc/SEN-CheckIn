import React from 'react';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { getQueryClient } from '@/lib/get-query-client';
import { getActiveOrganizationContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';
import { prefetchEmployeesList, prefetchIncapacities } from '@/lib/server-functions';

import { IncapacitiesPageClient } from './incapacities-client';

export const dynamic = 'force-dynamic';

/**
 * Incapacities page server component.
 *
 * Prefetches incapacity records and employees data for streaming and hydration.
 *
 * @returns Incapacities page JSX
 */
export default async function IncapacitiesPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const orgContext = await getActiveOrganizationContext();

	if (orgContext.organizationId) {
		prefetchEmployeesList(queryClient, {
			limit: 100,
			offset: 0,
			organizationId: orgContext.organizationId,
		});
		prefetchIncapacities(queryClient, {
			limit: 10,
			offset: 0,
			organizationId: orgContext.organizationId,
		});
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrgProvider value={orgContext}>
				<IncapacitiesPageClient />
			</OrgProvider>
		</HydrationBoundary>
	);
}
