'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import {
	Calendar as CalendarIcon,
	Download,
	Info,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	Trash2,
} from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import {
	createWorkOffsiteAttendance,
	deleteWorkOffsiteAttendance,
	fetchEmployeesList,
	fetchAttendanceRecords,
	fetchLocationsList,
	type AttendanceRecord,
	type AttendanceType,
	type Location,
	type OffsiteDayKind,
	updateWorkOffsiteAttendance,
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
const ALL_OFFSITE_DAY_KIND_VALUE = '__all_offsite_day_kind__';
const EXPORT_PAGE_SIZE = 100;
const ACTIVE_EMPLOYEES_PAGE_SIZE = 100;

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
	offsiteDayKind: string;
	offsiteReason: string;
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
	WORK_OFFSITE: 'secondary',
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
			return t('typeFilter.checkOutAuthorized');
		case 'WORK_OFFSITE':
			return t('typeFilter.workOffsite');
		default:
			return t('typeFilter.checkOut');
	}
}

/**
 * Resolves the translated label for offsite day-kind classification.
 *
 * @param t - Translation helper for Attendance namespace
 * @param kind - Optional offsite day kind
 * @returns Localized day-kind label
 */
function getOffsiteDayKindLabel(
	t: (key: string) => string,
	kind: OffsiteDayKind | null | undefined,
): string {
	if (kind === 'LABORABLE') {
		return t('offsite.dayKind.laborable');
	}
	if (kind === 'NO_LABORABLE') {
		return t('offsite.dayKind.noLaborable');
	}
	return t('offsite.dayKind.none');
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
	const { organizationId, organizationRole } = useOrgContext();
	const queryClient = useQueryClient();
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
	const [offsiteDayKindFilter, setOffsiteDayKindFilter] = useState<
		OffsiteDayKind | typeof ALL_OFFSITE_DAY_KIND_VALUE
	>(ALL_OFFSITE_DAY_KIND_VALUE);
	const [isExporting, setIsExporting] = useState<boolean>(false);
	const [isOffsiteDialogOpen, setIsOffsiteDialogOpen] = useState<boolean>(false);
	const [editingOffsiteRecord, setEditingOffsiteRecord] = useState<AttendanceRecord | null>(null);
	const [offsiteEmployeeId, setOffsiteEmployeeId] = useState<string>('');
	const [offsiteDateKey, setOffsiteDateKey] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
	const [offsiteDayKind, setOffsiteDayKind] = useState<OffsiteDayKind>('LABORABLE');
	const [offsiteReason, setOffsiteReason] = useState<string>('');
	const [pendingOffsiteDeleteId, setPendingOffsiteDeleteId] = useState<string | null>(null);

	const canManageOffsite = organizationRole === 'admin' || organizationRole === 'owner';

	/**
	 * Resets all fields for offsite modal form.
	 *
	 * @returns void
	 */
	const resetOffsiteForm = useCallback((): void => {
		setEditingOffsiteRecord(null);
		setOffsiteEmployeeId('');
		setOffsiteDateKey(format(new Date(), 'yyyy-MM-dd'));
		setOffsiteDayKind('LABORABLE');
		setOffsiteReason('');
	}, []);

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
	const normalizedOffsiteDayKind =
		offsiteDayKindFilter === ALL_OFFSITE_DAY_KIND_VALUE ? undefined : offsiteDayKindFilter;

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
		...(normalizedOffsiteDayKind ? { offsiteDayKind: normalizedOffsiteDayKind } : {}),
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

	const activeEmployeesQuery = useQuery({
		queryKey: ['attendance', 'offsite', 'active-employees', organizationId],
		queryFn: async () => {
			if (!organizationId) {
				return [];
			}

			const employees: Awaited<ReturnType<typeof fetchEmployeesList>>['data'] = [];
			let offset = 0;
			let total = 0;

			do {
				const response = await fetchEmployeesList({
					limit: ACTIVE_EMPLOYEES_PAGE_SIZE,
					offset,
					status: 'ACTIVE',
					organizationId,
				});
				employees.push(...response.data);
				total = response.pagination.total;

				if (response.data.length === 0) {
					break;
				}

				offset += response.pagination.limit;
			} while (employees.length < total);

			return employees;
		},
		enabled: Boolean(organizationId) && canManageOffsite,
	});
	const activeEmployees = activeEmployeesQuery.data ?? [];

	const createOffsiteMutation = useMutation({
		mutationKey: ['attendance', 'offsite', 'create'],
		mutationFn: () =>
			createWorkOffsiteAttendance({
				employeeId: offsiteEmployeeId,
				offsiteDateKey,
				offsiteDayKind,
				offsiteReason: offsiteReason.trim(),
			}),
		onSuccess: async () => {
			toast.success(t('offsite.toast.createSuccess'));
			setIsOffsiteDialogOpen(false);
			resetOffsiteForm();
			await queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all });
		},
		onError: () => {
			toast.error(t('offsite.toast.createError'));
		},
	});

	const updateOffsiteMutation = useMutation({
		mutationKey: ['attendance', 'offsite', 'update'],
		mutationFn: async () => {
			if (!editingOffsiteRecord?.id) {
				throw new Error('Missing offsite attendance id');
			}
			return updateWorkOffsiteAttendance({
				id: editingOffsiteRecord.id,
				offsiteDateKey,
				offsiteDayKind,
				offsiteReason: offsiteReason.trim(),
			});
		},
		onSuccess: async () => {
			toast.success(t('offsite.toast.updateSuccess'));
			setIsOffsiteDialogOpen(false);
			resetOffsiteForm();
			await queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all });
		},
		onError: () => {
			toast.error(t('offsite.toast.updateError'));
		},
	});

	const deleteOffsiteMutation = useMutation({
		mutationKey: ['attendance', 'offsite', 'delete'],
		mutationFn: (id: string) => deleteWorkOffsiteAttendance({ id }),
		onSuccess: async () => {
			toast.success(t('offsite.toast.deleteSuccess'));
			await queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all });
		},
		onError: () => {
			toast.error(t('offsite.toast.deleteError'));
		},
	});

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
	 * Updates offsite day-kind filter and resets pagination.
	 *
	 * @param value - Selected offsite day kind filter
	 * @returns void
	 */
	const handleOffsiteDayKindFilterChange = useCallback(
		(value: OffsiteDayKind | typeof ALL_OFFSITE_DAY_KIND_VALUE): void => {
			setOffsiteDayKindFilter(value);
			resetPagination();
		},
		[resetPagination],
	);

	/**
	 * Opens the offsite dialog prefilled for a new record.
	 *
	 * @returns void
	 */
	const openCreateOffsiteDialog = useCallback((): void => {
		resetOffsiteForm();
		setIsOffsiteDialogOpen(true);
	}, [resetOffsiteForm]);

	/**
	 * Opens the offsite dialog in edit mode with existing record values.
	 *
	 * @param record - Offsite attendance record
	 * @returns void
	 */
	const openEditOffsiteDialog = useCallback((record: AttendanceRecord): void => {
		setEditingOffsiteRecord(record);
		setOffsiteEmployeeId(record.employeeId);
		setOffsiteDateKey(
			record.offsiteDateKey ?? format(new Date(record.timestamp), 'yyyy-MM-dd'),
		);
		setOffsiteDayKind(record.offsiteDayKind ?? 'LABORABLE');
		setOffsiteReason(record.offsiteReason ?? '');
		setIsOffsiteDialogOpen(true);
	}, []);

	/**
	 * Submits create/update action for offsite attendance.
	 *
	 * @returns Promise resolved when mutation completes
	 */
	const handleSubmitOffsite = useCallback(async (): Promise<void> => {
		if (!offsiteEmployeeId) {
			toast.error(t('offsite.validation.employeeRequired'));
			return;
		}
		if (!offsiteDateKey) {
			toast.error(t('offsite.validation.dateRequired'));
			return;
		}
		const normalizedReason = offsiteReason.trim();
		if (normalizedReason.length < 10 || normalizedReason.length > 500) {
			toast.error(t('offsite.validation.reasonLength'));
			return;
		}

		if (editingOffsiteRecord) {
			await updateOffsiteMutation.mutateAsync();
			return;
		}

		await createOffsiteMutation.mutateAsync();
	}, [
		createOffsiteMutation,
		editingOffsiteRecord,
		offsiteDateKey,
		offsiteEmployeeId,
		offsiteReason,
		t,
		updateOffsiteMutation,
	]);

	/**
	 * Opens the offsite delete confirmation dialog.
	 *
	 * @param id - Attendance id to delete
	 * @returns void
	 */
	const handleRequestDeleteOffsite = useCallback((id: string): void => {
		setPendingOffsiteDeleteId(id);
	}, []);

	/**
	 * Confirms deletion of the selected offsite record.
	 *
	 * @returns Promise resolved after deletion attempt
	 */
	const handleConfirmDeleteOffsite = useCallback(async (): Promise<void> => {
		if (!pendingOffsiteDeleteId) {
			return;
		}
		try {
			await deleteOffsiteMutation.mutateAsync(pendingOffsiteDeleteId);
		} finally {
			setPendingOffsiteDeleteId(null);
		}
	}, [deleteOffsiteMutation, pendingOffsiteDeleteId]);

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
				cell: ({ row }) => {
					const isOffsite = row.original.type === 'WORK_OFFSITE';
					return (
						<div className="flex items-center gap-2">
							<Badge variant={typeVariants[row.original.type]}>
								{getAttendanceTypeLabel(t, row.original.type)}
							</Badge>
							{isOffsite && row.original.offsiteReason && (
								<TooltipProvider>
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className="h-7 w-7 p-0"
											>
												<Info className="h-4 w-4 text-muted-foreground" />
											</Button>
										</TooltipTrigger>
										<TooltipContent className="max-w-xs text-sm">
											{row.original.offsiteReason}
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							)}
						</div>
					);
				},
				enableGlobalFilter: false,
			},
			{
				id: 'offsiteDayKind',
				accessorFn: (row) => row.offsiteDayKind ?? '',
				header: t('table.headers.offsiteDayKind'),
				cell: ({ row }) => (
					<span className="text-sm">
						{getOffsiteDayKindLabel(t, row.original.offsiteDayKind ?? null)}
					</span>
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
			{
				id: 'actions',
				header: t('table.headers.actions'),
				cell: ({ row }) => {
					if (!canManageOffsite || row.original.type !== 'WORK_OFFSITE') {
						return null;
					}
					return (
						<div className="flex items-center gap-1">
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="h-8 w-8"
								onClick={() => openEditOffsiteDialog(row.original)}
							>
								<Pencil className="h-4 w-4" />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="h-8 w-8 text-destructive hover:text-destructive"
								onClick={() => handleRequestDeleteOffsite(row.original.id)}
								disabled={deleteOffsiteMutation.isPending}
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
					);
				},
				enableGlobalFilter: false,
			},
		],
		[
			canManageOffsite,
			deleteOffsiteMutation.isPending,
			handleRequestDeleteOffsite,
			locationFallback,
			openEditOffsiteDialog,
			t,
		],
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
				...(normalizedOffsiteDayKind ? { offsiteDayKind: normalizedOffsiteDayKind } : {}),
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
				{ key: 'offsiteDayKind', label: t('table.headers.offsiteDayKind') },
				{ key: 'offsiteReason', label: t('table.headers.offsiteReason') },
				{ key: 'time', label: t('table.headers.time') },
				{ key: 'date', label: t('table.headers.date') },
			];

			const rows: AttendanceCsvRow[] = exportRecords.map((record) => ({
				employeeName: record.employeeName,
				employeeId: record.employeeId,
				deviceId: record.deviceId,
				deviceLocation: record.deviceLocationName ?? locationFallback,
				type: getAttendanceTypeLabel(t, record.type),
				offsiteDayKind: getOffsiteDayKindLabel(t, record.offsiteDayKind ?? null),
				offsiteReason: record.offsiteReason ?? '',
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
		normalizedOffsiteDayKind,
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
					{canManageOffsite && (
						<Button onClick={openCreateOffsiteDialog}>
							<Plus className="mr-2 h-4 w-4" />
							{t('actions.registerOffsite')}
						</Button>
					)}
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
						<SelectItem value="WORK_OFFSITE">{t('typeFilter.workOffsite')}</SelectItem>
					</SelectContent>
				</Select>

				<Select
					value={offsiteDayKindFilter}
					onValueChange={handleOffsiteDayKindFilterChange}
				>
					<SelectTrigger className="w-[210px]">
						<SelectValue placeholder={t('offsite.filter.placeholder')} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL_OFFSITE_DAY_KIND_VALUE}>
							{t('offsite.filter.all')}
						</SelectItem>
						<SelectItem value="LABORABLE">{t('offsite.dayKind.laborable')}</SelectItem>
						<SelectItem value="NO_LABORABLE">
							{t('offsite.dayKind.noLaborable')}
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

			<Dialog
				open={isOffsiteDialogOpen}
				onOpenChange={(open) => {
					setIsOffsiteDialogOpen(open);
					if (!open) {
						resetOffsiteForm();
					}
				}}
			>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>
							{editingOffsiteRecord
								? t('offsite.dialog.editTitle')
								: t('offsite.dialog.createTitle')}
						</DialogTitle>
						<DialogDescription>{t('offsite.dialog.description')}</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="offsite-employee">{t('offsite.fields.employee')}</Label>
							<Select
								value={offsiteEmployeeId}
								onValueChange={setOffsiteEmployeeId}
								disabled={Boolean(editingOffsiteRecord)}
							>
								<SelectTrigger id="offsite-employee">
									<SelectValue
										placeholder={t('offsite.fields.employeePlaceholder')}
									/>
								</SelectTrigger>
								<SelectContent>
									{activeEmployees.map((employee) => (
										<SelectItem key={employee.id} value={employee.id}>
											{`${employee.firstName} ${employee.lastName}`.trim()}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="offsite-date">{t('offsite.fields.date')}</Label>
								<Input
									id="offsite-date"
									type="date"
									value={offsiteDateKey}
									onChange={(event) => setOffsiteDateKey(event.target.value)}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="offsite-kind">{t('offsite.fields.dayKind')}</Label>
								<Select
									value={offsiteDayKind}
									onValueChange={(value) =>
										setOffsiteDayKind(value as OffsiteDayKind)
									}
								>
									<SelectTrigger id="offsite-kind">
										<SelectValue placeholder={t('offsite.fields.dayKind')} />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="LABORABLE">
											{t('offsite.dayKind.laborable')}
										</SelectItem>
										<SelectItem value="NO_LABORABLE">
											{t('offsite.dayKind.noLaborable')}
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="offsite-reason">{t('offsite.fields.reason')}</Label>
							<Textarea
								id="offsite-reason"
								value={offsiteReason}
								minLength={10}
								maxLength={500}
								onChange={(event) => setOffsiteReason(event.target.value)}
								placeholder={t('offsite.fields.reasonPlaceholder')}
							/>
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								setIsOffsiteDialogOpen(false);
								resetOffsiteForm();
							}}
						>
							{t('offsite.actions.cancel')}
						</Button>
						<Button
							type="button"
							onClick={() => void handleSubmitOffsite()}
							disabled={
								createOffsiteMutation.isPending || updateOffsiteMutation.isPending
							}
						>
							{editingOffsiteRecord
								? t('offsite.actions.save')
								: t('offsite.actions.create')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={Boolean(pendingOffsiteDeleteId)}
				onOpenChange={(open) => {
					if (!open) {
						setPendingOffsiteDeleteId(null);
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{t('offsite.confirm.title')}</DialogTitle>
						<DialogDescription>{t('offsite.confirm.delete')}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setPendingOffsiteDeleteId(null)}
						>
							{t('offsite.actions.cancel')}
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={() => void handleConfirmDeleteOffsite()}
							disabled={deleteOffsiteMutation.isPending}
						>
							{t('offsite.actions.delete')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
