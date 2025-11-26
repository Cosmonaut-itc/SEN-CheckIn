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
import { Plus, Trash2, Search, Loader2, Users } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchOrganizations, type Organization } from '@/lib/client-functions';
import { createOrganization, deleteOrganization } from '@/actions/organizations';

/**
 * Form data interface for creating organizations.
 */
interface OrganizationFormData {
	name: string;
	slug: string;
}

/**
 * Initial empty form data.
 */
const initialFormData: OrganizationFormData = {
	name: '',
	slug: '',
};

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
	const [formData, setFormData] = useState<OrganizationFormData>(initialFormData);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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

	/**
	 * Opens the dialog for creating a new organization.
	 */
	const handleCreateNew = (): void => {
		setFormData(initialFormData);
		setIsDialogOpen(true);
	};

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

	/**
	 * Handles name input change and auto-generates slug.
	 *
	 * @param name - The new name value
	 */
	const handleNameChange = (name: string): void => {
		setFormData({
			name,
			slug: generateSlug(name),
		});
	};

	/**
	 * Handles form submission for creating an organization.
	 *
	 * @param e - The form submission event
	 */
	const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
		e.preventDefault();
		createMutation.mutate({
			name: formData.name,
			slug: formData.slug,
		});
	};

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
				<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
					<DialogTrigger asChild>
						<Button onClick={handleCreateNew}>
							<Plus className="mr-2 h-4 w-4" />
							Create Organization
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[425px]">
						<form onSubmit={handleSubmit}>
							<DialogHeader>
								<DialogTitle>Create Organization</DialogTitle>
								<DialogDescription>
									Create a new organization to manage users and resources.
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
										onChange={(e) => handleNameChange(e.target.value)}
										className="col-span-3"
										required
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="slug" className="text-right">
										Slug
									</Label>
									<Input
										id="slug"
										value={formData.slug}
										onChange={(e) =>
											setFormData({ ...formData, slug: e.target.value })
										}
										className="col-span-3"
										required
									/>
								</div>
							</div>
							<DialogFooter>
								<Button type="submit" disabled={createMutation.isPending}>
									{createMutation.isPending ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Creating...
										</>
									) : (
										'Create'
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

