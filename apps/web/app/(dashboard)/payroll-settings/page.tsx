import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { redirect } from 'next/navigation';
import React from 'react';

import { getQueryClient } from '@/lib/get-query-client';
import { getAdminAccessContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';
import { prefetchPayrollSettings } from '@/lib/server-functions';

import { PayrollSettingsClient } from './payroll-settings-client';

export const dynamic = 'force-dynamic';

/**
 * Payroll settings page server component.
 *
 * This server component prefetches payroll settings data without awaiting to
 * enable streaming. The prefetched data is dehydrated and passed to the client
 * via HydrationBoundary.
 *
 * @returns The payroll settings page with hydrated query state
 */
export default async function PayrollSettingsPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const { organization, organizationRole, userRole, canAccessAdminRoutes } =
		await getAdminAccessContext();

	if (!canAccessAdminRoutes) {
		redirect('/acceso-restringido');
	}

	prefetchPayrollSettings(queryClient);

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrgProvider
				value={{
					...organization,
					organizationRole,
					userRole,
				}}
			>
				<PayrollSettingsClient />
			</OrgProvider>
		</HydrationBoundary>
	);
}
