'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	CircleDollarSign,
	Gift,
	PauseCircle,
	Pencil,
	PlayCircle,
	Plus,
	RefreshCw,
	Sparkles,
	XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
	cancelEmployeeGratificationAction,
	createEmployeeGratificationAction,
	updateEmployeeGratificationAction,
	type CreateEmployeeGratificationInput,
	type UpdateEmployeeGratificationInput,
} from '@/actions/employee-gratifications';
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
	type EmployeeGratification,
	fetchEmployeeGratificationsList,
	fetchEmployeesList,
	fetchOrganizationGratificationsList,
} from '@/lib/client-functions';
import {
	buildEmployeeGratificationsQueryParams,
	buildOrganizationGratificationsQueryParams,
} from '@/lib/employee-gratifications-query-params';
import { useOrgContext } from '@/lib/org-client-context';
import {
	type EmployeeGratificationApplicationMode,
	type EmployeeGratificationPeriodicity,
	type EmployeeGratificationStatus,
	mutationKeys,
	queryKeys,
} from '@/lib/query-keys';
import { cn } from '@/lib/utils';

const ALL_FILTER_VALUE = '__all__';
const DEFAULT_PAGE_SIZE = 20;
const EMPLOYEE_QUERY_LIMIT = 100;

type GratificationStatus = EmployeeGratification['status'];
type GratificationPeriodicity = EmployeeGratification['periodicity'];
type GratificationApplicationModeValue = EmployeeGratification['applicationMode'];
type ManagerMode = 'employee' | 'organization';

interface EmployeeGratificationsManagerProps {
	/** Rendering mode for the manager. */
	mode: ManagerMode;
	/** Active employee identifier for employee-scoped mode. */
	employeeId?: string;
	/** Optional employee display name for subtitles. */
	employeeName?: string;
}

interface GratificationFormState {
	employeeId: string;
	concept: string;
	amount: string;
	periodicity: GratificationPeriodicity;
	applicationMode: GratificationApplicationModeValue;
	startDateKey: string;
	endDateKey: string;
	notes: string;
}

