// @vitest-environment jsdom

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUtcDayRangeFromDateKey } from '@/lib/time-zone';

const queryClient = { id: 'query-client' };
const dehydrateMock = vi.fn((client: unknown) => {
	void client;
	return { dehydrated: true };
});
const prefetchDashboardCountsMock = vi.fn();
const prefetchDashboardTimelineMock = vi.fn();
const prefetchDashboardHourlyMock = vi.fn();
const prefetchDashboardDeviceStatusMock = vi.fn();
const prefetchDashboardWeatherMock = vi.fn();
const getActiveOrganizationContextMock = vi.fn();
const fetchPayrollSettingsServerMock = vi.fn();
const headersMock = vi.fn();

vi.mock('@/lib/get-query-client', () => ({
	getQueryClient: () => queryClient,
}));

vi.mock('@/lib/server-functions', () => ({
	prefetchDashboardCounts: (client: unknown, params?: unknown) =>
		prefetchDashboardCountsMock(client, params),
	prefetchDashboardTimeline: (client: unknown, params?: unknown) =>
		prefetchDashboardTimelineMock(client, params),
	prefetchDashboardHourly: (client: unknown, params?: unknown) =>
		prefetchDashboardHourlyMock(client, params),
	prefetchDashboardDeviceStatus: (client: unknown, params?: unknown) =>
		prefetchDashboardDeviceStatusMock(client, params),
	prefetchDashboardWeather: (client: unknown, params?: unknown) =>
		prefetchDashboardWeatherMock(client, params),
}));

vi.mock('@/lib/server-client-functions', () => ({
	fetchPayrollSettingsServer: (cookieHeader: string, organizationId?: string | null) =>
		fetchPayrollSettingsServerMock(cookieHeader, organizationId),
}));

vi.mock('next/headers', () => ({
	headers: () => headersMock(),
}));

vi.mock('@tanstack/react-query', () => ({
	dehydrate: (client: unknown) => dehydrateMock(client),
	HydrationBoundary: ({ children }: { children?: React.ReactNode }) => (
		<div data-testid="hydration-boundary">{children}</div>
	),
}));

vi.mock('@/lib/organization-context', () => ({
	getActiveOrganizationContext: () => getActiveOrganizationContextMock(),
}));

vi.mock('./dashboard-client', () => ({
	DashboardPageClient: () => <div data-testid="dashboard-page-client" />,
}));

describe('Dashboard page server component', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));
		dehydrateMock.mockClear();
		prefetchDashboardCountsMock.mockClear();
		prefetchDashboardTimelineMock.mockClear();
		prefetchDashboardHourlyMock.mockClear();
		prefetchDashboardDeviceStatusMock.mockClear();
		prefetchDashboardWeatherMock.mockClear();
		getActiveOrganizationContextMock.mockResolvedValue({ organizationId: 'org-1' });
		fetchPayrollSettingsServerMock.mockResolvedValue({
			timeZone: 'America/Mexico_City',
		});
		headersMock.mockResolvedValue(
			new Headers({
				cookie: 'session=abc',
			}),
		);
	});

	it('prefetches all dashboard v2 datasets before rendering the client', async () => {
		const pageModule = await import('./page');
		const pageElement = await pageModule.default();
		const { startUtc, endUtc } = getUtcDayRangeFromDateKey(
			'2026-04-21',
			'America/Mexico_City',
		);

		expect(prefetchDashboardCountsMock).toHaveBeenCalledWith(queryClient, {
			organizationId: 'org-1',
		});
		expect(prefetchDashboardTimelineMock).toHaveBeenCalledWith(queryClient, {
			organizationId: 'org-1',
			fromDate: startUtc,
			toDate: endUtc,
		});
		expect(prefetchDashboardHourlyMock).toHaveBeenCalledWith(queryClient, {
			date: '2026-04-21',
			organizationId: 'org-1',
		});
		expect(prefetchDashboardDeviceStatusMock).toHaveBeenCalledTimes(1);
		expect(prefetchDashboardWeatherMock).toHaveBeenCalledTimes(1);
		expect(dehydrateMock).toHaveBeenCalledWith(queryClient);
		expect(pageElement).toBeTruthy();
	});
});
