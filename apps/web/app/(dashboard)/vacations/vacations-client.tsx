'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Label } from '@/components/ui/label';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { DataTable } from '@/components/data-table/data-table';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
	cancelVacationRequestAction,
	createVacationRequestAction,
	approveVacationRequestAction,
	rejectVacationRequestAction,
	type VacationMutationErrorCode,
} from '@/actions/vacations';
import {
	fetchEmployeesList,
	fetchVacationRequestsList,
	type Employee,
	type VacationDayType,
	type VacationRequest,
	type VacationRequestStatus,
} from '@/lib/client-functions';
import { formatDateRangeUtc, formatShortDateUtc } from '@/lib/date-format';
import { useAppForm } from '@/lib/forms';
import { useOrgContext } from '@/lib/org-client-context';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import type { ColumnDef, ColumnFiltersState, PaginationState, SortingState } from '@tanstack/react-table';

type StatusFilter = 'all' | VacationRequestStatus;

type DecisionAction = 'approve' | 'reject' | 'cancel';

type CreateVacationRequestStatus = 'DRAFT' | 'SUBMITTED';

const statusVariants: Record<
	VacationRequestStatus,
	'default' | 'secondary' | 'destructive' | 'outline'
> = {
	DRAFT: 'outline',
	SUBMITTED: 'secondary',
	APPROVED: 'default',
	REJECTED: 'destructive',
	CANCELLED: 'outline',
};

/**
 * Converts a date key to a UTC Date instance.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Date instance at UTC midnight
 */
function toUtcDate(dateKey: string): Date {
	return new Date(`${dateKey}T00:00:00Z`);
}

/**
 * Converts a date key to a local Date instance (midnight local time).
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Date instance at local midnight
 */
function toLocalDate(dateKey: string): Date {
	return new Date(`${dateKey}T00:00:00`);
}

/**
 * Formats a Date instance to YYYY-MM-DD using local time.
 *
 * @param date - Date instance
 * @returns Date key in YYYY-MM-DD format
 */
function toDateKey(date: Date): string {
	return format(date, 'yyyy-MM-dd');
}

/**
 * Resolves the error toast message for vacation mutations.
 *
 * @param t - Translation helper for Vacations namespace
 * @param errorCode - Error code from the mutation result
 * @param fallbackKey - Translation key for the fallback message
 * @returns Localized error message
 */
function getVacationErrorMessage(
	t: (key: string) => string,
	errorCode: VacationMutationErrorCode | undefined,
	fallbackKey: string,
): string {
	switch (errorCode) {
		case 'VACATION_EMPLOYEE_REQUIRED':
			return t('toast.errors.employeeRequired');
		case 'VACATION_EMPLOYEE_NOT_FOUND':
			return t('toast.errors.employeeNotFound');
		case 'VACATION_INVALID_STATUS':
			return t('toast.errors.invalidStatus');
		case 'VACATION_HIRE_DATE_REQUIRED':
			return t('toast.errors.hireDateRequired');
		case 'VACATION_INVALID_RANGE':
			return t('toast.errors.invalidRange');
		case 'VACATION_SERVICE_YEAR_INCOMPLETE':
			return t('toast.errors.serviceYearIncomplete');
		case 'VACATION_INSUFFICIENT_BALANCE':
			return t('toast.errors.insufficientBalance');
		case 'VACATION_OVERLAP':
			return t('toast.errors.overlap');
		case 'BAD_REQUEST':
			return t('toast.errors.badRequest');
		case 'UNAUTHORIZED':
			return t('toast.errors.unauthorized');
		case 'FORBIDDEN':
			return t('toast.errors.forbidden');
		case 'NOT_FOUND':
			return t('toast.errors.notFound');
		case 'CONFLICT':
			return t('toast.errors.conflict');
		default:
			return t(fallbackKey);
	}
}

/**
 * Vacations management page for HR/admin workflows.
 *
 * @returns Vacations page client component
 */
