'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table/data-table';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useTranslations } from 'next-intl';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { formatShortDateUtc } from '@/lib/date-format';
import {
	fetchScheduleExceptionsList,
	type Employee,
	type ScheduleException,
} from '@/lib/client-functions';
import {
	createScheduleException,
	deleteScheduleException,
	updateScheduleException,
} from '@/actions/schedules';
import { ExceptionFormDialog } from './exception-form-dialog';
import type { ColumnDef, ColumnFiltersState, PaginationState, SortingState } from '@tanstack/react-table';

/**
 * Derives the first and last day of the current month.
 *
 * @returns Tuple with start and end ISO strings
 */
function getCurrentMonthRange(): { start: string; end: string } {
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), 1);
	const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/**
 * Props for ScheduleExceptionsTab component.
 */
interface ScheduleExceptionsTabProps {
	/** Organization identifier */
	organizationId?: string | null;
	/** Employee list for filtering and selection */
	employees: Employee[];
}

/**
 * Exceptions management tab for creating, editing, and deleting schedule exceptions.
 *
 * @param props - Component props
 * @returns Rendered exceptions tab
 */
export function ScheduleExceptionsTab({
	organizationId,
	employees,
}: ScheduleExceptionsTabProps): React.ReactElement {
	const t = useTranslations('Schedules');
	const tCommon = useTranslations('Common');
	const queryClient = useQueryClient();
	const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
	const [editingException, setEditingException] = useState<ScheduleException | null>(null);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [globalFilter, setGlobalFilter] = useState<string>('');
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const monthRange = useMemo(() => getCurrentMonthRange(), []);
	const [fromDate, setFromDate] = useState<string>(monthRange.start);
	const [toDate, setToDate] = useState<string>(monthRange.end);
	const selectedEmployeeIdValue =
		(columnFilters.find((filter) => filter.id === 'employeeId')?.value as
			| string
			| undefined) ?? 'all';

	const listParams = useMemo(
		() => ({
			limit: pagination.pageSize,
			offset: pagination.pageIndex * pagination.pageSize,
			organizationId: organizationId ?? undefined,
			employeeId: selectedEmployeeIdValue !== 'all' ? selectedEmployeeIdValue : undefined,
			fromDate: fromDate ? new Date(fromDate) : undefined,
			toDate: toDate ? new Date(toDate) : undefined,
		}),
		[
			fromDate,
			organizationId,
			pagination.pageIndex,
			pagination.pageSize,
			selectedEmployeeIdValue,
			toDate,
		],
	);

	const { data: exceptionsResponse, isFetching } = useQuery({
		queryKey: queryKeys.scheduleExceptions.list(listParams),
		queryFn: () => fetchScheduleExceptionsList(listParams),
		enabled: Boolean(organizationId),
	});

	const createMutation = useMutation({
		mutationKey: mutationKeys.scheduleExceptions.create,
		mutationFn: createScheduleException,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('exceptions.toast.createSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.scheduleExceptions.all });
				setIsFormOpen(false);
			} else {
				toast.error(result.error ?? t('exceptions.toast.createError'));
			}
		},
		onError: () => toast.error(t('exceptions.toast.createError')),
	});

	const updateMutation = useMutation({
		mutationKey: mutationKeys.scheduleExceptions.update,
		mutationFn: updateScheduleException,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('exceptions.toast.updateSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.scheduleExceptions.all });
				setIsFormOpen(false);
				setEditingException(null);
			} else {
				toast.error(result.error ?? t('exceptions.toast.updateError'));
			}
		},
		onError: () => toast.error(t('exceptions.toast.updateError')),
	});

	const deleteMutation = useMutation({
		mutationKey: mutationKeys.scheduleExceptions.delete,
		mutationFn: deleteScheduleException,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('exceptions.toast.deleteSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.scheduleExceptions.all });
			} else {
				toast.error(result.error ?? t('exceptions.toast.deleteError'));
			}
		},
		onError: () => toast.error(t('exceptions.toast.deleteError')),
	});

	const exceptions = exceptionsResponse?.data ?? [];
	const totalRows = exceptionsResponse?.pagination.total ?? 0;

	const handleSubmit = async (input: {
		id?: string;
		employeeId: string;
		exceptionDate: Date;
		exceptionType: ScheduleException['exceptionType'];
		startTime?: string | null;
		endTime?: string | null;
		reason?: string | null;
	}): Promise<void> => {
		if (input.id) {
			await updateMutation.mutateAsync({
				id: input.id,
				exceptionDate: input.exceptionDate,
				exceptionType: input.exceptionType,
				startTime: input.startTime,
				endTime: input.endTime,
				reason: input.reason,
			});
		} else {
			if (!organizationId) {
				toast.error(t('exceptions.toast.noOrganization'));
				return;
			}
			await createMutation.mutateAsync({
				employeeId: input.employeeId,
				exceptionDate: input.exceptionDate,
				exceptionType: input.exceptionType,
				startTime: input.startTime ?? undefined,
				endTime: input.endTime ?? undefined,
				reason: input.reason,
			});
		}
	};

	/**
	 * Resets pagination to the first page.
	 *
	 * @returns void
	 */
	const resetPagination = useCallback((): void => {
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}, []);

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

	const columns = useMemo<ColumnDef<ScheduleException>[]>(
		() => [
			{
				id: 'employee',
				accessorFn: (row) =>
					row.employeeName
						? `${row.employeeName} ${row.employeeLastName ?? ''}`.trim()
						: row.employeeId,
				header: t('exceptions.table.headers.employee'),
				cell: ({ row }) =>
					row.original.employeeName
						? `${row.original.employeeName} ${row.original.employeeLastName ?? ''}`.trim()
						: row.original.employeeId,
			},
			{
				id: 'date',
				accessorFn: (row) => new Date(row.exceptionDate).getTime(),
				header: t('exceptions.table.headers.date'),
				cell: ({ row }) => formatShortDateUtc(new Date(row.original.exceptionDate)),
				enableGlobalFilter: false,
			},
			{
				accessorKey: 'exceptionType',
				header: t('exceptions.table.headers.type'),
				cell: ({ row }) => t(`exceptions.types.${row.original.exceptionType}`),
				enableGlobalFilter: false,
			},
			{
				id: 'time',
				accessorFn: (row) => row.startTime ?? '',
				header: t('exceptions.table.headers.time'),
				cell: ({ row }) =>
					row.original.startTime && row.original.endTime
						? `${row.original.startTime} - ${row.original.endTime}`
						: tCommon('notAvailable'),
				enableGlobalFilter: false,
			},
			{
				accessorKey: 'reason',
				header: t('exceptions.table.headers.reason'),
				cell: ({ row }) => row.original.reason ?? '-',
				enableGlobalFilter: false,
			},
			{
				id: 'actions',
				header: t('exceptions.table.headers.actions'),
				enableSorting: false,
				enableGlobalFilter: false,
				cell: ({ row }) => (
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon"
							onClick={() => {
								setEditingException(row.original);
								setIsFormOpen(true);
							}}
							title={t('exceptions.actions.editTitle')}
							aria-label={t('exceptions.actions.editTitle')}
						>
							<Pencil className="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => setDeleteId(row.original.id)}
							title={t('exceptions.actions.deleteTitle')}
							aria-label={t('exceptions.actions.deleteTitle')}
						>
							<Trash2 className="h-4 w-4 text-destructive" />
						</Button>
					</div>
				),
			},
		],
		[t, tCommon],
	);

	if (!organizationId) {
		return (
			<div className="space-y-2 rounded-md border p-4">
				<h2 className="text-lg font-semibold">{t('tabs.exceptions')}</h2>
				<p className="text-muted-foreground">{t('exceptions.noOrganization')}</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h2 className="text-xl font-semibold">{t('exceptions.title')}</h2>
					<p className="text-sm text-muted-foreground">{t('exceptions.description')}</p>
				</div>
				<Button
					onClick={() => {
						setEditingException(null);
						setIsFormOpen(true);
					}}
				>
					<Plus className="mr-2 h-4 w-4" />
					{t('exceptions.actions.add')}
				</Button>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<Select
					value={selectedEmployeeIdValue}
					onValueChange={handleEmployeeFilterChange}
				>
					<SelectTrigger className="w-[240px]">
						<SelectValue placeholder={t('exceptions.filters.allEmployees')} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{t('exceptions.filters.allEmployees')}</SelectItem>
						{employees.map((employee) => (
							<SelectItem key={employee.id} value={employee.id}>
								{employee.firstName} {employee.lastName}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<label className="flex items-center gap-2">
						<span>{t('exceptions.filters.from')}</span>
						<input
							type="date"
							className="rounded border px-2 py-1 text-sm"
							value={fromDate}
							onChange={(event) => handleFromDateChange(event.target.value)}
						/>
					</label>
					<label className="flex items-center gap-2">
						<span>{t('exceptions.filters.to')}</span>
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
				data={exceptions}
				sorting={sorting}
				onSortingChange={setSorting}
				pagination={pagination}
				onPaginationChange={setPagination}
				columnFilters={columnFilters}
				onColumnFiltersChange={handleColumnFiltersChange}
				globalFilter={globalFilter}
				onGlobalFilterChange={setGlobalFilter}
				showToolbar={false}
				manualPagination
				manualFiltering
				rowCount={totalRows}
				emptyState={t('exceptions.table.empty')}
				isLoading={isFetching}
			/>

			<ExceptionFormDialog
				open={isFormOpen}
				onOpenChange={(open) => {
					setIsFormOpen(open);
					if (!open) {
						setEditingException(null);
					}
				}}
				employees={employees}
				onSubmit={handleSubmit}
				initialException={editingException}
			/>

			<Dialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('exceptions.dialogs.delete.title')}</DialogTitle>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteId(null)}>
							{tCommon('cancel')}
						</Button>
						<Button
							variant="destructive"
							onClick={() => deleteId && deleteMutation.mutate(deleteId)}
						>
							{tCommon('delete')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
