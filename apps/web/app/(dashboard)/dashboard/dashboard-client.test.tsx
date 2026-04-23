// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '@/lib/query-keys';
import { getUtcDayRangeFromDateKey } from '@/lib/time-zone';
import { DashboardPageClient } from './dashboard-client';

const useQueryMock = vi.fn();
const useSuspenseQueryMock = vi.fn();
const useOrgContextMock = vi.fn();
const useIsMobileMock = vi.fn();
const useTourMock = vi.fn();
const fetchAttendanceTimelineMock = vi.fn();
const dashboardMapPropsSpy = vi.fn();

vi.mock('@tanstack/react-query', () => ({
	useQuery: (options: unknown) => useQueryMock(options),
	useSuspenseQuery: (options: unknown) => useSuspenseQueryMock(options),
}));

vi.mock('next/dynamic', () => ({
	default: () =>
		function MockDashboardMap(props: {
			focusedLocation?: { id: string } | null;
		}): React.ReactElement {
			dashboardMapPropsSpy(props);
			return (
				<div
					data-testid="dashboard-map"
					data-focused-location-id={props.focusedLocation?.id ?? ''}
				/>
			);
		},
}));

vi.mock('next-intl', () => ({
	useTranslations: () => {
		const translate = ((key: string, values?: Record<string, unknown>): string => {
			if (key === 'hero.eyebrow') {
				return `· ${values?.date ?? ''} · ${values?.time ?? ''} ·`;
			}

			if (key === 'hero.subtitle') {
				return `Visibilidad en tiempo real de ${values?.locations ?? 0} ubicaciones y ${values?.employees ?? 0} empleados.`;
			}

			if (key === 'locationRail.title') {
				return 'Por sucursal';
			}

			return key;
		}) as ((key: string, values?: Record<string, unknown>) => string) & {
			rich: (
				key: string,
				values: { em: (chunks: React.ReactNode) => React.ReactNode },
			) => React.ReactElement;
		};

		translate.rich = (_key, values) => (
			<>
				Todo el {values.em('jale')},
				<br />
				en un vistazo.
			</>
		);

		return translate;
	},
}));

vi.mock('@/lib/org-client-context', () => ({
	useOrgContext: () => useOrgContextMock(),
}));

vi.mock('@/hooks/use-mobile', () => ({
	useIsMobile: () => useIsMobileMock(),
}));

vi.mock('@/hooks/use-tour', () => ({
	useTour: (tourId: string) => useTourMock(tourId),
}));

vi.mock('@/lib/client-functions', async () => {
	const actual =
		await vi.importActual<typeof import('@/lib/client-functions')>('@/lib/client-functions');

	return {
		...actual,
		fetchAttendanceTimeline: (params?: {
			organizationId?: string | null;
			fromDate?: Date;
			toDate?: Date;
			limit?: number;
			offset?: number;
			kind?: 'in' | 'out' | 'late' | 'offsite';
		}) => fetchAttendanceTimelineMock(params),
	};
});

const now = new Date('2026-04-21T12:00:00.000Z');

/**
 * Creates the baseline query return values for the dashboard client.
 *
 * @returns Ordered useQuery payloads for the component render
 */
function createQueryResults(): Array<Record<string, unknown>> {
	return [
		{
			data: [
				{
					employeeId: 'emp-1',
					employeeName: 'Ada Lovelace',
					employeeCode: 'A001',
					deviceId: 'device-1',
					locationId: 'location-1',
					locationName: 'Matriz',
					checkedInAt: new Date('2026-04-21T08:00:00.000Z'),
				},
			],
			isFetching: false,
		},
		{
			data: { count: 1, data: [], dateKey: '2026-04-21' },
			isFetching: false,
		},
		{
			data: [
				{
					id: 'location-1',
					name: 'Matriz',
					code: 'MTZ',
					address: null,
					latitude: 19.4326,
					longitude: -99.1332,
					organizationId: 'org-1',
					geographicZone: 'GENERAL',
					timeZone: 'America/Mexico_City',
					createdAt: new Date('2026-01-01T00:00:00.000Z'),
					updatedAt: new Date('2026-01-01T00:00:00.000Z'),
				},
			],
			isFetching: false,
		},
		{
			data: {
				data: [
					{
						id: 'timeline-1',
						employeeId: 'emp-1',
						employeeName: 'Ada Lovelace',
						employeeCode: 'A001',
						locationId: 'location-1',
						locationName: 'Matriz',
						timestamp: '2026-04-21T08:00:00.000Z',
						type: 'CHECK_IN',
						isLate: false,
					},
				],
				lateTotal: 1,
			},
			isFetching: false,
		},
		{
			data: {
				data: [{ hour: 8, count: 1 }],
				date: '2026-04-21',
			},
			isFetching: false,
		},
		{
			data: [
				{
					id: 'device-1',
					code: 'DEV-001',
					name: 'Terminal principal',
					status: 'ONLINE',
					batteryLevel: 88,
					lastHeartbeat: '2026-04-21T11:55:00.000Z',
					locationId: 'location-1',
					locationName: 'Matriz',
				},
			],
			isFetching: false,
		},
		{
			data: {
				data: [
					{
						locationId: 'location-1',
						locationName: 'Matriz',
						temperature: 26,
						condition: 'clear',
						high: 30,
						low: 18,
						humidity: 35,
					},
				],
				cachedAt: '2026-04-21T12:00:00.000Z',
			},
			isFetching: false,
		},
		{
			data: new Map<string, number>([['location-1', 3]]),
			isFetching: false,
		},
	];
}

