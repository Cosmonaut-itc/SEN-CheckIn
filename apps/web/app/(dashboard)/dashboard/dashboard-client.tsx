'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { endOfDay, formatDistanceToNowStrict, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import {
	Building2,
	Briefcase,
	MapPin,
	RefreshCw,
	Search,
	Smartphone,
	Users,
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import { useIsMobile } from '@/hooks/use-mobile';
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardMapProps } from './dashboard-map';
import {
	fetchAttendancePresent,
	fetchAttendanceOffsiteToday,
	fetchDashboardCounts,
	fetchLocationsAll,
	type AttendanceRecord,
	type AttendancePresentRecord,
} from '@/lib/client-functions';
import { queryKeys } from '@/lib/query-keys';
import { useOrgContext } from '@/lib/org-client-context';

const UNASSIGNED_LOCATION_KEY = 'unassigned';
/**
 * Loads the dashboard map section lazily.
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
 * @returns The map placeholder element
 */
function DashboardMapFallback(): React.ReactElement {
	return <div className="absolute inset-0 bg-muted/10" />;
}

const DashboardMap = dynamic<DashboardMapProps>(loadDashboardMap, {
	ssr: false,
	loading: DashboardMapFallback,
});

/**
 * Metric configuration for the insights bar.
 */
interface MetricConfig {
	label: string;
	value: number;
	icon: React.ComponentType<{ className?: string }>;
	cardClassName: string;
	iconClassName: string;
	valueClassName: string;
}

/**
 * Renders a compact dashboard metric card.
 *
 * @param props - Metric configuration and loading state.
 * @returns The metric card element.
 */
