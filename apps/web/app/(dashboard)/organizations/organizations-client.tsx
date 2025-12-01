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
import { Plus, Trash2, Search, Users, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchOrganizations, type Organization } from '@/lib/client-functions';
import {
	createOrganization,
	updateOrganization,
	deleteOrganization,
} from '@/actions/organizations';

/**
 * Form values for creating organizations.
 */
interface OrganizationFormValues {
	name: string;
	slug: string;
}

/**
 * Organizations page client component.
 * Provides organization management via better-auth organization plugin using TanStack Query.
 *
 * @returns The organizations page JSX element
 */
export function OrganizationsPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState<string>('');
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [editingOrganization, setEditingOrganization] = useState<Organization | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const NAME_LIMITS = { min: 3, max: 80 };
	const SLUG_LIMITS = { min: 3, max: 50 };

	// Query for organizations list
	const { data: organizations = [], isFetching } = useQuery({
		queryKey: queryKeys.organizations.list(),
		queryFn: fetchOrganizations,
	});

	// Create mutation
	const createMutation = useMutation({
		mutationKey: mutationKeys.organizations.create,
		mutationFn: createOrganization,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Organization created successfully');
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
			} else {
				toast.error(result.error ?? 'Failed to create organization');
			}
		},
		onError: () => {
			toast.error('Failed to create organization');
		},
	});

	// Update mutation
	const updateMutation = useMutation({
		mutationKey: mutationKeys.organizations.update,
		mutationFn: updateOrganization,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Organization updated successfully');
				setIsDialogOpen(false);
				setEditingOrganization(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
			} else {
				toast.error(result.error ?? 'Failed to update organization');
			}
		},
		onError: () => {
			toast.error('Failed to update organization');
		},
	});

	// Delete mutation
	const deleteMutation = useMutation({
		mutationKey: mutationKeys.organizations.delete,
		mutationFn: deleteOrganization,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Organization deleted successfully');
				setDeleteConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
			} else {
				toast.error(result.error ?? 'Failed to delete organization');
			}
		},
		onError: () => {
			toast.error('Failed to delete organization');
		},
	});

	// TanStack Form instance (after mutations to avoid TDZ)
	const initialFormValues: OrganizationFormValues = {
		name: '',
		slug: '',
	};

	const form = useAppForm({
		defaultValues: editingOrganization
			? {
					name: editingOrganization.name,
					slug: editingOrganization.slug,
				}
			: initialFormValues,
		onSubmit: async ({ value }: { value: OrganizationFormValues }) => {
			const name = value.name.trim();
			const slug = value.slug.trim();

			if (editingOrganization) {
				await updateMutation.mutateAsync({
					organizationId: editingOrganization.id,
					name,
					slug,
				});
			} else {
				await createMutation.mutateAsync({
					name,
					slug,
				});
			}
			setIsDialogOpen(false);
			setEditingOrganization(null);
			form.reset();
		},
	});

	/**
	 * Opens the dialog for creating a new organization.
	 */
	const handleCreateNew = useCallback((): void => {
		setEditingOrganization(null);
		form.reset();
		setIsDialogOpen(true);
	}, [form]);

	/**
	 * Opens the dialog for editing an existing organization.
	 *
	 * @param org - The organization to edit
	 */
	const handleEdit = useCallback(
		(org: Organization): void => {
			setEditingOrganization(org);
			form.setFieldValue('name', org.name);
			form.setFieldValue('slug', org.slug);
			setIsDialogOpen(true);
		},
		[form],
	);

	/**
	 * Generates a slug from the organization name.
	 *
	 * @param name - The organization name
	 * @returns The generated slug
	 */
	const generateSlug = (name: string): string => {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	};

	const validateName = (value: string): string | undefined => {
		const trimmed = value.trim();
		if (!trimmed) return 'Name is required';
		if (trimmed.length < NAME_LIMITS.min) {
			return `Name must be at least ${NAME_LIMITS.min} characters`;
		}
		if (trimmed.length > NAME_LIMITS.max) {
			return `Name must be at most ${NAME_LIMITS.max} characters`;
		}
		return undefined;
	};

	const validateSlug = (value: string): string | undefined => {
		const trimmed = value.trim();
		if (!trimmed) return 'Slug is required';
		if (trimmed.length < SLUG_LIMITS.min) {
			return `Slug must be at least ${SLUG_LIMITS.min} characters`;
		}
		if (trimmed.length > SLUG_LIMITS.max) {
			return `Slug must be at most ${SLUG_LIMITS.max} characters`;
		}
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
			return 'Use lowercase letters, numbers, and hyphens only';
		}
		return undefined;
	};


	const handleDialogOpenChange = useCallback(
		(open: boolean): void => {
			setIsDialogOpen(open);
			if (!open) {
				setEditingOrganization(null);
				form.reset();
				setDeleteConfirmId(null);
			}
		},
		[form],
	);

	/**
	 * Handles organization deletion.
	 *
	 * @param id - The organization ID to delete
	 */
	const handleDelete = (id: string): void => {
		deleteMutation.mutate(id);
	};

	/**
	 * Filters organizations by search term.
	 */
	const filteredOrganizations = organizations.filter(
		(org: Organization) =>
			org.name.toLowerCase().includes(search.toLowerCase()) ||
			org.slug.toLowerCase().includes(search.toLowerCase())
	);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
					<p className="text-muted-foreground">
						Manage organizations and their members
					</p>
				</div>
				<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
					<DialogTrigger asChild>
						<Button onClick={handleCreateNew}>
							<Plus className="mr-2 h-4 w-4" />
							Create Organization
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
									{editingOrganization ? 'Edit Organization' : 'Create Organization'}
								</DialogTitle>
								<DialogDescription>
									{editingOrganization
										? 'Update the organization details below.'
										: 'Create a new organization to manage users and resources.'}
								</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4 py-4">
								<form.AppField
									name="name"
									validators={{
										onChange: ({ value }) => validateName(value),
									}}
								>
									{(field) => (
										<field.TextField
											label="Name"
											description={`Between ${NAME_LIMITS.min}-${NAME_LIMITS.max} characters.`}
											onValueChange={(val) => {
												if (!editingOrganization) {
													form.setFieldValue('slug', generateSlug(val));
												}
												return val;
											}}
										/>
									)}
								</form.AppField>
								<form.AppField
									name="slug"
									validators={{
										onChange: ({ value }) => validateSlug(value),
									}}
								>
									{(field) => (
										<field.TextField
											label="Slug"
											description={`Lowercase, ${SLUG_LIMITS.min}-${SLUG_LIMITS.max} characters; letters, numbers, and hyphens only.`}
											onValueChange={(val) => generateSlug(val)}
										/>
									)}
								</form.AppField>
							</div>
							<DialogFooter>
								<form.AppForm>
									<form.SubmitButton
										label={editingOrganization ? 'Save' : 'Create'}
										loadingLabel={editingOrganization ? 'Saving...' : 'Creating...'}
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
						placeholder="Search organizations..."
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
							<TableHead>Slug</TableHead>
							<TableHead>Created</TableHead>
							<TableHead className="w-[100px]">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isFetching ? (
							Array.from({ length: 3 }).map((_, i) => (
								<TableRow key={i}>
									{Array.from({ length: 4 }).map((_, j) => (
										<TableCell key={j}>
											<Skeleton className="h-4 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : filteredOrganizations.length === 0 ? (
							<TableRow>
								<TableCell colSpan={4} className="h-24 text-center">
									<div className="flex flex-col items-center gap-2">
										<Users className="h-8 w-8 text-muted-foreground" />
										<p>No organizations found.</p>
									</div>
								</TableCell>
							</TableRow>
						) : (
							filteredOrganizations.map((org: Organization) => (
								<TableRow key={org.id}>
									<TableCell className="font-medium">{org.name}</TableCell>
									<TableCell>
										<code className="text-sm">{org.slug}</code>
									</TableCell>
									<TableCell>
										{format(new Date(org.createdAt), 'MMM d, yyyy')}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Button
												variant="ghost"
												size="icon"
												onClick={() => handleEdit(org)}
											>
												<Edit className="h-4 w-4" />
											</Button>
											<Dialog
												open={deleteConfirmId === org.id}
												onOpenChange={(open) =>
													setDeleteConfirmId(open ? org.id : null)
												}
											>
												<DialogTrigger asChild>
													<Button variant="ghost" size="icon">
														<Trash2 className="h-4 w-4 text-destructive" />
													</Button>
												</DialogTrigger>
												<DialogContent>
													<DialogHeader>
														<DialogTitle>Delete Organization</DialogTitle>
														<DialogDescription>
															Are you sure you want to delete {org.name}?
															This will remove all members and cannot be undone.
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
															onClick={() => handleDelete(org.id)}
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
