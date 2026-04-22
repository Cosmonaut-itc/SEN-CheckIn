import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { headers } from 'next/headers';
import React from 'react';

import { getQueryClient } from '@/lib/get-query-client';
import { DashboardPageClient } from './dashboard-client';
import { getActiveOrganizationContext } from '@/lib/organization-context';
import { fetchPayrollSettingsServer } from '@/lib/server-client-functions';
import {
	prefetchDashboardCounts,
	prefetchDashboardDeviceStatus,
	prefetchDashboardHourly,
	prefetchDashboardTimeline,
	prefetchDashboardWeather,
} from '@/lib/server-functions';
import { getUtcDayRangeFromDateKey, toDateKeyInTimeZone } from '@/lib/time-zone';

const DEFAULT_DASHBOARD_TIME_ZONE = 'America/Mexico_City';

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
	const requestHeaders = await headers();
	const cookieHeader = requestHeaders.get('cookie') ?? '';
	const payrollSettings = orgContext.organizationId
		? await fetchPayrollSettingsServer(cookieHeader, orgContext.organizationId)
		: null;
	const dashboardTimeZone = payrollSettings?.timeZone ?? DEFAULT_DASHBOARD_TIME_ZONE;
	const todayDateKey = toDateKeyInTimeZone(new Date(), dashboardTimeZone);
	const todayRange = getUtcDayRangeFromDateKey(todayDateKey, dashboardTimeZone);

	// Prefetch without await for streaming support
	prefetchDashboardCounts(queryClient, { organizationId: orgContext.organizationId });
	prefetchDashboardTimeline(queryClient, {
		organizationId: orgContext.organizationId,
		fromDate: todayRange.startUtc,
		toDate: todayRange.endUtc,
	});
	prefetchDashboardHourly(queryClient, {
		organizationId: orgContext.organizationId,
		date: todayDateKey,
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
