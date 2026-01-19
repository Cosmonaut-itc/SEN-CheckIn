'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient, useQueries } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table/data-table';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { formatMonthDayUtc } from '@/lib/date-format';
import {
	fetchScheduleTemplatesList,
	fetchScheduleTemplateDetail,
	type Employee,
	type ScheduleTemplate,
} from '@/lib/client-functions';
import {
	assignTemplateToEmployees,
	createScheduleTemplate,
	deleteScheduleTemplate,
	updateScheduleTemplate,
	type ScheduleTemplateDayInput,
} from '@/actions/schedules';
import { TemplateFormDialog } from './template-form-dialog';
import type { ColumnDef, ColumnFiltersState, PaginationState, SortingState } from '@tanstack/react-table';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type DayKey = (typeof DAY_KEYS)[number];

/** Props for ScheduleTemplatesTab component. */
interface ScheduleTemplatesTabProps {
	/** Organization identifier */
	organizationId?: string | null;
	/** Employees available for assignments */
	employees: Employee[];
	/** Week start day for contextual hints */
	weekStartDay: number;
	/** Overtime enforcement mode from payroll settings */
	overtimeEnforcement: 'WARN' | 'BLOCK';
}

/**
 * Schedule templates tab with CRUD and assignment actions.
 *
 * @param props - Component props
 * @returns Rendered templates tab
 */
