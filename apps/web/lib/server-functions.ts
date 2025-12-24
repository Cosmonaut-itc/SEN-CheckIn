/**
 * Server-side prefetch functions for TanStack Query.
 *
 * This module provides prefetch helpers used by Server Components to
 * initiate data fetching without blocking rendering. These functions
 * do NOT await the prefetch, allowing Next.js to stream the response
 * as data becomes available.
 *
 * IMPORTANT: These functions read cookies from `next/headers` and forward
 * them to the API server. This is necessary because Server Components
 * do not have access to the browser's cookie jar, so the BetterAuth
 * session cookie must be explicitly forwarded.
 *
 * @module server-functions
 */

import {
	type AttendanceQueryParams,
	type CalendarQueryParams,
	type JobPositionQueryParams,
	type ListQueryParams,
	type ScheduleExceptionQueryParams,
	type ScheduleTemplateQueryParams,
	type UsersQueryParams,
	type VacationRequestQueryParams,
	queryKeys,
} from '@/lib/query-keys';
import {
	fetchApiKeysServer,
	fetchAttendanceRecordsServer,
	fetchDashboardCountsServer,
	fetchDevicesListServer,
	fetchEmployeesListServer,
	fetchJobPositionsListServer,
	fetchLocationsListServer,
	fetchOrganizationMembersServer,
	fetchOrganizationsServer,
	fetchPayrollRunsServer,
	fetchPayrollSettingsServer,
	fetchScheduleExceptionsListServer,
	fetchScheduleTemplateDetailServer,
	fetchScheduleTemplatesListServer,
	fetchCalendarServer,
	fetchVacationRequestsListServer,
	fetchUsersServer,
} from '@/lib/server-client-functions';
import type { QueryClient } from '@tanstack/react-query';
import { headers } from 'next/headers';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Retrieves the cookie header string from the incoming request.
 *
 * This function reads the cookie header from the incoming request headers
 * and returns it as a string that can be forwarded to API requests.
 *
 * @returns A promise resolving to the cookie header string, or empty string if no cookies
 */
async function getCookieHeader(): Promise<string> {
	const requestHeaders = await headers();
	return requestHeaders.get('cookie') ?? '';
}

/**
 * Retrieves the headers from the incoming request.
 *
 * This function reads headers from `next/headers` and returns them
 * as a Headers object that can be forwarded to API requests.
 *
 * @returns A promise resolving to the Headers object
 */
async function getRequestHeaders(): Promise<Headers> {
	return await headers();
}

// ============================================================================
// Employee Prefetch Functions
// ============================================================================

/**
 * Prefetches the employees list for server-side streaming.
 *
 * This function initiates the prefetch but does NOT await it,
 * allowing Next.js to stream the response as data becomes available.
 * Cookies are forwarded from the incoming request to authenticate
 * with the API server.
 *
 * @param queryClient - The QueryClient instance from getQueryClient()
 * @param params - Optional query parameters for filtering and pagination
 *
 * @example
 * ```tsx
 * // In a Server Component (page.tsx)
 * export default function EmployeesPage() {
 *   const queryClient = getQueryClient();
 *   prefetchEmployeesList(queryClient, { limit: 100 });
 *
 *   return (
 *     <HydrationBoundary state={dehydrate(queryClient)}>
 *       <EmployeesPageClient />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 */
export function prefetchEmployeesList(queryClient: QueryClient, params?: ListQueryParams): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.employees.list(params),
		queryFn: async (): Promise<Awaited<ReturnType<typeof fetchEmployeesListServer>>> => {
			const cookieHeader: string = await getCookieHeader();
			return fetchEmployeesListServer(cookieHeader, params);
		},
	});
}

// ============================================================================
// Device Prefetch Functions
// ============================================================================

/**
 * Prefetches the devices list for server-side streaming.
 *
 * This function initiates the prefetch but does NOT await it,
 * allowing Next.js to stream the response as data becomes available.
 * Cookies are forwarded from the incoming request to authenticate
 * with the API server.
 *
 * @param queryClient - The QueryClient instance from getQueryClient()
 * @param params - Optional query parameters for filtering and pagination
 *
 * @example
 * ```tsx
 * // In a Server Component (page.tsx)
 * export default function DevicesPage() {
 *   const queryClient = getQueryClient();
 *   prefetchDevicesList(queryClient, { limit: 100 });
 *
 *   return (
 *     <HydrationBoundary state={dehydrate(queryClient)}>
 *       <DevicesPageClient />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 */
export function prefetchDevicesList(queryClient: QueryClient, params?: ListQueryParams): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.devices.list(params),
		queryFn: async (): Promise<Awaited<ReturnType<typeof fetchDevicesListServer>>> => {
			const cookieHeader: string = await getCookieHeader();
			return fetchDevicesListServer(cookieHeader, params);
		},
	});
}

