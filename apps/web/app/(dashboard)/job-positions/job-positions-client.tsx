'use client';

import React, { useState, useCallback } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchJobPositionsList, fetchClientsList, type JobPosition } from '@/lib/client-functions';
import { createJobPosition, updateJobPosition, deleteJobPosition } from '@/actions/job-positions';
import { useAppForm, TextField, TextareaField, SubmitButton } from '@/lib/forms';

/**
 * Form values interface for job position create/edit form.
 */
interface JobPositionFormValues {
	/** Job position name */
	name: string;
	/** Job position description */
	description: string;
}

/**
 * Initial form values for creating a new job position.
 */
const initialFormValues: JobPositionFormValues = {
	name: '',
	description: '',
};

/**
 * Job Positions page client component.
 * Provides CRUD operations for job position management using TanStack Query and TanStack Form.
 *
 * @returns The job positions page JSX element
 */
export function JobPositionsPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState<string>('');
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [editingJobPosition, setEditingJobPosition] = useState<JobPosition | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

	// Build query params - only include search if it has a value
	const queryParams = search
		? { search, limit: 100, offset: 0 }
		: { limit: 100, offset: 0 };

	// Query for job positions list
	const { data, isFetching } = useQuery({
		queryKey: queryKeys.jobPositions.list(queryParams),
		queryFn: () => fetchJobPositionsList(queryParams),
	});

	// Query for clients list to get the active client ID
	// In a production app, this would come from auth context
	const { data: clientsData } = useQuery({
		queryKey: queryKeys.clients.list({ limit: 1, offset: 0 }),
		queryFn: () => fetchClientsList({ limit: 1, offset: 0 }),
	});

	// Get the first available client ID for implicit client association
	const activeClientId = clientsData?.data?.[0]?.id ?? '';

	const jobPositions = data?.data ?? [];

	// Create mutation
	const createMutation = useMutation({
		mutationKey: mutationKeys.jobPositions.create,
		mutationFn: createJobPosition,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Job position created successfully');
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.jobPositions.all });
			} else {
				toast.error(result.error ?? 'Failed to create job position');
			}
		},
		onError: () => {
			toast.error('Failed to create job position');
		},
	});

	// Update mutation
	const updateMutation = useMutation({
		mutationKey: mutationKeys.jobPositions.update,
		mutationFn: updateJobPosition,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Job position updated successfully');
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.jobPositions.all });
			} else {
				toast.error(result.error ?? 'Failed to update job position');
			}
		},
		onError: () => {
			toast.error('Failed to update job position');
		},
	});

	// Delete mutation
	const deleteMutation = useMutation({
		mutationKey: mutationKeys.jobPositions.delete,
		mutationFn: deleteJobPosition,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Job position deleted successfully');
				setDeleteConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.jobPositions.all });
			} else {
				toast.error(result.error ?? 'Failed to delete job position');
			}
		},
		onError: () => {
			toast.error('Failed to delete job position');
		},
	});