export function ScheduleTemplatesTab({
	organizationId,
	employees,
	weekStartDay,
	overtimeEnforcement,
}: ScheduleTemplatesTabProps): React.ReactElement {
	const t = useTranslations('Schedules');
	const tCommon = useTranslations('Common');
	const queryClient = useQueryClient();
	const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
	const [editingTemplate, setEditingTemplate] = useState<ScheduleTemplate | null>(null);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [assigningTemplate, setAssigningTemplate] = useState<ScheduleTemplate | null>(null);
	const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
	const [globalFilter, setGlobalFilter] = useState<string>('');
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const normalizedSearch = globalFilter.trim();

	const listParams = useMemo(
		() => ({
			limit: pagination.pageSize,
			offset: pagination.pageIndex * pagination.pageSize,
			organizationId: organizationId ?? undefined,
			...(normalizedSearch ? { search: normalizedSearch } : {}),
		}),
		[normalizedSearch, organizationId, pagination.pageIndex, pagination.pageSize],
	);

	const { data: templatesResponse, isFetching } = useQuery({
		queryKey: queryKeys.scheduleTemplates.list(listParams),
		queryFn: () => fetchScheduleTemplatesList(listParams),
		enabled: Boolean(organizationId),
	});

	const createMutation = useMutation({
		mutationKey: mutationKeys.scheduleTemplates.create,
		mutationFn: createScheduleTemplate,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('templates.toast.createSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.scheduleTemplates.all });
			} else {
				toast.error(result.error ?? t('templates.toast.createError'));
			}
		},
		onError: () => toast.error(t('templates.toast.createError')),
	});

	const updateMutation = useMutation({
		mutationKey: mutationKeys.scheduleTemplates.update,
		mutationFn: updateScheduleTemplate,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('templates.toast.updateSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.scheduleTemplates.all });
			} else {
				toast.error(result.error ?? t('templates.toast.updateError'));
			}
		},
		onError: () => toast.error(t('templates.toast.updateError')),
	});

	const deleteMutation = useMutation({
		mutationKey: mutationKeys.scheduleTemplates.delete,
		mutationFn: deleteScheduleTemplate,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('templates.toast.deleteSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.scheduleTemplates.all });
			} else {
				toast.error(result.error ?? t('templates.toast.deleteError'));
			}
		},
		onError: () => toast.error(t('templates.toast.deleteError')),
	});

	const assignMutation = useMutation({
		mutationKey: mutationKeys.scheduling.assignTemplate,
		mutationFn: (input: { templateId: string; employeeIds: string[] }) =>
			assignTemplateToEmployees(input.templateId, input.employeeIds),
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('templates.toast.assignSuccess'));
				setAssigningTemplate(null);
				setSelectedEmployeeIds([]);
				queryClient.invalidateQueries({ queryKey: queryKeys.scheduling.all });
				queryClient.invalidateQueries({ queryKey: queryKeys.scheduleTemplates.all });
			} else {
				toast.error(result.error ?? t('templates.toast.assignError'));
			}
		},
		onError: () => toast.error(t('templates.toast.assignError')),
	});

	const templates = templatesResponse?.data ?? [];
	const totalRows = templatesResponse?.pagination.total ?? 0;

	// Fetch detail (with days) for templates that don't include day data
	const templateDetailQueries = useQueries({
		queries: templates.map((template) => ({
			queryKey: queryKeys.scheduleTemplates.detail(template.id),
			queryFn: () => fetchScheduleTemplateDetail(template.id),
			enabled: Boolean(organizationId) && (!template.days || template.days.length === 0),
		})),
	});

	const templatesWithDays: ScheduleTemplate[] = templates.map((template, index) => {
		const detail = templateDetailQueries[index]?.data;
		return detail && detail.days && detail.days.length > 0 ? detail : template;
	});

	/**
	 * Summarizes working days for display.
	 *
	 * @param template - Template to summarize
	 * @returns Summary string
	 */
	const summarizeDays = useCallback(
		(template: ScheduleTemplate): string => {
			if (!template.days || template.days.length === 0) {
				return t('templates.summary.noDaysConfigured');
			}

			const workingDays = template.days
				.filter((day) => day.isWorkingDay !== false)
				.map((day) => {
					const dayKey: DayKey = DAY_KEYS[day.dayOfWeek] ?? 'sun';
					return t(`days.short.${dayKey}`);
				});

			return workingDays.length > 0
				? workingDays.join(', ')
				: t('templates.summary.allDaysOff');
		},
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
	 * Opens the dialog for creating a new schedule template.
	 *
	 * @returns void
	 */
	const handleOpenCreate = useCallback((): void => {
		setEditingTemplate(null);
		setIsFormOpen(true);
	}, []);

	/**
	 * Opens the dialog for editing an existing schedule template.
	 *
	 * @param template - Template to edit
	 * @returns void
	 */
	const handleEdit = useCallback((template: ScheduleTemplate): void => {
		setEditingTemplate(template);
		setIsFormOpen(true);
	}, []);

	const columns = useMemo<ColumnDef<ScheduleTemplate>[]>(
		() => [
			{
				accessorKey: 'name',
				header: t('templates.table.headers.name'),
				cell: ({ row }) => (
					<span className="font-medium">{row.original.name}</span>
				),
			},
			{
				accessorKey: 'shiftType',
				header: t('templates.table.headers.shift'),
				cell: ({ row }) => t(`shiftTypes.short.${row.original.shiftType}`),
				enableGlobalFilter: false,
			},
			{
				id: 'workingDays',
				accessorFn: (row) => summarizeDays(row),
				header: t('templates.table.headers.workingDays'),
				cell: ({ row }) => summarizeDays(row.original),
				enableGlobalFilter: false,
			},
			{
				accessorKey: 'updatedAt',
				header: t('templates.table.headers.updated'),
				cell: ({ row }) => formatMonthDayUtc(new Date(row.original.updatedAt)),
				enableGlobalFilter: false,
			},
			{
				id: 'actions',
				header: t('templates.table.headers.actions'),
				enableSorting: false,
				enableGlobalFilter: false,
				cell: ({ row }) => (
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon"
							onClick={() => handleEdit(row.original)}
							title={t('templates.actions.editTitle')}
							aria-label={t('templates.actions.editTitle')}
						>
							<Pencil className="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => {
								setDeleteId(row.original.id);
							}}
							title={t('templates.actions.deleteTitle')}
							aria-label={t('templates.actions.deleteTitle')}
						>
							<Trash2 className="h-4 w-4 text-destructive" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => {
								setAssigningTemplate(row.original);
								setSelectedEmployeeIds([]);
							}}
							title={t('templates.actions.assignTitle')}
							aria-label={t('templates.actions.assignTitle')}
						>
							<Users className="h-4 w-4" />
						</Button>
					</div>
				),
			},
		],
		[handleEdit, summarizeDays, t],
	);

	const handleSave = async (input: {
		name: string;
		description?: string | null;
		shiftType: ScheduleTemplate['shiftType'];
		days: ScheduleTemplateDayInput[];
	}): Promise<void> => {
		if (!organizationId) {
			toast.error(t('templates.toast.noOrganization'));
			return;
		}

		if (editingTemplate) {
			await updateMutation.mutateAsync({
				id: editingTemplate.id,
				name: input.name,
				description: input.description ?? undefined,
				shiftType: input.shiftType,
				organizationId,
				days: input.days,
			});
		} else {
			await createMutation.mutateAsync({
				name: input.name,
				description: input.description ?? undefined,
				shiftType: input.shiftType,
				organizationId,
				days: input.days,
			});
		}

		setIsFormOpen(false);
		setEditingTemplate(null);
	};

	const handleAssignSubmit = async (): Promise<void> => {
		if (!assigningTemplate) {
			return;
		}
		await assignMutation.mutateAsync({
			templateId: assigningTemplate.id,
			employeeIds: selectedEmployeeIds,
		});
	};

	if (!organizationId) {
		return (
			<div className="space-y-2 rounded-md border p-4">
				<h2 className="text-lg font-semibold">{t('tabs.templates')}</h2>
				<p className="text-muted-foreground">{t('templates.noOrganization')}</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-xl font-semibold">{t('templates.title')}</h2>
					<p className="text-sm text-muted-foreground">{t('templates.description')}</p>
				</div>
				<Button onClick={handleOpenCreate}>
					<Plus className="mr-2 h-4 w-4" />
					{t('templates.actions.new')}
				</Button>
			</div>

			<DataTable
				columns={columns}
				data={templatesWithDays}
				sorting={sorting}
				onSortingChange={setSorting}
				pagination={pagination}
				onPaginationChange={setPagination}
				columnFilters={columnFilters}
				onColumnFiltersChange={setColumnFilters}
				globalFilter={globalFilter}
				onGlobalFilterChange={handleGlobalFilterChange}
				manualPagination
				manualFiltering
				rowCount={totalRows}
				emptyState={t('templates.table.empty')}
				isLoading={isFetching}
			/>

			<TemplateFormDialog
				open={isFormOpen}
				onOpenChange={(open) => {
					setIsFormOpen(open);
					if (!open) {
						setEditingTemplate(null);
					}
				}}
				onSubmit={handleSave}
				initialTemplate={
					editingTemplate
						? (templatesWithDays.find((t) => t.id === editingTemplate.id) ??
							editingTemplate)
						: null
				}
				weekStartDay={weekStartDay}
				overtimeEnforcement={overtimeEnforcement}
			/>

			<Dialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('templates.dialogs.delete.title')}</DialogTitle>
						<DialogDescription>
							{t('templates.dialogs.delete.description')}
						</DialogDescription>
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

			<Dialog
				open={Boolean(assigningTemplate)}
				onOpenChange={(open) => {
					if (!open) {
						setAssigningTemplate(null);
						setSelectedEmployeeIds([]);
					}
				}}
			>
				<DialogContent className="max-w-xl">
					<DialogHeader>
						<DialogTitle>{t('templates.dialogs.assign.title')}</DialogTitle>
						<DialogDescription>
							{t('templates.dialogs.assign.description', {
								name:
									assigningTemplate?.name ??
									t('templates.dialogs.assign.fallbackName'),
							})}
						</DialogDescription>
					</DialogHeader>
					<div className="max-h-80 space-y-2 overflow-auto pr-2">
						{employees.map((employee) => (
							<label
								key={employee.id}
								className="flex items-center gap-2 rounded-md border p-2"
							>
								<input
									type="checkbox"
									className="h-4 w-4 accent-primary"
									checked={selectedEmployeeIds.includes(employee.id)}
									onChange={(event) => {
										setSelectedEmployeeIds((current) =>
											event.target.checked
												? [...current, employee.id]
												: current.filter((id) => id !== employee.id),
										);
									}}
								/>
								<span className="text-sm">
									{employee.firstName} {employee.lastName}
								</span>
							</label>
						))}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setAssigningTemplate(null)}>
							{tCommon('cancel')}
						</Button>
						<Button
							onClick={handleAssignSubmit}
							disabled={assignMutation.isPending || selectedEmployeeIds.length === 0}
						>
							{t('templates.dialogs.assign.action')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
