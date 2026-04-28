'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { ChevronDown, MapPin, Users } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTour } from '@/hooks/use-tour';
import {
	fetchAttendanceHourly,
	fetchAttendanceOffsiteToday,
	fetchAttendancePresent,
	fetchAttendanceStaffingCoverage,
	fetchAttendanceStaffingCoverageStats,
	fetchAttendanceTimeline,
	fetchDashboardCounts,
	fetchDashboardLocationCapacity,
	fetchDeviceStatusSummary,
	fetchLocationsAll,
	fetchWeather,
	type AttendancePresentRecord,
	type StaffingCoverageItem,
	type StaffingCoverageStatsItem,
	type StaffingCoverageStatsSummary,
	type Location,
} from '@/lib/client-functions';
import { useOrgContext } from '@/lib/org-client-context';
import { queryKeys } from '@/lib/query-keys';
import { DEFAULT_DASHBOARD_TIME_ZONE } from '@/lib/dashboard-time-zone';
import { getUtcDayRangeFromDateKey, toDateKeyInTimeZone } from '@/lib/time-zone';
import type { DashboardMapProps } from './dashboard-map';
import { ActivityTimeline } from './activity-timeline';
import { DeviceStatusCard } from './device-status-card';
import { HeroStatCard } from './hero-stat-card';
import { HourlyHeatmap } from './hourly-heatmap';
import { LocationRail } from './location-rail';
import { WeatherCard } from './weather-card';

const UNASSIGNED_LOCATION_KEY = 'unassigned';
type DashboardTimelineFilter = 'all' | 'in' | 'out' | 'late' | 'offsite';

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

interface LocationWithPresence extends Location {
	employeeCount: number;
	presentCount: number;
	selectionDisabled: boolean;
}

interface StaffingCoverageDisplayRow extends StaffingCoverageItem {
	stats: StaffingCoverageStatsItem | null;
}

/**
 * Builds a map of staffing coverage statistics keyed by requirement identifier.
 *
 * @param statsItems - Aggregate staffing coverage rows
 * @returns Statistics keyed by requirement id
 */
function buildStaffingStatsByRequirementId(
	statsItems: StaffingCoverageStatsItem[],
): Map<string, StaffingCoverageStatsItem> {
	return new Map(statsItems.map((item) => [item.requirementId, item]));
}

/**
 * Sorts daily staffing coverage rows for operations review.
 *
 * @param coverageItems - Daily staffing coverage items
 * @param statsByRequirementId - Aggregate statistics keyed by requirement id
 * @returns Coverage rows with aggregate statistics attached
 */
function buildStaffingCoverageRows(
	coverageItems: StaffingCoverageItem[],
	statsByRequirementId: Map<string, StaffingCoverageStatsItem>,
): StaffingCoverageDisplayRow[] {
	return coverageItems
		.map((item) => ({
			...item,
			stats: statsByRequirementId.get(item.requirementId) ?? null,
		}))
		.sort((left, right) => {
			if (left.isComplete !== right.isComplete) {
				return left.isComplete ? 1 : -1;
			}

			const locationCompare = (left.locationName ?? '').localeCompare(
				right.locationName ?? '',
				'es',
			);
			if (locationCompare !== 0) {
				return locationCompare;
			}

			return (left.jobPositionName ?? '').localeCompare(right.jobPositionName ?? '', 'es');
		});
}

/**
 * Formats a percentage value for compact dashboard display.
 *
 * @param value - Raw percentage value
 * @returns Rounded percentage label
 */
function formatCoveragePercent(value: number): string {
	return `${Math.round(value)}%`;
}

/**
 * Builds compact employee detail rows for a coverage requirement.
 *
 * @param row - Staffing coverage display row
 * @returns Employee detail rows to render
 */
function buildVisibleStaffingEmployees(
	row: StaffingCoverageDisplayRow,
): StaffingCoverageDisplayRow['employees'] {
	return [...row.employees].sort((left, right) => {
		if (left.status !== right.status) {
			return left.status === 'MISSING' ? -1 : 1;
		}

		return left.employeeName.localeCompare(right.employeeName, 'es-MX');
	});
}

/**
 * Formats a date key for compact Spanish dashboard display.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Localized date label or the original key when invalid
 */
