'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	CircleAlert,
	CircleDollarSign,
	HandCoins,
	Landmark,
	PauseCircle,
	PlayCircle,
	Plus,
	WalletCards,
	XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
	createEmployeeDeductionAction,
	updateEmployeeDeductionAction,
	type CreateEmployeeDeductionInput,
	type UpdateEmployeeDeductionInput,
} from '@/actions/employee-deductions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
	type EmployeeDeduction,
	fetchEmployeeDeductionsList,
	fetchEmployeesList,
	fetchOrganizationDeductionsList,
} from '@/lib/client-functions';
import { useOrgContext } from '@/lib/org-client-context';
import {
	type EmployeeDeductionStatus,
	type EmployeeDeductionType,
	mutationKeys,
	queryKeys,
} from '@/lib/query-keys';
import { cn } from '@/lib/utils';

const ALL_FILTER_VALUE = '__all__';
const DEFAULT_PAGE_SIZE = 20;
const EMPLOYEE_QUERY_LIMIT = 100;

type DeductionCalculationMethod = EmployeeDeduction['calculationMethod'];
type DeductionFrequency = EmployeeDeduction['frequency'];
type ManagerMode = 'employee' | 'organization';
type TranslationFn = ReturnType<typeof useTranslations>;

interface EmployeeDeductionsManagerProps {
	/** Rendering mode for the manager. */
	mode: ManagerMode;
	/** Active employee identifier for employee-scoped mode. */
	employeeId?: string;
	/** Optional employee display name for subtitles. */
	employeeName?: string;
}

interface DeductionFormState {
	employeeId: string;
	type: EmployeeDeductionType;
	label: string;
	calculationMethod: DeductionCalculationMethod;
	value: string;
	frequency: DeductionFrequency;
	totalInstallments: string;
	totalAmount: string;
	remainingAmount: string;
	startDateKey: string;
	endDateKey: string;
	referenceNumber: string;
	satDeductionCode: string;
	notes: string;
}

interface DeductionSummaryCard {
	key: string;
	label: string;
	value: string;
	tone: 'accent' | 'success' | 'warning';
	icon: React.ComponentType<{ className?: string }>;
}

/**
 * Formats a numeric value as MXN currency.
 *
 * @param value - Numeric amount in MXN
 * @returns Formatted currency string
 */
function formatCurrency(value: number): string {
	return new Intl.NumberFormat('es-MX', {
		style: 'currency',
		currency: 'MXN',
		maximumFractionDigits: 2,
	}).format(value);
}

/**
 * Returns today's date in YYYY-MM-DD format.
 *
 * @returns Date key string
 */
