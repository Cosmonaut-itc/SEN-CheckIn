import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrgProvider } from '@/lib/org-client-context';
import type { AttendanceRecord } from '@/lib/client-functions';
import { getUtcDayRangeFromDateKey } from '@/lib/time-zone';

import { AttendancePageClient, getPresetDateRangeKeys } from './attendance-client';

const mockFetchAttendanceRecords = vi.fn();
const mockFetchLocationsList = vi.fn();

vi.mock('next/navigation', () => ({
	useRouter: () => ({
		push: vi.fn(),
		replace: vi.fn(),
	}),
	usePathname: () => '/attendance',
	useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/client-functions', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/client-functions')>();
	return {
		...actual,
		fetchAttendanceRecords: (...args: unknown[]) => mockFetchAttendanceRecords(...args),
		fetchLocationsList: (...args: unknown[]) => mockFetchLocationsList(...args),
		fetchEmployeesList: vi.fn().mockResolvedValue({
			data: [],
			pagination: { total: 0, limit: 100, offset: 0 },
		}),
	};
});

/**
 * Renders the attendance client with required providers.
 *
 * @param options - Optional overrides for org context and initial filters
 * @returns Render result
 */
function renderAttendanceClient(options?: {
	organizationTimeZone?: string | null;
	initialFilters?: React.ComponentProps<typeof AttendancePageClient>['initialFilters'];
}): ReturnType<typeof render> {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	return render(
		<QueryClientProvider client={queryClient}>
			<OrgProvider
				value={{
					organizationId: 'org-1',
					organizationName: 'Org 1',
					organizationSlug: 'org-1',
					organizationRole: 'member',
					organizationTimeZone: options?.organizationTimeZone ?? null,
				}}
			>
				<AttendancePageClient
					initialFilters={
						options?.initialFilters ?? {
							from: '2026-02-23',
							to: '2026-03-01',
						}
					}
				/>
			</OrgProvider>
		</QueryClientProvider>,
	);
}