// TanStack Form instance
const form = useAppForm({
	defaultValues: editingJobPosition
		? {
				name: editingJobPosition.name,
				description: editingJobPosition.description ?? '',
			}
		: initialFormValues,
	onSubmit: async ({ value }) => {
		if (editingJobPosition) {
			await updateMutation.mutateAsync({
				id: editingJobPosition.id,
				name: value.name,
				description: value.description || undefined,
			});
		} else {
			// Use the active client ID (first available client)
			// In production, this would come from auth context
			if (!activeClientId) {
				toast.error('No client available. Please create a client first.');
				return;
			}
			await createMutation.mutateAsync({
				name: value.name,
				description: value.description || undefined,
				clientId: activeClientId,
			});
		}
		setIsDialogOpen(false);
		setEditingJobPosition(null);
		form.reset();
	},
});

	/**
	 * Opens the dialog for creating a new job position.
	 */
	const handleCreateNew = useCallback((): void => {
		setEditingJobPosition(null);
		form.reset();
		setIsDialogOpen(true);
	}, [form]);

	/**
	 * Opens the dialog for editing an existing job position.
	 *
	 * @param jobPosition - The job position to edit
	 */
	const handleEdit = useCallback((jobPosition: JobPosition): void => {
		setEditingJobPosition(jobPosition);
		form.setFieldValue('name', jobPosition.name);
		form.setFieldValue('description', jobPosition.description ?? '');
		setIsDialogOpen(true);
	}, [form]);

	/**
	 * Handles job position deletion.
	 *
	 * @param id - The job position ID to delete
	 */
	const handleDelete = useCallback((id: string): void => {
		deleteMutation.mutate(id);
	}, [deleteMutation]);

	/**
	 * Handles dialog close and resets form state.
	 *
	 * @param open - Whether the dialog should be open
	 */
	const handleDialogOpenChange = useCallback((open: boolean): void => {
		setIsDialogOpen(open);
		if (!open) {
			setEditingJobPosition(null);
			form.reset();
		}
	}, [form]);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Job Positions</h1>
					<p className="text-muted-foreground">
						Manage employee job positions and roles
					</p>
				</div>
				<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
					<DialogTrigger asChild>
						<Button onClick={handleCreateNew}>
							<Plus className="mr-2 h-4 w-4" />
							Add Job Position
						</Button>
					</DialogTrigger>
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
									{editingJobPosition ? 'Edit Job Position' : 'Add Job Position'}
								</DialogTitle>
								<DialogDescription>
									{editingJobPosition
										? 'Update the job position details below.'
										: 'Fill in the details to create a new job position.'}
								</DialogDescription>
							</DialogHeader>
					<div className="grid gap-4 py-4">
						<form.Field
							name="name"
							validators={{
								onChange: ({ value }) =>
									!value.trim() ? 'Name is required' : undefined,
							}}
						>
							{() => <TextField label="Name" placeholder="e.g., Software Engineer" />}
						</form.Field>
						<form.Field name="description">
							{() => (
								<TextareaField
									label="Description"
									placeholder="Optional description of the job position"
									rows={3}
								/>
							)}
						</form.Field>
					</div>
					<DialogFooter>
						<SubmitButton label="Save" loadingLabel="Saving..." />
					</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			</div>

			<div className="flex items-center gap-4">
				<div className="relative flex-1 max-w-sm">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search job positions..."
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
							<TableHead>Description</TableHead>
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
						) : jobPositions.length === 0 ? (
							<TableRow>
								<TableCell colSpan={4} className="h-24 text-center">
									No job positions found.
								</TableCell>
							</TableRow>
						) : (
							jobPositions.map((jobPosition) => (
								<TableRow key={jobPosition.id}>
									<TableCell className="font-medium">{jobPosition.name}</TableCell>
									<TableCell className="max-w-xs truncate">
										{jobPosition.description ?? '-'}
									</TableCell>
									<TableCell>
										{format(new Date(jobPosition.createdAt), 'MMM d, yyyy')}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Button
												variant="ghost"
												size="icon"
												onClick={() => handleEdit(jobPosition)}
											>
												<Pencil className="h-4 w-4" />
											</Button>
											<Dialog
												open={deleteConfirmId === jobPosition.id}
												onOpenChange={(open) =>
													setDeleteConfirmId(open ? jobPosition.id : null)
												}
											>
												<DialogTrigger asChild>
													<Button variant="ghost" size="icon">
														<Trash2 className="h-4 w-4 text-destructive" />
													</Button>
												</DialogTrigger>
												<DialogContent>
													<DialogHeader>
														<DialogTitle>Delete Job Position</DialogTitle>
														<DialogDescription>
															Are you sure you want to delete &quot;{jobPosition.name}&quot;?
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
															onClick={() => handleDelete(jobPosition.id)}
															disabled={deleteMutation.isPending}
														>
															{deleteMutation.isPending ? (
																<>
																	<Loader2 className="mr-2 h-4 w-4 animate-spin" />
																	Deleting...
																</>
															) : (
																'Delete'
															)}
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
