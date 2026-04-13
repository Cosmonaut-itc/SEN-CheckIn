import { headers } from 'next/headers';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { redirect } from 'next/navigation';
import React from 'react';

import { EmployeeGratificationsManager } from '@/components/employee-gratifications-manager';
import { buildOrganizationGratificationsQueryParams } from '@/lib/employee-gratifications-query-params';
import { getQueryClient } from '@/lib/get-query-client';
import { getAdminAccessContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';
import { fetchPayrollSettingsServer } from '@/lib/server-client-functions';
import {
	prefetchEmployeesList,
	prefetchOrganizationGratificationsList,
} from '@/lib/server-functions';

export const dynamic = 'force-dynamic';

/**
 * Organization-wide gratifications admin page.
 *
 * @returns Gratifications management screen with dehydrated query state
 */
export default async function GratificationsPage(): Promise<React.ReactElement> {
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
		prefetchOrganizationGratificationsList(
			queryClient,
			buildOrganizationGratificationsQueryParams({
				organizationId: organization.organizationId,
				limit: 20,
				offset: 0,
			}),
		);
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
				<EmployeeGratificationsManager mode="organization" />
			</OrgProvider>
		</HydrationBoundary>
	);
}
