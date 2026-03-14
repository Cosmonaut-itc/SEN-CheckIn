'use client';

import {
	createEmployee,
	deleteEmployee,
	previewEmployeeTermination,
	terminateEmployee,
	updateEmployee,
} from '@/actions/employees';
import { deleteRekognitionUser } from '@/actions/employees-rekognition';
import { EmployeeDetailDialog } from '@/components/employees/employee-detail-dialog';
import { EmployeeCodeField } from '@/components/employees/employee-code-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { ResponsiveDataView } from '@/components/ui/responsive-data-view';
import { ResponsivePageHeader } from '@/components/ui/responsive-page-header';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
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
import { useAppForm, useStore } from '@/lib/forms';
import { useOrgContext } from '@/lib/org-client-context';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import { useIsMobile } from '@/hooks/use-mobile';
import type {
	EmployeeDetailTab,
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
import { format, isAfter, isValid, parse, startOfDay } from 'date-fns';
import {
	Eye,
	FileText,
	HelpCircle,
	Loader2,
	MoreHorizontal,
	ScanFace,
	Search,
	ShieldAlert,
	Trash2,
	UserCheck,
	UserX,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
	/** Mobile card renderer for each employee row. */
	cardRenderer: (employee: Employee) => React.ReactNode;
	/** Row selection state for bulk actions. */
	rowSelection?: RowSelectionState;
	/** Row selection change handler. */
	onRowSelectionChange?: React.Dispatch<React.SetStateAction<RowSelectionState>>;
	/** Optional row id resolver for selection. */
	getRowId?: (row: Employee, index: number) => string;
	/** Optional row click handler for opening employee details. */
	onRowClick?: (employee: Employee) => void;
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
	cardRenderer,
	rowSelection,
	onRowSelectionChange,
	getRowId,
	onRowClick,
}: EmployeesTableSectionProps): React.ReactElement {
	return (
		<div className="min-w-0 space-y-4">
			{bulkActions ? (
				<div className="rounded-md border bg-muted/30 p-3">{bulkActions}</div>
			) : null}
			<div className="grid gap-3 min-[1025px]:grid-cols-[minmax(0,1fr)_200px_200px_170px]">
				<div className="relative min-w-0">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder={searchPlaceholder}
						value={search}
						onChange={(event) => onSearchChange(event.target.value)}
						className="min-h-11 pl-9"
					/>
				</div>
				<Select
					value={locationFilter}
					onValueChange={onLocationFilterChange}
					disabled={isLoadingLocations}
				>
					<SelectTrigger className="min-h-11 w-full">
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
					<SelectTrigger className="min-h-11 w-full">
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
					<SelectTrigger className="min-h-11 w-full">
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

			<ResponsiveDataView
				columns={columns}
				data={employees}
				cardRenderer={cardRenderer}
				getCardKey={(employee) => employee.id}
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
				onRowClick={onRowClick}
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

const ALL_FILTER_VALUE = '__all__';
const SHOULD_LOG_TAB_TELEMETRY = process.env.NODE_ENV === 'development';

type StatusFilterValue = EmployeeStatus | typeof ALL_FILTER_VALUE;

type EmployeeDialogMode = 'create' | 'view' | 'edit';
type EmployeeDialogTab = EmployeeDetailTab | 'info';
const SECONDARY_DETAIL_TABS: EmployeeDetailTab[] = [
	'payroll',
	'ptu',
	'finiquito',
	'exceptions',
	'audit',
];
const INSIGHTS_DETAIL_TABS = new Set<EmployeeDetailTab>([
	'summary',
	'attendance',
	'vacations',
	'payroll',
	'exceptions',
]);
const VALID_DETAIL_TABS = new Set<EmployeeDetailTab>([
	'documents',
	'disciplinary',
	'summary',
	'attendance',
	'vacations',
	'payroll',
	'ptu',
	'finiquito',
	'exceptions',
	'audit',
]);
const MOBILE_FORM_STEP_FIELD_NAMES = [
	['code', 'firstName', 'lastName', 'nss', 'rfc', 'email', 'phone', 'department'],
	['locationId', 'jobPositionId', 'status', 'shiftType', 'hireDate', 'userId'],
	['paymentFrequency', 'periodPay', 'sbcDailyOverride'],
	[
		'employmentType',
		'ptuEligibilityOverride',
		'aguinaldoDaysOverride',
		'platformHoursYear',
		'isTrustEmployee',
		'isDirectorAdminGeneralManager',
		'isDomesticWorker',
		'isPlatformWorker',
	],
	[],
] as const;

/**
 * Parses a tab candidate from URL/query input.
 *
 * @param value - Candidate tab string
 * @returns Valid detail tab or null
 */
function parseEmployeeDetailTab(value: string | null | undefined): EmployeeDetailTab | null {
	if (!value) {
		return null;
	}
	return VALID_DETAIL_TABS.has(value as EmployeeDetailTab) ? (value as EmployeeDetailTab) : null;
}

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
 * Serializes the current employee draft to compare unsaved mobile changes.
 *
 * @param values - Current form values
 * @param scheduleEntries - Current schedule entries
 * @returns Stable serialized draft representation
 */
function serializeEmployeeDraft(
	values: EmployeeFormValues,
	scheduleEntries: EmployeeScheduleEntry[],
): string {
	return JSON.stringify({
		values,
		scheduleEntries: scheduleEntries
			.map((entry) => ({
				dayOfWeek: entry.dayOfWeek,
				startTime: entry.startTime,
				endTime: entry.endTime,
				isWorkingDay: entry.isWorkingDay,
			}))
			.sort((leftEntry, rightEntry) => leftEntry.dayOfWeek - rightEntry.dayOfWeek),
	});
}

/**
 * Resolves the initial detail tab when the dialog opens on a mobile viewport.
 *
 * @param requestedTab - Requested detail tab
 * @param isMobile - Whether the mobile layout is active
 * @returns The initial tab to display
 */
function resolveInitialDetailTab(
	requestedTab: EmployeeDetailTab,
	isMobile: boolean,
): EmployeeDialogTab {
	if (!isMobile) {
		return requestedTab;
	}

	return requestedTab === 'summary' ? 'info' : requestedTab;
}

/**
 * Extracts the mobile wizard step indexes that currently have validation errors.
 *
 * @param getFieldMeta - Callback that resolves field metadata by field name
 * @returns Zero-based step indexes with validation errors
 */
function getMobileWizardErrorStepIndexes(
	getFieldMeta: <TField extends keyof EmployeeFormValues>(
		fieldName: TField,
	) =>
		| {
				errors?: unknown[];
		  }
		| null
		| undefined,
): number[] {
	return MOBILE_FORM_STEP_FIELD_NAMES.reduce<number[]>((indexes, fieldNames, stepIndex) => {
		const hasStepErrors = fieldNames.some((fieldName) => {
			const fieldMeta = getFieldMeta(fieldName);
			return Array.isArray(fieldMeta?.errors) && fieldMeta.errors.length > 0;
		});

		if (hasStepErrors) {
			indexes.push(stepIndex);
		}

		return indexes;
	}, []);
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
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const { organizationId, organizationRole, userRole } = useOrgContext();
	const isMobile = useIsMobile();
	const t = useTranslations('Employees');
	const tCommon = useTranslations('Common');
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
	const [detailTab, setDetailTab] = useState<EmployeeDialogTab>('summary');
	const [visitedDetailTabs, setVisitedDetailTabs] = useState<
		Partial<Record<EmployeeDialogTab, boolean>>
	>({ summary: true });
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
	const [mobileWizardErrorSteps, setMobileWizardErrorSteps] = useState<number[]>([]);
	const [mobileWizardStepIndex, setMobileWizardStepIndex] = useState<number>(0);
	const [mobileWizardBaseline, setMobileWizardBaseline] = useState<string | null>(null);
	const [showMobileDiscardFromOutside, setShowMobileDiscardFromOutside] =
		useState<boolean>(false);
	const [generatedCodeSeed, setGeneratedCodeSeed] = useState<string>('0000');
	const tabScrollByIdRef = useRef<Partial<Record<EmployeeDialogTab, number>>>({});
	const tabContainerByIdRef = useRef<Partial<Record<EmployeeDialogTab, HTMLDivElement | null>>>(
		{},
	);
	const tabSwitchStartRef = useRef<number | null>(null);
	const hasProcessedReturnContextRef = useRef<boolean>(false);

	const isCreateMode = dialogMode === 'create';
	const isEditMode = dialogMode === 'edit';
	const isViewMode = dialogMode === 'view';

	/**
	 * Marks a tab as visited for lazy-mount keep-alive behavior.
	 *
	 * @param tab - Detail tab to mark as visited
	 * @returns void
	 */
	const markTabAsVisited = useCallback((tab: EmployeeDialogTab): void => {
		setVisitedDetailTabs((prev) => {
			if (prev[tab]) {
				return prev;
			}
			return { ...prev, [tab]: true };
		});
	}, []);

	/**
	 * Emits technical telemetry for tab switch timings.
	 *
	 * @param tab - Target tab
	 * @returns void
	 */
	const emitTabSwitchTelemetry = useCallback((tab: EmployeeDetailTab): void => {
		if (!SHOULD_LOG_TAB_TELEMETRY) {
			return;
		}
		tabSwitchStartRef.current = performance.now();
		console.info('[SEN_TELEMETRY] tab_switch_start', { tab });

		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				const paintedAt = performance.now();
				console.info('[SEN_TELEMETRY] tab_content_painted', { tab });
				if (tabSwitchStartRef.current === null) {
					return;
				}
				const duration = paintedAt - tabSwitchStartRef.current;
				console.info('[SEN_TELEMETRY] tab_switch_duration', {
					tab,
					durationMs: Number(duration.toFixed(2)),
				});
			});
		});
	}, []);

	/**
	 * Handles detail-tab changes with keep-alive and telemetry.
	 *
	 * @param nextValue - Next tab value from the tabs control
	 * @returns void
	 */
	const handleDetailTabChange = useCallback(
		(nextValue: string): void => {
			const nextTab = nextValue as EmployeeDialogTab;
			const currentContainer = tabContainerByIdRef.current[detailTab];
			if (currentContainer) {
				tabScrollByIdRef.current[detailTab] = currentContainer.scrollTop;
			}

			setDetailTab(nextTab);
			markTabAsVisited(nextTab);
			if (nextTab !== 'info') {
				emitTabSwitchTelemetry(nextTab);
			}
		},
		[detailTab, emitTabSwitchTelemetry, markTabAsVisited],
	);
	const tabScrollContainerCallbacks = useMemo<
		Record<EmployeeDialogTab, (node: HTMLDivElement | null) => void>
	>(
		() => ({
			info: (node: HTMLDivElement | null): void => {
				tabContainerByIdRef.current.info = node;
				if (!node) {
					return;
				}
				node.scrollTop = tabScrollByIdRef.current.info ?? 0;
			},
			documents: (node: HTMLDivElement | null): void => {
				tabContainerByIdRef.current.documents = node;
				if (!node) {
					return;
				}
				node.scrollTop = tabScrollByIdRef.current.documents ?? 0;
			},
			disciplinary: (node: HTMLDivElement | null): void => {
				tabContainerByIdRef.current.disciplinary = node;
				if (!node) {
					return;
				}
				node.scrollTop = tabScrollByIdRef.current.disciplinary ?? 0;
			},
			summary: (node: HTMLDivElement | null): void => {
				tabContainerByIdRef.current.summary = node;
				if (!node) {
					return;
				}
				node.scrollTop = tabScrollByIdRef.current.summary ?? 0;
			},
			attendance: (node: HTMLDivElement | null): void => {
				tabContainerByIdRef.current.attendance = node;
				if (!node) {
					return;
				}
				node.scrollTop = tabScrollByIdRef.current.attendance ?? 0;
			},
			vacations: (node: HTMLDivElement | null): void => {
				tabContainerByIdRef.current.vacations = node;
				if (!node) {
					return;
				}
				node.scrollTop = tabScrollByIdRef.current.vacations ?? 0;
			},
			payroll: (node: HTMLDivElement | null): void => {
				tabContainerByIdRef.current.payroll = node;
				if (!node) {
					return;
				}
				node.scrollTop = tabScrollByIdRef.current.payroll ?? 0;
			},
			ptu: (node: HTMLDivElement | null): void => {
				tabContainerByIdRef.current.ptu = node;
				if (!node) {
					return;
				}
				node.scrollTop = tabScrollByIdRef.current.ptu ?? 0;
			},
			finiquito: (node: HTMLDivElement | null): void => {
				tabContainerByIdRef.current.finiquito = node;
				if (!node) {
					return;
				}
				node.scrollTop = tabScrollByIdRef.current.finiquito ?? 0;
			},
			exceptions: (node: HTMLDivElement | null): void => {
				tabContainerByIdRef.current.exceptions = node;
				if (!node) {
					return;
				}
				node.scrollTop = tabScrollByIdRef.current.exceptions ?? 0;
			},
			audit: (node: HTMLDivElement | null): void => {
				tabContainerByIdRef.current.audit = node;
				if (!node) {
					return;
				}
				node.scrollTop = tabScrollByIdRef.current.audit ?? 0;
			},
		}),
		[],
	);
	const tabScrollCallbacks = useMemo<
		Record<EmployeeDialogTab, (event: React.UIEvent<HTMLDivElement>) => void>
	>(
		() => ({
			info: (event: React.UIEvent<HTMLDivElement>): void => {
				tabScrollByIdRef.current.info = event.currentTarget.scrollTop;
			},
			documents: (event: React.UIEvent<HTMLDivElement>): void => {
				tabScrollByIdRef.current.documents = event.currentTarget.scrollTop;
			},
			disciplinary: (event: React.UIEvent<HTMLDivElement>): void => {
				tabScrollByIdRef.current.disciplinary = event.currentTarget.scrollTop;
			},
			summary: (event: React.UIEvent<HTMLDivElement>): void => {
				tabScrollByIdRef.current.summary = event.currentTarget.scrollTop;
			},
			attendance: (event: React.UIEvent<HTMLDivElement>): void => {
				tabScrollByIdRef.current.attendance = event.currentTarget.scrollTop;
			},
			vacations: (event: React.UIEvent<HTMLDivElement>): void => {
				tabScrollByIdRef.current.vacations = event.currentTarget.scrollTop;
			},
			payroll: (event: React.UIEvent<HTMLDivElement>): void => {
				tabScrollByIdRef.current.payroll = event.currentTarget.scrollTop;
			},
			ptu: (event: React.UIEvent<HTMLDivElement>): void => {
				tabScrollByIdRef.current.ptu = event.currentTarget.scrollTop;
			},
			finiquito: (event: React.UIEvent<HTMLDivElement>): void => {
				tabScrollByIdRef.current.finiquito = event.currentTarget.scrollTop;
			},
			exceptions: (event: React.UIEvent<HTMLDivElement>): void => {
				tabScrollByIdRef.current.exceptions = event.currentTarget.scrollTop;
			},
			audit: (event: React.UIEvent<HTMLDivElement>): void => {
				tabScrollByIdRef.current.audit = event.currentTarget.scrollTop;
			},
		}),
		[],
	);

	/**
	 * Registers a tab scroll container for scroll-position persistence.
	 *
	 * @param tab - Tab identifier
	 * @returns Ref callback
	 */
	const registerTabScrollContainer = useCallback(
		(tab: EmployeeDialogTab): ((node: HTMLDivElement | null) => void) =>
			tabScrollContainerCallbacks[tab],
		[tabScrollContainerCallbacks],
	);

	/**
	 * Stores scroll position for a tab panel.
	 *
	 * @param tab - Tab identifier
	 * @returns Scroll handler
	 */
	const handleTabScroll = useCallback(
		(tab: EmployeeDialogTab): ((event: React.UIEvent<HTMLDivElement>) => void) =>
			tabScrollCallbacks[tab],
		[tabScrollCallbacks],
	);

	/**
	 * Determines whether a tab panel should be rendered and kept alive.
	 *
	 * @param tab - Tab identifier
	 * @returns True when tab was visited
	 */
	const isTabVisited = useCallback(
		(tab: EmployeeDialogTab): boolean => Boolean(visitedDetailTabs[tab]),
		[visitedDetailTabs],
	);
	const ptuAguinaldoOptionHelp = useMemo<{ key: string; label: string; description: string }[]>(
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
	const secondaryDetailTabs = useMemo<EmployeeDetailTab[]>(
		() =>
			canUseDisciplinaryModule
				? ([...SECONDARY_DETAIL_TABS, 'disciplinary'] as EmployeeDetailTab[])
				: [...SECONDARY_DETAIL_TABS],
		[canUseDisciplinaryModule],
	);

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
	const shouldFetchInsights =
		Boolean(activeEmployee?.id) &&
		isDialogOpen &&
		isViewMode &&
		Object.entries(visitedDetailTabs).some(
			([tab, visited]) => visited && INSIGHTS_DETAIL_TABS.has(tab as EmployeeDetailTab),
		);
	const {
		data: insights,
		isLoading: isLoadingInsights,
		error: insightsError,
		refetch: refetchInsights,
	} = useQuery({
		queryKey: queryKeys.employees.insights(activeEmployee?.id ?? ''),
		queryFn: async () => {
			const response = await fetchEmployeeInsights(activeEmployee?.id ?? '');
			if (!response) {
				throw new Error('Failed to fetch employee insights');
			}
			return response;
		},
		enabled: shouldFetchInsights,
		retry: 1,
		staleTime: 60_000,
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
	const shouldFetchAudit =
		Boolean(activeEmployee?.id) &&
		isDialogOpen &&
		isViewMode &&
		Boolean(visitedDetailTabs.audit);
	const {
		data: auditResponse,
		isLoading: isLoadingAudit,
		error: auditError,
		refetch: refetchAudit,
	} = useQuery({
		queryKey: queryKeys.employees.audit(auditParams),
		queryFn: () => fetchEmployeeAudit(auditParams),
		enabled: shouldFetchAudit,
		retry: 1,
		staleTime: 60_000,
	});

	const shouldFetchPtuHistory =
		Boolean(activeEmployee?.id) &&
		isDialogOpen &&
		(isEditMode || (isViewMode && Boolean(visitedDetailTabs.ptu)));
	const {
		data: ptuHistoryData,
		isLoading: isLoadingPtuHistory,
		error: ptuHistoryError,
		refetch: refetchPtuHistory,
	} = useQuery({
		queryKey: queryKeys.ptu.history(activeEmployee?.id ?? ''),
		queryFn: () => fetchEmployeePtuHistory(activeEmployee?.id ?? ''),
		enabled: shouldFetchPtuHistory,
		retry: 1,
		staleTime: 60_000,
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
	}, [bulkEditValues, queryClient, selectedEmployees, setBulkEditValues, t]);

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
	const activeEmployeeId = activeEmployee?.id ?? null;
	const attendanceRangeStartDateKey = attendanceSummary?.rangeStartDateKey ?? null;
	const attendanceRangeEndDateKey = attendanceSummary?.rangeEndDateKey ?? null;
	const attendanceTimeZone = insights?.timeZone ?? null;
	const attendanceCurrentMonthKey = insights?.asOfDateKey.slice(0, 7) ?? '';
	const attendanceDrilldownHref = useMemo<string | null>(() => {
		if (
			!activeEmployeeId ||
			!attendanceRangeStartDateKey ||
			!attendanceRangeEndDateKey ||
			!attendanceTimeZone
		) {
			return null;
		}

		const params = new URLSearchParams();
		params.set('employeeId', activeEmployeeId);
		params.set('from', attendanceRangeStartDateKey);
		params.set('to', attendanceRangeEndDateKey);
		params.set('source', 'employee-dialog');
		params.set('returnEmployeeId', activeEmployeeId);
		params.set('returnTab', 'attendance');
		params.set('timeZone', attendanceTimeZone);
		return `/attendance?${params.toString()}`;
	}, [
		activeEmployeeId,
		attendanceRangeEndDateKey,
		attendanceRangeStartDateKey,
		attendanceTimeZone,
	]);
	const ptuHistory = useMemo<PtuHistoryRecord[]>(
		() => (ptuHistoryData ?? []).slice().sort((a, b) => b.fiscalYear - a.fiscalYear),
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
	}, [activeEmployee, ptuHistoryAmountInput, ptuHistoryMutation, ptuHistoryYearInput, t]);

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
				setDetailTab(resolveInitialDetailTab('summary', isMobile));
				setVisitedDetailTabs({ [resolveInitialDetailTab('summary', isMobile)]: true });
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
						setVisitedDetailTabs({ documents: true });
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
				setDetailTab(resolveInitialDetailTab('summary', isMobile));
				setVisitedDetailTabs({ [resolveInitialDetailTab('summary', isMobile)]: true });
				form.reset();
				return;
			}
		},
	});

	const firstName = useStore(form.store, (state) => state.values.firstName);
	const lastName = useStore(form.store, (state) => state.values.lastName);
	const codeValue = useStore(form.store, (state) => state.values.code);
	const periodPayValue = useStore(form.store, (state) => state.values.periodPay);
	const formValues = useStore(form.store, (state) => state.values);
	const paymentFrequencyValue =
		useStore(form.store, (state) => state.values.paymentFrequency) ?? 'MONTHLY';
	const computedDailyPay = calculateDailyPayFromPeriodPay(
		Number(periodPayValue || 0),
		paymentFrequencyValue,
	);
	const periodPayLabel = t('fields.periodPay', {
		period: t(`paymentFrequency.${paymentFrequencyValue}`),
	});
	const currentMobileWizardSnapshot = useMemo(
		() => serializeEmployeeDraft(formValues, schedule),
		[formValues, schedule],
	);
	const isMobileWizardDirty =
		isDialogOpen &&
		isMobile &&
		!isViewMode &&
		mobileWizardBaseline !== null &&
		currentMobileWizardSnapshot !== mobileWizardBaseline;

	const generateEmployeeCode = (first: string, last: string, seed: string): string => {
		const base = [first, last]
			.filter(Boolean)
			.join('.')
			.replace(/[^a-zA-Z0-9.]/g, '')
			.toUpperCase();
		return `${base || 'EMP'}-${seed}`;
	};

	useEffect(() => {
		if (!isCreateMode) return;
		if (hasCustomCode) return;
		const generated = generateEmployeeCode(firstName, lastName, generatedCodeSeed);
		if (codeValue === generated) {
			return;
		}
		form.setFieldValue('code', generated);
	}, [isCreateMode, hasCustomCode, firstName, lastName, codeValue, form, generatedCodeSeed]);

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
		setShowMobileDiscardFromOutside(false);
		const nextGeneratedCodeSeed = Math.floor(1000 + Math.random() * 9000).toString();
		const nextSchedule = createDefaultSchedule();
		const nextFormValues: EmployeeFormValues = {
			...initialFormValues,
			code: generateEmployeeCode('', '', nextGeneratedCodeSeed),
		};
		setMobileWizardBaseline(serializeEmployeeDraft(nextFormValues, nextSchedule));
		setGeneratedCodeSeed(nextGeneratedCodeSeed);
		setDialogMode('create');
		setActiveEmployee(null);
		setDetailTab(resolveInitialDetailTab('summary', isMobile));
		setVisitedDetailTabs({ [resolveInitialDetailTab('summary', isMobile)]: true });
		form.reset();
		form.setFieldValue('code', nextFormValues.code);
		setHasCustomCode(false);
		setSchedule(nextSchedule);
		setPtuHistoryYearInput('');
		setPtuHistoryAmountInput('');
		setMobileWizardErrorSteps([]);
		setMobileWizardStepIndex(0);
		setIsDialogOpen(true);
	}, [form, isMobile, resetTerminationState, setPtuHistoryAmountInput, setPtuHistoryYearInput]);

	/**
	 * Opens employee detail view in the requested tab.
	 *
	 * @param employee - Employee row payload
	 * @param tab - Detail tab value
	 */
	const openEmployeeDetailTab = useCallback(
		(employee: Employee, tab: EmployeeDetailTab): void => {
			resetTerminationState();
			setShowMobileDiscardFromOutside(false);
			setActiveEmployee(employee);
			setDialogMode('view');
			const initialTab = resolveInitialDetailTab(tab, isMobile);
			setDetailTab(initialTab);
			// Reset keep-alive state per dialog session; mount only the entry tab first.
			setVisitedDetailTabs({ [initialTab]: true });
			setPtuHistoryYearInput('');
			setPtuHistoryAmountInput('');
			setIsDialogOpen(true);
		},
		[isMobile, resetTerminationState, setPtuHistoryAmountInput, setPtuHistoryYearInput],
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

	useEffect(() => {
		const source = searchParams.get('source');
		const returnEmployeeId = searchParams.get('returnEmployeeId');
		const requestedReturnTab = parseEmployeeDetailTab(searchParams.get('returnTab'));
		const returnTab =
			requestedReturnTab === 'disciplinary' && !canUseDisciplinaryModule
				? 'attendance'
				: (requestedReturnTab ?? 'attendance');

		if (
			source !== 'attendance' ||
			!returnEmployeeId ||
			hasProcessedReturnContextRef.current ||
			!isOrgSelected
		) {
			return;
		}

		hasProcessedReturnContextRef.current = true;
		window.setTimeout(() => {
			void openEmployeeDetailById(returnEmployeeId, returnTab);
		}, 0);

		const nextParams = new URLSearchParams(searchParams.toString());
		nextParams.delete('source');
		nextParams.delete('returnEmployeeId');
		nextParams.delete('returnTab');
		const nextQuery = nextParams.toString();
		router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
	}, [
		canUseDisciplinaryModule,
		isOrgSelected,
		openEmployeeDetailById,
		pathname,
		router,
		searchParams,
	]);

	useEffect(() => {
		if (searchParams.get('source') !== 'attendance') {
			hasProcessedReturnContextRef.current = false;
		}
	}, [searchParams]);

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
			setShowMobileDiscardFromOutside(false);
			setIsScheduleLoading(true);
			setActiveEmployee(employee);
			setDialogMode('edit');
			const nextFormValues: EmployeeFormValues = {
				code: employee.code,
				firstName: employee.firstName,
				lastName: employee.lastName,
				nss: employee.nss ?? '',
				rfc: employee.rfc ?? '',
				email: employee.email ?? '',
				userId: employee.userId ?? 'none',
				phone: employee.phone ?? '',
				jobPositionId: employee.jobPositionId ?? '',
				locationId: employee.locationId ?? '',
				department: employee.department ?? '',
				status: employee.status,
				hireDate: employee.hireDate
					? format(new Date(employee.hireDate), 'yyyy-MM-dd')
					: '',
				paymentFrequency: employee.paymentFrequency ?? 'MONTHLY',
				periodPay: String(
					calculatePeriodPayFromDailyPay(
						employee.dailyPay ?? 0,
						employee.paymentFrequency ?? 'MONTHLY',
					),
				),
				sbcDailyOverride: employee.sbcDailyOverride
					? String(employee.sbcDailyOverride)
					: '',
				employmentType: employee.employmentType ?? 'PERMANENT',
				isTrustEmployee: Boolean(employee.isTrustEmployee),
				isDirectorAdminGeneralManager: Boolean(employee.isDirectorAdminGeneralManager),
				isDomesticWorker: Boolean(employee.isDomesticWorker),
				isPlatformWorker: Boolean(employee.isPlatformWorker),
				platformHoursYear: employee.platformHoursYear
					? String(employee.platformHoursYear)
					: '',
				ptuEligibilityOverride: employee.ptuEligibilityOverride ?? 'DEFAULT',
				aguinaldoDaysOverride: employee.aguinaldoDaysOverride
					? String(employee.aguinaldoDaysOverride)
					: '',
				shiftType: employee.shiftType ?? 'DIURNA',
			};
			form.setFieldValue('code', nextFormValues.code);
			form.setFieldValue('firstName', nextFormValues.firstName);
			form.setFieldValue('lastName', nextFormValues.lastName);
			form.setFieldValue('nss', nextFormValues.nss);
			form.setFieldValue('rfc', nextFormValues.rfc);
			form.setFieldValue('email', nextFormValues.email);
			form.setFieldValue('userId', nextFormValues.userId);
			form.setFieldValue('phone', nextFormValues.phone);
			form.setFieldValue('jobPositionId', nextFormValues.jobPositionId);
			form.setFieldValue('locationId', nextFormValues.locationId);
			form.setFieldValue('department', nextFormValues.department);
			form.setFieldValue('status', nextFormValues.status);
			form.setFieldValue('shiftType', nextFormValues.shiftType);
			form.setFieldValue('hireDate', nextFormValues.hireDate);
			form.setFieldValue('paymentFrequency', nextFormValues.paymentFrequency);
			form.setFieldValue('periodPay', nextFormValues.periodPay);
			form.setFieldValue('sbcDailyOverride', nextFormValues.sbcDailyOverride);
			form.setFieldValue('employmentType', nextFormValues.employmentType);
			form.setFieldValue('isTrustEmployee', nextFormValues.isTrustEmployee);
			form.setFieldValue(
				'isDirectorAdminGeneralManager',
				nextFormValues.isDirectorAdminGeneralManager,
			);
			form.setFieldValue('isDomesticWorker', nextFormValues.isDomesticWorker);
			form.setFieldValue('isPlatformWorker', nextFormValues.isPlatformWorker);
			form.setFieldValue('platformHoursYear', nextFormValues.platformHoursYear);
			form.setFieldValue('ptuEligibilityOverride', nextFormValues.ptuEligibilityOverride);
			form.setFieldValue('aguinaldoDaysOverride', nextFormValues.aguinaldoDaysOverride);
			setHasCustomCode(true);
			setPtuHistoryYearInput('');
			setPtuHistoryAmountInput('');

			const detail = await fetchEmployeeById(employee.id);
			const nextSchedule =
				detail?.schedule && detail.schedule.length > 0
					? detail.schedule.map((entry) => ({
							dayOfWeek: entry.dayOfWeek,
							startTime: entry.startTime,
							endTime: entry.endTime,
							isWorkingDay: entry.isWorkingDay,
						}))
					: createDefaultSchedule();
			if (detail?.schedule && detail.schedule.length > 0) {
				setSchedule(nextSchedule);
			} else {
				setSchedule(nextSchedule);
			}
			setMobileWizardBaseline(serializeEmployeeDraft(nextFormValues, nextSchedule));
			setIsScheduleLoading(false);
			const initialTab = resolveInitialDetailTab('summary', isMobile);
			setDetailTab(initialTab);
			setVisitedDetailTabs({ [initialTab]: true });
			setMobileWizardErrorSteps([]);
			setMobileWizardStepIndex(0);
			setIsDialogOpen(true);
		},
		[
			form,
			isMobile,
			resetTerminationState,
			setShowMobileDiscardFromOutside,
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
	 * Validates the mobile wizard and submits the shared form when no step errors remain.
	 *
	 * @returns Promise resolving once the submit attempt completes
	 */
	const handleMobileWizardSubmit = useCallback(async (): Promise<void> => {
		await form.validateAllFields('submit');
		const nextErrorSteps = getMobileWizardErrorStepIndexes((fieldName) =>
			form.getFieldMeta(fieldName),
		);
		if (nextErrorSteps.length > 0) {
			setMobileWizardErrorSteps(nextErrorSteps);
			setMobileWizardStepIndex(nextErrorSteps[0] ?? 0);
			toast.error(
				t('wizard.toast.errors', {
					steps: nextErrorSteps.map((stepIndex) => stepIndex + 1).join(', '),
				}),
			);
			return;
		}

		setMobileWizardErrorSteps([]);
		await form.handleSubmit();
	}, [form, t]);

	/**
	 * Closes the employee dialog and resets related local state.
	 *
	 * @returns Nothing
	 */
	const closeEmployeeDialog = useCallback((): void => {
		setShowMobileDiscardFromOutside(false);
		setIsDialogOpen(false);
		setMobileWizardBaseline(null);
		setDialogMode('create');
		setActiveEmployee(null);
		const initialTab = resolveInitialDetailTab('summary', isMobile);
		setDetailTab(initialTab);
		setVisitedDetailTabs({ [initialTab]: true });
		tabScrollByIdRef.current = {};
		tabContainerByIdRef.current = {};
		form.reset();
		setHasCustomCode(false);
		setSchedule(createDefaultSchedule());
		setMobileWizardErrorSteps([]);
		setMobileWizardStepIndex(0);
		resetTerminationState();
	}, [form, isMobile, resetTerminationState]);

	/**
	 * Handles dialog close and resets form state.
	 *
	 * @param open - Whether the dialog should be open
	 */
	const handleDialogOpenChange = useCallback(
		(open: boolean): void => {
			if (!open && isMobile && !isViewMode && isMobileWizardDirty) {
				setShowMobileDiscardFromOutside(true);
				return;
			}

			setIsDialogOpen(open);
			setShowMobileDiscardFromOutside(false);
			if (!open) {
				closeEmployeeDialog();
			}
		},
		[closeEmployeeDialog, isMobile, isMobileWizardDirty, isViewMode],
	);

	useEffect(() => {
		if (!isDialogOpen || !isViewMode) {
			return;
		}

		const activeContainer = tabContainerByIdRef.current[detailTab];
		if (activeContainer) {
			activeContainer.scrollTop = tabScrollByIdRef.current[detailTab] ?? 0;
		}
	}, [detailTab, isDialogOpen, isViewMode]);

	useEffect(() => {
		if (!isDialogOpen || !isViewMode || !isMobile) {
			return;
		}

		const mobileTabsContainer = document.querySelector<HTMLElement>(
			'[data-testid="employee-mobile-detail-tabs"]',
		);
		const activeTabTrigger =
			mobileTabsContainer?.querySelector<HTMLElement>('[data-state="active"]');
		if (typeof activeTabTrigger?.scrollIntoView !== 'function') {
			return;
		}

		activeTabTrigger.scrollIntoView({
			behavior: 'smooth',
			inline: 'center',
			block: 'nearest',
		});
	}, [detailTab, isDialogOpen, isMobile, isViewMode]);

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

	/**
	 * Renders the actions menu and confirmation dialogs for an employee.
	 *
	 * @param employee - Employee record receiving the actions
	 * @returns Action controls for table rows and mobile cards
	 */
	const renderEmployeeActions = useCallback(
		(employee: Employee): React.ReactElement => (
			<>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="h-11 w-11">
							<MoreHorizontal className="h-4 w-4" />
							<span className="sr-only">{t('menu.open')}</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={() => handleViewDetails(employee)}>
							<Eye className="mr-2 h-4 w-4" />
							{t('menu.viewDetails')}
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => void openEmployeeDetailById(employee.id, 'documents')}
						>
							<FileText className="mr-2 h-4 w-4" />
							{t('menu.viewDocuments')}
						</DropdownMenuItem>
						{canUseDisciplinaryModule ? (
							<DropdownMenuItem
								onClick={() =>
									void openEmployeeDetailById(employee.id, 'disciplinary')
								}
							>
								<ShieldAlert className="mr-2 h-4 w-4" />
								{t('menu.viewDisciplinaryMeasures')}
							</DropdownMenuItem>
						) : null}
						{canUseDisciplinaryModule ? (
							<DropdownMenuItem asChild>
								<Link href={`/disciplinary-measures?employeeId=${employee.id}`}>
									<ShieldAlert className="mr-2 h-4 w-4" />
									{t('menu.openDisciplinaryModule')}
								</Link>
							</DropdownMenuItem>
						) : null}
						<DropdownMenuItem onClick={() => handleOpenEnrollDialog(employee)}>
							<ScanFace className="mr-2 h-4 w-4" />
							{employee.rekognitionUserId
								? t('menu.reEnrollFace')
								: t('menu.enrollFace')}
						</DropdownMenuItem>
						{employee.rekognitionUserId ? (
							<DropdownMenuItem
								onClick={() => setDeleteRekognitionConfirmId(employee.id)}
								className="text-[color:var(--status-warning)] focus:text-[color:var(--status-warning)]"
							>
								<UserX className="mr-2 h-4 w-4" />
								{t('menu.removeFaceEnrollment')}
							</DropdownMenuItem>
						) : null}
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => setDeleteConfirmId(employee.id)}
							className="text-destructive focus:text-destructive"
						>
							<Trash2 className="mr-2 h-4 w-4" />
							{t('menu.deleteEmployee')}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

				<Dialog
					open={deleteConfirmId === employee.id}
					onOpenChange={(open) => setDeleteConfirmId(open ? employee.id : null)}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{t('dialogs.deleteEmployee.title')}</DialogTitle>
							<DialogDescription>
								{t('dialogs.deleteEmployee.description', {
									name: `${employee.firstName} ${employee.lastName}`.trim(),
								})}
								{employee.rekognitionUserId ? (
									<span className="mt-2 block text-[color:var(--status-warning)]">
										{t('dialogs.deleteEmployee.faceNote')}
									</span>
								) : null}
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
								{tCommon('cancel')}
							</Button>
							<Button
								variant="destructive"
								onClick={() => handleDelete(employee.id)}
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
					open={deleteRekognitionConfirmId === employee.id}
					onOpenChange={(open) =>
						setDeleteRekognitionConfirmId(open ? employee.id : null)
					}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{t('dialogs.removeFaceEnrollment.title')}</DialogTitle>
							<DialogDescription>
								{t('dialogs.removeFaceEnrollment.description', {
									name: `${employee.firstName} ${employee.lastName}`.trim(),
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
								onClick={() => handleDeleteRekognition(employee.id)}
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
		[
			canUseDisciplinaryModule,
			deleteConfirmId,
			deleteMutation.isPending,
			deleteRekognitionConfirmId,
			deleteRekognitionMutation.isPending,
			handleDelete,
			handleDeleteRekognition,
			handleOpenEnrollDialog,
			handleViewDetails,
			openEmployeeDetailById,
			t,
			tCommon,
		],
	);

	/**
	 * Renders the mobile employee card used by the responsive data view.
	 *
	 * @param employee - Employee record to display
	 * @returns Responsive employee card content
	 */
	const renderEmployeeCard = useCallback(
		(employee: Employee): React.ReactElement => {
			const locationName = employee.locationId
				? (locationLookup.get(employee.locationId) ?? t('table.unknownLocation'))
				: '-';
			const fullName = `${employee.firstName} ${employee.lastName}`.trim();
			return (
				<div className="space-y-4">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0 space-y-2">
							<Badge variant="outline" className="w-fit text-xs">
								{employee.code}
							</Badge>
							<div className="space-y-1">
								<p className="text-base font-semibold leading-tight">{fullName}</p>
								<p className="text-sm text-muted-foreground">
									{employee.jobPositionName ?? '-'}
								</p>
							</div>
						</div>
						<div className="shrink-0">{renderEmployeeActions(employee)}</div>
					</div>

					<div className="grid gap-3 text-sm">
						<div className="flex items-center justify-between gap-3">
							<span className="text-muted-foreground">
								{t('table.headers.location')}
							</span>
							<span className="max-w-[60%] text-right font-medium">
								{locationName}
							</span>
						</div>
						<div className="flex items-center justify-between gap-3">
							<span className="text-muted-foreground">
								{t('table.headers.status')}
							</span>
							<Badge variant={statusVariants[employee.status]}>
								{t(`status.${employee.status}`)}
							</Badge>
						</div>
						<div className="flex items-center justify-between gap-3">
							<span className="text-muted-foreground">{t('table.headers.face')}</span>
							{employee.rekognitionUserId ? (
								<Badge variant="default" className="gap-1">
									<UserCheck className="h-3 w-3" />
									{t('face.enrolled')}
								</Badge>
							) : (
								<Badge variant="outline" className="gap-1 text-muted-foreground">
									<UserX className="h-3 w-3" />
									{t('face.notEnrolled')}
								</Badge>
							)}
						</div>
					</div>
				</div>
			);
		},
		[locationLookup, renderEmployeeActions, t],
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
									className="h-full rounded-full bg-[var(--status-success)] transition-all duration-300 dark:bg-[var(--status-success)]"
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
				cell: ({ row }) => renderEmployeeActions(row.original),
			},
		],
		[canUseDisciplinaryModule, locationLookup, renderEmployeeActions, t],
	);

	const mobileWizardSteps = useMemo(
		() => [
			{
				id: 'personal',
				title: t('wizard.steps.personal'),
				content: (
					<div className="grid gap-4">
						<form.AppField
							name="firstName"
							validators={{
								onChange: ({ value }) =>
									!value.trim() ? t('validation.firstNameRequired') : undefined,
							}}
						>
							{(field) => (
								<field.TextField
									label={t('fields.firstName')}
									orientation="vertical"
								/>
							)}
						</form.AppField>
						<form.AppField
							name="lastName"
							validators={{
								onChange: ({ value }) =>
									!value.trim() ? t('validation.lastNameRequired') : undefined,
							}}
						>
							{(field) => (
								<field.TextField
									label={t('fields.lastName')}
									orientation="vertical"
								/>
							)}
						</form.AppField>
						<form.AppField
							name="code"
							validators={{
								onChange: ({ value }) =>
									!value.trim() ? t('validation.codeRequired') : undefined,
							}}
						>
							{(field) => (
								<EmployeeCodeField
									field={field}
									label={t('fields.code')}
									isEditMode={isEditMode}
									setHasCustomCode={setHasCustomCode}
									orientation="vertical"
								/>
							)}
						</form.AppField>
						<form.AppField name="nss">
							{(field) => (
								<field.TextField
									label={t('fields.nss')}
									orientation="vertical"
									placeholder={tCommon('optional')}
								/>
							)}
						</form.AppField>
						<form.AppField name="rfc">
							{(field) => (
								<field.TextField
									label={t('fields.rfc')}
									orientation="vertical"
									placeholder={tCommon('optional')}
								/>
							)}
						</form.AppField>
						<form.AppField name="email">
							{(field) => (
								<field.TextField
									label={t('fields.email')}
									type="email"
									orientation="vertical"
									placeholder={tCommon('optional')}
								/>
							)}
						</form.AppField>
						<form.AppField name="phone">
							{(field) => (
								<field.TextField
									label={t('fields.phone')}
									orientation="vertical"
									placeholder={tCommon('optional')}
								/>
							)}
						</form.AppField>
						<form.AppField name="department">
							{(field) => (
								<field.TextField
									label={t('fields.department')}
									orientation="vertical"
									placeholder={tCommon('optional')}
								/>
							)}
						</form.AppField>
					</div>
				),
			},
			{
				id: 'laboral',
				title: t('wizard.steps.laboral'),
				content: (
					<div className="grid gap-4">
						<form.AppField
							name="locationId"
							validators={{
								onChange: ({ value }) =>
									!value ? t('validation.locationRequired') : undefined,
							}}
						>
							{(field) => (
								<field.SelectField
									label={t('fields.location')}
									options={locations.map((location) => ({
										value: location.id,
										label: location.name,
									}))}
									orientation="vertical"
									placeholder={
										isLoadingLocations
											? tCommon('loading')
											: t('placeholders.selectLocation')
									}
									disabled={isLoadingLocations}
								/>
							)}
						</form.AppField>
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
									orientation="vertical"
									placeholder={
										isLoadingJobPositions
											? tCommon('loading')
											: t('placeholders.selectJobPosition')
									}
									disabled={isLoadingJobPositions}
								/>
							)}
						</form.AppField>
						<form.AppField name="status">
							{(field) => (
								<field.SelectField
									label={t('fields.status')}
									orientation="vertical"
									options={[
										{ value: 'ACTIVE', label: t('status.ACTIVE') },
										{ value: 'INACTIVE', label: t('status.INACTIVE') },
										{ value: 'ON_LEAVE', label: t('status.ON_LEAVE') },
									]}
									placeholder={t('placeholders.selectStatus')}
								/>
							)}
						</form.AppField>
						<form.AppField name="shiftType">
							{(field) => (
								<field.SelectField
									label={t('fields.shiftType')}
									orientation="vertical"
									options={shiftTypeOptions.map((option) => ({
										value: option.value,
										label: t(option.labelKey),
									}))}
									placeholder={t('placeholders.selectShiftType')}
								/>
							)}
						</form.AppField>
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
										format(parsedValue, 'yyyy-MM-dd') !== trimmedValue
									) {
										return t('validation.hireDateInvalid');
									}
									const today = startOfDay(new Date());
									if (isAfter(startOfDay(parsedValue), today)) {
										return t('validation.hireDateFutureNotAllowed');
									}
									return undefined;
								},
							}}
						>
							{(field) => (
								<field.DateField
									label={t('fields.hireDate')}
									orientation="vertical"
									placeholder={t('placeholders.hireDate')}
									variant="input"
									minYear={1950}
								/>
							)}
						</form.AppField>
						<form.AppField name="userId">
							{(field) => (
								<field.SelectField
									label={t('fields.user')}
									orientation="vertical"
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
				),
			},
			{
				id: 'salario',
				title: t('wizard.steps.salario'),
				content: (
					<div className="grid gap-4">
						<form.AppField
							name="paymentFrequency"
							validators={{
								onChange: ({ value }) =>
									!value ? t('validation.paymentFrequencyRequired') : undefined,
							}}
						>
							{(field) => (
								<field.SelectField
									label={t('fields.paymentFrequency')}
									orientation="vertical"
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
									placeholder={t('placeholders.selectPaymentFrequency')}
								/>
							)}
						</form.AppField>
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
									orientation="vertical"
									type="number"
									placeholder={t('placeholders.periodPayExample')}
								/>
							)}
						</form.AppField>
						<div className="grid gap-2">
							<Label htmlFor="mobile-daily-pay">
								{t('fields.dailyPayCalculated')}
							</Label>
							<Input
								id="mobile-daily-pay"
								value={computedDailyPay.toFixed(2)}
								readOnly
								disabled
							/>
						</div>
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
									orientation="vertical"
									placeholder={t('placeholders.sbcDailyOverride')}
									description={t('helpers.sbcDailyOverride')}
								/>
							)}
						</form.AppField>
					</div>
				),
			},
			{
				id: 'ptu',
				title: t('wizard.steps.ptu'),
				content: (
					<div className="grid gap-4">
						<form.AppField name="employmentType">
							{(field) => (
								<field.SelectField
									label={t('fields.employmentType')}
									orientation="vertical"
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
									orientation="vertical"
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
									orientation="vertical"
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
									orientation="vertical"
									placeholder={t('placeholders.platformHoursYear')}
									type="number"
									description={t('helpers.platformHoursYear')}
								/>
							)}
						</form.AppField>
						<div className="grid gap-3">
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
										description={t('helpers.isDirectorAdminGeneralManager')}
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
						<div className="rounded-2xl border p-4">
							<div className="flex items-center justify-between gap-3">
								<div>
									<p className="text-sm font-medium">{t('ptuHistory.title')}</p>
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
							<div className="mt-4 grid gap-3">
								<div className="grid gap-2">
									<Label htmlFor="mobile-ptu-history-year">
										{t('ptuHistory.fields.year')}
									</Label>
									<Input
										id="mobile-ptu-history-year"
										type="number"
										min={2000}
										value={ptuHistoryYearInput}
										onChange={(event) =>
											setPtuHistoryYearInput(event.target.value)
										}
									/>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="mobile-ptu-history-amount">
										{t('ptuHistory.fields.amount')}
									</Label>
									<Input
										id="mobile-ptu-history-amount"
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
							<div className="mt-4 grid gap-3">
								{ptuHistory.length === 0 ? (
									<div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
										{t('ptuHistory.table.empty')}
									</div>
								) : (
									ptuHistory.map((entry) => (
										<div key={entry.id} className="rounded-xl border p-4">
											<p className="text-xs text-muted-foreground">
												{t('ptuHistory.table.year')}
											</p>
											<p className="text-base font-semibold">
												{entry.fiscalYear}
											</p>
											<p className="mt-2 text-xs text-muted-foreground">
												{t('ptuHistory.table.amount')}
											</p>
											<p className="text-base font-semibold">
												{formatCurrency(entry.amount)}
											</p>
										</div>
									))
								)}
							</div>
						</div>
					</div>
				),
			},
			{
				id: 'horario',
				title: t('wizard.steps.horario'),
				content: (
					<div className="grid gap-3">
						{isScheduleLoading ? (
							<div className="flex items-center gap-2 rounded-xl border p-4 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								{t('schedule.loading')}
							</div>
						) : null}
						{daysOfWeek.map((day) => {
							const entry = schedule.find((item) => item.dayOfWeek === day.value) ?? {
								dayOfWeek: day.value,
								startTime: '09:00',
								endTime: '17:00',
								isWorkingDay: day.value >= 1 && day.value <= 5,
							};
							return (
								<div key={day.value} className="rounded-2xl border p-4">
									<label className="flex items-center gap-3 text-sm font-medium">
										<input
											type="checkbox"
											className="h-4 w-4 accent-primary"
											checked={entry.isWorkingDay}
											onChange={(event) =>
												upsertScheduleEntry(day.value, {
													isWorkingDay: event.target.checked,
												})
											}
										/>
										{t(day.labelKey)}
									</label>
									<div className="mt-4 grid gap-3">
										<div className="grid gap-2">
											<Label>{t('schedule.start')}</Label>
											<Input
												type="time"
												value={entry.startTime}
												disabled={!entry.isWorkingDay}
												onChange={(event) =>
													upsertScheduleEntry(day.value, {
														startTime: event.target.value,
													})
												}
											/>
										</div>
										<div className="grid gap-2">
											<Label>{t('schedule.end')}</Label>
											<Input
												type="time"
												value={entry.endTime}
												disabled={!entry.isWorkingDay}
												onChange={(event) =>
													upsertScheduleEntry(day.value, {
														endTime: event.target.value,
													})
												}
											/>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				),
			},
		],
		[
			activeEmployee,
			computedDailyPay,
			form,
			handlePtuHistorySave,
			isCreateMode,
			isEditMode,
			isLoadingJobPositions,
			isLoadingLocations,
			isLoadingMembers,
			isScheduleLoading,
			jobPositions,
			locations,
			memberOptions,
			periodPayLabel,
			ptuHistory,
			ptuHistoryAmountInput,
			ptuHistoryMutation.isPending,
			ptuHistoryYearInput,
			schedule,
			setPtuHistoryAmountInput,
			setPtuHistoryYearInput,
			t,
			tCommon,
			upsertScheduleEntry,
		],
	);

	if (!isOrgSelected) {
		return (
			<div className="space-y-4">
				<ResponsivePageHeader title={t('title')} />
				<p className="text-muted-foreground">{t('noOrganization')}</p>
			</div>
		);
	}

	return (
		<div className="min-w-0 space-y-6">
			<EmployeeDetailDialog
				isOpen={isDialogOpen}
				mode={dialogMode}
				activeEmployee={activeEmployee}
				detailTab={detailTab}
				form={form}
				schedule={schedule}
				upsertScheduleEntry={upsertScheduleEntry}
				handlers={{
					handleCreateNew,
					onOpenChange: handleDialogOpenChange,
					handleEditFromDetails,
					handleDetailTabChange,
					markTabAsVisited,
					registerTabScrollContainer,
					handleTabScroll,
					isTabVisited,
					closeEmployeeDialog,
					setShowMobileDiscardFromOutside,
					setMobileWizardStepIndex,
					handleMobileWizardSubmit,
					handlePtuHistorySave,
					setPtuHistoryYearInput,
					setPtuHistoryAmountInput,
					refetchInsights,
					refetchPtuHistory,
					refetchAudit,
					updateTerminationForm,
					setIsTerminateDialogOpen,
					handleTerminationPreview,
					handleTerminateEmployee,
					setHasCustomCode,
				}}
				lookups={{
					activeEmployeeLocation,
					isMobile,
					canUseDisciplinaryModule,
					secondaryDetailTabs,
					vacationBalance,
					attendanceSummary: attendanceSummary
						? {
								totalAbsentDays: attendanceSummary.totalAbsentDays,
								kpis: attendanceSummary.kpis ?? null,
								trend30d: attendanceSummary.trend30d ?? [],
								absencesByMonth: attendanceSummary.absencesByMonth ?? [],
								leavesByMonth: attendanceSummary.leavesByMonth ?? [],
							}
						: null,
					leaveItems,
					attendanceCurrentMonthKey,
					attendanceDrilldownHref,
					isLoadingInsights,
					insightsError: Boolean(insightsError),
					vacationRequests,
					payrollRuns,
					upcomingExceptions,
					isLoadingPtuHistory,
					ptuHistoryError: Boolean(ptuHistoryError),
					ptuHistory,
					isLoadingAudit,
					auditError: Boolean(auditError),
					auditEvents,
					auditFieldLabels,
					mobileWizardSteps,
					isMobileWizardDirty,
					mobileWizardErrorSteps,
					mobileWizardStepIndex,
					showMobileDiscardFromOutside,
					createMutationPending: createMutation.isPending,
					updateMutationPending: updateMutation.isPending,
					memberOptions,
					isLoadingMembers,
					locations,
					isLoadingLocations,
					jobPositions,
					isLoadingJobPositions,
					periodPayLabel,
					computedDailyPay,
					ptuAguinaldoOptionHelp,
					ptuHistoryYearInput,
					ptuHistoryAmountInput,
					ptuHistoryMutationPending: ptuHistoryMutation.isPending,
					isScheduleLoading,
					terminationForm,
					isTerminationLocked,
					terminationPreview,
					isTerminateDialogOpen,
					canDownloadTerminationReceipt,
					terminationReceiptUrl: terminationReceiptUrl ?? undefined,
					isLoadingTerminationSettlement,
					canConfirmTermination,
					finiquitoLines,
					liquidacionLines,
					terminationPreviewPending: terminationPreviewMutation.isPending,
					terminationMutationPending: terminationMutation.isPending,
				}}
			/>

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
				cardRenderer={renderEmployeeCard}
				rowSelection={rowSelection}
				onRowSelectionChange={setRowSelection}
				getRowId={(row) => row.id}
				onRowClick={handleViewDetails}
			/>

			<Dialog open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
				<DialogContent className="min-[1025px]:max-w-2xl">
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
					<div className="grid gap-4 min-[1025px]:grid-cols-2">
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
									<SelectValue
										placeholder={t('bulk.placeholders.employmentType')}
									/>
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
									<SelectValue
										placeholder={t('bulk.placeholders.ptuEligibility')}
									/>
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
									<SelectValue
										placeholder={t('bulk.placeholders.aguinaldoOverride')}
									/>
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
						<Button variant="outline" onClick={() => setIsBulkEditOpen(false)}>
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
