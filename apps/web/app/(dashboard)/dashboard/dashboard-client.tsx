'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { ChevronDown, MapPin, Users } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import { ThemeModeToggle } from '@/components/theme-mode-toggle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTour } from '@/hooks/use-tour';
import { fetchAllEmployeesPages } from '@/lib/fetch-all-employees';
import {
	fetchAttendanceHourly,
	fetchAttendanceOffsiteToday,
	fetchAttendancePresent,
	fetchAttendanceTimeline,
	fetchDashboardCounts,
	fetchDeviceStatusSummary,
	fetchEmployeesList,
	fetchLocationsAll,
	fetchWeather,
	type AttendancePresentRecord,
	type DashboardCounts,
	type Location,
} from '@/lib/client-functions';
import { useOrgContext } from '@/lib/org-client-context';
import { queryKeys } from '@/lib/query-keys';
import { getUtcDayRangeFromDateKey, toDateKeyInTimeZone } from '@/lib/time-zone';
import type { DashboardMapProps } from './dashboard-map';
import { ActivityTimeline } from './activity-timeline';
import { DeviceStatusCard } from './device-status-card';
import { HeroStatCard } from './hero-stat-card';
import { HourlyHeatmap } from './hourly-heatmap';
import { LocationRail } from './location-rail';
import { WeatherCard } from './weather-card';

const UNASSIGNED_LOCATION_KEY = 'unassigned';

/**
 * Loads the dashboard map component lazily.
 *
 * @returns Promise resolving to the dashboard map component
 */
const loadDashboardMap = async () => {
	const mapModule = await import('./dashboard-map');
	return mapModule.DashboardMap;
};

/**
 * Placeholder rendered while the dashboard map bundle loads.
 *
 * @returns Map placeholder block
 */
function DashboardMapFallback(): React.ReactElement {
	return <div className="absolute inset-0 bg-muted/20" />;
}

const DashboardMap = dynamic<DashboardMapProps>(loadDashboardMap, {
	ssr: false,
	loading: DashboardMapFallback,
});

const DEFAULT_DASHBOARD_TIME_ZONE = 'America/Mexico_City';

interface LocationWithPresence extends Location {
	employeeCount: number;
	presentCount: number;
}

/**
 * Groups present attendance records by location identifier.
 *
 * @param presentRecords - Current on-site attendance records
 * @returns Records keyed by location identifier
 */
function buildPresentByLocationId(
	presentRecords: AttendancePresentRecord[],
): Map<string, AttendancePresentRecord[]> {
	const groupedRecords = new Map<string, AttendancePresentRecord[]>();

	for (const record of presentRecords) {
		const key = record.locationId ?? UNASSIGNED_LOCATION_KEY;
		const existing = groupedRecords.get(key);

		if (existing) {
			existing.push(record);
			continue;
		}

		groupedRecords.set(key, [record]);
	}

	return groupedRecords;
}

/**
 * Derives location rail rows with present and assigned counts.
 *
 * @param locations - Available organization locations
 * @param presentByLocationId - Present records grouped by location
 * @returns Locations augmented with dashboard summary counts
 */
function buildLocationPresenceRows(
	locations: Location[],
	presentByLocationId: Map<string, AttendancePresentRecord[]>,
	employeeCountByLocation: Map<string, number>,
): LocationWithPresence[] {
	return [...locations]
		.sort((left, right) => left.name.localeCompare(right.name, 'es'))
		.map((location) => {
			const presentCount = presentByLocationId.get(location.id)?.length ?? 0;
			const employeeCount = employeeCountByLocation.get(location.id) ?? 0;

			return {
				...location,
				employeeCount,
				presentCount,
			};
		});
}

/**
 * Loads active employees and groups them by assigned location.
 *
 * @param organizationId - Active organization id
 * @returns Counts of active employees keyed by location id
 */
async function fetchActiveEmployeeCountsByLocation(
	organizationId: string | null,
): Promise<Map<string, number>> {
	if (!organizationId) {
		return new Map<string, number>();
	}

	const activeEmployees = await fetchAllEmployeesPages({
		fetchEmployees: fetchEmployeesList,
		params: {
			organizationId,
			status: 'ACTIVE' as const,
		},
	});

	return activeEmployees.reduce((countsByLocation, employee) => {
		if (!employee.locationId) {
			return countsByLocation;
		}

		const currentCount = countsByLocation.get(employee.locationId) ?? 0;
		countsByLocation.set(employee.locationId, currentCount + 1);
		return countsByLocation;
	}, new Map<string, number>());
}

/**
 * Computes hero metrics from dashboard data sets.
 *
 * @param counts - Dashboard aggregate counters
 * @param presentCount - Employees currently present on-site
 * @param lateCount - Employees flagged as late today
 * @param offsiteCount - Employees working off-site today
 * @returns Hero summary counts for the editorial header
 */
