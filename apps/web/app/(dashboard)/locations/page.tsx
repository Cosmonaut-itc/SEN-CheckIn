'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
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

/**
 * Location record interface.
 */
interface Location {
	id: string;
	name: string;
	code: string;
	address: string | null;
	clientId: string;
	createdAt: Date;
	updatedAt: Date;
}

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
 * Locations list page component.
 * Provides CRUD operations for location management.
 *
 * @returns The locations page JSX element
 */
export default function LocationsPage(): React.ReactElement {
	const [locations, setLocations] = useState<Location[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [search, setSearch] = useState<string>('');
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
	const [editingLocation, setEditingLocation] = useState<Location | null>(null);
	const [formData, setFormData] = useState<LocationFormData>(initialFormData);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

	/**
	 * Fetches locations from the API.
	 */
	const fetchLocations = useCallback(async (): Promise<void> => {
		setIsLoading(true);
		try {
			const response = await api.locations.get({
				$query: { limit: 100, offset: 0, search: search || undefined },
			});
			if (response.data?.data) {
				setLocations(response.data.data as Location[]);
			}
		} catch (error) {
			console.error('Failed to fetch locations:', error);
			toast.error('Failed to load locations');
		} finally {
			setIsLoading(false);
		}
	}, [search]);

	useEffect(() => {
		fetchLocations();
	}, [fetchLocations]);

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
	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
		e.preventDefault();
		setIsSubmitting(true);

		try {
			if (editingLocation) {
				// Update existing location
				const response = await api.locations[editingLocation.id].put({
					name: formData.name,
					code: formData.code,
					address: formData.address || undefined,
				});

				if (response.error) {
					throw new Error('Failed to update location');
				}

				toast.success('Location updated successfully');
			} else {
				// Create new location
				const response = await api.locations.post({
					name: formData.name,
					code: formData.code,
					address: formData.address || undefined,
					clientId: formData.clientId,
				});

				if (response.error) {
					throw new Error('Failed to create location');
				}

				toast.success('Location created successfully');
			}

			setIsDialogOpen(false);
			fetchLocations();
		} catch (error) {
			console.error('Failed to save location:', error);
			toast.error(editingLocation ? 'Failed to update location' : 'Failed to create location');
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Handles location deletion.
	 *
	 * @param id - The location ID to delete
	 */
	const handleDelete = async (id: string): Promise<void> => {
		try {
			const response = await api.locations[id].delete();

			if (response.error) {
				throw new Error('Failed to delete location');
			}

			toast.success('Location deleted successfully');
			setDeleteConfirmId(null);
			fetchLocations();
		} catch (error) {
			console.error('Failed to delete location:', error);
			toast.error('Failed to delete location');
		}
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
						{isLoading ? (
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
