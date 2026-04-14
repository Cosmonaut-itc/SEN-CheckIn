import { headers } from 'next/headers';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { redirect } from 'next/navigation';
import React from 'react';

import { getQueryClient } from '@/lib/get-query-client';
import { getAdminAccessContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';
import { fetchPayrollSettingsServer } from '@/lib/server-client-functions';
import { prefetchEmployeesList, prefetchOvertimeAuthorizationsList } from '@/lib/server-functions';
import { OvertimeAuthorizationsPageClient } from './overtime-authorizations-client';

export const dynamic = 'force-dynamic';

/**
 * Overtime authorizations page server component.
 *
 * @returns The overtime authorization admin screen
 */
export default async function OvertimeAuthorizationsPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const { organization, organizationRole, userRole, canAccessAdminRoutes } =
		await getAdminAccessContext();
	const requestHeaders = await headers();
	const cookieHeader = requestHeaders.get('cookie') ?? '';

	if (!canAccessAdminRoutes) {
		redirect('/acceso-restringido');
	}

	const payrollSettings = organization.organizationId
		? await fetchPayrollSettingsServer(cookieHeader, organization.organizationId)
		: null;

	if (organization.organizationId) {
		prefetchEmployeesList(queryClient, {
			organizationId: organization.organizationId,
			limit: 100,
			offset: 0,
		});
		prefetchOvertimeAuthorizationsList(queryClient, {
			organizationId: organization.organizationId,
			limit: 20,
			offset: 0,
		});
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrgProvider
				value={{
					...organization,
					organizationTimeZone: payrollSettings?.timeZone ?? 'America/Mexico_City',
					organizationRole,
					userRole,
				}}
			>
				<OvertimeAuthorizationsPageClient />
			</OrgProvider>
		</HydrationBoundary>
	);
}
