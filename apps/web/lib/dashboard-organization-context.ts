import { headers } from 'next/headers';
import { cache } from 'react';

import { getActiveOrganizationContext, type ActiveOrganizationContext } from '@/lib/organization-context';
import { fetchPayrollSettingsServer } from '@/lib/server-client-functions';

export interface DashboardOrganizationContext extends ActiveOrganizationContext {
	organizationTimeZone: string | null;
	enableDisciplinaryMeasures: boolean;
}

export const getDashboardOrganizationContext = cache(
	/**
	 * Resolves dashboard-only organization settings while sharing a single
	 * payroll-settings lookup across the dashboard layout and page.
	 *
	 * @returns Organization context enriched with dashboard settings
	 */
	async (): Promise<DashboardOrganizationContext> => {
		const organization = await getActiveOrganizationContext();
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const payrollSettings = organization.organizationId
			? await fetchPayrollSettingsServer(cookieHeader, organization.organizationId)
			: null;

		return {
			...organization,
			organizationTimeZone: payrollSettings?.timeZone ?? null,
			enableDisciplinaryMeasures: Boolean(payrollSettings?.enableDisciplinaryMeasures),
		};
	},
);
