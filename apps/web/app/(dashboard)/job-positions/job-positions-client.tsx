'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { DataTable } from '@/components/data-table/data-table';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchJobPositionsList, type JobPosition } from '@/lib/client-functions';
import {
	createJobPosition,
	updateJobPosition,
	deleteJobPosition,
	type JobPositionMutationErrorCode,
	type JobPositionWarning,
} from '@/actions/job-positions';
import { useAppForm, useStore } from '@/lib/forms';
import { useOrgContext } from '@/lib/org-client-context';
import type { ColumnDef, ColumnFiltersState, PaginationState, SortingState } from '@tanstack/react-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Payment frequency options for job positions.
 */
type PaymentFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

/**
 * Form values interface for job position create/edit form.
 */
interface JobPositionFormValues {
	/** Job position name */
	name: string;
	/** Job position description */
	description: string;
	/** Pay for the full period */
	periodPay: number;
	/** Payment frequency */
	paymentFrequency: PaymentFrequency;
}

/**
 * Initial form values for creating a new job position.
 */
const initialFormValues: JobPositionFormValues = {
	name: '',
	description: '',
	periodPay: 0,
	paymentFrequency: 'MONTHLY',
};

/**
 * Resolves the divisor for a payment frequency.
 *
 * @param frequency - Payment frequency selection
 * @returns Day divisor for the period
 */
function getPayPeriodDivisor(frequency: PaymentFrequency): 7 | 14 | 30 {
	switch (frequency) {
		case 'WEEKLY':
			return 7;
		case 'BIWEEKLY':
			return 14;
		case 'MONTHLY':
		default:
			return 30;
	}
}

/**
 * Rounds a numeric value to two decimals.
 *
 * @param value - Raw numeric value
 * @returns Rounded numeric value
 */
function roundToTwoDecimals(value: number): number {
	return Number(value.toFixed(2));
}

/**
 * Calculates daily pay from a period pay amount and frequency.
 *
 * @param periodPay - Total pay for the period
 * @param frequency - Payment frequency selection
 * @returns Daily pay rounded to two decimals
 */
function calculateDailyPayFromPeriodPay(periodPay: number, frequency: PaymentFrequency): number {
	const divisor = getPayPeriodDivisor(frequency);
	return roundToTwoDecimals(periodPay / divisor);
}

/**
 * Calculates period pay from a daily pay amount and frequency.
 *
 * @param dailyPay - Daily pay amount
 * @param frequency - Payment frequency selection
 * @returns Period pay rounded to two decimals
 */
function calculatePeriodPayFromDailyPay(dailyPay: number, frequency: PaymentFrequency): number {
	const divisor = getPayPeriodDivisor(frequency);
	return roundToTwoDecimals(dailyPay * divisor);
}

/**
 * Checks if warnings include the minimum wage warning.
 *
 * @param warnings - Optional warnings from a mutation result
 * @returns True if the below-minimum-wage warning is present
 */
function hasMinimumWageWarning(warnings: JobPositionWarning[] | undefined): boolean {
	return Boolean(warnings?.some((warning) => warning.code === 'BELOW_MINIMUM_WAGE'));
}

/**
 * Resolves the error toast message for job position mutations.
 *
 * @param t - Translation helper for JobPositions namespace
 * @param errorCode - Error code from the mutation result
 * @param fallbackKey - Translation key for the fallback message
 * @returns Localized error message
 */
