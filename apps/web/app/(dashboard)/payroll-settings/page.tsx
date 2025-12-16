import React from 'react';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { getQueryClient } from '@/lib/get-query-client';
import { prefetchPayrollSettings } from '@/lib/server-functions';
import { getActiveOrganizationContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';
import { PayrollSettingsClient } from './payroll-settings-client';

export const dynamic = 'force-dynamic';

export default async function PayrollSettingsPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const orgContext = await getActiveOrganizationContext();

	prefetchPayrollSettings(queryClient);

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrgProvider value={orgContext}>
				<PayrollSettingsClient />
			</OrgProvider>
		</HydrationBoundary>
	);
}
