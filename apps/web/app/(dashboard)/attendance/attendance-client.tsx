'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, Download, RefreshCw, Search } from 'lucide-react';
import {
	format,
	startOfDay,
	endOfDay,
	subDays,
	startOfWeek,
	endOfWeek,
	startOfMonth,
	endOfMonth,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { queryKeys } from '@/lib/query-keys';
import {
	fetchAttendanceRecords,
	fetchLocationsList,
	type AttendanceRecord,
	type AttendanceType,
	type Location,
} from '@/lib/client-functions';
import { useOrgContext } from '@/lib/org-client-context';
import type {
	ColumnDef,
	ColumnFiltersState,
	PaginationState,
	SortingState,
} from '@tanstack/react-table';

/**
 * Date filter preset options.
 */
type DatePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';

const ALL_LOCATIONS_VALUE = '__all__';
const EXPORT_PAGE_SIZE = 100;

type AttendanceExportParams = Omit<
	NonNullable<Parameters<typeof fetchAttendanceRecords>[0]>,
	'limit' | 'offset'
>;

/**
 * CSV row shape for attendance exports.
 */
type AttendanceCsvRow = {
	employeeName: string;
	employeeId: string;
	deviceId: string;
	deviceLocation: string;
	type: string;
	time: string;
	date: string;
};

/**
 * CSV column definition for attendance exports.
 */
type CsvColumn = {
	key: keyof AttendanceCsvRow;
	label: string;
};

/**
 * Type badge variant mapping.
 */
const typeVariants: Record<AttendanceType, 'default' | 'secondary' | 'outline'> = {
	CHECK_IN: 'default',
	CHECK_OUT: 'secondary',
	CHECK_OUT_AUTHORIZED: 'outline',
};

/**
 * Resolves the translated label for an attendance type.
 *
 * @param t - Translation helper for Attendance namespace
 * @param type - Attendance type value
 * @returns Localized attendance type label
 */
function getAttendanceTypeLabel(t: (key: string) => string, type: AttendanceType): string {
	switch (type) {
		case 'CHECK_IN':
			return t('typeFilter.checkIn');
		case 'CHECK_OUT':
			return t('typeFilter.checkOut');
		case 'CHECK_OUT_AUTHORIZED':
		default:
			return t('typeFilter.checkOutAuthorized');
	}
}

/**
 * Parses a date key string into a Date instance.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Date instance or undefined when invalid
 */
function parseDateKey(dateKey: string): Date | undefined {
	const parsed = new Date(`${dateKey}T00:00:00`);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Escapes a value for CSV output.
 *
 * @param value - CSV cell value
 * @returns Escaped CSV-safe string
 */
function escapeCsvValue(value: AttendanceCsvRow[keyof AttendanceCsvRow]): string {
	const rawValue = value ?? '';
	const stringValue = String(rawValue);
	const escaped = stringValue.replace(/"/g, '""');
	const needsQuotes = /[",\n]/.test(escaped);
	return needsQuotes ? `"${escaped}"` : escaped;
}

/**
 * Builds a CSV document string from column definitions and rows.
 *
 * @param columns - Ordered CSV columns
 * @param rows - CSV rows
 * @returns CSV string content
 */
function buildCsvContent(columns: CsvColumn[], rows: AttendanceCsvRow[]): string {
	const header = columns.map((column) => escapeCsvValue(column.label)).join(',');
	const lines = rows.map((row) =>
		columns.map((column) => escapeCsvValue(row[column.key])).join(','),
	);
	return [header, ...lines].join('\n');
}

/**
 * Triggers a CSV file download in the browser.
 *
 * @param csv - CSV content string
 * @param fileName - File name for the downloaded CSV
 * @returns void
 */
function downloadCsvFile(csv: string, fileName: string): void {
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

/**
 * Fetches all attendance records matching the export filters.
 *
 * @param params - Attendance filters without pagination controls
 * @returns Promise resolving to the full attendance record list
 * @throws Error when the attendance fetch fails
 */
async function fetchAllAttendanceRecords(
	params: AttendanceExportParams,
): Promise<AttendanceRecord[]> {
	const records: AttendanceRecord[] = [];
	let offset = 0;
	let total = 0;

	do {
		const response = await fetchAttendanceRecords({
			...params,
			limit: EXPORT_PAGE_SIZE,
			offset,
		});
		records.push(...response.data);
		total = response.pagination.total;
		offset += response.data.length;

		if (response.data.length === 0) {
			break;
		}
	} while (offset < total);

	return records;
}

/**
 * Attendance page client component.
 * Provides a list view with date-fns based filtering using TanStack Query.
 *
 * @returns The attendance page JSX element
 */
export function AttendancePageClient(): React.ReactElement {
	const { organizationId } = useOrgContext();
	const t = useTranslations('Attendance');
	const [globalFilter, setGlobalFilter] = useState<string>('');
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [datePreset, setDatePreset] = useState<DatePreset>('today');
	const [startDate, setStartDate] = useState<string>(
		format(startOfDay(new Date()), 'yyyy-MM-dd'),
	);
	const [endDate, setEndDate] = useState<string>(format(endOfDay(new Date()), 'yyyy-MM-dd'));
	const [typeFilter, setTypeFilter] = useState<AttendanceType | 'both'>('both');
	const [isExporting, setIsExporting] = useState<boolean>(false);

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
			setGlobalFilter((prev) => (typeof value === 'function' ? value(prev) : value));
			resetPagination();
		},
		[resetPagination],
	);

	/**
	 * Updates column filters and resets pagination.
	 *
	 * @param value - Next column filters state or updater
	 * @returns void
	 */
	const handleColumnFiltersChange = useCallback(
		(value: React.SetStateAction<ColumnFiltersState>): void => {
			setColumnFilters((prev) => (typeof value === 'function' ? value(prev) : value));
			resetPagination();
		},
		[resetPagination],
	);

	const startDateValue = useMemo(() => parseDateKey(startDate), [startDate]);
	const endDateValue = useMemo(() => parseDateKey(endDate), [endDate]);

	/**
	 * Computes date range based on preset selection.
	 *
	 * @param preset - The selected date preset
	 * @returns Object with start and end date
	 */
	const getDateRange = useCallback(
		(preset: DatePreset): { start: Date; end: Date } => {
			const now = new Date();
			let start: Date;
			let end: Date;

			switch (preset) {
				case 'today':
					start = startOfDay(now);
					end = endOfDay(now);
					break;
				case 'yesterday':
					start = startOfDay(subDays(now, 1));
					end = endOfDay(subDays(now, 1));
					break;
				case 'this_week':
					start = startOfWeek(now, { weekStartsOn: 1 });
					end = endOfWeek(now, { weekStartsOn: 1 });
					break;
				case 'this_month':
					start = startOfMonth(now);
					end = endOfMonth(now);
					break;
				case 'custom':
				default:
					// Ensure we always have valid dates even if inputs are empty.
					const startValue = startDate ? new Date(startDate) : now;
					const endValue = endDate ? new Date(endDate) : now;
					start = startOfDay(startValue);
					end = endOfDay(endValue);
					break;
			}

			return { start, end };
		},
		[startDate, endDate],
	);

	// Get the current date range for the query
	const { start, end } = getDateRange(datePreset);
	const locationFilterValue =
		(columnFilters.find((filter) => filter.id === 'deviceLocationId')?.value as
			| string
			| undefined) ?? ALL_LOCATIONS_VALUE;
	const normalizedSearch = globalFilter.trim();
	const deviceLocationId =
		locationFilterValue === ALL_LOCATIONS_VALUE ? undefined : locationFilterValue;

	// Build query params - only include type when filtering to a single event type
	const baseParams = {
		limit: pagination.pageSize,
		offset: pagination.pageIndex * pagination.pageSize,
		fromDate: start,
		toDate: end,
		organizationId,
	};
	const queryParams = {
		...baseParams,
		...(typeFilter !== 'both' ? { type: typeFilter } : {}),
		...(normalizedSearch ? { search: normalizedSearch } : {}),
		...(deviceLocationId ? { deviceLocationId } : {}),
	};

	// Query for attendance records
	const { data, isFetching, refetch } = useQuery({
		queryKey: queryKeys.attendance.list(queryParams),
		queryFn: () => fetchAttendanceRecords(queryParams),
		enabled: Boolean(organizationId),
	});

	const records = data?.data ?? [];
	const totalRows = data?.pagination.total ?? 0;

	const locationQueryParams = { limit: 100, offset: 0, organizationId };
	const { data: locationsData } = useQuery({
		queryKey: queryKeys.locations.list(locationQueryParams),
		queryFn: () => fetchLocationsList(locationQueryParams),
		enabled: Boolean(organizationId),
	});

	const locations = useMemo(() => (locationsData?.data ?? []) as Location[], [locationsData]);
	const locationOptions = useMemo(
		() => [
			{ value: ALL_LOCATIONS_VALUE, label: t('locationFilter.all') },
			...locations.map((loc) => ({
				value: loc.id,
				label: loc.name || loc.code,
			})),
		],
		[locations, t],
	);

	/**
	 * Updates date preset and syncs date inputs.
	 *
	 * @param preset - The new date preset value
	 * @returns void
	 */
	const handlePresetChange = (preset: DatePreset): void => {
		setDatePreset(preset);
		if (preset !== 'custom') {
			const { start: newStart, end: newEnd } = getDateRange(preset);
			setStartDate(format(newStart, 'yyyy-MM-dd'));
			setEndDate(format(newEnd, 'yyyy-MM-dd'));
		}
		resetPagination();
	};

	/**
	 * Updates the type filter and resets pagination.
	 *
	 * @param value - Attendance type filter selection
	 * @returns void
	 */
	const handleTypeFilterChange = useCallback(
		(value: AttendanceType | 'both'): void => {
			setTypeFilter(value);
			resetPagination();
		},
		[resetPagination],
	);

	/**
	 * Updates the start date and resets pagination.
	 *
	 * @param date - Selected start date
	 * @returns void
	 */
	const handleStartDateSelect = useCallback(
		(date: Date | undefined): void => {
			if (!date) {
				return;
			}
			setStartDate(format(date, 'yyyy-MM-dd'));
			resetPagination();
		},
		[resetPagination],
	);

	/**
	 * Updates the end date and resets pagination.
	 *
	 * @param date - Selected end date
	 * @returns void
	 */
	const handleEndDateSelect = useCallback(
		(date: Date | undefined): void => {
			if (!date) {
				return;
			}
			setEndDate(format(date, 'yyyy-MM-dd'));
			resetPagination();
		},
		[resetPagination],
	);

	/**
	 * Updates the location filter and resets pagination.
	 *
	 * @param value - Selected location filter value
	 * @returns void
	 */
	const handleLocationFilterChange = useCallback(
		(value: string): void => {
			handleColumnFiltersChange((prev) => {
				const next = prev.filter((filter) => filter.id !== 'deviceLocationId');
				if (value !== ALL_LOCATIONS_VALUE) {
					next.push({ id: 'deviceLocationId', value });
				}
				return next;
			});
		},
		[handleColumnFiltersChange],
	);

	const locationFallback = t('table.placeholders.noLocation');

	const columns = useMemo<ColumnDef<AttendanceRecord>[]>(
		() => [
			{
				accessorKey: 'employeeName',
				header: t('table.headers.employeeName'),
				cell: ({ row }) => (
					<span className="max-w-[200px] truncate text-sm font-medium">
						{row.original.employeeName}
					</span>
				),
				enableGlobalFilter: false,
			},
			{
				accessorKey: 'employeeId',
				header: t('table.headers.employeeId'),
				cell: ({ row }) => (
					<span className="font-mono text-xs">
						{row.original.employeeId.substring(0, 8)}...
					</span>
				),
			},
			{
				accessorKey: 'deviceId',
				header: t('table.headers.deviceId'),
				cell: ({ row }) => (
					<span className="font-mono text-xs">
						{row.original.deviceId.substring(0, 8)}...
					</span>
				),
				enableGlobalFilter: false,
			},
			{
				id: 'deviceLocationId',
				accessorFn: (row) => row.deviceLocationId ?? '',
				header: t('table.headers.deviceLocation'),
				cell: ({ row }) => (
					<span className="max-w-[200px] truncate text-sm">
						{row.original.deviceLocationName ?? locationFallback}
					</span>
				),
				enableGlobalFilter: false,
			},
			{
				accessorKey: 'type',
				header: t('table.headers.type'),
				cell: ({ row }) => (
					<Badge variant={typeVariants[row.original.type]}>
						{getAttendanceTypeLabel(t, row.original.type)}
					</Badge>
				),
				enableGlobalFilter: false,
			},
			{
				id: 'time',
				accessorFn: (row) => row.timestamp,
				header: t('table.headers.time'),
				cell: ({ row }) => format(new Date(row.original.timestamp), 'HH:mm:ss'),
				enableGlobalFilter: false,
			},
			{
				id: 'date',
				accessorFn: (row) => row.timestamp,
				header: t('table.headers.date'),
				cell: ({ row }) => format(new Date(row.original.timestamp), t('dateFormat')),
				enableGlobalFilter: false,
			},
		],
		[locationFallback, t],
	);

	/**
	 * Exports the filtered attendance records to CSV.
	 *
	 * @returns Promise resolving when the CSV export completes
	 */
	const handleExportCsv = useCallback(async (): Promise<void> => {
		setIsExporting(true);
		try {
			const exportRecords = await fetchAllAttendanceRecords({
				fromDate: start,
				toDate: end,
				organizationId,
				...(typeFilter !== 'both' ? { type: typeFilter } : {}),
				...(normalizedSearch ? { search: normalizedSearch } : {}),
				...(deviceLocationId ? { deviceLocationId } : {}),
			});

			if (exportRecords.length === 0) {
				return;
			}

			const columns: CsvColumn[] = [
				{ key: 'employeeName', label: t('table.headers.employeeName') },
				{ key: 'employeeId', label: t('table.headers.employeeId') },
				{ key: 'deviceId', label: t('table.headers.deviceId') },
				{ key: 'deviceLocation', label: t('table.headers.deviceLocation') },
				{ key: 'type', label: t('table.headers.type') },
				{ key: 'time', label: t('table.headers.time') },
				{ key: 'date', label: t('table.headers.date') },
			];

			const rows: AttendanceCsvRow[] = exportRecords.map((record) => ({
				employeeName: record.employeeName,
				employeeId: record.employeeId,
				deviceId: record.deviceId,
				deviceLocation: record.deviceLocationName ?? locationFallback,
				type: getAttendanceTypeLabel(t, record.type),
				time: format(new Date(record.timestamp), 'HH:mm:ss'),
				date: format(new Date(record.timestamp), t('dateFormat')),
			}));

			const csv = buildCsvContent(columns, rows);
			const fileName = t('csv.fileName', {
				start: format(start, 'yyyyMMdd'),
				end: format(end, 'yyyyMMdd'),
			});

			downloadCsvFile(csv, fileName);
		} catch (error) {
			console.error('Failed to export attendance CSV:', error);
		} finally {
			setIsExporting(false);
		}
	}, [
		deviceLocationId,
		end,
		locationFallback,
		normalizedSearch,
		organizationId,
		start,
		t,
		typeFilter,
	]);

	if (!organizationId) {
		return (
			<div className="space-y-4">
				<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
				<p className="text-muted-foreground">{t('noOrganization')}</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
					<p className="text-muted-foreground">{t('subtitle')}</p>
				</div>
				<div className="flex items-center gap-2">
					<Button onClick={() => refetch()} variant="outline">
						<RefreshCw className="mr-2 h-4 w-4" />
						{t('actions.refresh')}
					</Button>
					<Button
						onClick={handleExportCsv}
						variant="outline"
						disabled={isFetching || isExporting || totalRows === 0}
					>
						<Download className="mr-2 h-4 w-4" />
						{t('actions.exportCsv')}
					</Button>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-4">
				<div className="relative flex-1 max-w-sm">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder={t('search.placeholder')}
						value={globalFilter}
						onChange={(e) => handleGlobalFilterChange(e.target.value)}
						className="pl-9"
					/>
				</div>

				<div className="flex items-center gap-2">
					<CalendarIcon className="h-4 w-4 text-muted-foreground" />
					<Select value={datePreset} onValueChange={handlePresetChange}>
						<SelectTrigger className="w-[150px]">
							<SelectValue placeholder={t('dateRange.placeholder')} />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="today">{t('dateRange.presets.today')}</SelectItem>
							<SelectItem value="yesterday">
								{t('dateRange.presets.yesterday')}
							</SelectItem>
							<SelectItem value="this_week">
								{t('dateRange.presets.thisWeek')}
							</SelectItem>
							<SelectItem value="this_month">
								{t('dateRange.presets.thisMonth')}
							</SelectItem>
							<SelectItem value="custom">{t('dateRange.presets.custom')}</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{datePreset === 'custom' && (
					<>
						<Popover>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									data-empty={!startDateValue}
									className="data-[empty=true]:text-muted-foreground w-[170px] justify-start text-left font-normal"
								>
									<CalendarIcon className="mr-2 h-4 w-4" />
									{startDateValue ? (
										format(startDateValue, 'P', { locale: es })
									) : (
										<span>{t('dateRange.selectDate')}</span>
									)}
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-auto p-0" align="start">
								<Calendar
									mode="single"
									selected={startDateValue}
									onSelect={handleStartDateSelect}
									initialFocus
								/>
							</PopoverContent>
						</Popover>
						<span className="text-muted-foreground">{t('dateRange.to')}</span>
						<Popover>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									data-empty={!endDateValue}
									className="data-[empty=true]:text-muted-foreground w-[170px] justify-start text-left font-normal"
								>
									<CalendarIcon className="mr-2 h-4 w-4" />
									{endDateValue ? (
										format(endDateValue, 'P', { locale: es })
									) : (
										<span>{t('dateRange.selectDate')}</span>
									)}
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-auto p-0" align="start">
								<Calendar
									mode="single"
									selected={endDateValue}
									onSelect={handleEndDateSelect}
									initialFocus
								/>
							</PopoverContent>
						</Popover>
					</>
				)}

				<Select value={typeFilter} onValueChange={handleTypeFilterChange}>
					<SelectTrigger className="w-[170px]">
						<SelectValue placeholder={t('typeFilter.placeholder')} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="both">{t('typeFilter.both')}</SelectItem>
						<SelectItem value="CHECK_IN">{t('typeFilter.checkIn')}</SelectItem>
						<SelectItem value="CHECK_OUT">{t('typeFilter.checkOut')}</SelectItem>
						<SelectItem value="CHECK_OUT_AUTHORIZED">
							{t('typeFilter.checkOutAuthorized')}
						</SelectItem>
					</SelectContent>
				</Select>

				<Select value={locationFilterValue} onValueChange={handleLocationFilterChange}>
					<SelectTrigger className="w-[200px]">
						<SelectValue placeholder={t('locationFilter.placeholder')} />
					</SelectTrigger>
					<SelectContent>
						{locationOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<DataTable
				columns={columns}
				data={records}
				sorting={sorting}
				onSortingChange={setSorting}
				pagination={pagination}
				onPaginationChange={setPagination}
				columnFilters={columnFilters}
				onColumnFiltersChange={handleColumnFiltersChange}
				globalFilter={globalFilter}
				onGlobalFilterChange={handleGlobalFilterChange}
				showToolbar={false}
				manualPagination
				manualFiltering
				rowCount={totalRows}
				emptyState={t('table.empty')}
				isLoading={isFetching}
			/>

			{!isFetching && records.length > 0 && (
				<p className="text-sm text-muted-foreground">
					{t('summary', { count: records.length })}
				</p>
			)}
		</div>
	);
}
