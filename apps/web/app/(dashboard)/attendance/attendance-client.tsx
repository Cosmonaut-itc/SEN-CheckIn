'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EmployeeDetailTab } from '@sen-checkin/types';
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
	X,
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
import { ResponsiveDataView } from '@/components/ui/responsive-data-view';
import { ResponsivePageHeader } from '@/components/ui/responsive-page-header';
import { TourHelpButton } from '@/components/tour-help-button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { queryKeys } from '@/lib/query-keys';
import { useTour } from '@/hooks/use-tour';
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
import { getUtcDayRangeFromDateKey, isValidIanaTimeZone, toDateKeyInTimeZone } from '@/lib/time-zone';
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
 * Initial URL filters resolved on the server page.
 */
export interface AttendancePageInitialFilters {
	/** Optional employee filter id */
	employeeId?: string;
	/** Optional start date key (YYYY-MM-DD) */
	from?: string;
	/** Optional end date key (YYYY-MM-DD) */
	to?: string;
	/** Optional source marker */
	source?: string;
	/** Optional employee id used for return navigation */
	returnEmployeeId?: string;
	/** Optional tab used for return navigation */
	returnTab?: EmployeeDetailTab;
	/** Optional timezone contract for deep-link date keys */
	timeZone?: string;
}

interface AttendancePageClientProps {
	initialFilters?: AttendancePageInitialFilters;
}

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
 * Validates and normalizes an optional date-key value.
 *
 * @param value - Candidate date key
 * @returns Parsed date or null when invalid
 */
function normalizeDateKey(value: string | undefined): Date | null {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return null;
	}
	return parseDateKey(value) ?? null;
}

/**
 * Validates and normalizes an optional date-key value as string.
 *
 * @param value - Candidate date key
 * @returns Normalized date key string or null when invalid
 */
function normalizeDateKeyString(value: string | undefined): string | null {
	const parsed = normalizeDateKey(value);
	if (!parsed) {
		return null;
	}
	return format(parsed, 'yyyy-MM-dd');
}

/**
 * Resolves an optional attendance timezone from initial filters.
 *
 * @param value - Candidate timezone
 * @returns Valid IANA timezone or undefined
 */
