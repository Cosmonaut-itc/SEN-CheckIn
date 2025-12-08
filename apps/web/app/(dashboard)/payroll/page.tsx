import React from 'react';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { getQueryClient } from '@/lib/get-query-client';
import { getActiveOrganizationContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';
import { PayrollPageClient } from './payroll-client';
import { prefetchPayrollRuns, prefetchPayrollSettings } from '@/lib/server-functions';

export const dynamic = 'force-dynamic';

export default async function PayrollPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const orgContext = await getActiveOrganizationContext();

	prefetchPayrollSettings(queryClient);
	prefetchPayrollRuns(queryClient, { organizationId: orgContext.organizationId ?? undefined });

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrgProvider value={orgContext}>
				<PayrollPageClient />
			</OrgProvider>
		</HydrationBoundary>
	);
}

