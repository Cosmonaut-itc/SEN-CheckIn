'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { endOfDay, format, formatDistanceToNowStrict, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import {
	ArrowRight,
	Building,
	ClipboardList,
	MapPin,
	RefreshCw,
	Search,
	Smartphone,
	Users,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable } from '@/components/data-table/data-table';
import {
	fetchAttendancePresent,
	fetchDashboardCounts,
	type AttendancePresentRecord,
	type DashboardCounts,
} from '@/lib/client-functions';
import { queryKeys } from '@/lib/query-keys';
import { useOrgContext } from '@/lib/org-client-context';
import type { ColumnDef, ColumnFiltersState, PaginationState, SortingState } from '@tanstack/react-table';

/**
 * Entity count card configuration interface.
 */
interface EntityCardConfig {
	/** Translation key for the display title */
	titleKey: string;
	/** Translation key for the description text */
	descriptionKey: string;
	/** Route path for navigation */
	href: string;
	/** Lucide icon component */
	icon: React.ComponentType<{ className?: string }>;
	/** Key for the count data */
	key: keyof DashboardCounts;
}

/**
 * Entity card configurations for the dashboard.
 */
const entityCards: EntityCardConfig[] = [
	{
		titleKey: 'cards.employees.title',
		descriptionKey: 'cards.employees.description',
		href: '/employees',
		icon: Users,
		key: 'employees',
	},
	{
		titleKey: 'cards.devices.title',
		descriptionKey: 'cards.devices.description',
		href: '/devices',
		icon: Smartphone,
		key: 'devices',
	},
	{
		titleKey: 'cards.locations.title',
		descriptionKey: 'cards.locations.description',
		href: '/locations',
		icon: MapPin,
		key: 'locations',
	},
	{
		titleKey: 'cards.organizations.title',
		descriptionKey: 'cards.organizations.description',
		href: '/organizations',
		icon: Building,
		key: 'organizations',
	},
	{
		titleKey: 'cards.attendance.title',
		descriptionKey: 'cards.attendance.description',
		href: '/attendance',
		icon: ClipboardList,
		key: 'attendance',
	},
];

const UNASSIGNED_LOCATION_KEY = 'unassigned';

/**
 * Grouped presence data per location for the dashboard accordion.
 */
interface PresenceLocationGroup {
	locationKey: string;
	locationId: string | null;
	locationName: string | null;
	records: AttendancePresentRecord[];
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
	const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
	return `${first}${second}`.toUpperCase();
}

/**
 * Groups attendance presence records by location.
 *
 * @param records - Presence records to group.
 * @returns Sorted list of location groups.
 */
function groupPresenceByLocation(
	records: AttendancePresentRecord[],
): PresenceLocationGroup[] {
	const groups = new Map<string, PresenceLocationGroup>();

	records.forEach((record) => {
		const locationKey = record.locationId ?? UNASSIGNED_LOCATION_KEY;
		const existing = groups.get(locationKey);
		if (existing) {
			existing.records.push(record);
			return;
		}
		groups.set(locationKey, {
			locationKey,
			locationId: record.locationId ?? null,
			locationName: record.locationName ?? null,
			records: [record],
		});
	});

	const groupedRecords = Array.from(groups.values()).map((group) => ({
		...group,
		records: [...group.records].sort(
			(a, b) =>
				new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime(),
		),
	}));

	return groupedRecords.sort((a, b) => {
		const nameA = a.locationName ?? '';
		const nameB = b.locationName ?? '';
		return nameA.localeCompare(nameB, 'es');
	});
}

/**
 * Props for presence table rendering.
 */
interface PresenceTableProps {
	/** Presence records for a location group. */
	records: AttendancePresentRecord[];
	/** Shared global filter value. */
	globalFilter: string;
	/** Global filter update handler. */
	onGlobalFilterChange: React.Dispatch<React.SetStateAction<string>>;
}

/**
 * Renders the presence table for a location group.
 *
 * @param props - Presence table props.
 * @returns Rendered presence table.
 */
