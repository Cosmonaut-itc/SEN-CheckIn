'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveDataView } from '@/components/ui/responsive-data-view';
import { ResponsivePageHeader } from '@/components/ui/responsive-page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { TourHelpButton } from '@/components/tour-help-button';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, Save, Settings2 } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import {
	fetchJobPositionsList,
	fetchLocationsAll,
	fetchStaffingRequirementsList,
	type PaginatedResponse,
	type JobPosition,
	type Location,
	type StaffingRequirement,
} from '@/lib/client-functions';
import { createJobPosition, updateJobPosition, deleteJobPosition } from '@/actions/job-positions';
import {
	createStaffingRequirement,
	deleteStaffingRequirement,
	updateStaffingRequirement,
} from '@/actions/staffing-requirements';
import { useAppForm } from '@/lib/forms';
import { useTour } from '@/hooks/use-tour';
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

interface StaffingRequirementDeleteTarget {
	requirement: StaffingRequirement;
	locationId: string;
	locationName: string;
}

interface UpdateStaffingMinimumInput {
	id: string;
	locationId: string;
	minimumRequired: number;
}

interface DeleteStaffingMinimumInput {
	id: string;
	locationId: string;
}

/**
 * Initial form values for creating a new job position.
 */
const initialFormValues: JobPositionFormValues = {
	name: '',
	description: '',
};

const EMPTY_LOCATIONS: Location[] = [];
const EMPTY_STAFFING_REQUIREMENTS: StaffingRequirement[] = [];
const STAFFING_REQUIREMENTS_PAGE_SIZE = 100;
const STAFFING_MINIMUM_REQUIRED_MAX = 2_147_483_647;

/**
 * Builds a map of staffing requirements keyed by location identifier.
 *
 * @param requirements - Staffing requirements returned by the API
 * @returns Staffing requirements keyed by location id
 */
function buildRequirementByLocationId(
	requirements: StaffingRequirement[],
): Map<string, StaffingRequirement> {
	return new Map(requirements.map((requirement) => [requirement.locationId, requirement]));
}

/**
 * Fetches every staffing requirement page for a selected job position.
 *
 * @param params - Organization and job position filters
 * @returns Combined staffing requirements payload
 * @throws Error when any page request fails
 */
