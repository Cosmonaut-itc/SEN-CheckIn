'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { format, isAfter, isValid, parse, startOfDay } from 'date-fns';
import {
	Calendar as CalendarIcon,
	ChevronDown,
	HelpCircle,
	Loader2,
	Pencil,
	Plus,
	Upload,
	X,
} from 'lucide-react';

import { EmployeeInfoTab } from '@/components/employees/employee-info-tab';
import { EmployeeCodeField } from '@/components/employees/employee-code-field';
import {
	EmployeeMobileFormWizard,
	type EmployeeMobileWizardStep,
} from '@/components/employees/employee-mobile-form-wizard';
import { EmployeeDualPayrollCompensationPanel } from '@/app/(dashboard)/employees/employee-dual-payroll-compensation-panel';
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ResponsivePageHeader } from '@/components/ui/responsive-page-header';
import { TourHelpButton } from '@/components/tour-help-button';
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
	type JobPosition,
	type Location,
	type PtuHistoryRecord,
} from '@/lib/client-functions';
import { formatDateRangeUtc, formatShortDateUtc } from '@/lib/date-format';
import { cn } from '@/lib/utils';
import type {
	EmployeeAttendanceKpis,
	EmployeeAttendanceMonthlyGroup,
	EmployeeAttendanceTrendPoint,
	EmployeeAuditEvent,
	EmployeeDetailTab,
	EmployeePayrollRunSummary,
	EmployeeScheduleExceptionSummary,
	EmployeeTerminationSettlement,
	EmployeeVacationBalance,
	EmployeeVacationRequestSummary,
	EmploymentContractType,
	TerminationReason,
} from '@sen-checkin/types';

const loadEmployeeDocumentsTab = async () => {
	const componentModule = await import('@/components/employee-documents-tab');
	return componentModule.EmployeeDocumentsTab;
};

const loadEmployeeDisciplinaryMeasuresTab = async () => {
	const componentModule = await import('@/components/employee-disciplinary-measures-tab');
	return componentModule.EmployeeDisciplinaryMeasuresTab;
};

const loadEmployeeDeductionsTab = async () => {
	const componentModule = await import('@/components/employee-deductions-manager');
	return componentModule.EmployeeDeductionsManager;
};

const loadEmployeeGratificationsTab = async () => {
	const componentModule = await import('@/components/employee-gratifications-manager');
	return componentModule.EmployeeGratificationsManager;
};

function NullFallback(): React.ReactElement | null {
	return null;
}

const EmployeeDocumentsTab = dynamic(loadEmployeeDocumentsTab, {
	ssr: false,
	loading: NullFallback,
});

const EmployeeDisciplinaryMeasuresTab = dynamic(loadEmployeeDisciplinaryMeasuresTab, {
	ssr: false,
	loading: NullFallback,
});

const EmployeeDeductionsTab = dynamic(loadEmployeeDeductionsTab, {
	ssr: false,
	loading: NullFallback,
});

const EmployeeGratificationsTab = dynamic(loadEmployeeGratificationsTab, {
	ssr: false,
	loading: NullFallback,
});

type EmployeeDialogMode = 'create' | 'view' | 'edit';
type EmployeeDialogTab = EmployeeDetailTab | 'info';

interface TerminationFormValues {
	terminationDateKey: string;
	lastDayWorkedDateKey: string;
	terminationReason: TerminationReason;
	contractType: EmploymentContractType;
	unpaidDays: string;
	otherDue: string;
	vacationBalanceDays: string;
	dailySalaryIndemnizacion: string;
	terminationNotes: string;
}

interface EmployeeLineItem {
	key: string;
	label: string;
	value: number;
}

interface EmployeeAttendanceSummaryViewModel {
	totalAbsentDays: number;
	kpis: EmployeeAttendanceKpis | null;
	trend30d: EmployeeAttendanceTrendPoint[];
	absencesByMonth: EmployeeAttendanceMonthlyGroup[];
	leavesByMonth: EmployeeAttendanceMonthlyGroup[];
}

interface EmployeeDetailDialogHandlers {
	handleCreateNew: () => void;
	onOpenChange: (open: boolean) => void;
	handleEditFromDetails: () => void;
	handleDetailTabChange: (tab: EmployeeDialogTab) => void;
	markTabAsVisited: (tab: EmployeeDialogTab) => void;
	registerTabScrollContainer: (tab: EmployeeDialogTab) => (node: HTMLDivElement | null) => void;
	handleTabScroll: (tab: EmployeeDialogTab) => React.UIEventHandler<HTMLDivElement>;
	isTabVisited: (tab: EmployeeDialogTab) => boolean;
	closeEmployeeDialog: () => void;
	setShowMobileDiscardFromOutside: React.Dispatch<React.SetStateAction<boolean>>;
	setMobileWizardStepIndex: React.Dispatch<React.SetStateAction<number>>;
	handleMobileWizardSubmit: () => Promise<void> | void;
	handlePtuHistorySave: () => Promise<void> | void;
	setPtuHistoryYearInput: React.Dispatch<React.SetStateAction<string>>;
	setPtuHistoryAmountInput: React.Dispatch<React.SetStateAction<string>>;
	refetchInsights: () => Promise<unknown> | unknown;
	refetchPtuHistory: () => Promise<unknown> | unknown;
	refetchAudit: () => Promise<unknown> | unknown;
	updateTerminationForm: (values: Partial<TerminationFormValues>) => void;
	setIsTerminateDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
	handleTerminationPreview: () => void;
	handleTerminateEmployee: () => void;
	setHasCustomCode: React.Dispatch<React.SetStateAction<boolean>>;
}

interface EmployeeDetailDialogLookups {
	activeEmployeeLocation: string;
	isMobile: boolean;
	canUseDisciplinaryModule: boolean;
	secondaryDetailTabs: EmployeeDetailTab[];
	vacationBalance: EmployeeVacationBalance | null;
	attendanceSummary: EmployeeAttendanceSummaryViewModel | null;
	leaveItems: readonly unknown[];
	attendanceCurrentMonthKey: string;
	attendanceDrilldownHref: string | null;
	isLoadingInsights: boolean;
	insightsError: boolean;
	vacationRequests: EmployeeVacationRequestSummary[];
	payrollRuns: EmployeePayrollRunSummary[];
	upcomingExceptions: EmployeeScheduleExceptionSummary[];
	isLoadingPtuHistory: boolean;
	ptuHistoryError: boolean;
	ptuHistory: PtuHistoryRecord[];
	isLoadingAudit: boolean;
	auditError: boolean;
	auditEvents: EmployeeAuditEvent[];
	auditFieldLabels: Record<string, string>;
	mobileWizardSteps: EmployeeMobileWizardStep[];
	isMobileWizardDirty: boolean;
	mobileWizardErrorSteps: number[];
	mobileWizardStepIndex: number;
	showMobileDiscardFromOutside: boolean;
	createMutationPending: boolean;
	updateMutationPending: boolean;
	memberOptions: Array<{ value: string; label: string }>;
	isLoadingMembers: boolean;
	locations: Location[];
	isLoadingLocations: boolean;
	jobPositions: JobPosition[];
	isLoadingJobPositions: boolean;
	periodPayLabel: string;
	computedDailyPay: number;
	canManageDualPayrollCompensation: boolean;
	fiscalDailyPayPreviewFeedbackKey: string;
	parsedFiscalDailyPayPreview: number | null | undefined;
	fiscalDailyComplementPreview: number;
	activeEmployeeDailyComplement: number;
	ptuAguinaldoOptionHelp: Array<{ key: string; label: string; description: string }>;
	ptuHistoryYearInput: string;
	ptuHistoryAmountInput: string;
	ptuHistoryMutationPending: boolean;
	isScheduleLoading: boolean;
	terminationForm: TerminationFormValues;
	isTerminationLocked: boolean;
	terminationPreview: EmployeeTerminationSettlement | null;
	isTerminateDialogOpen: boolean;
	canDownloadTerminationReceipt: boolean;
	terminationReceiptUrl?: string;
	isLoadingTerminationSettlement: boolean;
	canConfirmTermination: boolean;
	finiquitoLines: EmployeeLineItem[];
	liquidacionLines: EmployeeLineItem[];
	terminationPreviewPending: boolean;
	terminationMutationPending: boolean;
}

export interface EmployeeDetailDialogProps {
	isOpen: boolean;
	mode: EmployeeDialogMode;
	activeEmployee: Employee | null;
	detailTab: EmployeeDialogTab;
	form: unknown;
	schedule: EmployeeScheduleEntry[];
	upsertScheduleEntry: (dayOfWeek: number, updates: Partial<EmployeeScheduleEntry>) => void;
	handlers: EmployeeDetailDialogHandlers;
	lookups: EmployeeDetailDialogLookups;
}

export interface EmployeePageActionsProps {
	onCreateNew: () => void;
}

const PRIMARY_DETAIL_TABS: EmployeeDetailTab[] = [
	'summary',
	'attendance',
	'vacations',
	'documents',
];
const daysOfWeek: { labelKey: string; value: number }[] = [
	{ labelKey: 'days.sunday', value: 0 },
	{ labelKey: 'days.monday', value: 1 },
	{ labelKey: 'days.tuesday', value: 2 },
	{ labelKey: 'days.wednesday', value: 3 },
	{ labelKey: 'days.thursday', value: 4 },
	{ labelKey: 'days.friday', value: 5 },
	{ labelKey: 'days.saturday', value: 6 },
];

/**
 * Renders the employees page split action button.
 *
 * @param props - Action callbacks
 * @returns Split button with create and import actions
 */