interface SummaryCard {
	key: string;
	label: string;
	value: string;
	icon: React.ComponentType<{ className?: string }>;
	tone: 'accent' | 'success' | 'warning';
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
	const today = new Date();
	const year = today.getFullYear();
	const month = String(today.getMonth() + 1).padStart(2, '0');
	const day = String(today.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Creates the default form state for a new gratification.
 *
 * @param employeeId - Optional preselected employee id
 * @returns Initial form state
 */
function createDefaultFormState(employeeId?: string): GratificationFormState {
	return {
		employeeId: employeeId ?? '',
		concept: '',
		amount: '',
		periodicity: 'ONE_TIME',
		applicationMode: 'MANUAL',
		startDateKey: getTodayDateKey(),
		endDateKey: '',
		notes: '',
	};
}

/**
 * Resolves whether the current user can manage gratifications.
 *
 * @param organizationRole - Active organization role
 * @param userRole - Platform role
 * @returns True when creation and mutation actions should be enabled
 */
function canManageGratifications(
	organizationRole: 'admin' | 'owner' | 'member' | null | undefined,
	userRole: string | undefined,
): boolean {
	return userRole === 'admin' || organizationRole === 'admin' || organizationRole === 'owner';
}

/**
 * Parses a positive numeric input string into a number.
 *
 * @param value - Raw input string
 * @returns Parsed number or null when empty or invalid
 */
function parseNumberInput(value: string): number | null {
	if (!value.trim()) {
		return null;
	}

	const normalizedValue = Number(value.replace(/,/g, ''));
	return Number.isFinite(normalizedValue) ? normalizedValue : null;
}

/**
 * Normalizes optional textarea/input text.
 *
 * @param value - Raw string value
 * @returns Trimmed string or undefined
 */
function normalizeOptionalText(value: string): string | undefined {
	const trimmedValue = value.trim();
	return trimmedValue ? trimmedValue : undefined;
}

/**
 * Returns a badge variant for a gratification status.
 *
 * @param status - Gratification lifecycle status
 * @returns Badge variant
 */
function getStatusVariant(
	status: GratificationStatus,
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
 * Returns the period label for a gratification row.
 *
 * @param gratification - Gratification row
 * @param t - Translation function
 * @returns Human-readable schedule label
 */
function formatScheduleLabel(
	gratification: EmployeeGratification,
	t: ReturnType<typeof useTranslations>,
): string {
	return t(`periodicity.${gratification.periodicity}`);
}

/**
 * Returns a short subtitle for the current manager mode.
 *
 * @param mode - Rendering mode
 * @param employeeName - Optional employee display name
 * @param t - Translation function
 * @returns Subtitle copy
 */
function getManagerSubtitle(
	mode: ManagerMode,
	employeeName: string | undefined,
	t: ReturnType<typeof useTranslations>,
): string {
	if (mode === 'employee') {
		return employeeName
			? t('hero.employeeSubtitle', { name: employeeName })
			: t('hero.employeeSubtitleFallback');
	}

	return t('hero.organizationSubtitle');
}

export function EmployeeGratificationsManager({
	mode,
	employeeId,
	employeeName,
}: EmployeeGratificationsManagerProps): React.ReactElement {
	const t = useTranslations('EmployeeGratifications');
	const tCommon = useTranslations('Common');
	const queryClient = useQueryClient();
	const { organizationId, organizationRole, userRole } = useOrgContext();
	const canManage = canManageGratifications(organizationRole, userRole);
	const isEmployeeMode = mode === 'employee';

	const [statusFilter, setStatusFilter] = useState<string>(ALL_FILTER_VALUE);
	const [periodicityFilter, setPeriodicityFilter] = useState<string>(ALL_FILTER_VALUE);
	const [applicationModeFilter, setApplicationModeFilter] = useState<string>(ALL_FILTER_VALUE);
	const [employeeFilter, setEmployeeFilter] = useState<string>(ALL_FILTER_VALUE);
	const [pageIndex, setPageIndex] = useState(0);
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [editingGratification, setEditingGratification] = useState<EmployeeGratification | null>(
		null,
	);
	const [formState, setFormState] = useState<GratificationFormState>(() =>
		createDefaultFormState(isEmployeeMode ? employeeId : undefined),
	);

	const employeesQuery = useQuery({
		queryKey: queryKeys.employees.list({
			organizationId,
			limit: EMPLOYEE_QUERY_LIMIT,
			offset: 0,
		}),
		queryFn: () =>
			fetchEmployeesList({
				organizationId,
				limit: EMPLOYEE_QUERY_LIMIT,
				offset: 0,
			}),
		enabled: Boolean(!isEmployeeMode && organizationId),
	});

	const employees = employeesQuery.data?.data ?? [];

	const parsedStatusFilter =
		statusFilter === ALL_FILTER_VALUE
			? undefined
			: (statusFilter as EmployeeGratificationStatus);
	const parsedPeriodicityFilter =
		periodicityFilter === ALL_FILTER_VALUE
			? undefined
			: (periodicityFilter as EmployeeGratificationPeriodicity);
	const parsedApplicationModeFilter =
		applicationModeFilter === ALL_FILTER_VALUE
			? undefined
			: (applicationModeFilter as EmployeeGratificationApplicationMode);
	const parsedEmployeeFilter = employeeFilter === ALL_FILTER_VALUE ? undefined : employeeFilter;

	const employeeQueryParams = useMemo(
		() =>
			buildEmployeeGratificationsQueryParams({
				organizationId: organizationId ?? undefined,
				employeeId,
				status: parsedStatusFilter,
				periodicity: parsedPeriodicityFilter,
				applicationMode: parsedApplicationModeFilter,
			}),
		[
			employeeId,
			organizationId,
			parsedApplicationModeFilter,
			parsedPeriodicityFilter,
			parsedStatusFilter,
		],
	);

	const organizationQueryParams = useMemo(
		() =>
			buildOrganizationGratificationsQueryParams({
				organizationId: organizationId ?? undefined,
				limit: DEFAULT_PAGE_SIZE,
				offset: pageIndex * DEFAULT_PAGE_SIZE,
				employeeId: parsedEmployeeFilter,
				status: parsedStatusFilter,
				periodicity: parsedPeriodicityFilter,
				applicationMode: parsedApplicationModeFilter,
			}),
		[
			organizationId,
			pageIndex,
			parsedApplicationModeFilter,
			parsedEmployeeFilter,
			parsedPeriodicityFilter,
			parsedStatusFilter,
		],
	);

	const employeeGratificationsQuery = useQuery({
		queryKey: employeeQueryParams
			? queryKeys.employeeGratifications.employee(employeeQueryParams)
			: queryKeys.employeeGratifications.all,
		queryFn: () => fetchEmployeeGratificationsList(employeeQueryParams),
		enabled: Boolean(isEmployeeMode && employeeQueryParams),
	});

	const organizationGratificationsQuery = useQuery({
		queryKey: queryKeys.employeeGratifications.organization(organizationQueryParams),
		queryFn: () => fetchOrganizationGratificationsList(organizationQueryParams),
		enabled: Boolean(!isEmployeeMode && organizationQueryParams),
	});

	const gratificationRows = useMemo(
		() =>
			isEmployeeMode
				? (employeeGratificationsQuery.data ?? [])
				: (organizationGratificationsQuery.data?.data ?? []),
		[
			employeeGratificationsQuery.data,
			isEmployeeMode,
			organizationGratificationsQuery.data?.data,
		],
	);

	const pagination = organizationGratificationsQuery.data?.pagination ?? {
		total: gratificationRows.length,
		limit: DEFAULT_PAGE_SIZE,
		offset: 0,
	};
	const isVisibleSubset = !isEmployeeMode && pagination.total > gratificationRows.length;
	const isLoading = isEmployeeMode
		? employeeGratificationsQuery.isLoading
		: organizationGratificationsQuery.isLoading;
	const queryError = isEmployeeMode
		? employeeGratificationsQuery.error
		: organizationGratificationsQuery.error;

	const summaryCards = useMemo<SummaryCard[]>(() => {
		const activeRows = gratificationRows.filter((row) => row.status === 'ACTIVE');
		const activeAmount = activeRows.reduce((total, row) => total + row.amount, 0);
		const automaticCount = gratificationRows.filter(
			(row) => row.applicationMode === 'AUTOMATIC' && row.status === 'ACTIVE',
		).length;
		const manualCount = gratificationRows.filter(
			(row) => row.applicationMode === 'MANUAL' && row.status === 'ACTIVE',
		).length;

		return [
			{
				key: 'active',
				label: t('summary.activeGratifications'),
				value: t('summary.countValue', { count: activeRows.length }),
				icon: Gift,
				tone: 'accent',
			},
			{
				key: 'activeAmount',
				label: t('summary.activeAmount'),
				value: formatCurrency(activeAmount),
				icon: CircleDollarSign,
				tone: 'success',
			},
			{
				key: 'automatic',
				label: t('summary.automatic'),
				value: t('summary.countValue', { count: automaticCount }),
				icon: RefreshCw,
				tone: 'warning',
			},
			{
				key: 'manual',
				label: t('summary.manual'),
				value: t('summary.countValue', { count: manualCount }),
				icon: Sparkles,
				tone: 'accent',
			},
		];
	}, [gratificationRows, t]);

	const createMutation = useMutation({
		mutationKey: mutationKeys.employeeGratifications.create,
		mutationFn: createEmployeeGratificationAction,
		onSuccess: (result) => {
			if (!result.success) {
				toast.error(result.error ?? t('toast.createError'));
				return;
			}

			toast.success(t('toast.createSuccess'));
			setIsCreateDialogOpen(false);
			setFormState(createDefaultFormState(isEmployeeMode ? employeeId : undefined));
			void queryClient.invalidateQueries({
				queryKey: queryKeys.employeeGratifications.all,
			});
		},
		onError: () => {
			toast.error(t('toast.createError'));
		},
	});

	const updateMutation = useMutation({
		mutationKey: mutationKeys.employeeGratifications.update,
		mutationFn: updateEmployeeGratificationAction,
		onSuccess: (result) => {
			if (!result.success) {
				toast.error(result.error ?? t('toast.updateError'));
				return;
			}

			toast.success(t('toast.updateSuccess'));
			setEditingGratification(null);
			void queryClient.invalidateQueries({
				queryKey: queryKeys.employeeGratifications.all,
			});
		},
		onError: () => {
			toast.error(t('toast.updateError'));
		},
	});

	const cancelMutation = useMutation({
		mutationKey: mutationKeys.employeeGratifications.cancel,
		mutationFn: cancelEmployeeGratificationAction,
		onSuccess: (result) => {
			if (!result.success) {
				toast.error(result.error ?? t('toast.cancelError'));
				return;
			}

			toast.success(t('toast.cancelSuccess'));
			void queryClient.invalidateQueries({
				queryKey: queryKeys.employeeGratifications.all,
			});
		},
		onError: () => {
			toast.error(t('toast.cancelError'));
		},
	});

	/**
	 * Updates a single form field.
	 *
	 * @param key - Form field key
	 * @param value - Next field value
	 * @returns Nothing
	 */
	function updateFormField<Key extends keyof GratificationFormState>(
		key: Key,
		value: GratificationFormState[Key],
	): void {
		setFormState((currentState) => ({
			...currentState,
			[key]: value,
		}));
	}

	/**
	 * Resets the form state to the default values.
	 *
	 * @returns Nothing
	 */
	function resetFormState(): void {
		setFormState(createDefaultFormState(isEmployeeMode ? employeeId : undefined));
	}

	/**
	 * Loads a gratification into the edit form.
	 *
	 * @param gratification - Gratification row to edit
	 * @returns Nothing
	 */
	function openEditDialog(gratification: EmployeeGratification): void {
		setFormState({
			employeeId: gratification.employeeId,
			concept: gratification.concept,
			amount: gratification.amount.toFixed(2),
			periodicity: gratification.periodicity,
			applicationMode: gratification.applicationMode,
			startDateKey: gratification.startDateKey,
			endDateKey: gratification.endDateKey ?? '',
			notes: gratification.notes ?? '',
		});
		setEditingGratification(gratification);
	}

	/**
	 * Validates a gratification form and returns the normalized payload.
	 *
	 * @param state - Form state under validation
	 * @returns Normalized payload data or null when invalid
	 */
	function validateFormState(
		state: GratificationFormState,
	): Omit<CreateEmployeeGratificationInput, 'organizationId'> | null {
		const targetEmployeeId = isEmployeeMode ? employeeId : state.employeeId;
		if (!targetEmployeeId) {
			toast.error(t('validation.employeeRequired'));
			return null;
		}

		if (!state.concept.trim()) {
			toast.error(t('validation.conceptRequired'));
			return null;
		}

		const parsedAmount = parseNumberInput(state.amount);
		if (parsedAmount === null || parsedAmount <= 0) {
			toast.error(t('validation.amountRequired'));
			return null;
		}

		if (!state.startDateKey.trim()) {
			toast.error(t('validation.startDateRequired'));
			return null;
		}

		if (state.endDateKey.trim() && state.endDateKey < state.startDateKey) {
			toast.error(t('validation.endDateAfterStart'));
			return null;
		}

		if (state.applicationMode === 'MANUAL' && state.periodicity !== 'ONE_TIME') {
			toast.error(t('validation.manualOneTimeOnly'));
			return null;
		}

		return {
			employeeId: targetEmployeeId,
			concept: state.concept.trim(),
			amount: parsedAmount,
			periodicity: state.periodicity,
			applicationMode: state.applicationMode,
			startDateKey: state.startDateKey,
			endDateKey: normalizeOptionalText(state.endDateKey),
			notes: normalizeOptionalText(state.notes),
		};
	}

	/**
	 * Submits the create flow for a gratification.
	 *
	 * @returns Nothing
	 */
	function handleCreate(): void {
		if (!organizationId || createMutation.isPending) {
			return;
		}

		const payload = validateFormState(formState);
		if (!payload) {
			return;
		}

		createMutation.mutate({
			organizationId,
			...payload,
		});
	}

	/**
	 * Submits the edit flow for a gratification.
	 *
	 * @returns Nothing
	 */
	function handleUpdate(): void {
		if (!organizationId || !editingGratification || updateMutation.isPending) {
			return;
		}

		const payload = validateFormState(formState);
		if (!payload) {
			return;
		}

		updateMutation.mutate({
			organizationId,
			employeeId: editingGratification.employeeId,
			id: editingGratification.id,
			concept: payload.concept,
			amount: payload.amount,
			periodicity: payload.periodicity,
			applicationMode: payload.applicationMode,
			startDateKey: payload.startDateKey,
			endDateKey: payload.endDateKey ?? null,
			notes: payload.notes ?? null,
		});
	}

	/**
	 * Applies a status transition to a gratification row.
	 *
	 * @param gratification - Target gratification row
	 * @param status - Requested next status
	 * @returns Nothing
	 */
	function handleStatusChange(
		gratification: EmployeeGratification,
		status: UpdateEmployeeGratificationInput['status'],
	): void {
		if (!organizationId || !status || updateMutation.isPending) {
			return;
		}

		updateMutation.mutate({
			organizationId,
			employeeId: gratification.employeeId,
			id: gratification.id,
			status,
		});
	}

	/**
	 * Cancels a gratification row.
	 *
	 * @param gratification - Target gratification row
	 * @returns Nothing
	 */
	function handleCancel(gratification: EmployeeGratification): void {
		if (!organizationId || cancelMutation.isPending) {
			return;
		}

		cancelMutation.mutate({
			organizationId,
			employeeId: gratification.employeeId,
			id: gratification.id,
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
							<Badge variant="neutral">
								{canManage ? t('hero.adminReady') : t('hero.readOnly')}
							</Badge>
						</div>
						<div className="space-y-1">
							<h2 className="font-serif text-2xl tracking-tight text-foreground">
								{t('hero.title')}
							</h2>
							<p className="max-w-2xl text-sm text-muted-foreground">
								{getManagerSubtitle(mode, employeeName, t)}
							</p>
						</div>
						{isVisibleSubset ? (
							<p className="text-xs text-muted-foreground">
								{t('summary.visibleScope')}
							</p>
						) : null}
					</div>

					<div className="grid gap-3 sm:grid-cols-2">
						{summaryCards.map((card) => (
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
				<div className="grid gap-3 rounded-3xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
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
					<div className="space-y-2">
						<Label>{t('filters.periodicity')}</Label>
						<Select
							value={periodicityFilter}
							onValueChange={(value) => {
								setPeriodicityFilter(value);
								setPageIndex(0);
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder={t('filters.periodicity')} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_FILTER_VALUE}>
									{t('filters.allPeriodicities')}
								</SelectItem>
								<SelectItem value="ONE_TIME">
									{t('periodicity.ONE_TIME')}
								</SelectItem>
								<SelectItem value="RECURRING">
									{t('periodicity.RECURRING')}
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label>{t('filters.applicationMode')}</Label>
						<Select
							value={applicationModeFilter}
							onValueChange={(value) => {
								setApplicationModeFilter(value);
								setPageIndex(0);
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder={t('filters.applicationMode')} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_FILTER_VALUE}>
									{t('filters.allApplicationModes')}
								</SelectItem>
								<SelectItem value="MANUAL">
									{t('applicationMode.MANUAL')}
								</SelectItem>
								<SelectItem value="AUTOMATIC">
									{t('applicationMode.AUTOMATIC')}
								</SelectItem>
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
								resetFormState();
							}
						}}
					>
						<DialogTrigger asChild>
							<Button className="h-11 rounded-full px-5">
								<Plus className="mr-2 h-4 w-4" />
								{t('actions.add')}
							</Button>
						</DialogTrigger>
						<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
							<DialogHeader>
								<DialogTitle>{t('createDialog.title')}</DialogTitle>
								<DialogDescription>
									{t('createDialog.description')}
								</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4 py-2 md:grid-cols-2">
								{!isEmployeeMode ? (
									<div className="space-y-2 md:col-span-2">
										<Label htmlFor="gratification-employee">
											{t('form.employee')}
										</Label>
										<Select
											value={formState.employeeId}
											onValueChange={(value) =>
												updateFormField('employeeId', value)
											}
										>
											<SelectTrigger id="gratification-employee">
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
								<div className="space-y-2 md:col-span-2">
									<Label htmlFor="gratification-concept">
										{t('form.concept')}
									</Label>
									<Input
										id="gratification-concept"
										value={formState.concept}
										onChange={(event) =>
											updateFormField('concept', event.target.value)
										}
										placeholder={t('form.conceptPlaceholder')}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="gratification-amount">{t('form.amount')}</Label>
									<Input
										id="gratification-amount"
										value={formState.amount}
										onChange={(event) =>
											updateFormField('amount', event.target.value)
										}
										placeholder={t('form.amountPlaceholder')}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="gratification-application-mode">
										{t('form.applicationMode')}
									</Label>
									<Select
										value={formState.applicationMode}
										onValueChange={(value) => {
											const nextValue =
												value as GratificationApplicationModeValue;
											updateFormField('applicationMode', nextValue);
											if (nextValue === 'MANUAL') {
												updateFormField('periodicity', 'ONE_TIME');
											}
										}}
									>
										<SelectTrigger id="gratification-application-mode">
											<SelectValue placeholder={t('form.applicationMode')} />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="MANUAL">
												{t('applicationMode.MANUAL')}
											</SelectItem>
											<SelectItem value="AUTOMATIC">
												{t('applicationMode.AUTOMATIC')}
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<Label htmlFor="gratification-periodicity">
										{t('form.periodicity')}
									</Label>
									<Select
										value={formState.periodicity}
										onValueChange={(value) =>
											updateFormField(
												'periodicity',
												value as GratificationPeriodicity,
											)
										}
									>
										<SelectTrigger id="gratification-periodicity">
											<SelectValue placeholder={t('form.periodicity')} />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="ONE_TIME">
												{t('periodicity.ONE_TIME')}
											</SelectItem>
											<SelectItem
												value="RECURRING"
												disabled={formState.applicationMode === 'MANUAL'}
											>
												{t('periodicity.RECURRING')}
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<Label htmlFor="gratification-start-date">
										{t('form.startDate')}
									</Label>
									<Input
										id="gratification-start-date"
										type="date"
										value={formState.startDateKey}
										onChange={(event) =>
											updateFormField('startDateKey', event.target.value)
										}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="gratification-end-date">
										{t('form.endDate')}
									</Label>
									<Input
										id="gratification-end-date"
										type="date"
										value={formState.endDateKey}
										onChange={(event) =>
											updateFormField('endDateKey', event.target.value)
										}
									/>
								</div>
								<div className="space-y-2 md:col-span-2">
									<Label htmlFor="gratification-notes">{t('form.notes')}</Label>
									<Textarea
										id="gratification-notes"
										value={formState.notes}
										onChange={(event) =>
											updateFormField('notes', event.target.value)
										}
										placeholder={t('form.notesPlaceholder')}
									/>
								</div>
							</div>
							<DialogFooter>
								<Button
									type="button"
									variant="outline"
									onClick={() => setIsCreateDialogOpen(false)}
								>
									{tCommon('cancel')}
								</Button>
								<Button
									type="button"
									onClick={handleCreate}
									disabled={createMutation.isPending}
								>
									{createMutation.isPending
										? t('actions.creating')
										: t('actions.create')}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				) : null}
			</div>

			{queryError ? (
				<Alert variant="destructive">
					<AlertTitle>{t('errors.loadTitle')}</AlertTitle>
					<AlertDescription>{t('errors.loadDescription')}</AlertDescription>
				</Alert>
			) : null}

			<section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
					<div>
						<h3 className="font-semibold text-foreground">{t('table.title')}</h3>
						<p className="text-sm text-muted-foreground">{t('table.description')}</p>
					</div>
					<p className="text-xs text-muted-foreground">
						{t('table.visibleCount', { count: pagination.total })}
					</p>
				</div>
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								{!isEmployeeMode ? (
									<TableHead>{t('table.columns.employee')}</TableHead>
								) : null}
								<TableHead>{t('table.columns.concept')}</TableHead>
								<TableHead>{t('table.columns.amount')}</TableHead>
								<TableHead>{t('table.columns.schedule')}</TableHead>
								<TableHead>{t('table.columns.status')}</TableHead>
								<TableHead>{t('table.columns.validity')}</TableHead>
								<TableHead>{t('table.columns.actions')}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isLoading ? (
								<TableRow>
									<TableCell
										colSpan={isEmployeeMode ? 6 : 7}
										className="py-12 text-center text-sm text-muted-foreground"
									>
										{t('table.loading')}
									</TableCell>
								</TableRow>
							) : gratificationRows.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={isEmployeeMode ? 6 : 7}
										className="py-12 text-center text-sm text-muted-foreground"
									>
										{t('table.empty')}
									</TableCell>
								</TableRow>
							) : (
								gratificationRows.map((gratification) => (
									<TableRow key={gratification.id}>
										{!isEmployeeMode ? (
											<TableCell className="font-medium">
												{gratification.employeeName ??
													t('table.noEmployeeName')}
											</TableCell>
										) : null}
										<TableCell>
											<div className="space-y-1">
												<p className="font-medium text-foreground">
													{gratification.concept}
												</p>
												{gratification.notes ? (
													<p className="line-clamp-2 max-w-sm text-xs text-muted-foreground">
														{gratification.notes}
													</p>
												) : null}
											</div>
										</TableCell>
										<TableCell>
											{formatCurrency(gratification.amount)}
										</TableCell>
										<TableCell>
											<div className="space-y-1">
												<Badge variant="neutral">
													{t(
														`applicationMode.${gratification.applicationMode}`,
													)}
												</Badge>
												<p className="text-xs text-muted-foreground">
													{formatScheduleLabel(gratification, t)}
												</p>
											</div>
										</TableCell>
										<TableCell>
											<Badge variant={getStatusVariant(gratification.status)}>
												{t(`status.${gratification.status}`)}
											</Badge>
										</TableCell>
										<TableCell className="text-sm text-muted-foreground">
											<div>
												{t('table.validityStart', {
													value: gratification.startDateKey,
												})}
											</div>
											<div>
												{gratification.endDateKey
													? t('table.validityEnd', {
															value: gratification.endDateKey,
														})
													: t('table.validityOpen')}
											</div>
										</TableCell>
										<TableCell>
											{canManage ? (
												<div className="flex flex-wrap gap-2">
													<Button
														type="button"
														size="sm"
														variant="outline"
														onClick={() =>
															openEditDialog(gratification)
														}
													>
														<Pencil className="mr-2 h-4 w-4" />
														{t('actions.edit')}
													</Button>
													{gratification.status === 'ACTIVE' ? (
														<Button
															type="button"
															size="sm"
															variant="outline"
															onClick={() =>
																handleStatusChange(
																	gratification,
																	'PAUSED',
																)
															}
														>
															<PauseCircle className="mr-2 h-4 w-4" />
															{t('actions.pause')}
														</Button>
													) : gratification.status === 'PAUSED' ? (
														<Button
															type="button"
															size="sm"
															variant="outline"
															onClick={() =>
																handleStatusChange(
																	gratification,
																	'ACTIVE',
																)
															}
														>
															<PlayCircle className="mr-2 h-4 w-4" />
															{t('actions.resume')}
														</Button>
													) : null}
													{gratification.status !== 'CANCELLED' &&
													gratification.status !== 'COMPLETED' ? (
														<Button
															type="button"
															size="sm"
															variant="outline"
															onClick={() =>
																handleCancel(gratification)
															}
														>
															<XCircle className="mr-2 h-4 w-4" />
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
								))
							)}
						</TableBody>
					</Table>
				</div>

				{!isEmployeeMode && pagination.total > pagination.limit ? (
					<div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
						<p className="text-sm text-muted-foreground">
							{t('pagination.summary', {
								current: pageIndex + 1,
								total: totalPages,
								count: pagination.total,
							})}
						</p>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => setPageIndex((currentPage) => currentPage - 1)}
								disabled={pageIndex === 0}
							>
								{tCommon('previous')}
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => setPageIndex((currentPage) => currentPage + 1)}
								disabled={pageIndex + 1 >= totalPages}
							>
								{tCommon('next')}
							</Button>
						</div>
					</div>
				) : null}
			</section>

			<Dialog
				open={editingGratification !== null}
				onOpenChange={(open) => {
					if (!open) {
						setEditingGratification(null);
						resetFormState();
					}
				}}
			>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>{t('editDialog.title')}</DialogTitle>
						<DialogDescription>{t('editDialog.description')}</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-2 md:grid-cols-2">
						<div className="space-y-2 md:col-span-2">
							<Label htmlFor="gratification-edit-concept">{t('form.concept')}</Label>
							<Input
								id="gratification-edit-concept"
								value={formState.concept}
								onChange={(event) => updateFormField('concept', event.target.value)}
								placeholder={t('form.conceptPlaceholder')}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="gratification-edit-amount">{t('form.amount')}</Label>
							<Input
								id="gratification-edit-amount"
								value={formState.amount}
								onChange={(event) => updateFormField('amount', event.target.value)}
								placeholder={t('form.amountPlaceholder')}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="gratification-edit-application-mode">
								{t('form.applicationMode')}
							</Label>
							<Select
								value={formState.applicationMode}
								onValueChange={(value) => {
									const nextValue = value as GratificationApplicationModeValue;
									updateFormField('applicationMode', nextValue);
									if (nextValue === 'MANUAL') {
										updateFormField('periodicity', 'ONE_TIME');
									}
								}}
							>
								<SelectTrigger id="gratification-edit-application-mode">
									<SelectValue placeholder={t('form.applicationMode')} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="MANUAL">
										{t('applicationMode.MANUAL')}
									</SelectItem>
									<SelectItem value="AUTOMATIC">
										{t('applicationMode.AUTOMATIC')}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="gratification-edit-periodicity">
								{t('form.periodicity')}
							</Label>
							<Select
								value={formState.periodicity}
								onValueChange={(value) =>
									updateFormField(
										'periodicity',
										value as GratificationPeriodicity,
									)
								}
							>
								<SelectTrigger id="gratification-edit-periodicity">
									<SelectValue placeholder={t('form.periodicity')} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="ONE_TIME">
										{t('periodicity.ONE_TIME')}
									</SelectItem>
									<SelectItem
										value="RECURRING"
										disabled={formState.applicationMode === 'MANUAL'}
									>
										{t('periodicity.RECURRING')}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="gratification-edit-start-date">
								{t('form.startDate')}
							</Label>
							<Input
								id="gratification-edit-start-date"
								type="date"
								value={formState.startDateKey}
								onChange={(event) =>
									updateFormField('startDateKey', event.target.value)
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="gratification-edit-end-date">{t('form.endDate')}</Label>
							<Input
								id="gratification-edit-end-date"
								type="date"
								value={formState.endDateKey}
								onChange={(event) =>
									updateFormField('endDateKey', event.target.value)
								}
							/>
						</div>
						<div className="space-y-2 md:col-span-2">
							<Label htmlFor="gratification-edit-notes">{t('form.notes')}</Label>
							<Textarea
								id="gratification-edit-notes"
								value={formState.notes}
								onChange={(event) => updateFormField('notes', event.target.value)}
								placeholder={t('form.notesPlaceholder')}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								setEditingGratification(null);
								resetFormState();
							}}
						>
							{tCommon('cancel')}
						</Button>
						<Button
							type="button"
							onClick={handleUpdate}
							disabled={updateMutation.isPending}
						>
							{updateMutation.isPending ? t('actions.updating') : t('actions.save')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
