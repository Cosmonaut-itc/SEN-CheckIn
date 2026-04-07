import React from 'react';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { getQueryClient } from '@/lib/get-query-client';
import { getAdminAccessContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';
import { prefetchJobPositionsList, prefetchLocationsList } from '@/lib/server-functions';

import { ImportClient } from './import-client';

export const dynamic = 'force-dynamic';

/**
 * Employee import page server component.
 *
 * Prefetches organization-scoped reference data for the import wizard and
 * hydrates it into the client boundary.
 *
 * @returns Hydrated employee import page
 */
export default async function EmployeeImportPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const { organization, organizationRole, userRole } = await getAdminAccessContext();

	if (organization.organizationId) {
		prefetchLocationsList(queryClient, {
			organizationId: organization.organizationId,
			limit: 100,
			offset: 0,
		});
		await prefetchJobPositionsList(queryClient, {
			organizationId: organization.organizationId,
			limit: 100,
			offset: 0,
		});
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrgProvider
				value={{
					...organization,
					organizationRole,
					userRole,
				}}
			>
				<ImportClient />
			</OrgProvider>
		</HydrationBoundary>
	);
}
