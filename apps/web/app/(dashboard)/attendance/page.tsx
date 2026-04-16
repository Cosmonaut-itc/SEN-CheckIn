import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/get-query-client';
import { prefetchAttendanceRecords } from '@/lib/server-functions';
import { fetchPayrollSettingsServer } from '@/lib/server-client-functions';
import { AttendancePageClient, type AttendancePageInitialFilters } from './attendance-client';
import { isValidIanaTimeZone, getUtcDayRangeFromDateKey, toDateKeyInTimeZone } from '@/lib/time-zone';
import { headers } from 'next/headers';
import React from 'react';
import { getActiveOrganizationContext } from '@/lib/organization-context';

/**
 * Force dynamic rendering to ensure fresh data on each request.
 * This is required for pages that need authentication cookies.
 */
export const dynamic = 'force-dynamic';
const VALID_RETURN_TABS: ReadonlySet<NonNullable<AttendancePageInitialFilters['returnTab']>> =
	new Set<NonNullable<AttendancePageInitialFilters['returnTab']>>([
		'summary',
		'attendance',
		'vacations',
		'documents',
		'payroll',
		'ptu',
		'finiquito',
		'exceptions',
		'audit',
		'disciplinary',
	]);
const DEFAULT_ATTENDANCE_TIME_ZONE = 'America/Mexico_City';

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

	const [yearToken, monthToken, dayToken] = value.split('-');
	const year = Number(yearToken);
	const month = Number(monthToken);
	const day = Number(dayToken);
	const parsed = new Date(`${value}T00:00:00Z`);
	if (
		Number.isNaN(parsed.getTime()) ||
		parsed.getUTCFullYear() !== year ||
		parsed.getUTCMonth() + 1 !== month ||
		parsed.getUTCDate() !== day
	) {
		return undefined;
	}

	return value;
}

/**
 * Validates employee return-tab values from URL params.
 *
 * @param value - Candidate return-tab value
 * @returns Valid return tab or undefined
 */
function resolveReturnTab(
	value: string | undefined,
): AttendancePageInitialFilters['returnTab'] | undefined {
	if (!value) {
		return undefined;
	}

	const candidate = value as NonNullable<AttendancePageInitialFilters['returnTab']>;
	return VALID_RETURN_TABS.has(candidate) ? candidate : undefined;
}

/**
 * Validates an optional IANA timezone search param.
 *
 * @param value - Candidate timezone from search params
 * @returns Valid timezone or undefined when invalid/missing
 */
function resolveTimeZone(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}
	return isValidIanaTimeZone(value) ? value : undefined;
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
	const requestHeaders = await headers();
	const cookieHeader = requestHeaders.get('cookie') ?? '';
	const payrollSettings = orgContext.organizationId
		? await fetchPayrollSettingsServer(cookieHeader, orgContext.organizationId)
		: null;
	const params = await searchParams;
	const employeeId = resolveSearchParamValue(params.employeeId)?.trim() || undefined;
	const fromDateKey = resolveDateKey(resolveSearchParamValue(params.from));
	const toDateKey = resolveDateKey(resolveSearchParamValue(params.to));
	const source = resolveSearchParamValue(params.source);
	const returnEmployeeId = resolveSearchParamValue(params.returnEmployeeId);
	const returnTab = resolveReturnTab(resolveSearchParamValue(params.returnTab));
	const timeZone = resolveTimeZone(resolveSearchParamValue(params.timeZone));
	const organizationTimeZone = resolveTimeZone(payrollSettings?.timeZone);
	const initialFilters: AttendancePageInitialFilters = {
		...(employeeId ? { employeeId } : {}),
		...(fromDateKey ? { from: fromDateKey } : {}),
		...(toDateKey ? { to: toDateKey } : {}),
		...(source ? { source } : {}),
		...(returnEmployeeId ? { returnEmployeeId } : {}),
		...(returnTab ? { returnTab } : {}),
		...(timeZone ? { timeZone } : {}),
	};

	// Prefetch today's attendance records without await for streaming support
	const now = new Date();
	const resolvedTimeZone = timeZone ?? organizationTimeZone ?? DEFAULT_ATTENDANCE_TIME_ZONE;
	const fallbackDateKey = toDateKeyInTimeZone(now, resolvedTimeZone);
	const resolvedFromDate = getUtcDayRangeFromDateKey(
		fromDateKey ?? fallbackDateKey,
		resolvedTimeZone,
	).startUtc;
	const resolvedToDate = getUtcDayRangeFromDateKey(
		toDateKey ?? fallbackDateKey,
		resolvedTimeZone,
	).endUtc;
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
