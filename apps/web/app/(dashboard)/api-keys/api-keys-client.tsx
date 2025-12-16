'use client';

import React, { useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppForm } from '@/lib/forms';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Trash2, Copy, Key, Eye, EyeOff } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchApiKeys, type ApiKey } from '@/lib/client-functions';
import { createApiKey, deleteApiKey } from '@/actions/api-keys';

/**
 * Form values for creating API keys.
 */
interface ApiKeyFormValues {
	name: string;
}

/**
 * API Keys page client component.
 * Provides CRUD operations for API key management via better-auth using TanStack Query.
 *
 * @returns The API keys page JSX element
 */
export function ApiKeysPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const t = useTranslations('ApiKeys');
	const tCommon = useTranslations('Common');
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

	// Query for API keys list
	const { data: apiKeys = [], isFetching } = useQuery({
		queryKey: queryKeys.apiKeys.list(),
		queryFn: fetchApiKeys,
	});

	// Create mutation
	const createMutation = useMutation({
		mutationKey: mutationKeys.apiKeys.create,
		mutationFn: createApiKey,
		onSuccess: (result) => {
			if (result.success && result.data) {
				setNewKeyValue(result.data.key);
				toast.success(t('toast.createSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all });
			} else {
				toast.error(result.error ?? t('toast.createError'));
				setIsDialogOpen(false);
			}
		},
		onError: () => {
			toast.error(t('toast.createError'));
			setIsDialogOpen(false);
		},
	});

	// Delete mutation
	const deleteMutation = useMutation({
		mutationKey: mutationKeys.apiKeys.delete,
		mutationFn: deleteApiKey,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.deleteSuccess'));
				setDeleteConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all });
			} else {
				toast.error(result.error ?? t('toast.deleteError'));
			}
		},
		onError: () => {
			toast.error(t('toast.deleteError'));
		},
	});

	// TanStack Form instance (after mutations to avoid TDZ)
	const form = useAppForm({
		defaultValues: {
			name: '',
		},
		onSubmit: async ({ value }: { value: ApiKeyFormValues }) => {
			await createMutation.mutateAsync({
				name: value.name || undefined,
			});
			form.reset();
		},
	});

	/**
	 * Opens the dialog for creating a new API key.
	 */
	const handleCreateNew = useCallback((): void => {
		form.reset();
		setNewKeyValue(null);
		setIsDialogOpen(true);
	}, [form]);

	/**
	 * Handles form submission for creating an API key.
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

	/**
	 * Handles API key deletion.
	 *
	 * @param id - The API key ID to delete
	 */
	const handleDelete = (id: string): void => {
		deleteMutation.mutate(id);
	};

	/**
	 * Copies text to clipboard.
	 *
	 * @param text - The text to copy
	 */
	const copyToClipboard = async (text: string): Promise<void> => {
		try {
			await navigator.clipboard.writeText(text);
			toast.success(t('toast.copied'));
		} catch {
			toast.error(t('toast.copyFailed'));
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
					<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
					<p className="text-muted-foreground">{t('subtitle')}</p>
				</div>
				<Dialog
					open={isDialogOpen}
					onOpenChange={(open) => {
						setIsDialogOpen(open);
						if (!open) {
							setNewKeyValue(null);
							form.reset();
						}
					}}
				>
					<DialogTrigger asChild>
						<Button onClick={handleCreateNew}>
							<Plus className="mr-2 h-4 w-4" />
							{t('actions.create')}
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[500px]">
						{newKeyValue ? (
							<>
								<DialogHeader>
									<DialogTitle>{t('created.title')}</DialogTitle>
									<DialogDescription>
										{t('created.description')}
									</DialogDescription>
								</DialogHeader>
								<div className="py-4">
									<div className="flex items-center gap-2 rounded-md bg-muted p-3">
										<Key className="h-4 w-4 shrink-0 text-muted-foreground" />
										<code className="flex-1 break-all text-sm">
											{newKeyValue}
										</code>
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
									<Button onClick={() => setIsDialogOpen(false)}>
										{t('actions.done')}
									</Button>
								</DialogFooter>
							</>
						) : (
							<form onSubmit={handleSubmit}>
								<DialogHeader>
									<DialogTitle>{t('create.title')}</DialogTitle>
									<DialogDescription>{t('create.description')}</DialogDescription>
								</DialogHeader>
								<div className="grid gap-4 py-4">
									<form.AppField name="name">
										{(field) => (
											<field.TextField
												label={t('create.fields.name')}
												placeholder={t('create.placeholders.name')}
											/>
										)}
									</form.AppField>
								</div>
								<DialogFooter>
									<form.AppForm>
										<form.SubmitButton
											label={t('actions.createKey')}
											loadingLabel={t('actions.creating')}
										/>
									</form.AppForm>
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
							<TableHead>{t('table.headers.name')}</TableHead>
							<TableHead>{t('table.headers.keyPreview')}</TableHead>
							<TableHead>{t('table.headers.status')}</TableHead>
							<TableHead>{t('table.headers.lastUsed')}</TableHead>
							<TableHead>{t('table.headers.created')}</TableHead>
							<TableHead>{t('table.headers.expires')}</TableHead>
							<TableHead className="w-[100px]">
								{t('table.headers.actions')}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isFetching ? (
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
									{t('table.empty')}
								</TableCell>
							</TableRow>
						) : (
							apiKeys.map((apiKey: ApiKey) => (
								<TableRow key={apiKey.id}>
									<TableCell className="font-medium">
										{apiKey.name || t('unnamed')}
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
											{apiKey.enabled
												? t('status.active')
												: t('status.disabled')}
										</Badge>
									</TableCell>
									<TableCell>
										{apiKey.lastRequest
											? format(
													new Date(apiKey.lastRequest),
													t('dateTimeFormat'),
												)
											: t('never')}
									</TableCell>
									<TableCell>
										{format(new Date(apiKey.createdAt), t('dateFormat'))}
									</TableCell>
									<TableCell>
										{apiKey.expiresAt
											? format(new Date(apiKey.expiresAt), t('dateFormat'))
											: t('never')}
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
													<DialogTitle>
														{t('dialogs.delete.title')}
													</DialogTitle>
													<DialogDescription>
														{t('dialogs.delete.description')}
													</DialogDescription>
												</DialogHeader>
												<DialogFooter>
													<Button
														variant="outline"
														onClick={() => setDeleteConfirmId(null)}
													>
														{tCommon('cancel')}
													</Button>
													<Button
														variant="destructive"
														onClick={() => handleDelete(apiKey.id)}
													>
														{tCommon('delete')}
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