function formatCoverageDateKey(dateKey: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
		return dateKey;
	}

	const date = new Date(`${dateKey}T00:00:00.000Z`);
	if (Number.isNaN(date.getTime())) {
		return dateKey;
	}

	return new Intl.DateTimeFormat('es-MX', {
		timeZone: 'UTC',
		day: '2-digit',
		month: 'short',
		year: 'numeric',
	}).format(date);
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
 * @param employeeCountByLocation - Active employee counts grouped by location
 * @param unassignedLocationLabel - Localized label for employees without location
 * @returns Locations augmented with dashboard summary counts
 */
function buildLocationPresenceRows(
	locations: Location[],
	presentByLocationId: Map<string, AttendancePresentRecord[]>,
	employeeCountByLocation: Map<string, number>,
	unassignedLocationLabel: string,
): LocationWithPresence[] {
	const rows = [...locations]
		.sort((left, right) => left.name.localeCompare(right.name, 'es'))
		.map((location) => {
			const presentCount = presentByLocationId.get(location.id)?.length ?? 0;
			const employeeCount = employeeCountByLocation.get(location.id) ?? 0;

			return {
				...location,
				employeeCount,
				presentCount,
				selectionDisabled: false,
			};
		});

	const unassignedPresentCount = presentByLocationId.get(UNASSIGNED_LOCATION_KEY)?.length ?? 0;
	const unassignedEmployeeCount = employeeCountByLocation.get(UNASSIGNED_LOCATION_KEY) ?? 0;

	if (unassignedPresentCount === 0 && unassignedEmployeeCount === 0) {
		return rows;
	}

	rows.push({
		id: UNASSIGNED_LOCATION_KEY,
		name: unassignedLocationLabel,
		code: '',
		address: null,
		latitude: null,
		longitude: null,
		organizationId: null,
		geographicZone: 'GENERAL',
		timeZone: DEFAULT_DASHBOARD_TIME_ZONE,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		employeeCount: unassignedEmployeeCount,
		presentCount: unassignedPresentCount,
		selectionDisabled: true,
	});

	return rows;
}

/**
 * Computes hero metrics from dashboard data sets.
 *
 * @param totalEmployees - Active employee total for the organization
 * @param presentCount - Employees currently present on-site
 * @param lateCount - Employees flagged as late today
 * @param offsiteCount - Employees working off-site today
 * @returns Hero summary counts for the editorial header
 */
