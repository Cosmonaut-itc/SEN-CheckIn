'use client';

import React, { useMemo, useState } from 'react';
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
 * Converts a date key to a local Date instance at midnight.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Date instance at local midnight
 */
function toLocalDate(dateKey: string): Date {
	const [year, month, day] = dateKey.split('-').map(Number);
	return new Date(Number(year), Number(month) - 1, Number(day));
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
 * Vacations management page for HR/admin workflows.
 *
 * @returns Vacations page client component
 */
export function VacationsPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId } = useOrgContext();
	const t = useTranslations('Vacations');
	const tCommon = useTranslations('Common');

	const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
	const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
	const [fromDate, setFromDate] = useState<string>('');
	const [toDate, setToDate] = useState<string>('');
	const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
	const [detailRequest, setDetailRequest] = useState<VacationRequest | null>(null);
	const [decisionNotes, setDecisionNotes] = useState<string>('');

	/**
	 * Updates the detail request selection and resets decision notes.
	 *
	 * @param request - Vacation request to show, or null to clear
	 * @returns Nothing
	 */
	const setDetailRequestWithNotes = (request: VacationRequest | null): void => {
		setDetailRequest(request);
		setDecisionNotes('');
	};

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
			limit: 50,
			offset: 0,
			organizationId: organizationId ?? undefined,
			employeeId: selectedEmployeeId !== 'all' ? selectedEmployeeId : undefined,
			status: statusFilter !== 'all' ? statusFilter : undefined,
			from: fromDate || undefined,
			to: toDate || undefined,
		}),
		[organizationId, selectedEmployeeId, statusFilter, fromDate, toDate],
	);

	const { data: requestsResponse, isFetching } = useQuery({
		queryKey: queryKeys.vacations.list(requestParams),
		queryFn: () => fetchVacationRequestsList(requestParams),
		enabled: Boolean(organizationId),
	});

	const requests = requestsResponse?.data ?? [];

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
				toast.error(result.error ?? t('toast.createError'));
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
				toast.error(result.error ?? t('toast.approveError'));
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
				toast.error(result.error ?? t('toast.rejectError'));
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
				toast.error(result.error ?? t('toast.cancelError'));
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
	const getEmployeeName = (request: VacationRequest): string => {
		const fullName = `${request.employeeName ?? ''} ${request.employeeLastName ?? ''}`.trim();
		if (fullName) {
			return fullName;
		}
		return employeeLookup.get(request.employeeId) ?? request.employeeId;
	};

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

							<div className="grid gap-4 sm:grid-cols-2">
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
															formatShortDateUtc(toLocalDate(field.state.value))
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
															formatShortDateUtc(toLocalDate(field.state.value))
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
					<Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
						<TabsList className="flex flex-wrap">
							{statusTabs.map((tab) => (
								<TabsTrigger key={tab.value} value={tab.value}>
									{tab.label}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>

					<div className="flex flex-wrap items-center gap-3">
						<Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
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
									onChange={(event) => setFromDate(event.target.value)}
								/>
							</label>
							<label className="flex items-center gap-2">
								<span>{t('filters.to')}</span>
								<input
									type="date"
									className="rounded border px-2 py-1 text-sm"
									value={toDate}
									onChange={(event) => setToDate(event.target.value)}
								/>
							</label>
						</div>
					</div>

					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t('table.headers.employee')}</TableHead>
									<TableHead>{t('table.headers.period')}</TableHead>
									<TableHead>{t('table.headers.days')}</TableHead>
									<TableHead>{t('table.headers.status')}</TableHead>
									<TableHead className="w-[140px]">
										{t('table.headers.actions')}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{isFetching ? (
									<TableRow>
										<TableCell colSpan={5} className="h-20 text-center">
											<div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
												<Loader2 className="h-4 w-4 animate-spin" />
												{t('table.loading')}
											</div>
										</TableCell>
									</TableRow>
								) : requests.length === 0 ? (
									<TableRow>
										<TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
											{t('table.empty')}
										</TableCell>
									</TableRow>
								) : (
									requests.map((request) => (
										<TableRow key={request.id}>
											<TableCell className="font-medium">
												{getEmployeeName(request)}
											</TableCell>
											<TableCell>
												{formatDateRangeUtc(
													toLocalDate(request.startDateKey),
													toLocalDate(request.endDateKey),
												)}
											</TableCell>
											<TableCell>
												{t('table.daysSummary', {
													vacation: request.summary.vacationDays,
													total: request.summary.totalDays,
												})}
											</TableCell>
											<TableCell>
												<Badge variant={statusVariants[request.status]}>
													{t(`status.${request.status}`)}
												</Badge>
											</TableCell>
											<TableCell>
												<Button
													variant="outline"
													size="sm"
													onClick={() => setDetailRequestWithNotes(request)}
												>
													{t('actions.viewDetail')}
												</Button>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>
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
											toLocalDate(detailRequest.startDateKey),
											toLocalDate(detailRequest.endDateKey),
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
												<TableCell>{formatShortDateUtc(toLocalDate(day.dateKey))}</TableCell>
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