describe('DashboardPageClient', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(now);
		useOrgContextMock.mockReturnValue({
			organizationId: 'org-1',
			organizationTimeZone: 'America/Mexico_City',
		});
		useIsMobileMock.mockReturnValue(false);
		useSuspenseQueryMock.mockReturnValue({
			data: {
				employees: 12,
				devices: 4,
				locations: 1,
				organizations: 1,
				attendance: 9,
			},
			isFetching: false,
		});
		useQueryMock.mockReset();
		fetchAttendanceTimelineMock.mockReset();
		dashboardMapPropsSpy.mockReset();
		fetchAttendanceTimelineMock.mockResolvedValue({
			data: [],
			lateTotal: 0,
		});
	});

	it('renders the editorial dashboard sections', () => {
		useQueryMock
			.mockReturnValueOnce(createQueryResults()[0])
			.mockReturnValueOnce(createQueryResults()[1])
			.mockReturnValueOnce(createQueryResults()[2])
			.mockReturnValueOnce(createQueryResults()[3])
			.mockReturnValueOnce(createQueryResults()[4])
			.mockReturnValueOnce(createQueryResults()[5])
			.mockReturnValueOnce(createQueryResults()[6])
			.mockReturnValueOnce(createQueryResults()[7]);

		render(<DashboardPageClient />);

		expect(screen.getByTestId('dashboard-v2-hero')).toBeInTheDocument();
		expect(screen.getByTestId('dashboard-v2-map-card')).toBeInTheDocument();
		expect(screen.getByTestId('dashboard-v2-right-top-stack')).toHaveClass(
			'h-full',
			'grid-rows-[minmax(0,1fr)_minmax(0,1fr)]',
		);
		expect(screen.getByTestId('dashboard-v2-aux')).toHaveClass('h-full');
		expect(screen.getByTestId('dashboard-v2-aux')).toHaveClass('overflow-hidden');
		expect(screen.getByTestId('location-rail')).toBeInTheDocument();
		expect(screen.getAllByTestId('activity-timeline-pill')).toHaveLength(1);
		expect(screen.getByTestId('device-status-card')).toBeInTheDocument();
		expect(screen.getByTestId('weather-icon-cielo-claro')).toBeInTheDocument();
		expect(useTourMock).toHaveBeenCalledWith('dashboard');
	});

	it('builds the expected query keys for dashboard data', () => {
		useQueryMock
			.mockReturnValueOnce(createQueryResults()[0])
			.mockReturnValueOnce(createQueryResults()[1])
			.mockReturnValueOnce(createQueryResults()[2])
			.mockReturnValueOnce(createQueryResults()[3])
			.mockReturnValueOnce(createQueryResults()[4])
			.mockReturnValueOnce(createQueryResults()[5])
			.mockReturnValueOnce(createQueryResults()[6])
			.mockReturnValueOnce(createQueryResults()[7]);

		render(<DashboardPageClient />);

		const { startUtc, endUtc } = getUtcDayRangeFromDateKey('2026-04-21', 'America/Mexico_City');

		expect(useSuspenseQueryMock).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: queryKeys.dashboard.counts('org-1'),
			}),
		);
		expect(useQueryMock).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				queryKey: queryKeys.attendance.present({
					fromDate: startUtc,
					toDate: endUtc,
					organizationId: 'org-1',
				}),
			}),
		);
		expect(useQueryMock).toHaveBeenNthCalledWith(
			4,
			expect.objectContaining({
				queryKey: queryKeys.dashboard.timeline({
					organizationId: 'org-1',
					fromDate: startUtc,
					toDate: endUtc,
				}),
			}),
		);
		expect(useQueryMock).toHaveBeenNthCalledWith(
			5,
			expect.objectContaining({
				queryKey: queryKeys.dashboard.hourly({
					date: '2026-04-21',
					organizationId: 'org-1',
				}),
			}),
		);
		expect(useQueryMock).toHaveBeenNthCalledWith(
			8,
			expect.objectContaining({
				queryKey: queryKeys.dashboard.locationCapacity('org-1'),
			}),
		);
	});

	it('uses the organization timezone for dashboard day-scoped queries', () => {
		vi.setSystemTime(new Date('2026-04-21T02:30:00.000Z'));
		useQueryMock
			.mockReturnValueOnce(createQueryResults()[0])
			.mockReturnValueOnce(createQueryResults()[1])
			.mockReturnValueOnce(createQueryResults()[2])
			.mockReturnValueOnce(createQueryResults()[3])
			.mockReturnValueOnce(createQueryResults()[4])
			.mockReturnValueOnce(createQueryResults()[5])
			.mockReturnValueOnce(createQueryResults()[6])
			.mockReturnValueOnce(createQueryResults()[7]);

		render(<DashboardPageClient />);

		const { startUtc, endUtc } = getUtcDayRangeFromDateKey('2026-04-20', 'America/Mexico_City');

		expect(useQueryMock).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				queryKey: queryKeys.attendance.present({
					fromDate: startUtc,
					toDate: endUtc,
					organizationId: 'org-1',
				}),
			}),
		);
		expect(useQueryMock).toHaveBeenNthCalledWith(
			4,
			expect.objectContaining({
				queryKey: queryKeys.dashboard.timeline({
					organizationId: 'org-1',
					fromDate: startUtc,
					toDate: endUtc,
				}),
			}),
		);
		expect(useQueryMock).toHaveBeenNthCalledWith(
			5,
			expect.objectContaining({
				queryKey: queryKeys.dashboard.hourly({
					date: '2026-04-20',
					organizationId: 'org-1',
				}),
			}),
		);
	});

	it('propagates loading states to child cards', () => {
		useQueryMock
			.mockReturnValueOnce({ data: [], isFetching: true })
			.mockReturnValueOnce({
				data: { count: 0, data: [], dateKey: '2026-04-21' },
				isFetching: true,
			})
			.mockReturnValueOnce({ data: [], isFetching: true })
			.mockReturnValueOnce({ data: { data: [], lateTotal: 0 }, isFetching: true })
			.mockReturnValueOnce({ data: { data: [], date: '2026-04-21' }, isFetching: true })
			.mockReturnValueOnce({ data: [], isFetching: true })
			.mockReturnValueOnce({ data: { data: [], cachedAt: null }, isFetching: true })
			.mockReturnValueOnce({ data: new Map<string, number>(), isFetching: true });

		render(<DashboardPageClient />);

		const heroSection = screen.getByTestId('dashboard-v2-hero');
		expect(heroSection.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
		expect(screen.getAllByTestId('activity-timeline-skeleton').length).toBeGreaterThan(0);
		expect(screen.getByTestId('hourly-heatmap-loading')).toBeInTheDocument();
		expect(screen.getByTestId('device-status-card-loading')).toBeInTheDocument();
		expect(screen.getByTestId('location-rail-loading')).toBeInTheDocument();
		const weatherCard = screen.getByText('weather.title').closest('[data-slot="card"]');
		expect(weatherCard).not.toBeNull();
		expect(weatherCard?.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
	});

	it('collapses the location rail on mobile and expands it on demand', () => {
		useIsMobileMock.mockReturnValue(true);
		const queryResults = createQueryResults();
		let queryCallIndex = 0;

		useQueryMock.mockImplementation(() => {
			const result = queryResults[queryCallIndex % queryResults.length];
			queryCallIndex += 1;
			return result;
		});

		render(<DashboardPageClient />);

		const railToggle = screen.getByRole('button', { name: 'Por sucursal' });

		expect(screen.getByTestId('dashboard-v2-map-stage')).toHaveClass('h-[60vh]');
		expect(railToggle).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByTestId('location-rail')).not.toBeInTheDocument();

		fireEvent.click(railToggle);

		expect(railToggle).toHaveAttribute('aria-expanded', 'true');
		expect(screen.getByTestId('location-rail')).toBeInTheDocument();
	}, 15_000);

	it('refreshes the hero eyebrow clock while the dashboard stays open', () => {
		const queryResults = createQueryResults();
		let queryCallIndex = 0;
		const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
		const setIntervalSpy = vi.spyOn(window, 'setInterval');

		useQueryMock.mockImplementation(() => {
			const result = queryResults[queryCallIndex % queryResults.length];
			queryCallIndex += 1;
			return result;
		});

		render(<DashboardPageClient />);

		expect(screen.getByText(/06:00/)).toBeInTheDocument();

		const timeoutCallback = setTimeoutSpy.mock.calls[0]?.[0];
		expect(typeof timeoutCallback).toBe('function');

		vi.setSystemTime(new Date('2026-04-21T12:01:00.000Z'));

		act(() => {
			if (typeof timeoutCallback === 'function') {
				timeoutCallback();
			}
		});

		expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
		expect(screen.getByText(/06:01/)).toBeInTheDocument();
	});

	it('uses rail hover as the map focus fallback without overriding click selection', () => {
		const queryResults = createQueryResults();
		queryResults[2] = {
			data: [
				...(queryResults[2]?.data as Array<Record<string, unknown>>),
				{
					...(queryResults[2]?.data as Array<Record<string, unknown>>)[0],
					id: 'location-2',
					name: 'Sucursal Norte',
					code: 'NOR',
					latitude: 25.6866,
					longitude: -100.3161,
				},
			],
			isFetching: false,
		};
		queryResults[7] = {
			data: new Map<string, number>([
				['location-1', 3],
				['location-2', 5],
			]),
			isFetching: false,
		};

		let queryCallIndex = 0;

		useQueryMock.mockImplementation(() => {
			const result = queryResults[queryCallIndex % queryResults.length];
			queryCallIndex += 1;
			return result;
		});

		render(<DashboardPageClient />);

		const map = screen.getByTestId('dashboard-map');
		const hoveredLocation = screen.getByTestId('location-rail-item-location-2');
		const selectedLocation = screen.getByTestId('location-rail-item-location-1');

		expect(map).toHaveAttribute('data-focused-location-id', '');

		fireEvent.mouseEnter(hoveredLocation);

		expect(map).toHaveAttribute('data-focused-location-id', 'location-2');

		fireEvent.mouseLeave(hoveredLocation);

		expect(map).toHaveAttribute('data-focused-location-id', '');

		fireEvent.click(selectedLocation);

		expect(map).toHaveAttribute('data-focused-location-id', 'location-1');

		fireEvent.mouseEnter(hoveredLocation);

		expect(map).toHaveAttribute('data-focused-location-id', 'location-1');
	});

	it('refetches the dashboard timeline with the selected activity filter', async () => {
		const queryResults = createQueryResults();
		let queryCallIndex = 0;

		useQueryMock.mockImplementation(() => {
			const result = queryResults[queryCallIndex % queryResults.length];
			queryCallIndex += 1;
			return result;
		});

		render(<DashboardPageClient />);

		fireEvent.click(screen.getByRole('button', { name: 'filters.late' }));

		const { startUtc, endUtc } = getUtcDayRangeFromDateKey('2026-04-21', 'America/Mexico_City');
		const lateTimelineQuery = useQueryMock.mock.calls
			.map(
				([options]) =>
					options as { queryKey?: unknown[]; queryFn?: () => Promise<unknown> },
			)
			.find(
				(options) =>
					JSON.stringify(options.queryKey) ===
					JSON.stringify(
						queryKeys.dashboard.timeline({
							organizationId: 'org-1',
							fromDate: startUtc,
							toDate: endUtc,
							kind: 'late',
						}),
					),
			);

		expect(lateTimelineQuery).toBeDefined();
		await lateTimelineQuery?.queryFn?.();
		expect(fetchAttendanceTimelineMock).toHaveBeenCalledWith({
			organizationId: 'org-1',
			fromDate: startUtc,
			toDate: endUtc,
			kind: 'late',
		});

		fireEvent.click(screen.getByRole('button', { name: 'filters.checkIn' }));

		const inTimelineQuery = useQueryMock.mock.calls
			.map(
				([options]) =>
					options as { queryKey?: unknown[]; queryFn?: () => Promise<unknown> },
			)
			.find(
				(options) =>
					JSON.stringify(options.queryKey) ===
					JSON.stringify(
						queryKeys.dashboard.timeline({
							organizationId: 'org-1',
							fromDate: startUtc,
							toDate: endUtc,
							kind: 'in',
						}),
					),
			);

		expect(inTimelineQuery).toBeDefined();
		await inTimelineQuery?.queryFn?.();
		expect(fetchAttendanceTimelineMock).toHaveBeenCalledWith({
			organizationId: 'org-1',
			fromDate: startUtc,
			toDate: endUtc,
			kind: 'in',
		});

		fireEvent.click(screen.getByRole('button', { name: 'filters.checkOut' }));

		const outTimelineQuery = useQueryMock.mock.calls
			.map(
				([options]) =>
					options as { queryKey?: unknown[]; queryFn?: () => Promise<unknown> },
			)
			.find(
				(options) =>
					JSON.stringify(options.queryKey) ===
					JSON.stringify(
						queryKeys.dashboard.timeline({
							organizationId: 'org-1',
							fromDate: startUtc,
							toDate: endUtc,
							kind: 'out',
						}),
					),
			);

		expect(outTimelineQuery).toBeDefined();
		await outTimelineQuery?.queryFn?.();
		expect(fetchAttendanceTimelineMock).toHaveBeenCalledWith({
			organizationId: 'org-1',
			fromDate: startUtc,
			toDate: endUtc,
			kind: 'out',
		});
	});
});