function DashboardMetricCard({
	metric,
	isLoading,
}: {
	metric: MetricConfig;
	isLoading: boolean;
}): React.ReactElement {
	return (
		<Card
			className={`min-w-[9rem] gap-3 border-transparent py-4 ${metric.cardClassName}`}
		>
			<CardContent className="flex items-start gap-3 px-4">
				<div
					className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${metric.iconClassName}`}
				>
					<metric.icon className="h-4 w-4" />
				</div>
				<div className="min-w-0 space-y-1">
					<p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
					{isLoading ? (
						<Skeleton className="h-6 w-14" />
					) : (
						<p className={`text-2xl font-semibold leading-none ${metric.valueClassName}`}>
							{metric.value.toLocaleString()}
						</p>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

/**
 * Builds a two-letter initials string for avatar fallbacks.
 *
 * @param name - Employee name or identifier.
 * @returns Uppercase initials string.
 */
function getEmployeeInitials(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) {
		return '';
	}
	const parts = trimmed.split(/\s+/).filter(Boolean);
	const first = parts[0]?.[0] ?? '';
	const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
	return `${first}${second}`.toUpperCase();
}

/**
 * Dashboard page client component.
 *
 * Uses useSuspenseQuery to consume prefetched data from the server,
 * enabling streaming SSR with React Query.
 *
 * @returns The dashboard map page JSX element.
 */
export function DashboardPageClient(): React.ReactElement {
	const { organizationId } = useOrgContext();
	const t = useTranslations('Dashboard');
	const isMobile = useIsMobile();
	const { data: counts, isFetching: isCountsFetching } = useSuspenseQuery({
		queryKey: queryKeys.dashboard.counts(organizationId),
		queryFn: () => fetchDashboardCounts({ organizationId }),
	});
	const [locationSearch, setLocationSearch] = useState<string>('');
	const [focusedLocationId, setFocusedLocationId] = useState<string | null>(null);
	const todayRange = useMemo(() => {
		const now = new Date();
		return {
			fromDate: startOfDay(now),
			toDate: endOfDay(now),
		};
	}, []);
	const presenceQueryKey = useMemo(
		() => ({
			fromDate: todayRange.fromDate,
			toDate: todayRange.toDate,
			organizationId: organizationId ?? undefined,
		}),
		[organizationId, todayRange],
	);
	const {
		data: presentRecords = [],
		isFetching: isPresentFetching,
		refetch: refetchPresent,
	} = useQuery({
		queryKey: queryKeys.attendance.present(presenceQueryKey),
		queryFn: () =>
			fetchAttendancePresent({
				fromDate: todayRange.fromDate,
				toDate: todayRange.toDate,
				organizationId: organizationId ?? null,
			}),
		enabled: Boolean(organizationId),
	});
	const {
		data: offsiteTodayData,
		isFetching: isOffsiteFetching,
		refetch: refetchOffsiteToday,
	} = useQuery({
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
	const offsiteTodayRecords = (offsiteTodayData?.data ?? []) as AttendanceRecord[];

	const presentByLocationId = useMemo(() => {
		const groups = new Map<string, AttendancePresentRecord[]>();

		presentRecords.forEach((record) => {
			const key = record.locationId ?? UNASSIGNED_LOCATION_KEY;
			const existing = groups.get(key);
			if (existing) {
				existing.push(record);
				return;
			}
			groups.set(key, [record]);
		});

		groups.forEach((records) => {
			records.sort(
				(a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime(),
			);
		});

		return groups;
	}, [presentRecords]);

	const sortedLocations = useMemo(
		() => [...locations].sort((a, b) => a.name.localeCompare(b.name, 'es')),
		[locations],
	);

	const locationsWithCoords = useMemo(
		() =>
			sortedLocations.filter(
				(location) => location.latitude !== null && location.longitude !== null,
			),
		[sortedLocations],
	);

	const locationsWithoutCoords = useMemo(
		() =>
			sortedLocations.filter(
				(location) => location.latitude === null || location.longitude === null,
			),
		[sortedLocations],
	);

	const searchTerm = locationSearch.trim().toLowerCase();
	const filteredWithCoords = useMemo(
		() =>
			locationsWithCoords.filter((location) => {
				if (!searchTerm) return true;
				return (
					location.name.toLowerCase().includes(searchTerm) ||
					location.code.toLowerCase().includes(searchTerm) ||
					(location.address ?? '').toLowerCase().includes(searchTerm)
				);
			}),
		[locationsWithCoords, searchTerm],
	);

	const filteredWithoutCoords = useMemo(
		() =>
			locationsWithoutCoords.filter((location) => {
				if (!searchTerm) return true;
				return (
					location.name.toLowerCase().includes(searchTerm) ||
					location.code.toLowerCase().includes(searchTerm) ||
					(location.address ?? '').toLowerCase().includes(searchTerm)
				);
			}),
		[locationsWithoutCoords, searchTerm],
	);

	const unassignedPresent = presentByLocationId.get(UNASSIGNED_LOCATION_KEY) ?? [];
	const totalPresent = presentRecords.length;
	const activeLocations = useMemo(() => {
		let count = 0;
		presentByLocationId.forEach((records, key) => {
			if (key !== UNASSIGNED_LOCATION_KEY && records.length > 0) {
				count += 1;
			}
		});
		return count;
	}, [presentByLocationId]);

	const focusedLocation = useMemo(
		() => locationsWithCoords.find((location) => location.id === focusedLocationId) ?? null,
		[locationsWithCoords, focusedLocationId],
	);

	const metrics = useMemo<MetricConfig[]>(
		() => [
			{
				label: t('map.metrics.present'),
				value: totalPresent,
				icon: Users,
				cardClassName: 'bg-[var(--status-success-bg)]',
				iconClassName: 'bg-background text-[var(--status-success)]',
				valueClassName: 'text-[var(--status-success)]',
			},
			{
				label: t('map.metrics.locations'),
				value: counts.locations ?? 0,
				icon: MapPin,
				cardClassName: 'bg-[var(--status-info-bg)]',
				iconClassName: 'bg-background text-[var(--status-info)]',
				valueClassName: 'text-[var(--status-info)]',
			},
			{
				label: t('map.metrics.employees'),
				value: counts.employees ?? 0,
				icon: Users,
				cardClassName: 'bg-[var(--accent-primary-bg)]',
				iconClassName: 'bg-background text-[var(--accent-primary)]',
				valueClassName: 'text-[var(--accent-primary)]',
			},
			{
				label: t('map.metrics.devices'),
				value: counts.devices ?? 0,
				icon: Smartphone,
				cardClassName: 'bg-[var(--accent-secondary-bg)]',
				iconClassName: 'bg-background text-[var(--accent-secondary)]',
				valueClassName: 'text-[var(--accent-secondary)]',
			},
			{
				label: t('map.metrics.organizations'),
				value: counts.organizations ?? 0,
				icon: Building2,
				cardClassName: 'bg-[var(--accent-tertiary-bg)]',
				iconClassName: 'bg-background text-[var(--accent-tertiary)]',
				valueClassName: 'text-[var(--accent-tertiary)]',
			},
		],
		[counts, t, totalPresent],
	);

	/**
	 * Refetches the presence records for the current date range.
	 *
	 * @returns void
	 */
	const handlePresenceRefresh = useCallback((): void => {
		void refetchPresent();
		void refetchOffsiteToday();
	}, [refetchOffsiteToday, refetchPresent]);

	/**
	 * Focuses the map on a selected location from the sidebar.
	 *
	 * @param locationId - Identifier of the location to focus.
	 * @returns void
	 */
	const handleLocationFocus = useCallback((locationId: string): void => {
		setFocusedLocationId(locationId);
	}, []);

	/**
	 * Updates the location search input value.
	 *
	 * @param event - Input change event.
	 * @returns void
	 */
	const handleLocationSearchChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>): void => {
			setLocationSearch(event.target.value);
		},
		[],
	);

	const actions = (
		<div
			data-testid="dashboard-actions"
			className={
				isMobile ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-2'
			}
		>
			<Button
				data-testid="dashboard-refresh-button"
				variant="outline"
				onClick={handlePresenceRefresh}
				disabled={isPresentFetching}
				className={isMobile ? 'min-h-11 w-full justify-center' : 'min-h-11'}
			>
				<RefreshCw
					className={`mr-2 h-4 w-4 ${isPresentFetching ? 'animate-spin' : ''}`}
				/>
				{t('map.actions.refresh')}
			</Button>
			<Button
				asChild
				variant="secondary"
				className={isMobile ? 'min-h-11 w-full justify-center' : 'min-h-11'}
			>
				<Link href="/locations" data-testid="dashboard-locations-button">
					{t('map.actions.locations')}
				</Link>
			</Button>
		</div>
	);

	const summaryCard = (
		<Card
			data-testid="dashboard-summary-card"
			className="gap-4 border-[color:var(--border-subtle)] bg-background/95 py-5 shadow-[var(--shadow-md)]"
		>
			<CardContent className="flex flex-col gap-4 px-5">
				<div className="space-y-1">
					<p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
						{t('map.title')}
					</p>
					<p className="text-lg font-semibold leading-tight">{t('map.subtitle')}</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="secondary">
						{t('map.panel.activeLocations', { count: activeLocations })}
					</Badge>
					<Badge variant="outline">
						{t('map.panel.subtitle', {
							locations: locations.length,
							present: totalPresent,
						})}
					</Badge>
				</div>
			</CardContent>
		</Card>
	);

	const statsStrip = (
		<section data-testid="dashboard-stats-strip" className="overflow-x-auto pb-1">
			<div className="flex w-max min-w-full gap-3">
				{metrics.map((metric) => (
					<DashboardMetricCard
						key={metric.label}
						metric={metric}
						isLoading={isCountsFetching}
					/>
				))}
			</div>
		</section>
	);

	const locationsPanelHeader = (
		<div className="border-b p-4">
			<div className="flex flex-col gap-3">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<p className="text-sm font-semibold">{t('map.panel.title')}</p>
						<p className="text-xs text-muted-foreground">
							{t('map.panel.subtitle', {
								locations: locations.length,
								present: totalPresent,
							})}
						</p>
					</div>
					<Badge variant="secondary">
						{t('map.panel.activeLocations', { count: activeLocations })}
					</Badge>
				</div>
				<div className="relative">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						data-testid="dashboard-locations-search"
						value={locationSearch}
						onChange={handleLocationSearchChange}
						placeholder={t('map.search.placeholder')}
						aria-label={t('map.search.placeholder')}
						className="min-h-11 w-full pl-9"
					/>
				</div>
			</div>
		</div>
	);

	const locationsPanelContent = (
		<div className="space-y-6 p-4">
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{t('map.sections.withCoords')}
					</p>
					<Badge variant="secondary">{filteredWithCoords.length}</Badge>
				</div>
				{isLocationsFetching && locations.length === 0 ? (
					<div className="space-y-2">
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
					</div>
				) : filteredWithCoords.length === 0 ? (
					<p className="text-sm text-muted-foreground">{t('map.empty.withCoords')}</p>
				) : (
					<Accordion type="multiple" className="space-y-2">
						{filteredWithCoords.map((location) => {
							const present = presentByLocationId.get(location.id) ?? [];
							const presentCount = present.length;
							return (
								<AccordionItem
									key={location.id}
									value={location.id}
									className="rounded-xl border bg-background/80 px-1"
								>
									<AccordionTrigger
										onClick={() => handleLocationFocus(location.id)}
										className="px-4 text-left"
									>
										<div className="flex w-full items-start pr-6">
											<div className="min-w-0 flex-1 space-y-0.5">
												<div className="flex items-start gap-2">
													<p className="m-0 flex-1 break-words text-left text-sm font-medium whitespace-normal">
														{location.name}
													</p>
													<Badge
														variant="secondary"
														className="shrink-0"
													>
														{presentCount}
													</Badge>
												</div>
												<p className="m-0 text-xs text-muted-foreground">
													{location.code}
												</p>
											</div>
										</div>
									</AccordionTrigger>
									<AccordionContent className="px-4">
										{presentCount === 0 ? (
											<p className="text-sm text-muted-foreground">
												{t('map.empty.present')}
											</p>
										) : (
											<div className="space-y-3">
												{present.map((record) => {
													const displayName =
														record.employeeName ||
														record.employeeCode;
													const initials = getEmployeeInitials(
														displayName,
													);
													const relativeTime =
														formatDistanceToNowStrict(
															new Date(record.checkedInAt),
															{
																addSuffix: false,
																locale: es,
															},
														);
													return (
														<div
															key={`${record.employeeId}-${record.checkedInAt}`}
															className="flex items-center justify-between gap-3"
														>
															<div className="flex items-center gap-3">
																<Avatar className="h-7 w-7">
																	<AvatarFallback>
																		{initials ||
																			t(
																				'map.popup.fallbackInitials',
																			)}
																	</AvatarFallback>
																</Avatar>
																<div>
																	<p className="text-sm font-medium">
																		{displayName}
																	</p>
																	<p className="text-xs text-muted-foreground">
																		{record.employeeCode}
																	</p>
																</div>
															</div>
															<span className="text-xs text-muted-foreground">
																{t('map.popup.timeAgo', {
																	time: relativeTime,
																})}
															</span>
														</div>
													);
												})}
											</div>
										)}
									</AccordionContent>
								</AccordionItem>
							);
						})}
					</Accordion>
				)}
			</div>

			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{t('map.sections.withoutCoords')}
					</p>
					<Badge variant="secondary">{filteredWithoutCoords.length}</Badge>
				</div>
				{filteredWithoutCoords.length === 0 ? (
					<p className="text-sm text-muted-foreground">{t('map.empty.withoutCoords')}</p>
				) : (
					<Accordion type="multiple" className="space-y-2">
						{filteredWithoutCoords.map((location) => {
							const present = presentByLocationId.get(location.id) ?? [];
							return (
								<AccordionItem
									key={location.id}
									value={location.id}
									className="rounded-xl border bg-background/80 px-1"
								>
									<AccordionTrigger className="px-4 text-left">
										<div className="flex w-full items-start pr-6">
											<div className="min-w-0 flex-1 space-y-0.5">
												<div className="flex items-start gap-2">
													<p className="m-0 flex-1 break-words text-left text-sm font-medium whitespace-normal">
														{location.name}
													</p>
													<Badge
														variant="secondary"
														className="shrink-0"
													>
														{present.length}
													</Badge>
												</div>
												<p className="m-0 text-xs text-muted-foreground">
													{location.code}
												</p>
											</div>
										</div>
									</AccordionTrigger>
									<AccordionContent className="px-4">
										<div className="space-y-3">
											{present.length === 0 ? (
												<p className="text-sm text-muted-foreground">
													{t('map.empty.present')}
												</p>
											) : (
												<div className="space-y-2">
													{present.map((record) => {
														const displayName =
															record.employeeName ||
															record.employeeCode;
														const initials = getEmployeeInitials(
															displayName,
														);
														return (
															<div
																key={`${record.employeeId}-${record.checkedInAt}`}
																className="flex items-center gap-3"
															>
																<Avatar className="h-7 w-7">
																	<AvatarFallback>
																		{initials ||
																			t(
																				'map.popup.fallbackInitials',
																			)}
																	</AvatarFallback>
																</Avatar>
																<div>
																	<p className="text-sm font-medium">
																		{displayName}
																	</p>
																	<p className="text-xs text-muted-foreground">
																		{record.employeeCode}
																	</p>
																</div>
															</div>
														);
													})}
												</div>
											)}
											<Button asChild variant="outline" size="sm" className="min-h-11">
												<Link href={`/locations?edit=${location.id}`}>
													{t('map.actions.editLocation')}
												</Link>
											</Button>
										</div>
									</AccordionContent>
								</AccordionItem>
							);
						})}
					</Accordion>
				)}
			</div>

			{unassignedPresent.length > 0 && (
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{t('map.sections.unassigned')}
						</p>
						<Badge variant="secondary">{unassignedPresent.length}</Badge>
					</div>
					<div className="space-y-2 rounded-xl border bg-background/80 p-3">
						{unassignedPresent.map((record) => {
							const displayName = record.employeeName || record.employeeCode;
							const initials = getEmployeeInitials(displayName);
							return (
								<div
									key={`${record.employeeId}-${record.checkedInAt}`}
									className="flex items-center gap-3"
								>
									<Avatar className="h-7 w-7">
										<AvatarFallback>
											{initials || t('map.popup.fallbackInitials')}
										</AvatarFallback>
									</Avatar>
									<div>
										<p className="text-sm font-medium">{displayName}</p>
										<p className="text-xs text-muted-foreground">
											{record.employeeCode}
										</p>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}

			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{t('map.sections.offsiteToday')}
					</p>
					<Badge variant="secondary">{offsiteTodayRecords.length}</Badge>
				</div>
				{isOffsiteFetching ? (
					<div className="space-y-2">
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
					</div>
				) : offsiteTodayRecords.length === 0 ? (
					<p className="text-sm text-muted-foreground">{t('map.empty.offsite')}</p>
				) : (
					<div className="space-y-2 rounded-xl border bg-background/80 p-3">
						{offsiteTodayRecords.map((record) => {
							const displayName = record.employeeName || record.employeeId;
							const initials = getEmployeeInitials(displayName);
							const dayKindLabel =
								record.offsiteDayKind === 'NO_LABORABLE'
									? t('map.offsite.dayKind.noLaborable')
									: t('map.offsite.dayKind.laborable');
							return (
								<div
									key={record.id}
									className="flex items-center justify-between gap-3"
								>
									<div className="flex items-center gap-3">
										<Avatar className="h-7 w-7">
											<AvatarFallback>
												{initials || t('map.popup.fallbackInitials')}
											</AvatarFallback>
										</Avatar>
										<div>
											<p className="text-sm font-medium">{displayName}</p>
											<p className="text-xs text-muted-foreground">
												{record.employeeId}
											</p>
										</div>
									</div>
									<Badge variant="outline" className="gap-1">
										<Briefcase className="h-3.5 w-3.5" />
										{dayKindLabel}
									</Badge>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);

	if (isMobile) {
		return (
			<div className="-m-6 pb-8">
				<section
					data-testid="dashboard-map-hero"
					className="relative h-[60vh] min-h-[26rem] overflow-hidden border-b border-[color:var(--border-subtle)] bg-muted/20"
				>
					<DashboardMap
						locations={locationsWithCoords}
						focusedLocation={focusedLocation}
						presentByLocationId={presentByLocationId}
						isMobileLayout
					/>
				</section>

				<div className="space-y-4 px-4 pt-4 sm:px-6">
					{statsStrip}
					{summaryCard}
					{actions}

					<section
						data-testid="dashboard-locations-panel"
						className="overflow-hidden rounded-2xl border bg-background/95 shadow-[var(--shadow-md)]"
					>
						{locationsPanelHeader}
						{locationsPanelContent}
					</section>
				</div>
			</div>
		);
	}

	return (
		<div className="relative -m-6 h-[calc(100vh-3.5rem)] min-h-[32rem]">
			<DashboardMap
				locations={locationsWithCoords}
				focusedLocation={focusedLocation}
				presentByLocationId={presentByLocationId}
				isMobileLayout={false}
			/>

			<div className="pointer-events-none absolute inset-0">
				<div className="pointer-events-auto absolute left-4 right-4 top-4">
					<div
						data-testid="dashboard-summary-card"
						className="rounded-xl border bg-background/80 p-4 shadow-sm backdrop-blur"
					>
						<div className="flex flex-col gap-4 min-[1025px]:flex-row min-[1025px]:items-center min-[1025px]:justify-between">
							<div className="space-y-1">
								<p className="text-xs uppercase tracking-wide text-muted-foreground">
									{t('map.title')}
								</p>
								<p className="text-base font-semibold">{t('map.subtitle')}</p>
							</div>
							<div data-testid="dashboard-stats-strip" className="flex flex-wrap gap-4">
								{metrics.map((metric) => (
									<div key={metric.label} className="flex items-center gap-3">
										<div
											className={`flex h-9 w-9 items-center justify-center rounded-lg ${metric.iconClassName}`}
										>
											<metric.icon className="h-4 w-4" />
										</div>
										<div className="space-y-0.5">
											<p className="text-xs text-muted-foreground">
												{metric.label}
											</p>
											{isCountsFetching ? (
												<Skeleton className="h-5 w-12" />
											) : (
												<p
													className={`text-lg font-semibold ${metric.valueClassName}`}
												>
													{metric.value.toLocaleString()}
												</p>
											)}
										</div>
									</div>
								))}
							</div>
							{actions}
						</div>
					</div>
				</div>

				<div
					data-testid="dashboard-locations-panel"
					className="pointer-events-auto absolute bottom-4 right-4 top-24 w-full max-w-sm"
				>
					<div className="flex h-full flex-col rounded-xl border bg-background/90 shadow-sm backdrop-blur">
						{locationsPanelHeader}
						<ScrollArea className="flex-1">{locationsPanelContent}</ScrollArea>
					</div>
				</div>
			</div>
		</div>
	);
}
