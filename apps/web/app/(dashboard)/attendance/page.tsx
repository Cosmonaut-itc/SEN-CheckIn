import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/get-query-client';
import { prefetchAttendanceRecords } from '@/lib/server-functions';
import { AttendancePageClient } from './attendance-client';
import { startOfDay, endOfDay } from 'date-fns';
import React from 'react';

/**
 * Force dynamic rendering to ensure fresh data on each request.
 * This is required for pages that need authentication cookies.
 */
export const dynamic = 'force-dynamic';

/**
 * Attendance page server component.
 *
 * This server component prefetches attendance data without awaiting,
 * enabling Next.js to stream the response as data becomes available.
 * The prefetched data is dehydrated and passed to the client via HydrationBoundary.
 *
 * @returns The attendance page with hydrated query state
 */
export default function AttendancePage(): React.ReactElement {
	const queryClient = getQueryClient();

	// Prefetch today's attendance records without await for streaming support
	const today = new Date();
	prefetchAttendanceRecords(queryClient, {
		limit: 100,
		offset: 0,
		fromDate: startOfDay(today),
		toDate: endOfDay(today),
	});

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<AttendancePageClient />
		</HydrationBoundary>
	);
}
