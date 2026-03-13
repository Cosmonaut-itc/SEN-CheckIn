'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isValid, parse, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
	cancelOvertimeAuthorizationAction,
	createOvertimeAuthorizationAction,
} from '@/actions/overtime-authorizations';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { ResponsiveDataView } from '@/components/ui/responsive-data-view';
import { ResponsivePageHeader } from '@/components/ui/responsive-page-header';
import {
	fetchEmployeesList,
	fetchOvertimeAuthorizationsList,
	type Employee,
	type OvertimeAuthorization,
} from '@/lib/client-functions';
import { useOrgContext } from '@/lib/org-client-context';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { mutationKeys, queryKeys, type OvertimeAuthorizationQueryParams } from '@/lib/query-keys';
import { toDateKeyInTimeZone } from '@/lib/time-zone';
import type { ColumnDef, ColumnFiltersState, PaginationState, SortingState } from '@tanstack/react-table';

const DEFAULT_PAGE_SIZE = 20;
const EMPLOYEE_QUERY_LIMIT = 100;
const LEGAL_DAILY_OVERTIME_LIMIT = 3;

const SELECT_CLASS_NAME =
	'border-input h-9 w-full rounded-md border bg-background/80 px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-[var(--accent-primary)] focus-visible:ring-[var(--accent-primary-bg-hover)] focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50';
const DATE_TRIGGER_CLASS_NAME =
	'border-input text-foreground h-9 w-full rounded-md border bg-background/80 px-3 py-1 text-sm shadow-xs transition-[border-color,box-shadow,background-color] outline-none focus-visible:border-[var(--accent-primary)] focus-visible:ring-[var(--accent-primary-bg-hover)] focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Parses a date key into a local Date for calendar selection.
 *
 * @param value - Date key in yyyy-MM-dd format
 * @returns Parsed date or undefined when invalid
 */
function parseDateKey(value: string): Date | undefined {
	if (!value) {
		return undefined;
	}

	const parsedDate = parse(value, 'yyyy-MM-dd', new Date());
	return isValid(parsedDate) ? parsedDate : undefined;
}

/**
 * Extracts a warning message from a mutation payload when present.
 *
 * @param payload - Mutation payload returned by the server action
 * @returns Warning message or null when absent
 */
function getMutationWarning(payload: unknown): string | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const warning = (payload as { warning?: unknown }).warning;
	return typeof warning === 'string' && warning.trim() ? warning : null;
}

/**
 * Overtime authorizations management screen for admin users.
 *
 * @returns Overtime authorization manager content
 */
