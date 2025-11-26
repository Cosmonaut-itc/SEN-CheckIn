/**
 * Server-side prefetch functions for TanStack Query.
 *
 * This module provides prefetch helpers used by Server Components to
 * initiate data fetching without blocking rendering. These functions
 * do NOT await the prefetch, allowing Next.js to stream the response
 * as data becomes available.
 *
 * @module server-functions
 */

import type { QueryClient } from '@tanstack/react-query';
import {
	queryKeys,
	type ListQueryParams,
	type AttendanceQueryParams,
	type UsersQueryParams,
} from '@/lib/query-keys';
import {
	fetchEmployeesList,
	fetchDevicesList,
	fetchLocationsList,
	fetchClientsList,
	fetchAttendanceRecords,
	fetchDashboardCounts,
	fetchApiKeys,
	fetchOrganizations,
	fetchUsers,
} from '@/lib/client-functions';

// ============================================================================
// Employee Prefetch Functions
// ============================================================================

/**
 * Prefetches the employees list for server-side streaming.
 *
 * This function initiates the prefetch but does NOT await it,
 * allowing Next.js to stream the response as data becomes available.
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
export function prefetchEmployeesList(
	queryClient: QueryClient,
	params?: ListQueryParams,
): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.employees.list(params),
		queryFn: () => fetchEmployeesList(params),
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
export function prefetchDevicesList(
	queryClient: QueryClient,
	params?: ListQueryParams,
): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.devices.list(params),
		queryFn: () => fetchDevicesList(params),
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
export function prefetchLocationsList(
	queryClient: QueryClient,
	params?: ListQueryParams,
): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.locations.list(params),
		queryFn: () => fetchLocationsList(params),
	});
}

// ============================================================================
// Client Prefetch Functions
// ============================================================================

/**
 * Prefetches the clients list for server-side streaming.
 *
 * This function initiates the prefetch but does NOT await it,
 * allowing Next.js to stream the response as data becomes available.
 *
 * @param queryClient - The QueryClient instance from getQueryClient()
 * @param params - Optional query parameters for filtering and pagination
 *
 * @example
 * ```tsx
 * // In a Server Component (page.tsx)
 * export default function ClientsPage() {
 *   const queryClient = getQueryClient();
 *   prefetchClientsList(queryClient, { limit: 100 });
 *
 *   return (
 *     <HydrationBoundary state={dehydrate(queryClient)}>
 *       <ClientsPageClient />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 */
export function prefetchClientsList(
	queryClient: QueryClient,
	params?: ListQueryParams,
): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.clients.list(params),
		queryFn: () => fetchClientsList(params),
	});
}

// ============================================================================
// Attendance Prefetch Functions
// ============================================================================

/**
 * Prefetches the attendance records list for server-side streaming.
 *
 * This function initiates the prefetch but does NOT await it,
 * allowing Next.js to stream the response as data becomes available.
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
		queryFn: () => fetchAttendanceRecords(params),
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
export function prefetchDashboardCounts(queryClient: QueryClient): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.dashboard.counts(),
		queryFn: fetchDashboardCounts,
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
		queryFn: fetchApiKeys,
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
		queryFn: fetchOrganizations,
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
export function prefetchUsers(
	queryClient: QueryClient,
	params?: UsersQueryParams,
): void {
	queryClient.prefetchQuery({
		queryKey: queryKeys.users.list(params),
		queryFn: () => fetchUsers(params),
	});
}

