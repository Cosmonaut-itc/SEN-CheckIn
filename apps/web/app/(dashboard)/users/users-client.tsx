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
} from '@/components/ui/dialog';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Search, Shield, Ban, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchUsers, type User } from '@/lib/client-functions';
import { setUserRole, banUser, unbanUser, type UserRole } from '@/actions/users';

/**
 * Users page client component (Admin only).
 * Provides user listing and role management via better-auth admin plugin using TanStack Query.
 *
 * @returns The users page JSX element
 */
export function UsersPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState<string>('');
	const [selectedUser, setSelectedUser] = useState<User | null>(null);
	const [roleDialogOpen, setRoleDialogOpen] = useState<boolean>(false);
	const [banDialogOpen, setBanDialogOpen] = useState<boolean>(false);
	const [selectedRole, setSelectedRole] = useState<UserRole>('user');

	// Query for users list
	const { data: users = [], isFetching } = useQuery({
		queryKey: queryKeys.users.list({ limit: 100, offset: 0 }),
		queryFn: () => fetchUsers({ limit: 100, offset: 0 }),
	});

	// Set role mutation
	const setRoleMutation = useMutation({
		mutationKey: mutationKeys.users.setRole,
		mutationFn: setUserRole,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('User role updated successfully');
				setRoleDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
			} else {
				toast.error(result.error ?? 'Failed to update role');
			}
		},
		onError: () => {
			toast.error('Failed to update role');
		},
	});

	// Ban mutation
	const banMutation = useMutation({
		mutationKey: mutationKeys.users.ban,
		mutationFn: banUser,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('User banned successfully');
				setBanDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
			} else {
				toast.error(result.error ?? 'Failed to ban user');
			}
		},
		onError: () => {
			toast.error('Failed to ban user');
		},
	});

	// Unban mutation
	const unbanMutation = useMutation({
		mutationKey: mutationKeys.users.unban,
		mutationFn: unbanUser,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('User unbanned successfully');
				setBanDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
			} else {
				toast.error(result.error ?? 'Failed to unban user');
			}
		},
		onError: () => {
			toast.error('Failed to unban user');
		},
	});

	/**
	 * Opens role change dialog for a user.
	 *
	 * @param user - The user to change role for
	 */
	const handleRoleClick = (user: User): void => {
		setSelectedUser(user);
		setSelectedRole((user.role as UserRole) ?? 'user');
		setRoleDialogOpen(true);
	};

	/**
	 * Opens ban/unban dialog for a user.
	 *
	 * @param user - The user to ban/unban
	 */
	const handleBanClick = (user: User): void => {
		setSelectedUser(user);
		setBanDialogOpen(true);
	};

	/**
	 * Handles role change submission.
	 */
	const handleRoleChange = (): void => {
		if (!selectedUser) return;

		setRoleMutation.mutate({
			userId: selectedUser.id,
			role: selectedRole,
		});
	};

	/**
	 * Handles ban/unban action.
	 */
	const handleBanToggle = (): void => {
		if (!selectedUser) return;

		if (selectedUser.banned) {
			unbanMutation.mutate(selectedUser.id);
		} else {
			banMutation.mutate(selectedUser.id);
		}
	};

	/**
	 * Gets user initials from name for avatar fallback.
	 *
	 * @param name - User's full name
	 * @returns Two-letter initials
	 */
	const getInitials = (name: string): string => {
		const parts = name.split(' ');
		if (parts.length >= 2) {
			return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
		}
		return name.substring(0, 2).toUpperCase();
	};

	/**
	 * Filters users by search term (name or email).
	 * Client-side filtering allows searching by both fields simultaneously,
	 * which the server-side API doesn't support in a single query.
	 */
	const filteredUsers = users.filter(
		(user: User) =>
			search === '' ||
			user.name.toLowerCase().includes(search.toLowerCase()) ||
			user.email.toLowerCase().includes(search.toLowerCase())
	);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Users</h1>
				<p className="text-muted-foreground">
					Manage user accounts and permissions (Admin only)
				</p>
			</div>

			<div className="flex items-center gap-4">
				<div className="relative flex-1 max-w-sm">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search users..."
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
							<TableHead>User</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Verified</TableHead>
							<TableHead>Joined</TableHead>
							<TableHead className="w-[150px]">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isFetching ? (
							Array.from({ length: 5 }).map((_, i) => (
								<TableRow key={i}>
									{Array.from({ length: 7 }).map((_, j) => (
										<TableCell key={j}>
											<Skeleton className="h-4 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : filteredUsers.length === 0 ? (
							<TableRow>
								<TableCell colSpan={7} className="h-24 text-center">
									No users found.
								</TableCell>
							</TableRow>
						) : (
							filteredUsers.map((user: User) => (
								<TableRow key={user.id}>
									<TableCell>
										<div className="flex items-center gap-3">
											<Avatar className="h-8 w-8">
												<AvatarImage src={user.image ?? undefined} />
												<AvatarFallback className="text-xs">
													{getInitials(user.name)}
												</AvatarFallback>
											</Avatar>
											<span className="font-medium">{user.name}</span>
										</div>
									</TableCell>
									<TableCell>{user.email}</TableCell>
									<TableCell>
										<Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
											{user.role ?? 'user'}
										</Badge>
									</TableCell>
									<TableCell>
										<Badge variant={user.banned ? 'destructive' : 'outline'}>
											{user.banned ? 'Banned' : 'Active'}
										</Badge>
									</TableCell>
									<TableCell>
										{user.emailVerified ? (
											<UserCheck className="h-4 w-4 text-green-500" />
										) : (
											<span className="text-muted-foreground">-</span>
										)}
									</TableCell>
									<TableCell>
										{format(new Date(user.createdAt), 'MMM d, yyyy')}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Button
												variant="ghost"
												size="icon"
												onClick={() => handleRoleClick(user)}
												title="Change role"
											>
												<Shield className="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => handleBanClick(user)}
												title={user.banned ? 'Unban user' : 'Ban user'}
											>
												<Ban className={`h-4 w-4 ${user.banned ? 'text-destructive' : ''}`} />
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			{/* Role Change Dialog */}
			<Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Change User Role</DialogTitle>
						<DialogDescription>
							Update the role for {selectedUser?.name}
						</DialogDescription>
					</DialogHeader>
					<div className="py-4">
						<Select value={selectedRole} onValueChange={(value: UserRole) => setSelectedRole(value)}>
							<SelectTrigger>
								<SelectValue placeholder="Select role" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="user">User</SelectItem>
								<SelectItem value="admin">Admin</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
							Cancel
						</Button>
						<Button onClick={handleRoleChange} disabled={setRoleMutation.isPending}>
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Ban/Unban Dialog */}
			<Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{selectedUser?.banned ? 'Unban User' : 'Ban User'}
						</DialogTitle>
						<DialogDescription>
							{selectedUser?.banned
								? `Are you sure you want to unban ${selectedUser?.name}?`
								: `Are you sure you want to ban ${selectedUser?.name}? They will not be able to access the system.`}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setBanDialogOpen(false)}>
							Cancel
						</Button>
						<Button
							variant={selectedUser?.banned ? 'default' : 'destructive'}
							onClick={handleBanToggle}
							disabled={banMutation.isPending || unbanMutation.isPending}
						>
							{selectedUser?.banned ? 'Unban' : 'Ban'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