async function fetchAllStaffingRequirementsForPosition(params: {
	organizationId: string | null;
	jobPositionId: string | undefined;
	limit: number;
	offset: number;
}): Promise<PaginatedResponse<StaffingRequirement>> {
	const requirements: StaffingRequirement[] = [];
	let currentLimit = params.limit;
	let currentOffset = params.offset;
	let total = 0;

	for (;;) {
		const page = await fetchStaffingRequirementsList({
			organizationId: params.organizationId,
			jobPositionId: params.jobPositionId,
			limit: currentLimit,
			offset: currentOffset,
		});
		const pageLimit = page.pagination.limit > 0 ? page.pagination.limit : currentLimit;
		const nextOffset = page.pagination.offset + pageLimit;

		requirements.push(...page.data);
		total = page.pagination.total;

		if (requirements.length >= total || page.data.length === 0 || nextOffset <= currentOffset) {
			break;
		}

		currentLimit = pageLimit;
		currentOffset = nextOffset;
	}

	return {
		data: requirements,
		pagination: {
			total,
			limit: params.limit,
			offset: params.offset,
		},
	};
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
	useTour('job-positions');
	const [globalFilter, setGlobalFilter] = useState<string>('');
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [editingJobPosition, setEditingJobPosition] = useState<JobPosition | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const [staffingJobPosition, setStaffingJobPosition] = useState<JobPosition | null>(null);
	const [staffingMinimumDrafts, setStaffingMinimumDrafts] = useState<Record<string, string>>({});
	const [staffingDeleteTarget, setStaffingDeleteTarget] =
		useState<StaffingRequirementDeleteTarget | null>(null);
	const isOrgSelected = Boolean(organizationId);
	const staffingJobPositionId = staffingJobPosition?.id ?? null;

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

	const {
		data: staffingLocationsData,
		isFetching: isStaffingLocationsFetching,
		isError: isStaffingLocationsError,
	} = useQuery({
		queryKey: queryKeys.locations.allList(organizationId),
		queryFn: () => fetchLocationsAll({ organizationId }),
		enabled: Boolean(organizationId && staffingJobPositionId),
	});
	const staffingRequirementQueryParams = useMemo(
		() => ({
			organizationId: organizationId ?? null,
			jobPositionId: staffingJobPositionId ?? undefined,
			limit: STAFFING_REQUIREMENTS_PAGE_SIZE,
			offset: 0,
		}),
		[organizationId, staffingJobPositionId],
	);
	const {
		data: staffingRequirementsPayload,
		isFetching: isStaffingRequirementsFetching,
		isError: isStaffingRequirementsError,
	} = useQuery({
		queryKey: queryKeys.staffingRequirements.list(staffingRequirementQueryParams),
		queryFn: () => fetchAllStaffingRequirementsForPosition(staffingRequirementQueryParams),
		enabled: Boolean(organizationId && staffingJobPositionId),
	});
	const staffingLocations = staffingLocationsData ?? EMPTY_LOCATIONS;
	const staffingRequirements = staffingRequirementsPayload?.data ?? EMPTY_STAFFING_REQUIREMENTS;
	const staffingRequirementByLocationId = useMemo(
		() => buildRequirementByLocationId(staffingRequirements),
		[staffingRequirements],
	);
	const isStaffingDialogOpen = staffingJobPosition !== null;
	const isStaffingDataLoading = isStaffingLocationsFetching || isStaffingRequirementsFetching;
	const hasStaffingDataError = isStaffingLocationsError || isStaffingRequirementsError;

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

	const invalidateStaffingQueries = useCallback((): void => {
		queryClient.invalidateQueries({ queryKey: queryKeys.staffingRequirements.all });
		queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all });
		queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
	}, [queryClient]);

	/**
	 * Removes a local staffing minimum draft after the server accepts a mutation.
	 *
	 * @param locationId - Location identifier whose draft should be removed
	 * @returns void
	 */
	const clearStaffingMinimumDraft = useCallback((locationId: string): void => {
		setStaffingMinimumDrafts((currentDrafts) => {
			const remainingDrafts = { ...currentDrafts };
			delete remainingDrafts[locationId];
			return remainingDrafts;
		});
	}, []);

	const createStaffingMutation = useMutation({
		mutationFn: createStaffingRequirement,
		onSuccess: (result, variables) => {
			if (result.success) {
				toast.success(t('staffing.toast.saveSuccess'));
				clearStaffingMinimumDraft(variables.locationId);
				invalidateStaffingQueries();
			} else {
				toast.error(t('staffing.toast.saveError'));
			}
		},
		onError: () => {
			toast.error(t('staffing.toast.saveError'));
		},
	});

	const updateStaffingMutation = useMutation({
		mutationFn: (input: UpdateStaffingMinimumInput) =>
			updateStaffingRequirement({
				id: input.id,
				minimumRequired: input.minimumRequired,
			}),
		onSuccess: (result, variables) => {
			if (result.success) {
				toast.success(t('staffing.toast.saveSuccess'));
				clearStaffingMinimumDraft(variables.locationId);
				invalidateStaffingQueries();
			} else {
				toast.error(t('staffing.toast.saveError'));
			}
		},
		onError: () => {
			toast.error(t('staffing.toast.saveError'));
		},
	});

	const deleteStaffingMutation = useMutation({
		mutationFn: (input: DeleteStaffingMinimumInput) => deleteStaffingRequirement(input.id),
		onSuccess: (result, variables) => {
			if (result.success) {
				toast.success(t('staffing.toast.deleteSuccess'));
				clearStaffingMinimumDraft(variables.locationId);
				setStaffingDeleteTarget(null);
				invalidateStaffingQueries();
			} else {
				toast.error(t('staffing.toast.deleteError'));
			}
		},
		onError: () => {
			toast.error(t('staffing.toast.deleteError'));
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
	 * Opens the staffing requirement configuration dialog.
	 *
	 * @param jobPosition - Job position to configure
	 * @returns void
	 */
	const handleConfigureStaffing = useCallback((jobPosition: JobPosition): void => {
		setStaffingJobPosition(jobPosition);
	}, []);

	/**
	 * Handles staffing requirement dialog open state changes.
	 *
	 * @param open - Whether the staffing dialog should remain open
	 * @returns void
	 */
	const handleStaffingDialogOpenChange = useCallback((open: boolean): void => {
		if (!open) {
			setStaffingJobPosition(null);
			setStaffingMinimumDrafts({});
			setStaffingDeleteTarget(null);
		}
	}, []);

	/**
	 * Updates the local draft value for one location minimum.
	 *
	 * @param locationId - Location identifier being edited
	 * @param value - Next input value
	 * @returns void
	 */
	const handleStaffingMinimumChange = useCallback((locationId: string, value: string): void => {
		setStaffingMinimumDrafts((currentDrafts) => ({
			...currentDrafts,
			[locationId]: value,
		}));
	}, []);

	/**
	 * Saves the staffing minimum for one location.
	 *
	 * @param location - Location associated with the minimum
	 * @returns void
	 */
	const handleSaveStaffingMinimum = useCallback(
		(location: Location): void => {
			if (!organizationId || !staffingJobPositionId) {
				toast.error(t('toast.noOrganization'));
				return;
			}

			const existingRequirement = staffingRequirementByLocationId.get(location.id);
			const minimumRequiredValue =
				staffingMinimumDrafts[location.id] ??
				(existingRequirement ? String(existingRequirement.minimumRequired) : '');
			const normalizedMinimumRequired = minimumRequiredValue.trim();
			if (normalizedMinimumRequired.length === 0) {
				toast.error(t('staffing.validation.minimumRequired'));
				return;
			}

			const minimumRequired = Number(normalizedMinimumRequired);
			if (
				!Number.isInteger(minimumRequired) ||
				minimumRequired < 0 ||
				minimumRequired > STAFFING_MINIMUM_REQUIRED_MAX
			) {
				toast.error(t('staffing.validation.minimumRequired'));
				return;
			}

			if (existingRequirement) {
				updateStaffingMutation.mutate({
					id: existingRequirement.id,
					locationId: location.id,
					minimumRequired,
				});
				return;
			}

			createStaffingMutation.mutate({
				organizationId,
				locationId: location.id,
				jobPositionId: staffingJobPositionId,
				minimumRequired,
			});
		},
		[
			createStaffingMutation,
			organizationId,
			staffingJobPositionId,
			staffingMinimumDrafts,
			staffingRequirementByLocationId,
			t,
			updateStaffingMutation,
		],
	);

	/**
	 * Deletes the staffing minimum configured for one location.
	 *
	 * @param requirement - Staffing requirement to delete
	 * @param location - Location associated with the requirement
	 * @returns void
	 */
	const handleDeleteStaffingMinimum = useCallback(
		(requirement: StaffingRequirement, location: Location): void => {
			setStaffingDeleteTarget({
				requirement,
				locationId: location.id,
				locationName: location.name,
			});
		},
		[],
	);

	/**
	 * Confirms deletion of the selected staffing minimum.
	 *
	 * @returns void
	 */
	const handleConfirmDeleteStaffingMinimum = useCallback((): void => {
		if (!staffingDeleteTarget) {
			return;
		}

		deleteStaffingMutation.mutate({
			id: staffingDeleteTarget.requirement.id,
			locationId: staffingDeleteTarget.locationId,
		});
	}, [deleteStaffingMutation, staffingDeleteTarget]);

	/**
	 * Handles the staffing minimum delete confirmation open state.
	 *
	 * @param open - Whether the confirmation dialog remains open
	 * @returns void
	 */
	const handleStaffingDeleteDialogOpenChange = useCallback(
		(open: boolean): void => {
			if (!open && !deleteStaffingMutation.isPending) {
				setStaffingDeleteTarget(null);
			}
		},
		[deleteStaffingMutation.isPending],
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
							onClick={() => handleConfigureStaffing(row.original)}
							aria-label={t('staffing.configureAria', {
								name: row.original.name,
							})}
						>
							<Settings2 className="h-4 w-4" />
						</Button>
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
		[
			deleteConfirmId,
			deleteMutation.isPending,
			handleConfigureStaffing,
			handleDelete,
			handleEdit,
			t,
			tCommon,
		],
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
						onClick={() => handleConfigureStaffing(jobPosition)}
					>
						<Settings2 className="mr-2 h-4 w-4" />
						{t('staffing.actions.configureShort')}
					</Button>
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
						onOpenChange={(open) => setDeleteConfirmId(open ? jobPosition.id : null)}
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
								<Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
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
		[
			deleteConfirmId,
			deleteMutation.isPending,
			handleConfigureStaffing,
			handleDelete,
			handleEdit,
			t,
			tCommon,
		],
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
					<>
						<TourHelpButton tourId="job-positions" />
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
													placeholder={t(
														'placeholders.descriptionOptional',
													)}
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
					</>
				}
			/>

			<div data-tour="job-positions-list">
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

			<Dialog open={isStaffingDialogOpen} onOpenChange={handleStaffingDialogOpenChange}>
				<DialogContent className="w-full max-w-[calc(100vw-2rem)] min-[760px]:max-w-3xl">
					<DialogHeader>
						<DialogTitle>{t('staffing.dialog.title')}</DialogTitle>
						<DialogDescription>
							{t('staffing.dialog.description', {
								name: staffingJobPosition?.name ?? '',
							})}
						</DialogDescription>
					</DialogHeader>

					<div className="max-h-[60vh] overflow-y-auto">
						{isStaffingDataLoading ? (
							<div
								className="space-y-3"
								data-testid="staffing-requirements-loading"
								role="status"
								aria-live="polite"
								aria-label={t('staffing.loading')}
							>
								<p className="text-sm text-muted-foreground">
									{t('staffing.loading')}
								</p>
								<Skeleton className="h-12 w-full" />
								<Skeleton className="h-12 w-full" />
								<Skeleton className="h-12 w-full" />
							</div>
						) : hasStaffingDataError ? (
							<Alert variant="destructive">
								<AlertTitle>{t('staffing.error.title')}</AlertTitle>
								<AlertDescription>
									{t('staffing.error.description')}
								</AlertDescription>
							</Alert>
						) : staffingLocations.length === 0 ? (
							<p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
								{t('staffing.empty')}
							</p>
						) : (
							<div className="divide-y rounded-md border">
								{staffingLocations.map((location) => {
									const requirement = staffingRequirementByLocationId.get(
										location.id,
									);
									const draftValue =
										staffingMinimumDrafts[location.id] ??
										(requirement ? String(requirement.minimumRequired) : '');
									const isMutationPending =
										createStaffingMutation.isPending ||
										updateStaffingMutation.isPending ||
										deleteStaffingMutation.isPending;

									return (
										<div
											key={location.id}
											className="grid gap-3 p-3 min-[640px]:grid-cols-[minmax(0,1fr)_9rem_auto] min-[640px]:items-end"
										>
											<div className="min-w-0 space-y-1">
												<p className="truncate text-sm font-medium">
													{location.name}
												</p>
												<p className="text-xs text-muted-foreground">
													{requirement
														? t('staffing.status.configured', {
																count: requirement.minimumRequired,
															})
														: t('staffing.status.notConfigured')}
												</p>
											</div>
											<div className="space-y-2">
												<Label
													htmlFor={`staffing-minimum-${location.id}`}
													className="text-xs"
												>
													{t('staffing.fields.minimumRequired')}
												</Label>
												<Input
													id={`staffing-minimum-${location.id}`}
													type="number"
													inputMode="numeric"
													min={0}
													step={1}
													value={draftValue}
													aria-label={t(
														'staffing.fields.minimumForLocation',
														{
															location: location.name,
														},
													)}
													onChange={(event) =>
														handleStaffingMinimumChange(
															location.id,
															event.target.value,
														)
													}
												/>
											</div>
											<div className="flex gap-2">
												<Button
													type="button"
													size="icon"
													onClick={() =>
														handleSaveStaffingMinimum(location)
													}
													disabled={isMutationPending}
													aria-label={t(
														'staffing.actions.saveForLocation',
														{
															location: location.name,
														},
													)}
												>
													{createStaffingMutation.isPending ||
													updateStaffingMutation.isPending ? (
														<Loader2 className="h-4 w-4 animate-spin" />
													) : (
														<Save className="h-4 w-4" />
													)}
												</Button>
												<Button
													type="button"
													size="icon"
													variant="ghost"
													onClick={() => {
														if (requirement) {
															handleDeleteStaffingMinimum(
																requirement,
																location,
															);
														}
													}}
													disabled={!requirement || isMutationPending}
													aria-label={t(
														'staffing.actions.deleteForLocation',
														{
															location: location.name,
														},
													)}
												>
													{deleteStaffingMutation.isPending ? (
														<Loader2 className="h-4 w-4 animate-spin" />
													) : (
														<Trash2 className="h-4 w-4 text-destructive" />
													)}
												</Button>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={staffingDeleteTarget !== null}
				onOpenChange={handleStaffingDeleteDialogOpenChange}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('staffing.deleteDialog.title')}</AlertDialogTitle>
						<AlertDialogDescription>
							{t('staffing.deleteDialog.description', {
								location: staffingDeleteTarget?.locationName ?? '',
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleteStaffingMutation.isPending}>
							{tCommon('cancel')}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleConfirmDeleteStaffingMinimum}
							disabled={deleteStaffingMutation.isPending}
						>
							{deleteStaffingMutation.isPending
								? tCommon('deleting')
								: t('staffing.deleteDialog.confirm')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