function getJobPositionErrorMessage(
	t: (key: string) => string,
	errorCode: JobPositionMutationErrorCode | undefined,
	fallbackKey: string,
): string {
	if (errorCode === 'BELOW_MINIMUM_WAGE') {
		return t('toast.belowMinimumWageBlocked');
	}

	return t(fallbackKey);
}

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
				if (hasMinimumWageWarning(result.warnings)) {
					toast.warning(t('toast.belowMinimumWageWarning'));
				}
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.jobPositions.all });
			} else {
				toast.error(getJobPositionErrorMessage(t, result.errorCode, 'toast.createError'));
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
				if (hasMinimumWageWarning(result.warnings)) {
					toast.warning(t('toast.belowMinimumWageWarning'));
				}
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.jobPositions.all });
			} else {
				toast.error(getJobPositionErrorMessage(t, result.errorCode, 'toast.updateError'));
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
				toast.error(getJobPositionErrorMessage(t, result.errorCode, 'toast.deleteError'));
			}
		},
		onError: () => {
			toast.error(t('toast.deleteError'));
		},
	});

	// TanStack Form instance
	const form = useAppForm({
		defaultValues: editingJobPosition
			? {
					name: editingJobPosition.name,
					description: editingJobPosition.description ?? '',
					periodPay: calculatePeriodPayFromDailyPay(
						Number(editingJobPosition.dailyPay ?? 0),
						editingJobPosition.paymentFrequency,
					),
					paymentFrequency: editingJobPosition.paymentFrequency,
				}
			: initialFormValues,
		onSubmit: async ({ value }) => {
			const dailyPay = calculateDailyPayFromPeriodPay(
				Number(value.periodPay),
				value.paymentFrequency,
			);
			if (editingJobPosition) {
				await updateMutation.mutateAsync({
					id: editingJobPosition.id,
					name: value.name,
					// Send null when description is empty string to clear the field
					description:
						value.description.trim() === '' ? null : value.description || undefined,
					dailyPay,
					paymentFrequency: value.paymentFrequency,
				});
			} else {
				if (!organizationId) {
					toast.error(t('toast.noOrganization'));
					return;
				}
				await createMutation.mutateAsync({
					name: value.name,
					description: value.description || undefined,
					dailyPay,
					paymentFrequency: value.paymentFrequency,
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
			form.setFieldValue(
				'periodPay',
				calculatePeriodPayFromDailyPay(
					Number(jobPosition.dailyPay ?? 0),
					jobPosition.paymentFrequency,
				),
			);
			form.setFieldValue('paymentFrequency', jobPosition.paymentFrequency);
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
	const handleGlobalFilterChange = useCallback(
		(value: React.SetStateAction<string>): void => {
			setGlobalFilter((prev) => (typeof value === 'function' ? value(prev) : value));
			setPagination((prev) => ({ ...prev, pageIndex: 0 }));
		},
		[],
	);

	const periodPayValue = useStore(form.store, (state) => state.values.periodPay);
	const paymentFrequencyValue =
		useStore(form.store, (state) => state.values.paymentFrequency) ?? 'MONTHLY';
	const computedDailyPay = calculateDailyPayFromPeriodPay(
		Number(periodPayValue ?? 0),
		paymentFrequencyValue,
	);
	const periodPayLabel = t('fields.periodPay', {
		period: t(`paymentFrequency.${paymentFrequencyValue}`),
	});

	const columns = useMemo<ColumnDef<JobPosition>[]>(
		() => [
			{
				accessorKey: 'name',
				header: t('table.headers.name'),
				cell: ({ row }) => (
					<span className="font-medium">{row.original.name}</span>
				),
			},
			{
				accessorKey: 'description',
				header: t('table.headers.description'),
				cell: ({ row }) => (
					<span className="max-w-xs truncate">
						{row.original.description ?? '-'}
					</span>
				),
			},
			{
				accessorKey: 'dailyPay',
				header: t('table.headers.dailyPay'),
				cell: ({ row }) => `$${Number(row.original.dailyPay).toFixed(2)}`,
			},
			{
				accessorKey: 'paymentFrequency',
				header: t('table.headers.paymentFrequency'),
				cell: ({ row }) =>
					t(`paymentFrequency.${row.original.paymentFrequency}`),
			},
			{
				accessorKey: 'createdAt',
				header: t('table.headers.created'),
				cell: ({ row }) =>
					format(new Date(row.original.createdAt), t('dateFormat')),
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

	if (!isOrgSelected) {
		return (
			<div className="space-y-4">
				<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
				<p className="text-muted-foreground">{t('noOrganization')}</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
					<p className="text-muted-foreground">{t('subtitle')}</p>
				</div>
				<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
					<DialogTrigger asChild>
						<Button onClick={handleCreateNew}>
							<Plus className="mr-2 h-4 w-4" />
							{t('actions.add')}
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[425px]">
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
										/>
									)}
								</form.AppField>
								<form.AppField name="description">
									{(field) => (
										<field.TextareaField
											label={t('fields.description')}
											placeholder={t('placeholders.descriptionOptional')}
											rows={3}
										/>
									)}
								</form.AppField>
								<form.AppField name="paymentFrequency">
									{(field) => (
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
											placeholder={t('placeholders.selectPaymentFrequency')}
										/>
									)}
								</form.AppField>
								<form.AppField
									name="periodPay"
									validators={{
										onChange: ({ value }) =>
											Number(value) <= 0
												? t('validation.periodPayGreaterThanZero')
												: undefined,
									}}
								>
									{(field) => (
										<field.TextField
											label={periodPayLabel}
											type="number"
											placeholder={t('placeholders.periodPayExample')}
										/>
									)}
								</form.AppField>
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
							<DialogFooter>
								<form.AppForm>
									<form.SubmitButton
										label={tCommon('save')}
										loadingLabel={tCommon('saving')}
									/>
								</form.AppForm>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			</div>

			<DataTable
				columns={columns}
				data={jobPositions}
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