function buildHeroStats(
	counts: DashboardCounts,
	presentCount: number,
	lateCount: number,
	offsiteCount: number,
): {
	absent: number;
	late: number;
	offsite: number;
	onTime: number;
	total: number;
} {
	const totalEmployees = counts.employees ?? 0;
	const onTime = Math.max(presentCount - lateCount, 0);
	const absent = Math.max(totalEmployees - presentCount - offsiteCount, 0);

	return {
		absent,
		late: lateCount,
		offsite: offsiteCount,
		onTime,
		total: totalEmployees,
	};
}

/**
 * Builds the hero eyebrow date string in Spanish.
 *
 * @param now - Current client date
 * @param timeZone - Organization timezone
 * @returns Formatted date label
 */
function formatHeroDate(now: Date, timeZone: string): string {
	return new Intl.DateTimeFormat('es-MX', {
		timeZone,
		day: 'numeric',
		month: 'long',
	})
		.format(now)
		.replace(',', '');
}

/**
 * Builds the hero eyebrow time string in 24-hour format.
 *
 * @param now - Current client date
 * @param timeZone - Organization timezone
 * @returns Formatted time label
 */
function formatHeroTime(now: Date, timeZone: string): string {
	return new Intl.DateTimeFormat('es-MX', {
		timeZone,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	})
		.format(now)
		.replace('.', ':');
}

/**
 * Dashboard page client component using the Variant B editorial layout.
 *
 * @returns The redesigned dashboard page
 */
