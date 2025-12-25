'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppForm } from '@/lib/forms';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { DataTable } from '@/components/data-table/data-table';
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
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import {
	fetchDevicesList,
	fetchLocationsList,
	type Device,
	type DeviceStatus,
	type Location,
} from '@/lib/client-functions';
import { updateDevice, deleteDevice } from '@/actions/devices';
import { useOrgContext } from '@/lib/org-client-context';
import type { ColumnDef, ColumnFiltersState, PaginationState, SortingState } from '@tanstack/react-table';

/**
 * Form values for creating/editing devices.
 */
interface DeviceFormValues {
	code: string;
	name: string;
	deviceType: string;
	status: DeviceStatus;
	locationId: string;
}

const NONE_LOCATION_VALUE = '__none__';

/**
 * Status badge variant mapping.
 */
const statusVariants: Record<DeviceStatus, 'default' | 'secondary' | 'destructive'> = {
	ONLINE: 'default',
	OFFLINE: 'secondary',
	MAINTENANCE: 'destructive',
};

/**
 * Devices page client component.
 * Provides CRUD operations for device management using TanStack Query.
 *
 * @returns The devices page JSX element
 */
export function DevicesPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId } = useOrgContext();
	const t = useTranslations('Devices');
	const tCommon = useTranslations('Common');
	const [globalFilter, setGlobalFilter] = useState<string>('');
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [editingDevice, setEditingDevice] = useState<Device | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const isOrgSelected = Boolean(organizationId);

	// Build query params - only include search if it has a value
	const queryParams = {
		limit: pagination.pageSize,
		offset: pagination.pageIndex * pagination.pageSize,
		...(globalFilter ? { search: globalFilter } : {}),
		...(organizationId ? { organizationId } : {}),
	};
	const locationParams = { limit: 100, offset: 0, organizationId };

	// Query for devices list
	const { data, isFetching } = useQuery({
		queryKey: queryKeys.devices.list(queryParams),
		queryFn: () => fetchDevicesList(queryParams),
		enabled: Boolean(organizationId),
	});

	// Locations for select options
	const { data: locationsData } = useQuery({
		queryKey: queryKeys.locations.list(locationParams),
		queryFn: () => fetchLocationsList(locationParams),
		enabled: Boolean(organizationId),
	});

	const locations = useMemo(() => (locationsData?.data ?? []) as Location[], [locationsData]);
	const locationOptions = useMemo(
		() => [
			{ value: NONE_LOCATION_VALUE, label: t('locationOptions.noLocation') },
			...locations.map((loc) => ({
				value: loc.id,
				label: loc.name || loc.code,
			})),
		],
		[locations, t],
	);

	const locationLookup = useMemo(
		() => new Map(locations.map((loc) => [loc.id, loc.name ?? loc.code])),
		[locations],
	);

	const devices = data?.data ?? [];
	const totalRows = data?.pagination.total ?? 0;

	// Update mutation
	const updateMutation = useMutation({
		mutationKey: mutationKeys.devices.update,
		mutationFn: updateDevice,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.updateSuccess'));
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			} else {
				toast.error(result.error ?? t('toast.updateError'));
			}
		},
		onError: () => {
			toast.error(t('toast.updateError'));
		},
	});

	// Delete mutation
	const deleteMutation = useMutation({
		mutationKey: mutationKeys.devices.delete,
		mutationFn: deleteDevice,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.deleteSuccess'));
				setDeleteConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
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
			code: '',
			name: '',
			deviceType: '',
			status: 'OFFLINE',
			locationId: NONE_LOCATION_VALUE,
		},
		onSubmit: async ({ value }: { value: DeviceFormValues }) => {
			if (!editingDevice) {
				toast.error(t('toast.selectDeviceToEdit'));
				return;
			}

			const locationId =
				value.locationId && value.locationId !== NONE_LOCATION_VALUE
					? value.locationId
					: undefined;

			await updateMutation.mutateAsync({
				id: editingDevice.id,
				code: value.code,
				name: value.name || undefined,
				deviceType: value.deviceType || undefined,
				status: value.status,
				locationId,
			});
			setIsDialogOpen(false);
			setEditingDevice(null);
			form.reset();
		},
	});

	/**
	 * Opens the dialog for editing an existing device.
	 *
	 * @param device - The device to edit
	 */
	const handleEdit = useCallback(
		(device: Device): void => {
			setEditingDevice(device);
			form.setFieldValue('code', device.code);
			form.setFieldValue('name', device.name ?? '');
			form.setFieldValue('deviceType', device.deviceType ?? '');
			form.setFieldValue('status', device.status);
			form.setFieldValue('locationId', device.locationId ?? NONE_LOCATION_VALUE);
			setIsDialogOpen(true);
		},
		[form],
	);

	/**
	 * Handles form submission for updating a device.
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
				setEditingDevice(null);
				form.reset();
			}
		},
		[form],
	);

	/**
	 * Handles device deletion.
	 *
	 * @param id - The device ID to delete
	 * @returns void
	 */
	const handleDelete = useCallback(
		(id: string): void => {
			deleteMutation.mutate(id);
		},
		[deleteMutation],
	);

	/**
	 * Updates the global filter and resets pagination.
	 *
	 * @param value - Next global filter value or updater
	 * @returns void
	 */
	const handleGlobalFilterChange = useCallback(
		(value: React.SetStateAction<string>): void => {
			setGlobalFilter((prev) => (typeof value === 'function' ? value(prev) : value));
			setPagination((prev) => ({ ...prev, pageIndex: 0 }));
		},
		[],
	);

	const columns = useMemo<ColumnDef<Device>[]>(
		() => [
			{
				accessorKey: 'code',
				header: t('table.headers.code'),
				cell: ({ row }) => (
					<span className="font-medium">{row.original.code}</span>
				),
			},
			{
				accessorKey: 'name',
				header: t('table.headers.name'),
				cell: ({ row }) => row.original.name ?? '-',
			},
			{
				accessorKey: 'deviceType',
				header: t('table.headers.type'),
				cell: ({ row }) => row.original.deviceType ?? '-',
			},
			{
				accessorKey: 'locationId',
				header: t('table.headers.location'),
				cell: ({ row }) =>
					row.original.locationId
						? locationLookup.get(row.original.locationId) ?? row.original.locationId
						: '-',
			},
			{
				accessorKey: 'status',
				header: t('table.headers.status'),
				cell: ({ row }) => (
					<Badge variant={statusVariants[row.original.status]}>
						{t(`status.${row.original.status}`)}
					</Badge>
				),
				enableGlobalFilter: false,
			},
			{
				accessorKey: 'lastHeartbeat',
				header: t('table.headers.lastHeartbeat'),
				cell: ({ row }) =>
					row.original.lastHeartbeat
						? format(new Date(row.original.lastHeartbeat), t('dateTimeFormat'))
						: '-',
				enableGlobalFilter: false,
			},
			{
				accessorKey: 'createdAt',
				header: t('table.headers.created'),
				cell: ({ row }) =>
					format(new Date(row.original.createdAt), t('dateFormat')),
				enableGlobalFilter: false,
			},
			{
				id: 'actions',
				header: t('table.headers.actions'),
				enableSorting: false,
				enableGlobalFilter: false,
				cell: ({ row }) => (
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon"
							onClick={() => handleEdit(row.original)}
						>
							<Pencil className="h-4 w-4" />
						</Button>
						<Dialog
							open={deleteConfirmId === row.original.id}
							onOpenChange={(open) =>
								setDeleteConfirmId(open ? row.original.id : null)
							}
						>
							<DialogTrigger asChild>
								<Button variant="ghost" size="icon">
									<Trash2 className="h-4 w-4 text-destructive" />
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>{t('dialogs.delete.title')}</DialogTitle>
									<DialogDescription>
										{t('dialogs.delete.description', {
											name: row.original.name || row.original.code,
										})}
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
										onClick={() => handleDelete(row.original.id)}
									>
										{tCommon('delete')}
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</div>
				),
			},
		],
		[deleteConfirmId, handleDelete, handleEdit, locationLookup, t, tCommon],
	);

	if (!isOrgSelected) {
		return (
			<div className="space-y-4">
				<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
				<p className="text-muted-foreground">{t('noOrganization')}</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between">
				<div className="space-y-1.5">
					<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
					<p className="text-muted-foreground">{t('subtitle')}</p>
					<p className="text-sm text-muted-foreground">{t('description')}</p>
				</div>
			</div>

			<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
				<DialogContent className="sm:max-w-[425px]">
					<form onSubmit={handleSubmit}>
						<DialogHeader>
							<DialogTitle>{t('dialog.title')}</DialogTitle>
							<DialogDescription>{t('dialog.description')}</DialogDescription>
						</DialogHeader>
						<div className="grid gap-4 py-4">
							<form.AppField
								name="code"
								validators={{
									onChange: ({ value }) =>
										!value.trim() ? t('validation.codeRequired') : undefined,
								}}
							>
								{(field) => <field.TextField label={t('fields.code')} />}
							</form.AppField>
							<form.AppField name="name">
								{(field) => (
									<field.TextField
										label={t('fields.name')}
										placeholder={tCommon('optional')}
									/>
								)}
							</form.AppField>
							<form.AppField name="deviceType">
								{(field) => (
									<field.TextField
										label={t('fields.type')}
										placeholder={t('placeholders.deviceType')}
									/>
								)}
							</form.AppField>
							<form.AppField
								name="status"
								validators={{
									onChange: ({ value }) =>
										!value ? t('validation.statusRequired') : undefined,
								}}
							>
								{(field) => (
									<field.SelectField
										label={t('fields.status')}
										options={[
											{ value: 'ONLINE', label: t('status.ONLINE') },
											{ value: 'OFFLINE', label: t('status.OFFLINE') },
											{
												value: 'MAINTENANCE',
												label: t('status.MAINTENANCE'),
											},
										]}
										placeholder={t('placeholders.selectStatus')}
									/>
								)}
							</form.AppField>
							<form.AppField name="locationId">
								{(field) => (
									<field.SelectField
										label={t('fields.location')}
										options={locationOptions}
										placeholder={t('placeholders.selectLocationOptional')}
									/>
								)}
							</form.AppField>
						</div>
						<DialogFooter>
							<form.AppForm>
								<form.SubmitButton
									label={t('actions.saveChanges')}
									loadingLabel={tCommon('saving')}
								/>
							</form.AppForm>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<DataTable
				columns={columns}
				data={devices}
				sorting={sorting}
				onSortingChange={setSorting}
				pagination={pagination}
				onPaginationChange={setPagination}
				columnFilters={columnFilters}
				onColumnFiltersChange={setColumnFilters}
				globalFilter={globalFilter}
				onGlobalFilterChange={handleGlobalFilterChange}
				globalFilterPlaceholder={t('search.placeholder')}
				manualPagination
				manualFiltering
				rowCount={totalRows}
				emptyState={t('table.empty')}
				isLoading={isFetching}
			/>
		</div>
	);
}
