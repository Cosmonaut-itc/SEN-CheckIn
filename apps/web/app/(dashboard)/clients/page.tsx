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
 * Client record interface.
 */
interface Client {
	id: string;
	name: string;
	apiKeyId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Form data interface for creating/editing clients.
 */
interface ClientFormData {
	name: string;
}

/**
 * Initial empty form data.
 */
const initialFormData: ClientFormData = {
	name: '',
};

/**
 * Clients list page component.
 * Provides CRUD operations for client management.
 *
 * @returns The clients page JSX element
 */
export default function ClientsPage(): React.ReactElement {
	const [clients, setClients] = useState<Client[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [search, setSearch] = useState<string>('');
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
	const [editingClient, setEditingClient] = useState<Client | null>(null);
	const [formData, setFormData] = useState<ClientFormData>(initialFormData);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

	/**
	 * Fetches clients from the API.
	 */
	const fetchClients = useCallback(async (): Promise<void> => {
		setIsLoading(true);
		try {
			const response = await api.clients.get({
				$query: { limit: 100, offset: 0, search: search || undefined },
			});
			if (response.data?.data) {
				setClients(response.data.data as Client[]);
			}
		} catch (error) {
			console.error('Failed to fetch clients:', error);
			toast.error('Failed to load clients');
		} finally {
			setIsLoading(false);
		}
	}, [search]);

	useEffect(() => {
		fetchClients();
	}, [fetchClients]);

	/**
	 * Opens the dialog for creating a new client.
	 */
	const handleCreateNew = (): void => {
		setEditingClient(null);
		setFormData(initialFormData);
		setIsDialogOpen(true);
	};

	/**
	 * Opens the dialog for editing an existing client.
	 *
	 * @param client - The client to edit
	 */
	const handleEdit = (client: Client): void => {
		setEditingClient(client);
		setFormData({
			name: client.name,
		});
		setIsDialogOpen(true);
	};

	/**
	 * Handles form submission for creating or updating a client.
	 *
	 * @param e - The form submission event
	 */
	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
		e.preventDefault();
		setIsSubmitting(true);

		try {
			if (editingClient) {
				// Update existing client
				const response = await api.clients[editingClient.id].put({
					name: formData.name,
				});

				if (response.error) {
					throw new Error('Failed to update client');
				}

				toast.success('Client updated successfully');
			} else {
				// Create new client
				const response = await api.clients.post({
					name: formData.name,
				});

				if (response.error) {
					throw new Error('Failed to create client');
				}

				toast.success('Client created successfully');
			}

			setIsDialogOpen(false);
			fetchClients();
		} catch (error) {
			console.error('Failed to save client:', error);
			toast.error(editingClient ? 'Failed to update client' : 'Failed to create client');
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Handles client deletion.
	 *
	 * @param id - The client ID to delete
	 */
	const handleDelete = async (id: string): Promise<void> => {
		try {
			const response = await api.clients[id].delete();

			if (response.error) {
				throw new Error('Failed to delete client');
			}

			toast.success('Client deleted successfully');
			setDeleteConfirmId(null);
			fetchClients();
		} catch (error) {
			console.error('Failed to delete client:', error);
			toast.error('Failed to delete client');
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Clients</h1>
					<p className="text-muted-foreground">
						Manage client organizations
					</p>
				</div>
				<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
					<DialogTrigger asChild>
						<Button onClick={handleCreateNew}>
							<Plus className="mr-2 h-4 w-4" />
							Add Client
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[425px]">
						<form onSubmit={handleSubmit}>
							<DialogHeader>
								<DialogTitle>
									{editingClient ? 'Edit Client' : 'Add Client'}
								</DialogTitle>
								<DialogDescription>
									{editingClient
										? 'Update the client details below.'
										: 'Fill in the details to create a new client.'}
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
						placeholder="Search clients..."
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
							<TableHead>Name</TableHead>
							<TableHead>API Key</TableHead>
							<TableHead>Created</TableHead>
							<TableHead className="w-[100px]">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							Array.from({ length: 5 }).map((_, i) => (
								<TableRow key={i}>
									{Array.from({ length: 4 }).map((_, j) => (
										<TableCell key={j}>
											<Skeleton className="h-4 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : clients.length === 0 ? (
							<TableRow>
								<TableCell colSpan={4} className="h-24 text-center">
									No clients found.
								</TableCell>
							</TableRow>
						) : (
							clients.map((client) => (
								<TableRow key={client.id}>
									<TableCell className="font-medium">{client.name}</TableCell>
									<TableCell>
										{client.apiKeyId ? (
											<span className="font-mono text-xs">
												{client.apiKeyId.substring(0, 8)}...
											</span>
										) : (
											'-'
										)}
									</TableCell>
									<TableCell>
										{format(new Date(client.createdAt), 'MMM d, yyyy')}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Button
												variant="ghost"
												size="icon"
												onClick={() => handleEdit(client)}
											>
												<Pencil className="h-4 w-4" />
											</Button>
											<Dialog
												open={deleteConfirmId === client.id}
												onOpenChange={(open) =>
													setDeleteConfirmId(open ? client.id : null)
												}
											>
												<DialogTrigger asChild>
													<Button variant="ghost" size="icon">
														<Trash2 className="h-4 w-4 text-destructive" />
													</Button>
												</DialogTrigger>
												<DialogContent>
													<DialogHeader>
														<DialogTitle>Delete Client</DialogTitle>
														<DialogDescription>
															Are you sure you want to delete {client.name}?
															This will also delete all associated locations and employees.
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
															onClick={() => handleDelete(client.id)}
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
