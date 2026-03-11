'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isValid, parse, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import React, { useMemo, useState } from 'react';
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
	fetchEmployeesList,
	fetchOvertimeAuthorizationsList,
	type Employee,
} from '@/lib/client-functions';
import { useOrgContext } from '@/lib/org-client-context';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { mutationKeys, queryKeys, type OvertimeAuthorizationQueryParams } from '@/lib/query-keys';

const DEFAULT_PAGE_SIZE = 20;
const EMPLOYEE_QUERY_LIMIT = 100;
const LEGAL_DAILY_OVERTIME_LIMIT = 3;

const SELECT_CLASS_NAME =
	'border-input h-9 w-full rounded-md border bg-background/80 px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-[var(--accent-primary)] focus-visible:ring-[var(--accent-primary-bg-hover)] focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50';

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
 * Overtime authorizations management screen for admin users.
 *
 * @returns Overtime authorization manager content
 */
export function OvertimeAuthorizationsManager(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId } = useOrgContext();
	const t = useTranslations('OvertimeAuthorizations');
	const tCommon = useTranslations('Common');

	const [employeeFilter, setEmployeeFilter] = useState<string>('');
	const [statusFilter, setStatusFilter] = useState<string>('');
	const [startDateFilter, setStartDateFilter] = useState<string>('');
	const [endDateFilter, setEndDateFilter] = useState<string>('');
	const [pageIndex, setPageIndex] = useState(0);
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
				toast.error(t('toast.createError'));
				return;
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

	if (!organizationId) {
		return (
			<div className="space-y-2">
				<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
				<p className="text-muted-foreground">{t('noOrganization')}</p>
			</div>
		);
	}

	const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
	const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
	const canGoPrevious = pagination.offset > 0;
	const canGoNext = pagination.offset + pagination.limit < pagination.total;
	const helperShouldWarn = Number(authorizedHoursInput || 0) > LEGAL_DAILY_OVERTIME_LIMIT;
	const isCreateFormValid =
		Boolean(selectedEmployeeId) &&
		Boolean(dateKey) &&
		Number.isFinite(Number(authorizedHoursInput)) &&
		Number(authorizedHoursInput) > 0;
	const selectedAuthorizationDate = parseDateKey(dateKey);
	const today = startOfDay(new Date());

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div className="space-y-1">
					<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
					<p className="text-muted-foreground">{t('subtitle')}</p>
				</div>

				<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
					<DialogTrigger asChild>
						<Button data-testid="overtime-create-trigger">{t('actions.create')}</Button>
					</DialogTrigger>
					<DialogContent>
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

							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor="overtime-date">{t('form.fields.date')}</Label>
									<Popover>
										<PopoverTrigger asChild>
											<Button
												id="overtime-date"
												type="button"
												variant="outline"
												data-testid="overtime-date-trigger"
												data-empty={!selectedAuthorizationDate}
												className="data-[empty=true]:text-muted-foreground w-full justify-start text-left font-normal"
											>
												<CalendarIcon className="mr-2 h-4 w-4" />
												{selectedAuthorizationDate ? (
													format(selectedAuthorizationDate, 'PPP', {
														locale: es,
													})
												) : (
													<span>{t('form.placeholders.date')}</span>
												)}
											</Button>
										</PopoverTrigger>
										<PopoverContent
											className="w-auto p-0"
											align="start"
											data-testid="overtime-date-calendar"
										>
											<Calendar
												mode="single"
												selected={selectedAuthorizationDate}
												onSelect={(date) =>
													setDateKey(date ? format(date, 'yyyy-MM-dd') : '')
												}
												disabled={{ before: today }}
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
								/>
							</div>

							<div className="flex justify-end gap-2">
								<DialogClose asChild>
									<Button
										type="button"
										variant="outline"
										data-testid="overtime-cancel-dialog"
									>
										{tCommon('cancel')}
									</Button>
								</DialogClose>
								<Button
									type="button"
									data-testid="overtime-submit-button"
									disabled={createMutation.isPending || !isCreateFormValid}
									onClick={handleCreateAuthorization}
								>
									{createMutation.isPending
										? t('actions.createSubmitting')
										: t('form.actions.submit')}
								</Button>
							</div>
						</form>
					</DialogContent>
				</Dialog>
			</div>

			<div className="grid gap-4 md:grid-cols-4">
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
					/>
				</div>
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t('table.headers.employee')}</TableHead>
							<TableHead>{t('table.headers.date')}</TableHead>
							<TableHead>{t('table.headers.hours')}</TableHead>
							<TableHead>{t('table.headers.status')}</TableHead>
							<TableHead>{t('table.headers.createdBy')}</TableHead>
							<TableHead>{t('table.headers.actions')}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{authorizationsQuery.isLoading || authorizationsQuery.isFetching ? (
							<TableRow>
								<TableCell
									colSpan={6}
									className="text-center text-muted-foreground"
								>
									{tCommon('loading')}
								</TableCell>
							</TableRow>
						) : authorizations.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={6}
									className="text-center text-muted-foreground"
								>
									{t('table.empty')}
								</TableCell>
							</TableRow>
						) : (
							authorizations.map((authorization) => (
								<TableRow key={authorization.id}>
									<TableCell className="font-medium">
										{authorization.employeeName ?? authorization.employeeId}
									</TableCell>
									<TableCell>{authorization.dateKey}</TableCell>
									<TableCell>
										{authorization.authorizedHours.toFixed(2)}
									</TableCell>
									<TableCell>
										<Badge
											data-testid={`overtime-authorization-status-${authorization.id}`}
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
									</TableCell>
									<TableCell>{authorization.authorizedByName ?? '—'}</TableCell>
									<TableCell>
										{authorization.status === 'ACTIVE' ? (
											<Button
												variant="outline"
												size="sm"
												data-testid={`overtime-cancel-button-${authorization.id}`}
												disabled={cancelMutation.isPending}
												onClick={() =>
													cancelMutation.mutate({
														organizationId,
														id: authorization.id,
													})
												}
											>
												{t('actions.cancel')}
											</Button>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			<div className="flex items-center justify-between gap-3">
				<p className="text-sm text-muted-foreground">
					{currentPage} / {totalPages}
				</p>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
						disabled={!canGoPrevious}
					>
						{tCommon('previous')}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setPageIndex((current) => current + 1)}
						disabled={!canGoNext}
					>
						{tCommon('next')}
					</Button>
				</div>
			</div>
		</div>
	);
}
