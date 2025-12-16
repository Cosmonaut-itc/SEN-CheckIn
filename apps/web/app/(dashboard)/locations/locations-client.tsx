'use client';

import React, { useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppForm } from '@/lib/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
				toast.success('Location created successfully');
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
			} else {
				toast.error(result.error ?? 'Failed to create location');
			}
		},
		onError: () => {
			toast.error('Failed to create location');
		},
	});

	// Update mutation
	const updateMutation = useMutation({
		mutationKey: mutationKeys.locations.update,
		mutationFn: updateLocation,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Location updated successfully');
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
			} else {
				toast.error(result.error ?? 'Failed to update location');
			}
		},
		onError: () => {
			toast.error('Failed to update location');
		},
	});

	// Delete mutation
	const deleteMutation = useMutation({
		mutationKey: mutationKeys.locations.delete,
		mutationFn: deleteLocation,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Location deleted successfully');
				setDeleteConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
			} else {
				toast.error(result.error ?? 'Failed to delete location');
			}
		},
		onError: () => {
			toast.error('Failed to delete location');
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
					toast.error('No active organization. Please select an organization first.');
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
				<h1 className="text-3xl font-bold tracking-tight">Locations</h1>
				<p className="text-muted-foreground">
					Select an active organization to manage locations.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Locations</h1>
					<p className="text-muted-foreground">Manage branches and office locations</p>
				</div>
				<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
					<DialogTrigger asChild>
						<Button onClick={handleCreateNew}>
							<Plus className="mr-2 h-4 w-4" />
							Add Location
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[425px]">
						<form onSubmit={handleSubmit}>
							<DialogHeader>
								<DialogTitle>
									{editingLocation ? 'Edit Location' : 'Add Location'}
								</DialogTitle>
								<DialogDescription>
									{editingLocation
										? 'Update the location details below.'
										: 'Fill in the details to create a new location.'}
								</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4 py-4">
								<form.AppField
									name="name"
									validators={{
										onChange: ({ value }) =>
											!value.trim() ? 'Name is required' : undefined,
									}}
								>
									{(field) => <field.TextField label="Name" />}
								</form.AppField>
								<form.AppField
									name="code"
									validators={{
										onChange: ({ value }) =>
											!value.trim() ? 'Code is required' : undefined,
									}}
								>
									{(field) => <field.TextField label="Code" />}
								</form.AppField>
								<form.AppField name="geographicZone">
									{(field) => (
										<field.SelectField
											label="Geographic Zone"
											options={[
												{ value: 'GENERAL', label: 'General – Salario mínimo $278.80' },
												{
													value: 'ZLFN',
													label: 'Zona Libre de la Frontera Norte – Salario mínimo $419.88',
												},
											]}
											placeholder="Select zone"
										/>
									)}
								</form.AppField>
								<form.AppField
									name="timeZone"
									validators={{
										onChange: ({ value }) =>
											!value.trim() ? 'Time zone is required' : undefined,
									}}
								>
									{(field) => (
										<field.TextField
											label="Time zone"
											placeholder="America/Mexico_City"
										/>
									)}
								</form.AppField>
								<form.AppField name="address">
									{(field) => <field.TextField label="Address" placeholder="Optional" />}
								</form.AppField>
							</div>
							<DialogFooter>
								<form.AppForm>
									<form.SubmitButton label="Save" loadingLabel="Saving..." />
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
						placeholder="Search locations..."
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
							<TableHead>Code</TableHead>
							<TableHead>Name</TableHead>
							<TableHead>Address</TableHead>
							<TableHead>Zone</TableHead>
							<TableHead>Time zone</TableHead>
							<TableHead>Created</TableHead>
							<TableHead className="w-[100px]">Actions</TableHead>
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
									No locations found.
								</TableCell>
							</TableRow>
						) : (
							locations.map((location) => (
								<TableRow key={location.id}>
									<TableCell className="font-medium">{location.code}</TableCell>
									<TableCell>{location.name}</TableCell>
									<TableCell>{location.address ?? '-'}</TableCell>
									<TableCell>{location.geographicZone}</TableCell>
									<TableCell>{location.timeZone}</TableCell>
									<TableCell>
										{format(new Date(location.createdAt), 'MMM d, yyyy')}
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
														<DialogTitle>Delete Location</DialogTitle>
														<DialogDescription>
															Are you sure you want to delete{' '}
															{location.name}? This action cannot be
															undone.
														</DialogDescription>
													</DialogHeader>
													<DialogFooter>
														<Button
															variant="outline"
															onClick={() => setDeleteConfirmId(null)}
														>
															Cancel
														</Button>
														<Button
															variant="destructive"
															onClick={() =>
																handleDelete(location.id)
															}
														>
															Delete
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
