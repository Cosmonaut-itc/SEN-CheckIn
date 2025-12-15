'use client';

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchJobPositionsList, type JobPosition } from '@/lib/client-functions';
import { createJobPosition, updateJobPosition, deleteJobPosition } from '@/actions/job-positions';
import { useAppForm } from '@/lib/forms';
import { useOrgContext } from '@/lib/org-client-context';

/**
 * Form values interface for job position create/edit form.
 */
interface JobPositionFormValues {
	/** Job position name */
	name: string;
	/** Job position description */
	description: string;
	/** Daily pay rate */
	dailyPay: number;
	/** Hourly pay rate */
	hourlyPay: number;
	/** Payment frequency */
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
}

/**
 * Initial form values for creating a new job position.
 */
const initialFormValues: JobPositionFormValues = {
	name: '',
	description: '',
	dailyPay: 0,
	hourlyPay: 0,
	paymentFrequency: 'MONTHLY',
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
	const [search, setSearch] = useState<string>('');
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [editingJobPosition, setEditingJobPosition] = useState<JobPosition | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const isOrgSelected = Boolean(organizationId);

	// Build query params - only include search if it has a value
	const queryParams = {
		limit: 100,
		offset: 0,
		...(search ? { search } : {}),
		...(organizationId ? { organizationId } : {}),
	};

	// Query for job positions list
	const { data, isFetching } = useQuery({
		queryKey: queryKeys.jobPositions.list(queryParams),
		queryFn: () => fetchJobPositionsList(queryParams),
		enabled: isOrgSelected,
	});

	const jobPositions = data?.data ?? [];

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
				toast.error(result.error ?? t('toast.createError'));
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
				toast.error(result.error ?? t('toast.updateError'));
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
				toast.error(result.error ?? t('toast.deleteError'));
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
					dailyPay: editingJobPosition.dailyPay,
					hourlyPay: editingJobPosition.hourlyPay,
					paymentFrequency: editingJobPosition.paymentFrequency,
				}
			: initialFormValues,
		onSubmit: async ({ value }) => {
			if (editingJobPosition) {
				await updateMutation.mutateAsync({
					id: editingJobPosition.id,
					name: value.name,
					// Send null when description is empty string to clear the field
					description:
						value.description.trim() === '' ? null : value.description || undefined,
					dailyPay: value.dailyPay,
					hourlyPay: value.hourlyPay,
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
					dailyPay: value.dailyPay,
					hourlyPay: value.hourlyPay,
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
			form.setFieldValue('hourlyPay', Number(jobPosition.hourlyPay ?? 0));
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
								<form.AppField
									name="dailyPay"
									validators={{
										onChange: ({ value }) =>
											Number(value) <= 0
												? t('validation.dailyPayGreaterThanZero')
												: undefined,
									}}
								>
									{(field) => (
										<field.TextField
											label={t('fields.dailyPay')}
											type="number"
											placeholder={t('placeholders.dailyPayExample')}
										/>
									)}
								</form.AppField>
								<form.AppField
									name="hourlyPay"
									validators={{
										onChange: ({ value }) =>
											Number(value) <= 0
												? t('validation.hourlyPayGreaterThanZero')
												: undefined,
									}}
								>
									{(field) => (
										<field.TextField
											label={t('fields.hourlyPay')}
											type="number"
											placeholder={t('placeholders.hourlyPayExample')}
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

			<div className="flex items-center gap-4">
				<div className="relative flex-1 max-w-sm">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder={t('search.placeholder')}
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9"
					/>
				</div>
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t('table.headers.name')}</TableHead>
							<TableHead>{t('table.headers.description')}</TableHead>
							<TableHead>{t('table.headers.dailyPay')}</TableHead>
							<TableHead>{t('table.headers.hourlyPay')}</TableHead>
							<TableHead>{t('table.headers.paymentFrequency')}</TableHead>
							<TableHead>{t('table.headers.created')}</TableHead>
							<TableHead className="w-[100px]">
								{t('table.headers.actions')}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isFetching ? (
							Array.from({ length: 5 }).map((_, i) => (
								<TableRow key={i}>
									{Array.from({ length: 7 }).map((_, j) => (
										<TableCell key={j}>
											<Skeleton className="h-4 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : jobPositions.length === 0 ? (
							<TableRow>
								<TableCell colSpan={7} className="h-24 text-center">
									{t('table.empty')}
								</TableCell>
							</TableRow>
						) : (
							jobPositions.map((jobPosition) => (
								<TableRow key={jobPosition.id}>
									<TableCell className="font-medium">
										{jobPosition.name}
									</TableCell>
									<TableCell className="max-w-xs truncate">
										{jobPosition.description ?? '-'}
									</TableCell>
									<TableCell>
										${Number(jobPosition.dailyPay).toFixed(2)}
									</TableCell>
									<TableCell>
										${Number(jobPosition.hourlyPay).toFixed(2)}
									</TableCell>
									<TableCell>
										{t(`paymentFrequency.${jobPosition.paymentFrequency}`)}
									</TableCell>
									<TableCell>
										{format(new Date(jobPosition.createdAt), t('dateFormat'))}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Button
												variant="ghost"
												size="icon"
												onClick={() => handleEdit(jobPosition)}
											>
												<Pencil className="h-4 w-4" />
											</Button>
											<Dialog
												open={deleteConfirmId === jobPosition.id}
												onOpenChange={(open) =>
													setDeleteConfirmId(open ? jobPosition.id : null)
												}
											>
												<DialogTrigger asChild>
													<Button variant="ghost" size="icon">
														<Trash2 className="h-4 w-4 text-destructive" />
													</Button>
												</DialogTrigger>
												<DialogContent>
													<DialogHeader>
														<DialogTitle>
															{t('dialogs.delete.title')}
														</DialogTitle>
														<DialogDescription>
															{t('dialogs.delete.description', {
																name: jobPosition.name,
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
															onClick={() =>
																handleDelete(jobPosition.id)
															}
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
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
