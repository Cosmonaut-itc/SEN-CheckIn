"use client";

import * as React from "react";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
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
 * Client interface representing a client/organization record.
 */
interface Client {
	id: string;
	name: string;
	apiKeyId: string | null;
	createdAt: string;
	updatedAt: string;
}

/**
 * Form data interface for creating/editing clients.
 */
interface ClientFormData {
	name: string;
}

const PAGE_SIZE = 10;

/**
 * Clients page component.
 * Provides CRUD operations for client organization management.
 *
 * @returns Rendered clients page
 */
export default function ClientsPage(): React.JSX.Element {
	const { toast } = useToast();
	const [clients, setClients] = React.useState<Client[]>([]);
	const [isLoading, setIsLoading] = React.useState<boolean>(true);
	const [page, setPage] = React.useState<number>(1);
	const [totalPages, setTotalPages] = React.useState<number>(1);
	const [searchQuery, setSearchQuery] = React.useState<string>("");

	// Dialog states
	const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState<boolean>(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = React.useState<boolean>(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState<boolean>(false);
	const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
	const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);

	// Form state
	const [formData, setFormData] = React.useState<ClientFormData>({
		name: "",
	});

	/**
	 * Fetches clients from the API.
	 */
	const fetchClients = React.useCallback(async (): Promise<void> => {
		setIsLoading(true);
		try {
			const response = await api.clients.get({
				query: {
					limit: PAGE_SIZE,
					offset: (page - 1) * PAGE_SIZE,
				},
			});

			if (response.data) {
				setClients(response.data.data as Client[]);
				const total = response.data.pagination?.total ?? 0;
				setTotalPages(Math.ceil(total / PAGE_SIZE));
			}
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to fetch clients",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	}, [page, toast]);

	React.useEffect(() => {
		fetchClients();
	}, [fetchClients]);

	/**
	 * Resets form data to initial state.
	 */
	const resetForm = (): void => {
		setFormData({
			name: "",
		});
	};

	/**
	 * Handles creating a new client.
	 */
	const handleCreate = async (): Promise<void> => {
		setIsSubmitting(true);
		try {
			const response = await api.clients.post({
				name: formData.name,
			});

			if (response.error) {
				toast({
					title: "Error",
					description: "Failed to create client",
					variant: "destructive",
				});
				return;
			}

			toast({
				title: "Success",
				description: "Client created successfully",
			});
			setIsCreateDialogOpen(false);
			resetForm();
			fetchClients();
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to create client",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Handles updating a client.
	 */
	const handleUpdate = async (): Promise<void> => {
		if (!selectedClient) return;

		setIsSubmitting(true);
		try {
			const response = await api.clients({ id: selectedClient.id }).put({
				name: formData.name,
			});

			if (response.error) {
				toast({
					title: "Error",
					description: "Failed to update client",
					variant: "destructive",
				});
				return;
			}

			toast({
				title: "Success",
				description: "Client updated successfully",
			});
			setIsEditDialogOpen(false);
			setSelectedClient(null);
			resetForm();
			fetchClients();
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to update client",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Handles deleting a client.
	 */
	const handleDelete = async (): Promise<void> => {
		if (!selectedClient) return;

		setIsSubmitting(true);
		try {
			const response = await api.clients({ id: selectedClient.id }).delete();

			if (response.error) {
				toast({
					title: "Error",
					description: "Failed to delete client",
					variant: "destructive",
				});
				return;
			}

			toast({
				title: "Success",
				description: "Client deleted successfully",
			});
			setIsDeleteDialogOpen(false);
			setSelectedClient(null);
			fetchClients();
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to delete client",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Opens the edit dialog with client data.
	 */
	const openEditDialog = (client: Client): void => {
		setSelectedClient(client);
		setFormData({
			name: client.name,
		});
		setIsEditDialogOpen(true);
	};

	/**
	 * Opens the delete confirmation dialog.
	 */
	const openDeleteDialog = (client: Client): void => {
		setSelectedClient(client);
		setIsDeleteDialogOpen(true);
	};

	/**
	 * Column definitions for the data table.
	 */
	const columns: Column<Client>[] = [
		{
			key: "name",
			header: "Name",
			cell: (client) => (
				<div className="flex items-center gap-2">
					<Building2 className="h-4 w-4 text-muted-foreground" />
					<span className="font-medium">{client.name}</span>
				</div>
			),
		},
		{
			key: "id",
			header: "ID",
			cell: (client) => (
				<span className="font-mono text-xs text-muted-foreground">
					{client.id.slice(0, 8)}...
				</span>
			),
		},
		{
			key: "createdAt",
			header: "Created",
			cell: (client) => format(new Date(client.createdAt), "MMM d, yyyy"),
		},
		{
			key: "updatedAt",
			header: "Updated",
			cell: (client) => format(new Date(client.updatedAt), "MMM d, yyyy"),
		},
		{
			key: "actions",
			header: "Actions",
			cell: (client) => (
				<div className="flex gap-2">
					<Button
						variant="ghost"
						size="icon"
						onClick={(e) => {
							e.stopPropagation();
							openEditDialog(client);
						}}
					>
						<Pencil className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={(e) => {
							e.stopPropagation();
							openDeleteDialog(client);
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
			<Header title="Clients" />
			<div className="p-6 space-y-6">
				{/* Toolbar */}
				<div className="flex items-center justify-between gap-4">
					<div className="flex-1 max-w-sm">
						<Input
							placeholder="Search clients..."
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
						Add Client
					</Button>
				</div>

				{/* Data Table */}
				<DataTable
					columns={columns}
					data={clients}
					isLoading={isLoading}
					keyExtractor={(client) => client.id}
					emptyMessage="No clients found"
					page={page}
					totalPages={totalPages}
					onPageChange={setPage}
				/>
			</div>

			{/* Create Dialog */}
			<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add Client</DialogTitle>
						<DialogDescription>
							Create a new client organization in the system.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="name">Client Name *</Label>
							<Input
								id="name"
								value={formData.name}
								onChange={(e) =>
									setFormData({ ...formData, name: e.target.value })
								}
								placeholder="Acme Corporation"
							/>
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
						<Button onClick={handleCreate} disabled={isSubmitting || !formData.name}>
							{isSubmitting ? "Creating..." : "Create Client"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Edit Dialog */}
			<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Client</DialogTitle>
						<DialogDescription>Update the client information below.</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="edit-name">Client Name *</Label>
							<Input
								id="edit-name"
								value={formData.name}
								onChange={(e) =>
									setFormData({ ...formData, name: e.target.value })
								}
							/>
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
						<Button onClick={handleUpdate} disabled={isSubmitting || !formData.name}>
							{isSubmitting ? "Saving..." : "Save Changes"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Client</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete client{" "}
							<strong>{selectedClient?.name}</strong>? This action will also delete
							all associated locations and cannot be undone.
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
