import { redirect } from 'next/navigation';
import React from 'react';

import { getAdminAccessContext } from '@/lib/organization-context';
import { OrgProvider } from '@/lib/org-client-context';

import { FiscalCfdiClient } from './fiscal-cfdi-client';

export const dynamic = 'force-dynamic';

/**
 * Fiscal CFDI master-data admin page.
 *
 * @returns Fiscal CFDI page with organization context
 */
export default async function FiscalCfdiPage(): Promise<React.ReactElement> {
	const { organization, organizationRole, userRole, canAccessAdminRoutes } =
		await getAdminAccessContext();

	if (!canAccessAdminRoutes) {
		redirect('/acceso-restringido');
	}

	return (
		<OrgProvider
			value={{
				...organization,
				organizationRole,
				userRole,
			}}
		>
			<FiscalCfdiClient />
		</OrgProvider>
	);
}
