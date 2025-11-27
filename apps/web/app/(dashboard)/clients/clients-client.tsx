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
import { fetchClientsList, type Client } from '@/lib/client-functions';
import { createClient, updateClient, deleteClient } from '@/actions/clients';

/**
 * Form values for creating/editing clients.
 */
interface ClientFormValues {
	/** Client name */
	name: string;
}

/**
 * Clients page client component.
 * Provides CRUD operations for client management using TanStack Query.
 *
 * @returns The clients page JSX element
 */
export function ClientsPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState<string>('');
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [editingClient, setEditingClient] = useState<Client | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

	// Build query params - only include search if it has a value
	const queryParams = search
		? { search, limit: 100, offset: 0 }
		: { limit: 100, offset: 0 };

	// Query for clients list
	const { data, isFetching } = useQuery({
		queryKey: queryKeys.clients.list(queryParams),
		queryFn: () => fetchClientsList(queryParams),
	});

	const clients = data?.data ?? [];

	// Create mutation
	const createMutation = useMutation({
		mutationKey: mutationKeys.clients.create,
		mutationFn: createClient,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Client created successfully');
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
			} else {
				toast.error(result.error ?? 'Failed to create client');
			}
		},
		onError: () => {
			toast.error('Failed to create client');
		},
	});

	// Update mutation
	const updateMutation = useMutation({
		mutationKey: mutationKeys.clients.update,
		mutationFn: updateClient,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Client updated successfully');
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
			} else {
				toast.error(result.error ?? 'Failed to update client');
			}
		},
		onError: () => {
			toast.error('Failed to update client');
		},
	});

	// Delete mutation
	const deleteMutation = useMutation({
		mutationKey: mutationKeys.clients.delete,
		mutationFn: deleteClient,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Client deleted successfully');
				setDeleteConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
			} else {
				toast.error(result.error ?? 'Failed to delete client');
			}
		},
		onError: () => {
			toast.error('Failed to delete client');
		},
	});

	const isSubmitting = createMutation.isPending || updateMutation.isPending;

	// TanStack Form instance (defined after mutations to avoid TDZ)
	const form = useForm({
		defaultValues: {
			name: '',
		},
		onSubmit: async ({ value }: { value: ClientFormValues }) => {
			if (editingClient) {
				updateMutation.mutate({
					id: editingClient.id,
					name: value.name,
				});
			} else {
				createMutation.mutate({
					name: value.name,
				});
			}
		},
	});

	/**
	 * Opens the dialog for creating a new client.
	 */
	const handleCreateNew = useCallback((): void => {
		setEditingClient(null);
		form.reset();
		setIsDialogOpen(true);
	}, [form]);

	/**
	 * Opens the dialog for editing an existing client.
	 *
	 * @param client - The client to edit
	 */
	const handleEdit = useCallback(
		(client: Client): void => {
			setEditingClient(client);
			form.setFieldValue('name', client.name);
			setIsDialogOpen(true);
		},
		[form],
	);

	/**
	 * Handles form submission for creating or updating a client.
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
				setEditingClient(null);
				form.reset();
			}
		},
		[form],
	);

	/**
	 * Handles client deletion.
	 *
	 * @param id - The client ID to delete
	 */
	const handleDelete = (id: string): void => {
		deleteMutation.mutate(id);
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
		<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
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
						{isFetching ? (
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
