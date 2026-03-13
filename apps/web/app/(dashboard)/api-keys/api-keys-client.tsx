'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppForm } from '@/lib/forms';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
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
import { ResponsiveDataView } from '@/components/ui/responsive-data-view';
import { ResponsivePageHeader } from '@/components/ui/responsive-page-header';
import { toast } from 'sonner';
import { Plus, Trash2, Copy, Key, Eye, EyeOff } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchApiKeys, type ApiKey } from '@/lib/client-functions';
import { createApiKey, deleteApiKey } from '@/actions/api-keys';
import type {
	ColumnDef,
	ColumnFiltersState,
	PaginationState,
	SortingState,
} from '@tanstack/react-table';

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
	const [globalFilter, setGlobalFilter] = useState<string>('');
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
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
	 * @returns void
	 */
	const handleDelete = useCallback(
		(id: string): void => {
			deleteMutation.mutate(id);
		},
		[deleteMutation],
	);

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
	 * @returns void
	 */
	const toggleKeyVisibility = useCallback((id: string): void => {
		setVisibleKeys((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}, []);

	/**
	 * Updates the global filter and resets pagination.
	 *
	 * @param value - Next global filter value or updater
	 * @returns void
	 */
	const handleGlobalFilterChange = useCallback((value: React.SetStateAction<string>): void => {
		setGlobalFilter((prev) => (typeof value === 'function' ? value(prev) : value));
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}, []);

	const columns = useMemo<ColumnDef<ApiKey>[]>(
		() => [
			{
				id: 'name',
				accessorFn: (row) => row.name ?? '',
				header: t('table.headers.name'),
				cell: ({ row }) => (
					<span className="font-medium">{row.original.name || t('unnamed')}</span>
				),
			},
			{
				id: 'keyPreview',
				accessorFn: (row) => `${row.prefix ?? ''}${row.start ?? ''}`,
				header: t('table.headers.keyPreview'),
				cell: ({ row }) => (
					<div className="flex items-center gap-2">
						<code className="text-xs">
							{visibleKeys.has(row.original.id)
								? `${row.original.prefix ?? ''}${row.original.start ?? ''}...`
								: ''}
						</code>
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6"
							onClick={() => toggleKeyVisibility(row.original.id)}
							aria-label={
								visibleKeys.has(row.original.id)
									? t('actions.hideKey')
									: t('actions.showKey')
							}
						>
							{visibleKeys.has(row.original.id) ? (
								<EyeOff className="h-3 w-3" />
							) : (
								<Eye className="h-3 w-3" />
							)}
						</Button>
					</div>
				),
			},
			{
				accessorKey: 'enabled',
				header: t('table.headers.status'),
				cell: ({ row }) => (
					<Badge variant={row.original.enabled ? 'default' : 'secondary'}>
						{row.original.enabled ? t('status.active') : t('status.disabled')}
					</Badge>
				),
				enableGlobalFilter: false,
			},
			{
				id: 'lastRequest',
				accessorFn: (row) => (row.lastRequest ? new Date(row.lastRequest).getTime() : 0),
				header: t('table.headers.lastUsed'),
				cell: ({ row }) =>
					row.original.lastRequest
						? format(new Date(row.original.lastRequest), t('dateTimeFormat'))
						: t('never'),
				enableGlobalFilter: false,
			},
			{
				id: 'createdAt',
				accessorFn: (row) => new Date(row.createdAt).getTime(),
				header: t('table.headers.created'),
				cell: ({ row }) => format(new Date(row.original.createdAt), t('dateFormat')),
				enableGlobalFilter: false,
			},
			{
				id: 'expiresAt',
				accessorFn: (row) => (row.expiresAt ? new Date(row.expiresAt).getTime() : 0),
				header: t('table.headers.expires'),
				cell: ({ row }) =>
					row.original.expiresAt
						? format(new Date(row.original.expiresAt), t('dateFormat'))
						: t('never'),
				enableGlobalFilter: false,
			},
			{
				id: 'actions',
				header: t('table.headers.actions'),
				enableSorting: false,
				enableGlobalFilter: false,
				cell: ({ row }) => (
					<Dialog
						open={deleteConfirmId === row.original.id}
						onOpenChange={(open) => setDeleteConfirmId(open ? row.original.id : null)}
					>
						<DialogTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								aria-label={t('dialogs.delete.title')}
							>
								<Trash2 className="h-4 w-4 text-destructive" />
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>{t('dialogs.delete.title')}</DialogTitle>
								<DialogDescription>
									{t('dialogs.delete.description')}
								</DialogDescription>
							</DialogHeader>
							<DialogFooter>
								<Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
									{tCommon('cancel')}
								</Button>
								<Button
									variant="destructive"
									onClick={() => handleDelete(row.original.id)}
								>
									{tCommon('delete')}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				),
			},
		],
		[deleteConfirmId, handleDelete, t, tCommon, toggleKeyVisibility, visibleKeys],
	);

	const renderApiKeyCard = useCallback(
		(apiKey: ApiKey): React.ReactNode => (
			<div className="space-y-4">
				<div className="flex items-start justify-between gap-3">
					<div className="space-y-1">
						<p className="text-base font-semibold">{apiKey.name || t('unnamed')}</p>
						<code className="text-xs text-muted-foreground">
							{visibleKeys.has(apiKey.id)
								? `${apiKey.prefix ?? ''}${apiKey.start ?? ''}...`
								: '••••••••••••'}
						</code>
					</div>
					<Badge variant={apiKey.enabled ? 'default' : 'secondary'}>
						{apiKey.enabled ? t('status.active') : t('status.disabled')}
					</Badge>
				</div>

				<div className="grid gap-3">
					<div className="space-y-1">
						<p className="text-sm text-muted-foreground">{t('table.headers.lastUsed')}</p>
						<p className="text-sm font-medium">
							{apiKey.lastRequest
								? format(new Date(apiKey.lastRequest), t('dateTimeFormat'))
								: t('never')}
						</p>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1">
							<p className="text-sm text-muted-foreground">{t('table.headers.created')}</p>
							<p className="text-sm font-medium">
								{format(new Date(apiKey.createdAt), t('dateFormat'))}
							</p>
						</div>
						<div className="space-y-1">
							<p className="text-sm text-muted-foreground">{t('table.headers.expires')}</p>
							<p className="text-sm font-medium">
								{apiKey.expiresAt
									? format(new Date(apiKey.expiresAt), t('dateFormat'))
									: t('never')}
							</p>
						</div>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-2">
					<Button
						type="button"
						variant="outline"
						className="min-h-11"
						onClick={() => toggleKeyVisibility(apiKey.id)}
					>
						{visibleKeys.has(apiKey.id) ? (
							<EyeOff className="mr-2 h-4 w-4" />
						) : (
							<Eye className="mr-2 h-4 w-4" />
						)}
						{visibleKeys.has(apiKey.id) ? t('actions.hideKey') : t('actions.showKey')}
					</Button>
					<Dialog
						open={deleteConfirmId === apiKey.id}
						onOpenChange={(open) => setDeleteConfirmId(open ? apiKey.id : null)}
					>
						<DialogTrigger asChild>
							<Button type="button" variant="destructive" className="min-h-11">
								<Trash2 className="mr-2 h-4 w-4" />
								{tCommon('delete')}
							</Button>
						</DialogTrigger>
						<DialogContent className="w-full max-w-[calc(100vw-2rem)] min-[640px]:max-w-lg">
							<DialogHeader>
								<DialogTitle>{t('dialogs.delete.title')}</DialogTitle>
								<DialogDescription>
									{t('dialogs.delete.description')}
								</DialogDescription>
							</DialogHeader>
							<DialogFooter className="flex-col-reverse gap-2 min-[640px]:flex-row [&>button]:min-h-11 [&>button]:w-full min-[640px]:[&>button]:w-auto">
								<Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
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
				</div>
			</div>
		),
		[deleteConfirmId, handleDelete, t, tCommon, toggleKeyVisibility, visibleKeys],
	);

	return (
		<div className="min-w-0 space-y-6">
			<ResponsivePageHeader
				title={t('title')}
				description={t('subtitle')}
				actions={
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
							<Button
								onClick={handleCreateNew}
								data-testid="api-keys-create-button"
								className="min-h-11"
							>
								<Plus className="mr-2 h-4 w-4" />
								{t('actions.create')}
							</Button>
						</DialogTrigger>
						<DialogContent className="w-full max-w-[calc(100vw-2rem)] min-[640px]:max-w-[500px]">
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
											className="min-h-11 min-w-11"
										>
											<Copy className="h-4 w-4" />
										</Button>
									</div>
								</div>
								<DialogFooter className="flex-col-reverse gap-2 min-[640px]:flex-row [&>button]:min-h-11 [&>button]:w-full min-[640px]:[&>button]:w-auto">
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
												orientation="vertical"
											/>
										)}
									</form.AppField>
								</div>
								<DialogFooter className="flex-col-reverse gap-2 min-[640px]:flex-row [&>button]:min-h-11 [&>button]:w-full min-[640px]:[&>button]:w-auto">
									<form.AppForm>
										<form.SubmitButton
											label={t('actions.createKey')}
											loadingLabel={t('actions.creating')}
											className="min-h-11 w-full min-[640px]:w-auto"
										/>
									</form.AppForm>
								</DialogFooter>
							</form>
						)}
						</DialogContent>
					</Dialog>
				}
			/>

			<ResponsiveDataView
				columns={columns}
				data={apiKeys}
				cardRenderer={renderApiKeyCard}
				getCardKey={(apiKey) => apiKey.id}
				sorting={sorting}
				onSortingChange={setSorting}
				pagination={pagination}
				onPaginationChange={setPagination}
				columnFilters={columnFilters}
				onColumnFiltersChange={setColumnFilters}
				globalFilter={globalFilter}
				onGlobalFilterChange={handleGlobalFilterChange}
				emptyState={t('table.empty')}
				isLoading={isFetching}
			/>
		</div>
	);
}