function PresenceTable({
	records,
	globalFilter,
	onGlobalFilterChange,
}: PresenceTableProps): React.ReactElement {
	const t = useTranslations('Dashboard');
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 5,
	});
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

	/**
	 * Resets pagination to the first page.
	 *
	 * @returns void
	 */
	const resetPagination = useCallback((): void => {
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}, []);

	/**
	 * Updates the global filter and resets pagination.
	 *
	 * @param value - Next global filter value or updater
	 * @returns void
	 */
	const handleGlobalFilterChange = useCallback(
		(value: React.SetStateAction<string>): void => {
			onGlobalFilterChange(value);
			resetPagination();
		},
		[onGlobalFilterChange, resetPagination],
	);

	/**
	 * Resets pagination when the global filter changes from outside the table.
	 * This ensures that when the parent component updates the search input,
	 * pagination resets to the first page even if the change bypasses handleGlobalFilterChange.
	 *
	 * @returns void
	 */
	useEffect(() => {
		resetPagination();
	}, [globalFilter, resetPagination]);

	const columns = useMemo<ColumnDef<AttendancePresentRecord>[]>(
		() => [
			{
				id: 'employee',
				accessorFn: (row) => row.employeeName ?? row.employeeCode,
				header: t('presence.table.headers.employee'),
				cell: ({ row }) => {
					const displayName = row.original.employeeName || row.original.employeeCode;
					const initials = getEmployeeInitials(displayName);
					return (
						<div className="flex items-center gap-3">
							<Avatar className="h-8 w-8">
								<AvatarFallback>
									{initials || t('presence.table.fallbackInitials')}
								</AvatarFallback>
							</Avatar>
							<span className="text-sm font-medium">{displayName}</span>
						</div>
					);
				},
			},
			{
				accessorKey: 'employeeCode',
				header: t('presence.table.headers.code'),
				cell: ({ row }) => (
					<span className="font-mono text-xs">{row.original.employeeCode}</span>
				),
			},
			{
				id: 'checkInTime',
				accessorFn: (row) => new Date(row.checkedInAt).getTime(),
				header: t('presence.table.headers.checkInTime'),
				cell: ({ row }) =>
					format(new Date(row.original.checkedInAt), t('presence.timeFormat')),
				enableGlobalFilter: false,
			},
			{
				id: 'timeAgo',
				accessorFn: (row) => new Date(row.checkedInAt).getTime(),
				header: t('presence.table.headers.timeAgo'),
				cell: ({ row }) => {
					const checkedInAt = new Date(row.original.checkedInAt);
					const relativeTime = formatDistanceToNowStrict(checkedInAt, {
						addSuffix: false,
						locale: es,
					});
					return (
						<span className="text-sm text-muted-foreground">
							{t('presence.table.timeAgo', {
								time: relativeTime,
							})}
						</span>
					);
				},
				enableGlobalFilter: false,
			},
			{
				accessorKey: 'deviceId',
				header: t('presence.table.headers.device'),
				cell: ({ row }) => (
					<span className="font-mono text-xs">
						{row.original.deviceId.substring(0, 8)}...
					</span>
				),
			},
		],
		[t],
	);

	return (
		<DataTable
			columns={columns}
			data={records}
			sorting={sorting}
			onSortingChange={setSorting}
			pagination={pagination}
			onPaginationChange={setPagination}
			columnFilters={columnFilters}
			onColumnFiltersChange={setColumnFilters}
			globalFilter={globalFilter}
			onGlobalFilterChange={handleGlobalFilterChange}
			showToolbar={false}
			emptyState={t('presence.emptyLocation')}
			pageSizeOptions={[5, 10, 20]}
		/>
	);
}

/**
 * Dashboard page client component.
 * Displays entity counts and quick navigation cards.
 *
 * Uses useSuspenseQuery to consume prefetched data from the server,
 * enabling streaming SSR with React Query.
 *
 * @returns The dashboard page JSX element
 */
