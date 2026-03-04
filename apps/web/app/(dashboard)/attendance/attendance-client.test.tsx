import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrgProvider } from '@/lib/org-client-context';

import { AttendancePageClient } from './attendance-client';

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
 * @returns Render result
 */
function renderAttendanceClient(): ReturnType<typeof render> {
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
				}}
			>
				<AttendancePageClient
					initialFilters={{
						from: '2026-02-23',
						to: '2026-03-01',
					}}
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
});