// ============================================================================
// Location Prefetch Functions
// ============================================================================

/**
 * Prefetches the locations list for server-side streaming.
 *
 * This function initiates the prefetch but does NOT await it,
 * allowing Next.js to stream the response as data becomes available.
 * Cookies are forwarded from the incoming request to authenticate
 * with the API server.
 *
 * @param queryClient - The QueryClient instance from getQueryClient()
 * @param params - Optional query parameters for filtering and pagination
 *
 * @example
 * ```tsx
 * // In a Server Component (page.tsx)
 * export default function LocationsPage() {
 *   const queryClient = getQueryClient();
 *   prefetchLocationsList(queryClient, { limit: 100 });
 *
 *   return (
 *     <HydrationBoundary state={dehydrate(queryClient)}>
 *       <LocationsPageClient />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 */
export function prefetchLocationsList(queryClient: QueryClient, params?: ListQueryParams): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.locations.list(params),
		queryFn: async (): Promise<Awaited<ReturnType<typeof fetchLocationsListServer>>> => {
			const cookieHeader: string = await getCookieHeader();
			return fetchLocationsListServer(cookieHeader, params);
		},
	});
}

// ============================================================================
// Client Prefetch Functions
// ============================================================================

/**
 * Prefetches the job positions list for server-side streaming.
 *
 * Await the returned promise in Server Components that render job position
 * data server-side to keep SSR and client markup aligned and avoid hydration
 * mismatches. Cookies are forwarded from the incoming request to authenticate
 * with the API server.
 *
 * @param queryClient - The QueryClient instance from getQueryClient()
 * @param params - Optional query parameters for filtering and pagination
 * @returns Promise that resolves once the prefetch completes
 *
 * @example
 * ```tsx
 * // In a Server Component (page.tsx)
 * export default function JobPositionsPage() {
 *   const queryClient = getQueryClient();
 *   await prefetchJobPositionsList(queryClient, { limit: 100 });
 *
 *   return (
 *     <HydrationBoundary state={dehydrate(queryClient)}>
 *       <JobPositionsPageClient />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 */
export function prefetchJobPositionsList(
	queryClient: QueryClient,
	params?: JobPositionQueryParams,
): Promise<void> {
	return queryClient
		.prefetchQuery({
			queryKey: queryKeys.jobPositions.list(params),
			queryFn: async (): Promise<Awaited<ReturnType<typeof fetchJobPositionsListServer>>> => {
				const cookieHeader: string = await getCookieHeader();
				return fetchJobPositionsListServer(cookieHeader, params);
			},
		})
		.then(() => undefined);
}

// ============================================================================
// Attendance Prefetch Functions
// ============================================================================

/**
 * Prefetches the attendance records list for server-side streaming.
 *
 * This function initiates the prefetch but does NOT await it,
 * allowing Next.js to stream the response as data becomes available.
 * Cookies are forwarded from the incoming request to authenticate
 * with the API server.
 *
 * @param queryClient - The QueryClient instance from getQueryClient()
 * @param params - Optional query parameters for filtering and pagination
 *
 * @example
 * ```tsx
 * // In a Server Component (page.tsx)
 * export default function AttendancePage() {
 *   const queryClient = getQueryClient();
 *   prefetchAttendanceRecords(queryClient, {
 *     fromDate: startOfDay(new Date()),
 *     toDate: endOfDay(new Date()),
 *   });
 *
 *   return (
 *     <HydrationBoundary state={dehydrate(queryClient)}>
 *       <AttendancePageClient />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 */
export function prefetchAttendanceRecords(
	queryClient: QueryClient,
	params?: AttendanceQueryParams,
): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.attendance.list(params),
		queryFn: async (): Promise<Awaited<ReturnType<typeof fetchAttendanceRecordsServer>>> => {
			const cookieHeader: string = await getCookieHeader();
			return fetchAttendanceRecordsServer(cookieHeader, params);
		},
	});
}

// ============================================================================
// Dashboard Prefetch Functions
// ============================================================================

/**
 * Prefetches the dashboard entity counts for server-side streaming.
 *
 * This function initiates the prefetch but does NOT await it,
 * allowing Next.js to stream the response as data becomes available.
 * Cookies are forwarded from the incoming request to authenticate
 * with the API server.
 *
 * @param queryClient - The QueryClient instance from getQueryClient()
 *
 * @example
 * ```tsx
 * // In a Server Component (page.tsx)
 * export default function DashboardPage() {
 *   const queryClient = getQueryClient();
 *   prefetchDashboardCounts(queryClient);
 *
 *   return (
 *     <HydrationBoundary state={dehydrate(queryClient)}>
 *       <DashboardPageClient />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 */
