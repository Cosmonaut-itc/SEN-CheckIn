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
	DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Trash2, Copy, Key, Eye, EyeOff, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

/**
 * API Key record interface.
 */
interface ApiKey {
	id: string;
	name: string | null;
	start: string | null;
	prefix: string | null;
	key?: string;
	userId: string;
	enabled: boolean | null;
	expiresAt: Date | null;
	createdAt: Date;
	lastRequest: Date | null;
}

/**
 * Form data interface for creating API keys.
 */
interface ApiKeyFormData {
	name: string;
}

/**
 * API Keys management page component.
 * Provides CRUD operations for API key management via better-auth.
 *
 * @returns The API keys page JSX element
 */
export default function ApiKeysPage(): React.ReactElement {
	const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
	const [formData, setFormData] = useState<ApiKeyFormData>({ name: '' });
	const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

	/**
	 * Fetches API keys from better-auth.
	 */
	const fetchApiKeys = useCallback(async (): Promise<void> => {
		try {
			const response = await authClient.apiKey.list();
			if (response.data) {
				setApiKeys(response.data as ApiKey[]);
			}
		} catch (error) {
			console.error('Failed to fetch API keys:', error);
			toast.error('Failed to load API keys');
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchApiKeys();
	}, [fetchApiKeys]);

	/**
	 * Opens the dialog for creating a new API key.
	 */
	const handleCreateNew = (): void => {
		setFormData({ name: '' });
		setNewKeyValue(null);
		setIsDialogOpen(true);
	};

	/**
	 * Handles form submission for creating an API key.
	 *
	 * @param e - The form submission event
	 */
	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
		e.preventDefault();
		setIsSubmitting(true);

		try {
			const response = await authClient.apiKey.create({
				name: formData.name || undefined,
			});

			if (response.error) {
				throw new Error('Failed to create API key');
			}

			if (response.data?.key) {
				setNewKeyValue(response.data.key);
				toast.success('API key created successfully');
				fetchApiKeys();
			}
		} catch (error) {
			console.error('Failed to create API key:', error);
			toast.error('Failed to create API key');
			setIsDialogOpen(false);
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Handles API key deletion.
	 *
	 * @param id - The API key ID to delete
	 */
	const handleDelete = async (id: string): Promise<void> => {
		try {
			const response = await authClient.apiKey.delete({ keyId: id });

			if (response.error) {
				throw new Error('Failed to delete API key');
			}

			toast.success('API key deleted successfully');
			setDeleteConfirmId(null);
			fetchApiKeys();
		} catch (error) {
			console.error('Failed to delete API key:', error);
			toast.error('Failed to delete API key');
		}
	};

	/**
	 * Copies text to clipboard.
	 *
	 * @param text - The text to copy
	 */
	const copyToClipboard = async (text: string): Promise<void> => {
		try {
			await navigator.clipboard.writeText(text);
			toast.success('Copied to clipboard');
		} catch {
			toast.error('Failed to copy to clipboard');
		}
	};

	/**
	 * Toggles visibility of an API key prefix.
	 *
	 * @param id - The API key ID
	 */
	const toggleKeyVisibility = (id: string): void => {
		setVisibleKeys((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(id)) {
				newSet.delete(id);
			} else {
				newSet.add(id);
			}
			return newSet;
		});
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
					<p className="text-muted-foreground">
						Manage API keys for authentication
					</p>
				</div>
				<Dialog open={isDialogOpen} onOpenChange={(open) => {
					setIsDialogOpen(open);
					if (!open) {
						setNewKeyValue(null);
					}
				}}>
					<DialogTrigger asChild>
						<Button onClick={handleCreateNew}>
							<Plus className="mr-2 h-4 w-4" />
							Create API Key
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[500px]">
						{newKeyValue ? (
							<>
								<DialogHeader>
									<DialogTitle>API Key Created</DialogTitle>
									<DialogDescription>
										Copy your API key now. You won&apos;t be able to see it again!
									</DialogDescription>
								</DialogHeader>
								<div className="py-4">
									<div className="flex items-center gap-2 rounded-md bg-muted p-3">
										<Key className="h-4 w-4 shrink-0 text-muted-foreground" />
										<code className="flex-1 break-all text-sm">{newKeyValue}</code>
										<Button
											variant="ghost"
											size="icon"
											onClick={() => copyToClipboard(newKeyValue)}
										>
											<Copy className="h-4 w-4" />
										</Button>
									</div>
								</div>
								<DialogFooter>
									<Button onClick={() => setIsDialogOpen(false)}>Done</Button>
								</DialogFooter>
							</>
						) : (
							<form onSubmit={handleSubmit}>
								<DialogHeader>
									<DialogTitle>Create API Key</DialogTitle>
									<DialogDescription>
										Create a new API key for accessing the API.
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
											placeholder="My API Key"
										/>
									</div>
								</div>
								<DialogFooter>
									<Button type="submit" disabled={isSubmitting}>
										{isSubmitting ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												Creating...
											</>
										) : (
											'Create Key'
										)}
									</Button>
								</DialogFooter>
							</form>
						)}
					</DialogContent>
				</Dialog>
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Key Preview</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Last Used</TableHead>
							<TableHead>Created</TableHead>
							<TableHead>Expires</TableHead>
							<TableHead className="w-[100px]">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							Array.from({ length: 3 }).map((_, i) => (
								<TableRow key={i}>
									{Array.from({ length: 7 }).map((_, j) => (
										<TableCell key={j}>
											<Skeleton className="h-4 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : apiKeys.length === 0 ? (
							<TableRow>
								<TableCell colSpan={7} className="h-24 text-center">
									No API keys found. Create one to get started.
								</TableCell>
							</TableRow>
						) : (
							apiKeys.map((apiKey) => (
								<TableRow key={apiKey.id}>
									<TableCell className="font-medium">
										{apiKey.name || 'Unnamed Key'}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<code className="text-xs">
												{visibleKeys.has(apiKey.id)
													? `${apiKey.prefix ?? ''}${apiKey.start ?? ''}...`
													: '••••••••••••'}
											</code>
											<Button
												variant="ghost"
												size="icon"
												className="h-6 w-6"
												onClick={() => toggleKeyVisibility(apiKey.id)}
											>
												{visibleKeys.has(apiKey.id) ? (
													<EyeOff className="h-3 w-3" />
												) : (
													<Eye className="h-3 w-3" />
												)}
											</Button>
										</div>
									</TableCell>
									<TableCell>
										<Badge variant={apiKey.enabled ? 'default' : 'secondary'}>
											{apiKey.enabled ? 'Active' : 'Disabled'}
										</Badge>
									</TableCell>
									<TableCell>
										{apiKey.lastRequest
											? format(new Date(apiKey.lastRequest), 'MMM d, yyyy HH:mm')
											: 'Never'}
									</TableCell>
									<TableCell>
										{format(new Date(apiKey.createdAt), 'MMM d, yyyy')}
									</TableCell>
									<TableCell>
										{apiKey.expiresAt
											? format(new Date(apiKey.expiresAt), 'MMM d, yyyy')
											: 'Never'}
									</TableCell>
									<TableCell>
										<Dialog
											open={deleteConfirmId === apiKey.id}
											onOpenChange={(open) =>
												setDeleteConfirmId(open ? apiKey.id : null)
											}
										>
											<DialogTrigger asChild>
												<Button variant="ghost" size="icon">
													<Trash2 className="h-4 w-4 text-destructive" />
												</Button>
											</DialogTrigger>
											<DialogContent>
												<DialogHeader>
													<DialogTitle>Delete API Key</DialogTitle>
													<DialogDescription>
														Are you sure you want to delete this API key?
														Any applications using it will lose access.
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
														onClick={() => handleDelete(apiKey.id)}
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

