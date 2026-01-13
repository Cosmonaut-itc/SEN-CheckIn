import { redirect } from 'next/navigation';
import React from 'react';

import { getAdminAccessContext } from '@/lib/organization-context';

import { AppMovilPageClient } from './app-movil-client';

/**
 * Force dynamic rendering to ensure fresh data on each request.
 * This is required for pages that need authentication cookies.
 */
export const dynamic = 'force-dynamic';

/**
 * App Móvil page server component.
 *
 * @returns The App Móvil page
 */
export default async function AppMovilPage(): Promise<React.ReactElement> {
	const { canAccessAdminRoutes } = await getAdminAccessContext();

	if (!canAccessAdminRoutes) {
		redirect('/acceso-restringido');
	}

	return <AppMovilPageClient />;
}