export function prefetchDashboardCounts(
	queryClient: QueryClient,
	params?: { organizationId?: string | null },
): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.dashboard.counts(params?.organizationId),
		queryFn: async (): Promise<Awaited<ReturnType<typeof fetchDashboardCountsServer>>> => {
			const cookieHeader: string = await getCookieHeader();
			return fetchDashboardCountsServer(cookieHeader, params?.organizationId);
		},
	});
}

// ============================================================================
// API Key Prefetch Functions
// ============================================================================

/**
 * Prefetches the API keys list for server-side streaming.
 *
 * This function initiates the prefetch but does NOT await it,
 * allowing Next.js to stream the response as data becomes available.
 * Headers are forwarded from the incoming request to authenticate
 * with the BetterAuth API.
 *
 * @param queryClient - The QueryClient instance from getQueryClient()
 *
 * @example
 * ```tsx
 * // In a Server Component (page.tsx)
 * export default function ApiKeysPage() {
 *   const queryClient = getQueryClient();
 *   prefetchApiKeys(queryClient);
 *
 *   return (
 *     <HydrationBoundary state={dehydrate(queryClient)}>
 *       <ApiKeysPageClient />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 */
export function prefetchApiKeys(queryClient: QueryClient): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.apiKeys.list(),
		queryFn: async (): Promise<Awaited<ReturnType<typeof fetchApiKeysServer>>> => {
			const requestHeaders: Headers = await getRequestHeaders();
			return fetchApiKeysServer(requestHeaders);
		},
	});
}

// ============================================================================
// Organization Prefetch Functions
// ============================================================================

/**
 * Prefetches the organizations list for server-side streaming.
 *
 * This function initiates the prefetch but does NOT await it,
 * allowing Next.js to stream the response as data becomes available.
 * Headers are forwarded from the incoming request to authenticate
 * with the BetterAuth API.
 *
 * @param queryClient - The QueryClient instance from getQueryClient()
 *
 * @example
 * ```tsx
 * // In a Server Component (page.tsx)
 * export default function OrganizationsPage() {
 *   const queryClient = getQueryClient();
 *   prefetchOrganizations(queryClient);
 *
 *   return (
 *     <HydrationBoundary state={dehydrate(queryClient)}>
 *       <OrganizationsPageClient />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 */
export function prefetchOrganizations(queryClient: QueryClient): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.organizations.list(),
		queryFn: async (): Promise<Awaited<ReturnType<typeof fetchOrganizationsServer>>> => {
			const requestHeaders: Headers = await getRequestHeaders();
			return fetchOrganizationsServer(requestHeaders);
		},
	});
}

// ============================================================================
// Payroll Prefetch Functions
// ============================================================================

export function prefetchPayrollSettings(queryClient: QueryClient): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.payrollSettings.current(undefined),
		queryFn: async (): Promise<Awaited<ReturnType<typeof fetchPayrollSettingsServer>>> => {
			const cookieHeader: string = await getCookieHeader();
			return fetchPayrollSettingsServer(cookieHeader);
		},
	});
}

export function prefetchPayrollRuns(
	queryClient: QueryClient,
	params?: { organizationId?: string; limit?: number; offset?: number },
): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.payroll.runs(params),
		queryFn: async (): Promise<Awaited<ReturnType<typeof fetchPayrollRunsServer>>> => {
			const cookieHeader: string = await getCookieHeader();
			return fetchPayrollRunsServer(cookieHeader, params);
		},
	});
}

// ============================================================================
// Scheduling Prefetch Functions
// ============================================================================

/**
 * Prefetches schedule templates list for server-side streaming.
 *
 * This function initiates the prefetch but does NOT await it, allowing Next.js to
 * stream the response as data becomes available. Cookies are forwarded from the
 * incoming request to authenticate with the API server.
 *
 * @param queryClient - The QueryClient instance from getQueryClient()
 * @param params - Optional query parameters for pagination and organization scope
 * @returns Nothing
 */
export function prefetchScheduleTemplates(
	queryClient: QueryClient,
	params?: ScheduleTemplateQueryParams,
): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.scheduleTemplates.list(params),
		queryFn: async (): Promise<
			Awaited<ReturnType<typeof fetchScheduleTemplatesListServer>>
		> => {
			const cookieHeader: string = await getCookieHeader();
			return fetchScheduleTemplatesListServer(cookieHeader, params);
		},
	});
}

/**
 * Prefetches a single schedule template detail for server-side streaming.
 *
 * This function initiates the prefetch but does NOT await it, allowing Next.js to
 * stream the response as data becomes available. Cookies are forwarded from the
 * incoming request to authenticate with the API server.
 *
 * @param queryClient - The QueryClient instance from getQueryClient()
 * @param id - Schedule template identifier
 * @returns Nothing
 */
