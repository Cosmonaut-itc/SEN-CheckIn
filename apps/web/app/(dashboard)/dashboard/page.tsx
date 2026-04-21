import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { endOfDay, format, startOfDay } from 'date-fns';
import React from 'react';

import { getQueryClient } from '@/lib/get-query-client';
import { DashboardPageClient } from './dashboard-client';
import { getActiveOrganizationContext } from '@/lib/organization-context';
import {
	prefetchDashboardCounts,
	prefetchDashboardDeviceStatus,
	prefetchDashboardHourly,
	prefetchDashboardTimeline,
	prefetchDashboardWeather,
} from '@/lib/server-functions';

/**
 * Force dynamic rendering to ensure fresh data on each request.
 * This is required for pages that need authentication cookies.
 */
export const dynamic = 'force-dynamic';

/**
 * Dashboard page server component.
 *
 * This server component prefetches dashboard data without awaiting,
 * enabling Next.js to stream the response as data becomes available.
 * The prefetched data is dehydrated and passed to the client via HydrationBoundary.
 *
 * @returns The dashboard page with hydrated query state
 */
export default async function DashboardPage(): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const orgContext = await getActiveOrganizationContext();
	const now = new Date();
	const fromDate = startOfDay(now);
	const toDate = endOfDay(now);
	const hourlyDate = format(now, 'yyyy-MM-dd');

	// Prefetch without await for streaming support
	prefetchDashboardCounts(queryClient, { organizationId: orgContext.organizationId });
	prefetchDashboardTimeline(queryClient, {
		organizationId: orgContext.organizationId,
		fromDate,
		toDate,
	});
	prefetchDashboardHourly(queryClient, {
		organizationId: orgContext.organizationId,
		date: hourlyDate,
	});
	prefetchDashboardDeviceStatus(queryClient, {
		organizationId: orgContext.organizationId,
	});
	prefetchDashboardWeather(queryClient, {
		organizationId: orgContext.organizationId,
	});

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<DashboardPageClient />
		</HydrationBoundary>
	);
}