export function EmployeePageActions({ onCreateNew }: EmployeePageActionsProps): React.ReactElement {
	const t = useTranslations('Employees');
	const router = useRouter();

	return (
		<div className="flex w-full min-w-0 flex-wrap items-center gap-2 min-[1025px]:w-auto min-[1025px]:flex-nowrap min-[1025px]:gap-1">
			<TourHelpButton tourId="employees" />
			<DialogTrigger asChild>
				<Button
					data-testid="employees-add-button"
					onClick={onCreateNew}
					className="min-w-0 flex-1 min-[1025px]:rounded-r-none min-[1025px]:flex-none"
				>
					<Plus className="mr-2 h-4 w-4" />
					{t('actions.addEmployee')}
				</Button>
			</DialogTrigger>
			<Button
				type="button"
				variant="outline"
				data-testid="employees-import-button"
				onClick={() => router.push('/employees/import')}
				className="min-h-11 w-full justify-center min-[480px]:flex-1 min-[1025px]:hidden"
			>
				<Upload className="mr-2 h-4 w-4" />
				{t('actions.importFromDocument')}
			</Button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						data-testid="employees-add-menu-button"
						aria-label={t('actions.importFromDocument')}
						className="hidden w-12 rounded-l-none border-l border-l-primary-foreground/20 px-2 min-[1025px]:inline-flex min-[1025px]:w-10"
					>
						<ChevronDown className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={() => router.push('/employees/import')}>
						<Upload className="mr-2 h-4 w-4" />
						{t('actions.importFromDocument')}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
const shiftTypeOptions: { value: Employee['shiftType']; labelKey: string }[] = [
	{ value: 'DIURNA', labelKey: 'shiftTypeLabels.DIURNA' },
	{ value: 'NOCTURNA', labelKey: 'shiftTypeLabels.NOCTURNA' },
	{ value: 'MIXTA', labelKey: 'shiftTypeLabels.MIXTA' },
];
const employmentTypeOptions: { value: Employee['employmentType']; labelKey: string }[] = [
	{ value: 'PERMANENT', labelKey: 'employmentType.PERMANENT' },
	{ value: 'EVENTUAL', labelKey: 'employmentType.EVENTUAL' },
];
const ptuEligibilityOptions: { value: Employee['ptuEligibilityOverride']; labelKey: string }[] = [
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
const statusVariants: Record<EmployeeStatus, 'default' | 'secondary' | 'outline'> = {
	ACTIVE: 'default',
	INACTIVE: 'secondary',
	ON_LEAVE: 'outline',
};

function formatMonthLabel(monthKey: string): string {
	const monthDate = new Date(`${monthKey}-01T00:00:00Z`);
	return monthDate.toLocaleDateString('es-MX', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC',
	});
}

function toUtcDate(dateKey: string): Date {
	return new Date(`${dateKey}T00:00:00Z`);
}

function formatCurrency(value: number): string {
	return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
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
	const [month, setMonth] = useState<Date>(
		() => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1),
	);

	/* eslint-disable react-hooks/set-state-in-effect */
	useEffect(() => {
		if (!selectedDate) {
			return;
		}
		setMonth((current) => {
			if (
				current.getFullYear() === selectedDate.getFullYear() &&
				current.getMonth() === selectedDate.getMonth()
			) {
				return current;
			}
			return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
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
								setMonth(
									new Date(nextParsed.getFullYear(), nextParsed.getMonth(), 1),
								);
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
								setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
							}
						}}
						initialFocus
						captionLayout="dropdown"
						month={month}
						onMonthChange={(nextMonth) =>
							setMonth(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1))
						}
						{...calendarRangeProps}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}

export function EmployeeDetailDialog({
	isOpen,
	mode,
	activeEmployee,
	detailTab,
	form: rawForm,
	schedule,
	upsertScheduleEntry,
	handlers,
	lookups,
}: EmployeeDetailDialogProps): React.ReactElement {
	const t = useTranslations('Employees');
	const tCommon = useTranslations('Common');
	const tVacations = useTranslations('Vacations');
	const isCreateMode = mode === 'create';
	const isEditMode = mode === 'edit';
	const isViewMode = mode === 'view';
	const form = rawForm as any;
	const activeEmployeeName = [activeEmployee?.firstName ?? '', activeEmployee?.lastName ?? '']
		.join(' ')
		.trim();
	const isDialogOpen = isOpen;
	const handleDialogOpenChange = handlers.onOpenChange;
	const handleCreateNew = handlers.handleCreateNew;
	const createMutation = { isPending: lookups.createMutationPending };
	const updateMutation = { isPending: lookups.updateMutationPending };
	const ptuHistoryMutation = { isPending: lookups.ptuHistoryMutationPending };
	const terminationPreviewMutation = { isPending: lookups.terminationPreviewPending };
	const terminationMutation = { isPending: lookups.terminationMutationPending };
	const attendanceKpis = lookups.attendanceSummary?.kpis ?? null;
	const attendanceTrend30d = lookups.attendanceSummary?.trend30d ?? [];
	const absenceMonthGroups = lookups.attendanceSummary?.absencesByMonth ?? [];
	const leavesMonthGroups = lookups.attendanceSummary?.leavesByMonth ?? [];
	const attendanceSummary = lookups.attendanceSummary;
	const insightsError = lookups.insightsError;
	const ptuHistoryError = lookups.ptuHistoryError;
	const auditError = lookups.auditError;
	const refetchInsights = handlers.refetchInsights;
	const refetchPtuHistory = handlers.refetchPtuHistory;
	const refetchAudit = handlers.refetchAudit;
	const handleDetailTabChange = handlers.handleDetailTabChange;
	const markTabAsVisited = handlers.markTabAsVisited;
	const registerTabScrollContainer = handlers.registerTabScrollContainer;
	const handleTabScroll = handlers.handleTabScroll;
	const isTabVisited = handlers.isTabVisited;
	const closeEmployeeDialog = handlers.closeEmployeeDialog;
	const handleEditFromDetails = handlers.handleEditFromDetails;
	const setShowMobileDiscardFromOutside = handlers.setShowMobileDiscardFromOutside;
	const setMobileWizardStepIndex = handlers.setMobileWizardStepIndex;
	const handleMobileWizardSubmit = handlers.handleMobileWizardSubmit;
	const handlePtuHistorySave = handlers.handlePtuHistorySave;
	const setPtuHistoryYearInput = handlers.setPtuHistoryYearInput;
	const setPtuHistoryAmountInput = handlers.setPtuHistoryAmountInput;
	const updateTerminationForm = handlers.updateTerminationForm;
	const setIsTerminateDialogOpen = handlers.setIsTerminateDialogOpen;
	const handleTerminationPreview = handlers.handleTerminationPreview;
	const handleTerminateEmployee = handlers.handleTerminateEmployee;
	const setHasCustomCode = handlers.setHasCustomCode;
	const {
		activeEmployeeLocation,
		isMobile,
		canUseDisciplinaryModule,
		secondaryDetailTabs,
		vacationBalance,
		leaveItems,
		attendanceCurrentMonthKey,
		attendanceDrilldownHref,
		isLoadingInsights,
		vacationRequests,
		payrollRuns,
		upcomingExceptions,
		isLoadingPtuHistory,
		ptuHistory,
		isLoadingAudit,
		auditEvents,
		auditFieldLabels,
		mobileWizardSteps,
		isMobileWizardDirty,
		mobileWizardErrorSteps,
		mobileWizardStepIndex,
		showMobileDiscardFromOutside,
		memberOptions,
		isLoadingMembers,
		locations,
		isLoadingLocations,
		jobPositions,
		isLoadingJobPositions,
		periodPayLabel,
		computedDailyPay,
		canManageDualPayrollCompensation,
		fiscalDailyPayPreviewFeedbackKey,
		parsedFiscalDailyPayPreview,
		fiscalDailyComplementPreview,
		activeEmployeeDailyComplement,
		ptuAguinaldoOptionHelp,
		ptuHistoryYearInput,
		ptuHistoryAmountInput,
		isScheduleLoading,
		terminationForm,
		isTerminationLocked,
		terminationPreview,
		isTerminateDialogOpen,
		canDownloadTerminationReceipt,
		terminationReceiptUrl,
		isLoadingTerminationSettlement,
		canConfirmTermination,
		finiquitoLines,
		liquidacionLines,
	} = lookups;

	return (
		<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
			<ResponsivePageHeader
				title={t('title')}
				description={t('subtitle')}
				actions={<EmployeePageActions onCreateNew={handleCreateNew} />}
			/>
			<DialogContent
				showCloseButton={!isMobile}
				className="flex h-[100svh] max-h-[100svh] w-screen max-w-none flex-col overflow-hidden rounded-none border-0 p-0 pb-[env(safe-area-inset-bottom)] min-[1025px]:h-[calc(100dvh-2rem)] min-[1025px]:max-h-[calc(100dvh-2rem)] min-[1025px]:w-[min(96vw,96rem)] min-[1025px]:max-w-[calc(100vw-2rem)] min-[1025px]:rounded-lg min-[1025px]:border min-[1025px]:p-0"
			>
				<DialogHeader className="hidden shrink-0 border-b px-6 py-4 min-[1025px]:flex">
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
				<div
					data-testid="employee-detail-dialog-body"
					className="min-h-0 min-w-0 flex-1 overflow-hidden px-4 pb-4 min-[1025px]:px-6 min-[1025px]:pb-6"
				>
					{isViewMode ? (
						<div className="flex h-full min-h-0 min-w-0 flex-col space-y-4 pt-4">
							{isMobile ? (
								<div className="sticky top-0 z-10 -mx-4 shrink-0 border-b bg-background/95 px-4 py-3 backdrop-blur-sm">
									<div className="flex items-start gap-3">
										<div className="min-w-0 flex-1 space-y-1">
											<p className="truncate text-base font-semibold">
												{activeEmployeeName || tCommon('notAvailable')}
											</p>
											<div className="flex items-center gap-2">
												<p className="truncate text-sm text-muted-foreground">
													{activeEmployee?.code ??
														tCommon('notAvailable')}
												</p>
												{activeEmployee?.status ? (
													<Badge
														variant={
															statusVariants[activeEmployee.status]
														}
													>
														{t(`status.${activeEmployee.status}`)}
													</Badge>
												) : null}
											</div>
										</div>
										<Button
											type="button"
											variant="outline"
											size="icon"
											className="h-11 w-11 shrink-0"
											onClick={handleEditFromDetails}
											aria-label={tCommon('edit')}
										>
											<Pencil className="h-4 w-4" />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="h-11 w-11 shrink-0"
											onClick={() => handleDialogOpenChange(false)}
											aria-label={tCommon('close')}
										>
											<X className="h-4 w-4" />
										</Button>
									</div>
								</div>
							) : null}
							<div
								className={cn(
									'rounded-md border p-4',
									isMobile && 'hidden min-[1025px]:block',
								)}
							>
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
													variant={statusVariants[activeEmployee.status]}
												>
													{t(`status.${activeEmployee.status}`)}
												</Badge>
											)}
										</div>
										<p className="text-sm text-muted-foreground">
											{t('details.codeLabel')}{' '}
											<span className="font-medium text-foreground">
												{activeEmployee?.code ?? tCommon('notAvailable')}
											</span>
										</p>
									</div>
									<Button variant="outline" onClick={handleEditFromDetails}>
										<Pencil className="mr-2 h-4 w-4" />
										{tCommon('edit')}
									</Button>
								</div>
								<div className="mt-4 grid gap-3 text-sm min-[1025px]:grid-cols-4">
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
												? format(activeEmployee.hireDate, t('dateFormat'))
												: tCommon('notAvailable')}
										</p>
									</div>
									<div className="space-y-1">
										<p className="text-muted-foreground">
											{t('fields.shiftType')}
										</p>
										<p className="font-medium">
											{activeEmployee?.shiftType
												? t(`shiftTypeLabels.${activeEmployee.shiftType}`)
												: tCommon('notAvailable')}
										</p>
									</div>
									<div className="space-y-1">
										<p className="text-muted-foreground">{t('fields.email')}</p>
										<p className="font-medium">
											{activeEmployee?.email ?? tCommon('notAvailable')}
										</p>
									</div>
									<div className="space-y-1">
										<p className="text-muted-foreground">{t('fields.phone')}</p>
										<p className="font-medium">
											{activeEmployee?.phone ?? tCommon('notAvailable')}
										</p>
									</div>
									<div className="space-y-1">
										<p className="text-muted-foreground">{t('fields.nss')}</p>
										<p className="font-medium">
											{activeEmployee?.nss ?? tCommon('notAvailable')}
										</p>
									</div>
									<div className="space-y-1">
										<p className="text-muted-foreground">{t('fields.rfc')}</p>
										<p className="font-medium">
											{activeEmployee?.rfc ?? tCommon('notAvailable')}
										</p>
									</div>
									<div className="space-y-1">
										<p className="text-muted-foreground">
											{t('fields.department')}
										</p>
										<p className="font-medium">
											{activeEmployee?.department ?? tCommon('notAvailable')}
										</p>
									</div>
									<div className="space-y-1">
										<p className="text-muted-foreground">{t('fields.user')}</p>
										<p className="font-medium truncate">
											{activeEmployee?.userId ?? t('placeholders.noUser')}
										</p>
									</div>
									{canManageDualPayrollCompensation ? (
										<>
											<div className="space-y-1">
												<p className="text-muted-foreground">
													{t('fields.fiscalDailyPay')}
												</p>
												<p className="font-medium">
													{activeEmployee?.fiscalDailyPay !== undefined &&
													activeEmployee?.fiscalDailyPay !== null
														? formatCurrency(
																activeEmployee.fiscalDailyPay,
															)
														: tCommon('notAvailable')}
												</p>
											</div>
											<div className="space-y-1">
												<p className="text-muted-foreground">
													{t('compensation.dailyComplement')}
												</p>
												<p className="font-medium">
													{activeEmployee?.fiscalDailyPay !== undefined &&
													activeEmployee?.fiscalDailyPay !== null
														? formatCurrency(
																activeEmployeeDailyComplement,
															)
														: tCommon('notAvailable')}
												</p>
											</div>
										</>
									) : null}
								</div>
							</div>

							<Tabs
								value={detailTab}
								onValueChange={(value) =>
									handleDetailTabChange(value as EmployeeDialogTab)
								}
								className="flex min-h-0 min-w-0 flex-1 flex-col"
							>
								{isMobile ? (
									<div
										data-testid="employee-mobile-detail-tabs"
										className="-mx-4 shrink-0 overflow-x-auto border-b"
									>
										<TabsList className="h-auto w-max min-w-full justify-start gap-2 rounded-none border-0 bg-transparent px-4 py-2">
											<TabsTrigger
												value="info"
												className="min-h-11 flex-none px-4"
												onFocus={() => markTabAsVisited('info')}
											>
												{t('tabs.info')}
											</TabsTrigger>
											{PRIMARY_DETAIL_TABS.map((tab) => (
												<TabsTrigger
													key={tab}
													value={tab}
													className="min-h-11 flex-none px-4"
													onFocus={() => markTabAsVisited(tab)}
												>
													{t(`tabs.${tab}`)}
												</TabsTrigger>
											))}
											{secondaryDetailTabs.map((tab) => (
												<TabsTrigger
													key={tab}
													value={tab}
													className="min-h-11 flex-none px-4"
													onFocus={() => markTabAsVisited(tab)}
												>
													{t(`tabs.${tab}`)}
												</TabsTrigger>
											))}
										</TabsList>
									</div>
								) : (
									<TabsList className="h-auto w-full max-w-full shrink-0 justify-start gap-1 overflow-x-auto p-1">
										{PRIMARY_DETAIL_TABS.map((tab) => (
											<TabsTrigger
												key={tab}
												value={tab}
												onFocus={() => markTabAsVisited(tab)}
											>
												{t(`tabs.${tab}`)}
											</TabsTrigger>
										))}
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="h-8 px-2"
													aria-label={t('tabs.moreAriaLabel')}
												>
													{t('tabs.more')}
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												{secondaryDetailTabs.map((tab) => (
													<DropdownMenuItem
														key={tab}
														onSelect={() => {
															handleDetailTabChange(tab);
														}}
														className={cn(
															detailTab === tab &&
																'bg-muted font-medium',
														)}
													>
														{t(`tabs.${tab}`)}
													</DropdownMenuItem>
												))}
											</DropdownMenuContent>
										</DropdownMenu>
									</TabsList>
								)}

								<TabsContent
									value="info"
									forceMount
									className={cn(
										'mt-0 min-h-0 flex-1',
										detailTab !== 'info' && 'hidden',
									)}
								>
									{isTabVisited('info') ? (
										<div
											ref={registerTabScrollContainer('info')}
											onScroll={handleTabScroll('info')}
											data-testid="employee-mobile-detail-panel"
											className="h-full overflow-y-auto pt-4"
										>
											<EmployeeInfoTab
												employee={activeEmployee}
												locationName={activeEmployeeLocation}
												shiftTypeLabel={
													activeEmployee?.shiftType
														? t(
																`shiftTypeLabels.${activeEmployee.shiftType}`,
															)
														: tCommon('notAvailable')
												}
												dateFormat={t('dateFormat')}
											/>
										</div>
									) : null}
								</TabsContent>

								<TabsContent
									value="documents"
									forceMount
									className={cn(
										'mt-0 min-h-0 flex-1',
										detailTab !== 'documents' && 'hidden',
									)}
								>
									{isTabVisited('documents') ? (
										<div
											ref={registerTabScrollContainer('documents')}
											onScroll={handleTabScroll('documents')}
											className="h-full overflow-y-auto pt-4"
										>
											{activeEmployee?.id ? (
												<EmployeeDocumentsTab
													employeeId={activeEmployee.id}
												/>
											) : (
												<Card>
													<CardContent className="py-8 text-sm text-muted-foreground">
														{t('documents.empty')}
													</CardContent>
												</Card>
											)}
										</div>
									) : null}
								</TabsContent>

								{canUseDisciplinaryModule ? (
									<TabsContent
										value="disciplinary"
										forceMount
										className={cn(
											'mt-0 min-h-0 flex-1',
											detailTab !== 'disciplinary' && 'hidden',
										)}
									>
										{isTabVisited('disciplinary') ? (
											<div
												ref={registerTabScrollContainer('disciplinary')}
												onScroll={handleTabScroll('disciplinary')}
												className="h-full overflow-y-auto pt-4"
											>
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
											</div>
										) : null}
									</TabsContent>
								) : null}

								<TabsContent
									value="deductions"
									forceMount
									className={cn(
										'mt-0 min-h-0 flex-1',
										detailTab !== 'deductions' && 'hidden',
									)}
								>
									{isTabVisited('deductions') ? (
										<div
											ref={registerTabScrollContainer('deductions')}
											onScroll={handleTabScroll('deductions')}
											className="h-full overflow-y-auto pt-4"
										>
											{activeEmployee?.id ? (
												<EmployeeDeductionsTab
													mode="employee"
													employeeId={activeEmployee.id}
													employeeName={`${activeEmployee.firstName} ${activeEmployee.lastName}`}
												/>
											) : (
												<Card>
													<CardContent className="py-8 text-sm text-muted-foreground">
														{t('deductions.empty')}
													</CardContent>
												</Card>
											)}
										</div>
									) : null}
								</TabsContent>

								<TabsContent
									value="gratifications"
									forceMount
									className={cn(
										'mt-0 min-h-0 flex-1',
										detailTab !== 'gratifications' && 'hidden',
									)}
								>
									{isTabVisited('gratifications') ? (
										<div
											ref={registerTabScrollContainer('gratifications')}
											onScroll={handleTabScroll('gratifications')}
											className="h-full overflow-y-auto pt-4"
										>
											{activeEmployee?.id ? (
												<EmployeeGratificationsTab
													mode="employee"
													employeeId={activeEmployee.id}
													employeeName={`${activeEmployee.firstName} ${activeEmployee.lastName}`}
												/>
											) : (
												<Card>
													<CardContent className="py-8 text-sm text-muted-foreground">
														{t('gratifications.empty')}
													</CardContent>
												</Card>
											)}
										</div>
									) : null}
								</TabsContent>

								<TabsContent
									value="summary"
									forceMount
									className={cn(
										'mt-0 min-h-0 flex-1',
										detailTab !== 'summary' && 'hidden',
									)}
								>
									{isTabVisited('summary') ? (
										<div
											ref={registerTabScrollContainer('summary')}
											onScroll={handleTabScroll('summary')}
											className="h-full overflow-y-auto pt-4"
										>
											<div className="grid grid-cols-2 gap-3 min-[1025px]:gap-4 min-[1025px]:grid-cols-2 min-[1281px]:grid-cols-3">
												<Card>
													<CardHeader className="flex-row items-center justify-between space-y-0 px-3 pt-3 pb-0 min-[1025px]:px-6 min-[1025px]:pt-6">
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
													<CardContent className="px-3 pb-3 min-[1025px]:px-6 min-[1025px]:pb-6">
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
													<CardHeader className="px-3 pt-3 pb-0 min-[1025px]:px-6 min-[1025px]:pt-6">
														<CardTitle className="text-sm font-medium">
															{t('summary.absences')}
														</CardTitle>
													</CardHeader>
													<CardContent className="px-3 pb-3 min-[1025px]:px-6 min-[1025px]:pb-6">
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
													<CardHeader className="px-3 pt-3 pb-0 min-[1025px]:px-6 min-[1025px]:pt-6">
														<CardTitle className="text-sm font-medium">
															{t('summary.leaves')}
														</CardTitle>
													</CardHeader>
													<CardContent className="px-3 pb-3 min-[1025px]:px-6 min-[1025px]:pb-6">
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
													<CardHeader className="px-3 pt-3 pb-0 min-[1025px]:px-6 min-[1025px]:pt-6">
														<CardTitle className="text-sm font-medium">
															{t('summary.payrollRuns')}
														</CardTitle>
													</CardHeader>
													<CardContent className="px-3 pb-3 min-[1025px]:px-6 min-[1025px]:pb-6">
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
													<CardHeader className="px-3 pt-3 pb-0 min-[1025px]:px-6 min-[1025px]:pt-6">
														<CardTitle className="text-sm font-medium">
															{t('summary.upcomingExceptions')}
														</CardTitle>
													</CardHeader>
													<CardContent className="px-3 pb-3 min-[1025px]:px-6 min-[1025px]:pb-6">
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
										</div>
									) : null}
								</TabsContent>

								<TabsContent
									value="attendance"
									forceMount
									className={cn(
										'mt-0 min-h-0 flex-1',
										detailTab !== 'attendance' && 'hidden',
									)}
								>
									{isTabVisited('attendance') ? (
										<div
											ref={registerTabScrollContainer('attendance')}
											onScroll={handleTabScroll('attendance')}
											className="h-full overflow-y-auto pt-4"
										>
											<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
												<div>
													<p className="text-sm font-medium">
														{t('attendance.title')}
													</p>
													<p className="text-xs text-muted-foreground">
														{t('attendance.subtitle')}
													</p>
												</div>
												{attendanceDrilldownHref ? (
													<Button
														variant="outline"
														className="min-h-11"
														asChild
													>
														<Link href={attendanceDrilldownHref}>
															{t('attendance.viewInAttendance')}
														</Link>
													</Button>
												) : null}
											</div>

											{insightsError ? (
												<Card>
													<CardContent className="flex items-center justify-between gap-3 py-6">
														<p className="text-sm text-muted-foreground">
															{t('attendance.partialError')}
														</p>
														<Button
															variant="outline"
															onClick={() => void refetchInsights()}
														>
															{tCommon('retry')}
														</Button>
													</CardContent>
												</Card>
											) : (
												<div className="space-y-4">
													<div className="grid grid-cols-2 gap-3 min-[1025px]:grid-cols-2 min-[1281px]:grid-cols-4">
														<Card>
															<CardHeader className="pb-2">
																<CardTitle className="text-sm font-medium">
																	{t(
																		'attendance.kpis.currentStreak',
																	)}
																</CardTitle>
															</CardHeader>
															<CardContent>
																{isLoadingInsights ? (
																	<Skeleton className="h-7 w-20" />
																) : (
																	<p className="text-2xl font-semibold">
																		{attendanceKpis?.absenceStreakCurrentDays ??
																			0}
																	</p>
																)}
															</CardContent>
														</Card>
														<Card>
															<CardHeader className="pb-2">
																<CardTitle className="text-sm font-medium">
																	{t(
																		'attendance.kpis.unjustified30d',
																	)}
																</CardTitle>
															</CardHeader>
															<CardContent>
																{isLoadingInsights ? (
																	<Skeleton className="h-7 w-20" />
																) : (
																	<p className="text-2xl font-semibold">
																		{attendanceKpis?.unjustifiedAbsences30d ??
																			0}
																	</p>
																)}
															</CardContent>
														</Card>
														<Card>
															<CardHeader className="pb-2">
																<CardTitle className="text-sm font-medium">
																	{t(
																		'attendance.kpis.attendanceRate30d',
																	)}
																</CardTitle>
															</CardHeader>
															<CardContent>
																{isLoadingInsights ? (
																	<Skeleton className="h-7 w-20" />
																) : (
																	<p className="text-2xl font-semibold">
																		{(
																			attendanceKpis?.attendanceRate30d ??
																			0
																		).toFixed(1)}
																		%
																	</p>
																)}
															</CardContent>
														</Card>
														<Card>
															<CardHeader className="pb-2">
																<CardTitle className="text-sm font-medium">
																	{t(
																		'attendance.kpis.justified90d',
																	)}
																</CardTitle>
															</CardHeader>
															<CardContent>
																{isLoadingInsights ? (
																	<Skeleton className="h-7 w-20" />
																) : (
																	<p className="text-2xl font-semibold">
																		{attendanceKpis?.justifiedLeaves90d ??
																			0}
																	</p>
																)}
															</CardContent>
														</Card>
													</div>

													<Card>
														<CardHeader className="pb-2">
															<CardTitle className="text-sm font-medium">
																{t('attendance.trendTitle')}
															</CardTitle>
														</CardHeader>
														<CardContent>
															{isLoadingInsights ? (
																<Skeleton className="h-12 w-full" />
															) : attendanceTrend30d.length > 0 ? (
																<div className="flex items-end gap-1">
																	{attendanceTrend30d.map(
																		(point) => (
																			<span
																				key={point.dateKey}
																				title={`${point.dateKey} - ${t(`attendance.trendStatus.${point.status}`)}`}
																				aria-label={`${point.dateKey} - ${t(`attendance.trendStatus.${point.status}`)}`}
																				className={cn(
																					'h-8 w-2 rounded-sm',
																					point.status ===
																						'PRESENT' &&
																						'bg-[var(--status-success)]',
																					point.status ===
																						'ABSENT' &&
																						'bg-destructive',
																					point.status ===
																						'LEAVE' &&
																						'bg-[var(--status-warning)]',
																					point.status ===
																						'DAY_OFF' &&
																						'bg-muted-foreground/40',
																				)}
																			/>
																		),
																	)}
																</div>
															) : (
																<p className="text-sm text-muted-foreground">
																	{tCommon('notAvailable')}
																</p>
															)}
														</CardContent>
													</Card>

													<div className="grid gap-4 min-[1025px]:grid-cols-2">
														<Card>
															<CardHeader className="min-h-16 pb-3">
																<CardTitle className="text-sm font-medium">
																	{t('attendance.absencesTitle')}
																</CardTitle>
															</CardHeader>
															<CardContent className="min-h-[18rem]">
																{isLoadingInsights ? (
																	<Skeleton className="h-24 w-full" />
																) : absenceMonthGroups.length >
																  0 ? (
																	<Accordion
																		type="single"
																		collapsible
																		defaultValue={
																			attendanceCurrentMonthKey
																		}
																		className="w-full"
																	>
																		{absenceMonthGroups.map(
																			(group) => (
																				<AccordionItem
																					key={
																						group.monthKey
																					}
																					value={
																						group.monthKey
																					}
																				>
																					<AccordionTrigger className="items-center gap-3 text-sm">
																						<span className="flex-1 text-left capitalize">
																							{formatMonthLabel(
																								group.monthKey,
																							)}
																						</span>
																						<span className="min-w-12 text-right text-xs tabular-nums text-muted-foreground">
																							{
																								group.totalDays
																							}
																						</span>
																					</AccordionTrigger>
																					<AccordionContent>
																						<ul className="space-y-1 text-sm">
																							{group.dateKeys.map(
																								(
																									dateKey,
																								) => (
																									<li
																										key={
																											dateKey
																										}
																										className="flex items-center justify-between"
																									>
																										<span className="font-medium">
																											{formatShortDateUtc(
																												toUtcDate(
																													dateKey,
																												),
																											)}
																										</span>
																										<span className="text-xs text-muted-foreground">
																											{
																												dateKey
																											}
																										</span>
																									</li>
																								),
																							)}
																						</ul>
																					</AccordionContent>
																				</AccordionItem>
																			),
																		)}
																	</Accordion>
																) : (
																	<div className="flex min-h-[8.5rem] items-start">
																		<p className="text-sm text-muted-foreground">
																			{t(
																				'attendance.emptyAbsences',
																			)}
																		</p>
																	</div>
																)}
															</CardContent>
														</Card>

														<Card>
															<CardHeader className="min-h-16 pb-3">
																<CardTitle className="text-sm font-medium">
																	{t('attendance.leavesTitle')}
																</CardTitle>
															</CardHeader>
															<CardContent className="min-h-[18rem]">
																{isLoadingInsights ? (
																	<Skeleton className="h-24 w-full" />
																) : leavesMonthGroups.length > 0 ? (
																	<Accordion
																		type="single"
																		collapsible
																		defaultValue={
																			attendanceCurrentMonthKey
																		}
																		className="w-full"
																	>
																		{leavesMonthGroups.map(
																			(group) => (
																				<AccordionItem
																					key={
																						group.monthKey
																					}
																					value={
																						group.monthKey
																					}
																				>
																					<AccordionTrigger className="items-center gap-3 text-sm">
																						<span className="flex-1 text-left capitalize">
																							{formatMonthLabel(
																								group.monthKey,
																							)}
																						</span>
																						<span className="min-w-12 text-right text-xs tabular-nums text-muted-foreground">
																							{
																								group.totalDays
																							}
																						</span>
																					</AccordionTrigger>
																					<AccordionContent>
																						<ul className="space-y-1 text-sm">
																							{group.dateKeys.map(
																								(
																									dateKey,
																								) => (
																									<li
																										key={
																											dateKey
																										}
																										className="flex items-center justify-between"
																									>
																										<span className="font-medium">
																											{formatShortDateUtc(
																												toUtcDate(
																													dateKey,
																												),
																											)}
																										</span>
																										<span className="text-xs text-muted-foreground">
																											{
																												dateKey
																											}
																										</span>
																									</li>
																								),
																							)}
																						</ul>
																					</AccordionContent>
																				</AccordionItem>
																			),
																		)}
																	</Accordion>
																) : (
																	<div className="flex min-h-[8.5rem] items-start">
																		<p className="text-sm text-muted-foreground">
																			{t(
																				'attendance.emptyLeaves',
																			)}
																		</p>
																	</div>
																)}
															</CardContent>
														</Card>
													</div>
												</div>
											)}
										</div>
									) : null}
								</TabsContent>

								<TabsContent
									value="vacations"
									forceMount
									className={cn(
										'mt-0 min-h-0 min-w-0 flex-1',
										detailTab !== 'vacations' && 'hidden',
									)}
								>
									{isTabVisited('vacations') ? (
										<div
											ref={registerTabScrollContainer('vacations')}
											onScroll={handleTabScroll('vacations')}
											data-testid="employee-vacations-panel"
											className="h-full min-w-0 overflow-y-auto overscroll-contain pt-4"
										>
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
															<div className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2 min-[1281px]:grid-cols-5">
																<div className="space-y-1">
																	<p className="text-xs text-muted-foreground">
																		{t(
																			'vacations.balance.entitled',
																		)}
																	</p>
																	<p className="text-lg font-semibold">
																		{
																			vacationBalance.entitledDays
																		}
																	</p>
																</div>
																<div className="space-y-1">
																	<p className="text-xs text-muted-foreground">
																		{t(
																			'vacations.balance.accrued',
																		)}
																	</p>
																	<p className="text-lg font-semibold">
																		{vacationBalance.accruedDays.toFixed(
																			2,
																		)}
																	</p>
																</div>
																<div className="space-y-1">
																	<p className="text-xs text-muted-foreground">
																		{t(
																			'vacations.balance.used',
																		)}
																	</p>
																	<p className="text-lg font-semibold">
																		{vacationBalance.usedDays}
																	</p>
																</div>
																<div className="space-y-1">
																	<p className="text-xs text-muted-foreground">
																		{t(
																			'vacations.balance.pending',
																		)}
																	</p>
																	<p className="text-lg font-semibold">
																		{
																			vacationBalance.pendingDays
																		}
																	</p>
																</div>
																<div className="space-y-1">
																	<p className="text-xs text-muted-foreground">
																		{t(
																			'vacations.balance.available',
																		)}
																	</p>
																	<p className="text-lg font-semibold">
																		{
																			vacationBalance.availableDays
																		}
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

												{isMobile ? (
													<div className="space-y-3">
														{isLoadingInsights ? (
															Array.from({ length: 3 }).map(
																(_, index) => (
																	<div
																		key={index}
																		className="rounded-lg border p-3"
																	>
																		<Skeleton className="h-4 w-28" />
																		<Skeleton className="mt-2 h-4 w-20" />
																		<Skeleton className="mt-2 h-4 w-24" />
																		<Skeleton className="mt-2 h-4 w-20" />
																	</div>
																),
															)
														) : vacationRequests.length === 0 ? (
															<div className="rounded-lg border p-4 text-sm text-muted-foreground">
																{t('vacations.table.empty')}
															</div>
														) : (
															vacationRequests.map((request) => (
																<div
																	key={request.id}
																	className="rounded-lg border p-3"
																>
																	<div className="flex items-start justify-between gap-3">
																		<div className="min-w-0 flex-1">
																			<p className="text-xs text-muted-foreground">
																				{t(
																					'vacations.table.headers.period',
																				)}
																			</p>
																			<p className="mt-1 font-medium">
																				{formatDateRangeUtc(
																					toUtcDate(
																						request.startDateKey,
																					),
																					toUtcDate(
																						request.endDateKey,
																					),
																				)}
																			</p>
																		</div>
																		<Badge variant="outline">
																			{tVacations(
																				`status.${request.status}`,
																			)}
																		</Badge>
																	</div>
																	<div className="mt-3 grid gap-3 text-sm">
																		<div className="space-y-1">
																			<p className="text-xs text-muted-foreground">
																				{t(
																					'vacations.table.headers.type',
																				)}
																			</p>
																			<p className="font-medium">
																				{t(
																					'tabs.vacations',
																				)}
																			</p>
																		</div>
																		<div className="space-y-1">
																			<p className="text-xs text-muted-foreground">
																				{t(
																					'vacations.table.headers.days',
																				)}
																			</p>
																			<p className="font-medium">
																				{tVacations(
																					'table.daysSummary',
																					{
																						vacation:
																							request.vacationDays,
																						total: request.totalDays,
																					},
																				)}
																			</p>
																		</div>
																		<div className="space-y-1">
																			<p className="text-xs text-muted-foreground">
																				{t(
																					'vacations.table.headers.status',
																				)}
																			</p>
																			<div className="flex min-h-11 items-center">
																				<Badge variant="outline">
																					{tVacations(
																						`status.${request.status}`,
																					)}
																				</Badge>
																			</div>
																		</div>
																	</div>
																</div>
															))
														)}
													</div>
												) : (
													<div
														data-testid="employee-vacations-table-container"
														className="overflow-x-auto rounded-md border"
													>
														<Table className="min-w-[30rem]">
															<TableHeader>
																<TableRow>
																	<TableHead>
																		{t(
																			'vacations.table.headers.period',
																		)}
																	</TableHead>
																	<TableHead>
																		{t(
																			'vacations.table.headers.days',
																		)}
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
																) : vacationRequests.length ===
																  0 ? (
																	<TableRow>
																		<TableCell
																			colSpan={3}
																			className="h-20 text-center"
																		>
																			{t(
																				'vacations.table.empty',
																			)}
																		</TableCell>
																	</TableRow>
																) : (
																	vacationRequests.map(
																		(request) => (
																			<TableRow
																				key={request.id}
																			>
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
																		),
																	)
																)}
															</TableBody>
														</Table>
													</div>
												)}
											</div>
										</div>
									) : null}
								</TabsContent>

								<TabsContent
									value="payroll"
									forceMount
									className={cn(
										'mt-0 min-h-0 flex-1',
										detailTab !== 'payroll' && 'hidden',
									)}
								>
									{isTabVisited('payroll') ? (
										<div
											ref={registerTabScrollContainer('payroll')}
											onScroll={handleTabScroll('payroll')}
											className="h-full overflow-y-auto pt-4"
										>
											{isMobile ? (
												<div className="space-y-3">
													{isLoadingInsights ? (
														Array.from({ length: 3 }).map(
															(_, index) => (
																<div
																	key={index}
																	className="rounded-lg border p-3"
																>
																	<Skeleton className="h-4 w-28" />
																	<Skeleton className="mt-2 h-4 w-24" />
																	<Skeleton className="mt-2 h-4 w-20" />
																	<Skeleton className="mt-2 h-4 w-20" />
																</div>
															),
														)
													) : payrollRuns.length === 0 ? (
														<div className="rounded-lg border p-4 text-sm text-muted-foreground">
															{t('payroll.table.empty')}
														</div>
													) : (
														payrollRuns.map((run) => (
															<div
																key={run.payrollRunId}
																className="rounded-lg border p-3"
															>
																<div className="space-y-1">
																	<p className="text-xs text-muted-foreground">
																		{t(
																			'payroll.table.headers.period',
																		)}
																	</p>
																	<p className="font-medium">
																		{formatDateRangeUtc(
																			new Date(
																				run.periodStart,
																			),
																			new Date(run.periodEnd),
																		)}
																	</p>
																</div>
																<div className="mt-3 grid gap-3 text-sm">
																	<div className="space-y-1">
																		<p className="text-xs text-muted-foreground">
																			{t(
																				'payroll.table.headers.frequency',
																			)}
																		</p>
																		<p className="font-medium">
																			{t(
																				`paymentFrequency.${run.paymentFrequency}`,
																			)}
																		</p>
																	</div>
																	<div className="space-y-1">
																		<p className="text-xs text-muted-foreground">
																			{t(
																				'payroll.table.headers.status',
																			)}
																		</p>
																		<div className="flex min-h-11 items-center">
																			<Badge variant="outline">
																				{t(
																					`payroll.status.${run.status}`,
																				)}
																			</Badge>
																		</div>
																	</div>
																	<div className="space-y-1">
																		<p className="text-xs text-muted-foreground">
																			{t(
																				'payroll.table.headers.total',
																			)}
																		</p>
																		<p className="font-medium">
																			{formatCurrency(
																				run.totalPay,
																			)}
																		</p>
																	</div>
																</div>
															</div>
														))
													)}
												</div>
											) : (
												<div className="rounded-md border">
													<Table className="min-w-[30rem]">
														<TableHeader>
															<TableRow>
																<TableHead>
																	{t(
																		'payroll.table.headers.period',
																	)}
																</TableHead>
																<TableHead>
																	{t(
																		'payroll.table.headers.total',
																	)}
																</TableHead>
																<TableHead>
																	{t(
																		'payroll.table.headers.status',
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
																	<TableRow
																		key={run.payrollRunId}
																	>
																		<TableCell>
																			{formatDateRangeUtc(
																				new Date(
																					run.periodStart,
																				),
																				new Date(
																					run.periodEnd,
																				),
																			)}
																		</TableCell>
																		<TableCell>
																			{formatCurrency(
																				run.totalPay,
																			)}
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
											)}
										</div>
									) : null}
								</TabsContent>

								<TabsContent
									value="ptu"
									forceMount
									className={cn(
										'mt-0 min-h-0 flex-1',
										detailTab !== 'ptu' && 'hidden',
									)}
								>
									{isTabVisited('ptu') ? (
										<div
											ref={registerTabScrollContainer('ptu')}
											onScroll={handleTabScroll('ptu')}
											className="h-full overflow-y-auto pt-4"
										>
											<div className="grid gap-4">
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
																	? t(
																			'ptuAguinaldo.values.days',
																			{
																				days: activeEmployee.aguinaldoDaysOverride,
																			},
																		)
																	: tCommon('notAvailable')}
															</span>
														</div>
														<div className="flex items-center justify-between">
															<span className="text-muted-foreground">
																{t('fields.platformHoursYear')}
															</span>
															<span className="font-medium">
																{activeEmployee?.platformHoursYear ??
																	tCommon('notAvailable')}
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
																	{t(
																		'fields.isDirectorAdminGeneralManager',
																	)}
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
														{ptuHistoryError ? (
															<div className="flex items-center justify-between gap-3 py-2">
																<p className="text-sm text-muted-foreground">
																	{t('ptuHistory.partialError')}
																</p>
																<Button
																	variant="outline"
																	size="sm"
																	className="min-h-11"
																	onClick={() =>
																		void refetchPtuHistory()
																	}
																>
																	{tCommon('retry')}
																</Button>
															</div>
														) : isLoadingPtuHistory ? (
															<Skeleton className="h-4 w-full" />
														) : ptuHistory.length === 0 ? (
															<div className="py-6 text-center text-sm text-muted-foreground">
																{t('ptuHistory.table.empty')}
															</div>
														) : isMobile ? (
															<div className="space-y-3">
																{ptuHistory.map((entry) => (
																	<div
																		key={entry.id}
																		className="rounded-lg border p-3"
																	>
																		<div className="flex items-center justify-between gap-3">
																			<span className="text-xs text-muted-foreground">
																				{t(
																					'ptuHistory.table.year',
																				)}
																			</span>
																			<span className="font-medium">
																				{entry.fiscalYear}
																			</span>
																		</div>
																		<div className="mt-2 flex items-center justify-between gap-3">
																			<span className="text-xs text-muted-foreground">
																				{t(
																					'ptuHistory.table.amount',
																				)}
																			</span>
																			<span className="font-medium tabular-nums">
																				{formatCurrency(
																					entry.amount,
																				)}
																			</span>
																		</div>
																	</div>
																))}
															</div>
														) : (
															<div className="rounded-md border">
																<Table>
																	<TableHeader>
																		<TableRow>
																			<TableHead>
																				{t(
																					'ptuHistory.table.year',
																				)}
																			</TableHead>
																			<TableHead className="text-right">
																				{t(
																					'ptuHistory.table.amount',
																				)}
																			</TableHead>
																		</TableRow>
																	</TableHeader>
																	<TableBody>
																		{ptuHistory.map((entry) => (
																			<TableRow
																				key={entry.id}
																			>
																				<TableCell>
																					{
																						entry.fiscalYear
																					}
																				</TableCell>
																				<TableCell className="text-right tabular-nums">
																					{formatCurrency(
																						entry.amount,
																					)}
																				</TableCell>
																			</TableRow>
																		))}
																	</TableBody>
																</Table>
															</div>
														)}
													</CardContent>
												</Card>
											</div>
										</div>
									) : null}
								</TabsContent>

								<TabsContent
									value="finiquito"
									forceMount
									className={cn(
										'mt-0 min-h-0 flex-1',
										detailTab !== 'finiquito' && 'hidden',
									)}
								>
									{isTabVisited('finiquito') ? (
										<div
											ref={registerTabScrollContainer('finiquito')}
											onScroll={handleTabScroll('finiquito')}
											className="h-full overflow-y-auto pt-4"
										>
											<div className="grid gap-4 min-[1025px]:grid-cols-[1.2fr_1fr]">
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
														<div className="grid gap-4 min-[1025px]:grid-cols-2">
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
																		terminationDateKey:
																			nextValue,
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
																		lastDayWorkedDateKey:
																			nextValue,
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
																					key={
																						option.value
																					}
																					value={
																						option.value
																					}
																				>
																					{t(
																						option.labelKey,
																					)}
																				</SelectItem>
																			),
																		)}
																	</SelectContent>
																</Select>
															</div>
															<div className="space-y-2">
																<Label>
																	{t(
																		'finiquito.fields.contractType',
																	)}
																</Label>
																<Select
																	value={
																		terminationForm.contractType
																	}
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
																					key={
																						option.value
																					}
																					value={
																						option.value
																					}
																				>
																					{t(
																						option.labelKey,
																					)}
																				</SelectItem>
																			),
																		)}
																	</SelectContent>
																</Select>
															</div>
															<div className="space-y-2">
																<Label>
																	{t(
																		'finiquito.fields.unpaidDays',
																	)}
																</Label>
																<Input
																	type="number"
																	min="0"
																	step="0.01"
																	value={
																		terminationForm.unpaidDays
																	}
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
															<div className="space-y-2 min-[1025px]:col-span-2">
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
																	{t(
																		'finiquito.form.previewHint',
																		{
																			action: t(
																				'finiquito.actions.preview',
																			),
																		},
																	)}
																</span>
															</div>
															<div className="flex flex-col gap-2 min-[1025px]:flex-row min-[1025px]:flex-wrap">
																<Button
																	onClick={
																		handleTerminationPreview
																	}
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
																		t(
																			'finiquito.actions.preview',
																		)
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
																					tCommon(
																						'confirm',
																					)
																				)}
																			</Button>
																		</DialogFooter>
																	</DialogContent>
																</Dialog>
																{canDownloadTerminationReceipt ? (
																	<Button
																		variant="outline"
																		asChild
																	>
																		<a
																			href={
																				terminationReceiptUrl
																			}
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
																{t(
																	'finiquito.results.finiquitoTitle',
																)}
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
																			<span>
																				{line.label}
																			</span>
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
																		{t(
																			'finiquito.empty.preview',
																		)}
																	</p>
																)}
															</AccordionContent>
														</AccordionItem>
													</Accordion>
												</div>
											</div>
										</div>
									) : null}
								</TabsContent>

								<TabsContent
									value="exceptions"
									forceMount
									className={cn(
										'mt-0 min-h-0 flex-1',
										detailTab !== 'exceptions' && 'hidden',
									)}
								>
									{isTabVisited('exceptions') ? (
										<div
											ref={registerTabScrollContainer('exceptions')}
											onScroll={handleTabScroll('exceptions')}
											className="h-full overflow-y-auto pt-4"
										>
											{isMobile ? (
												<div className="space-y-3">
													{isLoadingInsights ? (
														Array.from({ length: 3 }).map(
															(_, index) => (
																<div
																	key={index}
																	className="rounded-lg border p-3"
																>
																	<Skeleton className="h-4 w-24" />
																	<Skeleton className="mt-2 h-4 w-20" />
																	<Skeleton className="mt-2 h-4 w-28" />
																</div>
															),
														)
													) : upcomingExceptions.length === 0 ? (
														<div className="rounded-lg border p-4 text-sm text-muted-foreground">
															{t('exceptions.table.empty')}
														</div>
													) : (
														upcomingExceptions.map((item) => (
															<div
																key={item.id}
																className="rounded-lg border p-3"
															>
																<div className="flex items-center justify-between gap-3">
																	<span className="text-xs text-muted-foreground">
																		{t(
																			'exceptions.table.headers.date',
																		)}
																	</span>
																	<span className="font-medium">
																		{formatShortDateUtc(
																			toUtcDate(item.dateKey),
																		)}
																	</span>
																</div>
																<div className="mt-2 flex items-center justify-between gap-3">
																	<span className="text-xs text-muted-foreground">
																		{t(
																			'exceptions.table.headers.type',
																		)}
																	</span>
																	<span className="text-right font-medium">
																		{t(
																			`exceptionTypes.${item.exceptionType}`,
																		)}
																	</span>
																</div>
																<div className="mt-2">
																	<p className="text-xs text-muted-foreground">
																		{t(
																			'exceptions.table.headers.reason',
																		)}
																	</p>
																	<p className="mt-1 text-sm font-medium">
																		{item.reason ??
																			tCommon('notAvailable')}
																	</p>
																</div>
															</div>
														))
													)}
												</div>
											) : (
												<div className="rounded-md border">
													<Table className="min-w-[30rem]">
														<TableHeader>
															<TableRow>
																<TableHead>
																	{t(
																		'exceptions.table.headers.date',
																	)}
																</TableHead>
																<TableHead>
																	{t(
																		'exceptions.table.headers.type',
																	)}
																</TableHead>
																<TableHead>
																	{t(
																		'exceptions.table.headers.reason',
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
																		{t(
																			'exceptions.table.empty',
																		)}
																	</TableCell>
																</TableRow>
															) : (
																upcomingExceptions.map((item) => (
																	<TableRow key={item.id}>
																		<TableCell>
																			{formatShortDateUtc(
																				toUtcDate(
																					item.dateKey,
																				),
																			)}
																		</TableCell>
																		<TableCell>
																			{t(
																				`exceptionTypes.${item.exceptionType}`,
																			)}
																		</TableCell>
																		<TableCell>
																			{item.reason ??
																				tCommon(
																					'notAvailable',
																				)}
																		</TableCell>
																	</TableRow>
																))
															)}
														</TableBody>
													</Table>
												</div>
											)}
										</div>
									) : null}
								</TabsContent>

								<TabsContent
									value="audit"
									forceMount
									className={cn(
										'mt-0 min-h-0 flex-1',
										detailTab !== 'audit' && 'hidden',
									)}
								>
									{isTabVisited('audit') ? (
										<div
											ref={registerTabScrollContainer('audit')}
											onScroll={handleTabScroll('audit')}
											className="h-full overflow-y-auto pt-4"
										>
											{auditError ? (
												<div className="rounded-md border p-3">
													<div className="flex items-center justify-between gap-3 py-2">
														<p className="text-sm text-muted-foreground">
															{t('audit.partialError')}
														</p>
														<Button
															variant="outline"
															size="sm"
															className="min-h-11"
															onClick={() => void refetchAudit()}
														>
															{tCommon('retry')}
														</Button>
													</div>
												</div>
											) : isMobile ? (
												<div className="space-y-3">
													{isLoadingAudit ? (
														Array.from({ length: 3 }).map(
															(_, index) => (
																<div
																	key={index}
																	className="rounded-lg border p-3"
																>
																	<Skeleton className="h-4 w-24" />
																	<Skeleton className="mt-2 h-4 w-24" />
																	<Skeleton className="mt-2 h-4 w-32" />
																	<Skeleton className="mt-2 h-4 w-full" />
																</div>
															),
														)
													) : auditEvents.length === 0 ? (
														<div className="rounded-lg border p-4 text-sm text-muted-foreground">
															{t('audit.table.empty')}
														</div>
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
																<div
																	key={event.id}
																	className="rounded-lg border p-3"
																>
																	<div className="flex items-center justify-between gap-3">
																		<span className="text-xs text-muted-foreground">
																			{t(
																				'audit.table.headers.date',
																			)}
																		</span>
																		<span className="font-medium">
																			{format(
																				new Date(
																					event.createdAt,
																				),
																				t('dateFormat'),
																			)}
																		</span>
																	</div>
																	<div className="mt-2 flex items-center justify-between gap-3">
																		<span className="text-xs text-muted-foreground">
																			{t(
																				'audit.table.headers.action',
																			)}
																		</span>
																		<span className="text-right font-medium">
																			{t(
																				`audit.actions.${event.action}`,
																			)}
																		</span>
																	</div>
																	<div className="mt-2">
																		<p className="text-xs text-muted-foreground">
																			{t(
																				'audit.table.headers.actor',
																			)}
																		</p>
																		<p className="mt-1 text-sm font-medium">
																			{actorLabel
																				? `${actorTypeLabel} - ${actorLabel}`
																				: actorTypeLabel}
																		</p>
																	</div>
																	<div className="mt-2">
																		<p className="text-xs text-muted-foreground">
																			{t(
																				'audit.table.headers.fields',
																			)}
																		</p>
																		<p className="mt-1 text-sm font-medium">
																			{fieldsLabel}
																		</p>
																	</div>
																</div>
															);
														})
													)}
												</div>
											) : (
												<div className="rounded-md border">
													<Table className="min-w-[38rem]">
														<TableHeader>
															<TableRow>
																<TableHead>
																	{t('audit.table.headers.date')}
																</TableHead>
																<TableHead>
																	{t(
																		'audit.table.headers.action',
																	)}
																</TableHead>
																<TableHead>
																	{t('audit.table.headers.actor')}
																</TableHead>
																<TableHead>
																	{t(
																		'audit.table.headers.fields',
																	)}
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
																		event.changedFields.length >
																			0
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
																			: t(
																					'audit.fields.none',
																				);

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
											)}
										</div>
									) : null}
								</TabsContent>
							</Tabs>
						</div>
					) : isMobile ? (
						<EmployeeMobileFormWizard
							title={isCreateMode ? t('dialog.title.add') : t('dialog.title.edit')}
							closeLabel={tCommon('close')}
							previousLabel={tCommon('previous')}
							nextLabel={tCommon('next')}
							saveLabel={tCommon('save')}
							cancelDiscardLabel={tCommon('cancel')}
							confirmDiscardLabel={t('wizard.discard.confirm')}
							discardTitle={t('wizard.discard.title')}
							discardDescription={t('wizard.discard.description')}
							progressLabel={t.raw('wizard.progress') as string}
							progressNavigationLabel={t('wizard.navigation')}
							stepAriaLabel={t.raw('wizard.stepAriaLabel') as string}
							stepErrorSuffix={t('wizard.stepErrorSuffix')}
							dirty={isMobileWizardDirty}
							errorStepIndexes={mobileWizardErrorSteps}
							showDiscardFromOutside={showMobileDiscardFromOutside}
							setShowDiscardFromOutside={setShowMobileDiscardFromOutside}
							activeStepIndex={mobileWizardStepIndex}
							onActiveStepIndexChange={setMobileWizardStepIndex}
							isSubmitting={createMutation.isPending || updateMutation.isPending}
							steps={mobileWizardSteps}
							onClose={closeEmployeeDialog}
							onSubmit={() => void handleMobileWizardSubmit()}
						/>
					) : (
						<form
							className="flex h-full min-h-0 flex-col"
							onSubmit={(e) => {
								e.preventDefault();
								e.stopPropagation();
								form.handleSubmit();
							}}
						>
							<div className="min-h-0 flex-1 overflow-y-auto">
								<div className="grid gap-4 py-4 min-[1025px]:grid-cols-2">
									<div className="col-span-2 min-[1025px]:col-span-1">
										<form.AppField
											name="code"
											validators={{
												onChange: ({ value }: { value: string }) =>
													!value.trim()
														? t('validation.codeRequired')
														: undefined,
											}}
										>
											{(field: any) => (
												<EmployeeCodeField
													field={field}
													label={t('fields.code')}
													isEditMode={isEditMode}
													setHasCustomCode={setHasCustomCode}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 min-[1025px]:col-span-1">
										<form.AppField
											name="firstName"
											validators={{
												onChange: ({ value }: { value: string }) =>
													!value.trim()
														? t('validation.firstNameRequired')
														: undefined,
											}}
										>
											{(field: any) => (
												<field.TextField label={t('fields.firstName')} />
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 min-[1025px]:col-span-1">
										<form.AppField
											name="lastName"
											validators={{
												onChange: ({ value }: { value: string }) =>
													!value.trim()
														? t('validation.lastNameRequired')
														: undefined,
											}}
										>
											{(field: any) => (
												<field.TextField label={t('fields.lastName')} />
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 min-[1025px]:col-span-1">
										<form.AppField name="nss">
											{(field: any) => (
												<field.TextField
													label={t('fields.nss')}
													placeholder={tCommon('optional')}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 min-[1025px]:col-span-1">
										<form.AppField name="rfc">
											{(field: any) => (
												<field.TextField
													label={t('fields.rfc')}
													placeholder={tCommon('optional')}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 min-[1025px]:col-span-1">
										<form.AppField name="email">
											{(field: any) => (
												<field.TextField
													label={t('fields.email')}
													type="email"
													placeholder={tCommon('optional')}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 min-[1025px]:col-span-1">
										<form.AppField name="userId">
											{(field: any) => (
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
									<div className="col-span-2 min-[1025px]:col-span-1">
										<form.AppField name="phone">
											{(field: any) => (
												<field.TextField
													label={t('fields.phone')}
													placeholder={tCommon('optional')}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 min-[1025px]:col-span-1">
										<form.AppField
											name="locationId"
											validators={{
												onChange: ({ value }: { value: string }) =>
													!value
														? t('validation.locationRequired')
														: undefined,
											}}
										>
											{(field: any) => (
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
									<div className="col-span-2 min-[1025px]:col-span-1">
										<form.AppField
											name="jobPositionId"
											validators={{
												onChange: ({ value }: { value: string }) =>
													isCreateMode && !value
														? t('validation.jobPositionRequired')
														: undefined,
											}}
										>
											{(field: any) => (
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
									<div className="col-span-2 min-[1025px]:col-span-1">
										<form.AppField name="department">
											{(field: any) => (
												<field.TextField
													label={t('fields.department')}
													placeholder={tCommon('optional')}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 min-[1025px]:col-span-1">
										<form.AppField name="status">
											{(field: any) => (
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
									<div className="col-span-2 min-[1025px]:col-span-1">
										<form.AppField name="shiftType">
											{(field: any) => (
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
									<div className="col-span-2 min-[1025px]:col-span-1">
										<form.AppField
											name="hireDate"
											validators={{
												onChange: ({ value }: { value: string }) => {
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
											{(field: any) => (
												<field.DateField
													label={t('fields.hireDate')}
													placeholder={t('placeholders.hireDate')}
													variant="input"
													minYear={1950}
												/>
											)}
										</form.AppField>
									</div>
									<div className="col-span-2 min-[1025px]:col-span-1">
										<form.AppField
											name="paymentFrequency"
											validators={{
												onChange: ({ value }: { value: string }) =>
													!value
														? t('validation.paymentFrequencyRequired')
														: undefined,
											}}
										>
											{(field: any) => (
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
									<div className="col-span-2 min-[1025px]:col-span-1">
										<form.AppField
											name="periodPay"
											validators={{
												onChange: ({ value }: { value: string }) =>
													Number(value) <= 0
														? t('validation.periodPayGreaterThanZero')
														: undefined,
											}}
										>
											{(field: any) => (
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
									{canManageDualPayrollCompensation && isEditMode ? (
										<EmployeeDualPayrollCompensationPanel
											title={t('compensation.title')}
											subtitle={t('compensation.subtitle')}
											field={
												<form.AppField
													name="fiscalDailyPay"
													validators={{
														onChange: ({
															value,
														}: {
															value: string;
														}) => {
															const trimmed = value.trim();
															if (trimmed === '') {
																return undefined;
															}
															const parsed = Number(trimmed);
															if (
																!Number.isFinite(parsed) ||
																parsed <= 0
															) {
																return t(
																	'validation.fiscalDailyPay',
																);
															}
															if (parsed >= computedDailyPay) {
																return t(
																	'validation.fiscalDailyPayLessThanDailyPay',
																);
															}
															return undefined;
														},
													}}
												>
													{(field: any) => (
														<field.TextField
															label={t('fields.fiscalDailyPay')}
															placeholder={t(
																'placeholders.fiscalDailyPay',
															)}
															type="number"
															description={t(
																'helpers.fiscalDailyPay',
															)}
														/>
													)}
												</form.AppField>
											}
											feedback={t(fiscalDailyPayPreviewFeedbackKey)}
											feedbackTone={
												fiscalDailyPayPreviewFeedbackKey ===
												'compensation.liveHelper'
													? 'helper'
													: 'error'
											}
											previewTitle={t('compensation.previewTitle')}
											realDailyPayLabel={t('compensation.realDailyPay')}
											realDailyPayValue={formatCurrency(computedDailyPay)}
											fiscalDailyPayLabel={t('compensation.fiscalDailyPay')}
											fiscalDailyPayValue={
												typeof parsedFiscalDailyPayPreview === 'number'
													? formatCurrency(parsedFiscalDailyPayPreview)
													: tCommon('notAvailable')
											}
											dailyComplementLabel={t('compensation.dailyComplement')}
											dailyComplementValue={formatCurrency(
												fiscalDailyComplementPreview,
											)}
										/>
									) : null}
									<div className="col-span-2 min-[1025px]:col-span-1">
										<form.AppField
											name="sbcDailyOverride"
											validators={{
												onChange: ({ value }: { value: string }) => {
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
											{(field: any) => (
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
										<div className="grid gap-4 min-[1025px]:grid-cols-2">
											<form.AppField name="employmentType">
												{(field: any) => (
													<field.SelectField
														label={t('fields.employmentType')}
														options={employmentTypeOptions.map(
															(option) => ({
																value: option.value,
																label: t(option.labelKey),
															}),
														)}
														placeholder={t(
															'placeholders.selectEmploymentType',
														)}
													/>
												)}
											</form.AppField>
											<form.AppField name="ptuEligibilityOverride">
												{(field: any) => (
													<field.SelectField
														label={t('fields.ptuEligibilityOverride')}
														options={ptuEligibilityOptions.map(
															(option) => ({
																value: option.value,
																label: t(option.labelKey),
															}),
														)}
														placeholder={t(
															'placeholders.selectPtuEligibility',
														)}
													/>
												)}
											</form.AppField>
											<form.AppField
												name="aguinaldoDaysOverride"
												validators={{
													onChange: ({ value }: { value: string }) => {
														const trimmed = value.trim();
														if (!trimmed) {
															return undefined;
														}
														const parsed = Number(trimmed);
														if (
															!Number.isFinite(parsed) ||
															parsed < 0
														) {
															return t(
																'validation.aguinaldoDaysOverride',
															);
														}
														return undefined;
													},
												}}
											>
												{(field: any) => (
													<field.TextField
														label={t('fields.aguinaldoDaysOverride')}
														placeholder={t(
															'placeholders.aguinaldoDaysOverride',
														)}
														type="number"
														description={t(
															'helpers.aguinaldoDaysOverride',
														)}
													/>
												)}
											</form.AppField>
											<form.AppField
												name="platformHoursYear"
												validators={{
													onChange: ({ value }: { value: string }) => {
														const trimmed = value.trim();
														if (!trimmed) {
															return undefined;
														}
														const parsed = Number(trimmed);
														if (
															!Number.isFinite(parsed) ||
															parsed < 0
														) {
															return t(
																'validation.platformHoursYear',
															);
														}
														return undefined;
													},
												}}
											>
												{(field: any) => (
													<field.TextField
														label={t('fields.platformHoursYear')}
														placeholder={t(
															'placeholders.platformHoursYear',
														)}
														type="number"
														description={t('helpers.platformHoursYear')}
													/>
												)}
											</form.AppField>
										</div>
										<div className="grid gap-3 min-[1025px]:grid-cols-2">
											<form.AppField name="isTrustEmployee">
												{(field: any) => (
													<field.ToggleField
														label={t('fields.isTrustEmployee')}
														description={t('helpers.isTrustEmployee')}
														orientation="vertical"
													/>
												)}
											</form.AppField>
											<form.AppField name="isDirectorAdminGeneralManager">
												{(field: any) => (
													<field.ToggleField
														label={t(
															'fields.isDirectorAdminGeneralManager',
														)}
														description={t(
															'helpers.isDirectorAdminGeneralManager',
														)}
														orientation="vertical"
													/>
												)}
											</form.AppField>
											<form.AppField name="isDomesticWorker">
												{(field: any) => (
													<field.ToggleField
														label={t('fields.isDomesticWorker')}
														description={t('helpers.isDomesticWorker')}
														orientation="vertical"
													/>
												)}
											</form.AppField>
											<form.AppField name="isPlatformWorker">
												{(field: any) => (
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
													disabled={
														ptuHistoryMutation.isPending ||
														!activeEmployee
													}
												>
													{ptuHistoryMutation.isPending
														? tCommon('saving')
														: t('ptuHistory.actions.save')}
												</Button>
											</div>
											<div className="mt-3 grid gap-3 min-[1025px]:grid-cols-2">
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
															setPtuHistoryYearInput(
																event.target.value,
															)
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
															setPtuHistoryAmountInput(
																event.target.value,
															)
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
														{ptuHistoryError ? (
															<TableRow>
																<TableCell colSpan={2}>
																	<div className="flex items-center justify-between gap-3 py-2">
																		<p className="text-sm text-muted-foreground">
																			{t(
																				'ptuHistory.partialError',
																			)}
																		</p>
																		<Button
																			variant="outline"
																			size="sm"
																			onClick={() =>
																				void refetchPtuHistory()
																			}
																		>
																			{tCommon('retry')}
																		</Button>
																	</div>
																</TableCell>
															</TableRow>
														) : isLoadingPtuHistory ? (
															<TableRow>
																<TableCell colSpan={2}>
																	<Skeleton className="h-4 w-full" />
																</TableCell>
															</TableRow>
														) : ptuHistory.length === 0 ? (
															<TableRow>
																<TableCell
																	colSpan={2}
																	className="h-12 text-center text-xs text-muted-foreground"
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
																		{formatCurrency(
																			entry.amount,
																		)}
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
				</div>
			</DialogContent>
		</Dialog>
	);
}
