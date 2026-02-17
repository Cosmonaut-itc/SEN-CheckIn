import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/get-query-client';
import { prefetchAttendanceRecords } from '@/lib/server-functions';
import { AttendancePageClient, type AttendancePageInitialFilters } from './attendance-client';
import { startOfDay, endOfDay } from 'date-fns';
import React from 'react';
import { getActiveOrganizationContext } from '@/lib/organization-context';

/**
 * Force dynamic rendering to ensure fresh data on each request.
 * This is required for pages that need authentication cookies.
 */
export const dynamic = 'force-dynamic';

interface AttendancePageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Resolves a single search-param string value.
 *
 * @param value - Raw search param value
 * @returns Single string value or undefined
 */
function resolveSearchParamValue(value: string | string[] | undefined): string | undefined {
	if (Array.isArray(value)) {
		return value[0];
	}
	return value;
}

/**
 * Validates a date key in YYYY-MM-DD format.
 *
 * @param value - Candidate date key
 * @returns Normalized date key or undefined
 */
function resolveDateKey(value: string | undefined): string | undefined {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return undefined;
	}

	const parsed = new Date(`${value}T00:00:00`);
	if (Number.isNaN(parsed.getTime())) {
		return undefined;
	}

	return value;
}

/**
 * Attendance page server component.
 *
 * This server component prefetches attendance data without awaiting,
 * enabling Next.js to stream the response as data becomes available.
 * The prefetched data is dehydrated and passed to the client via HydrationBoundary.
 *
 * @returns The attendance page with hydrated query state
 */
export default async function AttendancePage({
	searchParams,
}: AttendancePageProps): Promise<React.ReactElement> {
	const queryClient = getQueryClient();
	const orgContext = await getActiveOrganizationContext();
	const params = await searchParams;
	const employeeId = resolveSearchParamValue(params.employeeId)?.trim() || undefined;
	const fromDateKey = resolveDateKey(resolveSearchParamValue(params.from));
	const toDateKey = resolveDateKey(resolveSearchParamValue(params.to));
	const initialFilters: AttendancePageInitialFilters = {
		...(employeeId ? { employeeId } : {}),
		...(fromDateKey ? { from: fromDateKey } : {}),
		...(toDateKey ? { to: toDateKey } : {}),
		...(resolveSearchParamValue(params.source)
			? { source: resolveSearchParamValue(params.source) }
			: {}),
		...(resolveSearchParamValue(params.returnEmployeeId)
			? { returnEmployeeId: resolveSearchParamValue(params.returnEmployeeId) }
			: {}),
		...(resolveSearchParamValue(params.returnTab)
			? {
					returnTab:
						resolveSearchParamValue(params.returnTab) as AttendancePageInitialFilters['returnTab'],
				}
			: {}),
	};

	// Prefetch today's attendance records without await for streaming support
	const now = new Date();
	const resolvedFromDate = fromDateKey ? startOfDay(new Date(`${fromDateKey}T00:00:00`)) : startOfDay(now);
	const resolvedToDate = toDateKey ? endOfDay(new Date(`${toDateKey}T00:00:00`)) : endOfDay(now);
	if (orgContext.organizationId) {
		prefetchAttendanceRecords(queryClient, {
			limit: 10,
			offset: 0,
			...(employeeId ? { employeeId } : {}),
			fromDate: resolvedFromDate,
			toDate: resolvedToDate,
			organizationId: orgContext.organizationId,
		});
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<AttendancePageClient initialFilters={initialFilters} />
		</HydrationBoundary>
	);
}
