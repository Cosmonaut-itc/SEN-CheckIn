"use client";

import * as React from "react";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, MapPin } from "lucide-react";
import { Header } from "@/components/header";
import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

/**
 * Location interface representing a location record.
 */
interface Location {
	id: string;
	name: string;
	code: string;
	address: string | null;
	clientId: string;
	createdAt: string;
	updatedAt: string;
}

/**
 * Client interface for dropdown selection.
 */
interface Client {
	id: string;
	name: string;
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

const PAGE_SIZE = 10;

/**
 * Locations page component.
 * Provides CRUD operations for location management.
 *
 * @returns Rendered locations page
 */
export default function LocationsPage(): React.JSX.Element {
	const { toast } = useToast();
	const [locations, setLocations] = React.useState<Location[]>([]);
	const [clients, setClients] = React.useState<Client[]>([]);
	const [isLoading, setIsLoading] = React.useState<boolean>(true);
	const [page, setPage] = React.useState<number>(1);
	const [totalPages, setTotalPages] = React.useState<number>(1);
	const [searchQuery, setSearchQuery] = React.useState<string>("");

	// Dialog states
	const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState<boolean>(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = React.useState<boolean>(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState<boolean>(false);
	const [selectedLocation, setSelectedLocation] = React.useState<Location | null>(null);
	const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);

	// Form state
	const [formData, setFormData] = React.useState<LocationFormData>({
		name: "",
		code: "",
		address: "",
		clientId: "",
	});

	/**
	 * Fetches locations and clients from the API.
	 */
	const fetchData = React.useCallback(async (): Promise<void> => {
		setIsLoading(true);
		try {
			const [locationsRes, clientsRes] = await Promise.all([
				api.locations.get({
					query: {
						limit: PAGE_SIZE,
						offset: (page - 1) * PAGE_SIZE,
					},
				}),
				api.clients.get({ query: { limit: 100, offset: 0 } }),
			]);

			if (locationsRes.data) {
				setLocations(locationsRes.data.data as Location[]);
				const total = locationsRes.data.pagination?.total ?? 0;
				setTotalPages(Math.ceil(total / PAGE_SIZE));
			}

			if (clientsRes.data) {
				setClients(clientsRes.data.data as Client[]);
			}
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to fetch locations",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	}, [page, toast]);

	React.useEffect(() => {
		fetchData();
	}, [fetchData]);

	/**
	 * Resets form data to initial state.
	 */
	const resetForm = (): void => {
		setFormData({
			name: "",
			code: "",
			address: "",
			clientId: "",
		});
	};

	/**
	 * Handles creating a new location.
	 */
	const handleCreate = async (): Promise<void> => {
		setIsSubmitting(true);
		try {
			const response = await api.locations.post({
				name: formData.name,
				code: formData.code,
				address: formData.address || undefined,
				clientId: formData.clientId,
			});

			if (response.error) {
				toast({
					title: "Error",
					description: "Failed to create location",
					variant: "destructive",
				});
				return;
			}

			toast({
				title: "Success",
				description: "Location created successfully",
			});
			setIsCreateDialogOpen(false);
			resetForm();
			fetchData();
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to create location",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Handles updating a location.
	 */
	const handleUpdate = async (): Promise<void> => {
		if (!selectedLocation) return;

		setIsSubmitting(true);
		try {
			const response = await api.locations({ id: selectedLocation.id }).put({
				name: formData.name,
				code: formData.code,
				address: formData.address || undefined,
				clientId: formData.clientId,
			});

			if (response.error) {
				toast({
					title: "Error",
					description: "Failed to update location",
					variant: "destructive",
				});
				return;
			}

			toast({
				title: "Success",
				description: "Location updated successfully",
			});
			setIsEditDialogOpen(false);
			setSelectedLocation(null);
			resetForm();
			fetchData();
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to update location",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Handles deleting a location.
	 */
	const handleDelete = async (): Promise<void> => {
		if (!selectedLocation) return;

		setIsSubmitting(true);
		try {
			const response = await api.locations({ id: selectedLocation.id }).delete();

			if (response.error) {
				toast({
					title: "Error",
					description: "Failed to delete location",
					variant: "destructive",
				});
				return;
			}

			toast({
				title: "Success",
				description: "Location deleted successfully",
			});
			setIsDeleteDialogOpen(false);
			setSelectedLocation(null);
			fetchData();
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to delete location",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Opens the edit dialog with location data.
	 */
	const openEditDialog = (location: Location): void => {
		setSelectedLocation(location);
		setFormData({
			name: location.name,
			code: location.code,
			address: location.address ?? "",
			clientId: location.clientId,
		});
		setIsEditDialogOpen(true);
	};

	/**
	 * Opens the delete confirmation dialog.
	 */
	const openDeleteDialog = (location: Location): void => {
		setSelectedLocation(location);
		setIsDeleteDialogOpen(true);
	};

	/**
	 * Gets client name by ID.
	 */
	const getClientName = (clientId: string): string => {
		const client = clients.find((c) => c.id === clientId);
		return client?.name ?? "Unknown";
	};

	/**
	 * Column definitions for the data table.
	 */
	const columns: Column<Location>[] = [
		{
			key: "code",
			header: "Code",
			cell: (location) => (
				<span className="font-mono text-sm">{location.code}</span>
			),
		},
		{
			key: "name",
			header: "Name",
			cell: (location) => (
				<div className="flex items-center gap-2">
					<MapPin className="h-4 w-4 text-muted-foreground" />
					<span className="font-medium">{location.name}</span>
				</div>
			),
		},
		{
			key: "address",
			header: "Address",
			cell: (location) => (
				<span className="text-sm text-muted-foreground">
					{location.address ?? "—"}
				</span>
			),
		},
		{
			key: "client",
			header: "Client",
			cell: (location) => getClientName(location.clientId),
		},
		{
			key: "createdAt",
			header: "Created",
			cell: (location) => format(new Date(location.createdAt), "MMM d, yyyy"),
		},
		{
			key: "actions",
			header: "Actions",
			cell: (location) => (
				<div className="flex gap-2">
					<Button
						variant="ghost"
						size="icon"
						onClick={(e) => {
							e.stopPropagation();
							openEditDialog(location);
						}}
					>
						<Pencil className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={(e) => {
							e.stopPropagation();
							openDeleteDialog(location);
						}}
					>
						<Trash2 className="h-4 w-4 text-destructive" />
					</Button>
				</div>
			),
		},
	];

	return (
		<>
			<Header title="Locations" />
			<div className="p-6 space-y-6">
				{/* Toolbar */}
				<div className="flex items-center justify-between gap-4">
					<div className="flex-1 max-w-sm">
						<Input
							placeholder="Search locations..."
							value={searchQuery}
							onChange={(e) => {
								setSearchQuery(e.target.value);
								setPage(1);
							}}
						/>
					</div>
					<Button
						onClick={() => {
							resetForm();
							setIsCreateDialogOpen(true);
						}}
					>
						<Plus className="h-4 w-4 mr-2" />
						Add Location
					</Button>
				</div>

				{/* Data Table */}
				<DataTable
					columns={columns}
					data={locations}
					isLoading={isLoading}
					keyExtractor={(location) => location.id}
					emptyMessage="No locations found"
					page={page}
					totalPages={totalPages}
					onPageChange={setPage}
				/>
			</div>

			{/* Create Dialog */}
			<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add Location</DialogTitle>
						<DialogDescription>
							Create a new office location in the system.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="code">Location Code *</Label>
								<Input
									id="code"
									value={formData.code}
									onChange={(e) =>
										setFormData({ ...formData, code: e.target.value })
									}
									placeholder="LOC-001"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="name">Name *</Label>
								<Input
									id="name"
									value={formData.name}
									onChange={(e) =>
										setFormData({ ...formData, name: e.target.value })
									}
									placeholder="Main Office"
								/>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="address">Address</Label>
							<Input
								id="address"
								value={formData.address}
								onChange={(e) =>
									setFormData({ ...formData, address: e.target.value })
								}
								placeholder="123 Main St, City, Country"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="clientId">Client *</Label>
							<select
								id="clientId"
								value={formData.clientId}
								onChange={(e) =>
									setFormData({ ...formData, clientId: e.target.value })
								}
								className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
							>
								<option value="">Select a client</option>
								{clients.map((client) => (
									<option key={client.id} value={client.id}>
										{client.name}
									</option>
								))}
							</select>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setIsCreateDialogOpen(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button
							onClick={handleCreate}
							disabled={
								isSubmitting || !formData.code || !formData.name || !formData.clientId
							}
						>
							{isSubmitting ? "Creating..." : "Create Location"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Edit Dialog */}
			<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Location</DialogTitle>
						<DialogDescription>Update the location information below.</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="edit-code">Location Code *</Label>
								<Input
									id="edit-code"
									value={formData.code}
									onChange={(e) =>
										setFormData({ ...formData, code: e.target.value })
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="edit-name">Name *</Label>
								<Input
									id="edit-name"
									value={formData.name}
									onChange={(e) =>
										setFormData({ ...formData, name: e.target.value })
									}
								/>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="edit-address">Address</Label>
							<Input
								id="edit-address"
								value={formData.address}
								onChange={(e) =>
									setFormData({ ...formData, address: e.target.value })
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="edit-clientId">Client *</Label>
							<select
								id="edit-clientId"
								value={formData.clientId}
								onChange={(e) =>
									setFormData({ ...formData, clientId: e.target.value })
								}
								className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
							>
								<option value="">Select a client</option>
								{clients.map((client) => (
									<option key={client.id} value={client.id}>
										{client.name}
									</option>
								))}
							</select>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setIsEditDialogOpen(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button
							onClick={handleUpdate}
							disabled={
								isSubmitting || !formData.code || !formData.name || !formData.clientId
							}
						>
							{isSubmitting ? "Saving..." : "Save Changes"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Location</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete location{" "}
							<strong>{selectedLocation?.name}</strong>? This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setIsDeleteDialogOpen(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleDelete}
							disabled={isSubmitting}
						>
							{isSubmitting ? "Deleting..." : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
