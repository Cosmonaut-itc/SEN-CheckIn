'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
 * Form data interface for creating/editing locations.
 */
interface LocationFormData {
	name: string;
	code: string;
	address: string;
	clientId: string;
}

/**
 * Initial empty form data.
 */
const initialFormData: LocationFormData = {
	name: '',
	code: '',
	address: '',
	clientId: '',
};

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
	const [formData, setFormData] = useState<LocationFormData>(initialFormData);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

	// Query for locations list
	const { data, isFetching } = useQuery({
		queryKey: queryKeys.locations.list({ search: search || undefined, limit: 100, offset: 0 }),
		queryFn: () => fetchLocationsList({ search: search || undefined, limit: 100, offset: 0 }),
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

	/**
	 * Opens the dialog for creating a new location.
	 */
	const handleCreateNew = (): void => {
		setEditingLocation(null);
		setFormData(initialFormData);
		setIsDialogOpen(true);
	};

	/**
	 * Opens the dialog for editing an existing location.
	 *
	 * @param location - The location to edit
	 */
	const handleEdit = (location: Location): void => {
		setEditingLocation(location);
		setFormData({
			name: location.name,
			code: location.code,
			address: location.address ?? '',
			clientId: location.clientId,
		});
		setIsDialogOpen(true);
	};

	/**
	 * Handles form submission for creating or updating a location.
	 *
	 * @param e - The form submission event
	 */
	const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
		e.preventDefault();

		if (editingLocation) {
			updateMutation.mutate({
				id: editingLocation.id,
				name: formData.name,
				code: formData.code,
				address: formData.address || undefined,
			});
		} else {
			createMutation.mutate({
				name: formData.name,
				code: formData.code,
				address: formData.address || undefined,
				clientId: formData.clientId,
			});
		}
	};

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
				<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="name" className="text-right">
										Name
									</Label>
									<Input
										id="name"
										value={formData.name}
										onChange={(e) =>
											setFormData({ ...formData, name: e.target.value })
										}
										className="col-span-3"
										required
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="code" className="text-right">
										Code
									</Label>
									<Input
										id="code"
										value={formData.code}
										onChange={(e) =>
											setFormData({ ...formData, code: e.target.value })
										}
										className="col-span-3"
										required
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="address" className="text-right">
										Address
									</Label>
									<Input
										id="address"
										value={formData.address}
										onChange={(e) =>
											setFormData({ ...formData, address: e.target.value })
										}
										className="col-span-3"
									/>
								</div>
								{!editingLocation && (
									<div className="grid grid-cols-4 items-center gap-4">
										<Label htmlFor="clientId" className="text-right">
											Client ID
										</Label>
										<Input
											id="clientId"
											value={formData.clientId}
											onChange={(e) =>
												setFormData({ ...formData, clientId: e.target.value })
											}
											className="col-span-3"
											required
											placeholder="Client UUID"
										/>
									</div>
								)}
							</div>
							<DialogFooter>
								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Saving...
										</>
									) : (
										'Save'
									)}
								</Button>
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

