import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import React from 'react';

import { getDashboardOrganizationContext } from '@/lib/dashboard-organization-context';
import { DEFAULT_DASHBOARD_TIME_ZONE } from '@/lib/dashboard-time-zone';
import { getQueryClient } from '@/lib/get-query-client';
import {
	prefetchDashboardCounts,
	prefetchDashboardDeviceStatus,
	prefetchDashboardHourly,
	prefetchDashboardLocationCapacity,
	prefetchDashboardTimeline,
	prefetchDashboardWeather,
} from '@/lib/server-functions';
import { getUtcDayRangeFromDateKey, toDateKeyInTimeZone } from '@/lib/time-zone';
import { DashboardPageClient } from './dashboard-client';

interface DashboardPageSearchParams {
	e2e?: string;
	responsiveTest?: string;
	theme?: string;
}

/**
 * Resolves whether the dashboard should skip SSR weather prefetch for e2e pages.
 *
 * @param searchParams - Current dashboard query params
 * @returns True when the request is instrumented for e2e rendering
 */
function shouldSkipWeatherPrefetch(searchParams?: DashboardPageSearchParams): boolean {
	return Boolean(searchParams?.e2e || searchParams?.responsiveTest);
}

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
export default async function DashboardPage({
	searchParams,
}: {
	searchParams?: DashboardPageSearchParams | Promise<DashboardPageSearchParams>;
} = {}): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const orgContext = await getDashboardOrganizationContext();
	const resolvedSearchParams =
		searchParams instanceof Promise ? await searchParams : searchParams;
	const dashboardTimeZone = orgContext.organizationTimeZone ?? DEFAULT_DASHBOARD_TIME_ZONE;
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
	prefetchDashboardLocationCapacity(queryClient, {
		organizationId: orgContext.organizationId,
	});
	prefetchDashboardDeviceStatus(queryClient, {
		organizationId: orgContext.organizationId,
	});
	if (!shouldSkipWeatherPrefetch(resolvedSearchParams)) {
		prefetchDashboardWeather(queryClient, {
			organizationId: orgContext.organizationId,
		});
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<DashboardPageClient />
		</HydrationBoundary>
	);
}
