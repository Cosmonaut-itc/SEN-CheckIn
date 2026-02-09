'use client';

import {
	createEmployee,
	deleteEmployee,
	previewEmployeeTermination,
	terminateEmployee,
	updateEmployee,
} from '@/actions/employees';
import { deleteRekognitionUser } from '@/actions/employees-rekognition';
import { DataTable } from '@/components/data-table/data-table';
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
	type Employee,
	type EmployeeScheduleEntry,
	type EmployeeStatus,
	type EmployeeTerminationSettlementRecord,
	type JobPosition,
	type Location,
	type OrganizationMember,
	type PtuHistoryRecord,
	fetchEmployeeAudit,
	fetchEmployeeById,
	fetchEmployeeInsights,
	fetchEmployeePtuHistory,
	fetchEmployeeTerminationSettlement,
	fetchEmployeesList,
	fetchJobPositionsList,
	fetchLocationsList,
	fetchOrganizationMembers,
	fetchPayrollSettings,
	upsertEmployeePtuHistory,
} from '@/lib/client-functions';
import { formatDateRangeUtc, formatShortDateUtc } from '@/lib/date-format';
import { useAppForm, useStore } from '@/lib/forms';
import { useOrgContext } from '@/lib/org-client-context';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import type {
	EmployeeTerminationSettlement,
	EmploymentContractType,
	TerminationReason,
} from '@sen-checkin/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
	ColumnDef,
	ColumnFiltersState,
	PaginationState,
	RowSelectionState,
	SortingState,
} from '@tanstack/react-table';
import { format, isAfter, isValid, parse, startOfDay, startOfMonth } from 'date-fns';
import {
	Calendar as CalendarIcon,
	Eye,
	FileText,
	HelpCircle,
	Loader2,
	MoreHorizontal,
	Pencil,
	Plus,
	ScanFace,
	Search,
	ShieldAlert,
	Trash2,
	UserCheck,
	UserX,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

/**
 * Lazily loads the face enrollment dialog to reduce the initial bundle size.
 *
 * @returns Promise resolving to the FaceEnrollmentDialog component
 */
const loadFaceEnrollmentDialog = async () => {
	const dialogModule = await import('@/components/face-enrollment-dialog');
	return dialogModule.FaceEnrollmentDialog;
};

/**
 * Placeholder rendered while the face enrollment dialog bundle loads.
 *
 * @returns Null fallback element
 */
function FaceEnrollmentDialogFallback(): React.ReactElement | null {
	return null;
}

const FaceEnrollmentDialog = dynamic(loadFaceEnrollmentDialog, {
	ssr: false,
	loading: FaceEnrollmentDialogFallback,
});

/**
 * Lazily loads employee document workflow tab to keep initial bundle smaller.
 *
 * @returns Promise resolving to the EmployeeDocumentsTab component
 */
const loadEmployeeDocumentsTab = async () => {
	const componentModule = await import('@/components/employee-documents-tab');
	return componentModule.EmployeeDocumentsTab;
};

const EmployeeDocumentsTab = dynamic(loadEmployeeDocumentsTab, {
	ssr: false,
	loading: FaceEnrollmentDialogFallback,
});

/**
 * Lazily loads employee disciplinary tab to avoid increasing initial bundle size.
 *
 * @returns Promise resolving to EmployeeDisciplinaryMeasuresTab component
 */
const loadEmployeeDisciplinaryMeasuresTab = async () => {
	const componentModule = await import('@/components/employee-disciplinary-measures-tab');
	return componentModule.EmployeeDisciplinaryMeasuresTab;
};

const EmployeeDisciplinaryMeasuresTab = dynamic(loadEmployeeDisciplinaryMeasuresTab, {
	ssr: false,
	loading: FaceEnrollmentDialogFallback,
});

/**
 * Form values interface for creating/editing employees.
 */
type PaymentFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

interface EmployeeFormValues {
	/** Unique employee code */
	code: string;
	/** Employee's first name */
	firstName: string;
	/** Employee's last name */
	lastName: string;
	/** Employee NSS (Número de Seguridad Social) */
	nss: string;
	/** Employee RFC (Registro Federal de Contribuyentes) */
	rfc: string;
	/** Employee's email address */
	email: string;
	/** Linked user ID */
	userId: string;
	/** Employee's phone number */
	phone: string;
	/** Job position ID (required for new employees) */
	jobPositionId: string;
	/** Location ID (required for all employees) */
	locationId: string;
	/** Employee's department */
	department: string;
	/** Employee's status */
	status: EmployeeStatus;
	/** Employee hire date (YYYY-MM-DD) */
	hireDate: string;
	/** Payment frequency */
	paymentFrequency: PaymentFrequency;
	/** Pay for the full period */
	periodPay: string;
	/** Optional SBC daily override */
	sbcDailyOverride: string;
	/** Employment type for PTU eligibility */
	employmentType: 'PERMANENT' | 'EVENTUAL';
	/** Trust employee flag */
	isTrustEmployee: boolean;
	/** Director/admin/general manager flag */
	isDirectorAdminGeneralManager: boolean;
	/** Domestic worker flag */
	isDomesticWorker: boolean;
	/** Platform worker flag */
	isPlatformWorker: boolean;
	/** Annual platform hours */
	platformHoursYear: string;
	/** PTU eligibility override */
	ptuEligibilityOverride: 'DEFAULT' | 'INCLUDE' | 'EXCLUDE';
	/** Aguinaldo days override */
	aguinaldoDaysOverride: string;
	/** Employee shift type */
	shiftType: 'DIURNA' | 'NOCTURNA' | 'MIXTA';
}

/**
 * Form values for termination (finiquito) preview/confirmation.
 */
interface TerminationFormValues {
	/** Termination date key (YYYY-MM-DD). */
	terminationDateKey: string;
	/** Last day worked date key (YYYY-MM-DD). */
	lastDayWorkedDateKey: string;
	/** Termination reason. */
	terminationReason: TerminationReason;
	/** Employment contract type. */
	contractType: EmploymentContractType;
	/** Unpaid days. */
	unpaidDays: string;
	/** Other dues amount. */
	otherDue: string;
	/** Optional vacation balance override (days). */
	vacationBalanceDays: string;
	/** Optional daily salary override for indemnizations. */
	dailySalaryIndemnizacion: string;
	/** Optional termination notes. */
	terminationNotes: string;
}

type BulkToggleValue = 'UNCHANGED' | 'YES' | 'NO';
type BulkEmploymentType = 'UNCHANGED' | 'PERMANENT' | 'EVENTUAL';
type BulkPtuOverrideValue = 'UNCHANGED' | 'DEFAULT' | 'INCLUDE' | 'EXCLUDE';
type BulkOverrideMode = 'UNCHANGED' | 'SET' | 'CLEAR';

/**
 * Bulk edit form values for employee PTU/Aguinaldo fields.
 */
interface BulkEditValues {
	/** Employment type override. */
	employmentType: BulkEmploymentType;
	/** Trust employee override. */
	isTrustEmployee: BulkToggleValue;
	/** Director/admin/general manager override. */
	isDirectorAdminGeneralManager: BulkToggleValue;
	/** Domestic worker override. */
	isDomesticWorker: BulkToggleValue;
	/** Platform worker override. */
	isPlatformWorker: BulkToggleValue;
	/** Platform hours override (string for input). */
	platformHoursYear: string;
	/** PTU eligibility override. */
	ptuEligibilityOverride: BulkPtuOverrideValue;
	/** Aguinaldo override mode. */
	aguinaldoOverrideMode: BulkOverrideMode;
	/** Aguinaldo days override input. */
	aguinaldoDaysOverride: string;
}

type TerminationDateFieldProps = {
	label: string;
	placeholder?: string;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	minYear?: number;
	maxDate?: Date;
};

/**
 * Standalone date field for the finiquito form.
 *
 * @param props - Date field props including value and date constraints.
 * @returns A rendered date field with input and calendar popover.
 */
function TerminationDateField({
	label,
	placeholder,
	value,
	onChange,
	disabled,
	minYear = 1950,
	maxDate,
}: TerminationDateFieldProps): React.ReactElement {
	const tCommon = useTranslations('Common');
	const resolvedPlaceholder = placeholder ?? label;
	const parsedValue = useMemo(
		() => (value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined),
		[value],
	);
	const isParsedValid =
		parsedValue !== undefined &&
		isValid(parsedValue) &&
		format(parsedValue, 'yyyy-MM-dd') === value;
	const selectedDateKey = isParsedValid ? value : '';
	const selectedDate = useMemo(
		() => (selectedDateKey ? parse(selectedDateKey, 'yyyy-MM-dd', new Date()) : undefined),
		[selectedDateKey],
	);
	const resolvedMaxDate = useMemo(
		() => (maxDate ? startOfDay(maxDate) : startOfDay(new Date())),
		[maxDate],
	);
	const startMonth = useMemo(() => new Date(minYear, 0, 1), [minYear]);
	const [open, setOpen] = useState(false);
	const initialMonth = selectedDate ?? resolvedMaxDate ?? new Date();
	const [month, setMonth] = useState<Date>(() => startOfMonth(initialMonth));

	/* eslint-disable react-hooks/set-state-in-effect */
	useEffect(() => {
		if (!selectedDate) {
			return;
		}
		setMonth((current) => {
			const currentYear = current.getFullYear();
			const currentMonth = current.getMonth();
			const nextYear = selectedDate.getFullYear();
			const nextMonth = selectedDate.getMonth();
			if (currentYear === nextYear && currentMonth === nextMonth) {
				return current;
			}
			return startOfMonth(selectedDate);
		});
	}, [selectedDate, selectedDateKey]);
	/* eslint-enable react-hooks/set-state-in-effect */

	const calendarRangeProps: {
		startMonth?: Date;
		endMonth?: Date;
		disabled?: React.ComponentProps<typeof Calendar>['disabled'];
	} = {};

	if (startMonth) {
		calendarRangeProps.startMonth = startMonth;
	}

	if (resolvedMaxDate) {
		calendarRangeProps.endMonth = resolvedMaxDate;
		calendarRangeProps.disabled = { after: resolvedMaxDate };
	}

	return (
		<div className="space-y-2">
			<Label>{label}</Label>
			<Popover open={open} onOpenChange={setOpen}>
				<div className="relative">
					<Input
						value={value}
						onChange={(event) => {
							const nextValue = event.target.value;
							onChange(nextValue);
							const nextParsed = nextValue
								? parse(nextValue, 'yyyy-MM-dd', new Date())
								: undefined;
							const isNextValid =
								nextParsed !== undefined &&
								isValid(nextParsed) &&
								format(nextParsed, 'yyyy-MM-dd') === nextValue;
							if (isNextValid) {
								setMonth(startOfMonth(nextParsed));
							}
						}}
						placeholder={resolvedPlaceholder}
						disabled={disabled}
						className="pr-10"
					/>
					<PopoverTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="absolute right-1 top-1/2 -translate-y-1/2"
							disabled={disabled}
							aria-label={tCommon('selectDate')}
						>
							<CalendarIcon className="h-4 w-4" />
							<span className="sr-only">{tCommon('selectDate')}</span>
						</Button>
					</PopoverTrigger>
				</div>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="single"
						selected={selectedDate}
						onSelect={(date) => {
							onChange(date ? format(date, 'yyyy-MM-dd') : '');
							if (date) {
								setMonth(startOfMonth(date));
							}
						}}
						initialFocus
						captionLayout="dropdown"
						month={month}
						onMonthChange={(nextMonth) => setMonth(startOfMonth(nextMonth))}
						{...calendarRangeProps}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}

/**
 * Props for the memoized employees table section.
 */
interface EmployeesTableSectionProps {
	/** Search term for filtering employees. */
	search: string;
	/** Callback to update the search term. */
	onSearchChange: React.Dispatch<React.SetStateAction<string>>;
	/** Current location filter value. */
	locationFilter: string;
	/** Callback to update the location filter. */
	onLocationFilterChange: (value: string) => void;
	/** Whether locations are still loading. */
	isLoadingLocations: boolean;
	/** Options for the location filter. */
	locationFilterOptions: { value: string; label: string }[];
	/** Current job position filter value. */
	jobPositionFilter: string;
	/** Callback to update the job position filter. */
	onJobPositionFilterChange: (value: string) => void;
	/** Whether job positions are still loading. */
	isLoadingJobPositions: boolean;
	/** Options for the job position filter. */
	jobPositionFilterOptions: { value: string; label: string }[];
	/** Current status filter value. */
	statusFilter: StatusFilterValue;
	/** Callback to update the status filter. */
	onStatusFilterChange: (value: StatusFilterValue) => void;
	/** Options for the status filter. */
	statusFilterOptions: { value: StatusFilterValue; label: string }[];
	/** Table column definitions. */
	columns: ColumnDef<Employee>[];
	/** Employee rows to display. */
	employees: Employee[];
	/** Current sorting state. */
	sorting: SortingState;
	/** Callback to update sorting state. */
	onSortingChange: React.Dispatch<React.SetStateAction<SortingState>>;
	/** Current pagination state. */
	pagination: PaginationState;
	/** Callback to update pagination state. */
	onPaginationChange: React.Dispatch<React.SetStateAction<PaginationState>>;
	/** Current column filter state. */
	columnFilters: ColumnFiltersState;
	/** Callback to update column filters. */
	onColumnFiltersChange: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
	/** Total number of rows for server pagination. */
	rowCount: number;
	/** Loading indicator for table content. */
	isLoading: boolean;
	/** Empty state label for the table. */
	emptyState: string;
	/** Search input placeholder. */
	searchPlaceholder: string;
	/** Location filter placeholder. */
	locationPlaceholder: string;
	/** Job position filter placeholder. */
	jobPositionPlaceholder: string;
	/** Status filter placeholder. */
	statusPlaceholder: string;
	/** Optional bulk actions node. */
	bulkActions?: React.ReactNode;
	/** Row selection state for bulk actions. */
	rowSelection?: RowSelectionState;
	/** Row selection change handler. */
	onRowSelectionChange?: React.Dispatch<React.SetStateAction<RowSelectionState>>;
	/** Optional row id resolver for selection. */
	getRowId?: (row: Employee, index: number) => string;
}

/**
 * Memoized table section to avoid rerendering on unrelated state changes.
 *
 * @param props - Table section props.
 * @returns The employees table section React element.
 */
function EmployeesTableSection({
	search,
	onSearchChange,
	locationFilter,
	onLocationFilterChange,
	isLoadingLocations,
	locationFilterOptions,
	jobPositionFilter,
	onJobPositionFilterChange,
	isLoadingJobPositions,
	jobPositionFilterOptions,
	statusFilter,
	onStatusFilterChange,
	statusFilterOptions,
	columns,
	employees,
	sorting,
	onSortingChange,
	pagination,
	onPaginationChange,
	columnFilters,
	onColumnFiltersChange,
	rowCount,
	isLoading,
	emptyState,
	searchPlaceholder,
	locationPlaceholder,
	jobPositionPlaceholder,
	statusPlaceholder,
	bulkActions,
	rowSelection,
	onRowSelectionChange,
	getRowId,
}: EmployeesTableSectionProps): React.ReactElement {
	return (
		<div className="space-y-4">
			{bulkActions ? <div className="rounded-md border bg-muted/30 p-3">{bulkActions}</div> : null}
			<div className="flex flex-wrap items-center gap-4">
				<div className="relative flex-1 max-w-sm">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder={searchPlaceholder}
						value={search}
						onChange={(event) => onSearchChange(event.target.value)}
						className="pl-9"
					/>
				</div>
				<Select
					value={locationFilter}
					onValueChange={onLocationFilterChange}
					disabled={isLoadingLocations}
				>
					<SelectTrigger className="w-[200px]">
						<SelectValue placeholder={locationPlaceholder} />
					</SelectTrigger>
					<SelectContent>
						{locationFilterOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={jobPositionFilter}
					onValueChange={onJobPositionFilterChange}
					disabled={isLoadingJobPositions}
				>
					<SelectTrigger className="w-[200px]">
						<SelectValue placeholder={jobPositionPlaceholder} />
					</SelectTrigger>
					<SelectContent>
						{jobPositionFilterOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={statusFilter}
					onValueChange={(value) => onStatusFilterChange(value as StatusFilterValue)}
				>
					<SelectTrigger className="w-[170px]">
						<SelectValue placeholder={statusPlaceholder} />
					</SelectTrigger>
					<SelectContent>
						{statusFilterOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<DataTable
				columns={columns}
				data={employees}
				sorting={sorting}
				onSortingChange={onSortingChange}
				pagination={pagination}
				onPaginationChange={onPaginationChange}
				columnFilters={columnFilters}
				onColumnFiltersChange={onColumnFiltersChange}
				globalFilter={search}
				onGlobalFilterChange={onSearchChange}
				showToolbar={false}
				manualPagination
				manualFiltering
				rowCount={rowCount}
				emptyState={emptyState}
				isLoading={isLoading}
				rowSelection={rowSelection}
				onRowSelectionChange={onRowSelectionChange}
				enableRowSelection={Boolean(onRowSelectionChange)}
				getRowId={getRowId}
			/>
		</div>
	);
}

const MemoizedEmployeesTableSection = React.memo(EmployeesTableSection);

/**
 * Initial empty form values.
 */
const initialFormValues: EmployeeFormValues = {
	code: '',
	firstName: '',
	lastName: '',
	nss: '',
	rfc: '',
	email: '',
	userId: 'none',
	phone: '',
	jobPositionId: '',
	locationId: '',
	department: '',
	status: 'ACTIVE',
	hireDate: '',
	paymentFrequency: 'MONTHLY',
	periodPay: '',
	sbcDailyOverride: '',
	employmentType: 'PERMANENT',
	isTrustEmployee: false,
	isDirectorAdminGeneralManager: false,
	isDomesticWorker: false,
	isPlatformWorker: false,
	platformHoursYear: '',
	ptuEligibilityOverride: 'DEFAULT',
	aguinaldoDaysOverride: '',
	shiftType: 'DIURNA',
};

/**
 * Builds default termination form values for the finiquito tab.
 *
 * @returns Default termination form values
 */
function createDefaultTerminationFormValues(): TerminationFormValues {
	return {
		terminationDateKey: format(new Date(), 'yyyy-MM-dd'),
		lastDayWorkedDateKey: '',
		terminationReason: 'voluntary_resignation',
		contractType: 'indefinite',
		unpaidDays: '0',
		otherDue: '0',
		vacationBalanceDays: '',
		dailySalaryIndemnizacion: '',
		terminationNotes: '',
	};
}

/**
 * Builds default bulk edit values for employee overrides.
 *
 * @returns Default bulk edit values
 */
function createDefaultBulkEditValues(): BulkEditValues {
	return {
		employmentType: 'UNCHANGED',
		isTrustEmployee: 'UNCHANGED',
		isDirectorAdminGeneralManager: 'UNCHANGED',
		isDomesticWorker: 'UNCHANGED',
		isPlatformWorker: 'UNCHANGED',
		platformHoursYear: '',
		ptuEligibilityOverride: 'UNCHANGED',
		aguinaldoOverrideMode: 'UNCHANGED',
		aguinaldoDaysOverride: '',
	};
}

/**
 * Resolves a tri-state bulk toggle into a boolean update.
 *
 * @param value - Tri-state toggle value
 * @returns Boolean override or undefined when unchanged
 */
function resolveBulkToggleValue(value: BulkToggleValue): boolean | undefined {
	if (value === 'YES') {
		return true;
	}
	if (value === 'NO') {
		return false;
	}
	return undefined;
}

const daysOfWeek: { labelKey: string; value: number }[] = [
	{ labelKey: 'days.sunday', value: 0 },
	{ labelKey: 'days.monday', value: 1 },
	{ labelKey: 'days.tuesday', value: 2 },
	{ labelKey: 'days.wednesday', value: 3 },
	{ labelKey: 'days.thursday', value: 4 },
	{ labelKey: 'days.friday', value: 5 },
	{ labelKey: 'days.saturday', value: 6 },
];

const shiftTypeOptions: { value: 'DIURNA' | 'NOCTURNA' | 'MIXTA'; labelKey: string }[] = [
	{ value: 'DIURNA', labelKey: 'shiftTypes.DIURNA' },
	{ value: 'NOCTURNA', labelKey: 'shiftTypes.NOCTURNA' },
	{ value: 'MIXTA', labelKey: 'shiftTypes.MIXTA' },
];

const employmentTypeOptions: { value: 'PERMANENT' | 'EVENTUAL'; labelKey: string }[] = [
	{ value: 'PERMANENT', labelKey: 'employmentType.PERMANENT' },
	{ value: 'EVENTUAL', labelKey: 'employmentType.EVENTUAL' },
];

const ptuEligibilityOptions: {
	value: 'DEFAULT' | 'INCLUDE' | 'EXCLUDE';
	labelKey: string;
}[] = [
	{ value: 'DEFAULT', labelKey: 'ptuEligibility.DEFAULT' },
	{ value: 'INCLUDE', labelKey: 'ptuEligibility.INCLUDE' },
	{ value: 'EXCLUDE', labelKey: 'ptuEligibility.EXCLUDE' },
];

const terminationReasonOptions: { value: TerminationReason; labelKey: string }[] = [
	{ value: 'voluntary_resignation', labelKey: 'terminationReasons.voluntary_resignation' },
	{ value: 'justified_rescission', labelKey: 'terminationReasons.justified_rescission' },
	{ value: 'unjustified_dismissal', labelKey: 'terminationReasons.unjustified_dismissal' },
	{ value: 'end_of_contract', labelKey: 'terminationReasons.end_of_contract' },
	{ value: 'mutual_agreement', labelKey: 'terminationReasons.mutual_agreement' },
	{ value: 'death', labelKey: 'terminationReasons.death' },
];

const contractTypeOptions: { value: EmploymentContractType; labelKey: string }[] = [
	{ value: 'indefinite', labelKey: 'contractTypes.indefinite' },
	{ value: 'fixed_term', labelKey: 'contractTypes.fixed_term' },
	{ value: 'specific_work', labelKey: 'contractTypes.specific_work' },
];

const ALL_FILTER_VALUE = '__all__';

type StatusFilterValue = EmployeeStatus | typeof ALL_FILTER_VALUE;

type EmployeeDialogMode = 'create' | 'view' | 'edit';
type EmployeeDetailTab =
	| 'documents'
	| 'disciplinary'
	| 'summary'
	| 'attendance'
	| 'vacations'
	| 'payroll'
	| 'ptu'
	| 'finiquito'
	| 'exceptions'
	| 'audit';

/**
 * Generates a default Monday-Friday schedule 09:00-17:00.
 *
 * @returns Default schedule entries for the week
 */
function createDefaultSchedule(): EmployeeScheduleEntry[] {
	return daysOfWeek.map((day) => ({
		dayOfWeek: day.value,
		startTime: '09:00',
		endTime: '17:00',
		isWorkingDay: day.value >= 1 && day.value <= 5,
	}));
}

/**
 * Parses a date key into a UTC Date instance.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Date instance at UTC midnight
 */
function toUtcDate(dateKey: string): Date {
	return new Date(`${dateKey}T00:00:00Z`);
}

/**
 * Validates a date key string in YYYY-MM-DD format.
 *
 * @param value - Date key string to validate
 * @returns True when the value is a valid date key
 */
function isValidDateKey(value: string): boolean {
	if (!value.trim()) {
		return false;
	}
	const parsed = parse(value, 'yyyy-MM-dd', new Date());
	return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === value;
}

/**
 * Formats a numeric value as MXN currency.
 *
 * @param value - Amount in MXN
 * @returns Localized currency string
 */
function formatCurrency(value: number): string {
	return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
}

/**
 * Resolves the divisor for a payment frequency.
 *
 * @param frequency - Payment frequency selection
 * @returns Day divisor for the period
 */
function getPayPeriodDivisor(frequency: PaymentFrequency): 7 | 14 | 30 {
	switch (frequency) {
		case 'WEEKLY':
			return 7;
		case 'BIWEEKLY':
			return 14;
		case 'MONTHLY':
		default:
			return 30;
	}
}

/**
 * Rounds a numeric value to two decimals.
 *
 * @param value - Raw numeric value
 * @returns Rounded numeric value
 */
function roundToTwoDecimals(value: number): number {
	return Number(value.toFixed(2));
}

/**
 * Calculates daily pay from a period pay amount and frequency.
 *
 * @param periodPay - Total pay for the period
 * @param frequency - Payment frequency selection
 * @returns Daily pay rounded to two decimals
 */
function calculateDailyPayFromPeriodPay(periodPay: number, frequency: PaymentFrequency): number {
	const divisor = getPayPeriodDivisor(frequency);
	return roundToTwoDecimals(periodPay / divisor);
}

/**
 * Calculates period pay from a daily pay amount and frequency.
 *
 * @param dailyPay - Daily pay amount
 * @param frequency - Payment frequency selection
 * @returns Period pay rounded to two decimals
 */
function calculatePeriodPayFromDailyPay(dailyPay: number, frequency: PaymentFrequency): number {
	const divisor = getPayPeriodDivisor(frequency);
	return roundToTwoDecimals(dailyPay * divisor);
}

/**
 * Extracts created employee id from server action payload.
 *
 * @param payload - Raw mutation payload
 * @returns Employee id when available
 */
function extractCreatedEmployeeId(payload: unknown): string | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const dataRecord = payload as { data?: unknown; id?: unknown };
	if (typeof dataRecord.id === 'string' && dataRecord.id.length > 0) {
		return dataRecord.id;
	}

	if (dataRecord.data && typeof dataRecord.data === 'object') {
		const nested = dataRecord.data as { id?: unknown };
		if (typeof nested.id === 'string' && nested.id.length > 0) {
			return nested.id;
		}
	}

	return null;
}

/**
 * Status badge variant mapping.
 */
const statusVariants: Record<EmployeeStatus, 'default' | 'secondary' | 'outline'> = {
	ACTIVE: 'default',
	INACTIVE: 'secondary',
	ON_LEAVE: 'outline',
};

const EMPTY_LOCATIONS: Location[] = [];
const EMPTY_MEMBERS: OrganizationMember[] = [];
const EMPTY_EMPLOYEES: Employee[] = [];

/**
 * Employees page client component.
 * Provides CRUD operations for employee management using TanStack Query.
 *
 * @returns The employees page JSX element
 */
export function EmployeesPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId, organizationRole, userRole } = useOrgContext();
	const t = useTranslations('Employees');
	const tCommon = useTranslations('Common');
	const tVacations = useTranslations('Vacations');
	const [search, setSearch] = useState<string>('');
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [locationFilter, setLocationFilter] = useState<string>(ALL_FILTER_VALUE);
	const [jobPositionFilter, setJobPositionFilter] = useState<string>(ALL_FILTER_VALUE);
	const [statusFilter, setStatusFilter] = useState<StatusFilterValue>(ALL_FILTER_VALUE);
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [dialogMode, setDialogMode] = useState<EmployeeDialogMode>('create');
	const [activeEmployee, setActiveEmployee] = useState<Employee | null>(null);
	const [detailTab, setDetailTab] = useState<EmployeeDetailTab>('summary');
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const [enrollingEmployee, setEnrollingEmployee] = useState<Employee | null>(null);
	const [isEnrollDialogOpen, setIsEnrollDialogOpen] = useState<boolean>(false);
	const [deleteRekognitionConfirmId, setDeleteRekognitionConfirmId] = useState<string | null>(
		null,
	);
	const [hasCustomCode, setHasCustomCode] = useState<boolean>(false);
	const [schedule, setSchedule] = useState<EmployeeScheduleEntry[]>(createDefaultSchedule());
	const [isScheduleLoading, setIsScheduleLoading] = useState<boolean>(false);
	const [terminationForm, setTerminationForm] = useState<TerminationFormValues>(
		createDefaultTerminationFormValues(),
	);
	const [terminationPreview, setTerminationPreview] =
		useState<EmployeeTerminationSettlement | null>(null);
	const [isTerminateDialogOpen, setIsTerminateDialogOpen] = useState<boolean>(false);
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [isBulkEditOpen, setIsBulkEditOpen] = useState<boolean>(false);
	const [bulkEditValues, setBulkEditValues] = useState<BulkEditValues>(
		createDefaultBulkEditValues(),
	);
	const [ptuHistoryYearInput, setPtuHistoryYearInput] = useState<string>('');
	const [ptuHistoryAmountInput, setPtuHistoryAmountInput] = useState<string>('');

	const isCreateMode = dialogMode === 'create';
	const isEditMode = dialogMode === 'edit';
	const isViewMode = dialogMode === 'view';
	const ptuAguinaldoOptionHelp = useMemo<
		{ key: string; label: string; description: string }[]
	>(
		() => [
			{
				key: 'employmentTypePermanent',
				label: t('employmentType.PERMANENT'),
				description: t('ptuAguinaldo.optionsHelp.employmentTypePermanent'),
			},
			{
				key: 'employmentTypeEventual',
				label: t('employmentType.EVENTUAL'),
				description: t('ptuAguinaldo.optionsHelp.employmentTypeEventual'),
			},
			{
				key: 'ptuEligibilityDefault',
				label: t('ptuEligibility.DEFAULT'),
				description: t('ptuAguinaldo.optionsHelp.ptuEligibilityDefault'),
			},
			{
				key: 'ptuEligibilityInclude',
				label: t('ptuEligibility.INCLUDE'),
				description: t('ptuAguinaldo.optionsHelp.ptuEligibilityInclude'),
			},
			{
				key: 'ptuEligibilityExclude',
				label: t('ptuEligibility.EXCLUDE'),
				description: t('ptuAguinaldo.optionsHelp.ptuEligibilityExclude'),
			},
			{
				key: 'isTrustEmployee',
				label: t('fields.isTrustEmployee'),
				description: t('ptuAguinaldo.optionsHelp.isTrustEmployee'),
			},
			{
				key: 'isDirectorAdminGeneralManager',
				label: t('fields.isDirectorAdminGeneralManager'),
				description: t('ptuAguinaldo.optionsHelp.isDirectorAdminGeneralManager'),
			},
			{
				key: 'isDomesticWorker',
				label: t('fields.isDomesticWorker'),
				description: t('ptuAguinaldo.optionsHelp.isDomesticWorker'),
			},
			{
				key: 'isPlatformWorker',
				label: t('fields.isPlatformWorker'),
				description: t('ptuAguinaldo.optionsHelp.isPlatformWorker'),
			},
			{
				key: 'platformHoursYear',
				label: t('fields.platformHoursYear'),
				description: t('ptuAguinaldo.optionsHelp.platformHoursYear'),
			},
			{
				key: 'aguinaldoDaysOverride',
				label: t('fields.aguinaldoDaysOverride'),
				description: t('ptuAguinaldo.optionsHelp.aguinaldoDaysOverride'),
			},
			{
				key: 'sbcDailyOverride',
				label: t('fields.sbcDailyOverride'),
				description: t('ptuAguinaldo.optionsHelp.sbcDailyOverride'),
			},
		],
		[t],
	);

	// Build query params - only include search if it has a value
	const baseParams = {
		limit: pagination.pageSize,
		offset: pagination.pageIndex * pagination.pageSize,
		organizationId,
	};
	const queryParams = {
		...baseParams,
		...(search ? { search } : {}),
		...(locationFilter !== ALL_FILTER_VALUE ? { locationId: locationFilter } : {}),
		...(jobPositionFilter !== ALL_FILTER_VALUE ? { jobPositionId: jobPositionFilter } : {}),
		...(statusFilter !== ALL_FILTER_VALUE ? { status: statusFilter } : {}),
	};

	const isOrgSelected = Boolean(organizationId);
	const canAccessDisciplinary =
		userRole === 'admin' || organizationRole === 'owner' || organizationRole === 'admin';

	const { data: payrollSettings } = useQuery({
		queryKey: queryKeys.payrollSettings.current(organizationId),
		queryFn: () => fetchPayrollSettings(organizationId ?? undefined),
		enabled: isOrgSelected,
	});
	const isDisciplinaryEnabled = Boolean(payrollSettings?.enableDisciplinaryMeasures);
	const canUseDisciplinaryModule = canAccessDisciplinary && isDisciplinaryEnabled;

	// Query for employees list
	const { data, isFetching } = useQuery({
		queryKey: queryKeys.employees.list(queryParams),
		queryFn: () => fetchEmployeesList(queryParams),
		enabled: isOrgSelected,
	});

	// Query for job positions list (for the dropdown)
	const { data: jobPositionsData, isLoading: isLoadingJobPositions } = useQuery({
		queryKey: queryKeys.jobPositions.list(
			organizationId ? { limit: 100, offset: 0, organizationId } : { limit: 100, offset: 0 },
		),
		queryFn: () =>
			fetchJobPositionsList(
				organizationId
					? { limit: 100, offset: 0, organizationId }
					: { limit: 100, offset: 0 },
			),
		enabled: Boolean(organizationId),
	});

	// Query for locations list (for the dropdown)
	const { data: locationsData, isLoading: isLoadingLocations } = useQuery({
		queryKey: queryKeys.locations.list(
			organizationId ? { limit: 100, offset: 0, organizationId } : { limit: 100, offset: 0 },
		),
		queryFn: () =>
			fetchLocationsList(
				organizationId
					? { limit: 100, offset: 0, organizationId }
					: { limit: 100, offset: 0 },
			),
		enabled: Boolean(organizationId),
	});

	// Query for organization members list (for linking users)
	const { data: membersData, isLoading: isLoadingMembers } = useQuery({
		queryKey: queryKeys.organizationMembers.list({
			organizationId,
			limit: 200,
			offset: 0,
		}),
		queryFn: () =>
			fetchOrganizationMembers({
				organizationId: organizationId ?? null,
				limit: 200,
				offset: 0,
			}),
		enabled: Boolean(organizationId),
	});

	const employees = useMemo(() => data?.data ?? EMPTY_EMPLOYEES, [data?.data]);
	const totalRows = data?.pagination.total ?? 0;
	const selectedEmployeeIds = useMemo(
		() =>
			Object.entries(rowSelection)
				.filter(([, selected]) => Boolean(selected))
				.map(([id]) => id),
		[rowSelection],
	);
	const selectedEmployees = useMemo(
		() => employees.filter((employee) => selectedEmployeeIds.includes(employee.id)),
		[employees, selectedEmployeeIds],
	);
	const bulkActions = useMemo(() => {
		if (selectedEmployeeIds.length === 0) {
			return null;
		}
		return (
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-sm text-muted-foreground">
					{t('bulk.selected', { count: selectedEmployeeIds.length })}
				</p>
				<Button size="sm" onClick={() => setIsBulkEditOpen(true)}>
					{t('bulk.actions.edit')}
				</Button>
			</div>
		);
	}, [selectedEmployeeIds.length, t]);
	const jobPositions = useMemo<JobPosition[]>(
		() => jobPositionsData?.data ?? [],
		[jobPositionsData],
	);
	const locations: Location[] = locationsData?.data ?? EMPTY_LOCATIONS;
	const members: OrganizationMember[] = membersData?.members ?? EMPTY_MEMBERS;

	const insightsEnabled = Boolean(activeEmployee?.id) && isDialogOpen && !isCreateMode;
	const { data: insights, isLoading: isLoadingInsights } = useQuery({
		queryKey: queryKeys.employees.insights(activeEmployee?.id ?? ''),
		queryFn: () => fetchEmployeeInsights(activeEmployee?.id ?? ''),
		enabled: insightsEnabled,
	});

	const terminationSettlementEnabled =
		Boolean(activeEmployee?.id) &&
		isDialogOpen &&
		isViewMode &&
		activeEmployee?.status === 'INACTIVE';
	const { data: terminationSettlement, isLoading: isLoadingTerminationSettlement } = useQuery({
		queryKey: queryKeys.employees.terminationSettlement(activeEmployee?.id ?? ''),
		queryFn: () => fetchEmployeeTerminationSettlement(activeEmployee?.id ?? ''),
		enabled: terminationSettlementEnabled,
	});

	const auditParams = useMemo(
		() => ({
			employeeId: activeEmployee?.id ?? '',
			limit: 20,
			offset: 0,
		}),
		[activeEmployee?.id],
	);
	const { data: auditResponse, isLoading: isLoadingAudit } = useQuery({
		queryKey: queryKeys.employees.audit(auditParams),
		queryFn: () => fetchEmployeeAudit(auditParams),
		enabled: Boolean(activeEmployee?.id) && isDialogOpen && isViewMode,
	});

	const ptuHistoryEnabled = Boolean(activeEmployee?.id) && isDialogOpen;
	const { data: ptuHistoryData, isLoading: isLoadingPtuHistory } = useQuery({
		queryKey: queryKeys.ptu.history(activeEmployee?.id ?? ''),
		queryFn: () => fetchEmployeePtuHistory(activeEmployee?.id ?? ''),
		enabled: ptuHistoryEnabled,
	});

	const memberOptions = useMemo(() => {
		const options = members.map((member) => ({
			value: member.userId,
			label: member.user?.name
				? `${member.user.name} (${member.user.email})`
				: (member.user?.email ?? member.userId),
		}));
		options.sort((a, b) => a.label.localeCompare(b.label));
		return [{ value: 'none', label: t('placeholders.noUser') }, ...options];
	}, [members, t]);

	const locationLookup = useMemo(() => {
		return new Map<string, string>(locations.map((loc) => [loc.id, loc.name || loc.code]));
	}, [locations]);

	const activeEmployeeName = useMemo(() => {
		if (!activeEmployee) {
			return '';
		}
		return `${activeEmployee.firstName} ${activeEmployee.lastName}`.trim();
	}, [activeEmployee]);

	const isTerminationLocked = activeEmployee?.status === 'INACTIVE';
	const canConfirmTermination = Boolean(terminationPreview) && !isTerminationLocked;
	const canDownloadTerminationReceipt = Boolean(terminationSettlement);
	const terminationReceiptUrl = activeEmployee?.id
		? `/api/employees/${activeEmployee.id}/termination/receipt`
		: '#';

	const activeEmployeeLocation = useMemo(() => {
		if (!activeEmployee?.locationId) {
			return tCommon('notAvailable');
		}
		return locationLookup.get(activeEmployee.locationId) ?? activeEmployee.locationId;
	}, [activeEmployee, locationLookup, tCommon]);

	const locationFilterOptions = useMemo(
		(): { value: string; label: string }[] => [
			{ value: ALL_FILTER_VALUE, label: t('filters.location.all') },
			...locations.map((loc) => ({
				value: loc.id,
				label: loc.name || loc.code,
			})),
		],
		[locations, t],
	);

	const jobPositionFilterOptions = useMemo(
		(): { value: string; label: string }[] => [
			{ value: ALL_FILTER_VALUE, label: t('filters.jobPosition.all') },
			...jobPositions.map((position) => ({
				value: position.id,
				label: position.name,
			})),
		],
		[jobPositions, t],
	);

	const statusFilterOptions = useMemo(
		(): { value: StatusFilterValue; label: string }[] => [
			{ value: ALL_FILTER_VALUE, label: t('filters.status.all') },
			{ value: 'ACTIVE', label: t('status.ACTIVE') },
			{ value: 'INACTIVE', label: t('status.INACTIVE') },
			{ value: 'ON_LEAVE', label: t('status.ON_LEAVE') },
		],
		[t],
	);

	const bulkToggleOptions = useMemo(
		() => [
			{ value: 'UNCHANGED', label: t('bulk.options.unchanged') },
			{ value: 'YES', label: t('bulk.options.yes') },
			{ value: 'NO', label: t('bulk.options.no') },
		],
		[t],
	);

	const bulkEmploymentOptions = useMemo(
		() => [
			{ value: 'UNCHANGED', label: t('bulk.options.unchanged') },
			{ value: 'PERMANENT', label: t('employmentType.PERMANENT') },
			{ value: 'EVENTUAL', label: t('employmentType.EVENTUAL') },
		],
		[t],
	);

	const bulkPtuEligibilityOptions = useMemo(
		() => [
			{ value: 'UNCHANGED', label: t('bulk.options.unchanged') },
			{ value: 'DEFAULT', label: t('ptuEligibility.DEFAULT') },
			{ value: 'INCLUDE', label: t('ptuEligibility.INCLUDE') },
			{ value: 'EXCLUDE', label: t('ptuEligibility.EXCLUDE') },
		],
		[t],
	);

	const bulkOverrideModeOptions = useMemo(
		() => [
			{ value: 'UNCHANGED', label: t('bulk.options.unchanged') },
			{ value: 'SET', label: t('bulk.options.set') },
			{ value: 'CLEAR', label: t('bulk.options.clear') },
		],
		[t],
	);

	const bulkOptionHelp = useMemo<{ key: string; label: string; description: string }[]>(
		() => [
			{
				key: 'bulkUnchanged',
				label: t('bulk.options.unchanged'),
				description: t('bulk.optionsHelp.unchanged'),
			},
			{
				key: 'bulkYes',
				label: t('bulk.options.yes'),
				description: t('bulk.optionsHelp.yes'),
			},
			{
				key: 'bulkNo',
				label: t('bulk.options.no'),
				description: t('bulk.optionsHelp.no'),
			},
			{
				key: 'bulkSet',
				label: t('bulk.options.set'),
				description: t('bulk.optionsHelp.set'),
			},
			{
				key: 'bulkClear',
				label: t('bulk.options.clear'),
				description: t('bulk.optionsHelp.clear'),
			},
			{
				key: 'bulkPermanent',
				label: t('employmentType.PERMANENT'),
				description: t('bulk.optionsHelp.employmentTypePermanent'),
			},
			{
				key: 'bulkEventual',
				label: t('employmentType.EVENTUAL'),
				description: t('bulk.optionsHelp.employmentTypeEventual'),
			},
			{
				key: 'bulkDefault',
				label: t('ptuEligibility.DEFAULT'),
				description: t('bulk.optionsHelp.ptuEligibilityDefault'),
			},
			{
				key: 'bulkInclude',
				label: t('ptuEligibility.INCLUDE'),
				description: t('bulk.optionsHelp.ptuEligibilityInclude'),
			},
			{
				key: 'bulkExclude',
				label: t('ptuEligibility.EXCLUDE'),
				description: t('bulk.optionsHelp.ptuEligibilityExclude'),
			},
			{
				key: 'bulkPlatformHours',
				label: t('bulk.fields.platformHoursYear'),
				description: t('bulk.optionsHelp.platformHoursYear'),
			},
			{
				key: 'bulkAguinaldoOverrideMode',
				label: t('bulk.fields.aguinaldoOverrideMode'),
				description: t('bulk.optionsHelp.aguinaldoOverrideMode'),
			},
			{
				key: 'bulkAguinaldoDays',
				label: t('bulk.fields.aguinaldoDaysOverride'),
				description: t('bulk.optionsHelp.aguinaldoDaysOverride'),
			},
		],
		[t],
	);

	/**
	 * Resets pagination to the first page.
	 *
	 * @returns void
	 */
	const resetPagination = useCallback((): void => {
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}, []);

	/**
	 * Updates the search term and resets pagination.
	 *
	 * @param value - Next search value or updater
	 * @returns void
	 */
	const handleSearchChange = useCallback(
		(value: React.SetStateAction<string>): void => {
			setSearch((prev) => (typeof value === 'function' ? value(prev) : value));
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
			setLocationFilter(value);
			setColumnFilters((prev) => {
				const next = prev.filter((filter) => filter.id !== 'locationId');
				if (value !== ALL_FILTER_VALUE) {
					next.push({ id: 'locationId', value });
				}
				return next;
			});
			resetPagination();
		},
		[resetPagination],
	);

	/**
	 * Updates the job position filter and resets pagination.
	 *
	 * @param value - Selected job position filter value
	 * @returns void
	 */
	const handleJobPositionFilterChange = useCallback(
		(value: string): void => {
			setJobPositionFilter(value);
			setColumnFilters((prev) => {
				const next = prev.filter((filter) => filter.id !== 'jobPositionId');
				if (value !== ALL_FILTER_VALUE) {
					next.push({ id: 'jobPositionId', value });
				}
				return next;
			});
			resetPagination();
		},
		[resetPagination],
	);

	/**
	 * Updates the status filter and resets pagination.
	 *
	 * @param value - Selected status filter value
	 * @returns void
	 */
	const handleStatusFilterChange = useCallback(
		(value: StatusFilterValue): void => {
			setStatusFilter(value);
			setColumnFilters((prev) => {
				const next = prev.filter((filter) => filter.id !== 'status');
				if (value !== ALL_FILTER_VALUE) {
					next.push({ id: 'status', value });
				}
				return next;
			});
			resetPagination();
		},
		[resetPagination],
	);

	/**
	 * Applies bulk updates to selected employees.
	 *
	 * @returns Promise<void>
	 */
	const handleBulkApply = useCallback(async (): Promise<void> => {
		if (selectedEmployees.length === 0) {
			toast.error(t('bulk.toast.noSelection'));
			return;
		}

		const updates: Partial<Parameters<typeof updateEmployee>[0]> = {};

		if (bulkEditValues.employmentType !== 'UNCHANGED') {
			updates.employmentType = bulkEditValues.employmentType;
		}

		const trustValue = resolveBulkToggleValue(bulkEditValues.isTrustEmployee);
		if (trustValue !== undefined) {
			updates.isTrustEmployee = trustValue;
		}

		const directorValue = resolveBulkToggleValue(bulkEditValues.isDirectorAdminGeneralManager);
		if (directorValue !== undefined) {
			updates.isDirectorAdminGeneralManager = directorValue;
		}

		const domesticValue = resolveBulkToggleValue(bulkEditValues.isDomesticWorker);
		if (domesticValue !== undefined) {
			updates.isDomesticWorker = domesticValue;
		}

		const platformValue = resolveBulkToggleValue(bulkEditValues.isPlatformWorker);
		if (platformValue !== undefined) {
			updates.isPlatformWorker = platformValue;
		}

		if (bulkEditValues.ptuEligibilityOverride !== 'UNCHANGED') {
			updates.ptuEligibilityOverride = bulkEditValues.ptuEligibilityOverride;
		}

		const trimmedPlatformHours = bulkEditValues.platformHoursYear.trim();
		if (trimmedPlatformHours !== '') {
			const parsedPlatformHours = Number(trimmedPlatformHours);
			if (!Number.isFinite(parsedPlatformHours) || parsedPlatformHours < 0) {
				toast.error(t('validation.platformHoursYear'));
				return;
			}
			updates.platformHoursYear = parsedPlatformHours;
		}

		if (bulkEditValues.aguinaldoOverrideMode === 'SET') {
			const trimmedOverride = bulkEditValues.aguinaldoDaysOverride.trim();
			const parsedOverride = trimmedOverride === '' ? Number.NaN : Number(trimmedOverride);
			if (!Number.isFinite(parsedOverride) || parsedOverride < 0) {
				toast.error(t('validation.aguinaldoDaysOverride'));
				return;
			}
			updates.aguinaldoDaysOverride = parsedOverride;
		} else if (bulkEditValues.aguinaldoOverrideMode === 'CLEAR') {
			updates.aguinaldoDaysOverride = null;
		}

		if (Object.keys(updates).length === 0) {
			toast.error(t('bulk.toast.noChanges'));
			return;
		}

		const results = await Promise.all(
				selectedEmployees.map((employee) => {
					if (!employee.locationId) {
						return Promise.resolve({ success: false, error: 'MISSING_LOCATION' });
					}
					return updateEmployee({
						id: employee.id,
						firstName: employee.firstName,
						lastName: employee.lastName,
						status: employee.status,
						locationId: employee.locationId,
						...updates,
					});
				}),
		);

		const failures = results.filter((result) => !result.success);
		if (failures.length > 0) {
			toast.error(
				t('bulk.toast.partialError', {
					count: failures.length,
				}),
			);
		} else {
			toast.success(
				t('bulk.toast.success', {
					count: selectedEmployees.length,
				}),
			);
		}

		setRowSelection({});
		setIsBulkEditOpen(false);
		setBulkEditValues(createDefaultBulkEditValues());
		queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
	}, [
		bulkEditValues,
		queryClient,
		selectedEmployees,
		setBulkEditValues,
		t,
	]);

	/**
	 * Updates termination form values and clears any existing preview.
	 *
	 * @param values - Partial termination form values to apply
	 * @returns void
	 */
	const updateTerminationForm = useCallback((values: Partial<TerminationFormValues>): void => {
		setTerminationForm((prev) => ({ ...prev, ...values }));
		setTerminationPreview(null);
	}, []);

	/**
	 * Resets termination form state and clears any preview data.
	 *
	 * @returns void
	 */
	const resetTerminationState = useCallback((): void => {
		setTerminationForm(createDefaultTerminationFormValues());
		setTerminationPreview(null);
		setIsTerminateDialogOpen(false);
	}, []);

	/**
	 * Builds a termination payload from the current form state.
	 *
	 * @returns Termination payload or null when validation fails
	 */
	const buildTerminationPayload = useCallback(() => {
		if (!activeEmployee) {
			toast.error(t('finiquito.validation.employeeRequired'));
			return null;
		}

		const terminationDateKey = terminationForm.terminationDateKey.trim();
		if (!isValidDateKey(terminationDateKey)) {
			toast.error(t('finiquito.validation.terminationDate'));
			return null;
		}

		const lastDayWorkedDateKey = terminationForm.lastDayWorkedDateKey.trim();
		if (lastDayWorkedDateKey && !isValidDateKey(lastDayWorkedDateKey)) {
			toast.error(t('finiquito.validation.lastDayWorkedDate'));
			return null;
		}
		if (lastDayWorkedDateKey && lastDayWorkedDateKey > terminationDateKey) {
			toast.error(t('finiquito.validation.lastDayWorkedAfterTermination'));
			return null;
		}

		const unpaidDays = Number(terminationForm.unpaidDays);
		if (!Number.isFinite(unpaidDays) || unpaidDays < 0) {
			toast.error(t('finiquito.validation.unpaidDays'));
			return null;
		}

		const otherDue = Number(terminationForm.otherDue);
		if (!Number.isFinite(otherDue) || otherDue < 0) {
			toast.error(t('finiquito.validation.otherDue'));
			return null;
		}

		const vacationBalanceDays = terminationForm.vacationBalanceDays.trim();
		const parsedVacationBalance =
			vacationBalanceDays === '' ? null : Number(vacationBalanceDays);
		if (
			parsedVacationBalance !== null &&
			(!Number.isFinite(parsedVacationBalance) || parsedVacationBalance < 0)
		) {
			toast.error(t('finiquito.validation.vacationBalanceDays'));
			return null;
		}

		const dailySalaryIndemnizacion = terminationForm.dailySalaryIndemnizacion.trim();
		const parsedDailySalaryIndemnizacion =
			dailySalaryIndemnizacion === '' ? null : Number(dailySalaryIndemnizacion);
		if (
			parsedDailySalaryIndemnizacion !== null &&
			(!Number.isFinite(parsedDailySalaryIndemnizacion) ||
				parsedDailySalaryIndemnizacion <= 0)
		) {
			toast.error(t('finiquito.validation.dailySalaryIndemnizacion'));
			return null;
		}

		const payload: Parameters<typeof previewEmployeeTermination>[0] = {
			employeeId: activeEmployee.id,
			terminationDateKey,
			lastDayWorkedDateKey: lastDayWorkedDateKey || undefined,
			terminationReason: terminationForm.terminationReason,
			contractType: terminationForm.contractType,
			unpaidDays,
			otherDue,
			vacationBalanceDays: parsedVacationBalance,
			dailySalaryIndemnizacion: parsedDailySalaryIndemnizacion,
			terminationNotes: terminationForm.terminationNotes.trim() || null,
		};

		return payload;
	}, [activeEmployee, terminationForm, t]);

	const vacationBalance = insights?.vacation.balance ?? null;
	const vacationRequests = insights?.vacation.requests ?? [];
	const attendanceSummary = insights?.attendance ?? null;
	const leaveItems = insights?.leaves.items ?? [];
	const upcomingExceptions = insights?.exceptions.items ?? [];
	const payrollRuns = insights?.payroll.runs ?? [];
	const auditEvents = auditResponse?.data ?? [];
	const ptuHistory = useMemo<PtuHistoryRecord[]>(
		() =>
			(ptuHistoryData ?? []).slice().sort((a, b) => b.fiscalYear - a.fiscalYear),
		[ptuHistoryData],
	);

	const finiquitoLines = useMemo(() => {
		if (!terminationPreview) {
			return [];
		}
		return [
			{
				key: 'salaryDue',
				label: t('finiquito.breakdown.salaryDue'),
				value: terminationPreview.breakdown.finiquito.salaryDue,
			},
			{
				key: 'aguinaldoProp',
				label: t('finiquito.breakdown.aguinaldoProp'),
				value: terminationPreview.breakdown.finiquito.aguinaldoProp,
			},
			{
				key: 'vacationPay',
				label: t('finiquito.breakdown.vacationPay'),
				value: terminationPreview.breakdown.finiquito.vacationPay,
			},
			{
				key: 'vacationPremium',
				label: t('finiquito.breakdown.vacationPremium'),
				value: terminationPreview.breakdown.finiquito.vacationPremium,
			},
			{
				key: 'otherDue',
				label: t('finiquito.breakdown.otherDue'),
				value: terminationPreview.breakdown.finiquito.otherDue,
			},
		];
	}, [terminationPreview, t]);

	const liquidacionLines = useMemo(() => {
		if (!terminationPreview) {
			return [];
		}
		return [
			{
				key: 'indemnizacion3Meses',
				label: t('finiquito.breakdown.indemnizacion3Meses'),
				value: terminationPreview.breakdown.liquidacion.indemnizacion3Meses,
			},
			{
				key: 'indemnizacion20Dias',
				label: t('finiquito.breakdown.indemnizacion20Dias'),
				value: terminationPreview.breakdown.liquidacion.indemnizacion20Dias,
			},
			{
				key: 'primaAntiguedad',
				label: t('finiquito.breakdown.primaAntiguedad'),
				value: terminationPreview.breakdown.liquidacion.primaAntiguedad,
			},
		];
	}, [terminationPreview, t]);

	const auditFieldLabels = useMemo<Record<string, string>>(
		() => ({
			code: t('fields.code'),
			firstName: t('fields.firstName'),
			lastName: t('fields.lastName'),
			nss: t('fields.nss'),
			rfc: t('fields.rfc'),
			email: t('fields.email'),
			phone: t('fields.phone'),
			jobPositionId: t('fields.jobPosition'),
			department: t('fields.department'),
			status: t('fields.status'),
			terminationDateKey: t('fields.terminationDate'),
			lastDayWorkedDateKey: t('fields.lastDayWorkedDate'),
			terminationReason: t('fields.terminationReason'),
			contractType: t('fields.contractType'),
			terminationNotes: t('fields.terminationNotes'),
			shiftType: t('fields.shiftType'),
			hireDate: t('fields.hireDate'),
			sbcDailyOverride: t('fields.sbcDailyOverride'),
			employmentType: t('fields.employmentType'),
			isTrustEmployee: t('fields.isTrustEmployee'),
			isDirectorAdminGeneralManager: t('fields.isDirectorAdminGeneralManager'),
			isDomesticWorker: t('fields.isDomesticWorker'),
			isPlatformWorker: t('fields.isPlatformWorker'),
			platformHoursYear: t('fields.platformHoursYear'),
			ptuEligibilityOverride: t('fields.ptuEligibilityOverride'),
			aguinaldoDaysOverride: t('fields.aguinaldoDaysOverride'),
			locationId: t('fields.location'),
			scheduleTemplateId: t('details.scheduleTemplate'),
			userId: t('fields.user'),
			lastPayrollDate: t('details.lastPayrollDate'),
			rekognitionUserId: t('details.faceEnrollment'),
			schedule: t('details.schedule'),
		}),
		[t],
	);

	// Create mutation
	const createMutation = useMutation({
		mutationKey: mutationKeys.employees.create,
		mutationFn: createEmployee,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.createSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(result.error ?? t('toast.createError'));
			}
		},
		onError: () => {
			toast.error(t('toast.createError'));
		},
	});

	// Update mutation
	const updateMutation = useMutation({
		mutationKey: mutationKeys.employees.update,
		mutationFn: updateEmployee,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.updateSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(result.error ?? t('toast.updateError'));
			}
		},
		onError: () => {
			toast.error(t('toast.updateError'));
		},
	});

	const ptuHistoryMutation = useMutation({
		mutationKey: mutationKeys.ptuHistory.upsert,
		mutationFn: ({
			employeeId,
			fiscalYear,
			amount,
		}: {
			employeeId: string;
			fiscalYear: number;
			amount: number;
		}) => upsertEmployeePtuHistory(employeeId, { fiscalYear, amount }),
		onSuccess: (_record, variables) => {
			toast.success(t('ptuHistory.toast.saveSuccess'));
			queryClient.invalidateQueries({
				queryKey: queryKeys.ptu.history(variables.employeeId),
			});
		},
		onError: () => {
			toast.error(t('ptuHistory.toast.saveError'));
		},
	});

	/**
	 * Saves a PTU history entry for the active employee.
	 *
	 * @returns Promise<void>
	 */
	const handlePtuHistorySave = useCallback(async (): Promise<void> => {
		if (!activeEmployee) {
			return;
		}
		const fiscalYear = Number(ptuHistoryYearInput.trim());
		if (!Number.isInteger(fiscalYear) || fiscalYear < 2000) {
			toast.error(t('ptuHistory.validation.year'));
			return;
		}
		const amount = Number(ptuHistoryAmountInput.trim());
		if (!Number.isFinite(amount) || amount < 0) {
			toast.error(t('ptuHistory.validation.amount'));
			return;
		}
		await ptuHistoryMutation.mutateAsync({
			employeeId: activeEmployee.id,
			fiscalYear,
			amount,
		});
		setPtuHistoryYearInput('');
		setPtuHistoryAmountInput('');
	}, [
		activeEmployee,
		ptuHistoryAmountInput,
		ptuHistoryMutation,
		ptuHistoryYearInput,
		t,
	]);

	// Delete mutation
	const deleteMutation = useMutation({
		mutationKey: mutationKeys.employees.delete,
		mutationFn: deleteEmployee,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.deleteSuccess'));
				setDeleteConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(result.error ?? t('toast.deleteError'));
			}
		},
		onError: () => {
			toast.error(t('toast.deleteError'));
		},
	});

	// Termination preview mutation
	const terminationPreviewMutation = useMutation({
		mutationKey: mutationKeys.employees.previewTermination,
		mutationFn: previewEmployeeTermination,
		onSuccess: (result) => {
			if (result.success && result.data) {
				setTerminationPreview(result.data);
			} else {
				toast.error(result.error ?? t('finiquito.toast.previewError'));
			}
		},
		onError: () => {
			toast.error(t('finiquito.toast.previewError'));
		},
	});

	// Termination confirm mutation
	const terminationMutation = useMutation({
		mutationKey: mutationKeys.employees.terminate,
		mutationFn: terminateEmployee,
		onSuccess: (result) => {
			if (result.success && result.data) {
				const terminationData = result.data;
				const resolvedSettlement: EmployeeTerminationSettlementRecord = {
					...terminationData.settlement,
					totalsGross: Number(terminationData.settlement.totalsGross ?? 0),
					finiquitoTotalGross: Number(
						terminationData.settlement.finiquitoTotalGross ?? 0,
					),
					liquidacionTotalGross: Number(
						terminationData.settlement.liquidacionTotalGross ?? 0,
					),
					createdAt: new Date(terminationData.settlement.createdAt),
				};
				toast.success(t('finiquito.toast.terminateSuccess'));
				setIsTerminateDialogOpen(false);
				setTerminationPreview(terminationData.settlement.calculation);
				setActiveEmployee((prev) =>
					prev ? { ...prev, status: terminationData.employee.status } : prev,
				);
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
				queryClient.setQueryData(
					queryKeys.employees.terminationSettlement(terminationData.employee.id),
					resolvedSettlement,
				);
				queryClient.invalidateQueries({
					queryKey: queryKeys.employees.terminationSettlement(
						terminationData.employee.id,
					),
				});
			} else {
				toast.error(result.error ?? t('finiquito.toast.terminateError'));
			}
		},
		onError: () => {
			toast.error(t('finiquito.toast.terminateError'));
		},
	});

	// Delete Rekognition user mutation
	const deleteRekognitionMutation = useMutation({
		mutationKey: mutationKeys.employees.deleteRekognitionUser,
		mutationFn: deleteRekognitionUser,
		onSuccess: (result) => {
			if (result.success && result.data?.success) {
				toast.success(t('toast.faceEnrollmentRemoved'));
				setDeleteRekognitionConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(
					result.error ?? result.data?.message ?? t('toast.faceEnrollmentRemoveError'),
				);
			}
		},
		onError: () => {
			toast.error(t('toast.faceEnrollmentRemoveError'));
		},
	});

	// TanStack Form instance for employee create/edit
	const form = useAppForm({
		defaultValues: initialFormValues,
		onSubmit: async ({ value }) => {
			if (!value.locationId) {
				toast.error(t('toast.selectLocation'));
				return;
			}
			const trimmedHireDate = value.hireDate.trim();
			const trimmedPeriodPay = value.periodPay.trim();
			const trimmedSbcOverride = value.sbcDailyOverride.trim();
			const trimmedNss = value.nss.trim();
			const trimmedRfc = value.rfc.trim();
			const parsedPeriodPay = trimmedPeriodPay === '' ? Number.NaN : Number(trimmedPeriodPay);
			if (!Number.isFinite(parsedPeriodPay) || parsedPeriodPay <= 0) {
				toast.error(t('validation.periodPayGreaterThanZero'));
				return;
			}
			const parsedSbcOverride = trimmedSbcOverride === '' ? null : Number(trimmedSbcOverride);
			if (parsedSbcOverride !== null) {
				if (!Number.isFinite(parsedSbcOverride) || parsedSbcOverride <= 0) {
					toast.error(t('validation.sbcDailyOverride'));
					return;
				}
			}
			const trimmedPlatformHours = value.platformHoursYear.trim();
			const parsedPlatformHours =
				trimmedPlatformHours === '' ? undefined : Number(trimmedPlatformHours);
			if (
				parsedPlatformHours !== undefined &&
				(!Number.isFinite(parsedPlatformHours) || parsedPlatformHours < 0)
			) {
				toast.error(t('validation.platformHoursYear'));
				return;
			}
			const trimmedAguinaldoOverride = value.aguinaldoDaysOverride.trim();
			const parsedAguinaldoOverride =
				trimmedAguinaldoOverride === ''
					? isEditMode
						? null
						: undefined
					: Number(trimmedAguinaldoOverride);
			if (
				parsedAguinaldoOverride !== undefined &&
				parsedAguinaldoOverride !== null &&
				(!Number.isFinite(parsedAguinaldoOverride) || parsedAguinaldoOverride < 0)
			) {
				toast.error(t('validation.aguinaldoDaysOverride'));
				return;
			}
			const paymentFrequency = value.paymentFrequency ?? 'MONTHLY';
			const dailyPay = calculateDailyPayFromPeriodPay(parsedPeriodPay, paymentFrequency);
			const resolvedUserIdForCreate =
				value.userId && value.userId !== 'none' ? value.userId.trim() : undefined;
			const normalizedUserIdForUpdate =
				value.userId === 'none' ? null : value.userId?.trim() || null;
			const currentUserId = activeEmployee?.userId ?? null;
			const resolvedUserIdForUpdate =
				normalizedUserIdForUpdate === currentUserId ? undefined : normalizedUserIdForUpdate;
			if (isEditMode && activeEmployee) {
				const updateResult = await updateMutation.mutateAsync({
					id: activeEmployee.id,
					firstName: value.firstName,
					lastName: value.lastName,
					nss: trimmedNss === '' ? null : trimmedNss,
					rfc: trimmedRfc === '' ? null : trimmedRfc,
					email: value.email || undefined,
					userId: resolvedUserIdForUpdate,
					phone: value.phone || undefined,
					jobPositionId: value.jobPositionId || undefined,
					locationId: value.locationId,
					department: value.department || undefined,
					status: value.status,
					hireDate: trimmedHireDate === '' ? null : trimmedHireDate,
					dailyPay,
					paymentFrequency,
					sbcDailyOverride: parsedSbcOverride,
					employmentType: value.employmentType,
					isTrustEmployee: value.isTrustEmployee,
					isDirectorAdminGeneralManager: value.isDirectorAdminGeneralManager,
					isDomesticWorker: value.isDomesticWorker,
					isPlatformWorker: value.isPlatformWorker,
					platformHoursYear: parsedPlatformHours,
					ptuEligibilityOverride: value.ptuEligibilityOverride,
					aguinaldoDaysOverride: parsedAguinaldoOverride,
					shiftType: value.shiftType,
					schedule,
				});
				if (!updateResult.success) {
					return;
				}
				setIsDialogOpen(false);
				setDialogMode('create');
				setActiveEmployee(null);
				setDetailTab('summary');
				form.reset();
				return;
			} else if (isCreateMode) {
				// Validate that jobPositionId is selected for new employees
				if (!value.jobPositionId) {
					toast.error(t('toast.selectJobPosition'));
					return;
				}
				const createResult = await createMutation.mutateAsync({
					code: value.code,
					firstName: value.firstName,
					lastName: value.lastName,
					nss: trimmedNss === '' ? undefined : trimmedNss,
					rfc: trimmedRfc === '' ? undefined : trimmedRfc,
					email: value.email || undefined,
					userId: resolvedUserIdForCreate,
					phone: value.phone || undefined,
					jobPositionId: value.jobPositionId,
					locationId: value.locationId,
					department: value.department || undefined,
					status: value.status,
					hireDate: trimmedHireDate === '' ? undefined : trimmedHireDate,
					dailyPay,
					paymentFrequency,
					sbcDailyOverride:
						trimmedSbcOverride === '' ? undefined : (parsedSbcOverride ?? undefined),
					employmentType: value.employmentType,
					isTrustEmployee: value.isTrustEmployee,
					isDirectorAdminGeneralManager: value.isDirectorAdminGeneralManager,
					isDomesticWorker: value.isDomesticWorker,
					isPlatformWorker: value.isPlatformWorker,
					platformHoursYear: parsedPlatformHours,
					ptuEligibilityOverride: value.ptuEligibilityOverride,
					aguinaldoDaysOverride: parsedAguinaldoOverride ?? undefined,
					shiftType: value.shiftType,
					schedule,
				});
				if (!createResult.success) {
					return;
				}

				const createdEmployeeId = extractCreatedEmployeeId(createResult.data);
				if (createdEmployeeId) {
					const createdEmployee = await fetchEmployeeById(createdEmployeeId);
					if (createdEmployee) {
						setActiveEmployee(createdEmployee);
						setDialogMode('view');
						setDetailTab('documents');
						setPtuHistoryYearInput('');
						setPtuHistoryAmountInput('');
						setHasCustomCode(false);
						form.reset();
						setIsDialogOpen(true);
						return;
					}
				}

				toast.error(t('toast.openDocumentsError'));
				setIsDialogOpen(false);
				setDialogMode('create');
				setActiveEmployee(null);
				setDetailTab('summary');
				form.reset();
				return;
			}
		},
	});

	const firstName = useStore(form.store, (state) => state.values.firstName);
	const lastName = useStore(form.store, (state) => state.values.lastName);
	const codeValue = useStore(form.store, (state) => state.values.code);
	const periodPayValue = useStore(form.store, (state) => state.values.periodPay);
	const paymentFrequencyValue =
		useStore(form.store, (state) => state.values.paymentFrequency) ?? 'MONTHLY';
	const computedDailyPay = calculateDailyPayFromPeriodPay(
		Number(periodPayValue || 0),
		paymentFrequencyValue,
	);
	const periodPayLabel = t('fields.periodPay', {
		period: t(`paymentFrequency.${paymentFrequencyValue}`),
	});

	const generateEmployeeCode = (first: string, last: string): string => {
		const random = Math.floor(1000 + Math.random() * 9000).toString();
		const base = [first, last]
			.filter(Boolean)
			.join('.')
			.replace(/[^a-zA-Z0-9.]/g, '')
			.toUpperCase();
		return (base || 'EMP') + `-${random}`;
	};

	useEffect(() => {
		if (!isCreateMode) return;
		if (hasCustomCode) return;
		// Only auto-generate when the code field is empty to avoid update loops
		if (codeValue.trim() !== '') return;
		const generated = generateEmployeeCode(firstName, lastName);
		form.setFieldValue('code', generated);
	}, [isCreateMode, hasCustomCode, firstName, lastName, codeValue, form]);

	/**
	 * Upserts a schedule entry for a specific day.
	 *
	 * @param dayOfWeek - Day index (0=Sunday)
	 * @param updates - Partial entry updates
	 */
	const upsertScheduleEntry = useCallback(
		(dayOfWeek: number, updates: Partial<EmployeeScheduleEntry>): void => {
			setSchedule((prev) => {
				const existing = prev.find((entry) => entry.dayOfWeek === dayOfWeek);
				if (existing) {
					return prev.map((entry) =>
						entry.dayOfWeek === dayOfWeek ? { ...entry, ...updates } : entry,
					);
				}
				return [
					...prev,
					{
						dayOfWeek,
						startTime: '09:00',
						endTime: '17:00',
						isWorkingDay: true,
						...updates,
					},
				];
			});
		},
		[],
	);

	/**
	 * Requests a finiquito preview for the active employee.
	 *
	 * @returns void
	 */
	const handleTerminationPreview = useCallback((): void => {
		const payload = buildTerminationPayload();
		if (!payload) {
			return;
		}
		terminationPreviewMutation.mutate(payload);
	}, [buildTerminationPayload, terminationPreviewMutation]);

	/**
	 * Confirms employee termination and persists the settlement.
	 *
	 * @returns void
	 */
	const handleTerminateEmployee = useCallback((): void => {
		if (!terminationPreview) {
			toast.error(t('finiquito.validation.previewRequired'));
			return;
		}
		const payload = buildTerminationPayload();
		if (!payload) {
			return;
		}
		terminationMutation.mutate(payload);
	}, [buildTerminationPayload, terminationMutation, terminationPreview, t]);

	/**
	 * Opens the dialog for creating a new employee.
	 */
	const handleCreateNew = useCallback((): void => {
		resetTerminationState();
		setDialogMode('create');
		setActiveEmployee(null);
		setDetailTab('summary');
		form.reset();
		setHasCustomCode(false);
		setSchedule(createDefaultSchedule());
		setPtuHistoryYearInput('');
		setPtuHistoryAmountInput('');
		setIsDialogOpen(true);
	}, [form, resetTerminationState, setPtuHistoryAmountInput, setPtuHistoryYearInput]);

	/**
	 * Opens employee detail view in the requested tab.
	 *
	 * @param employee - Employee row payload
	 * @param tab - Detail tab value
	 */
	const openEmployeeDetailTab = useCallback(
		(employee: Employee, tab: EmployeeDetailTab): void => {
			resetTerminationState();
			setActiveEmployee(employee);
			setDialogMode('view');
			setDetailTab(tab);
			setPtuHistoryYearInput('');
			setPtuHistoryAmountInput('');
			setIsDialogOpen(true);
		},
		[resetTerminationState, setPtuHistoryAmountInput, setPtuHistoryYearInput],
	);

	/**
	 * Fetches employee detail and opens the requested tab.
	 *
	 * @param employeeId - Employee identifier
	 * @param tab - Detail tab value
	 * @returns Promise<void>
	 */
	const openEmployeeDetailById = useCallback(
		async (employeeId: string, tab: EmployeeDetailTab): Promise<void> => {
			const detail = await fetchEmployeeById(employeeId);
			if (!detail) {
				toast.error(t('toast.openDocumentsError'));
				return;
			}

			openEmployeeDetailTab(detail, tab);
		},
		[openEmployeeDetailTab, t],
	);

	/**
	 * Opens the dialog for viewing employee details.
	 *
	 * @param employee - The employee to view
	 */
	const handleViewDetails = useCallback(
		(employee: Employee): void => {
			openEmployeeDetailTab(employee, 'summary');
		},
		[openEmployeeDetailTab],
	);

	/**
	 * Opens the dialog for editing an existing employee.
	 *
	 * @param employee - The employee to edit
	 */
	const handleEdit = useCallback(
		async (employee: Employee): Promise<void> => {
			resetTerminationState();
			setIsScheduleLoading(true);
			setActiveEmployee(employee);
			setDialogMode('edit');
			form.setFieldValue('code', employee.code);
			form.setFieldValue('firstName', employee.firstName);
			form.setFieldValue('lastName', employee.lastName);
			form.setFieldValue('nss', employee.nss ?? '');
			form.setFieldValue('rfc', employee.rfc ?? '');
			form.setFieldValue('email', employee.email ?? '');
			form.setFieldValue('userId', employee.userId ?? 'none');
			form.setFieldValue('phone', employee.phone ?? '');
			form.setFieldValue('jobPositionId', employee.jobPositionId ?? '');
			form.setFieldValue('locationId', employee.locationId ?? '');
			form.setFieldValue('department', employee.department ?? '');
			form.setFieldValue('status', employee.status);
			form.setFieldValue('shiftType', employee.shiftType ?? 'DIURNA');
			form.setFieldValue(
				'hireDate',
				employee.hireDate ? format(new Date(employee.hireDate), 'yyyy-MM-dd') : '',
			);
			form.setFieldValue('paymentFrequency', employee.paymentFrequency ?? 'MONTHLY');
			form.setFieldValue(
				'periodPay',
				String(
					calculatePeriodPayFromDailyPay(
						employee.dailyPay ?? 0,
						employee.paymentFrequency ?? 'MONTHLY',
					),
				),
			);
			form.setFieldValue(
				'sbcDailyOverride',
				employee.sbcDailyOverride ? String(employee.sbcDailyOverride) : '',
			);
			form.setFieldValue('employmentType', employee.employmentType ?? 'PERMANENT');
			form.setFieldValue('isTrustEmployee', Boolean(employee.isTrustEmployee));
			form.setFieldValue(
				'isDirectorAdminGeneralManager',
				Boolean(employee.isDirectorAdminGeneralManager),
			);
			form.setFieldValue('isDomesticWorker', Boolean(employee.isDomesticWorker));
			form.setFieldValue('isPlatformWorker', Boolean(employee.isPlatformWorker));
			form.setFieldValue(
				'platformHoursYear',
				employee.platformHoursYear ? String(employee.platformHoursYear) : '',
			);
			form.setFieldValue(
				'ptuEligibilityOverride',
				employee.ptuEligibilityOverride ?? 'DEFAULT',
			);
			form.setFieldValue(
				'aguinaldoDaysOverride',
				employee.aguinaldoDaysOverride
					? String(employee.aguinaldoDaysOverride)
					: '',
			);
			setHasCustomCode(true);
			setPtuHistoryYearInput('');
			setPtuHistoryAmountInput('');

			const detail = await fetchEmployeeById(employee.id);
			if (detail?.schedule && detail.schedule.length > 0) {
				setSchedule(
					detail.schedule.map((entry) => ({
						dayOfWeek: entry.dayOfWeek,
						startTime: entry.startTime,
						endTime: entry.endTime,
						isWorkingDay: entry.isWorkingDay,
					})),
				);
			} else {
				setSchedule(createDefaultSchedule());
			}
			setIsScheduleLoading(false);
			setDetailTab('summary');
			setIsDialogOpen(true);
		},
		[
			form,
			resetTerminationState,
			setPtuHistoryAmountInput,
			setPtuHistoryYearInput,
		],
	);

	/**
	 * Switches the dialog from view to edit mode.
	 */
	const handleEditFromDetails = useCallback((): void => {
		if (!activeEmployee) {
			return;
		}
		void handleEdit(activeEmployee);
	}, [activeEmployee, handleEdit]);

	/**
	 * Handles dialog close and resets form state.
	 *
	 * @param open - Whether the dialog should be open
	 */
	const handleDialogOpenChange = useCallback(
		(open: boolean): void => {
			setIsDialogOpen(open);
			if (!open) {
				setDialogMode('create');
				setActiveEmployee(null);
				setDetailTab('summary');
				form.reset();
				setHasCustomCode(false);
				setSchedule(createDefaultSchedule());
				resetTerminationState();
			}
		},
		[form, resetTerminationState],
	);

	/**
	 * Handles employee deletion.
	 *
	 * @param id - The employee ID to delete
	 * @returns void
	 */
	const handleDelete = useCallback(
		(id: string): void => {
			deleteMutation.mutate(id);
		},
		[deleteMutation],
	);

	/**
	 * Opens the face enrollment dialog for an employee.
	 *
	 * @param employee - The employee to enroll
	 * @returns void
	 */
	const handleOpenEnrollDialog = useCallback((employee: Employee): void => {
		setEnrollingEmployee(employee);
		setIsEnrollDialogOpen(true);
	}, []);

	/**
	 * Handles Rekognition user deletion.
	 *
	 * @param id - The employee ID to remove Rekognition data for
	 * @returns void
	 */
	const handleDeleteRekognition = useCallback(
		(id: string): void => {
			deleteRekognitionMutation.mutate(id);
		},
		[deleteRekognitionMutation],
	);

	const columns = useMemo<ColumnDef<Employee>[]>(
		() => [
			{
				accessorKey: 'code',
				header: t('table.headers.code'),
				cell: ({ row }) => <span className="font-medium">{row.original.code}</span>,
			},
			{
				id: 'name',
				accessorFn: (row) => `${row.firstName} ${row.lastName}`.trim(),
				header: t('table.headers.name'),
				cell: ({ row }) => (
					<div className="space-y-1">
						<span className="font-medium">
							{row.original.firstName} {row.original.lastName}
						</span>
						<div className="flex flex-wrap gap-1">
							<Badge variant="outline" className="text-xs">
								{t(`employmentType.${row.original.employmentType ?? 'PERMANENT'}`)}
							</Badge>
							{row.original.ptuEligibilityOverride &&
							row.original.ptuEligibilityOverride !== 'DEFAULT' ? (
								<Badge variant="secondary" className="text-xs">
									{t('badges.ptuOverride', {
										value: t(
											`ptuEligibility.${row.original.ptuEligibilityOverride}`,
										),
									})}
								</Badge>
							) : null}
							{row.original.aguinaldoDaysOverride ? (
								<Badge variant="secondary" className="text-xs">
									{t('badges.aguinaldoOverride', {
										days: row.original.aguinaldoDaysOverride,
									})}
								</Badge>
							) : null}
							{canUseDisciplinaryModule &&
							(row.original.disciplinaryMeasuresCount ?? 0) > 0 ? (
								<Badge
									variant={
										(row.original.disciplinaryOpenMeasuresCount ?? 0) > 0
											? 'destructive'
											: 'secondary'
									}
									className="text-xs"
								>
									{t('table.disciplinary.badge', {
										total: row.original.disciplinaryMeasuresCount ?? 0,
										open: row.original.disciplinaryOpenMeasuresCount ?? 0,
									})}
								</Badge>
							) : null}
						</div>
					</div>
				),
			},
			{
				id: 'jobPosition',
				accessorFn: (row) => row.jobPositionName ?? '',
				header: t('table.headers.jobPosition'),
				cell: ({ row }) => row.original.jobPositionName ?? '-',
			},
			{
				id: 'locationId',
				accessorFn: (row) =>
					locationLookup.get(row.locationId ?? '') ?? row.locationId ?? '',
				header: t('table.headers.location'),
				cell: ({ row }) =>
					row.original.locationId ? (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<span className="block max-w-[200px] truncate text-sm">
										{locationLookup.get(row.original.locationId) ??
											t('table.unknownLocation')}
									</span>
								</TooltipTrigger>
								<TooltipContent>{row.original.locationId}</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					) : (
						'-'
					),
			},
			{
				accessorKey: 'email',
				header: t('table.headers.email'),
				cell: ({ row }) => row.original.email ?? '-',
			},
			{
				accessorKey: 'department',
				header: t('table.headers.department'),
				cell: ({ row }) => row.original.department ?? '-',
			},
			{
				accessorKey: 'shiftType',
				header: t('table.headers.shift'),
				cell: ({ row }) =>
					row.original.shiftType ? t(`shiftTypeLabels.${row.original.shiftType}`) : '-',
			},
			{
				accessorKey: 'status',
				header: t('table.headers.status'),
				cell: ({ row }) => (
					<Badge variant={statusVariants[row.original.status]}>
						{t(`status.${row.original.status}`)}
					</Badge>
				),
				enableGlobalFilter: false,
			},
			{
				id: 'documentProgress',
				header: t('table.headers.documents'),
				enableGlobalFilter: false,
				cell: ({ row }) => {
					const progress = row.original.documentProgressPercent ?? 0;
					const missing = row.original.documentMissingCount ?? 0;
					return (
						<div className="min-w-[160px] space-y-1">
							<div className="flex items-center justify-between text-xs">
								<span className="font-medium">{progress}%</span>
								<Badge variant={missing === 0 ? 'default' : 'secondary'}>
									{t('table.documents.missing', { count: missing })}
								</Badge>
							</div>
							<div className="h-1.5 overflow-hidden rounded-full bg-muted">
								<div
									className="h-full rounded-full bg-emerald-500 transition-all duration-300 dark:bg-emerald-400"
									style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
								/>
							</div>
						</div>
					);
				},
			},
			{
				id: 'face',
				header: t('table.headers.face'),
				enableSorting: false,
				enableGlobalFilter: false,
				cell: ({ row }) => (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								{row.original.rekognitionUserId ? (
									<Badge variant="default" className="gap-1">
										<UserCheck className="h-3 w-3" />
										{t('face.enrolled')}
									</Badge>
								) : (
									<Badge
										variant="outline"
										className="gap-1 text-muted-foreground"
									>
										<UserX className="h-3 w-3" />
										{t('face.notEnrolled')}
									</Badge>
								)}
							</TooltipTrigger>
							<TooltipContent>
								{row.original.rekognitionUserId
									? t('face.tooltip.enrolled')
									: t('face.tooltip.notEnrolled')}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				),
			},
			{
				accessorKey: 'createdAt',
				header: t('table.headers.created'),
				cell: ({ row }) => format(new Date(row.original.createdAt), t('dateFormat')),
				enableGlobalFilter: false,
			},
			{
				id: 'actions',
				header: t('table.headers.actions'),
				enableSorting: false,
				enableGlobalFilter: false,
				cell: ({ row }) => (
					<>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="icon">
									<MoreHorizontal className="h-4 w-4" />
									<span className="sr-only">{t('menu.open')}</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onClick={() => handleViewDetails(row.original)}>
									<Eye className="mr-2 h-4 w-4" />
									{t('menu.viewDetails')}
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() =>
										void openEmployeeDetailById(row.original.id, 'documents')
									}
								>
									<FileText className="mr-2 h-4 w-4" />
									{t('menu.viewDocuments')}
								</DropdownMenuItem>
								{canUseDisciplinaryModule ? (
									<DropdownMenuItem
										onClick={() =>
											void openEmployeeDetailById(
												row.original.id,
												'disciplinary',
											)
										}
									>
										<ShieldAlert className="mr-2 h-4 w-4" />
										{t('menu.viewDisciplinaryMeasures')}
									</DropdownMenuItem>
								) : null}
								{canUseDisciplinaryModule ? (
									<DropdownMenuItem asChild>
										<Link href={`/disciplinary-measures?employeeId=${row.original.id}`}>
											<ShieldAlert className="mr-2 h-4 w-4" />
											{t('menu.openDisciplinaryModule')}
										</Link>
									</DropdownMenuItem>
								) : null}
								<DropdownMenuItem
									onClick={() => handleOpenEnrollDialog(row.original)}
								>
									<ScanFace className="mr-2 h-4 w-4" />
									{row.original.rekognitionUserId
										? t('menu.reEnrollFace')
										: t('menu.enrollFace')}
								</DropdownMenuItem>
								{row.original.rekognitionUserId && (
									<DropdownMenuItem
										onClick={() =>
											setDeleteRekognitionConfirmId(row.original.id)
										}
										className="text-orange-600 focus:text-orange-600"
									>
										<UserX className="mr-2 h-4 w-4" />
										{t('menu.removeFaceEnrollment')}
									</DropdownMenuItem>
								)}
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={() => setDeleteConfirmId(row.original.id)}
									className="text-destructive focus:text-destructive"
								>
									<Trash2 className="mr-2 h-4 w-4" />
									{t('menu.deleteEmployee')}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>

						<Dialog
							open={deleteConfirmId === row.original.id}
							onOpenChange={(open) =>
								setDeleteConfirmId(open ? row.original.id : null)
							}
						>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>{t('dialogs.deleteEmployee.title')}</DialogTitle>
									<DialogDescription>
										{t('dialogs.deleteEmployee.description', {
											name: `${row.original.firstName} ${row.original.lastName}`.trim(),
										})}
										{row.original.rekognitionUserId && (
											<span className="block mt-2 text-orange-600">
												{t('dialogs.deleteEmployee.faceNote')}
											</span>
										)}
									</DialogDescription>
								</DialogHeader>
								<DialogFooter>
									<Button
										variant="outline"
										onClick={() => setDeleteConfirmId(null)}
									>
										{tCommon('cancel')}
									</Button>
									<Button
										variant="destructive"
										onClick={() => handleDelete(row.original.id)}
										disabled={deleteMutation.isPending}
									>
										{deleteMutation.isPending ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												{tCommon('deleting')}
											</>
										) : (
											tCommon('delete')
										)}
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>

						<Dialog
							open={deleteRekognitionConfirmId === row.original.id}
							onOpenChange={(open) =>
								setDeleteRekognitionConfirmId(open ? row.original.id : null)
							}
						>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>
										{t('dialogs.removeFaceEnrollment.title')}
									</DialogTitle>
									<DialogDescription>
										{t('dialogs.removeFaceEnrollment.description', {
											name: `${row.original.firstName} ${row.original.lastName}`.trim(),
										})}
									</DialogDescription>
								</DialogHeader>
								<DialogFooter>
									<Button
										variant="outline"
										onClick={() => setDeleteRekognitionConfirmId(null)}
									>
										{tCommon('cancel')}
									</Button>
									<Button
										variant="destructive"
										onClick={() => handleDeleteRekognition(row.original.id)}
										disabled={deleteRekognitionMutation.isPending}
									>
										{deleteRekognitionMutation.isPending ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												{tCommon('removing')}
											</>
										) : (
											t('dialogs.removeFaceEnrollment.confirm')
										)}
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</>
				),
			},
		],
		[
			handleOpenEnrollDialog,
			handleViewDetails,
			openEmployeeDetailById,
			locationLookup,
			t,
			tCommon,
			deleteConfirmId,
			deleteRekognitionConfirmId,
			deleteMutation.isPending,
			deleteRekognitionMutation.isPending,
				handleDelete,
				handleDeleteRekognition,
				canUseDisciplinaryModule,
			],
		);

	if (!isOrgSelected) {
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
				<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
					<DialogTrigger asChild>
						<Button onClick={handleCreateNew}>
							<Plus className="mr-2 h-4 w-4" />
							{t('actions.addEmployee')}
						</Button>
					</DialogTrigger>
					<DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-h-[calc(100vh-6rem)] sm:max-w-5xl lg:max-w-6xl">
						<DialogHeader>
							<DialogTitle>
								{isCreateMode
									? t('dialog.title.add')
									: isEditMode
										? t('dialog.title.edit')
										: t('dialog.title.view')}
							</DialogTitle>
							<DialogDescription>
								{isCreateMode
									? t('dialog.description.add')
									: isEditMode
										? t('dialog.description.edit')
										: t('dialog.description.view')}
							</DialogDescription>
						</DialogHeader>
						{isViewMode ? (
							<div className="space-y-6 py-4">
								<div className="rounded-md border p-4">
									<div className="flex flex-wrap items-start justify-between gap-4">
										<div className="space-y-1">
											<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
												{t('details.header')}
											</p>
											<div className="flex flex-wrap items-center gap-2">
												<h2 className="text-xl font-semibold">
													{activeEmployeeName || tCommon('notAvailable')}
												</h2>
												{activeEmployee?.status && (
													<Badge
														variant={
															statusVariants[activeEmployee.status]
														}
													>
														{t(`status.${activeEmployee.status}`)}
													</Badge>
												)}
											</div>
											<p className="text-sm text-muted-foreground">
												{t('details.codeLabel')}{' '}
												<span className="font-medium text-foreground">
													{activeEmployee?.code ??
														tCommon('notAvailable')}
												</span>
											</p>
										</div>
										<Button variant="outline" onClick={handleEditFromDetails}>
											<Pencil className="mr-2 h-4 w-4" />
											{tCommon('edit')}
										</Button>
									</div>
									<div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
										<div className="space-y-1">
											<p className="text-muted-foreground">
												{t('fields.location')}
											</p>
											<p className="font-medium">{activeEmployeeLocation}</p>
										</div>
										<div className="space-y-1">
											<p className="text-muted-foreground">
												{t('fields.jobPosition')}
											</p>
											<p className="font-medium">
												{activeEmployee?.jobPositionName ??
													tCommon('notAvailable')}
											</p>
										</div>
										<div className="space-y-1">
											<p className="text-muted-foreground">
												{t('fields.hireDate')}
											</p>
											<p className="font-medium">
												{activeEmployee?.hireDate
													? format(
															new Date(activeEmployee.hireDate),
															t('dateFormat'),
														)
													: tCommon('notAvailable')}
											</p>
										</div>
										<div className="space-y-1">
											<p className="text-muted-foreground">
												{t('fields.shiftType')}
											</p>
											<p className="font-medium">
												{activeEmployee?.shiftType
													? t(
															`shiftTypeLabels.${activeEmployee.shiftType}`,
														)
													: tCommon('notAvailable')}
											</p>
										</div>
										<div className="space-y-1">
											<p className="text-muted-foreground">
												{t('fields.email')}
											</p>
											<p className="font-medium">
												{activeEmployee?.email ?? tCommon('notAvailable')}
											</p>
										</div>
										<div className="space-y-1">
											<p className="text-muted-foreground">
												{t('fields.phone')}
											</p>
											<p className="font-medium">
												{activeEmployee?.phone ?? tCommon('notAvailable')}
											</p>
										</div>
										<div className="space-y-1">
											<p className="text-muted-foreground">
												{t('fields.nss')}
											</p>
											<p className="font-medium">
												{activeEmployee?.nss ?? tCommon('notAvailable')}
											</p>
										</div>
										<div className="space-y-1">
											<p className="text-muted-foreground">
												{t('fields.rfc')}
											</p>
											<p className="font-medium">
												{activeEmployee?.rfc ?? tCommon('notAvailable')}
											</p>
										</div>
										<div className="space-y-1">
											<p className="text-muted-foreground">
												{t('fields.department')}
											</p>
											<p className="font-medium">
												{activeEmployee?.department ??
													tCommon('notAvailable')}
											</p>
										</div>
										<div className="space-y-1">
											<p className="text-muted-foreground">
												{t('fields.user')}
											</p>
											<p className="font-medium truncate">
												{activeEmployee?.userId ?? t('placeholders.noUser')}
											</p>
										</div>
									</div>
								</div>

								<Tabs
									value={detailTab}
									onValueChange={(value) =>
										setDetailTab(value as EmployeeDetailTab)
									}
									className="w-full"
								>
									<TabsList className="flex flex-wrap">
										<TabsTrigger value="documents">
											{t('tabs.documents')}
										</TabsTrigger>
										{canUseDisciplinaryModule ? (
											<TabsTrigger value="disciplinary">
												{t('tabs.disciplinary')}
											</TabsTrigger>
										) : null}
										<TabsTrigger value="summary">
											{t('tabs.summary')}
										</TabsTrigger>
										<TabsTrigger value="attendance">
											{t('tabs.attendance')}
										</TabsTrigger>
										<TabsTrigger value="vacations">
											{t('tabs.vacations')}
										</TabsTrigger>
										<TabsTrigger value="payroll">
											{t('tabs.payroll')}
										</TabsTrigger>
										<TabsTrigger value="ptu">{t('tabs.ptu')}</TabsTrigger>
										<TabsTrigger value="finiquito">
											{t('tabs.finiquito')}
										</TabsTrigger>
										<TabsTrigger value="exceptions">
											{t('tabs.exceptions')}
										</TabsTrigger>
										<TabsTrigger value="audit">{t('tabs.audit')}</TabsTrigger>
									</TabsList>

									<TabsContent value="documents">
										{activeEmployee?.id ? (
											<EmployeeDocumentsTab employeeId={activeEmployee.id} />
										) : (
											<Card>
												<CardContent className="py-8 text-sm text-muted-foreground">
													{t('documents.empty')}
												</CardContent>
											</Card>
										)}
									</TabsContent>

									{canUseDisciplinaryModule ? (
										<TabsContent value="disciplinary">
											{activeEmployee?.id ? (
												<EmployeeDisciplinaryMeasuresTab
													employeeId={activeEmployee.id}
												/>
											) : (
												<Card>
													<CardContent className="py-8 text-sm text-muted-foreground">
														{t('disciplinary.empty')}
													</CardContent>
												</Card>
											)}
										</TabsContent>
									) : null}

									<TabsContent value="summary">
										<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
											<Card>
												<CardHeader className="flex-row items-center justify-between space-y-0">
													<CardTitle className="text-sm font-medium">
														{vacationBalance ? (
															<TooltipProvider>
																<Tooltip>
																	<TooltipTrigger asChild>
																		<span className="inline-flex items-center gap-1">
																			{t(
																				'summary.availableDays',
																			)}
																			<HelpCircle className="h-4 w-4 text-muted-foreground" />
																		</span>
																	</TooltipTrigger>
																	<TooltipContent className="max-w-xs">
																		<div className="space-y-1 text-sm">
																			<p className="font-medium">
																				{t(
																					'vacationBalance.tooltip.title',
																				)}
																			</p>
																			<p>
																				{t(
																					'vacationBalance.tooltip.formula',
																				)}
																			</p>
																			<p>
																				{t(
																					'vacationBalance.tooltip.entitled',
																					{
																						value: vacationBalance.entitledDays,
																					},
																				)}
																			</p>
																			<p>
																				{t(
																					'vacationBalance.tooltip.accrued',
																					{
																						value: vacationBalance.accruedDays.toFixed(
																							2,
																						),
																					},
																				)}
																			</p>
																			<p>
																				{t(
																					'vacationBalance.tooltip.used',
																					{
																						value: vacationBalance.usedDays,
																					},
																				)}
																			</p>
																			<p>
																				{t(
																					'vacationBalance.tooltip.pending',
																					{
																						value: vacationBalance.pendingDays,
																					},
																				)}
																			</p>
																			<p>
																				{t(
																					'vacationBalance.tooltip.available',
																					{
																						value: vacationBalance.availableDays,
																					},
																				)}
																			</p>
																			<p>
																				{t(
																					'vacationBalance.tooltip.serviceYear',
																					{
																						number: vacationBalance.serviceYearNumber,
																						start:
																							vacationBalance.serviceYearStartDateKey ??
																							tCommon(
																								'notAvailable',
																							),
																						end:
																							vacationBalance.serviceYearEndDateKey ??
																							tCommon(
																								'notAvailable',
																							),
																					},
																				)}
																			</p>
																			<p>
																				{t(
																					'vacationBalance.tooltip.asOf',
																					{
																						date: vacationBalance.asOfDateKey,
																					},
																				)}
																			</p>
																		</div>
																	</TooltipContent>
																</Tooltip>
															</TooltipProvider>
														) : (
															t('summary.availableDays')
														)}
													</CardTitle>
												</CardHeader>
												<CardContent>
													{isLoadingInsights ? (
														<Skeleton className="h-7 w-20" />
													) : vacationBalance ? (
														<div className="text-2xl font-semibold">
															{vacationBalance.availableDays}
														</div>
													) : (
														<div className="text-sm text-muted-foreground">
															{tCommon('notAvailable')}
														</div>
													)}
													{vacationBalance && !isLoadingInsights && (
														<p className="text-xs text-muted-foreground">
															{t('summary.serviceYearShort', {
																number: vacationBalance.serviceYearNumber,
															})}
														</p>
													)}
												</CardContent>
											</Card>
											<Card>
												<CardHeader>
													<CardTitle className="text-sm font-medium">
														{t('summary.absences')}
													</CardTitle>
												</CardHeader>
												<CardContent>
													{isLoadingInsights ? (
														<Skeleton className="h-7 w-20" />
													) : attendanceSummary ? (
														<div className="text-2xl font-semibold">
															{attendanceSummary.totalAbsentDays}
														</div>
													) : (
														<div className="text-sm text-muted-foreground">
															{tCommon('notAvailable')}
														</div>
													)}
													<p className="text-xs text-muted-foreground">
														{t('summary.last90Days')}
													</p>
												</CardContent>
											</Card>
											<Card>
												<CardHeader>
													<CardTitle className="text-sm font-medium">
														{t('summary.leaves')}
													</CardTitle>
												</CardHeader>
												<CardContent>
													{isLoadingInsights ? (
														<Skeleton className="h-7 w-20" />
													) : (
														<div className="text-2xl font-semibold">
															{leaveItems.length}
														</div>
													)}
													<p className="text-xs text-muted-foreground">
														{t('summary.last90Days')}
													</p>
												</CardContent>
											</Card>
											<Card>
												<CardHeader>
													<CardTitle className="text-sm font-medium">
														{t('summary.payrollRuns')}
													</CardTitle>
												</CardHeader>
												<CardContent>
													{isLoadingInsights ? (
														<Skeleton className="h-7 w-20" />
													) : (
														<div className="text-2xl font-semibold">
															{payrollRuns.length}
														</div>
													)}
													<p className="text-xs text-muted-foreground">
														{t('summary.lastPayrollRuns')}
													</p>
												</CardContent>
											</Card>
											<Card>
												<CardHeader>
													<CardTitle className="text-sm font-medium">
														{t('summary.upcomingExceptions')}
													</CardTitle>
												</CardHeader>
												<CardContent>
													{isLoadingInsights ? (
														<Skeleton className="h-7 w-20" />
													) : (
														<div className="text-2xl font-semibold">
															{upcomingExceptions.length}
														</div>
													)}
													<p className="text-xs text-muted-foreground">
														{t('summary.next90Days')}
													</p>
												</CardContent>
											</Card>
										</div>
									</TabsContent>

									<TabsContent value="attendance">
										<div className="grid gap-4 lg:grid-cols-2">
											<Card>
												<CardHeader>
													<CardTitle className="text-sm font-medium">
														{t('attendance.absencesTitle')}
													</CardTitle>
												</CardHeader>
												<CardContent>
													{isLoadingInsights ? (
														<div className="space-y-2">
															<Skeleton className="h-4 w-32" />
															<Skeleton className="h-4 w-24" />
															<Skeleton className="h-4 w-28" />
														</div>
													) : attendanceSummary &&
													  attendanceSummary.absentDateKeys.length >
															0 ? (
														<ul className="space-y-2 text-sm">
															{attendanceSummary.absentDateKeys.map(
																(dateKey) => (
																	<li
																		key={dateKey}
																		className="flex items-center justify-between"
																	>
																		<span className="font-medium">
																			{formatShortDateUtc(
																				toUtcDate(dateKey),
																			)}
																		</span>
																		<span className="text-xs text-muted-foreground">
																			{dateKey}
																		</span>
																	</li>
																),
															)}
														</ul>
													) : (
														<p className="text-sm text-muted-foreground">
															{t('attendance.emptyAbsences')}
														</p>
													)}
												</CardContent>
											</Card>
											<Card>
												<CardHeader>
													<CardTitle className="text-sm font-medium">
														{t('attendance.leavesTitle')}
													</CardTitle>
												</CardHeader>
												<CardContent>
													{isLoadingInsights ? (
														<div className="space-y-2">
															<Skeleton className="h-4 w-32" />
															<Skeleton className="h-4 w-24" />
															<Skeleton className="h-4 w-28" />
														</div>
													) : leaveItems.length > 0 ? (
														<ul className="space-y-2 text-sm">
															{leaveItems.map((item) => (
																<li
																	key={item.id}
																	className="flex flex-col gap-1"
																>
																	<span className="font-medium">
																		{formatShortDateUtc(
																			toUtcDate(item.dateKey),
																		)}
																	</span>
																	<span className="text-xs text-muted-foreground">
																		{item.reason ??
																			t(
																				'attendance.noReason',
																			)}
																	</span>
																</li>
															))}
														</ul>
													) : (
														<p className="text-sm text-muted-foreground">
															{t('attendance.emptyLeaves')}
														</p>
													)}
												</CardContent>
											</Card>
										</div>
									</TabsContent>

									<TabsContent value="vacations">
										<div className="space-y-4">
											<Card>
												<CardHeader>
													<CardTitle className="text-sm font-medium">
														{t('vacations.balanceTitle')}
													</CardTitle>
												</CardHeader>
												<CardContent>
													{isLoadingInsights ? (
														<div className="space-y-2">
															<Skeleton className="h-4 w-32" />
															<Skeleton className="h-4 w-24" />
														</div>
													) : vacationBalance ? (
														<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
															<div className="space-y-1">
																<p className="text-xs text-muted-foreground">
																	{t(
																		'vacations.balance.entitled',
																	)}
																</p>
																<p className="text-lg font-semibold">
																	{vacationBalance.entitledDays}
																</p>
															</div>
															<div className="space-y-1">
																<p className="text-xs text-muted-foreground">
																	{t('vacations.balance.accrued')}
																</p>
																<p className="text-lg font-semibold">
																	{vacationBalance.accruedDays.toFixed(
																		2,
																	)}
																</p>
															</div>
															<div className="space-y-1">
																<p className="text-xs text-muted-foreground">
																	{t('vacations.balance.used')}
																</p>
																<p className="text-lg font-semibold">
																	{vacationBalance.usedDays}
																</p>
															</div>
															<div className="space-y-1">
																<p className="text-xs text-muted-foreground">
																	{t('vacations.balance.pending')}
																</p>
																<p className="text-lg font-semibold">
																	{vacationBalance.pendingDays}
																</p>
															</div>
															<div className="space-y-1">
																<p className="text-xs text-muted-foreground">
																	{t(
																		'vacations.balance.available',
																	)}
																</p>
																<p className="text-lg font-semibold">
																	{vacationBalance.availableDays}
																</p>
															</div>
														</div>
													) : (
														<p className="text-sm text-muted-foreground">
															{t('vacations.balanceUnavailable')}
														</p>
													)}
												</CardContent>
											</Card>

											<div className="rounded-md border">
												<Table>
													<TableHeader>
														<TableRow>
															<TableHead>
																{t(
																	'vacations.table.headers.period',
																)}
															</TableHead>
															<TableHead>
																{t('vacations.table.headers.days')}
															</TableHead>
															<TableHead>
																{t(
																	'vacations.table.headers.status',
																)}
															</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{isLoadingInsights ? (
															Array.from({ length: 3 }).map(
																(_, index) => (
																	<TableRow key={index}>
																		<TableCell>
																			<Skeleton className="h-4 w-24" />
																		</TableCell>
																		<TableCell>
																			<Skeleton className="h-4 w-20" />
																		</TableCell>
																		<TableCell>
																			<Skeleton className="h-4 w-16" />
																		</TableCell>
																	</TableRow>
																),
															)
														) : vacationRequests.length === 0 ? (
															<TableRow>
																<TableCell
																	colSpan={3}
																	className="h-20 text-center"
																>
																	{t('vacations.table.empty')}
																</TableCell>
															</TableRow>
														) : (
															vacationRequests.map((request) => (
																<TableRow key={request.id}>
																	<TableCell>
																		{formatDateRangeUtc(
																			toUtcDate(
																				request.startDateKey,
																			),
																			toUtcDate(
																				request.endDateKey,
																			),
																		)}
																	</TableCell>
																	<TableCell>
																		{tVacations(
																			'table.daysSummary',
																			{
																				vacation:
																					request.vacationDays,
																				total: request.totalDays,
																			},
																		)}
																	</TableCell>
																	<TableCell>
																		<Badge variant="outline">
																			{tVacations(
																				`status.${request.status}`,
																			)}
																		</Badge>
																	</TableCell>
																</TableRow>
															))
														)}
													</TableBody>
												</Table>
											</div>
										</div>
									</TabsContent>

									<TabsContent value="payroll">
										<div className="rounded-md border">
											<Table>
												<TableHeader>
													<TableRow>
														<TableHead>
															{t('payroll.table.headers.period')}
														</TableHead>
														<TableHead>
															{t('payroll.table.headers.total')}
														</TableHead>
														<TableHead>
															{t('payroll.table.headers.status')}
														</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{isLoadingInsights ? (
														Array.from({ length: 3 }).map(
															(_, index) => (
																<TableRow key={index}>
																	<TableCell>
																		<Skeleton className="h-4 w-24" />
																	</TableCell>
																	<TableCell>
																		<Skeleton className="h-4 w-20" />
																	</TableCell>
																	<TableCell>
																		<Skeleton className="h-4 w-16" />
																	</TableCell>
																</TableRow>
															),
														)
													) : payrollRuns.length === 0 ? (
														<TableRow>
															<TableCell
																colSpan={3}
																className="h-20 text-center"
															>
																{t('payroll.table.empty')}
															</TableCell>
														</TableRow>
													) : (
														payrollRuns.map((run) => (
															<TableRow key={run.payrollRunId}>
																<TableCell>
																	{formatDateRangeUtc(
																		new Date(run.periodStart),
																		new Date(run.periodEnd),
																	)}
																</TableCell>
																<TableCell>
																	{formatCurrency(run.totalPay)}
																</TableCell>
																<TableCell>
																	<Badge variant="outline">
																		{t(
																			`payroll.status.${run.status}`,
																		)}
																	</Badge>
																</TableCell>
															</TableRow>
														))
													)}
												</TableBody>
											</Table>
										</div>
									</TabsContent>

									<TabsContent value="ptu">
										<div className="grid gap-4 md:grid-cols-2">
											<Card>
												<CardHeader>
													<CardTitle className="text-sm font-medium">
														{t('ptuAguinaldo.title')}
													</CardTitle>
													<CardDescription>
														{t('ptuAguinaldo.subtitle')}
													</CardDescription>
												</CardHeader>
												<CardContent className="space-y-3 text-sm">
													<div className="flex items-center justify-between">
														<span className="text-muted-foreground">
															{t('fields.employmentType')}
														</span>
														<span className="font-medium">
															{t(
																`employmentType.${activeEmployee?.employmentType ?? 'PERMANENT'}`,
															)}
														</span>
													</div>
													<div className="flex items-center justify-between">
														<span className="text-muted-foreground">
															{t('fields.ptuEligibilityOverride')}
														</span>
														<span className="font-medium">
															{t(
																`ptuEligibility.${activeEmployee?.ptuEligibilityOverride ?? 'DEFAULT'}`,
															)}
														</span>
													</div>
													<div className="flex items-center justify-between">
														<span className="text-muted-foreground">
															{t('fields.aguinaldoDaysOverride')}
														</span>
														<span className="font-medium">
															{activeEmployee?.aguinaldoDaysOverride
																? t('ptuAguinaldo.values.days', {
																		days: activeEmployee.aguinaldoDaysOverride,
																	})
																: tCommon('notAvailable')}
														</span>
													</div>
													<div className="flex items-center justify-between">
														<span className="text-muted-foreground">
															{t('fields.platformHoursYear')}
														</span>
														<span className="font-medium">
															{activeEmployee?.platformHoursYear ?? tCommon('notAvailable')}
														</span>
													</div>
													<div className="grid gap-2">
														<div className="flex items-center justify-between">
															<span className="text-muted-foreground">
																{t('fields.isTrustEmployee')}
															</span>
															<span className="font-medium">
																{activeEmployee?.isTrustEmployee
																	? t('labels.yes')
																	: t('labels.no')}
															</span>
														</div>
														<div className="flex items-center justify-between">
															<span className="text-muted-foreground">
																{t('fields.isDirectorAdminGeneralManager')}
															</span>
															<span className="font-medium">
																{activeEmployee?.isDirectorAdminGeneralManager
																	? t('labels.yes')
																	: t('labels.no')}
															</span>
														</div>
														<div className="flex items-center justify-between">
															<span className="text-muted-foreground">
																{t('fields.isDomesticWorker')}
															</span>
															<span className="font-medium">
																{activeEmployee?.isDomesticWorker
																	? t('labels.yes')
																	: t('labels.no')}
															</span>
														</div>
														<div className="flex items-center justify-between">
															<span className="text-muted-foreground">
																{t('fields.isPlatformWorker')}
															</span>
															<span className="font-medium">
																{activeEmployee?.isPlatformWorker
																	? t('labels.yes')
																	: t('labels.no')}
															</span>
														</div>
													</div>
												</CardContent>
											</Card>
											<Card>
												<CardHeader>
													<CardTitle className="text-sm font-medium">
														{t('ptuHistory.title')}
													</CardTitle>
													<CardDescription>
														{t('ptuHistory.subtitle')}
													</CardDescription>
												</CardHeader>
												<CardContent>
													<div className="rounded-md border">
														<Table>
															<TableHeader>
																<TableRow>
																	<TableHead>
																		{t('ptuHistory.table.year')}
																	</TableHead>
																	<TableHead className="text-right">
																		{t('ptuHistory.table.amount')}
																	</TableHead>
																</TableRow>
															</TableHeader>
															<TableBody>
																{isLoadingPtuHistory ? (
																	<TableRow>
																		<TableCell colSpan={2}>
																			<Skeleton className="h-4 w-full" />
																		</TableCell>
																	</TableRow>
																) : ptuHistory.length === 0 ? (
																	<TableRow>
																		<TableCell
																			colSpan={2}
																			className="h-20 text-center"
																		>
																			{t('ptuHistory.table.empty')}
																		</TableCell>
																	</TableRow>
																) : (
																	ptuHistory.map((entry) => (
																		<TableRow key={entry.id}>
																			<TableCell>
																				{entry.fiscalYear}
																			</TableCell>
																			<TableCell className="text-right tabular-nums">
																				{formatCurrency(entry.amount)}
																			</TableCell>
																		</TableRow>
																	))
																)}
															</TableBody>
														</Table>
													</div>
												</CardContent>
											</Card>
										</div>
									</TabsContent>

									<TabsContent value="finiquito">
										<div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
											<Card>
												<CardHeader>
													<CardTitle className="text-sm font-medium">
														{t('finiquito.form.title')}
													</CardTitle>
													<p className="text-xs text-muted-foreground">
														{t('finiquito.form.subtitle')}
													</p>
												</CardHeader>
												<CardContent>
													<div className="grid gap-4 sm:grid-cols-2">
														<TerminationDateField
															label={t(
																'finiquito.fields.terminationDate',
															)}
															placeholder={t(
																'finiquito.placeholders.terminationDate',
															)}
															value={
																terminationForm.terminationDateKey
															}
															onChange={(nextValue) =>
																updateTerminationForm({
																	terminationDateKey: nextValue,
																})
															}
															disabled={isTerminationLocked}
														/>
														<TerminationDateField
															label={t(
																'finiquito.fields.lastDayWorkedDate',
															)}
															placeholder={t(
																'finiquito.placeholders.lastDayWorkedDate',
															)}
															value={
																terminationForm.lastDayWorkedDateKey
															}
															onChange={(nextValue) =>
																updateTerminationForm({
																	lastDayWorkedDateKey: nextValue,
																})
															}
															disabled={isTerminationLocked}
														/>
														<div className="space-y-2">
															<Label>
																{t(
																	'finiquito.fields.terminationReason',
																)}
															</Label>
															<Select
																value={
																	terminationForm.terminationReason
																}
																onValueChange={(value) =>
																	updateTerminationForm({
																		terminationReason:
																			value as TerminationReason,
																	})
																}
																disabled={isTerminationLocked}
															>
																<SelectTrigger>
																	<SelectValue
																		placeholder={t(
																			'finiquito.placeholders.terminationReason',
																		)}
																	/>
																</SelectTrigger>
																<SelectContent>
																	{terminationReasonOptions.map(
																		(option) => (
																			<SelectItem
																				key={option.value}
																				value={option.value}
																			>
																				{t(option.labelKey)}
																			</SelectItem>
																		),
																	)}
																</SelectContent>
															</Select>
														</div>
														<div className="space-y-2">
															<Label>
																{t('finiquito.fields.contractType')}
															</Label>
															<Select
																value={terminationForm.contractType}
																onValueChange={(value) =>
																	updateTerminationForm({
																		contractType:
																			value as EmploymentContractType,
																	})
																}
																disabled={isTerminationLocked}
															>
																<SelectTrigger>
																	<SelectValue
																		placeholder={t(
																			'finiquito.placeholders.contractType',
																		)}
																	/>
																</SelectTrigger>
																<SelectContent>
																	{contractTypeOptions.map(
																		(option) => (
																			<SelectItem
																				key={option.value}
																				value={option.value}
																			>
																				{t(option.labelKey)}
																			</SelectItem>
																		),
																	)}
																</SelectContent>
															</Select>
														</div>
														<div className="space-y-2">
															<Label>
																{t('finiquito.fields.unpaidDays')}
															</Label>
															<Input
																type="number"
																min="0"
																step="0.01"
																value={terminationForm.unpaidDays}
																onChange={(event) =>
																	updateTerminationForm({
																		unpaidDays:
																			event.target.value,
																	})
																}
																placeholder={t(
																	'finiquito.placeholders.unpaidDays',
																)}
																disabled={isTerminationLocked}
															/>
														</div>
														<div className="space-y-2">
															<Label>
																{t('finiquito.fields.otherDue')}
															</Label>
															<Input
																type="number"
																min="0"
																step="0.01"
																value={terminationForm.otherDue}
																onChange={(event) =>
																	updateTerminationForm({
																		otherDue:
																			event.target.value,
																	})
																}
																placeholder={t(
																	'finiquito.placeholders.otherDue',
																)}
																disabled={isTerminationLocked}
															/>
														</div>
														<div className="space-y-2">
															<Label>
																{t(
																	'finiquito.fields.vacationBalanceDays',
																)}
															</Label>
															<Input
																type="number"
																min="0"
																step="0.01"
																value={
																	terminationForm.vacationBalanceDays
																}
																onChange={(event) =>
																	updateTerminationForm({
																		vacationBalanceDays:
																			event.target.value,
																	})
																}
																placeholder={t(
																	'finiquito.placeholders.vacationBalanceDays',
																)}
																disabled={isTerminationLocked}
															/>
															<p className="text-xs text-muted-foreground">
																{t(
																	'finiquito.helpers.vacationBalanceDays',
																)}
															</p>
														</div>
														<div className="space-y-2">
															<Label>
																{t(
																	'finiquito.fields.dailySalaryIndemnizacion',
																)}
															</Label>
															<Input
																type="number"
																min="0"
																step="0.01"
																value={
																	terminationForm.dailySalaryIndemnizacion
																}
																onChange={(event) =>
																	updateTerminationForm({
																		dailySalaryIndemnizacion:
																			event.target.value,
																	})
																}
																placeholder={t(
																	'finiquito.placeholders.dailySalaryIndemnizacion',
																)}
																disabled={isTerminationLocked}
															/>
															<p className="text-xs text-muted-foreground">
																{t(
																	'finiquito.helpers.dailySalaryIndemnizacion',
																)}
															</p>
														</div>
														<div className="space-y-2 sm:col-span-2">
															<Label>
																{t(
																	'finiquito.fields.terminationNotes',
																)}
															</Label>
															<Textarea
																value={
																	terminationForm.terminationNotes
																}
																onChange={(event) =>
																	updateTerminationForm({
																		terminationNotes:
																			event.target.value,
																	})
																}
																placeholder={t(
																	'finiquito.placeholders.terminationNotes',
																)}
																disabled={isTerminationLocked}
															/>
														</div>
													</div>

													<div className="mt-4 space-y-3">
														<div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
															<HelpCircle className="mt-0.5 h-4 w-4" />
															<span>
																{t('finiquito.form.previewHint', {
																	action: t(
																		'finiquito.actions.preview',
																	),
																})}
															</span>
														</div>
														<div className="flex flex-wrap gap-2">
															<Button
																onClick={handleTerminationPreview}
																disabled={
																	isTerminationLocked ||
																	terminationPreviewMutation.isPending
																}
															>
																{terminationPreviewMutation.isPending ? (
																	<>
																		<Loader2 className="mr-2 h-4 w-4 animate-spin" />
																		{t(
																			'finiquito.actions.previewLoading',
																		)}
																	</>
																) : (
																	t('finiquito.actions.preview')
																)}
															</Button>

															<Dialog
																open={isTerminateDialogOpen}
																onOpenChange={
																	setIsTerminateDialogOpen
																}
															>
																<DialogTrigger asChild>
																	<Button
																		variant="destructive"
																		disabled={
																			!canConfirmTermination ||
																			terminationMutation.isPending
																		}
																	>
																		{terminationMutation.isPending ? (
																			<>
																				<Loader2 className="mr-2 h-4 w-4 animate-spin" />
																				{t(
																					'finiquito.actions.confirmLoading',
																				)}
																			</>
																		) : (
																			t(
																				'finiquito.actions.confirm',
																			)
																		)}
																	</Button>
																</DialogTrigger>
																<DialogContent>
																	<DialogHeader>
																		<DialogTitle>
																			{t(
																				'finiquito.dialog.title',
																			)}
																		</DialogTitle>
																		<DialogDescription>
																			{t(
																				'finiquito.dialog.description',
																				{
																					name:
																						activeEmployeeName ||
																						tCommon(
																							'notAvailable',
																						),
																					total: terminationPreview
																						? formatCurrency(
																								terminationPreview
																									.totals
																									.grossTotal,
																							)
																						: tCommon(
																								'notAvailable',
																							),
																				},
																			)}
																		</DialogDescription>
																	</DialogHeader>
																	<DialogFooter>
																		<Button
																			variant="outline"
																			onClick={() =>
																				setIsTerminateDialogOpen(
																					false,
																				)
																			}
																		>
																			{tCommon('cancel')}
																		</Button>
																		<Button
																			variant="destructive"
																			onClick={
																				handleTerminateEmployee
																			}
																			disabled={
																				terminationMutation.isPending
																			}
																		>
																			{terminationMutation.isPending ? (
																				<>
																					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
																					{t(
																						'finiquito.actions.confirmLoading',
																					)}
																				</>
																			) : (
																				tCommon('confirm')
																			)}
																		</Button>
																	</DialogFooter>
																</DialogContent>
															</Dialog>
															{canDownloadTerminationReceipt ? (
																<Button variant="outline" asChild>
																	<a
																		href={terminationReceiptUrl}
																		target="_blank"
																		rel="noopener noreferrer"
																	>
																		{t(
																			'finiquito.actions.downloadReceipt',
																		)}
																	</a>
																</Button>
															) : (
																<Button
																	variant="outline"
																	disabled={
																		isLoadingTerminationSettlement ||
																		!canDownloadTerminationReceipt
																	}
																>
																	{isLoadingTerminationSettlement ? (
																		<>
																			<Loader2 className="mr-2 h-4 w-4 animate-spin" />
																			{t(
																				'finiquito.actions.downloadReceiptLoading',
																			)}
																		</>
																	) : (
																		t(
																			'finiquito.actions.downloadReceipt',
																		)
																	)}
																</Button>
															)}
														</div>
													</div>
												</CardContent>
											</Card>

											<div className="space-y-4">
												<Card>
													<CardHeader>
														<CardTitle className="text-sm font-medium">
															{t('finiquito.results.finiquitoTitle')}
														</CardTitle>
													</CardHeader>
													<CardContent>
														{terminationPreview ? (
															<div className="space-y-2 text-sm">
																{finiquitoLines.map((line) => (
																	<div
																		key={line.key}
																		className="flex items-center justify-between"
																	>
																		<span>{line.label}</span>
																		<span className="font-medium">
																			{formatCurrency(
																				line.value,
																			)}
																		</span>
																	</div>
																))}
																<div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
																	<span>
																		{t(
																			'finiquito.breakdown.totalGross',
																		)}
																	</span>
																	<span>
																		{formatCurrency(
																			terminationPreview
																				.totals
																				.finiquitoTotalGross,
																		)}
																	</span>
																</div>
															</div>
														) : (
															<p className="text-sm text-muted-foreground">
																{t('finiquito.empty.preview')}
															</p>
														)}
													</CardContent>
												</Card>

												<Card>
													<CardHeader>
														<CardTitle className="text-sm font-medium">
															{t('finiquito.results.totalTitle')}
														</CardTitle>
													</CardHeader>
													<CardContent>
														{terminationPreview ? (
															<div className="text-2xl font-semibold">
																{formatCurrency(
																	terminationPreview.totals
																		.grossTotal,
																)}
															</div>
														) : (
															<p className="text-sm text-muted-foreground">
																{t('finiquito.empty.preview')}
															</p>
														)}
													</CardContent>
												</Card>

												<Accordion type="single" collapsible>
													<AccordionItem value="liquidacion">
														<AccordionTrigger>
															{t(
																'finiquito.results.liquidacionTitle',
															)}
														</AccordionTrigger>
														<AccordionContent>
															{terminationPreview ? (
																<div className="space-y-2 text-sm">
																	{liquidacionLines.map(
																		(line) => (
																			<div
																				key={line.key}
																				className="flex items-center justify-between"
																			>
																				<span>
																					{line.label}
																				</span>
																				<span className="font-medium">
																					{formatCurrency(
																						line.value,
																					)}
																				</span>
																			</div>
																		),
																	)}
																	<div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
																		<span>
																			{t(
																				'finiquito.breakdown.totalGross',
																			)}
																		</span>
																		<span>
																			{formatCurrency(
																				terminationPreview
																					.totals
																					.liquidacionTotalGross,
																			)}
																		</span>
																	</div>
																	{terminationPreview.totals
																		.liquidacionTotalGross ===
																		0 && (
																		<p className="text-xs text-muted-foreground">
																			{t(
																				'finiquito.empty.liquidacion',
																			)}
																		</p>
																	)}
																</div>
															) : (
																<p className="text-sm text-muted-foreground">
																	{t('finiquito.empty.preview')}
																</p>
															)}
														</AccordionContent>
													</AccordionItem>
												</Accordion>
											</div>
										</div>
									</TabsContent>

									<TabsContent value="exceptions">
										<div className="rounded-md border">
											<Table>
												<TableHeader>
													<TableRow>
														<TableHead>
															{t('exceptions.table.headers.date')}
														</TableHead>
														<TableHead>
															{t('exceptions.table.headers.type')}
														</TableHead>
														<TableHead>
															{t('exceptions.table.headers.reason')}
														</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{isLoadingInsights ? (
														Array.from({ length: 3 }).map(
															(_, index) => (
																<TableRow key={index}>
																	<TableCell>
																		<Skeleton className="h-4 w-24" />
																	</TableCell>
																	<TableCell>
																		<Skeleton className="h-4 w-20" />
																	</TableCell>
																	<TableCell>
																		<Skeleton className="h-4 w-28" />
																	</TableCell>
																</TableRow>
															),
														)
													) : upcomingExceptions.length === 0 ? (
														<TableRow>
															<TableCell
																colSpan={3}
																className="h-20 text-center"
															>
																{t('exceptions.table.empty')}
															</TableCell>
														</TableRow>
													) : (
														upcomingExceptions.map((item) => (
															<TableRow key={item.id}>
																<TableCell>
																	{formatShortDateUtc(
																		toUtcDate(item.dateKey),
																	)}
																</TableCell>
																<TableCell>
																	{t(
																		`exceptionTypes.${item.exceptionType}`,
																	)}
																</TableCell>
																<TableCell>
																	{item.reason ??
																		tCommon('notAvailable')}
																</TableCell>
															</TableRow>
														))
													)}
												</TableBody>
											</Table>
										</div>
									</TabsContent>

									<TabsContent value="audit">
										<div className="rounded-md border">
											<Table>
												<TableHeader>
													<TableRow>
														<TableHead>
															{t('audit.table.headers.date')}
														</TableHead>
														<TableHead>
															{t('audit.table.headers.action')}
														</TableHead>
														<TableHead>
															{t('audit.table.headers.actor')}
														</TableHead>
														<TableHead>
															{t('audit.table.headers.fields')}
														</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{isLoadingAudit ? (
														Array.from({ length: 3 }).map(
															(_, index) => (
																<TableRow key={index}>
																	<TableCell>
																		<Skeleton className="h-4 w-24" />
																	</TableCell>
																	<TableCell>
																		<Skeleton className="h-4 w-24" />
																	</TableCell>
																	<TableCell>
																		<Skeleton className="h-4 w-28" />
																	</TableCell>
																	<TableCell>
																		<Skeleton className="h-4 w-32" />
																	</TableCell>
																</TableRow>
															),
														)
													) : auditEvents.length === 0 ? (
														<TableRow>
															<TableCell
																colSpan={4}
																className="h-20 text-center"
															>
																{t('audit.table.empty')}
															</TableCell>
														</TableRow>
													) : (
														auditEvents.map((event) => {
															const actorLabel =
																event.actorName ??
																event.actorEmail ??
																event.actorUserId;
															const actorTypeLabel = t(
																`audit.actorTypes.${event.actorType}`,
															);
															const fieldsLabel =
																event.changedFields &&
																event.changedFields.length > 0
																	? event.changedFields
																			.map(
																				(field) =>
																					auditFieldLabels[
																						field
																					] ??
																					t(
																						'audit.fields.unknown',
																						{
																							field,
																						},
																					),
																			)
																			.join(', ')
																	: t('audit.fields.none');

															return (
																<TableRow key={event.id}>
																	<TableCell>
																		{format(
																			new Date(
																				event.createdAt,
																			),
																			t('dateFormat'),
																		)}
																	</TableCell>
																	<TableCell>
																		{t(
																			`audit.actions.${event.action}`,
																		)}
																	</TableCell>
																	<TableCell>
																		{actorLabel
																			? `${actorTypeLabel} - ${actorLabel}`
																			: actorTypeLabel}
																	</TableCell>
																	<TableCell>
																		{fieldsLabel}
																	</TableCell>
																</TableRow>
															);
														})
													)}
												</TableBody>
											</Table>
										</div>
									</TabsContent>
								</Tabs>
							</div>
						) : (
							<form
								onSubmit={(e) => {
									e.preventDefault();
									e.stopPropagation();
									form.handleSubmit();
								}}
							>
								<div className="grid gap-4 py-4 sm:grid-cols-2">
									<div className="col-span-2 sm:col-span-1">
										<form.AppField
											name="code"
											validators={{
												onChange: ({ value }) =>
													!value.trim()
														? t('validation.codeRequired')
														: undefined,
											}}
										>
											{(field) => (
												<field.TextField
													label={t('fields.code')}
													onValueChange={(next) => {
														setHasCustomCode(true);
														return next;
													}}
													disabled={isEditMode}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 sm:col-span-1">
										<form.AppField
											name="firstName"
											validators={{
												onChange: ({ value }) =>
													!value.trim()
														? t('validation.firstNameRequired')
														: undefined,
											}}
										>
											{(field) => (
												<field.TextField label={t('fields.firstName')} />
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 sm:col-span-1">
										<form.AppField
											name="lastName"
											validators={{
												onChange: ({ value }) =>
													!value.trim()
														? t('validation.lastNameRequired')
														: undefined,
											}}
										>
											{(field) => (
												<field.TextField label={t('fields.lastName')} />
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 sm:col-span-1">
										<form.AppField name="nss">
											{(field) => (
												<field.TextField
													label={t('fields.nss')}
													placeholder={tCommon('optional')}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 sm:col-span-1">
										<form.AppField name="rfc">
											{(field) => (
												<field.TextField
													label={t('fields.rfc')}
													placeholder={tCommon('optional')}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 sm:col-span-1">
										<form.AppField name="email">
											{(field) => (
												<field.TextField
													label={t('fields.email')}
													type="email"
													placeholder={tCommon('optional')}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 sm:col-span-1">
										<form.AppField name="userId">
											{(field) => (
												<field.SelectField
													label={t('fields.user')}
													options={memberOptions}
													placeholder={
														isLoadingMembers
															? tCommon('loading')
															: t('placeholders.selectUser')
													}
													disabled={isLoadingMembers}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 sm:col-span-1">
										<form.AppField name="phone">
											{(field) => (
												<field.TextField
													label={t('fields.phone')}
													placeholder={tCommon('optional')}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 sm:col-span-1">
										<form.AppField
											name="locationId"
											validators={{
												onChange: ({ value }) =>
													!value
														? t('validation.locationRequired')
														: undefined,
											}}
										>
											{(field) => (
												<field.SelectField
													label={t('fields.location')}
													options={locations.map((location) => ({
														value: location.id,
														label: location.name,
													}))}
													placeholder={
														isLoadingLocations
															? tCommon('loading')
															: t('placeholders.selectLocation')
													}
													disabled={isLoadingLocations}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 sm:col-span-1">
										<form.AppField
											name="jobPositionId"
											validators={{
												onChange: ({ value }) =>
													isCreateMode && !value
														? t('validation.jobPositionRequired')
														: undefined,
											}}
										>
											{(field) => (
												<field.SelectField
													label={t('fields.jobPosition')}
													options={jobPositions.map((position) => ({
														value: position.id,
														label: position.name,
													}))}
													placeholder={
														isLoadingJobPositions
															? tCommon('loading')
															: t('placeholders.selectJobPosition')
													}
													disabled={isLoadingJobPositions}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 sm:col-span-1">
										<form.AppField name="department">
											{(field) => (
												<field.TextField
													label={t('fields.department')}
													placeholder={tCommon('optional')}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 sm:col-span-1">
										<form.AppField name="status">
											{(field) => (
												<field.SelectField
													label={t('fields.status')}
													options={[
														{
															value: 'ACTIVE',
															label: t('status.ACTIVE'),
														},
														{
															value: 'INACTIVE',
															label: t('status.INACTIVE'),
														},
														{
															value: 'ON_LEAVE',
															label: t('status.ON_LEAVE'),
														},
													]}
													placeholder={t('placeholders.selectStatus')}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 sm:col-span-1">
										<form.AppField name="shiftType">
											{(field) => (
												<field.SelectField
													label={t('fields.shiftType')}
													options={shiftTypeOptions.map((option) => ({
														value: option.value,
														label: t(option.labelKey),
													}))}
													placeholder={t('placeholders.selectShiftType')}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 sm:col-span-1">
										<form.AppField
											name="hireDate"
											validators={{
												onChange: ({ value }) => {
													const trimmedValue = value.trim();
													if (!trimmedValue) {
														return undefined;
													}
													const parsedValue = parse(
														trimmedValue,
														'yyyy-MM-dd',
														new Date(),
													);
													if (
														!isValid(parsedValue) ||
														format(parsedValue, 'yyyy-MM-dd') !==
															trimmedValue
													) {
														return t('validation.hireDateInvalid');
													}
													const today = startOfDay(new Date());
													if (isAfter(startOfDay(parsedValue), today)) {
														return t(
															'validation.hireDateFutureNotAllowed',
														);
													}
													return undefined;
												},
											}}
										>
											{(field) => (
												<field.DateField
													label={t('fields.hireDate')}
													placeholder={t('placeholders.hireDate')}
													variant="input"
													minYear={1950}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 sm:col-span-1">
										<form.AppField
											name="paymentFrequency"
											validators={{
												onChange: ({ value }) =>
													!value
														? t('validation.paymentFrequencyRequired')
														: undefined,
											}}
										>
											{(field) => (
												<field.SelectField
													label={t('fields.paymentFrequency')}
													options={[
														{
															value: 'WEEKLY',
															label: t('paymentFrequency.WEEKLY'),
														},
														{
															value: 'BIWEEKLY',
															label: t('paymentFrequency.BIWEEKLY'),
														},
														{
															value: 'MONTHLY',
															label: t('paymentFrequency.MONTHLY'),
														},
													]}
													placeholder={t(
														'placeholders.selectPaymentFrequency',
													)}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 sm:col-span-1">
										<form.AppField
											name="periodPay"
											validators={{
												onChange: ({ value }) =>
													Number(value) <= 0
														? t('validation.periodPayGreaterThanZero')
														: undefined,
											}}
										>
											{(field) => (
												<field.TextField
													label={periodPayLabel}
													type="number"
													placeholder={t('placeholders.periodPayExample')}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2">
										<div className="grid grid-cols-4 items-center gap-4">
											<Label className="text-right">
												{t('fields.dailyPayCalculated')}
											</Label>
											<Input
												className="col-span-3"
												value={computedDailyPay.toFixed(2)}
												readOnly
												disabled
											/>
										</div>
									</div>
									<div className="col-span-2 sm:col-span-1">
										<form.AppField
											name="sbcDailyOverride"
											validators={{
												onChange: ({ value }) => {
													const trimmed = value.trim();
													if (!trimmed) {
														return undefined;
													}
													const parsed = Number(trimmed);
													if (!Number.isFinite(parsed) || parsed <= 0) {
														return t('validation.sbcDailyOverride');
													}
													return undefined;
												},
											}}
										>
											{(field) => (
												<field.TextField
													label={t('fields.sbcDailyOverride')}
													placeholder={t('placeholders.sbcDailyOverride')}
													description={t('helpers.sbcDailyOverride')}
												/>
											)}
										</form.AppField>
									</div>

									<div className="col-span-2 space-y-3 rounded-md border p-3">
										<div>
											<p className="text-sm font-medium">
												{t('ptuAguinaldo.title')}
											</p>
											<p className="text-xs text-muted-foreground">
												{t('ptuAguinaldo.subtitle')}
											</p>
										</div>
										<TooltipProvider>
											<div className="space-y-2 rounded-md border border-dashed bg-muted/20 p-2">
												<p className="text-xs text-muted-foreground">
													{t('ptuAguinaldo.optionsHelp.title')}
												</p>
												<div className="flex flex-wrap gap-2">
													{ptuAguinaldoOptionHelp.map((item) => (
														<Tooltip key={item.key}>
															<TooltipTrigger asChild>
																<Badge
																	variant="outline"
																	className="cursor-help gap-1"
																>
																	<HelpCircle className="h-3 w-3" />
																	{item.label}
																</Badge>
															</TooltipTrigger>
															<TooltipContent className="max-w-xs">
																<p className="text-xs">
																	{item.description}
																</p>
															</TooltipContent>
														</Tooltip>
													))}
												</div>
											</div>
										</TooltipProvider>
										<div className="grid gap-4 sm:grid-cols-2">
											<form.AppField name="employmentType">
												{(field) => (
													<field.SelectField
														label={t('fields.employmentType')}
														options={employmentTypeOptions.map((option) => ({
															value: option.value,
															label: t(option.labelKey),
														}))}
														placeholder={t('placeholders.selectEmploymentType')}
													/>
												)}
											</form.AppField>
											<form.AppField name="ptuEligibilityOverride">
												{(field) => (
													<field.SelectField
														label={t('fields.ptuEligibilityOverride')}
														options={ptuEligibilityOptions.map((option) => ({
															value: option.value,
															label: t(option.labelKey),
														}))}
														placeholder={t('placeholders.selectPtuEligibility')}
													/>
												)}
											</form.AppField>
											<form.AppField
												name="aguinaldoDaysOverride"
												validators={{
													onChange: ({ value }) => {
														const trimmed = value.trim();
														if (!trimmed) {
															return undefined;
														}
														const parsed = Number(trimmed);
														if (!Number.isFinite(parsed) || parsed < 0) {
															return t('validation.aguinaldoDaysOverride');
														}
														return undefined;
													},
												}}
											>
												{(field) => (
													<field.TextField
														label={t('fields.aguinaldoDaysOverride')}
														placeholder={t('placeholders.aguinaldoDaysOverride')}
														type="number"
														description={t('helpers.aguinaldoDaysOverride')}
													/>
												)}
											</form.AppField>
											<form.AppField
												name="platformHoursYear"
												validators={{
													onChange: ({ value }) => {
														const trimmed = value.trim();
														if (!trimmed) {
															return undefined;
														}
														const parsed = Number(trimmed);
														if (!Number.isFinite(parsed) || parsed < 0) {
															return t('validation.platformHoursYear');
														}
														return undefined;
													},
												}}
											>
												{(field) => (
													<field.TextField
														label={t('fields.platformHoursYear')}
														placeholder={t('placeholders.platformHoursYear')}
														type="number"
														description={t('helpers.platformHoursYear')}
													/>
												)}
											</form.AppField>
										</div>
										<div className="grid gap-3 sm:grid-cols-2">
											<form.AppField name="isTrustEmployee">
												{(field) => (
													<field.ToggleField
														label={t('fields.isTrustEmployee')}
														description={t('helpers.isTrustEmployee')}
														orientation="vertical"
													/>
												)}
											</form.AppField>
											<form.AppField name="isDirectorAdminGeneralManager">
												{(field) => (
													<field.ToggleField
														label={t('fields.isDirectorAdminGeneralManager')}
														description={t(
															'helpers.isDirectorAdminGeneralManager',
														)}
														orientation="vertical"
													/>
												)}
											</form.AppField>
											<form.AppField name="isDomesticWorker">
												{(field) => (
													<field.ToggleField
														label={t('fields.isDomesticWorker')}
														description={t('helpers.isDomesticWorker')}
														orientation="vertical"
													/>
												)}
											</form.AppField>
											<form.AppField name="isPlatformWorker">
												{(field) => (
													<field.ToggleField
														label={t('fields.isPlatformWorker')}
														description={t('helpers.isPlatformWorker')}
														orientation="vertical"
													/>
												)}
											</form.AppField>
										</div>

										<div className="rounded-md border bg-muted/30 p-3">
											<div className="flex flex-wrap items-center justify-between gap-2">
												<div>
													<p className="text-xs font-medium">
														{t('ptuHistory.title')}
													</p>
													<p className="text-xs text-muted-foreground">
														{t('ptuHistory.subtitle')}
													</p>
												</div>
												<Button
													type="button"
													size="sm"
													onClick={() => void handlePtuHistorySave()}
													disabled={ptuHistoryMutation.isPending || !activeEmployee}
												>
													{ptuHistoryMutation.isPending
														? tCommon('saving')
														: t('ptuHistory.actions.save')}
												</Button>
											</div>
											<div className="mt-3 grid gap-3 sm:grid-cols-2">
												<div className="flex flex-col gap-2">
													<Label htmlFor="ptu-history-year">
														{t('ptuHistory.fields.year')}
													</Label>
													<Input
														id="ptu-history-year"
														type="number"
														min={2000}
														value={ptuHistoryYearInput}
														onChange={(event) =>
															setPtuHistoryYearInput(event.target.value)
														}
													/>
												</div>
												<div className="flex flex-col gap-2">
													<Label htmlFor="ptu-history-amount">
														{t('ptuHistory.fields.amount')}
													</Label>
													<Input
														id="ptu-history-amount"
														type="number"
														min={0}
														step="0.01"
														value={ptuHistoryAmountInput}
														onChange={(event) =>
															setPtuHistoryAmountInput(event.target.value)
														}
													/>
												</div>
											</div>
											<div className="mt-3 rounded-md border bg-background">
												<Table>
													<TableHeader>
														<TableRow>
															<TableHead>
																{t('ptuHistory.table.year')}
															</TableHead>
															<TableHead className="text-right">
																{t('ptuHistory.table.amount')}
															</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{isLoadingPtuHistory ? (
															<TableRow>
																<TableCell colSpan={2}>
																	<Skeleton className="h-4 w-full" />
																</TableCell>
															</TableRow>
														) : ptuHistory.length === 0 ? (
															<TableRow>
																<TableCell colSpan={2} className="h-12 text-center text-xs text-muted-foreground">
																	{t('ptuHistory.table.empty')}
																</TableCell>
															</TableRow>
														) : (
															ptuHistory.map((entry) => (
																<TableRow key={entry.id}>
																	<TableCell>{entry.fiscalYear}</TableCell>
																	<TableCell className="text-right tabular-nums">
																		{formatCurrency(entry.amount)}
																	</TableCell>
																</TableRow>
															))
														)}
													</TableBody>
												</Table>
											</div>
										</div>
									</div>

									<div className="col-span-2 space-y-2 rounded-md border p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-sm font-medium">
													{t('schedule.title')}
												</p>
												<p className="text-xs text-muted-foreground">
													{t('schedule.subtitle')}
												</p>
											</div>
											{isScheduleLoading && (
												<div className="flex items-center gap-2 text-xs text-muted-foreground">
													<Loader2 className="h-4 w-4 animate-spin" />
													{t('schedule.loading')}
												</div>
											)}
										</div>
										<div className="grid gap-2">
											{daysOfWeek.map((day) => {
												const entry = schedule.find(
													(item) => item.dayOfWeek === day.value,
												) ?? {
													dayOfWeek: day.value,
													startTime: '09:00',
													endTime: '17:00',
													isWorkingDay: day.value >= 1 && day.value <= 5,
												};
												return (
													<div
														key={day.value}
														className="grid grid-cols-12 items-center gap-2 rounded-md border p-2"
													>
														<div className="col-span-3 flex items-center gap-2">
															<input
																type="checkbox"
																className="h-4 w-4 accent-primary"
																checked={entry.isWorkingDay}
																onChange={(e) =>
																	upsertScheduleEntry(day.value, {
																		isWorkingDay:
																			e.target.checked,
																	})
																}
															/>
															<span className="text-sm">
																{t(day.labelKey)}
															</span>
														</div>
														<div className="col-span-4">
															<Label className="text-xs text-muted-foreground">
																{t('schedule.start')}
															</Label>
															<Input
																type="time"
																value={entry.startTime}
																disabled={!entry.isWorkingDay}
																onChange={(e) =>
																	upsertScheduleEntry(day.value, {
																		startTime: e.target.value,
																	})
																}
															/>
														</div>
														<div className="col-span-4">
															<Label className="text-xs text-muted-foreground">
																{t('schedule.end')}
															</Label>
															<Input
																type="time"
																value={entry.endTime}
																disabled={!entry.isWorkingDay}
																onChange={(e) =>
																	upsertScheduleEntry(day.value, {
																		endTime: e.target.value,
																	})
																}
															/>
														</div>
													</div>
												);
											})}
										</div>
									</div>
								</div>
								<DialogFooter>
									<form.AppForm>
										<form.SubmitButton
											label={tCommon('save')}
											loadingLabel={tCommon('saving')}
										/>
									</form.AppForm>
								</DialogFooter>
							</form>
						)}
					</DialogContent>
				</Dialog>
			</div>

			<MemoizedEmployeesTableSection
				search={search}
				onSearchChange={handleSearchChange}
				locationFilter={locationFilter}
				onLocationFilterChange={handleLocationFilterChange}
				isLoadingLocations={isLoadingLocations}
				locationFilterOptions={locationFilterOptions}
				jobPositionFilter={jobPositionFilter}
				onJobPositionFilterChange={handleJobPositionFilterChange}
				isLoadingJobPositions={isLoadingJobPositions}
				jobPositionFilterOptions={jobPositionFilterOptions}
				statusFilter={statusFilter}
				onStatusFilterChange={handleStatusFilterChange}
				statusFilterOptions={statusFilterOptions}
				columns={columns}
				employees={employees}
				sorting={sorting}
				onSortingChange={setSorting}
				pagination={pagination}
				onPaginationChange={setPagination}
				columnFilters={columnFilters}
				onColumnFiltersChange={setColumnFilters}
				rowCount={totalRows}
				isLoading={isFetching}
				emptyState={t('table.empty')}
				searchPlaceholder={t('search.placeholder')}
				locationPlaceholder={t('filters.location.placeholder')}
				jobPositionPlaceholder={t('filters.jobPosition.placeholder')}
				statusPlaceholder={t('filters.status.placeholder')}
				bulkActions={bulkActions}
				rowSelection={rowSelection}
				onRowSelectionChange={setRowSelection}
				getRowId={(row) => row.id}
			/>

			<Dialog open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
				<DialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>{t('bulk.title')}</DialogTitle>
						<DialogDescription>{t('bulk.description')}</DialogDescription>
					</DialogHeader>
					<TooltipProvider>
						<div className="space-y-2 rounded-md border border-dashed bg-muted/20 p-2">
							<p className="text-xs text-muted-foreground">
								{t('bulk.optionsHelp.title')}
							</p>
							<div className="flex flex-wrap gap-2">
								{bulkOptionHelp.map((item) => (
									<Tooltip key={item.key}>
										<TooltipTrigger asChild>
											<Badge variant="outline" className="cursor-help gap-1">
												<HelpCircle className="h-3 w-3" />
												{item.label}
											</Badge>
										</TooltipTrigger>
										<TooltipContent className="max-w-xs">
											<p className="text-xs">{item.description}</p>
										</TooltipContent>
									</Tooltip>
								))}
							</div>
						</div>
					</TooltipProvider>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label>{t('bulk.fields.employmentType')}</Label>
							<Select
								value={bulkEditValues.employmentType}
								onValueChange={(value) =>
									setBulkEditValues((prev) => ({
										...prev,
										employmentType: value as BulkEmploymentType,
									}))
								}
							>
								<SelectTrigger>
									<SelectValue placeholder={t('bulk.placeholders.employmentType')} />
								</SelectTrigger>
								<SelectContent>
									{bulkEmploymentOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t('bulk.fields.ptuEligibilityOverride')}</Label>
							<Select
								value={bulkEditValues.ptuEligibilityOverride}
								onValueChange={(value) =>
									setBulkEditValues((prev) => ({
										...prev,
										ptuEligibilityOverride: value as BulkPtuOverrideValue,
									}))
								}
							>
								<SelectTrigger>
									<SelectValue placeholder={t('bulk.placeholders.ptuEligibility')} />
								</SelectTrigger>
								<SelectContent>
									{bulkPtuEligibilityOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t('bulk.fields.isTrustEmployee')}</Label>
							<Select
								value={bulkEditValues.isTrustEmployee}
								onValueChange={(value) =>
									setBulkEditValues((prev) => ({
										...prev,
										isTrustEmployee: value as BulkToggleValue,
									}))
								}
							>
								<SelectTrigger>
									<SelectValue placeholder={t('bulk.placeholders.toggle')} />
								</SelectTrigger>
								<SelectContent>
									{bulkToggleOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t('bulk.fields.isDirectorAdminGeneralManager')}</Label>
							<Select
								value={bulkEditValues.isDirectorAdminGeneralManager}
								onValueChange={(value) =>
									setBulkEditValues((prev) => ({
										...prev,
										isDirectorAdminGeneralManager: value as BulkToggleValue,
									}))
								}
							>
								<SelectTrigger>
									<SelectValue placeholder={t('bulk.placeholders.toggle')} />
								</SelectTrigger>
								<SelectContent>
									{bulkToggleOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t('bulk.fields.isDomesticWorker')}</Label>
							<Select
								value={bulkEditValues.isDomesticWorker}
								onValueChange={(value) =>
									setBulkEditValues((prev) => ({
										...prev,
										isDomesticWorker: value as BulkToggleValue,
									}))
								}
							>
								<SelectTrigger>
									<SelectValue placeholder={t('bulk.placeholders.toggle')} />
								</SelectTrigger>
								<SelectContent>
									{bulkToggleOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t('bulk.fields.isPlatformWorker')}</Label>
							<Select
								value={bulkEditValues.isPlatformWorker}
								onValueChange={(value) =>
									setBulkEditValues((prev) => ({
										...prev,
										isPlatformWorker: value as BulkToggleValue,
									}))
								}
							>
								<SelectTrigger>
									<SelectValue placeholder={t('bulk.placeholders.toggle')} />
								</SelectTrigger>
								<SelectContent>
									{bulkToggleOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t('bulk.fields.platformHoursYear')}</Label>
							<Input
								type="number"
								min={0}
								value={bulkEditValues.platformHoursYear}
								onChange={(event) =>
									setBulkEditValues((prev) => ({
										...prev,
										platformHoursYear: event.target.value,
									}))
								}
								placeholder={t('bulk.placeholders.platformHoursYear')}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t('bulk.fields.aguinaldoOverrideMode')}</Label>
							<Select
								value={bulkEditValues.aguinaldoOverrideMode}
								onValueChange={(value) =>
									setBulkEditValues((prev) => ({
										...prev,
										aguinaldoOverrideMode: value as BulkOverrideMode,
									}))
								}
							>
								<SelectTrigger>
									<SelectValue placeholder={t('bulk.placeholders.aguinaldoOverride')} />
								</SelectTrigger>
								<SelectContent>
									{bulkOverrideModeOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t('bulk.fields.aguinaldoDaysOverride')}</Label>
							<Input
								type="number"
								min={0}
								value={bulkEditValues.aguinaldoDaysOverride}
								onChange={(event) =>
									setBulkEditValues((prev) => ({
										...prev,
										aguinaldoDaysOverride: event.target.value,
									}))
								}
								disabled={bulkEditValues.aguinaldoOverrideMode !== 'SET'}
								placeholder={t('bulk.placeholders.aguinaldoDaysOverride')}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setIsBulkEditOpen(false)}
						>
							{tCommon('cancel')}
						</Button>
						<Button onClick={() => void handleBulkApply()}>
							{t('bulk.actions.apply')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Face Enrollment Dialog */}
			<FaceEnrollmentDialog
				open={isEnrollDialogOpen}
				onOpenChange={setIsEnrollDialogOpen}
				employee={enrollingEmployee}
			/>
		</div>
	);
}