export function DashboardPageClient(): React.ReactElement {
	const { organizationId } = useOrgContext();
	const t = useTranslations('Dashboard');
	const { data: counts, isFetching } = useSuspenseQuery({
		queryKey: queryKeys.dashboard.counts(organizationId),
		queryFn: () => fetchDashboardCounts({ organizationId }),
	});
	const [presenceSearch, setPresenceSearch] = useState<string>('');
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

	const presenceSearchTerm = presenceSearch.trim().toLowerCase();
	const groupedPresence = useMemo(
		() => groupPresenceByLocation(presentRecords),
		[presentRecords],
	);
	const filteredPresence = useMemo(
		() =>
			groupedPresence.map((group) => ({
				...group,
				records: presenceSearchTerm
					? group.records.filter((record) => {
							const name = record.employeeName?.toLowerCase() ?? '';
							const code = record.employeeCode?.toLowerCase() ?? '';
							return (
								name.includes(presenceSearchTerm) ||
								code.includes(presenceSearchTerm)
							);
					  })
					: group.records,
			})),
		[groupedPresence, presenceSearchTerm],
	);
	const totalPresent = filteredPresence.reduce(
		(total, group) => total + group.records.length,
		0,
	);
	const activeLocations = filteredPresence.filter((group) => group.records.length > 0)
		.length;
	const hasPresenceData = presentRecords.length > 0;
	const isPresenceLoading = isPresentFetching && presentRecords.length === 0;
	const defaultOpenLocations = useMemo(
		() => filteredPresence.map((group) => group.locationKey),
		[filteredPresence],
	);

	/**
	 * Refetches the presence records for the current date range.
	 *
	 * @returns void
	 */
	const handlePresenceRefresh = (): void => {
		void refetchPresent();
	};

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
				<p className="text-muted-foreground">{t('subtitle')}</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{entityCards.map((card) => (
					<Link key={card.key} href={card.href} className="group">
						<Card className="h-full transition-colors hover:border-primary/50">
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<CardTitle className="text-sm font-medium">
									{t(card.titleKey)}
								</CardTitle>
								<card.icon className="h-4 w-4 text-muted-foreground" />
							</CardHeader>
							<CardContent>
								<div className="flex items-baseline justify-between">
									{isFetching ? (
										<Skeleton className="h-8 w-16" />
									) : (
										<span className="text-3xl font-bold">
											{counts[card.key]?.toLocaleString() ?? '0'}
										</span>
									)}
									<ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
								</div>
								<CardDescription className="mt-2">
									{t(card.descriptionKey)}
								</CardDescription>
							</CardContent>
						</Card>
					</Link>
				))}
			</div>

			<Card>
				<CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="space-y-1">
						<CardTitle>{t('presence.title')}</CardTitle>
						<CardDescription>
							{isPresenceLoading ? (
								<Skeleton className="h-4 w-40" />
							) : (
								t('presence.summary', {
									total: totalPresent,
									locations: activeLocations,
								})
							)}
						</CardDescription>
					</div>
					<Button
						type="button"
						variant="outline"
						onClick={handlePresenceRefresh}
						disabled={isPresentFetching}
					>
						<RefreshCw className="mr-2 h-4 w-4" />
						{t('presence.actions.refresh')}
					</Button>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="relative max-w-sm">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							placeholder={t('presence.search.placeholder')}
							aria-label={t('presence.search.placeholder')}
							value={presenceSearch}
							onChange={(event) => setPresenceSearch(event.target.value)}
							className="pl-9"
						/>
					</div>

					{isPresenceLoading ? (
						<div className="space-y-3">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-28 w-full" />
							<Skeleton className="h-28 w-full" />
						</div>
					) : !hasPresenceData ? (
						<div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
							{t('presence.empty')}
						</div>
					) : (
						<Accordion
							type="multiple"
							defaultValue={defaultOpenLocations}
							className="w-full"
						>
							{filteredPresence.map((group) => {
								const locationLabel =
									group.locationName ?? t('presence.locationFallback');
								const groupCount = group.records.length;
								return (
									<AccordionItem
										key={group.locationKey}
										value={group.locationKey}
									>
										<AccordionTrigger>
											<div className="flex items-center gap-3">
												<span className="text-sm font-medium">
													{locationLabel}
												</span>
												<Badge variant="secondary">
													{groupCount.toLocaleString()}
												</Badge>
											</div>
										</AccordionTrigger>
										<AccordionContent>
											<PresenceTable
												records={group.records}
												globalFilter={presenceSearch}
												onGlobalFilterChange={setPresenceSearch}
											/>
										</AccordionContent>
									</AccordionItem>
								);
							})}
						</Accordion>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