export function DashboardPageClient(): React.ReactElement {
	const { organizationId, organizationTimeZone } = useOrgContext();
	const t = useTranslations('Dashboard');
	const isMobile = useIsMobile();
	const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
	const [hoveredLocationId, setHoveredLocationId] = useState<string | null>(null);
	const [locationSearch, setLocationSearch] = useState<string>('');
	const [timelineFilter, setTimelineFilter] = useState<'all' | 'in' | 'late' | 'offsite'>(
		'all',
	);
	const [isMobileRailOpen, setIsMobileRailOpen] = useState<boolean>(false);

	useTour('dashboard');

	const [now, setNow] = useState<Date>(() => new Date());
	const dashboardTimeZone = organizationTimeZone ?? DEFAULT_DASHBOARD_TIME_ZONE;

	useEffect(() => {
		let intervalId: number | null = null;
		const updateNow = (): void => {
			setNow(new Date());
		};
		const timeoutDelayMs = 60_000 - (Date.now() % 60_000);
		const timeoutId = window.setTimeout(() => {
			updateNow();
			intervalId = window.setInterval(updateNow, 60_000);
		}, timeoutDelayMs);

		return () => {
			window.clearTimeout(timeoutId);
			if (intervalId !== null) {
				window.clearInterval(intervalId);
			}
		};
	}, []);
	const todayDateKey = useMemo(
		() => toDateKeyInTimeZone(now, dashboardTimeZone),
		[dashboardTimeZone, now],
	);
	const todayRange = useMemo(
		() => getUtcDayRangeFromDateKey(todayDateKey, dashboardTimeZone),
		[dashboardTimeZone, todayDateKey],
	);

	const { data: counts } = useSuspenseQuery({
		queryKey: queryKeys.dashboard.counts(organizationId),
		queryFn: () => fetchDashboardCounts({ organizationId }),
	});

	const { data: presentRecords = [], isFetching: isPresentFetching } = useQuery({
		queryKey: queryKeys.attendance.present({
			fromDate: todayRange.startUtc,
			toDate: todayRange.endUtc,
			organizationId: organizationId ?? undefined,
		}),
		queryFn: () =>
			fetchAttendancePresent({
				fromDate: todayRange.startUtc,
				toDate: todayRange.endUtc,
				organizationId: organizationId ?? null,
			}),
		enabled: Boolean(organizationId),
	});
	const { data: offsiteTodayData, isFetching: isOffsiteFetching } = useQuery({
		queryKey: queryKeys.attendance.offsiteToday({
			organizationId: organizationId ?? undefined,
		}),
		queryFn: () => fetchAttendanceOffsiteToday({ organizationId: organizationId ?? null }),
		enabled: Boolean(organizationId),
	});
	const { data: locations = [], isFetching: isLocationsFetching } = useQuery({
		queryKey: queryKeys.locations.allList(organizationId),
		queryFn: () => fetchLocationsAll({ organizationId }),
		enabled: Boolean(organizationId),
	});
	const timelineQueryKind = timelineFilter === 'all' ? undefined : timelineFilter;
	const { data: timelinePayload, isFetching: isTimelineFetching } = useQuery({
		queryKey: queryKeys.dashboard.timeline({
			organizationId: organizationId ?? undefined,
			fromDate: todayRange.startUtc,
			toDate: todayRange.endUtc,
			kind: timelineQueryKind,
		}),
		queryFn: () =>
			fetchAttendanceTimeline({
				organizationId: organizationId ?? null,
				fromDate: todayRange.startUtc,
				toDate: todayRange.endUtc,
				kind: timelineQueryKind,
			}),
		enabled: Boolean(organizationId),
	});
	const { data: hourlyPayload, isFetching: isHourlyFetching } = useQuery({
		queryKey: queryKeys.dashboard.hourly({
			organizationId: organizationId ?? undefined,
			date: todayDateKey,
		}),
		queryFn: () =>
			fetchAttendanceHourly({
				organizationId: organizationId ?? null,
				date: todayDateKey,
			}),
		enabled: Boolean(organizationId),
	});
	const { data: deviceStatus = [], isFetching: isDeviceStatusFetching } = useQuery({
		queryKey: queryKeys.dashboard.deviceStatus({
			organizationId: organizationId ?? undefined,
		}),
		queryFn: () => fetchDeviceStatusSummary({ organizationId: organizationId ?? null }),
		enabled: Boolean(organizationId),
	});
	const { data: weatherPayload, isFetching: isWeatherFetching } = useQuery({
		queryKey: queryKeys.dashboard.weather({
			organizationId: organizationId ?? undefined,
		}),
		queryFn: () => fetchWeather({ organizationId: organizationId ?? null }),
		enabled: Boolean(organizationId),
	});
	const { data: employeeCountByLocation = new Map<string, number>(), isFetching: isEmployeeCountsFetching } = useQuery({
		queryKey: queryKeys.dashboard.locationCapacity(organizationId),
		queryFn: () => fetchActiveEmployeeCountsByLocation(organizationId ?? null),
		enabled: Boolean(organizationId),
	});

	const presentByLocationId = useMemo(
		() => buildPresentByLocationId(presentRecords),
		[presentRecords],
	);
	const timelineEvents = timelinePayload?.data ?? [];
	const lateCount = timelinePayload?.lateTotal ?? 0;
	const locationRows = useMemo(
		() => buildLocationPresenceRows(locations, presentByLocationId, employeeCountByLocation),
		[employeeCountByLocation, locations, presentByLocationId],
	);
	const activeLocation = useMemo(
		() => locationRows.find((location) => location.id === activeLocationId) ?? null,
		[activeLocationId, locationRows],
	);
	const offsiteCount = offsiteTodayData?.count ?? 0;
	const heroStats = useMemo(
		() => buildHeroStats(counts, presentRecords.length, lateCount, offsiteCount),
		[counts, lateCount, offsiteCount, presentRecords.length],
	);
	const mapLocations = useMemo(
		() =>
			locationRows.filter(
				(location) => location.latitude !== null && location.longitude !== null,
			),
		[locationRows],
	);
	const hasLocationSelection = activeLocationId !== null;

	return (
		<div
			className="space-y-5 overflow-y-auto px-6 pb-8 pt-6"
			data-testid="dashboard-v2-layout"
		>
			<header
				className={`grid gap-5 border-b border-[color:var(--border-subtle)] pb-5 ${isMobile ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_auto]'}`}
				data-testid="dashboard-v2-hero"
			>
				<div className="space-y-3">
					<p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
						{t('hero.eyebrow', {
							date: formatHeroDate(now, dashboardTimeZone),
							time: formatHeroTime(now, dashboardTimeZone),
						})}
					</p>
					<h1 className="max-w-3xl whitespace-pre-line font-[var(--font-display)] text-[2.9rem] leading-none tracking-[-0.04em] sm:text-[3.5rem]">
						{t.rich('hero.title', {
							em: (chunks) => <em className="text-[color:var(--accent-primary)] italic">{chunks}</em>,
						})}
					</h1>
					<p className="max-w-2xl text-sm text-muted-foreground">
						{t('hero.subtitle', {
							employees: counts.employees ?? 0,
							locations: counts.locations ?? locationRows.length,
						})}
					</p>
				</div>
				<div className={`flex gap-3 ${isMobile ? 'flex-col' : 'items-start'}`}>
					<HeroStatCard
						onTime={heroStats.onTime}
						total={heroStats.total}
						late={heroStats.late}
						absent={heroStats.absent}
						offsite={heroStats.offsite}
						isLoading={
							isPresentFetching ||
							isOffsiteFetching ||
							isTimelineFetching
						}
					/>
					<ThemeModeToggle />
				</div>
			</header>

			<div
				className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-[minmax(0,2.25fr)_minmax(320px,1fr)]'}`}
				data-testid="dashboard-v2-grid"
			>
				<Card
					className="overflow-hidden rounded-[1.25rem] border-[color:var(--border-subtle)] py-0"
					data-testid="dashboard-v2-map-card"
				>
					<CardHeader className="space-y-3 border-b border-[color:var(--border-subtle)] px-5 py-5">
						<div className="space-y-1">
							<p className="text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-[color:var(--accent-primary)]">
								{t('mapCard.eyebrow')}
							</p>
							<CardTitle>{t('mapCard.title')}</CardTitle>
						</div>
						<div className="flex flex-wrap gap-2">
							<Badge variant="secondary">{t('mapCard.legend.active')}</Badge>
							<Badge variant="secondary">{t('mapCard.legend.idle')}</Badge>
							<Badge variant="secondary">{t('mapCard.legend.recent')}</Badge>
						</div>
					</CardHeader>
					<CardContent
						className={`relative p-0 ${isMobile ? 'h-[60vh] min-h-[28rem]' : 'h-[32rem]'}`}
						data-testid="dashboard-v2-map-stage"
					>
						<div className="absolute inset-0">
							<DashboardMap
								locations={mapLocations}
								focusedLocation={activeLocation}
								presentByLocationId={presentByLocationId}
								employeeCountByLocation={employeeCountByLocation}
								isMobileLayout={isMobile}
							/>
						</div>
						<div className="pointer-events-none absolute inset-x-4 bottom-4">
							<div className="pointer-events-auto rounded-[1rem] border border-[color:var(--border-subtle)] bg-background/90 p-4 backdrop-blur">
								<HourlyHeatmap
									data={hourlyPayload?.data ?? []}
									isLoading={isHourlyFetching}
								/>
							</div>
						</div>
					</CardContent>
				</Card>

				<div data-testid="dashboard-v2-location-rail">
					{isMobile ? (
						<div className="space-y-3">
							<Button
								type="button"
								variant="outline"
								className="w-full justify-between rounded-2xl bg-[color:var(--bg-elevated)] shadow-[var(--shadow-sm)]"
								aria-expanded={isMobileRailOpen}
								onClick={() => setIsMobileRailOpen((currentValue) => !currentValue)}
							>
								<span>{t('locationRail.title')}</span>
								<ChevronDown
									className={`h-4 w-4 transition-transform ${isMobileRailOpen ? 'rotate-180' : ''}`}
								/>
							</Button>
							{isMobileRailOpen ? (
								<LocationRail
									locations={locationRows}
									activeLocationId={activeLocationId}
									hoveredLocationId={hoveredLocationId}
									onLocationClick={(locationId: string) => {
										setActiveLocationId((currentLocationId) =>
											currentLocationId === locationId ? null : locationId,
										);
									}}
									onLocationHover={setHoveredLocationId}
									isLoading={isLocationsFetching || isEmployeeCountsFetching}
									search={locationSearch}
									onSearchChange={setLocationSearch}
								/>
							) : null}
						</div>
					) : (
						<LocationRail
							locations={locationRows}
							activeLocationId={activeLocationId}
							hoveredLocationId={hoveredLocationId}
							onLocationClick={(locationId: string) => {
								setActiveLocationId((currentLocationId) =>
									currentLocationId === locationId ? null : locationId,
								);
							}}
							onLocationHover={setHoveredLocationId}
							isLoading={isLocationsFetching || isEmployeeCountsFetching}
							search={locationSearch}
							onSearchChange={setLocationSearch}
						/>
					)}
				</div>

				<div data-testid="dashboard-v2-timeline">
					<ActivityTimeline
						events={timelineEvents}
						isLoading={isTimelineFetching}
						filter={timelineFilter}
						timeZone={dashboardTimeZone}
						onFilterChange={setTimelineFilter}
					/>
				</div>

				<div className="grid gap-4" data-testid="dashboard-v2-aux">
					<DeviceStatusCard
						devices={deviceStatus}
						isLoading={isDeviceStatusFetching}
					/>
					<WeatherCard
						weather={weatherPayload?.data ?? []}
						isLoading={isWeatherFetching}
					/>
				</div>
			</div>

			{!hasLocationSelection ? (
				<div
					className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
					data-testid="dashboard-v2-location-summary"
				>
					<MapPin className="h-4 w-4" />
					<span>{t('locationRail.title')}</span>
					<Badge variant="outline">
						{t('hero.subtitle', {
							employees: counts.employees ?? 0,
							locations: locationRows.length,
						})}
					</Badge>
				</div>
			) : (
				<div
					className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
					data-testid="dashboard-v2-location-summary"
				>
					<Users className="h-4 w-4" />
					<span>{activeLocation?.name}</span>
					<Badge variant="outline">
						{`${activeLocation?.presentCount ?? 0}/${activeLocation?.employeeCount ?? 0}`}
					</Badge>
				</div>
			)}
		</div>
	);
}
