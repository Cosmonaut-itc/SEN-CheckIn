'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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

/**
 * Date filter preset options.
 */
type DatePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';

const ALL_LOCATIONS_VALUE = '__all__';

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
const typeVariants: Record<AttendanceType, 'default' | 'secondary'> = {
	CHECK_IN: 'default',
	CHECK_OUT: 'secondary',
};

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
 * Attendance page client component.
 * Provides a list view with date-fns based filtering using TanStack Query.
 *
 * @returns The attendance page JSX element
 */
export function AttendancePageClient(): React.ReactElement {
	const { organizationId } = useOrgContext();
	const t = useTranslations('Attendance');
	const [search, setSearch] = useState<string>('');
	const [datePreset, setDatePreset] = useState<DatePreset>('today');
	const [startDate, setStartDate] = useState<string>(
		format(startOfDay(new Date()), 'yyyy-MM-dd'),
	);
	const [endDate, setEndDate] = useState<string>(format(endOfDay(new Date()), 'yyyy-MM-dd'));
	const [typeFilter, setTypeFilter] = useState<AttendanceType | 'both'>('both');
	const [locationFilter, setLocationFilter] = useState<string>(ALL_LOCATIONS_VALUE);

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

	// Build query params - only include type when filtering to a single event type
	const baseParams = { limit: 100, offset: 0, fromDate: start, toDate: end, organizationId };
	const queryParams = typeFilter !== 'both' ? { ...baseParams, type: typeFilter } : baseParams;

	// Query for attendance records
	const { data, isFetching, refetch } = useQuery({
		queryKey: queryKeys.attendance.list(queryParams),
		queryFn: () => fetchAttendanceRecords(queryParams),
		enabled: Boolean(organizationId),
	});

	const records = data?.data ?? [];

	const locationQueryParams = { limit: 100, offset: 0, organizationId };
	const { data: locationsData } = useQuery({
		queryKey: queryKeys.locations.list(locationQueryParams),
		queryFn: () => fetchLocationsList(locationQueryParams),
		enabled: Boolean(organizationId),
	});

	const locations = useMemo(
		() => (locationsData?.data ?? []) as Location[],
		[locationsData],
	);
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
	};

	/**
	 * Filters records by employee ID search.
	 */
	const filteredRecords = records.filter((record: AttendanceRecord) => {
		const matchesSearch = search
			? record.employeeId.toLowerCase().includes(search.toLowerCase())
			: true;
		const matchesLocation =
			locationFilter === ALL_LOCATIONS_VALUE
				? true
				: record.deviceLocationId === locationFilter;
		return matchesSearch && matchesLocation;
	});
	const locationFallback = t('table.placeholders.noLocation');

	/**
	 * Exports the filtered attendance records to CSV.
	 *
	 * @returns void
	 */
	const handleExportCsv = useCallback((): void => {
		if (filteredRecords.length === 0) {
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

		const rows: AttendanceCsvRow[] = filteredRecords.map((record) => ({
			employeeName: record.employeeName,
			employeeId: record.employeeId,
			deviceId: record.deviceId,
			deviceLocation: record.deviceLocationName ?? locationFallback,
			type:
				record.type === 'CHECK_IN' ? t('typeFilter.checkIn') : t('typeFilter.checkOut'),
			time: format(new Date(record.timestamp), 'HH:mm:ss'),
			date: format(new Date(record.timestamp), t('dateFormat')),
		}));

		const csv = buildCsvContent(columns, rows);
		const fileName = t('csv.fileName', {
			start: format(start, 'yyyyMMdd'),
			end: format(end, 'yyyyMMdd'),
		});

		downloadCsvFile(csv, fileName);
	}, [end, filteredRecords, locationFallback, start, t]);

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
						disabled={isFetching || filteredRecords.length === 0}
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
						value={search}
						onChange={(e) => setSearch(e.target.value)}
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
									onSelect={(date) => {
										if (!date) return;
										setStartDate(format(date, 'yyyy-MM-dd'));
									}}
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
									onSelect={(date) => {
										if (!date) return;
										setEndDate(format(date, 'yyyy-MM-dd'));
									}}
									initialFocus
								/>
							</PopoverContent>
						</Popover>
					</>
				)}

				<Select
					value={typeFilter}
					onValueChange={(value: AttendanceType | 'both') => setTypeFilter(value)}
				>
					<SelectTrigger className="w-[170px]">
						<SelectValue placeholder={t('typeFilter.placeholder')} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="both">{t('typeFilter.both')}</SelectItem>
						<SelectItem value="CHECK_IN">{t('typeFilter.checkIn')}</SelectItem>
						<SelectItem value="CHECK_OUT">{t('typeFilter.checkOut')}</SelectItem>
					</SelectContent>
				</Select>

				<Select value={locationFilter} onValueChange={setLocationFilter}>
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

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t('table.headers.employeeName')}</TableHead>
							<TableHead>{t('table.headers.employeeId')}</TableHead>
							<TableHead>{t('table.headers.deviceId')}</TableHead>
							<TableHead>{t('table.headers.deviceLocation')}</TableHead>
							<TableHead>{t('table.headers.type')}</TableHead>
							<TableHead>{t('table.headers.time')}</TableHead>
							<TableHead>{t('table.headers.date')}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isFetching ? (
							Array.from({ length: 10 }).map((_, i) => (
								<TableRow key={i}>
									{Array.from({ length: 7 }).map((_, j) => (
										<TableCell key={j}>
											<Skeleton className="h-4 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : filteredRecords.length === 0 ? (
							<TableRow>
								<TableCell colSpan={7} className="h-24 text-center">
									{t('table.empty')}
								</TableCell>
							</TableRow>
						) : (
							filteredRecords.map((record: AttendanceRecord) => (
								<TableRow key={record.id}>
									<TableCell className="max-w-[200px] truncate text-sm font-medium">
										{record.employeeName}
									</TableCell>
									<TableCell className="font-mono text-xs">
										{record.employeeId.substring(0, 8)}...
									</TableCell>
									<TableCell className="font-mono text-xs">
										{record.deviceId.substring(0, 8)}...
									</TableCell>
									<TableCell className="max-w-[200px] truncate text-sm">
										{record.deviceLocationName ?? locationFallback}
									</TableCell>
									<TableCell>
										<Badge variant={typeVariants[record.type]}>
											{record.type === 'CHECK_IN'
												? t('typeFilter.checkIn')
												: t('typeFilter.checkOut')}
										</Badge>
									</TableCell>
									<TableCell>
										{format(new Date(record.timestamp), 'HH:mm:ss')}
									</TableCell>
									<TableCell>
										{format(new Date(record.timestamp), t('dateFormat'))}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			{!isFetching && filteredRecords.length > 0 && (
				<p className="text-sm text-muted-foreground">
					{t('summary', { count: filteredRecords.length })}
				</p>
			)}
		</div>
	);
}
