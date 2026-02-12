import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import React from 'react';

import { getQueryClient } from '@/lib/get-query-client';
import { getAdminAccessContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';
import { fetchPayrollSettingsServer } from '@/lib/server-client-functions';
import {
	prefetchDisciplinaryKpis,
	prefetchDisciplinaryMeasures,
	prefetchEmployeesList,
} from '@/lib/server-functions';

import { DisciplinaryMeasuresPageClient } from './disciplinary-measures-client';

export const dynamic = 'force-dynamic';

/**
 * Server page for disciplinary measures dashboard.
 *
 * @returns Server-rendered disciplinary measures page
 */
export default async function DisciplinaryMeasuresPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const { organization, organizationRole, userRole, canAccessAdminRoutes } =
		await getAdminAccessContext();

	if (!canAccessAdminRoutes) {
		redirect('/acceso-restringido');
	}

	const requestHeaders = await headers();
	const cookieHeader = requestHeaders.get('cookie') ?? '';
	const payrollSettings = await fetchPayrollSettingsServer(
		cookieHeader,
		organization.organizationId ?? undefined,
	);

	if (!payrollSettings?.enableDisciplinaryMeasures) {
		redirect('/dashboard');
	}

	const disciplinaryListParams = {
		limit: 20,
		offset: 0,
	};
	const employeesListParams = {
		limit: 100,
		offset: 0,
		...(organization.organizationId ? { organizationId: organization.organizationId } : {}),
	};

	prefetchDisciplinaryMeasures(queryClient, disciplinaryListParams);
	prefetchDisciplinaryKpis(queryClient);
	prefetchEmployeesList(queryClient, employeesListParams);

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<OrgProvider
				value={{
					...organization,
					organizationRole,
					userRole,
				}}
			>
				<DisciplinaryMeasuresPageClient />
			</OrgProvider>
		</HydrationBoundary>
	);
}