export function VacationsPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId } = useOrgContext();
	const t = useTranslations('Vacations');
	const tCommon = useTranslations('Common');

	const [globalFilter, setGlobalFilter] = useState<string>('');
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [fromDate, setFromDate] = useState<string>('');
	const [toDate, setToDate] = useState<string>('');
	const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
	const [detailRequest, setDetailRequest] = useState<VacationRequest | null>(null);
	const [decisionNotes, setDecisionNotes] = useState<string>('');

	/**
	 * Updates the detail request selection and resets decision notes.
	 *
	 * @param request - Vacation request to show, or null to clear
	 * @returns void
	 */
	const setDetailRequestWithNotes = useCallback((request: VacationRequest | null): void => {
		setDetailRequest(request);
		setDecisionNotes('');
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

	/**
	 * Updates the status filter and resets pagination.
	 *
	 * @param value - Selected status filter
	 * @returns void
	 */
	const handleStatusFilterChange = useCallback(
		(value: string): void => {
			const statusValue = value as StatusFilter;
			handleColumnFiltersChange((prev) => {
				const next = prev.filter((filter) => filter.id !== 'status');
				if (statusValue !== 'all') {
					next.push({ id: 'status', value: statusValue });
				}
				return next;
			});
		},
		[handleColumnFiltersChange],
	);

	/**
	 * Updates the employee filter and resets pagination.
	 *
	 * @param value - Selected employee id
	 * @returns void
	 */
	const handleEmployeeFilterChange = useCallback(
		(value: string): void => {
			handleColumnFiltersChange((prev) => {
				const next = prev.filter((filter) => filter.id !== 'employeeId');
				if (value !== 'all') {
					next.push({ id: 'employeeId', value });
				}
				return next;
			});
		},
		[handleColumnFiltersChange],
	);

	/**
	 * Updates the from date filter and resets pagination.
	 *
	 * @param value - New from date value
	 * @returns void
	 */
	const handleFromDateChange = useCallback(
		(value: string): void => {
			setFromDate(value);
			resetPagination();
		},
		[resetPagination],
	);

	/**
	 * Updates the to date filter and resets pagination.
	 *
	 * @param value - New to date value
	 * @returns void
	 */
	const handleToDateChange = useCallback(
		(value: string): void => {
			setToDate(value);
			resetPagination();
		},
		[resetPagination],
	);

	const statusFilterValue =
		(columnFilters.find((filter) => filter.id === 'status')?.value as
			| StatusFilter
			| undefined) ?? 'all';
	const selectedEmployeeIdValue =
		(columnFilters.find((filter) => filter.id === 'employeeId')?.value as
			| string
			| undefined) ?? 'all';

	const employeeQueryParams = useMemo(
		() => ({
			limit: 100,
			offset: 0,
			organizationId: organizationId ?? undefined,
		}),
		[organizationId],
	);

	const { data: employeesResponse, isLoading: isLoadingEmployees } = useQuery({
		queryKey: queryKeys.employees.list(employeeQueryParams),
		queryFn: () => fetchEmployeesList(employeeQueryParams),
		enabled: Boolean(organizationId),
	});

	const employees: Employee[] = useMemo(
		() => employeesResponse?.data ?? [],
		[employeesResponse?.data],
	);

	const employeeLookup = useMemo(() => {
		return new Map<string, string>(
			employees.map((employee) => [
				employee.id,
				`${employee.firstName} ${employee.lastName}`.trim(),
			]),
		);
	}, [employees]);

	const requestParams = useMemo(
		() => ({
			limit: pagination.pageSize,
			offset: pagination.pageIndex * pagination.pageSize,
			organizationId: organizationId ?? undefined,
			employeeId:
				selectedEmployeeIdValue !== 'all' ? selectedEmployeeIdValue : undefined,
			status: statusFilterValue !== 'all' ? statusFilterValue : undefined,
			from: fromDate || undefined,
			to: toDate || undefined,
		}),
		[
			fromDate,
			organizationId,
			pagination.pageIndex,
			pagination.pageSize,
			selectedEmployeeIdValue,
			statusFilterValue,
			toDate,
		],
	);

	const { data: requestsResponse, isFetching } = useQuery({
		queryKey: queryKeys.vacations.list(requestParams),
		queryFn: () => fetchVacationRequestsList(requestParams),
		enabled: Boolean(organizationId),
	});

	const requests = requestsResponse?.data ?? [];
	const totalRows = requestsResponse?.pagination.total ?? 0;

	const createForm = useAppForm({
		defaultValues: {
			employeeId: '',
			status: 'SUBMITTED' as CreateVacationRequestStatus,
			startDateKey: '',
			endDateKey: '',
			requestedNotes: '',
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				toast.error(t('toast.noOrganization'));
				return;
			}
			if (!value.employeeId) {
				toast.error(t('form.validation.employeeRequired'));
				return;
			}
			if (!value.startDateKey) {
				toast.error(t('form.validation.startDateRequired'));
				return;
			}
			if (!value.endDateKey) {
				toast.error(t('form.validation.endDateRequired'));
				return;
			}
			if (value.endDateKey < value.startDateKey) {
				toast.error(t('form.validation.dateRange'));
				return;
			}

			await createMutation.mutateAsync({
				employeeId: value.employeeId,
				startDateKey: value.startDateKey,
				endDateKey: value.endDateKey,
				requestedNotes: value.requestedNotes?.trim() || undefined,
				status: value.status,
			});
		},
	});

	const createMutation = useMutation({
		mutationKey: mutationKeys.vacations.create,
		mutationFn: createVacationRequestAction,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.createSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.vacations.all });
				setIsCreateOpen(false);
				createForm.reset();
			} else {
				toast.error(
					getVacationErrorMessage(t, result.errorCode, 'toast.createError'),
				);
			}
		},
		onError: () => {
			toast.error(t('toast.createError'));
		},
	});

	const approveMutation = useMutation({
		mutationKey: mutationKeys.vacations.approve,
		mutationFn: approveVacationRequestAction,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.approveSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.vacations.all });
				setDetailRequestWithNotes(result.data ?? null);
			} else {
				toast.error(
					getVacationErrorMessage(t, result.errorCode, 'toast.approveError'),
				);
			}
		},
		onError: () => toast.error(t('toast.approveError')),
	});

	const rejectMutation = useMutation({
		mutationKey: mutationKeys.vacations.reject,
		mutationFn: rejectVacationRequestAction,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.rejectSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.vacations.all });
				setDetailRequestWithNotes(result.data ?? null);
			} else {
				toast.error(
					getVacationErrorMessage(t, result.errorCode, 'toast.rejectError'),
				);
			}
		},
		onError: () => toast.error(t('toast.rejectError')),
	});

	const cancelMutation = useMutation({
		mutationKey: mutationKeys.vacations.cancel,
		mutationFn: cancelVacationRequestAction,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.cancelSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.vacations.all });
				setDetailRequestWithNotes(result.data ?? null);
			} else {
				toast.error(
					getVacationErrorMessage(t, result.errorCode, 'toast.cancelError'),
				);
			}
		},
		onError: () => toast.error(t('toast.cancelError')),
	});

	/**
	 * Resolves employee display name for a request.
	 *
	 * @param request - Vacation request record
	 * @returns Display name for the employee
	 */
	const getEmployeeName = useCallback((request: VacationRequest): string => {
		const fullName = `${request.employeeName ?? ''} ${request.employeeLastName ?? ''}`.trim();
		if (fullName) {
			return fullName;
		}
		return employeeLookup.get(request.employeeId) ?? request.employeeId;
	}, [employeeLookup]);

	/**
	 * Handles decision actions for a selected request.
	 *
	 * @param action - Decision action to perform
	 * @returns Promise that resolves once the action completes
	 */
	const handleDecision = async (action: DecisionAction): Promise<void> => {
		if (!detailRequest) {
			return;
		}

		const notes = decisionNotes.trim() || undefined;
		if (action === 'approve') {
			await approveMutation.mutateAsync({ id: detailRequest.id, decisionNotes: notes });
			return;
		}
		if (action === 'reject') {
			await rejectMutation.mutateAsync({ id: detailRequest.id, decisionNotes: notes });
			return;
		}
		await cancelMutation.mutateAsync({ id: detailRequest.id, decisionNotes: notes });
	};

	const statusTabs: { value: StatusFilter; label: string }[] = [
		{ value: 'all', label: t('filters.statusAll') },
		{ value: 'SUBMITTED', label: t('status.SUBMITTED') },
		{ value: 'APPROVED', label: t('status.APPROVED') },
		{ value: 'REJECTED', label: t('status.REJECTED') },
		{ value: 'CANCELLED', label: t('status.CANCELLED') },
		{ value: 'DRAFT', label: t('status.DRAFT') },
	];

	const dayTypeLabels: Record<VacationDayType, string> = {
		SCHEDULED_WORKDAY: t('dayTypes.SCHEDULED_WORKDAY'),
		SCHEDULED_REST_DAY: t('dayTypes.SCHEDULED_REST_DAY'),
		EXCEPTION_WORKDAY: t('dayTypes.EXCEPTION_WORKDAY'),
		EXCEPTION_DAY_OFF: t('dayTypes.EXCEPTION_DAY_OFF'),
		MANDATORY_REST_DAY: t('dayTypes.MANDATORY_REST_DAY'),
	};
	const columns = useMemo<ColumnDef<VacationRequest>[]>(
		() => [
			{
				id: 'employee',
				accessorFn: (row) => getEmployeeName(row),
				header: t('table.headers.employee'),
				cell: ({ row }) => (
					<span className="font-medium">{getEmployeeName(row.original)}</span>
				),
			},
			{
				id: 'period',
				accessorFn: (row) => row.startDateKey,
				header: t('table.headers.period'),
				cell: ({ row }) =>
					formatDateRangeUtc(
						toUtcDate(row.original.startDateKey),
						toUtcDate(row.original.endDateKey),
					),
				enableGlobalFilter: false,
			},
			{
				id: 'days',
				accessorFn: (row) => row.summary.totalDays,
				header: t('table.headers.days'),
				cell: ({ row }) =>
					t('table.daysSummary', {
						vacation: row.original.summary.vacationDays,
						total: row.original.summary.totalDays,
					}),
				enableGlobalFilter: false,
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
				id: 'actions',
				header: t('table.headers.actions'),
				enableSorting: false,
				enableGlobalFilter: false,
				cell: ({ row }) => (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setDetailRequestWithNotes(row.original)}
					>
						{t('actions.viewDetail')}
					</Button>
				),
			},
		],
		[getEmployeeName, setDetailRequestWithNotes, t],
	);

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
			<div className="flex items-center justify-between gap-4">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
					<p className="text-muted-foreground">{t('subtitle')}</p>
				</div>
				<Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
					<DialogTrigger asChild>
						<Button>{t('actions.create')}</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-xl">
						<form
							onSubmit={(event) => {
								event.preventDefault();
								event.stopPropagation();
								createForm.handleSubmit();
							}}
							className="space-y-4"
						>
							<DialogHeader>
								<DialogTitle>{t('form.title')}</DialogTitle>
								<DialogDescription>{t('form.description')}</DialogDescription>
							</DialogHeader>

							<div className="grid gap-8 sm:grid-cols-2">
								<createForm.AppField
									name="employeeId"
									validators={{
										onChange: ({ value }) =>
											!value ? t('form.validation.employeeRequired') : undefined,
									}}
								>
									{(field) => (
										<field.SelectField
											label={t('form.fields.employee')}
											options={employees.map((employee) => ({
												value: employee.id,
												label: `${employee.firstName} ${employee.lastName}`.trim(),
											}))}
											placeholder={
												isLoadingEmployees
													? tCommon('loading')
													: t('form.placeholders.employee')
											}
											disabled={isLoadingEmployees}
										/>
									)}
								</createForm.AppField>

								<createForm.AppField name="status">
									{(field) => (
										<field.SelectField
											label={t('form.fields.status')}
											options={[
												{ value: 'SUBMITTED', label: t('status.SUBMITTED') },
												{ value: 'DRAFT', label: t('status.DRAFT') },
											]}
											placeholder={t('form.placeholders.status')}
										/>
									)}
								</createForm.AppField>
							</div>

							<div className="grid gap-4 sm:grid-cols-2">
								<createForm.AppField
									name="startDateKey"
									validators={{
										onChange: ({ value }) =>
											!value ? t('form.validation.startDateRequired') : undefined,
									}}
								>
									{(field) => (
										<div className="grid gap-2">
											<Label>{t('form.fields.startDate')}</Label>
											<Popover>
												<PopoverTrigger asChild>
													<Button
														variant="outline"
														data-empty={!field.state.value}
														className="data-[empty=true]:text-muted-foreground w-full justify-start text-left font-normal"
													>
														<CalendarIcon className="mr-2 h-4 w-4" />
														{field.state.value ? (
															formatShortDateUtc(toUtcDate(field.state.value))
														) : (
															<span>{t('form.placeholders.startDate')}</span>
														)}
													</Button>
												</PopoverTrigger>
												<PopoverContent className="w-auto p-0" align="start">
													<Calendar
														mode="single"
														selected={
															field.state.value
																? toLocalDate(field.state.value)
																: undefined
														}
														onSelect={(date) => {
															if (date) {
																field.handleChange(toDateKey(date));
															}
														}}
														initialFocus
													/>
												</PopoverContent>
											</Popover>
											{field.state.meta.errors.length > 0 && (
												<p className="text-sm text-destructive">
													{field.state.meta.errors.join(', ')}
												</p>
											)}
										</div>
									)}
								</createForm.AppField>

								<createForm.AppField
									name="endDateKey"
									validators={{
										onChange: ({ value }) => {
											if (!value) {
												return t('form.validation.endDateRequired');
											}
											if (
												createForm.state.values.startDateKey &&
												value < createForm.state.values.startDateKey
											) {
												return t('form.validation.dateRange');
											}
											return undefined;
										},
									}}
								>
									{(field) => (
										<div className="grid gap-2">
											<Label>{t('form.fields.endDate')}</Label>
											<Popover>
												<PopoverTrigger asChild>
													<Button
														variant="outline"
														data-empty={!field.state.value}
														className="data-[empty=true]:text-muted-foreground w-full justify-start text-left font-normal"
													>
														<CalendarIcon className="mr-2 h-4 w-4" />
														{field.state.value ? (
															formatShortDateUtc(toUtcDate(field.state.value))
														) : (
															<span>{t('form.placeholders.endDate')}</span>
														)}
													</Button>
												</PopoverTrigger>
												<PopoverContent className="w-auto p-0" align="start">
													<Calendar
														mode="single"
														selected={
															field.state.value
																? toLocalDate(field.state.value)
																: undefined
														}
														onSelect={(date) => {
															if (date) {
																field.handleChange(toDateKey(date));
															}
														}}
														initialFocus
													/>
												</PopoverContent>
											</Popover>
											{field.state.meta.errors.length > 0 && (
												<p className="text-sm text-destructive">
													{field.state.meta.errors.join(', ')}
												</p>
											)}
										</div>
									)}
								</createForm.AppField>
							</div>

							<createForm.AppField name="requestedNotes">
								{(field) => (
									<field.TextareaField
										label={t('form.fields.notes')}
										placeholder={t('form.placeholders.notes')}
										rows={3}
									/>
								)}
							</createForm.AppField>

							<DialogFooter>
								<createForm.AppForm>
									<createForm.SubmitButton
										label={t('form.actions.submit')}
										loadingLabel={tCommon('saving')}
									/>
								</createForm.AppForm>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t('filters.title')}</CardTitle>
					<CardDescription>{t('filters.description')}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<Tabs
						value={statusFilterValue}
						onValueChange={handleStatusFilterChange}
					>
						<TabsList className="flex flex-wrap">
							{statusTabs.map((tab) => (
								<TabsTrigger key={tab.value} value={tab.value}>
									{tab.label}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>

					<div className="flex flex-wrap items-center gap-3">
						<Select
							value={selectedEmployeeIdValue}
							onValueChange={handleEmployeeFilterChange}
						>
							<SelectTrigger className="w-[240px]">
								<SelectValue placeholder={t('filters.employee')} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">{t('filters.allEmployees')}</SelectItem>
								{employees.map((employee) => (
									<SelectItem key={employee.id} value={employee.id}>
										{employee.firstName} {employee.lastName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<label className="flex items-center gap-2">
								<span>{t('filters.from')}</span>
								<input
									type="date"
									className="rounded border px-2 py-1 text-sm"
									value={fromDate}
									onChange={(event) => handleFromDateChange(event.target.value)}
								/>
							</label>
							<label className="flex items-center gap-2">
								<span>{t('filters.to')}</span>
								<input
									type="date"
									className="rounded border px-2 py-1 text-sm"
									value={toDate}
									onChange={(event) => handleToDateChange(event.target.value)}
								/>
							</label>
						</div>
					</div>

					<DataTable
						columns={columns}
						data={requests}
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
				</CardContent>
			</Card>

			<Dialog
				open={Boolean(detailRequest)}
				onOpenChange={(open) => !open && setDetailRequestWithNotes(null)}
			>
				<DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-3xl">
					{detailRequest && (
						<div className="space-y-4">
							<DialogHeader>
								<DialogTitle>{t('detail.title')}</DialogTitle>
								<DialogDescription>{t('detail.description')}</DialogDescription>
							</DialogHeader>

							<div className="grid gap-3 text-sm">
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground">{t('detail.labels.employee')}</span>
									<span className="font-medium">{getEmployeeName(detailRequest)}</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground">{t('detail.labels.period')}</span>
									<span>
										{formatDateRangeUtc(
											toUtcDate(detailRequest.startDateKey),
											toUtcDate(detailRequest.endDateKey),
										)}
									</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground">{t('detail.labels.status')}</span>
									<Badge variant={statusVariants[detailRequest.status]}>
										{t(`status.${detailRequest.status}`)}
									</Badge>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground">{t('detail.labels.daysSummary')}</span>
									<span>
										{t('table.daysSummary', {
											vacation: detailRequest.summary.vacationDays,
											total: detailRequest.summary.totalDays,
										})}
									</span>
								</div>
								<div className="grid gap-2">
									<span className="text-muted-foreground">{t('detail.labels.requestedNotes')}</span>
									<p className="rounded-md border bg-muted/40 p-2 text-sm">
										{detailRequest.requestedNotes || tCommon('notAvailable')}
									</p>
								</div>
								<div className="grid gap-2">
									<span className="text-muted-foreground">{t('detail.labels.decisionNotes')}</span>
									<p className="rounded-md border bg-muted/40 p-2 text-sm">
										{detailRequest.decisionNotes || tCommon('notAvailable')}
									</p>
								</div>
							</div>

							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>{t('detail.dayTable.headers.date')}</TableHead>
											<TableHead>{t('detail.dayTable.headers.dayType')}</TableHead>
											<TableHead>{t('detail.dayTable.headers.counts')}</TableHead>
											<TableHead>{t('detail.dayTable.headers.serviceYear')}</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{detailRequest.days.map((day) => (
											<TableRow key={day.dateKey}>
												<TableCell>{formatShortDateUtc(toUtcDate(day.dateKey))}</TableCell>
												<TableCell>{dayTypeLabels[day.dayType]}</TableCell>
												<TableCell>
													{day.countsAsVacationDay
														? t('detail.dayTable.counts.yes')
														: t('detail.dayTable.counts.no')}
												</TableCell>
												<TableCell>{day.serviceYearNumber ?? '-'}</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>

							{detailRequest.status !== 'REJECTED' &&
							detailRequest.status !== 'CANCELLED' ? (
								<div className="space-y-3">
									<div>
										<p className="text-sm font-medium">{t('detail.actions.title')}</p>
										<p className="text-xs text-muted-foreground">
											{t('detail.actions.description')}
										</p>
									</div>
									<div className="grid gap-2">
										<Label htmlFor="decision-notes">{t('detail.actions.notesLabel')}</Label>
										<Textarea
											id="decision-notes"
											placeholder={t('detail.actions.notesPlaceholder')}
											value={decisionNotes}
											onChange={(event) => setDecisionNotes(event.target.value)}
										/>
									</div>
									<div className="flex flex-wrap items-center gap-2">
										{detailRequest.status === 'SUBMITTED' && (
											<>
												<Button
													onClick={() => handleDecision('approve')}
													disabled={approveMutation.isPending}
												>
													{approveMutation.isPending ? (
														<>
															<Loader2 className="mr-2 h-4 w-4 animate-spin" />
															{t('actions.approving')}
														</>
													) : (
														t('actions.approve')
													)}
												</Button>
												<Button
													variant="destructive"
													onClick={() => handleDecision('reject')}
													disabled={rejectMutation.isPending}
												>
													{rejectMutation.isPending ? (
														<>
															<Loader2 className="mr-2 h-4 w-4 animate-spin" />
															{t('actions.rejecting')}
														</>
													) : (
														t('actions.reject')
													)}
												</Button>
											</>
										)}
										<Button
											variant="outline"
											onClick={() => handleDecision('cancel')}
											disabled={cancelMutation.isPending}
										>
											{cancelMutation.isPending ? (
												<>
													<Loader2 className="mr-2 h-4 w-4 animate-spin" />
													{t('actions.cancelling')}
												</>
											) : (
												t('actions.cancel')
											)}
										</Button>
									</div>
								</div>
							) : null}

							<DialogFooter>
								<Button variant="outline" onClick={() => setDetailRequestWithNotes(null)}>
									{tCommon('close')}
								</Button>
							</DialogFooter>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