export function prefetchScheduleTemplateDetail(queryClient: QueryClient, id: string): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.scheduleTemplates.detail(id),
		queryFn: async (): Promise<
			Awaited<ReturnType<typeof fetchScheduleTemplateDetailServer>>
		> => {
			const cookieHeader: string = await getCookieHeader();
			return fetchScheduleTemplateDetailServer(cookieHeader, id);
		},
	});
}

/**
 * Prefetches schedule exceptions list for server-side streaming.
 *
 * This function initiates the prefetch but does NOT await it, allowing Next.js to
 * stream the response as data becomes available. Cookies are forwarded from the
 * incoming request to authenticate with the API server.
 *
 * @param queryClient - The QueryClient instance from getQueryClient()
 * @param params - Optional query parameters for filtering and pagination
 * @returns Nothing
 */
export function prefetchScheduleExceptions(
	queryClient: QueryClient,
	params?: ScheduleExceptionQueryParams,
): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.scheduleExceptions.list(params),
		queryFn: async (): Promise<
			Awaited<ReturnType<typeof fetchScheduleExceptionsListServer>>
		> => {
			const cookieHeader: string = await getCookieHeader();
			return fetchScheduleExceptionsListServer(cookieHeader, params);
		},
	});
}

/**
 * Prefetches the scheduling calendar for server-side streaming.
 *
 * This function initiates the prefetch but does NOT await it, allowing Next.js to
 * stream the response as data becomes available. Cookies are forwarded from the
 * incoming request to authenticate with the API server.
 *
 * @param queryClient - The QueryClient instance from getQueryClient()
 * @param params - Calendar query parameters
 * @returns Nothing
 */
export function prefetchCalendar(queryClient: QueryClient, params: CalendarQueryParams): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.scheduling.calendar(params),
		queryFn: async (): Promise<Awaited<ReturnType<typeof fetchCalendarServer>>> => {
			const cookieHeader: string = await getCookieHeader();
			return fetchCalendarServer(cookieHeader, params);
		},
	});
}

// ============================================================================
// Vacation Prefetch Functions
// ============================================================================

/**
 * Prefetches vacation requests list for server-side streaming.
 *
 * This function initiates the prefetch but does NOT await it, allowing Next.js to
 * stream the response as data becomes available. Cookies are forwarded from the
 * incoming request to authenticate with the API server.
 *
 * @param queryClient - The QueryClient instance from getQueryClient()
 * @param params - Optional query parameters for filtering and pagination
 * @returns Nothing
 */
export function prefetchVacationRequests(
	queryClient: QueryClient,
	params?: VacationRequestQueryParams,
): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.vacations.list(params),
		queryFn: async (): Promise<Awaited<ReturnType<typeof fetchVacationRequestsListServer>>> => {
			const cookieHeader: string = await getCookieHeader();
			return fetchVacationRequestsListServer(cookieHeader, params);
		},
	});
}

/**
 * Prefetches organization members list for server-side streaming.
 *
 * Skips prefetch if no organization ID is provided.
 */
export function prefetchOrganizationMembers(
	queryClient: QueryClient,
	params: { organizationId: string | null; limit?: number; offset?: number },
): void {
	if (!params.organizationId) {
		return;
	}

	queryClient.prefetchQuery({
		queryKey: queryKeys.organizationMembers.list(params),
		queryFn: async (): Promise<Awaited<ReturnType<typeof fetchOrganizationMembersServer>>> => {
			const requestHeaders: Headers = await getRequestHeaders();
			return fetchOrganizationMembersServer(requestHeaders, params);
		},
	});
}

// ============================================================================
// User Prefetch Functions
// ============================================================================

/**
 * Prefetches the users list for server-side streaming.
 *
 * This function initiates the prefetch but does NOT await it,
 * allowing Next.js to stream the response as data becomes available.
 * Headers are forwarded from the incoming request to authenticate
 * with the BetterAuth API.
 *
 * @param queryClient - The QueryClient instance from getQueryClient()
 * @param params - Optional query parameters for pagination
 *
 * @example
 * ```tsx
 * // In a Server Component (page.tsx)
 * export default function UsersPage() {
 *   const queryClient = getQueryClient();
 *   prefetchUsers(queryClient, { limit: 100 });
 *
 *   return (
 *     <HydrationBoundary state={dehydrate(queryClient)}>
 *       <UsersPageClient />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 */
export function prefetchUsers(queryClient: QueryClient, params?: UsersQueryParams): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.users.list(params),
		queryFn: async (): Promise<Awaited<ReturnType<typeof fetchUsersServer>>> => {
			const requestHeaders: Headers = await getRequestHeaders();
			return fetchUsersServer(requestHeaders, params);
		},
	});
}