function getTodayDateKey(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * Creates the default form state for a new deduction.
 *
 * @param employeeId - Optional preselected employee id
 * @returns Initial form state
 */
function createDefaultFormState(employeeId?: string): DeductionFormState {
	return {
		employeeId: employeeId ?? '',
		type: 'OTHER',
		label: '',
		calculationMethod: 'FIXED_AMOUNT',
		value: '',
		frequency: 'RECURRING',
		totalInstallments: '',
		totalAmount: '',
		remainingAmount: '',
		startDateKey: getTodayDateKey(),
		endDateKey: '',
		referenceNumber: '',
		satDeductionCode: '',
		notes: '',
	};
}

/**
 * Resolves whether the current user can manage deductions.
 *
 * @param organizationRole - Active organization role
 * @param userRole - Platform role
 * @returns True when creation and mutation actions should be enabled
 */
function canManageDeductions(
	organizationRole: 'admin' | 'owner' | 'member' | null | undefined,
	userRole: string | undefined,
): boolean {
	return userRole === 'admin' || organizationRole === 'admin' || organizationRole === 'owner';
}

/**
 * Returns the supported calculation methods for the selected deduction type.
 *
 * @param type - Deduction type
 * @returns Supported calculation methods list
 */
function getAllowedCalculationMethods(type: EmployeeDeductionType): DeductionCalculationMethod[] {
	switch (type) {
		case 'INFONAVIT':
			return ['PERCENTAGE_SBC', 'FIXED_AMOUNT', 'VSM_FACTOR'];
		case 'ALIMONY':
			return ['PERCENTAGE_NET', 'FIXED_AMOUNT'];
		case 'LOAN':
		case 'ADVANCE':
			return ['FIXED_AMOUNT'];
		default:
			return [
				'PERCENTAGE_SBC',
				'PERCENTAGE_NET',
				'PERCENTAGE_GROSS',
				'FIXED_AMOUNT',
				'VSM_FACTOR',
			];
	}
}

/**
 * Returns the supported frequencies for the selected deduction type.
 *
 * @param type - Deduction type
 * @returns Supported frequencies list
 */
function getAllowedFrequencies(type: EmployeeDeductionType): DeductionFrequency[] {
	if (type === 'LOAN' || type === 'ADVANCE') {
		return ['INSTALLMENTS', 'ONE_TIME'];
	}

	return ['RECURRING', 'ONE_TIME', 'INSTALLMENTS'];
}

/**
 * Narrows an arbitrary filter string to a supported deduction status.
 *
 * @param value - Raw filter value
 * @returns Deduction status when supported, otherwise undefined
 */
function parseDeductionStatus(value: string): EmployeeDeductionStatus | undefined {
	return value === 'ACTIVE' ||
		value === 'PAUSED' ||
		value === 'COMPLETED' ||
		value === 'CANCELLED'
		? value
		: undefined;
}

/**
 * Narrows an arbitrary filter string to a supported deduction type.
 *
 * @param value - Raw filter value
 * @returns Deduction type when supported, otherwise undefined
 */
function parseDeductionType(value: string): EmployeeDeductionType | undefined {
	return value === 'INFONAVIT' ||
		value === 'ALIMONY' ||
		value === 'FONACOT' ||
		value === 'LOAN' ||
		value === 'UNION_FEE' ||
		value === 'ADVANCE' ||
		value === 'OTHER'
		? value
		: undefined;
}

/**
 * Resolves the badge variant for a deduction status.
 *
 * @param status - Deduction lifecycle status
 * @returns Badge variant name
 */
function getStatusVariant(
	status: EmployeeDeductionStatus,
): 'success' | 'warning' | 'neutral' | 'error' {
	switch (status) {
		case 'ACTIVE':
			return 'success';
		case 'PAUSED':
			return 'warning';
		case 'CANCELLED':
			return 'error';
		case 'COMPLETED':
		default:
			return 'neutral';
	}
}

/**
 * Formats a configured deduction value according to its method.
 *
 * @param deduction - Deduction row
 * @param t - Translation function
 * @returns Human-readable value label
 */
function formatConfiguredValue(deduction: EmployeeDeduction, t: TranslationFn): string {
	switch (deduction.calculationMethod) {
		case 'PERCENTAGE_SBC':
		case 'PERCENTAGE_NET':
		case 'PERCENTAGE_GROSS':
			return t('table.valueFormats.percentage', {
				value: deduction.value.toFixed(2),
			});
		case 'VSM_FACTOR':
			return t('table.valueFormats.vsmFactor', {
				value: deduction.value.toFixed(4),
			});
		case 'FIXED_AMOUNT':
		default:
			return formatCurrency(deduction.value);
	}
}

/**
 * Returns progress metrics for installment deductions.
 *
 * @param deduction - Deduction row
 * @returns Progress ratio and text data
 */
function getInstallmentProgress(deduction: EmployeeDeduction): {
	progress: number;
	hasInstallments: boolean;
} {
	if (
		deduction.frequency !== 'INSTALLMENTS' ||
		!deduction.totalInstallments ||
		deduction.totalInstallments <= 0
	) {
		return { progress: 0, hasInstallments: false };
	}

	return {
		progress: Math.min(
			100,
			Math.max(0, (deduction.completedInstallments / deduction.totalInstallments) * 100),
		),
		hasInstallments: true,
	};
}

/**
 * Parses a positive numeric input string into a number.
 *
 * @param value - Raw input string
 * @returns Parsed number or null when empty/invalid
 */
function parseNumberInput(value: string): number | null {
	if (!value.trim()) {
		return null;
	}

	const parsedValue = Number(value);
	return Number.isFinite(parsedValue) ? parsedValue : null;
}

/**
 * Normalizes an optional text input to undefined/null depending on emptiness.
 *
 * @param value - Raw text input
 * @param nullWhenEmpty - Whether empty values should become null
 * @returns Trimmed value or null/undefined when empty
 */
function normalizeOptionalText(value: string, nullWhenEmpty = false): string | null | undefined {
	const trimmedValue = value.trim();
	if (!trimmedValue) {
		return nullWhenEmpty ? null : undefined;
	}

	return trimmedValue;
}

/**
 * Returns a compact subtitle for the selected rendering mode.
 *
 * @param mode - Manager rendering mode
 * @param employeeName - Optional employee display name
 * @param t - Translation function
 * @returns Subtitle string
 */
function getManagerSubtitle(
	mode: ManagerMode,
	employeeName: string | undefined,
	t: TranslationFn,
): string {
	if (mode === 'employee' && employeeName) {
		return t('hero.employeeSubtitle', { name: employeeName });
	}

	if (mode === 'employee') {
		return t('hero.employeeSubtitleFallback');
	}

	return t('hero.organizationSubtitle');
}

/**
 * Employee deductions management screen.
 *
 * @param props - Component props
 * @returns Deductions management UI
 */
export function EmployeeDeductionsManager({
	mode,
	employeeId,
	employeeName,
}: EmployeeDeductionsManagerProps): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId, organizationRole, userRole } = useOrgContext();
	const t = useTranslations('EmployeeDeductions');
	const tCommon = useTranslations('Common');
	const canManage = canManageDeductions(organizationRole, userRole);
	const isEmployeeMode = mode === 'employee';

	const [statusFilter, setStatusFilter] = useState<string>(ALL_FILTER_VALUE);
	const [typeFilter, setTypeFilter] = useState<string>(ALL_FILTER_VALUE);
	const [employeeFilter, setEmployeeFilter] = useState<string>(ALL_FILTER_VALUE);
	const [pageIndex, setPageIndex] = useState<number>(0);
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState<boolean>(false);
	const [formState, setFormState] = useState<DeductionFormState>(() =>
		createDefaultFormState(employeeId),
	);

	const allowedMethods = useMemo(
		() => getAllowedCalculationMethods(formState.type),
		[formState.type],
	);
	const allowedFrequencies = useMemo(
		() => getAllowedFrequencies(formState.type),
		[formState.type],
	);

	const employeeListQueryParams = useMemo(
		() =>
			organizationId
				? {
						organizationId,
						limit: EMPLOYEE_QUERY_LIMIT,
						offset: 0,
					}
				: undefined,
		[organizationId],
	);

	const employeeDeductionsQueryParams = useMemo<
		| {
				organizationId: string;
				employeeId: string;
				status?: EmployeeDeductionStatus;
				type?: EmployeeDeductionType;
		  }
		| undefined
	>(() => {
		if (!organizationId || !employeeId) {
			return undefined;
		}

		return {
			organizationId,
			employeeId,
			status: parseDeductionStatus(statusFilter),
			type: parseDeductionType(typeFilter),
		};
	}, [employeeId, organizationId, statusFilter, typeFilter]);

	const organizationDeductionsQueryParams = useMemo<
		| {
				organizationId: string;
				limit: number;
				offset: number;
				employeeId?: string;
				status?: EmployeeDeductionStatus;
				type?: EmployeeDeductionType;
		  }
		| undefined
	>(() => {
		if (!organizationId || isEmployeeMode) {
			return undefined;
		}

		return {
			organizationId,
			limit: DEFAULT_PAGE_SIZE,
			offset: pageIndex * DEFAULT_PAGE_SIZE,
			employeeId: employeeFilter !== ALL_FILTER_VALUE ? employeeFilter : undefined,
			status: parseDeductionStatus(statusFilter),
			type: parseDeductionType(typeFilter),
		};
	}, [employeeFilter, isEmployeeMode, organizationId, pageIndex, statusFilter, typeFilter]);

	const employeesQuery = useQuery({
		queryKey: queryKeys.employees.list(employeeListQueryParams),
		queryFn: () => fetchEmployeesList(employeeListQueryParams),
		enabled: Boolean(organizationId),
	});

	const employeeDeductionsQuery = useQuery({
		queryKey: employeeDeductionsQueryParams
			? queryKeys.employeeDeductions.employee(employeeDeductionsQueryParams)
			: queryKeys.employeeDeductions.all,
		queryFn: () => fetchEmployeeDeductionsList(employeeDeductionsQueryParams),
		enabled: Boolean(isEmployeeMode && employeeDeductionsQueryParams),
	});

	const organizationDeductionsQuery = useQuery({
		queryKey: queryKeys.employeeDeductions.organization(organizationDeductionsQueryParams),
		queryFn: () => fetchOrganizationDeductionsList(organizationDeductionsQueryParams),
		enabled: Boolean(!isEmployeeMode && organizationDeductionsQueryParams),
	});

	const employees = employeesQuery.data?.data ?? [];
	const deductionRows = useMemo(
		() =>
			isEmployeeMode
				? (employeeDeductionsQuery.data ?? [])
				: (organizationDeductionsQuery.data?.data ?? []),
		[employeeDeductionsQuery.data, isEmployeeMode, organizationDeductionsQuery.data?.data],
	);
	const pagination = organizationDeductionsQuery.data?.pagination ?? {
		total: 0,
		limit: DEFAULT_PAGE_SIZE,
		offset: pageIndex * DEFAULT_PAGE_SIZE,
	};
	const isLoading = isEmployeeMode
		? employeeDeductionsQuery.isLoading
		: organizationDeductionsQuery.isLoading;
	const listError = isEmployeeMode
		? employeeDeductionsQuery.error
		: organizationDeductionsQuery.error;

	const summaryCards = useMemo<DeductionSummaryCard[]>(() => {
		const activeRows = deductionRows.filter((row) => row.status === 'ACTIVE');
		const activeTotal = activeRows.reduce((total, row) => total + row.value, 0);
		const pendingPrincipal = deductionRows.reduce(
			(total, row) => total + (row.remainingAmount ?? 0),
			0,
		);
		const installmentsInProgress = deductionRows.filter(
			(row) =>
				row.frequency === 'INSTALLMENTS' &&
				row.status !== 'COMPLETED' &&
				row.status !== 'CANCELLED',
		).length;

		return [
			{
				key: 'active',
				label: t('summary.activeDiscounts'),
				value: t('summary.countValue', { count: activeRows.length }),
				tone: 'accent',
				icon: Landmark,
			},
			{
				key: 'configured',
				label: t('summary.configuredTotal'),
				value: formatCurrency(activeTotal),
				tone: 'success',
				icon: CircleDollarSign,
			},
			{
				key: 'pending',
				label: t('summary.pendingPrincipal'),
				value:
					pendingPrincipal > 0
						? formatCurrency(pendingPrincipal)
						: t('summary.noPendingPrincipal'),
				tone: 'warning',
				icon: WalletCards,
			},
			{
				key: 'installments',
				label: t('summary.installmentsInProgress'),
				value: t('summary.countValue', { count: installmentsInProgress }),
				tone: 'accent',
				icon: HandCoins,
			},
		];
	}, [deductionRows, t]);

	const totalsByType = useMemo(() => {
		const summaryMap = new Map<
			EmployeeDeductionType,
			{ count: number; remainingAmount: number; activeCount: number }
		>();

		for (const deduction of deductionRows) {
			const currentValue = summaryMap.get(deduction.type) ?? {
				count: 0,
				remainingAmount: 0,
				activeCount: 0,
			};
			currentValue.count += 1;
			currentValue.remainingAmount += deduction.remainingAmount ?? 0;
			currentValue.activeCount += deduction.status === 'ACTIVE' ? 1 : 0;
			summaryMap.set(deduction.type, currentValue);
		}

		return Array.from(summaryMap.entries());
	}, [deductionRows]);

	const createMutation = useMutation({
		mutationKey: mutationKeys.employeeDeductions.create,
		mutationFn: createEmployeeDeductionAction,
		onSuccess: (result) => {
			if (!result.success) {
				toast.error(result.error ?? t('toast.createError'));
				return;
			}

			toast.success(t('toast.createSuccess'));
			setIsCreateDialogOpen(false);
			setFormState(createDefaultFormState(isEmployeeMode ? employeeId : undefined));
			queryClient.invalidateQueries({ queryKey: queryKeys.employeeDeductions.all });
		},
		onError: () => {
			toast.error(t('toast.createError'));
		},
	});

	const statusMutation = useMutation({
		mutationKey: mutationKeys.employeeDeductions.update,
		mutationFn: updateEmployeeDeductionAction,
		onSuccess: (result) => {
			if (!result.success) {
				toast.error(result.error ?? t('toast.updateError'));
				return;
			}

			toast.success(t('toast.updateSuccess'));
			queryClient.invalidateQueries({ queryKey: queryKeys.employeeDeductions.all });
		},
		onError: () => {
			toast.error(t('toast.updateError'));
		},
	});

	/**
	 * Resets the create dialog form to its default values.
	 *
	 * @returns Nothing
	 */
	function resetCreateDialog(): void {
		setFormState(createDefaultFormState(isEmployeeMode ? employeeId : undefined));
	}

	/**
	 * Updates a single form field.
	 *
	 * @param key - Form field key
	 * @param value - Next field value
	 * @returns Nothing
	 */
	function updateFormField<Key extends keyof DeductionFormState>(
		key: Key,
		value: DeductionFormState[Key],
	): void {
		setFormState((currentState) => ({
			...currentState,
			[key]: value,
		}));
	}

	/**
	 * Applies the side effects of changing deduction type in the form.
	 *
	 * @param type - Next deduction type
	 * @returns Nothing
	 */
	function handleTypeChange(type: EmployeeDeductionType): void {
		const nextAllowedMethods = getAllowedCalculationMethods(type);
		const nextAllowedFrequencies = getAllowedFrequencies(type);

		setFormState((currentState) => ({
			...currentState,
			type,
			calculationMethod: nextAllowedMethods.includes(currentState.calculationMethod)
				? currentState.calculationMethod
				: (nextAllowedMethods[0] ?? 'FIXED_AMOUNT'),
			frequency: nextAllowedFrequencies.includes(currentState.frequency)
				? currentState.frequency
				: (nextAllowedFrequencies[0] ?? 'RECURRING'),
		}));
	}

	/**
	 * Validates and dispatches the create deduction mutation.
	 *
	 * @returns Nothing
	 */
	function handleCreateDeduction(): void {
		if (!organizationId || createMutation.isPending) {
			return;
		}

		const targetEmployeeId = isEmployeeMode ? employeeId : formState.employeeId;
		if (!targetEmployeeId) {
			toast.error(t('validation.employeeRequired'));
			return;
		}

		if (!formState.label.trim()) {
			toast.error(t('validation.labelRequired'));
			return;
		}

		const parsedValue = parseNumberInput(formState.value);
		if (parsedValue === null || parsedValue <= 0) {
			toast.error(t('validation.valueRequired'));
			return;
		}

		if (!formState.startDateKey.trim()) {
			toast.error(t('validation.startDateRequired'));
			return;
		}

		if (formState.endDateKey.trim() && formState.endDateKey < formState.startDateKey) {
			toast.error(t('validation.endDateAfterStart'));
			return;
		}

		const parsedInstallments = parseNumberInput(formState.totalInstallments);
		const parsedTotalAmount = parseNumberInput(formState.totalAmount);
		const parsedRemainingAmount = parseNumberInput(formState.remainingAmount);

		if (formState.frequency === 'INSTALLMENTS') {
			if (parsedInstallments === null || parsedInstallments <= 0) {
				toast.error(t('validation.installmentsRequired'));
				return;
			}

			if (
				(formState.type === 'LOAN' || formState.type === 'ADVANCE') &&
				(parsedTotalAmount === null || parsedTotalAmount <= 0)
			) {
				toast.error(t('validation.totalAmountRequired'));
				return;
			}
		}

		const payload: CreateEmployeeDeductionInput = {
			organizationId,
			employeeId: targetEmployeeId,
			type: formState.type,
			label: formState.label,
			calculationMethod: formState.calculationMethod,
			value: parsedValue,
			frequency: formState.frequency,
			totalInstallments:
				formState.frequency === 'INSTALLMENTS' && parsedInstallments !== null
					? parsedInstallments
					: undefined,
			totalAmount: parsedTotalAmount ?? undefined,
			remainingAmount: parsedRemainingAmount ?? undefined,
			startDateKey: formState.startDateKey,
			endDateKey: normalizeOptionalText(formState.endDateKey) as string | undefined,
			referenceNumber: normalizeOptionalText(formState.referenceNumber) as string | undefined,
			satDeductionCode: normalizeOptionalText(formState.satDeductionCode) as
				| string
				| undefined,
			notes: normalizeOptionalText(formState.notes) as string | undefined,
		};

		createMutation.mutate(payload);
	}

	/**
	 * Applies a status transition to a deduction row.
	 *
	 * @param deduction - Target deduction row
	 * @param status - Requested next status
	 * @returns Nothing
	 */
	function handleStatusChange(
		deduction: EmployeeDeduction,
		status: UpdateEmployeeDeductionInput['status'],
	): void {
		if (!organizationId || !status || statusMutation.isPending) {
			return;
		}

		statusMutation.mutate({
			organizationId,
			employeeId: deduction.employeeId,
			id: deduction.id,
			status,
		});
	}

	const totalPages = Math.max(1, Math.ceil(pagination.total / Math.max(pagination.limit, 1)));

	return (
		<div className="space-y-5">
			<section className="overflow-hidden rounded-3xl border border-[var(--accent-primary)]/20 bg-gradient-to-br from-[var(--accent-primary-bg)] via-background to-background shadow-sm">
				<div className="grid gap-5 px-5 py-5 lg:grid-cols-[1.2fr_0.8fr] lg:px-6">
					<div className="space-y-3">
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="accent">{t('hero.badge')}</Badge>
							{canManage ? (
								<Badge variant="neutral">{t('hero.adminReady')}</Badge>
							) : (
								<Badge variant="neutral">{t('hero.readOnly')}</Badge>
							)}
						</div>
						<div className="space-y-1">
							<h2 className="font-serif text-2xl tracking-tight text-foreground">
								{t('hero.title')}
							</h2>
							<p className="max-w-2xl text-sm text-muted-foreground">
								{getManagerSubtitle(mode, employeeName, t)}
							</p>
						</div>
						<div className="flex flex-wrap gap-3">
							{summaryCards.slice(0, 2).map((card) => (
								<div
									key={card.key}
									className="min-w-44 rounded-2xl border border-border/70 bg-background/90 px-4 py-3 shadow-xs backdrop-blur"
								>
									<div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
										<card.icon className="h-3.5 w-3.5" />
										<span>{card.label}</span>
									</div>
									<p className="mt-2 text-lg font-semibold text-foreground">
										{card.value}
									</p>
								</div>
							))}
						</div>
					</div>

					<div className="grid gap-3 sm:grid-cols-2">
						{summaryCards.slice(2).map((card) => (
							<div
								key={card.key}
								className={cn(
									'rounded-2xl border px-4 py-4 shadow-xs',
									card.tone === 'success' &&
										'border-[var(--status-success)]/20 bg-[var(--status-success-bg)]/70',
									card.tone === 'warning' &&
										'border-[var(--status-warning)]/20 bg-[var(--status-warning-bg)]/70',
									card.tone === 'accent' &&
										'border-[var(--accent-primary)]/20 bg-background/80',
								)}
							>
								<div className="flex items-center justify-between gap-3">
									<div>
										<p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
											{card.label}
										</p>
										<p className="mt-2 text-lg font-semibold text-foreground">
											{card.value}
										</p>
									</div>
									<div className="rounded-full border border-border/60 bg-background/80 p-2">
										<card.icon className="h-4 w-4 text-foreground" />
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			</section>

			<div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
				<div className="grid gap-3 rounded-3xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-3">
					<div className="space-y-2">
						<Label>{t('filters.type')}</Label>
						<Select
							value={typeFilter}
							onValueChange={(value) => {
								setTypeFilter(value);
								setPageIndex(0);
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder={t('filters.type')} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_FILTER_VALUE}>
									{t('filters.allTypes')}
								</SelectItem>
								<SelectItem value="INFONAVIT">{t('types.INFONAVIT')}</SelectItem>
								<SelectItem value="ALIMONY">{t('types.ALIMONY')}</SelectItem>
								<SelectItem value="FONACOT">{t('types.FONACOT')}</SelectItem>
								<SelectItem value="LOAN">{t('types.LOAN')}</SelectItem>
								<SelectItem value="UNION_FEE">{t('types.UNION_FEE')}</SelectItem>
								<SelectItem value="ADVANCE">{t('types.ADVANCE')}</SelectItem>
								<SelectItem value="OTHER">{t('types.OTHER')}</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label>{t('filters.status')}</Label>
						<Select
							value={statusFilter}
							onValueChange={(value) => {
								setStatusFilter(value);
								setPageIndex(0);
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder={t('filters.status')} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_FILTER_VALUE}>
									{t('filters.allStatuses')}
								</SelectItem>
								<SelectItem value="ACTIVE">{t('status.ACTIVE')}</SelectItem>
								<SelectItem value="PAUSED">{t('status.PAUSED')}</SelectItem>
								<SelectItem value="COMPLETED">{t('status.COMPLETED')}</SelectItem>
								<SelectItem value="CANCELLED">{t('status.CANCELLED')}</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{!isEmployeeMode ? (
						<div className="space-y-2">
							<Label>{t('filters.employee')}</Label>
							<Select
								value={employeeFilter}
								onValueChange={(value) => {
									setEmployeeFilter(value);
									setPageIndex(0);
								}}
							>
								<SelectTrigger>
									<SelectValue placeholder={t('filters.employee')} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ALL_FILTER_VALUE}>
										{t('filters.allEmployees')}
									</SelectItem>
									{employees.map((employee) => (
										<SelectItem key={employee.id} value={employee.id}>
											{employee.firstName} {employee.lastName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					) : null}
				</div>

				{canManage ? (
					<Dialog
						open={isCreateDialogOpen}
						onOpenChange={(open) => {
							setIsCreateDialogOpen(open);
							if (!open) {
								resetCreateDialog();
							}
						}}
					>
						<DialogTrigger asChild>
							<Button className="h-11 rounded-full px-5">
								<Plus className="mr-2 h-4 w-4" />
								{t('actions.add')}
							</Button>
						</DialogTrigger>
						<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
							<DialogHeader>
								<DialogTitle>{t('createDialog.title')}</DialogTitle>
								<DialogDescription>
									{t('createDialog.description')}
								</DialogDescription>
							</DialogHeader>

							<div className="grid gap-4 py-2 md:grid-cols-2">
								{!isEmployeeMode ? (
									<div className="space-y-2 md:col-span-2">
										<Label htmlFor="deduction-employee">
											{t('form.employee')}
										</Label>
										<Select
											value={formState.employeeId}
											onValueChange={(value) =>
												updateFormField('employeeId', value)
											}
										>
											<SelectTrigger id="deduction-employee">
												<SelectValue
													placeholder={t('form.employeePlaceholder')}
												/>
											</SelectTrigger>
											<SelectContent>
												{employees.map((employee) => (
													<SelectItem
														key={employee.id}
														value={employee.id}
													>
														{employee.firstName} {employee.lastName}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								) : null}

								<div className="space-y-2">
									<Label htmlFor="deduction-type">{t('form.type')}</Label>
									<Select
										value={formState.type}
										onValueChange={(value) =>
											handleTypeChange(value as EmployeeDeductionType)
										}
									>
										<SelectTrigger id="deduction-type">
											<SelectValue placeholder={t('form.type')} />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="INFONAVIT">
												{t('types.INFONAVIT')}
											</SelectItem>
											<SelectItem value="ALIMONY">
												{t('types.ALIMONY')}
											</SelectItem>
											<SelectItem value="FONACOT">
												{t('types.FONACOT')}
											</SelectItem>
											<SelectItem value="LOAN">{t('types.LOAN')}</SelectItem>
											<SelectItem value="UNION_FEE">
												{t('types.UNION_FEE')}
											</SelectItem>
											<SelectItem value="ADVANCE">
												{t('types.ADVANCE')}
											</SelectItem>
											<SelectItem value="OTHER">
												{t('types.OTHER')}
											</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label htmlFor="deduction-label">{t('form.label')}</Label>
									<Input
										id="deduction-label"
										value={formState.label}
										onChange={(event) =>
											updateFormField('label', event.target.value)
										}
										placeholder={t(`form.labelPlaceholders.${formState.type}`)}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="deduction-method">
										{t('form.calculationMethod')}
									</Label>
									<Select
										value={formState.calculationMethod}
										onValueChange={(value) =>
											updateFormField(
												'calculationMethod',
												value as DeductionCalculationMethod,
											)
										}
									>
										<SelectTrigger id="deduction-method">
											<SelectValue
												placeholder={t('form.calculationMethod')}
											/>
										</SelectTrigger>
										<SelectContent>
											{allowedMethods.map((method) => (
												<SelectItem key={method} value={method}>
													{t(`calculationMethods.${method}`)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label htmlFor="deduction-frequency">
										{t('form.frequency')}
									</Label>
									<Select
										value={formState.frequency}
										onValueChange={(value) =>
											updateFormField(
												'frequency',
												value as DeductionFrequency,
											)
										}
									>
										<SelectTrigger id="deduction-frequency">
											<SelectValue placeholder={t('form.frequency')} />
										</SelectTrigger>
										<SelectContent>
											{allowedFrequencies.map((frequency) => (
												<SelectItem key={frequency} value={frequency}>
													{t(`frequencies.${frequency}`)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label htmlFor="deduction-value">{t('form.value')}</Label>
									<Input
										id="deduction-value"
										type="number"
										min="0"
										step="0.0001"
										value={formState.value}
										onChange={(event) =>
											updateFormField('value', event.target.value)
										}
										placeholder={t(
											`form.valuePlaceholders.${formState.calculationMethod}`,
										)}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="deduction-reference">
										{t(`form.referenceLabels.${formState.type}`)}
									</Label>
									<Input
										id="deduction-reference"
										value={formState.referenceNumber}
										onChange={(event) =>
											updateFormField('referenceNumber', event.target.value)
										}
										placeholder={t(
											`form.referencePlaceholders.${formState.type}`,
										)}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="deduction-start">{t('form.startDate')}</Label>
									<Input
										id="deduction-start"
										type="date"
										value={formState.startDateKey}
										onChange={(event) =>
											updateFormField('startDateKey', event.target.value)
										}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="deduction-end">{t('form.endDate')}</Label>
									<Input
										id="deduction-end"
										type="date"
										value={formState.endDateKey}
										onChange={(event) =>
											updateFormField('endDateKey', event.target.value)
										}
									/>
								</div>

								{formState.frequency === 'INSTALLMENTS' ? (
									<>
										<div className="space-y-2">
											<Label htmlFor="deduction-total-installments">
												{t('form.totalInstallments')}
											</Label>
											<Input
												id="deduction-total-installments"
												type="number"
												min="1"
												step="1"
												value={formState.totalInstallments}
												onChange={(event) =>
													updateFormField(
														'totalInstallments',
														event.target.value,
													)
												}
												placeholder={t('form.totalInstallmentsPlaceholder')}
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor="deduction-total-amount">
												{t('form.totalAmount')}
											</Label>
											<Input
												id="deduction-total-amount"
												type="number"
												min="0"
												step="0.01"
												value={formState.totalAmount}
												onChange={(event) =>
													updateFormField(
														'totalAmount',
														event.target.value,
													)
												}
												placeholder={t('form.totalAmountPlaceholder')}
											/>
										</div>
									</>
								) : null}

								<div className="space-y-2">
									<Label htmlFor="deduction-remaining">
										{t('form.remainingAmount')}
									</Label>
									<Input
										id="deduction-remaining"
										type="number"
										min="0"
										step="0.01"
										value={formState.remainingAmount}
										onChange={(event) =>
											updateFormField('remainingAmount', event.target.value)
										}
										placeholder={t('form.remainingAmountPlaceholder')}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="deduction-sat-code">{t('form.satCode')}</Label>
									<Input
										id="deduction-sat-code"
										value={formState.satDeductionCode}
										onChange={(event) =>
											updateFormField('satDeductionCode', event.target.value)
										}
										placeholder={t('form.satCodePlaceholder')}
									/>
								</div>

								<div className="space-y-2 md:col-span-2">
									<Label htmlFor="deduction-notes">{t('form.notes')}</Label>
									<Textarea
										id="deduction-notes"
										value={formState.notes}
										onChange={(event) =>
											updateFormField('notes', event.target.value)
										}
										placeholder={t('form.notesPlaceholder')}
										rows={4}
									/>
								</div>
							</div>

							<DialogFooter className="gap-2 sm:justify-between">
								<p className="text-xs text-muted-foreground">
									{t(`form.dynamicHints.${formState.type}`)}
								</p>
								<div className="flex gap-2">
									<Button
										type="button"
										variant="outline"
										onClick={() => setIsCreateDialogOpen(false)}
									>
										{tCommon('cancel')}
									</Button>
									<Button
										type="button"
										onClick={handleCreateDeduction}
										disabled={createMutation.isPending}
									>
										{createMutation.isPending
											? t('actions.creating')
											: t('actions.create')}
									</Button>
								</div>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				) : null}
			</div>

			{listError ? (
				<Alert variant="error">
					<CircleAlert className="h-4 w-4" />
					<AlertTitle>{t('errors.loadTitle')}</AlertTitle>
					<AlertDescription>{t('errors.loadDescription')}</AlertDescription>
				</Alert>
			) : null}

			{!isEmployeeMode && totalsByType.length > 0 ? (
				<section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					{totalsByType.map(([type, summary]) => (
						<div key={type} className="rounded-2xl border bg-card px-4 py-4 shadow-xs">
							<div className="flex items-center justify-between gap-3">
								<div>
									<p className="text-sm font-medium text-foreground">
										{t(`types.${type}`)}
									</p>
									<p className="text-xs text-muted-foreground">
										{t('totals.cards.count', { count: summary.count })}
									</p>
								</div>
								<Badge variant="neutral">
									{t('totals.cards.active', { count: summary.activeCount })}
								</Badge>
							</div>
							<p className="mt-3 text-base font-semibold text-foreground">
								{summary.remainingAmount > 0
									? formatCurrency(summary.remainingAmount)
									: t('totals.cards.noRemaining')}
							</p>
						</div>
					))}
				</section>
			) : null}

			<div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
				<div className="flex items-center justify-between gap-3 border-b px-5 py-4">
					<div>
						<h3 className="text-base font-semibold text-foreground">
							{t('table.title')}
						</h3>
						<p className="text-sm text-muted-foreground">{t('table.description')}</p>
					</div>
					{!isEmployeeMode ? (
						<Badge variant="neutral">
							{t('table.visibleCount', { count: deductionRows.length })}
						</Badge>
					) : null}
				</div>
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								{!isEmployeeMode ? (
									<TableHead>{t('table.columns.employee')}</TableHead>
								) : null}
								<TableHead>{t('table.columns.type')}</TableHead>
								<TableHead>{t('table.columns.label')}</TableHead>
								<TableHead>{t('table.columns.method')}</TableHead>
								<TableHead>{t('table.columns.value')}</TableHead>
								<TableHead>{t('table.columns.status')}</TableHead>
								<TableHead>{t('table.columns.progress')}</TableHead>
								<TableHead>{t('table.columns.validity')}</TableHead>
								<TableHead>{t('table.columns.actions')}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isLoading ? (
								<TableRow>
									<TableCell
										colSpan={isEmployeeMode ? 8 : 9}
										className="py-12 text-center text-sm text-muted-foreground"
									>
										{t('table.loading')}
									</TableCell>
								</TableRow>
							) : deductionRows.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={isEmployeeMode ? 8 : 9}
										className="py-12 text-center text-sm text-muted-foreground"
									>
										{t('table.empty')}
									</TableCell>
								</TableRow>
							) : (
								deductionRows.map((deduction) => {
									const installmentProgress = getInstallmentProgress(deduction);

									return (
										<TableRow key={deduction.id}>
											{!isEmployeeMode ? (
												<TableCell className="font-medium">
													{deduction.employeeName ??
														t('table.noEmployeeName')}
												</TableCell>
											) : null}
											<TableCell>
												<Badge variant="outline">
													{t(`types.${deduction.type}`)}
												</Badge>
											</TableCell>
											<TableCell>
												<div className="space-y-1">
													<p className="font-medium text-foreground">
														{deduction.label}
													</p>
													{deduction.referenceNumber ? (
														<p className="text-xs text-muted-foreground">
															{t('table.reference', {
																value: deduction.referenceNumber,
															})}
														</p>
													) : null}
												</div>
											</TableCell>
											<TableCell>
												{t(
													`calculationMethods.${deduction.calculationMethod}`,
												)}
											</TableCell>
											<TableCell>
												{formatConfiguredValue(deduction, t)}
											</TableCell>
											<TableCell>
												<Badge variant={getStatusVariant(deduction.status)}>
													{t(`status.${deduction.status}`)}
												</Badge>
											</TableCell>
											<TableCell>
												{installmentProgress.hasInstallments ? (
													<div className="min-w-52 space-y-2">
														<div className="h-2 overflow-hidden rounded-full bg-muted">
															<div
																className="h-full rounded-full bg-[var(--accent-primary)] transition-[width]"
																style={{
																	width: `${installmentProgress.progress}%`,
																}}
															/>
														</div>
														<p className="text-xs text-muted-foreground">
															{t('table.installmentProgress', {
																completed:
																	deduction.completedInstallments,
																total:
																	deduction.totalInstallments ??
																	0,
																remaining:
																	deduction.remainingAmount !==
																	null
																		? formatCurrency(
																				deduction.remainingAmount,
																			)
																		: t('table.noRemaining'),
															})}
														</p>
													</div>
												) : (
													<div className="space-y-1">
														<Badge variant="neutral">
															{t(
																`frequencies.${deduction.frequency}`,
															)}
														</Badge>
														<p className="text-xs text-muted-foreground">
															{deduction.remainingAmount !== null
																? t('table.remainingAmount', {
																		value: formatCurrency(
																			deduction.remainingAmount,
																		),
																	})
																: t('table.noRemaining')}
														</p>
													</div>
												)}
											</TableCell>
											<TableCell className="text-sm text-muted-foreground">
												<div>
													{t('table.validityStart', {
														value: deduction.startDateKey,
													})}
												</div>
												<div>
													{deduction.endDateKey
														? t('table.validityEnd', {
																value: deduction.endDateKey,
															})
														: t('table.validityOpen')}
												</div>
											</TableCell>
											<TableCell>
												{canManage ? (
													<div className="flex flex-wrap gap-2">
														{deduction.status === 'ACTIVE' ? (
															<Button
																type="button"
																size="sm"
																variant="outline"
																onClick={() =>
																	handleStatusChange(
																		deduction,
																		'PAUSED',
																	)
																}
																disabled={statusMutation.isPending}
															>
																<PauseCircle className="mr-1.5 h-4 w-4" />
																{t('actions.pause')}
															</Button>
														) : null}
														{deduction.status === 'PAUSED' ? (
															<Button
																type="button"
																size="sm"
																variant="outline"
																onClick={() =>
																	handleStatusChange(
																		deduction,
																		'ACTIVE',
																	)
																}
																disabled={statusMutation.isPending}
															>
																<PlayCircle className="mr-1.5 h-4 w-4" />
																{t('actions.resume')}
															</Button>
														) : null}
														{deduction.status !== 'CANCELLED' &&
														deduction.status !== 'COMPLETED' ? (
															<Button
																type="button"
																size="sm"
																variant="outline"
																className="border-[var(--status-error)]/30 text-[var(--status-error)]"
																onClick={() =>
																	handleStatusChange(
																		deduction,
																		'CANCELLED',
																	)
																}
																disabled={statusMutation.isPending}
															>
																<XCircle className="mr-1.5 h-4 w-4" />
																{t('actions.cancel')}
															</Button>
														) : null}
													</div>
												) : (
													<span className="text-sm text-muted-foreground">
														{t('table.readOnly')}
													</span>
												)}
											</TableCell>
										</TableRow>
									);
								})
							)}
						</TableBody>
					</Table>
				</div>
				{!isEmployeeMode ? (
					<div className="flex items-center justify-between gap-3 border-t px-5 py-4">
						<p className="text-sm text-muted-foreground">
							{t('pagination.summary', {
								current: Math.min(pageIndex + 1, totalPages),
								total: totalPages,
								count: pagination.total,
							})}
						</p>
						<div className="flex gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() =>
									setPageIndex((currentPage) => Math.max(0, currentPage - 1))
								}
								disabled={pageIndex === 0}
							>
								{tCommon('previous')}
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() =>
									setPageIndex((currentPage) =>
										Math.min(totalPages - 1, currentPage + 1),
									)
								}
								disabled={pageIndex + 1 >= totalPages}
							>
								{tCommon('next')}
							</Button>
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}
