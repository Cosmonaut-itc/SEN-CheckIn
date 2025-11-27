'use client';

import React, { useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
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
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchLocationsList, type Location } from '@/lib/client-functions';
import { createLocation, updateLocation, deleteLocation } from '@/actions/locations';

/**
 * Form values for creating/editing locations.
 */
interface LocationFormValues {
	name: string;
	code: string;
	address: string;
	clientId: string;
}

/**
 * Locations page client component.
 * Provides CRUD operations for location management using TanStack Query.
 *
 * @returns The locations page JSX element
 */
export function LocationsPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState<string>('');
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [editingLocation, setEditingLocation] = useState<Location | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

	// Build query params - only include search if it has a value
	const queryParams = search
		? { search, limit: 100, offset: 0 }
		: { limit: 100, offset: 0 };

	// Query for locations list
	const { data, isFetching } = useQuery({
		queryKey: queryKeys.locations.list(queryParams),
		queryFn: () => fetchLocationsList(queryParams),
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

	const isSubmitting = createMutation.isPending || updateMutation.isPending;

	// TanStack Form instance (after mutations to avoid TDZ)
	const form = useForm({
		defaultValues: {
			name: '',
			code: '',
			address: '',
			clientId: '',
		},
		onSubmit: async ({ value }: { value: LocationFormValues }) => {
			if (editingLocation) {
				updateMutation.mutate({
					id: editingLocation.id,
					name: value.name,
					code: value.code,
					address: value.address || undefined,
				});
			} else {
				createMutation.mutate({
					name: value.name,
					code: value.code,
					address: value.address || undefined,
					clientId: value.clientId,
				});
			}
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
			form.setFieldValue('clientId', location.clientId);
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

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Locations</h1>
					<p className="text-muted-foreground">
						Manage branches and office locations
					</p>
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
						<form.Field
							name="name"
							validators={{
								onChange: ({ value }) => (!value.trim() ? 'Name is required' : undefined),
							}}
						>
							{(field) => (
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor={field.name} className="text-right">
										Name
									</Label>
									<div className="col-span-3">
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
											onBlur={field.handleBlur}
											required
										/>
										{field.state.meta.errors.length > 0 && (
											<p className="mt-1 text-sm text-destructive">
												{field.state.meta.errors.join(', ')}
											</p>
										)}
									</div>
								</div>
							)}
						</form.Field>
						<form.Field
							name="code"
							validators={{
								onChange: ({ value }) => (!value.trim() ? 'Code is required' : undefined),
							}}
						>
							{(field) => (
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor={field.name} className="text-right">
										Code
									</Label>
									<div className="col-span-3">
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
											onBlur={field.handleBlur}
											required
										/>
										{field.state.meta.errors.length > 0 && (
											<p className="mt-1 text-sm text-destructive">
												{field.state.meta.errors.join(', ')}
											</p>
										)}
									</div>
								</div>
							)}
						</form.Field>
						<form.Field name="address">
							{(field) => (
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor={field.name} className="text-right">
										Address
									</Label>
									<div className="col-span-3">
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
											onBlur={field.handleBlur}
											placeholder="Optional"
										/>
									</div>
								</div>
							)}
						</form.Field>
						{!editingLocation && (
							<form.Field
								name="clientId"
								validators={{
									onChange: ({ value }) => (!value.trim() ? 'Client ID is required' : undefined),
								}}
							>
								{(field) => (
									<div className="grid grid-cols-4 items-center gap-4">
										<Label htmlFor={field.name} className="text-right">
											Client ID
										</Label>
										<div className="col-span-3">
											<Input
												id={field.name}
												name={field.name}
												value={field.state.value}
												onChange={(e) => field.handleChange(e.target.value)}
												onBlur={field.handleBlur}
												required
												placeholder="Client UUID"
											/>
											{field.state.meta.errors.length > 0 && (
												<p className="mt-1 text-sm text-destructive">
													{field.state.meta.errors.join(', ')}
												</p>
											)}
										</div>
									</div>
								)}
							</form.Field>
						)}
					</div>
					<DialogFooter>
						<form.Subscribe selector={(state) => [state.canSubmit]}>
							{([canSubmit]) => (
								<Button type="submit" disabled={!canSubmit || isSubmitting}>
									{isSubmitting ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Saving...
										</>
									) : (
										'Save'
									)}
								</Button>
							)}
						</form.Subscribe>
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
							<TableHead>Created</TableHead>
							<TableHead className="w-[100px]">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isFetching ? (
							Array.from({ length: 5 }).map((_, i) => (
								<TableRow key={i}>
									{Array.from({ length: 5 }).map((_, j) => (
										<TableCell key={j}>
											<Skeleton className="h-4 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : locations.length === 0 ? (
							<TableRow>
								<TableCell colSpan={5} className="h-24 text-center">
									No locations found.
								</TableCell>
							</TableRow>
						) : (
							locations.map((location) => (
								<TableRow key={location.id}>
									<TableCell className="font-medium">{location.code}</TableCell>
									<TableCell>{location.name}</TableCell>
									<TableCell>{location.address ?? '-'}</TableCell>
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
															Are you sure you want to delete {location.name}?
															This action cannot be undone.
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
															onClick={() => handleDelete(location.id)}
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