function resolveAttendanceTimeZone(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}
	return isValidIanaTimeZone(value) ? value : undefined;
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
export function AttendancePageClient({
	initialFilters,
}: AttendancePageClientProps): React.ReactElement {
	const { organizationId, organizationRole } = useOrgContext();
	const queryClient = useQueryClient();
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const t = useTranslations('Attendance');
	useTour('attendance');
	const initialStartDateKey =
		normalizeDateKeyString(initialFilters?.from) ?? format(startOfDay(new Date()), 'yyyy-MM-dd');
	const initialEndDateKey =
		normalizeDateKeyString(initialFilters?.to) ?? format(endOfDay(new Date()), 'yyyy-MM-dd');
	const initialDatePreset: DatePreset =
		initialFilters?.from || initialFilters?.to ? 'custom' : 'today';
	const initialEmployeeFilter = initialFilters?.employeeId?.trim() ?? '';
	const [globalFilter, setGlobalFilter] = useState<string>('');
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [datePreset, setDatePreset] = useState<DatePreset>(initialDatePreset);
	const [startDate, setStartDate] = useState<string>(initialStartDateKey);
	const [endDate, setEndDate] = useState<string>(initialEndDateKey);
	const [employeeFilterId, setEmployeeFilterId] = useState<string>(initialEmployeeFilter);
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
	const navigationSource = initialFilters?.source ?? null;
	const returnEmployeeId = initialFilters?.returnEmployeeId ?? null;
	const returnTab = initialFilters?.returnTab ?? 'attendance';
	const deepLinkTimeZone = resolveAttendanceTimeZone(initialFilters?.timeZone);

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

	const startDateValue = useMemo(() => normalizeDateKey(startDate) ?? undefined, [startDate]);
	const endDateValue = useMemo(() => normalizeDateKey(endDate) ?? undefined, [endDate]);

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
					if (deepLinkTimeZone) {
						const fallbackDateKey = toDateKeyInTimeZone(now, deepLinkTimeZone);
						const startKey = normalizeDateKeyString(startDate) ?? fallbackDateKey;
						const endKey = normalizeDateKeyString(endDate) ?? fallbackDateKey;
						start = getUtcDayRangeFromDateKey(startKey, deepLinkTimeZone).startUtc;
						end = getUtcDayRangeFromDateKey(endKey, deepLinkTimeZone).endUtc;
						break;
					}

					// Ensure we always have valid dates even if inputs are empty.
					const parsedStartDate = normalizeDateKey(startDate) ?? undefined;
					const parsedEndDate = normalizeDateKey(endDate) ?? undefined;

					start = startOfDay(parsedStartDate ?? now);
					end = endOfDay(parsedEndDate ?? now);
					break;
			}

			return { start, end };
		},
		[startDate, endDate, deepLinkTimeZone],
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
		...(employeeFilterId ? { employeeId: employeeFilterId } : {}),
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
		queryKey: queryKeys.employees.list({
			organizationId,
			status: 'ACTIVE',
			limit: ACTIVE_EMPLOYEES_PAGE_SIZE,
			offset: 0,
		}),
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
	const activeEmployees = useMemo(
		() => activeEmployeesQuery.data ?? [],
		[activeEmployeesQuery.data],
	);
	const employeeFilterLabel = useMemo(() => {
		if (!employeeFilterId) {
			return null;
		}

		const employeeMatch = activeEmployees.find((employee) => employee.id === employeeFilterId);
		if (employeeMatch) {
			return `${employeeMatch.firstName} ${employeeMatch.lastName}`.trim();
		}

		return t('employeeFilter.fallback', {
			id: employeeFilterId.slice(0, 8),
		});
	}, [activeEmployees, employeeFilterId, t]);

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
			const createdOffsiteDateKey = offsiteDateKey;
			toast.success(t('offsite.toast.createSuccess'));
			setDatePreset('custom');
			setStartDate(createdOffsiteDateKey);
			setEndDate(createdOffsiteDateKey);
			setPagination((prev) => ({ ...prev, pageIndex: 0 }));
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
			if (value !== 'WORK_OFFSITE' && offsiteDayKindFilter !== ALL_OFFSITE_DAY_KIND_VALUE) {
				setOffsiteDayKindFilter(ALL_OFFSITE_DAY_KIND_VALUE);
			}
			resetPagination();
		},
		[offsiteDayKindFilter, resetPagination],
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
			if (value !== ALL_OFFSITE_DAY_KIND_VALUE && typeFilter !== 'WORK_OFFSITE') {
				setTypeFilter('WORK_OFFSITE');
			}
			resetPagination();
		},
		[typeFilter, resetPagination],
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

	/**
	 * Removes the fixed employee filter applied from URL context.
	 *
	 * @returns void
	 */
	const handleRemoveEmployeeFilter = useCallback((): void => {
		setEmployeeFilterId('');
		resetPagination();

		const nextParams = new URLSearchParams(searchParams.toString());
		nextParams.delete('employeeId');
		const nextQuery = nextParams.toString();
		router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
	}, [pathname, resetPagination, router, searchParams]);

	/**
	 * Navigates back to the employee detail context when available.
	 *
	 * @returns void
	 */
	const handleReturnToEmployees = useCallback((): void => {
		if (!returnEmployeeId) {
			return;
		}

		const params = new URLSearchParams();
		params.set('source', 'attendance');
		params.set('returnEmployeeId', returnEmployeeId);
		params.set('returnTab', returnTab);
		router.push(`/employees?${params.toString()}`);
	}, [returnEmployeeId, returnTab, router]);

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
				...(employeeFilterId ? { employeeId: employeeFilterId } : {}),
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
		employeeFilterId,
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
				<ResponsivePageHeader title={t('title')} />
				<p className="text-muted-foreground">{t('noOrganization')}</p>
			</div>
		);
	}

	/**
	 * Renders the action controls for an attendance record.
	 *
	 * @param record - Attendance record receiving the actions
	 * @returns Action buttons or null when the record is not editable
	 */
	const renderAttendanceActions = (record: AttendanceRecord): React.ReactElement | null => {
		if (!canManageOffsite || record.type !== 'WORK_OFFSITE') {
			return null;
		}

		return (
			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="h-11 w-11"
					onClick={() => openEditOffsiteDialog(record)}
				>
					<Pencil className="h-4 w-4" />
				</Button>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="h-11 w-11 text-destructive hover:text-destructive"
					onClick={() => handleRequestDeleteOffsite(record.id)}
					disabled={deleteOffsiteMutation.isPending}
				>
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>
		);
	};

	/**
	 * Renders the mobile attendance card used by the responsive data view.
	 *
	 * @param record - Attendance record to display
	 * @returns Mobile card content
	 */
	const renderAttendanceCard = (record: AttendanceRecord): React.ReactElement => {
		const actions = renderAttendanceActions(record);
		return (
			<div className="space-y-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 space-y-1">
						<p className="text-base font-semibold leading-tight">{record.employeeName}</p>
						<p className="font-mono text-xs text-muted-foreground">{record.employeeId}</p>
					</div>
					<Badge variant={typeVariants[record.type]}>
						{getAttendanceTypeLabel(t, record.type)}
					</Badge>
				</div>

				<div className="grid gap-3 text-sm">
					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground">{t('table.headers.offsiteDayKind')}</span>
						<span className="text-right font-medium">
							{getOffsiteDayKindLabel(t, record.offsiteDayKind ?? null)}
						</span>
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground">{t('table.headers.time')}</span>
						<span className="font-medium">
							{format(new Date(record.timestamp), 'HH:mm:ss')}
						</span>
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground">{t('table.headers.date')}</span>
						<span className="text-right font-medium">
							{format(new Date(record.timestamp), t('dateFormat'))}
						</span>
					</div>
					<div className="space-y-2">
						<span className="text-muted-foreground">{t('table.headers.actions')}</span>
						{actions ? actions : <p className="text-sm font-medium text-muted-foreground">-</p>}
					</div>
				</div>
			</div>
		);
	};

	return (
		<div className="min-w-0 space-y-6">
			<ResponsivePageHeader
				title={t('title')}
				description={t('subtitle')}
				actions={
					<div data-tour="attendance-actions" className="flex flex-wrap gap-2">
						<TourHelpButton tourId="attendance" />
						{navigationSource === 'employee-dialog' && returnEmployeeId ? (
							<Button variant="outline" onClick={handleReturnToEmployees}>
								{t('actions.returnToEmployee')}
							</Button>
						) : null}
						{canManageOffsite ? (
							<Button onClick={openCreateOffsiteDialog}>
								<Plus className="mr-2 h-4 w-4" />
								{t('actions.registerOffsite')}
							</Button>
						) : null}
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
				}
			/>

			<div data-tour="attendance-filters" className="grid gap-3 min-[1025px]:grid-cols-2 xl:grid-cols-5">
				{employeeFilterId && employeeFilterLabel ? (
					<Badge
						variant="secondary"
						className="flex min-h-11 items-center gap-2 rounded-2xl px-3 py-2 xl:col-span-5"
					>
						<span>{t('employeeFilter.label', { employee: employeeFilterLabel })}</span>
						<button
							type="button"
							onClick={handleRemoveEmployeeFilter}
							className="rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							aria-label={t('employeeFilter.remove')}
						>
							<X className="h-3.5 w-3.5" />
						</button>
					</Badge>
				) : null}

				<div className="relative min-w-0 xl:col-span-2">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder={t('search.placeholder')}
						value={globalFilter}
						onChange={(e) => handleGlobalFilterChange(e.target.value)}
						className="min-h-11 pl-9"
					/>
				</div>

				<div className="grid gap-2">
					<CalendarIcon className="h-4 w-4 text-muted-foreground" />
					<Select value={datePreset} onValueChange={handlePresetChange}>
						<SelectTrigger className="min-h-11 w-full">
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

				{datePreset === 'custom' ? (
					<div className="grid gap-3 min-[1025px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:col-span-2">
						<Popover>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									data-empty={!startDateValue}
									className="data-[empty=true]:text-muted-foreground min-h-11 w-full justify-start text-left font-normal"
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
						<span className="hidden self-center text-center text-sm text-muted-foreground min-[1025px]:block">
							{t('dateRange.to')}
						</span>
						<Popover>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									data-empty={!endDateValue}
									className="data-[empty=true]:text-muted-foreground min-h-11 w-full justify-start text-left font-normal"
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
					</div>
				) : null}

				<Select value={typeFilter} onValueChange={handleTypeFilterChange}>
					<SelectTrigger className="min-h-11 w-full">
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
					<SelectTrigger className="min-h-11 w-full">
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
					<SelectTrigger className="min-h-11 w-full">
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

			<div data-tour="attendance-list">
				<ResponsiveDataView
					columns={columns}
					data={records}
					cardRenderer={renderAttendanceCard}
					getCardKey={(record) => record.id}
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
			</div>

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
