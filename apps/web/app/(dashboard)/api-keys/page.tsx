import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { redirect } from 'next/navigation';
import React from 'react';

import { getQueryClient } from '@/lib/get-query-client';
import { getAdminAccessContext } from '@/lib/organization-context';
import { prefetchApiKeys } from '@/lib/server-functions';

import { ApiKeysPageClient } from './api-keys-client';

/**
 * Force dynamic rendering to ensure fresh data on each request.
 * This is required for pages that need authentication cookies.
 */
export const dynamic = 'force-dynamic';

/**
 * API Keys page server component.
 *
 * This server component prefetches API keys data without awaiting,
 * enabling Next.js to stream the response as data becomes available.
 * The prefetched data is dehydrated and passed to the client via HydrationBoundary.
 *
 * @returns The API keys page with hydrated query state
 */
export default async function ApiKeysPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const { canAccessAdminRoutes } = await getAdminAccessContext();

	if (!canAccessAdminRoutes) {
		redirect('/acceso-restringido');
	}

	// Prefetch without await for streaming support
	prefetchApiKeys(queryClient);

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<ApiKeysPageClient />
		</HydrationBoundary>
	);
}
