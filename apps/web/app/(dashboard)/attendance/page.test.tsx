import type React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getUtcDayRangeFromDateKey } from '@/lib/time-zone';
import * as getQueryClientModule from '@/lib/get-query-client';
import * as organizationContextModule from '@/lib/organization-context';
import * as serverFunctionsModule from '@/lib/server-functions';
import * as serverClientFunctionsModule from '@/lib/server-client-functions';
import type { QueryClient } from '@tanstack/react-query';

vi.mock('@/lib/get-query-client', () => ({
	getQueryClient: vi.fn(),
}));

vi.mock('@/lib/organization-context', () => ({
	getActiveOrganizationContext: vi.fn(),
}));

vi.mock('@/lib/server-functions', () => ({
	prefetchAttendanceRecords: vi.fn(),
}));

vi.mock('@/lib/server-client-functions', () => ({
	fetchPayrollSettingsServer: vi.fn(),
}));

vi.mock('next/headers', () => ({
	headers: vi.fn().mockResolvedValue(
		new Headers({
			cookie: 'session=abc',
		}),
	),
}));

vi.mock('@tanstack/react-query', () => ({
	dehydrate: (): Record<string, never> => ({}),
	HydrationBoundary: ({ children }: { children: React.ReactNode }): React.ReactElement => (
		<>{children}</>
	),
}));

vi.mock('./attendance-client', () => ({
	AttendancePageClient: (): React.ReactElement => <div data-testid="attendance-page-client" />,
}));

describe('AttendancePage', () => {
	beforeEach(() => {
		const queryClient = { cacheKey: 'query-client' } as unknown as QueryClient;
		const getQueryClient = getQueryClientModule.getQueryClient as unknown as ReturnType<
			typeof vi.fn
		>;
		const getActiveOrganizationContext =
			organizationContextModule.getActiveOrganizationContext as unknown as ReturnType<
				typeof vi.fn
			>;
		const prefetchAttendanceRecords =
			serverFunctionsModule.prefetchAttendanceRecords as unknown as ReturnType<typeof vi.fn>;
		const fetchPayrollSettingsServer =
			serverClientFunctionsModule.fetchPayrollSettingsServer as unknown as ReturnType<
				typeof vi.fn
			>;

		getQueryClient.mockReset();
		getActiveOrganizationContext.mockReset();
		prefetchAttendanceRecords.mockReset();
		fetchPayrollSettingsServer.mockReset();

		getQueryClient.mockReturnValue(queryClient);
		getActiveOrganizationContext.mockResolvedValue({
			organizationId: 'org-1',
			organizationSlug: 'org-1',
			organizationName: 'Org 1',
		});
		fetchPayrollSettingsServer.mockResolvedValue({
			timeZone: 'Asia/Tokyo',
		});
	});

	it('prefetches attendance with the organization timezone when the URL omits timeZone', async () => {
		const prefetchAttendanceRecords =
			serverFunctionsModule.prefetchAttendanceRecords as unknown as ReturnType<typeof vi.fn>;
		const fetchPayrollSettingsServer =
			serverClientFunctionsModule.fetchPayrollSettingsServer as unknown as ReturnType<
				typeof vi.fn
			>;
		const expectedRange = getUtcDayRangeFromDateKey('2026-02-23', 'Asia/Tokyo');
		const { default: AttendancePage } = await import('./page');

		await AttendancePage({
			searchParams: Promise.resolve({
				from: '2026-02-23',
				to: '2026-02-23',
			}),
		});

		expect(fetchPayrollSettingsServer).toHaveBeenCalledWith('session=abc', 'org-1');
		expect(prefetchAttendanceRecords).toHaveBeenCalledWith(expect.anything(), {
			limit: 10,
			offset: 0,
			organizationId: 'org-1',
			fromDate: expectedRange.startUtc,
			toDate: expectedRange.endUtc,
		});
	});
});
