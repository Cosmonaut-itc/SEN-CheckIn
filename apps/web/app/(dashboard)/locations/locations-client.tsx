'use client';

import React, { useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppForm } from '@/lib/forms';
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
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchLocationsList, type Location } from '@/lib/client-functions';
import { createLocation, updateLocation, deleteLocation } from '@/actions/locations';
import { useOrgContext } from '@/lib/org-client-context';

/**
 * Form values for creating/editing locations.
 */
interface LocationFormValues {
	name: string;
	code: string;
	address: string;
	geographicZone: 'GENERAL' | 'ZLFN';
	timeZone: string;
}

/**
 * Locations page client component.
 * Provides CRUD operations for location management using TanStack Query.
 *
 * @returns The locations page JSX element
 */
export function LocationsPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId } = useOrgContext();
	const t = useTranslations('Locations');
	const tCommon = useTranslations('Common');
	const [search, setSearch] = useState<string>('');
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [editingLocation, setEditingLocation] = useState<Location | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const isOrgSelected = Boolean(organizationId);

	// Build query params - only include search if it has a value
	const queryParams = {
		limit: 100,
		offset: 0,
		...(search ? { search } : {}),
		...(organizationId ? { organizationId } : {}),
	};

	// Query for locations list
	const { data, isFetching } = useQuery({
		queryKey: queryKeys.locations.list(queryParams),
		queryFn: () => fetchLocationsList(queryParams),
		enabled: isOrgSelected,
	});

	const locations = data?.data ?? [];

	// Create mutation
	const createMutation = useMutation({
		mutationKey: mutationKeys.locations.create,
		mutationFn: createLocation,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.createSuccess'));
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
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
		mutationKey: mutationKeys.locations.update,
		mutationFn: updateLocation,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.updateSuccess'));
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
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
		mutationKey: mutationKeys.locations.delete,
		mutationFn: deleteLocation,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.deleteSuccess'));
				setDeleteConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
			} else {
				toast.error(result.error ?? t('toast.deleteError'));
			}
		},
		onError: () => {
			toast.error(t('toast.deleteError'));
		},
	});

	// TanStack Form instance (after mutations to avoid TDZ)
	const form = useAppForm({
		defaultValues: {
			name: '',
			code: '',
			address: '',
			geographicZone: 'GENERAL',
			timeZone: 'America/Mexico_City',
		},
		onSubmit: async ({ value }: { value: LocationFormValues }) => {
			if (editingLocation) {
				await updateMutation.mutateAsync({
					id: editingLocation.id,
					name: value.name,
					code: value.code,
					address: value.address || undefined,
					geographicZone: value.geographicZone,
					timeZone: value.timeZone,
				});
			} else {
				if (!organizationId) {
					toast.error(t('toast.noOrganization'));
					return;
				}
				await createMutation.mutateAsync({
					name: value.name,
					code: value.code,
					address: value.address || undefined,
					geographicZone: value.geographicZone,
					timeZone: value.timeZone,
					organizationId,
				});
			}
			setIsDialogOpen(false);
			setEditingLocation(null);
			form.reset();
		},
	});

	/**
	 * Opens the dialog for creating a new location.
	 */
	const handleCreateNew = useCallback((): void => {
		setEditingLocation(null);
		form.reset();
		setIsDialogOpen(true);
	}, [form]);

	/**
	 * Opens the dialog for editing an existing location.
	 *
	 * @param location - The location to edit
	 */
	const handleEdit = useCallback(
		(location: Location): void => {
			setEditingLocation(location);
			form.setFieldValue('name', location.name);
			form.setFieldValue('code', location.code);
			form.setFieldValue('address', location.address ?? '');
			form.setFieldValue('geographicZone', location.geographicZone ?? 'GENERAL');
			form.setFieldValue('timeZone', location.timeZone ?? 'America/Mexico_City');
			setIsDialogOpen(true);
		},
		[form],
	);

	/**
	 * Handles form submission for creating or updating a location.
	 *
	 * @param e - The form submission event
	 */
	const handleSubmit = useCallback(
		(e: React.FormEvent<HTMLFormElement>): void => {
			e.preventDefault();
			e.stopPropagation();
			form.handleSubmit();
		},
		[form],
	);

	const handleDialogOpenChange = useCallback(
		(open: boolean): void => {
			setIsDialogOpen(open);
			if (!open) {
				setEditingLocation(null);
				form.reset();
			}
		},
		[form],
	);

	/**
	 * Handles location deletion.
	 *
	 * @param id - The location ID to delete
	 */
	const handleDelete = (id: string): void => {
		deleteMutation.mutate(id);
	};

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
						<form onSubmit={handleSubmit}>
							<DialogHeader>
								<DialogTitle>
									{editingLocation
										? t('dialog.title.edit')
										: t('dialog.title.add')}
								</DialogTitle>
								<DialogDescription>
									{editingLocation
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
									{(field) => <field.TextField label={t('fields.name')} />}
								</form.AppField>
								<form.AppField
									name="code"
									validators={{
										onChange: ({ value }) =>
											!value.trim()
												? t('validation.codeRequired')
												: undefined,
									}}
								>
									{(field) => <field.TextField label={t('fields.code')} />}
								</form.AppField>
								<form.AppField name="geographicZone">
									{(field) => (
										<field.SelectField
											label={t('fields.geographicZone')}
											options={[
												{
													value: 'GENERAL',
													label: t('zonesWithWage.GENERAL'),
												},
												{
													value: 'ZLFN',
													label: t('zonesWithWage.ZLFN'),
												},
											]}
											placeholder={t('placeholders.selectZone')}
										/>
									)}
								</form.AppField>
								<form.AppField
									name="timeZone"
									validators={{
										onChange: ({ value }) =>
											!value.trim()
												? t('validation.timeZoneRequired')
												: undefined,
									}}
								>
									{(field) => (
										<field.TextField
											label={t('fields.timeZone')}
											placeholder="America/Mexico_City"
										/>
									)}
								</form.AppField>
								<form.AppField name="address">
									{(field) => (
										<field.TextField
											label={t('fields.address')}
											placeholder={tCommon('optional')}
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
							<TableHead>{t('table.headers.code')}</TableHead>
							<TableHead>{t('table.headers.name')}</TableHead>
							<TableHead>{t('table.headers.address')}</TableHead>
							<TableHead>{t('table.headers.zone')}</TableHead>
							<TableHead>{t('table.headers.timeZone')}</TableHead>
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
						) : locations.length === 0 ? (
							<TableRow>
								<TableCell colSpan={7} className="h-24 text-center">
									{t('table.empty')}
								</TableCell>
							</TableRow>
						) : (
							locations.map((location) => (
								<TableRow key={location.id}>
									<TableCell className="font-medium">{location.code}</TableCell>
									<TableCell>{location.name}</TableCell>
									<TableCell>{location.address ?? '-'}</TableCell>
									<TableCell>
										{t(`zones.${location.geographicZone ?? 'GENERAL'}`)}
									</TableCell>
									<TableCell>{location.timeZone}</TableCell>
									<TableCell>
										{format(new Date(location.createdAt), t('dateFormat'))}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Button
												variant="ghost"
												size="icon"
												onClick={() => handleEdit(location)}
											>
												<Pencil className="h-4 w-4" />
											</Button>
											<Dialog
												open={deleteConfirmId === location.id}
												onOpenChange={(open) =>
													setDeleteConfirmId(open ? location.id : null)
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
																name: location.name,
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
																handleDelete(location.id)
															}
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
	);
}
