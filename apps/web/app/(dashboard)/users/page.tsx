'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { authClient } from '@/lib/auth-client';
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

/**
 * User record interface from better-auth admin plugin.
 */
interface User {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image: string | null;
	role: string;
	banned: boolean;
	createdAt: Date;
}

/**
 * Users management page component (Admin only).
 * Provides user listing and role management via better-auth admin plugin.
 *
 * @returns The users page JSX element
 */
export default function UsersPage(): React.ReactElement {
	const [users, setUsers] = useState<User[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [search, setSearch] = useState<string>('');
	const [selectedUser, setSelectedUser] = useState<User | null>(null);
	const [roleDialogOpen, setRoleDialogOpen] = useState<boolean>(false);
	const [banDialogOpen, setBanDialogOpen] = useState<boolean>(false);
	const [selectedRole, setSelectedRole] = useState<'user' | 'admin'>('user');

	/**
	 * Fetches users from better-auth admin API.
	 * Note: We fetch all users without server-side filtering because the API
	 * only supports searching by a single field (email or name), but the UI
	 * needs to search by both. Client-side filtering handles this instead.
	 */
	const fetchUsers = useCallback(async (): Promise<void> => {
		try {
			const response = await authClient.admin.listUsers({
				query: {
					limit: 100,
					offset: 0,
				},
			});
			if (response.data?.users) {
				setUsers(response.data.users as User[]);
			}
		} catch (error) {
			console.error('Failed to fetch users:', error);
			toast.error('Failed to load users');
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchUsers();
	}, [fetchUsers]);

	/**
	 * Opens role change dialog for a user.
	 *
	 * @param user - The user to change role for
	 */
	const handleRoleClick = (user: User): void => {
		setSelectedUser(user);
		setSelectedRole((user.role as 'user' | 'admin') ?? 'user');
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
	const handleRoleChange = async (): Promise<void> => {
		if (!selectedUser) return;

		try {
			const response = await authClient.admin.setRole({
				userId: selectedUser.id,
				role: selectedRole,
			});

			if (response.error) {
				throw new Error('Failed to update role');
			}

			toast.success('User role updated successfully');
			setRoleDialogOpen(false);
			fetchUsers();
		} catch (error) {
			console.error('Failed to update role:', error);
			toast.error('Failed to update role');
		}
	};

	/**
	 * Handles ban/unban action.
	 */
	const handleBanToggle = async (): Promise<void> => {
		if (!selectedUser) return;

		try {
			if (selectedUser.banned) {
				const response = await authClient.admin.unbanUser({
					userId: selectedUser.id,
				});
				if (response.error) throw new Error('Failed to unban user');
				toast.success('User unbanned successfully');
			} else {
				const response = await authClient.admin.banUser({
					userId: selectedUser.id,
				});
				if (response.error) throw new Error('Failed to ban user');
				toast.success('User banned successfully');
			}

			setBanDialogOpen(false);
			fetchUsers();
		} catch (error) {
			console.error('Failed to toggle ban:', error);
			toast.error(selectedUser.banned ? 'Failed to unban user' : 'Failed to ban user');
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
		(user) =>
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
						{isLoading ? (
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
							filteredUsers.map((user) => (
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
						<Select value={selectedRole} onValueChange={(value: 'user' | 'admin') => setSelectedRole(value)}>
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
						<Button onClick={handleRoleChange}>Save</Button>
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
						>
							{selectedUser?.banned ? 'Unban' : 'Ban'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