describe('AttendancePageClient', () => {
	const originalTimeZone = process.env.TZ;

	beforeEach(() => {
		process.env.TZ = 'America/Mexico_City';
		mockFetchAttendanceRecords.mockReset();
		mockFetchLocationsList.mockReset();
		mockFetchAttendanceRecords.mockResolvedValue({
			data: [],
			pagination: { total: 0, limit: 10, offset: 0 },
		});
		mockFetchLocationsList.mockResolvedValue({
			data: [],
			pagination: { total: 0, limit: 100, offset: 0 },
		});
	});

	afterEach(() => {
		if (originalTimeZone === undefined) {
			delete process.env.TZ;
			return;
		}
		process.env.TZ = originalTimeZone;
	});

	it('uses exact custom start/end dates when querying attendance records', async () => {
		renderAttendanceClient();

		await waitFor(() => {
			expect(mockFetchAttendanceRecords).toHaveBeenCalled();
		});

		const firstCall = mockFetchAttendanceRecords.mock.calls[0] as [
			{
				fromDate: Date;
				toDate: Date;
			},
		];

		expect(format(firstCall[0].fromDate, 'yyyy-MM-dd')).toBe('2026-02-23');
		expect(format(firstCall[0].toDate, 'yyyy-MM-dd')).toBe('2026-03-01');
	});

	it('preserves the deep-link timezone when parsing URL date keys', async () => {
		renderAttendanceClient({
			organizationTimeZone: 'America/Tijuana',
			initialFilters: {
				from: '2026-02-23',
				to: '2026-02-23',
				timeZone: 'America/Mexico_City',
			},
		});

		await waitFor(() => {
			expect(mockFetchAttendanceRecords).toHaveBeenCalled();
		});

		const firstCall = mockFetchAttendanceRecords.mock.calls[0] as [
			{
				fromDate: Date;
				toDate: Date;
			},
		];
		const expectedRange = getUtcDayRangeFromDateKey('2026-02-23', 'America/Mexico_City');

		expect(firstCall[0].fromDate.toISOString()).toBe(expectedRange.startUtc.toISOString());
		expect(firstCall[0].toDate.toISOString()).toBe(expectedRange.endUtc.toISOString());
	});

	it('renders attendance rows in the deep-link timezone used for filtering', async () => {
		mockFetchAttendanceRecords.mockResolvedValue({
			data: [
				{
					id: 'attendance-1',
					employeeId: 'EMP-001',
					employeeName: 'Ada Lovelace',
					deviceId: 'device-1',
					deviceLocationId: 'location-1',
					deviceLocationName: 'Oficina principal',
					timestamp: new Date('2026-02-22T16:30:00.000Z'),
					type: 'CHECK_IN',
					metadata: null,
					createdAt: new Date('2026-02-22T16:30:00.000Z'),
					updatedAt: new Date('2026-02-22T16:30:00.000Z'),
				},
			],
			pagination: { total: 1, limit: 10, offset: 0 },
		});

		renderAttendanceClient({
			organizationTimeZone: 'America/Mexico_City',
			initialFilters: {
				from: '2026-02-23',
				to: '2026-02-23',
				timeZone: 'Asia/Tokyo',
			},
		});

		expect(await screen.findByText('01:30:00')).toBeInTheDocument();
		expect((await screen.findAllByText('23/02/2026')).length).toBeGreaterThan(0);
		expect(screen.queryByText('10:30:00')).not.toBeInTheDocument();
		expect(screen.queryByText('22/02/2026')).not.toBeInTheDocument();
	});

	it('uses the organization timezone when fetching export records without a deep-link timezone', async () => {
		mockFetchAttendanceRecords.mockResolvedValue({
			data: [],
			pagination: { total: 1, limit: 100, offset: 0 },
		});

		renderAttendanceClient({
			organizationTimeZone: 'America/Tijuana',
			initialFilters: {
				from: '2026-02-23',
				to: '2026-02-23',
			},
		});

		await waitFor(() => {
			expect(mockFetchAttendanceRecords).toHaveBeenCalled();
		});

		const exportButton = screen.getByRole('button', { name: 'actions.exportCsv' });

		await waitFor(() => {
			expect(exportButton).toBeEnabled();
		});

		fireEvent.click(exportButton);

		await waitFor(() => {
			expect(
				mockFetchAttendanceRecords.mock.calls.some(
					([params]) => (params as { limit?: number }).limit === 100,
				),
			).toBe(true);
		});

		const exportCall = mockFetchAttendanceRecords.mock.calls.find(
			([params]) => (params as { limit?: number }).limit === 100,
		) as [
			{
				fromDate: Date;
				toDate: Date;
			},
		];
		const expectedRange = getUtcDayRangeFromDateKey('2026-02-23', 'America/Tijuana');

		expect(exportCall[0].fromDate.toISOString()).toBe(expectedRange.startUtc.toISOString());
		expect(exportCall[0].toDate.toISOString()).toBe(expectedRange.endUtc.toISOString());
	});

	it('builds preset date keys in the target timezone instead of the browser timezone', () => {
		const result = getPresetDateRangeKeys({
			preset: 'today',
			now: new Date('2026-02-22T16:30:00.000Z'),
			timeZone: 'Asia/Tokyo',
		});

		expect(result.startDateKey).toBe('2026-02-23');
		expect(result.endDateKey).toBe('2026-02-23');
	});

	it('renders attendance rows in the organization timezone when no deep-link timezone is provided', async () => {
		const attendanceRecord: AttendanceRecord = {
			id: 'attendance-1',
			employeeId: 'employee-1',
			employeeName: 'Ada Lovelace',
			deviceId: 'device-1',
			deviceLocationId: 'location-1',
			deviceLocationName: 'Lobby',
			timestamp: new Date('2026-02-22T15:30:00.000Z'),
			type: 'CHECK_IN',
			offsiteDateKey: null,
			offsiteDayKind: null,
			offsiteReason: null,
			offsiteCreatedByUserId: null,
			offsiteUpdatedByUserId: null,
			offsiteUpdatedAt: null,
			metadata: null,
			createdAt: new Date('2026-02-22T15:30:00.000Z'),
			updatedAt: new Date('2026-02-22T15:30:00.000Z'),
		};

		mockFetchAttendanceRecords.mockResolvedValue({
			data: [attendanceRecord],
			pagination: { total: 1, limit: 10, offset: 0 },
		});

		renderAttendanceClient({
			organizationTimeZone: 'Asia/Tokyo',
			initialFilters: {
				from: '2026-02-23',
				to: '2026-02-23',
			},
		});

		await waitFor(() => {
			expect(mockFetchAttendanceRecords).toHaveBeenCalled();
		});

		await waitFor(() => {
			expect(screen.getAllByText('23/02/2026').length).toBeGreaterThan(0);
		});

		expect(screen.getAllByText('00:30:00').length).toBeGreaterThan(0);
		expect(screen.queryByText('22/02/2026')).not.toBeInTheDocument();
		expect(screen.queryByText('15:30:00')).not.toBeInTheDocument();
	});
});
