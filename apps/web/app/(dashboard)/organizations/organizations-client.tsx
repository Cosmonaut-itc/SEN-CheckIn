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
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { fetchOrganizations, type Organization } from '@/lib/client-functions';
import { useAppForm } from '@/lib/forms';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Edit, Plus, Search, Trash2, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import React, { useCallback, useState } from 'react';
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
	const [search, setSearch] = useState<string>('');
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [editingOrganization, setEditingOrganization] = useState<Organization | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const NAME_LIMITS = { min: 3, max: 80 };
	const SLUG_LIMITS = { min: 3, max: 50 };

	// Query for organizations list
	const { data: organizations = [], isFetching } = useQuery({
		queryKey: queryKeys.organizations.list(),
		queryFn: fetchOrganizations,
	});

	// Create mutation
	const createMutation = useMutation({
		mutationKey: mutationKeys.organizations.create,
		mutationFn: createOrganization,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.createSuccess'));
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
				router.refresh();
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
		mutationKey: mutationKeys.organizations.update,
		mutationFn: updateOrganization,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.updateSuccess'));
				setIsDialogOpen(false);
				setEditingOrganization(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
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
		mutationKey: mutationKeys.organizations.delete,
		mutationFn: deleteOrganization,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.deleteSuccess'));
				setDeleteConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
			} else {
				toast.error(result.error ?? t('toast.deleteError'));
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
	 */
	const handleDelete = (id: string): void => {
		deleteMutation.mutate(id);
	};

	/**
	 * Filters organizations by search term.
	 */
	const filteredOrganizations = organizations.filter(
		(org: Organization) =>
			org.name.toLowerCase().includes(search.toLowerCase()) ||
			org.slug.toLowerCase().includes(search.toLowerCase()),
	);

	return (
		<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
						<p className="text-muted-foreground">{t('subtitle')}</p>
					</div>
					<DialogTrigger asChild>
						<Button onClick={handleCreateNew}>
							<Plus className="mr-2 h-4 w-4" />
							{t('actions.create')}
						</Button>
					</DialogTrigger>
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
								<TableHead>{t('table.headers.slug')}</TableHead>
								<TableHead>{t('table.headers.created')}</TableHead>
								<TableHead className="w-[100px]">
									{t('table.headers.actions')}
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isFetching ? (
								Array.from({ length: 3 }).map((_, i) => (
									<TableRow key={i}>
										{Array.from({ length: 4 }).map((_, j) => (
											<TableCell key={j}>
												<Skeleton className="h-4 w-full" />
											</TableCell>
										))}
									</TableRow>
								))
							) : filteredOrganizations.length === 0 ? (
								<TableRow>
									<TableCell colSpan={4} className="h-24 text-center">
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
											<DialogTrigger asChild>
												<Button onClick={handleCreateNew} size="sm">
													<Plus className="mr-2 h-4 w-4" />
													{t('actions.create')}
												</Button>
											</DialogTrigger>
										</div>
									</TableCell>
								</TableRow>
							) : (
								filteredOrganizations.map((org: Organization) => (
									<TableRow key={org.id}>
										<TableCell className="font-medium">{org.name}</TableCell>
										<TableCell>
											<code className="text-sm">{org.slug}</code>
										</TableCell>
										<TableCell>
											{format(new Date(org.createdAt), t('dateFormat'))}
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-2">
												<Button
													variant="ghost"
													size="icon"
													onClick={() => handleEdit(org)}
												>
													<Edit className="h-4 w-4" />
												</Button>
												<Dialog
													open={deleteConfirmId === org.id}
													onOpenChange={(open) =>
														setDeleteConfirmId(open ? org.id : null)
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
																	name: org.name,
																})}
															</DialogDescription>
														</DialogHeader>
														<DialogFooter>
															<Button
																variant="outline"
																onClick={() =>
																	setDeleteConfirmId(null)
																}
															>
																{tCommon('cancel')}
															</Button>
															<Button
																variant="destructive"
																onClick={() => handleDelete(org.id)}
															>
																{tCommon('delete')}
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