function buildHeroStats(
	totalEmployees: number,
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
 * Renders the operational staffing coverage panel.
 *
 * @param props - Staffing coverage panel props
 * @returns Staffing coverage panel element
 */
function StaffingCoveragePanel({
	rows,
	summary,
	isLoading,
	isError,
}: {
	rows: StaffingCoverageDisplayRow[];
	summary: StaffingCoverageStatsSummary;
	isLoading: boolean;
	isError: boolean;
}): React.ReactElement {
	const t = useTranslations('Dashboard');

	return (
		<Card
			className="overflow-hidden rounded-[1.25rem] border-[color:var(--border-subtle)] py-0"
			data-testid="dashboard-staffing-coverage"
		>
			<CardHeader className="grid gap-3 border-b border-[color:var(--border-subtle)] px-5 py-4 min-[760px]:grid-cols-[minmax(0,1fr)_auto] min-[760px]:items-center">
				<div className="space-y-1">
					<p className="text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-[color:var(--accent-primary)]">
						{t('staffingCoverage.eyebrow')}
					</p>
					<CardTitle>{t('staffingCoverage.title')}</CardTitle>
				</div>
				<div className="grid grid-cols-3 gap-2 text-xs">
					<div className="rounded-md border border-[color:var(--border-subtle)] px-3 py-2">
						<p className="text-muted-foreground">
							{t('staffingCoverage.summary.complete')}
						</p>
						<p className="text-lg font-semibold">{summary.completeToday}</p>
					</div>
					<div className="rounded-md border border-[color:var(--border-subtle)] px-3 py-2">
						<p className="text-muted-foreground">
							{t('staffingCoverage.summary.incomplete')}
						</p>
						<p className="text-lg font-semibold">{summary.incompleteToday}</p>
					</div>
					<div className="rounded-md border border-[color:var(--border-subtle)] px-3 py-2">
						<p className="text-muted-foreground">
							{t('staffingCoverage.summary.average30d')}
						</p>
						<p className="text-lg font-semibold">
							{formatCoveragePercent(summary.averageCoveragePercent)}
						</p>
					</div>
				</div>
			</CardHeader>
			<CardContent className="p-0">
				{isLoading ? (
					<div
						className="space-y-2 p-5"
						data-testid="staffing-coverage-loading"
						role="status"
						aria-live="polite"
						aria-label={t('staffingCoverage.loading')}
					>
						<p className="text-sm text-muted-foreground">
							{t('staffingCoverage.loading')}
						</p>
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
					</div>
				) : isError ? (
					<p className="p-5 text-sm text-destructive">{t('staffingCoverage.error')}</p>
				) : rows.length === 0 ? (
					<p className="p-5 text-sm text-muted-foreground">
						{t('staffingCoverage.empty')}
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[760px] text-left text-sm">
							<thead className="border-b bg-muted/35 text-xs uppercase text-muted-foreground">
								<tr>
									<th className="px-4 py-2 font-medium">
										{t('staffingCoverage.table.location')}
									</th>
									<th className="px-4 py-2 font-medium">
										{t('staffingCoverage.table.jobPosition')}
									</th>
									<th className="px-4 py-2 font-medium">
										{t('staffingCoverage.table.arrivedMinimum')}
									</th>
									<th className="px-4 py-2 font-medium">
										{t('staffingCoverage.table.missing')}
									</th>
									<th className="px-4 py-2 font-medium">
										{t('staffingCoverage.table.employees')}
									</th>
									<th className="px-4 py-2 font-medium">
										{t('staffingCoverage.table.coverage')}
									</th>
									<th className="px-4 py-2 font-medium">
										{t('staffingCoverage.table.trend')}
									</th>
									<th className="px-4 py-2 font-medium">
										{t('staffingCoverage.table.status')}
									</th>
								</tr>
							</thead>
							<tbody className="divide-y">
								{rows.map((row) => {
									const visibleEmployees = buildVisibleStaffingEmployees(row);

									return (
										<tr key={row.requirementId} className="align-middle">
											<td className="px-4 py-2 font-medium">
												{row.locationName ??
													t('staffingCoverage.fallbackLocation')}
											</td>
											<td className="px-4 py-2">
												{row.jobPositionName ??
													t('staffingCoverage.fallbackJobPosition')}
											</td>
											<td className="px-4 py-2 tabular-nums">
												{t('staffingCoverage.values.arrivedMinimum', {
													arrived: row.arrivedCount,
													minimum: row.minimumRequired,
												})}
											</td>
											<td className="px-4 py-2">
												{row.missingCount > 0
													? t('staffingCoverage.values.missing', {
															count: row.missingCount,
														})
													: t('staffingCoverage.values.noMissing')}
											</td>
											<td className="px-4 py-2">
												{visibleEmployees.length === 0 ? (
													<span className="text-xs text-muted-foreground">
														{t('staffingCoverage.values.noEmployees')}
													</span>
												) : (
													<div className="flex max-w-[18rem] flex-wrap gap-1.5">
														{visibleEmployees.map((employee) => (
															<span
																key={employee.employeeId}
																className="inline-flex items-center gap-1 rounded-md border border-[color:var(--border-subtle)] px-2 py-1 text-xs"
															>
																<span className="max-w-[8rem] truncate font-medium">
																	{employee.employeeName}
																</span>
																<span className="text-muted-foreground">
																	{employee.status === 'ARRIVED'
																		? t(
																				'staffingCoverage.employeeStatus.arrived',
																			)
																		: t(
																				'staffingCoverage.employeeStatus.missing',
																			)}
																</span>
															</span>
														))}
													</div>
												)}
											</td>
											<td className="px-4 py-2 tabular-nums">
												{formatCoveragePercent(row.coveragePercent)}
											</td>
											<td className="px-4 py-2 text-xs text-muted-foreground">
												<div className="flex flex-wrap gap-2">
													<span>
														{t('staffingCoverage.values.streak', {
															days:
																row.stats
																	?.currentStreakIncompleteDays ??
																0,
														})}
													</span>
													<span>
														{row.stats?.lastIncompleteDateKey
															? t(
																	'staffingCoverage.values.lastIncomplete',
																	{
																		date: row.stats
																			.lastIncompleteDateKey
																			? formatCoverageDateKey(
																					row.stats
																						.lastIncompleteDateKey,
																				)
																			: '',
																	},
																)
															: t(
																	'staffingCoverage.values.noRecentIncomplete',
																)}
													</span>
												</div>
											</td>
											<td className="px-4 py-2">
												<Badge
													variant={
														row.isComplete ? 'success' : 'warning'
													}
												>
													{row.isComplete
														? t('staffingCoverage.status.complete')
														: t(
																'staffingCoverage.status.incomplete',
															)}
												</Badge>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</CardContent>
		</Card>
	);
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
	const [timelineFilter, setTimelineFilter] = useState<DashboardTimelineFilter>('all');
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
	const staffingLocationId = activeLocationId ?? undefined;

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
	const { data: employeeCountByLocationData, isFetching: isEmployeeCountsFetching } = useQuery({
		queryKey: queryKeys.dashboard.locationCapacity(organizationId),
		queryFn: () => fetchDashboardLocationCapacity({ organizationId: organizationId ?? null }),
		enabled: Boolean(organizationId),
	});
	const {
		data: staffingCoveragePayload,
		isFetching: isStaffingCoverageFetching,
		isError: isStaffingCoverageError,
	} = useQuery({
		queryKey: queryKeys.dashboard.staffingCoverage({
			date: todayDateKey,
			organizationId: organizationId ?? undefined,
			locationId: staffingLocationId,
		}),
		queryFn: () =>
			fetchAttendanceStaffingCoverage({
				date: todayDateKey,
				organizationId: organizationId ?? null,
				locationId: staffingLocationId,
			}),
		enabled: Boolean(organizationId),
	});
	const {
		data: staffingCoverageStatsPayload,
		isFetching: isStaffingCoverageStatsFetching,
		isError: isStaffingCoverageStatsError,
	} = useQuery({
		queryKey: queryKeys.dashboard.staffingCoverageStats({
			asOfDate: todayDateKey,
			days: 30,
			organizationId: organizationId ?? undefined,
			locationId: staffingLocationId,
		}),
		queryFn: () =>
			fetchAttendanceStaffingCoverageStats({
				days: 30,
				organizationId: organizationId ?? null,
				locationId: staffingLocationId,
			}),
		enabled: Boolean(organizationId),
	});
	const employeeCountByLocation = useMemo(
		() => employeeCountByLocationData ?? new Map<string, number>(),
		[employeeCountByLocationData],
	);
	const staffingStatsByRequirementId = useMemo(
		() => buildStaffingStatsByRequirementId(staffingCoverageStatsPayload?.data ?? []),
		[staffingCoverageStatsPayload?.data],
	);
	const staffingCoverageRows = useMemo(
		() =>
			buildStaffingCoverageRows(
				staffingCoveragePayload?.data ?? [],
				staffingStatsByRequirementId,
			),
		[staffingCoveragePayload?.data, staffingStatsByRequirementId],
	);
	const staffingCoverageSummary = staffingCoverageStatsPayload?.summary ?? {
		requirementsEvaluated: 0,
		completeToday: 0,
		incompleteToday: 0,
		averageCoveragePercent: 0,
		days: 30,
	};
	const isStaffingCoveragePanelLoading =
		isStaffingCoverageFetching || isStaffingCoverageStatsFetching;
	const isStaffingCoveragePanelError = isStaffingCoverageError || isStaffingCoverageStatsError;

	const presentByLocationId = useMemo(
		() => buildPresentByLocationId(presentRecords),
		[presentRecords],
	);
	const timelineEvents = timelinePayload?.data ?? [];
	const lateCount = timelinePayload?.lateTotal ?? 0;
	const locationRows = useMemo(
		() =>
			buildLocationPresenceRows(
				locations,
				presentByLocationId,
				employeeCountByLocation,
				t('locationRail.unassigned'),
			),
		[employeeCountByLocation, locations, presentByLocationId, t],
	);
	const activeLocation = useMemo(
		() => locationRows.find((location) => location.id === activeLocationId) ?? null,
		[activeLocationId, locationRows],
	);
	const hoveredLocation = useMemo(
		() => locationRows.find((location) => location.id === hoveredLocationId) ?? null,
		[hoveredLocationId, locationRows],
	);
	const focusedLocation = activeLocation ?? hoveredLocation;
	const offsiteCount = offsiteTodayData?.count ?? 0;
	const activeEmployeeTotal = useMemo(() => {
		return Array.from(employeeCountByLocation.values()).reduce(
			(total, value) => total + value,
			0,
		);
	}, [employeeCountByLocation]);
	const heroStats = useMemo(
		() => buildHeroStats(activeEmployeeTotal, presentRecords.length, lateCount, offsiteCount),
		[activeEmployeeTotal, lateCount, offsiteCount, presentRecords.length],
	);
	const mapLocations = useMemo(
		() =>
			locationRows.filter(
				(location) => location.latitude !== null && location.longitude !== null,
			),
		[locationRows],
	);
	const hasLocationSelection = activeLocation !== null;

	return (
		<div className="space-y-5 overflow-y-auto px-6 pb-8 pt-6" data-testid="dashboard-v2-layout">
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
							em: (chunks) => (
								<em className="text-[color:var(--accent-primary)] italic">
									{chunks}
								</em>
							),
						})}
					</h1>
					<p className="max-w-2xl text-sm text-muted-foreground">
						{t('hero.subtitle', {
							employees: activeEmployeeTotal,
							locations: counts.locations ?? locations.length,
						})}
					</p>
				</div>
				<div>
					<HeroStatCard
						onTime={heroStats.onTime}
						total={heroStats.total}
						late={heroStats.late}
						absent={heroStats.absent}
						offsite={heroStats.offsite}
						isLoading={
							isPresentFetching ||
							isOffsiteFetching ||
							isTimelineFetching ||
							isEmployeeCountsFetching
						}
					/>
				</div>
			</header>

			<div
				className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-[minmax(0,2.25fr)_minmax(320px,1fr)] grid-rows-[auto_28rem]'}`}
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
								focusedLocation={focusedLocation}
								presentByLocationId={presentByLocationId}
								employeeCountByLocation={employeeCountByLocation}
								isMobileLayout={isMobile}
							/>
						</div>
						<div className="pointer-events-none absolute inset-x-4 bottom-4">
							<div className="pointer-events-auto rounded-[0.75rem] border border-[color:var(--border-subtle)] bg-background/85 px-3 py-2 backdrop-blur">
								<HourlyHeatmap
									data={hourlyPayload?.data ?? []}
									isLoading={isHourlyFetching}
								/>
							</div>
						</div>
					</CardContent>
				</Card>

				<div
					className={
						isMobile
							? 'space-y-4'
							: 'grid h-full min-h-0 gap-4 grid-rows-[minmax(0,1fr)_minmax(0,1fr)]'
					}
					data-testid="dashboard-v2-right-top-stack"
				>
					{isMobile ? (
						<div className="space-y-3">
							<Button
								type="button"
								variant="outline"
								className="w-full justify-between rounded-2xl bg-[color:var(--bg-elevated)] shadow-[var(--shadow-sm)]"
								data-testid="location-rail-mobile-toggle"
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
									className="min-h-0"
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
							className="h-full min-h-0"
						/>
					)}

					<WeatherCard
						weather={weatherPayload?.data ?? []}
						isLoading={isWeatherFetching}
						className={isMobile ? undefined : 'h-full min-h-0'}
					/>
				</div>

				<div
					className={isMobile ? undefined : 'h-full min-h-0 overflow-hidden'}
					data-testid="dashboard-v2-timeline"
				>
					<ActivityTimeline
						events={timelineEvents}
						isLoading={isTimelineFetching}
						filter={timelineFilter}
						timeZone={dashboardTimeZone}
						onFilterChange={setTimelineFilter}
						className={isMobile ? undefined : 'h-full min-h-0'}
					/>
				</div>

				<div
					className={isMobile ? 'min-h-0' : 'h-full min-h-0 overflow-hidden'}
					data-testid="dashboard-v2-aux"
				>
					<DeviceStatusCard
						devices={deviceStatus}
						isLoading={isDeviceStatusFetching}
						className={isMobile ? undefined : 'h-full min-h-0'}
					/>
				</div>
			</div>

			<StaffingCoveragePanel
				rows={staffingCoverageRows}
				summary={staffingCoverageSummary}
				isLoading={isStaffingCoveragePanelLoading}
				isError={isStaffingCoveragePanelError}
			/>

			{!hasLocationSelection ? (
				<div
					className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
					data-testid="dashboard-v2-location-summary"
				>
					<MapPin className="h-4 w-4" />
					<span>{t('locationRail.title')}</span>
					<Badge variant="outline">
						{t('hero.subtitle', {
							employees: activeEmployeeTotal,
							locations: counts.locations ?? locations.length,
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
						{(activeLocation?.employeeCount ?? 0) > 0
							? `${activeLocation?.presentCount ?? 0}/${activeLocation?.employeeCount ?? 0}`
							: `${activeLocation?.presentCount ?? 0}`}
					</Badge>
				</div>
			)}
		</div>
	);
}
