'use client';

import {
	createOrganization,
	deleteOrganization,
	updateOrganization,
} from '@/actions/organizations';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { DataTable } from '@/components/data-table/data-table';
import {
	fetchAllOrganizations,
	fetchOrganizations,
	type Organization,
	type OrganizationsAllResponse,
} from '@/lib/client-functions';
import { useSession } from '@/lib/auth-client';
import { useAppForm } from '@/lib/forms';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import type { OrganizationAllQueryParams } from '@/lib/query-keys';
import type { ColumnDef, ColumnFiltersState, PaginationState, SortingState } from '@tanstack/react-table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Edit, Plus, Trash2, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import React, { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

/**
 * Form values for creating organizations.
 */
interface OrganizationFormValues {
	name: string;
	slug: string;
}

/**
 * Organizations page client component.
 * Provides organization management via better-auth organization plugin using TanStack Query.
 *
 * @returns The organizations page JSX element
 */
export function OrganizationsPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const router = useRouter();
	const t = useTranslations('Organizations');
	const tCommon = useTranslations('Common');
	const { data: session, isPending: isSessionPending } = useSession();
	const isSuperUser = session?.user?.role === 'admin';
	const [globalFilter, setGlobalFilter] = useState<string>('');
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [editingOrganization, setEditingOrganization] = useState<Organization | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const NAME_LIMITS = { min: 3, max: 80 };
	const SLUG_LIMITS = { min: 3, max: 50 };
	const searchValue = globalFilter.trim();
	const activeSort = sorting[0];
	const sortBy: OrganizationAllQueryParams['sortBy'] =
		activeSort?.id === 'name' || activeSort?.id === 'slug' || activeSort?.id === 'createdAt'
			? activeSort.id
			: undefined;
	const sortDir: OrganizationAllQueryParams['sortDir'] = sortBy
		? activeSort?.desc
			? 'desc'
			: 'asc'
		: undefined;

	const organizationsQueryParams: OrganizationAllQueryParams = {
		limit: pagination.pageSize,
		offset: pagination.pageIndex * pagination.pageSize,
		...(searchValue ? { search: searchValue } : {}),
		...(isSuperUser && sortBy ? { sortBy, sortDir } : {}),
	};

	// Query for organizations list
	const { data: organizationsResponse, isFetching } = useQuery<
		OrganizationsAllResponse | Organization[]
	>({
		queryKey: isSuperUser
			? queryKeys.super.organizationsAll.list(organizationsQueryParams)
			: queryKeys.organizations.list(),
		queryFn: async () => {
			if (isSuperUser) {
				return await fetchAllOrganizations(organizationsQueryParams);
			}
			return await fetchOrganizations();
		},
		enabled: !isSessionPending,
	});

	const organizations = useMemo(() => {
		if (!organizationsResponse) {
			return [];
		}
		if (isSuperUser) {
			return (organizationsResponse as OrganizationsAllResponse).organizations ?? [];
		}
		return organizationsResponse as Organization[];
	}, [isSuperUser, organizationsResponse]);

	const totalRows = isSuperUser
		? (organizationsResponse as OrganizationsAllResponse | undefined)?.total ?? 0
		: organizations.length;
	const canCreateOrganization = isSuperUser;
	const isLoading = isFetching || isSessionPending;

	// Create mutation
	const createMutation = useMutation({
		mutationKey: mutationKeys.organizations.create,
		mutationFn: createOrganization,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.createSuccess'));
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
				queryClient.invalidateQueries({ queryKey: queryKeys.super.organizationsAll.all });
				router.refresh();
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
		mutationKey: mutationKeys.organizations.update,
		mutationFn: updateOrganization,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.updateSuccess'));
				setIsDialogOpen(false);
				setEditingOrganization(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
				queryClient.invalidateQueries({ queryKey: queryKeys.super.organizationsAll.all });
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
		mutationKey: mutationKeys.organizations.delete,
		mutationFn: deleteOrganization,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.deleteSuccess'));
				setDeleteConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
				queryClient.invalidateQueries({ queryKey: queryKeys.super.organizationsAll.all });
			} else {
				toast.error(t('toast.deleteError'));
			}
		},
		onError: () => {
			toast.error(t('toast.deleteError'));
		},
	});

	// TanStack Form instance (after mutations to avoid TDZ)
	const initialFormValues: OrganizationFormValues = {
		name: '',
		slug: '',
	};

	const form = useAppForm({
		defaultValues: editingOrganization
			? {
					name: editingOrganization.name,
					slug: editingOrganization.slug,
				}
			: initialFormValues,
		onSubmit: async ({ value }: { value: OrganizationFormValues }) => {
			const name = value.name.trim();
			const slug = value.slug.trim();

			if (editingOrganization) {
				await updateMutation.mutateAsync({
					organizationId: editingOrganization.id,
					name,
					slug,
				});
			} else {
				await createMutation.mutateAsync({
					name,
					slug,
				});
			}
			setIsDialogOpen(false);
			setEditingOrganization(null);
			form.reset();
		},
	});

	/**
	 * Opens the dialog for creating a new organization.
	 */
	const handleCreateNew = useCallback((): void => {
		setEditingOrganization(null);
		form.reset();
		setIsDialogOpen(true);
	}, [form]);

	/**
	 * Opens the dialog for editing an existing organization.
	 *
	 * @param org - The organization to edit
	 */
	const handleEdit = useCallback(
		(org: Organization): void => {
			setEditingOrganization(org);
			form.setFieldValue('name', org.name);
			form.setFieldValue('slug', org.slug);
			setIsDialogOpen(true);
		},
		[form],
	);

	/**
	 * Generates a slug from the organization name.
	 *
	 * @param name - The organization name
	 * @returns The generated slug
	 */
	const generateSlug = (name: string): string => {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	};

	const validateName = (value: string): string | undefined => {
		const trimmed = value.trim();
		if (!trimmed) return t('validation.nameRequired');
		if (trimmed.length < NAME_LIMITS.min) {
			return t('validation.nameMin', { min: NAME_LIMITS.min });
		}
		if (trimmed.length > NAME_LIMITS.max) {
			return t('validation.nameMax', { max: NAME_LIMITS.max });
		}
		return undefined;
	};

	const validateSlug = (value: string): string | undefined => {
		const trimmed = value.trim();
		if (!trimmed) return t('validation.slugRequired');
		if (trimmed.length < SLUG_LIMITS.min) {
			return t('validation.slugMin', { min: SLUG_LIMITS.min });
		}
		if (trimmed.length > SLUG_LIMITS.max) {
			return t('validation.slugMax', { max: SLUG_LIMITS.max });
		}
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
			return t('validation.slugPattern');
		}
		return undefined;
	};

	const handleDialogOpenChange = useCallback(
		(open: boolean): void => {
			setIsDialogOpen(open);
			if (!open) {
				setEditingOrganization(null);
				form.reset();
				setDeleteConfirmId(null);
			}
		},
		[form],
	);

	/**
	 * Handles organization deletion.
	 *
	 * @param id - The organization ID to delete
	 * @returns void
	 */
	const handleDelete = useCallback(
		(id: string): void => {
			deleteMutation.mutate(id);
		},
		[deleteMutation],
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

	/**
	 * Updates the sorting state and resets pagination.
	 *
	 * @param value - Next sorting state or updater
	 * @returns void
	 */
	const handleSortingChange = useCallback(
		(value: React.SetStateAction<SortingState>): void => {
			setSorting((prev) => (typeof value === 'function' ? value(prev) : value));
			setPagination((prev) => ({ ...prev, pageIndex: 0 }));
		},
		[],
	);

	const columns = useMemo<ColumnDef<Organization>[]>(
		() => [
			{
				accessorKey: 'name',
				header: t('table.headers.name'),
				cell: ({ row }) => (
					<span className="font-medium">{row.original.name}</span>
				),
			},
			{
				accessorKey: 'slug',
				header: t('table.headers.slug'),
				cell: ({ row }) => <code className="text-sm">{row.original.slug}</code>,
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
				cell: ({ row }) => (
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon"
							onClick={() => handleEdit(row.original)}
							aria-label={t('dialog.title.edit')}
						>
							<Edit className="h-4 w-4" />
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
									>
										{tCommon('delete')}
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</div>
				),
			},
		],
		[deleteConfirmId, handleDelete, handleEdit, t, tCommon],
	);

	const emptyState = useMemo(
		() => (
			<div className="flex flex-col items-center gap-3">
				<Users className="h-8 w-8 text-muted-foreground" />
				<div className="space-y-1">
					<p className="font-medium text-foreground">
						{t('table.empty.title')}
					</p>
					<p className="text-sm text-muted-foreground">
						{t('table.empty.description')}
					</p>
				</div>
				{canCreateOrganization ? (
					<DialogTrigger asChild>
						<Button onClick={handleCreateNew} size="sm">
							<Plus className="mr-2 h-4 w-4" />
							{t('actions.create')}
						</Button>
					</DialogTrigger>
				) : null}
			</div>
		),
		[canCreateOrganization, handleCreateNew, t],
	);

	return (
		<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
						<p className="text-muted-foreground">{t('subtitle')}</p>
					</div>
					{canCreateOrganization ? (
						<DialogTrigger asChild>
							<Button onClick={handleCreateNew}>
								<Plus className="mr-2 h-4 w-4" />
								{t('actions.create')}
							</Button>
						</DialogTrigger>
					) : null}
				</div>

				<DataTable
					columns={columns}
					data={organizations}
					sorting={sorting}
					onSortingChange={handleSortingChange}
					pagination={pagination}
					onPaginationChange={setPagination}
					columnFilters={columnFilters}
					onColumnFiltersChange={setColumnFilters}
					globalFilter={globalFilter}
					onGlobalFilterChange={handleGlobalFilterChange}
					globalFilterPlaceholder={t('search.placeholder')}
					emptyState={emptyState}
					isLoading={isLoading}
					manualPagination={isSuperUser}
					manualFiltering={isSuperUser}
					rowCount={isSuperUser ? totalRows : undefined}
				/>
			</div>

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
							{editingOrganization
								? t('dialog.title.edit')
								: t('dialog.title.create')}
						</DialogTitle>
						<DialogDescription>
							{editingOrganization
								? t('dialog.description.edit')
								: t('dialog.description.create')}
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<form.AppField
							name="name"
							validators={{
								onChange: ({ value }) => validateName(value),
							}}
						>
							{(field) => (
								<field.TextField
									label={t('fields.name')}
									description={t('fields.nameDescription', {
										min: NAME_LIMITS.min,
										max: NAME_LIMITS.max,
									})}
									onValueChange={(val) => {
										if (!editingOrganization) {
											form.setFieldValue('slug', generateSlug(val));
										}
										return val;
									}}
								/>
							)}
						</form.AppField>
						<form.AppField
							name="slug"
							validators={{
								onChange: ({ value }) => validateSlug(value),
							}}
						>
							{(field) => (
								<field.TextField
									label={t('fields.slug')}
									description={t('fields.slugDescription', {
										min: SLUG_LIMITS.min,
										max: SLUG_LIMITS.max,
									})}
									onValueChange={(val) => generateSlug(val)}
								/>
							)}
						</form.AppField>
					</div>
					<DialogFooter>
						<form.AppForm>
							<form.SubmitButton
								label={editingOrganization ? tCommon('save') : t('actions.create')}
								loadingLabel={
									editingOrganization ? tCommon('saving') : t('actions.creating')
								}
							/>
						</form.AppForm>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
