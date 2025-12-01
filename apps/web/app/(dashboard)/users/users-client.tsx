'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ShieldCheck, UserPlus } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { useAppForm } from '@/lib/forms';
import { useOrgContext } from '@/lib/org-client-context';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import {
	fetchOrganizationMembers,
	type OrganizationMember,
} from '@/lib/client-functions';
import {
	createOrganizationUser,
	type CreateOrganizationUserInput,
} from '@/actions/users';

type CreateUserFormValues = Omit<CreateOrganizationUserInput, 'organizationId'>;

const initialFormValues: CreateUserFormValues = {
	name: '',
	email: '',
	username: '',
	password: '',
	role: 'member',
};

const roleBadgeVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
	owner: 'default',
	admin: 'secondary',
	member: 'outline',
};

function getInitials(name: string): string {
	const parts = name.split(' ').filter(Boolean);
	if (parts.length >= 2) {
		return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
	}
	return name.substring(0, 2).toUpperCase();
}

export function UsersPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId, organizationName } = useOrgContext();
	const [search, setSearch] = useState('');
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	const { data, isFetching } = useQuery({
		queryKey: queryKeys.organizationMembers.list({
			organizationId,
			limit: 100,
			offset: 0,
		}),
		queryFn: () =>
			fetchOrganizationMembers({
				organizationId,
				limit: 100,
				offset: 0,
			}),
		enabled: Boolean(organizationId),
	});

	const members = useMemo(() => data?.members ?? [], [data?.members]);
	const filteredMembers = useMemo(
		() =>
			search
				? members.filter((member) => {
						const haystack = `${member.user.name ?? ''} ${member.user.email ?? ''}`.toLowerCase();
						return haystack.includes(search.toLowerCase());
					})
				: members,
		[members, search],
	);

	const form = useAppForm({
		defaultValues: initialFormValues,
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				toast.error('Select an organization before creating users.');
				return;
			}

			await createUserMutation.mutateAsync({
				...value,
				organizationId,
			});
		},
	});

	const createUserMutation = useMutation({
		mutationKey: mutationKeys.organizationMembers.create,
		mutationFn: createOrganizationUser,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('User created and added to the organization');
				setIsDialogOpen(false);
				form.reset();
				queryClient.invalidateQueries({ queryKey: queryKeys.organizationMembers.all });
			} else {
				toast.error(result.error ?? 'Failed to create user');
			}
		},
		onError: () => {
			toast.error('Failed to create user');
		},
	});

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Members</h1>
					<p className="text-muted-foreground">
						Manage members for {organizationName ?? 'your organization'}
					</p>
				</div>
				<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
					<DialogTrigger asChild>
						<Button disabled={!organizationId}>
							<UserPlus className="mr-2 h-4 w-4" />
							Create User
						</Button>
					</DialogTrigger>
					<DialogContent>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								e.stopPropagation();
								form.handleSubmit();
							}}
						>
							<DialogHeader>
								<DialogTitle>Create User</DialogTitle>
								<DialogDescription>
									Create a user and assign their role within this organization.
								</DialogDescription>
							</DialogHeader>
							<form.AppForm>
								<div className="mt-6 space-y-6">
									<form.AppField name="name">
										{(field) => (
											<field.TextField
												label="Full name"
												placeholder="Jane Doe"
												orientation="vertical"
											/>
										)}
									</form.AppField>
									<form.AppField
										name="email"
										validators={{
											onChange: ({ value }) =>
												value.includes('@') ? undefined : 'Valid email is required',
										}}
									>
										{(field) => (
											<field.TextField
												label="Email"
												placeholder="user@example.com"
												orientation="vertical"
											/>
										)}
									</form.AppField>
									<form.AppField name="username">
										{(field) => (
											<field.TextField
												label="Username"
												placeholder="username"
												orientation="vertical"
											/>
										)}
									</form.AppField>
									<form.AppField name="password">
										{(field) => (
											<field.TextField
												label="Temporary password"
												type="password"
												placeholder="At least 8 characters"
												orientation="vertical"
											/>
										)}
									</form.AppField>
									<form.AppField name="role">
										{(field) => (
											<field.SelectField
												label="Role"
												placeholder="Select role"
												options={[
													{ value: 'admin', label: 'Admin' },
													{ value: 'member', label: 'Member' },
												]}
											/>
										)}
									</form.AppField>
								</div>
								<DialogFooter className="mt-4">
									<Button
										variant="outline"
										type="button"
										onClick={() => setIsDialogOpen(false)}
									>
										Cancel
									</Button>
									<form.SubmitButton
										label="Create user"
										loadingLabel="Creating..."
									/>
								</DialogFooter>
							</form.AppForm>
						</form>
					</DialogContent>
				</Dialog>
			</div>

			<div className="flex items-center gap-4">
				<div className="relative flex-1 max-w-sm">
					<Input
						placeholder="Search members..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-3"
						disabled={isFetching}
					/>
				</div>
				<Badge variant="outline">
					{data?.total ?? 0} {data?.total === 1 ? 'member' : 'members'}
				</Badge>
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Member</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Joined</TableHead>
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
						) : filteredMembers.length === 0 ? (
							<TableRow>
								<TableCell colSpan={4} className="h-24 text-center">
									No members found.
								</TableCell>
							</TableRow>
						) : (
							filteredMembers.map((member: OrganizationMember) => (
								<TableRow key={member.id}>
									<TableCell>
										<div className="flex items-center gap-3">
											<Avatar className="h-8 w-8">
												<AvatarImage src={member.user.image ?? undefined} />
												<AvatarFallback className="text-xs">
													{getInitials(member.user.name || member.user.email)}
												</AvatarFallback>
											</Avatar>
											<span className="font-medium">
												{member.user.name || member.user.email}
											</span>
										</div>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{member.user.email}
									</TableCell>
									<TableCell>
										<Badge variant={roleBadgeVariant[member.role] ?? 'outline'}>
											<ShieldCheck className="mr-1 h-3 w-3" />
											{member.role.charAt(0).toUpperCase() + member.role.slice(1)}
										</Badge>
									</TableCell>
									<TableCell>
										{format(new Date(member.createdAt), 'MMM d, yyyy')}
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
