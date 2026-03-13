'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { ResponsiveDataView } from '@/components/ui/responsive-data-view';
import { ResponsivePageHeader } from '@/components/ui/responsive-page-header';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchJobPositionsList, type JobPosition } from '@/lib/client-functions';
import { createJobPosition, updateJobPosition, deleteJobPosition } from '@/actions/job-positions';
import { useAppForm } from '@/lib/forms';
import { useOrgContext } from '@/lib/org-client-context';
import type {
	ColumnDef,
	ColumnFiltersState,
	PaginationState,
	SortingState,
} from '@tanstack/react-table';

/**
 * Form values interface for job position create/edit form.
 */
interface JobPositionFormValues {
	/** Job position name */
	name: string;
	/** Job position description */
	description: string;
}

/**
 * Initial form values for creating a new job position.
 */
const initialFormValues: JobPositionFormValues = {
	name: '',
	description: '',
};

/**
 * Job Positions page client component.
 * Provides CRUD operations for job position management using TanStack Query and TanStack Form.
 *
 * @returns The job positions page JSX element
 */
export function JobPositionsPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId } = useOrgContext();
	const t = useTranslations('JobPositions');
	const tCommon = useTranslations('Common');
	const [globalFilter, setGlobalFilter] = useState<string>('');
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [editingJobPosition, setEditingJobPosition] = useState<JobPosition | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const isOrgSelected = Boolean(organizationId);

	// Build query params - only include search if it has a value
	const queryParams = {
		limit: pagination.pageSize,
		offset: pagination.pageIndex * pagination.pageSize,
		...(globalFilter ? { search: globalFilter } : {}),
		...(organizationId ? { organizationId } : {}),
	};

	// Query for job positions list
	const { data, isFetching } = useQuery({
		queryKey: queryKeys.jobPositions.list(queryParams),
		queryFn: () => fetchJobPositionsList(queryParams),
		enabled: isOrgSelected,
	});

	const jobPositions = data?.data ?? [];
	const totalRows = data?.pagination.total ?? 0;

	// Create mutation
	const createMutation = useMutation({
		mutationKey: mutationKeys.jobPositions.create,
		mutationFn: createJobPosition,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.createSuccess'));
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.jobPositions.all });
			} else {
				toast.error(t('toast.createError'));
			}
		},
		onError: () => {
			toast.error(t('toast.createError'));
		},
	});

	// Update mutation
	const updateMutation = useMutation({
		mutationKey: mutationKeys.jobPositions.update,
		mutationFn: updateJobPosition,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.updateSuccess'));
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.jobPositions.all });
			} else {
				toast.error(t('toast.updateError'));
			}
		},
		onError: () => {
			toast.error(t('toast.updateError'));
		},
	});

	// Delete mutation
	const deleteMutation = useMutation({
		mutationKey: mutationKeys.jobPositions.delete,
		mutationFn: deleteJobPosition,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.deleteSuccess'));
				setDeleteConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.jobPositions.all });
			} else {
				toast.error(t('toast.deleteError'));
			}
		},
		onError: () => {
			toast.error(t('toast.deleteError'));
		},
	});

	// TanStack Form instance
	const form = useAppForm({
		defaultValues: initialFormValues,
		onSubmit: async ({ value }) => {
			if (editingJobPosition) {
				await updateMutation.mutateAsync({
					id: editingJobPosition.id,
					name: value.name,
					// Send null when description is empty string to clear the field
					description:
						value.description.trim() === '' ? null : value.description || undefined,
				});
			} else {
				if (!organizationId) {
					toast.error(t('toast.noOrganization'));
					return;
				}
				await createMutation.mutateAsync({
					name: value.name,
					description: value.description || undefined,
					organizationId,
				});
			}
			setIsDialogOpen(false);
			setEditingJobPosition(null);
			form.reset();
		},
	});

	/**
	 * Opens the dialog for creating a new job position.
	 */
	const handleCreateNew = useCallback((): void => {
		setEditingJobPosition(null);
		form.reset();
		setIsDialogOpen(true);
	}, [form]);

	/**
	 * Opens the dialog for editing an existing job position.
	 *
	 * @param jobPosition - The job position to edit
	 */
	const handleEdit = useCallback(
		(jobPosition: JobPosition): void => {
			setEditingJobPosition(jobPosition);
			form.setFieldValue('name', jobPosition.name);
			form.setFieldValue('description', jobPosition.description ?? '');
			setIsDialogOpen(true);
		},
		[form],
	);

	/**
	 * Handles job position deletion.
	 *
	 * @param id - The job position ID to delete
	 */
	const handleDelete = useCallback(
		(id: string): void => {
			deleteMutation.mutate(id);
		},
		[deleteMutation],
	);

	/**
	 * Handles dialog close and resets form state.
	 *
	 * @param open - Whether the dialog should be open
	 */
	const handleDialogOpenChange = useCallback(
		(open: boolean): void => {
			setIsDialogOpen(open);
			if (!open) {
				setEditingJobPosition(null);
				form.reset();
			}
		},
		[form],
	);

	/**
	 * Updates the global filter and resets pagination.
	 *
	 * @param value - Next global filter value or updater
	 * @returns void
	 */
	const handleGlobalFilterChange = useCallback((value: React.SetStateAction<string>): void => {
		setGlobalFilter((prev) => (typeof value === 'function' ? value(prev) : value));
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}, []);

	const columns = useMemo<ColumnDef<JobPosition>[]>(
		() => [
			{
				accessorKey: 'name',
				header: t('table.headers.name'),
				cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
			},
			{
				accessorKey: 'description',
				header: t('table.headers.description'),
				cell: ({ row }) => (
					<span className="max-w-xs truncate">{row.original.description ?? '-'}</span>
				),
			},
			{
				accessorKey: 'createdAt',
				header: t('table.headers.created'),
				cell: ({ row }) => format(new Date(row.original.createdAt), t('dateFormat')),
			},
			{
				id: 'actions',
				header: t('table.headers.actions'),
				enableSorting: false,
				enableGlobalFilter: false,
				cell: ({ row }) => (
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon"
							onClick={() => handleEdit(row.original)}
							aria-label={t('dialog.title.edit')}
						>
							<Pencil className="h-4 w-4" />
						</Button>
						<Dialog
							open={deleteConfirmId === row.original.id}
							onOpenChange={(open) =>
								setDeleteConfirmId(open ? row.original.id : null)
							}
						>
							<DialogTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									aria-label={t('dialogs.delete.title')}
								>
									<Trash2 className="h-4 w-4 text-destructive" />
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>{t('dialogs.delete.title')}</DialogTitle>
									<DialogDescription>
										{t('dialogs.delete.description', {
											name: row.original.name,
										})}
									</DialogDescription>
								</DialogHeader>
								<DialogFooter>
									<Button
										variant="outline"
										onClick={() => setDeleteConfirmId(null)}
									>
										{tCommon('cancel')}
									</Button>
									<Button
										variant="destructive"
										onClick={() => handleDelete(row.original.id)}
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
					</div>
				),
			},
		],
		[deleteConfirmId, deleteMutation.isPending, handleDelete, handleEdit, t, tCommon],
	);

	const renderJobPositionCard = useCallback(
		(jobPosition: JobPosition): React.ReactNode => (
			<div className="space-y-4">
				<div className="space-y-1">
					<p className="text-base font-semibold">{jobPosition.name}</p>
					<p className="text-sm text-muted-foreground">
						{format(new Date(jobPosition.createdAt), t('dateFormat'))}
					</p>
				</div>

				<div className="space-y-1">
					<p className="text-sm text-muted-foreground">
						{t('table.headers.description')}
					</p>
					<p className="text-sm font-medium">{jobPosition.description ?? '-'}</p>
				</div>

				<div className="grid grid-cols-2 gap-2">
					<Button
						type="button"
						variant="outline"
						className="min-h-11"
						onClick={() => handleEdit(jobPosition)}
					>
						<Pencil className="mr-2 h-4 w-4" />
						{tCommon('edit')}
					</Button>
					<Dialog
						open={deleteConfirmId === jobPosition.id}
						onOpenChange={(open) =>
							setDeleteConfirmId(open ? jobPosition.id : null)
						}
					>
						<DialogTrigger asChild>
							<Button type="button" variant="destructive" className="min-h-11">
								<Trash2 className="mr-2 h-4 w-4" />
								{tCommon('delete')}
							</Button>
						</DialogTrigger>
						<DialogContent className="w-full max-w-[calc(100vw-2rem)] min-[640px]:max-w-lg">
							<DialogHeader>
								<DialogTitle>{t('dialogs.delete.title')}</DialogTitle>
								<DialogDescription>
									{t('dialogs.delete.description', {
										name: jobPosition.name,
									})}
								</DialogDescription>
							</DialogHeader>
							<DialogFooter className="flex-col-reverse gap-2 min-[640px]:flex-row [&>button]:min-h-11 [&>button]:w-full min-[640px]:[&>button]:w-auto">
								<Button
									variant="outline"
									onClick={() => setDeleteConfirmId(null)}
								>
									{tCommon('cancel')}
								</Button>
								<Button
									variant="destructive"
									onClick={() => handleDelete(jobPosition.id)}
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
				</div>
			</div>
		),
		[deleteConfirmId, deleteMutation.isPending, handleDelete, handleEdit, t, tCommon],
	);

	if (!isOrgSelected) {
		return (
			<div className="space-y-4">
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
							<Button
								onClick={handleCreateNew}
								data-testid="job-positions-add-button"
								className="min-h-11"
							>
								<Plus className="mr-2 h-4 w-4" />
								{t('actions.add')}
							</Button>
						</DialogTrigger>
						<DialogContent className="w-full max-w-[calc(100vw-2rem)] min-[640px]:max-w-[425px]">
						<form
							onSubmit={(e) => {
								e.preventDefault();
								e.stopPropagation();
								form.handleSubmit();
							}}
						>
							<DialogHeader>
								<DialogTitle>
									{editingJobPosition
										? t('dialog.title.edit')
										: t('dialog.title.add')}
								</DialogTitle>
								<DialogDescription>
									{editingJobPosition
										? t('dialog.description.edit')
										: t('dialog.description.add')}
								</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4 py-4">
								<form.AppField
									name="name"
									validators={{
										onChange: ({ value }) =>
											!value.trim()
												? t('validation.nameRequired')
												: undefined,
									}}
								>
									{(field) => (
										<field.TextField
											label={t('fields.name')}
											placeholder={t('placeholders.nameExample')}
											orientation="vertical"
										/>
									)}
								</form.AppField>
								<form.AppField name="description">
									{(field) => (
										<field.TextareaField
											label={t('fields.description')}
											placeholder={t('placeholders.descriptionOptional')}
											rows={3}
											orientation="vertical"
										/>
									)}
								</form.AppField>
							</div>
							<DialogFooter className="flex-col-reverse gap-2 min-[640px]:flex-row [&>button]:min-h-11 [&>button]:w-full min-[640px]:[&>button]:w-auto">
								<form.AppForm>
									<form.SubmitButton
										label={tCommon('save')}
										loadingLabel={tCommon('saving')}
										className="min-h-11 w-full min-[640px]:w-auto"
									/>
								</form.AppForm>
							</DialogFooter>
						</form>
						</DialogContent>
					</Dialog>
				}
			/>

			<ResponsiveDataView
				columns={columns}
				data={jobPositions}
				cardRenderer={renderJobPositionCard}
				getCardKey={(jobPosition) => jobPosition.id}
				sorting={sorting}
				onSortingChange={setSorting}
				pagination={pagination}
				onPaginationChange={setPagination}
				columnFilters={columnFilters}
				onColumnFiltersChange={setColumnFilters}
				globalFilter={globalFilter}
				onGlobalFilterChange={handleGlobalFilterChange}
				globalFilterPlaceholder={t('search.placeholder')}
				manualPagination
				manualFiltering
				rowCount={totalRows}
				emptyState={t('table.empty')}
				isLoading={isFetching}
			/>
		</div>
	);
}