export function OvertimeAuthorizationsManager(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId, organizationTimeZone } = useOrgContext();
	const t = useTranslations('OvertimeAuthorizations');
	const tCommon = useTranslations('Common');

	const [employeeFilter, setEmployeeFilter] = useState<string>('');
	const [statusFilter, setStatusFilter] = useState<string>('');
	const [startDateFilter, setStartDateFilter] = useState<string>('');
	const [endDateFilter, setEndDateFilter] = useState<string>('');
	const [pageIndex, setPageIndex] = useState(0);
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [globalFilter, setGlobalFilter] = useState<string>('');
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	const [employeeSearch, setEmployeeSearch] = useState<string>('');
	const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
	const [dateKey, setDateKey] = useState<string>('');
	const [authorizedHoursInput, setAuthorizedHoursInput] = useState<string>('');
	const [notes, setNotes] = useState<string>('');

	/**
	 * Restores the create dialog inputs to their empty defaults.
	 *
	 * @returns Nothing
	 */
	const resetCreateForm = (): void => {
		setEmployeeSearch('');
		setSelectedEmployeeId('');
		setDateKey('');
		setAuthorizedHoursInput('');
		setNotes('');
	};

	/**
	 * Syncs dialog visibility and clears stale form state when closing it.
	 *
	 * @param open - Next open state emitted by the dialog root
	 * @returns Nothing
	 */
	const handleDialogOpenChange = (open: boolean): void => {
		setIsDialogOpen(open);
		if (!open) {
			resetCreateForm();
		}
	};

	/**
	 * Adapts TanStack pagination updates to the local page-index state.
	 *
	 * @param updater - Next pagination state or updater function
	 * @returns Nothing
	 */
	const handlePaginationChange = (
		updater: React.SetStateAction<PaginationState>,
	): void => {
		const currentState: PaginationState = {
			pageIndex,
			pageSize: DEFAULT_PAGE_SIZE,
		};
		const nextState =
			typeof updater === 'function' ? updater(currentState) : updater;
		setPageIndex(nextState.pageIndex);
	};

	const employeeQueryParams = useMemo(
		() =>
			organizationId
				? {
						organizationId,
						limit: EMPLOYEE_QUERY_LIMIT,
						offset: 0,
						search: employeeSearch || undefined,
					}
				: undefined,
		[employeeSearch, organizationId],
	);

	const listQueryParams = useMemo<OvertimeAuthorizationQueryParams | undefined>(() => {
		if (!organizationId) {
			return undefined;
		}

		return {
			organizationId,
			limit: DEFAULT_PAGE_SIZE,
			offset: pageIndex * DEFAULT_PAGE_SIZE,
			employeeId: employeeFilter || undefined,
			startDate: startDateFilter || undefined,
			endDate: endDateFilter || undefined,
			status:
				statusFilter === 'PENDING' ||
				statusFilter === 'ACTIVE' ||
				statusFilter === 'CANCELLED'
					? statusFilter
					: undefined,
		};
	}, [employeeFilter, endDateFilter, organizationId, pageIndex, startDateFilter, statusFilter]);

	const employeesQuery = useQuery({
		queryKey: queryKeys.employees.list(employeeQueryParams),
		queryFn: () => fetchEmployeesList(employeeQueryParams),
		enabled: Boolean(organizationId),
	});

	const authorizationsQuery = useQuery({
		queryKey: queryKeys.overtimeAuthorizations.list(listQueryParams),
		queryFn: () => fetchOvertimeAuthorizationsList(listQueryParams),
		enabled: Boolean(organizationId),
	});

	const employees = employeesQuery.data?.data ?? [];
	const authorizations = authorizationsQuery.data?.data ?? [];
	const pagination = authorizationsQuery.data?.pagination ?? {
		total: 0,
		limit: DEFAULT_PAGE_SIZE,
		offset: pageIndex * DEFAULT_PAGE_SIZE,
	};

	const createMutation = useMutation({
		mutationKey: mutationKeys.overtimeAuthorizations.create,
		mutationFn: createOvertimeAuthorizationAction,
		onSuccess: (result) => {
			if (!result.success) {
				toast.error(result.error ?? t('toast.createError'));
				return;
			}

			const warning = getMutationWarning(result.data);
			if (warning) {
				toast.warning(warning, { duration: 8000 });
			}
			toast.success(t('toast.createSuccess'));
			setIsDialogOpen(false);
			resetCreateForm();
			queryClient.invalidateQueries({ queryKey: queryKeys.overtimeAuthorizations.all });
		},
		onError: () => {
			toast.error(t('toast.createError'));
		},
	});

	const cancelMutation = useMutation({
		mutationKey: mutationKeys.overtimeAuthorizations.cancel,
		mutationFn: cancelOvertimeAuthorizationAction,
		onSuccess: (result) => {
			if (!result.success) {
				toast.error(t('toast.cancelError'));
				return;
			}

			toast.success(t('toast.cancelSuccess'));
			queryClient.invalidateQueries({ queryKey: queryKeys.overtimeAuthorizations.all });
		},
		onError: () => {
			toast.error(t('toast.cancelError'));
		},
	});

	/**
	 * Validates the form and dispatches the create authorization mutation.
	 *
	 * @returns Nothing
	 */
	const handleCreateAuthorization = (): void => {
		if (createMutation.isPending) {
			return;
		}

		if (!organizationId) {
			toast.error(t('toast.createError'));
			return;
		}

		const authorizedHoursValue = Number(authorizedHoursInput);
		if (
			!selectedEmployeeId ||
			!dateKey ||
			!Number.isFinite(authorizedHoursValue) ||
			authorizedHoursValue <= 0
		) {
			toast.error(t('toast.createError'));
			return;
		}

		createMutation.mutate({
			organizationId,
			employeeId: selectedEmployeeId,
			dateKey,
			authorizedHours: authorizedHoursValue,
			notes: notes.trim() || undefined,
		});
	};

	const helperShouldWarn = Number(authorizedHoursInput || 0) > LEGAL_DAILY_OVERTIME_LIMIT;
	const isCreateFormValid =
		Boolean(selectedEmployeeId) &&
		Boolean(dateKey) &&
		Number.isFinite(Number(authorizedHoursInput)) &&
		Number(authorizedHoursInput) > 0;
	const selectedAuthorizationDate = parseDateKey(dateKey);
	const minimumAuthorizationDate = organizationTimeZone
		? toDateKeyInTimeZone(new Date(), organizationTimeZone)
		: format(startOfDay(new Date()), 'yyyy-MM-dd');
	const minimumAuthorizationDateValue = startOfDay(
		parseDateKey(minimumAuthorizationDate) ?? new Date(),
	);
	const resolvedOrganizationId = organizationId ?? '';

	const columns = useMemo<ColumnDef<OvertimeAuthorization>[]>(
		() => [
			{
				id: 'employee',
				accessorFn: (row) => row.employeeName ?? row.employeeId,
				header: t('table.headers.employee'),
				cell: ({ row }) => (
					<span className="font-medium">
						{row.original.employeeName ?? row.original.employeeId}
					</span>
				),
			},
			{
				accessorKey: 'dateKey',
				header: t('table.headers.date'),
			},
			{
				id: 'authorizedHours',
				accessorFn: (row) => row.authorizedHours,
				header: t('table.headers.hours'),
				cell: ({ row }) => row.original.authorizedHours.toFixed(2),
			},
			{
				accessorKey: 'status',
				header: t('table.headers.status'),
				cell: ({ row }) => (
					<Badge
						data-testid={`overtime-authorization-status-${row.original.id}`}
						variant={
							row.original.status === 'CANCELLED'
								? 'neutral'
								: row.original.status === 'PENDING'
									? 'warning'
									: 'success'
						}
					>
						{t(`status.${row.original.status}`)}
					</Badge>
				),
			},
			{
				id: 'authorizedByName',
				accessorFn: (row) => row.authorizedByName ?? '',
				header: t('table.headers.createdBy'),
				cell: ({ row }) => row.original.authorizedByName ?? '—',
			},
			{
				id: 'actions',
				header: t('table.headers.actions'),
				enableSorting: false,
				enableGlobalFilter: false,
				cell: ({ row }) =>
					row.original.status === 'ACTIVE' ? (
						<Button
							type="button"
							variant="outline"
							className="min-h-11"
							data-testid={`overtime-cancel-button-${row.original.id}`}
							disabled={cancelMutation.isPending}
							onClick={() =>
								cancelMutation.mutate({
									organizationId: resolvedOrganizationId,
									id: row.original.id,
								})
							}
						>
							{t('actions.cancel')}
						</Button>
					) : (
						<span className="text-muted-foreground">—</span>
					),
			},
		],
		[cancelMutation, resolvedOrganizationId, t],
	);

	const renderAuthorizationCard = useCallback(
		(authorization: OvertimeAuthorization): React.ReactNode => (
			<div className="space-y-4">
				<div className="flex items-start justify-between gap-3">
					<div className="space-y-1">
						<p className="text-base font-semibold">
							{authorization.employeeName ?? authorization.employeeId}
						</p>
						<p className="text-sm text-muted-foreground">{authorization.dateKey}</p>
					</div>
					<Badge
						variant={
							authorization.status === 'CANCELLED'
								? 'neutral'
								: authorization.status === 'PENDING'
									? 'warning'
									: 'success'
						}
					>
						{t(`status.${authorization.status}`)}
					</Badge>
				</div>

				<div className="grid gap-3">
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1">
							<p className="text-sm text-muted-foreground">{t('table.headers.hours')}</p>
							<p className="text-sm font-medium">
								{authorization.authorizedHours.toFixed(2)}
							</p>
						</div>
						<div className="space-y-1">
							<p className="text-sm text-muted-foreground">
								{t('table.headers.createdBy')}
							</p>
							<p className="text-sm font-medium">
								{authorization.authorizedByName ?? '—'}
							</p>
						</div>
					</div>
				</div>

				{authorization.status === 'ACTIVE' ? (
					<Button
						type="button"
						variant="outline"
						className="min-h-11 w-full"
						data-testid={`overtime-cancel-button-${authorization.id}`}
						disabled={cancelMutation.isPending}
						onClick={() =>
							cancelMutation.mutate({
								organizationId: resolvedOrganizationId,
								id: authorization.id,
							})
						}
					>
						{t('actions.cancel')}
					</Button>
				) : null}
			</div>
		),
		[cancelMutation, resolvedOrganizationId, t],
	);

	if (!organizationId) {
		return (
			<div className="space-y-2">
				<ResponsivePageHeader title={t('title')} description={t('noOrganization')} />
			</div>
		);
	}

	return (
		<div className="min-w-0 space-y-6">
			<ResponsivePageHeader
				title={t('title')}
				description={t('subtitle')}
				actions={
					<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
						<DialogTrigger asChild>
							<Button data-testid="overtime-create-trigger" className="min-h-11">
								{t('actions.create')}
							</Button>
						</DialogTrigger>
						<DialogContent className="w-full max-w-[calc(100vw-2rem)] min-[640px]:max-w-lg">
						<DialogHeader>
							<DialogTitle>{t('form.title')}</DialogTitle>
							<DialogDescription>{t('subtitle')}</DialogDescription>
						</DialogHeader>

						<form
							className="space-y-4"
							onSubmit={(event) => {
								event.preventDefault();
								handleCreateAuthorization();
							}}
						>
							<div className="space-y-2">
								<Label htmlFor="overtime-employee-search">
									{t('form.fields.search')}
								</Label>
								<Input
									id="overtime-employee-search"
									data-testid="overtime-employee-search"
									value={employeeSearch}
									onChange={(event) => setEmployeeSearch(event.target.value)}
									placeholder={t('form.placeholders.search')}
									className="min-h-11"
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="overtime-employee">
									{t('form.fields.employee')}
								</Label>
								<select
									id="overtime-employee"
									data-testid="overtime-employee-select"
									className={SELECT_CLASS_NAME}
									value={selectedEmployeeId}
									onChange={(event) => setSelectedEmployeeId(event.target.value)}
								>
									<option value="">{t('form.placeholders.employee')}</option>
									{employees.map((employee: Employee) => (
										<option key={employee.id} value={employee.id}>
											{`${employee.firstName} ${employee.lastName}`.trim()}
										</option>
									))}
								</select>
							</div>

							<div className="grid gap-4 min-[640px]:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor="overtime-date">{t('form.fields.date')}</Label>
									<Popover>
										<PopoverTrigger asChild>
											<button
												id="overtime-date"
												type="button"
												data-testid="overtime-date-trigger"
												data-empty={!selectedAuthorizationDate}
												className={`${DATE_TRIGGER_CLASS_NAME} data-[empty=true]:text-muted-foreground inline-flex items-center justify-between gap-2 text-left font-normal`}
											>
												<span className="truncate">
													{selectedAuthorizationDate ? (
														format(selectedAuthorizationDate, 'PPP', {
															locale: es,
														})
													) : (
														<span>{t('form.placeholders.date')}</span>
													)}
												</span>
											<CalendarIcon className="ml-2 h-4 w-4 shrink-0 opacity-70" />
										</button>
									</PopoverTrigger>
									<PopoverContent
										className="w-[calc(100vw-2rem)] max-w-full p-0 min-[640px]:w-auto"
										align="start"
										data-testid="overtime-date-calendar"
									>
											<Calendar
												mode="single"
												selected={selectedAuthorizationDate}
												onSelect={(date) =>
													setDateKey(date ? format(date, 'yyyy-MM-dd') : '')
												}
												disabled={{ before: minimumAuthorizationDateValue }}
												initialFocus
											/>
										</PopoverContent>
									</Popover>
								</div>

								<div className="space-y-2">
									<Label htmlFor="overtime-hours">{t('form.fields.hours')}</Label>
									<Input
										id="overtime-hours"
										data-testid="overtime-hours-input"
										type="number"
										step="0.25"
										min="0.25"
										value={authorizedHoursInput}
										onChange={(event) =>
											setAuthorizedHoursInput(event.target.value)
										}
										placeholder={t('form.placeholders.hours')}
										className="min-h-11"
									/>
								</div>
							</div>

							<p
								data-testid="overtime-legal-warning"
								className={`text-xs ${
									helperShouldWarn
										? 'text-[var(--status-warning)]'
										: 'text-muted-foreground'
								}`}
							>
								{t('form.helper.legalLimit')}
							</p>

							<div className="space-y-2">
								<Label htmlFor="overtime-notes">{t('form.fields.notes')}</Label>
								<Input
									id="overtime-notes"
									data-testid="overtime-notes-input"
									value={notes}
									onChange={(event) => setNotes(event.target.value)}
									placeholder={t('form.placeholders.notes')}
									className="min-h-11"
								/>
							</div>

							<div className="flex flex-col-reverse gap-2 min-[640px]:flex-row min-[640px]:justify-end">
								<DialogClose asChild>
									<Button
										type="button"
										variant="outline"
										data-testid="overtime-cancel-dialog"
										className="min-h-11"
									>
										{tCommon('cancel')}
									</Button>
								</DialogClose>
								<Button
									type="button"
									data-testid="overtime-submit-button"
									disabled={createMutation.isPending || !isCreateFormValid}
									onClick={handleCreateAuthorization}
									className="min-h-11"
								>
									{createMutation.isPending
										? t('actions.createSubmitting')
										: t('form.actions.submit')}
								</Button>
							</div>
						</form>
						</DialogContent>
					</Dialog>
				}
			/>

			<div className="grid gap-4 min-[1025px]:grid-cols-4">
				<div className="space-y-2">
					<Label htmlFor="filter-employee">{t('filters.employee')}</Label>
					<select
						id="filter-employee"
						className={SELECT_CLASS_NAME}
						value={employeeFilter}
						onChange={(event) => {
							setEmployeeFilter(event.target.value);
							setPageIndex(0);
						}}
					>
						<option value="">{t('filters.allEmployees')}</option>
						{employees.map((employee: Employee) => (
							<option key={employee.id} value={employee.id}>
								{`${employee.firstName} ${employee.lastName}`.trim()}
							</option>
						))}
					</select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="filter-status">{t('filters.status')}</Label>
					<select
						id="filter-status"
						className={SELECT_CLASS_NAME}
						value={statusFilter}
						onChange={(event) => {
							setStatusFilter(event.target.value);
							setPageIndex(0);
						}}
					>
						<option value="">{t('filters.allStatuses')}</option>
						<option value="PENDING">{t('status.PENDING')}</option>
						<option value="ACTIVE">{t('status.ACTIVE')}</option>
						<option value="CANCELLED">{t('status.CANCELLED')}</option>
					</select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="filter-start-date">{t('filters.startDate')}</Label>
					<Input
						id="filter-start-date"
						type="date"
						value={startDateFilter}
						onChange={(event) => {
							setStartDateFilter(event.target.value);
							setPageIndex(0);
						}}
						className="min-h-11"
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="filter-end-date">{t('filters.endDate')}</Label>
					<Input
						id="filter-end-date"
						type="date"
						value={endDateFilter}
						onChange={(event) => {
							setEndDateFilter(event.target.value);
							setPageIndex(0);
						}}
						className="min-h-11"
					/>
				</div>
			</div>

			<ResponsiveDataView
				columns={columns}
				data={authorizations}
				cardRenderer={renderAuthorizationCard}
				getCardKey={(authorization) => authorization.id}
				sorting={sorting}
				onSortingChange={setSorting}
				pagination={{ pageIndex, pageSize: DEFAULT_PAGE_SIZE }}
				onPaginationChange={handlePaginationChange}
				columnFilters={columnFilters}
				onColumnFiltersChange={setColumnFilters}
				globalFilter={globalFilter}
				onGlobalFilterChange={setGlobalFilter}
				showToolbar={false}
				showGlobalFilter={false}
				manualPagination
				manualFiltering
				rowCount={pagination.total}
				pageSizeOptions={[DEFAULT_PAGE_SIZE]}
				emptyState={t('table.empty')}
				isLoading={authorizationsQuery.isLoading || authorizationsQuery.isFetching}
			/>
		</div>
	);
}
