'use client';

import React, { useCallback, useMemo, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import {
	fetchDevicesList,
	fetchLocationsList,
	type Device,
	type DeviceStatus,
	type Location,
} from '@/lib/client-functions';
import { createDevice, updateDevice, deleteDevice } from '@/actions/devices';
import { useOrgContext } from '@/lib/org-client-context';

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
	const [search, setSearch] = useState<string>('');
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [editingDevice, setEditingDevice] = useState<Device | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

	// Build query params - only include search if it has a value
	const baseParams = { limit: 100, offset: 0, organizationId };
	const queryParams = search ? { ...baseParams, search } : baseParams;

	// Query for devices list
	const { data, isFetching } = useQuery({
		queryKey: queryKeys.devices.list(queryParams),
		queryFn: () => fetchDevicesList(queryParams),
		enabled: Boolean(organizationId),
	});

	// Locations for select options
	const { data: locationsData } = useQuery({
		queryKey: queryKeys.locations.list(baseParams),
		queryFn: () => fetchLocationsList(baseParams),
		enabled: Boolean(organizationId),
	});

	const locations = useMemo(
		() => (locationsData?.data ?? []) as Location[],
		[locationsData],
	);
	const locationOptions = useMemo(
		() => [
			{ value: NONE_LOCATION_VALUE, label: 'No location' },
			...locations.map((loc) => ({
				value: loc.id,
				label: loc.name || loc.code,
			})),
		],
		[locations],
	);

	const locationLookup = useMemo(
		() => new Map(locations.map((loc) => [loc.id, loc.name ?? loc.code])),
		[locations],
	);

	const devices = data?.data ?? [];

	// Create mutation
	const createMutation = useMutation({
		mutationKey: mutationKeys.devices.create,
		mutationFn: createDevice,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Device created successfully');
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			} else {
				toast.error(result.error ?? 'Failed to create device');
			}
		},
		onError: () => {
			toast.error('Failed to create device');
		},
	});

	// Update mutation
	const updateMutation = useMutation({
		mutationKey: mutationKeys.devices.update,
		mutationFn: updateDevice,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Device updated successfully');
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			} else {
				toast.error(result.error ?? 'Failed to update device');
			}
		},
		onError: () => {
			toast.error('Failed to update device');
		},
	});

	// Delete mutation
	const deleteMutation = useMutation({
		mutationKey: mutationKeys.devices.delete,
		mutationFn: deleteDevice,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Device deleted successfully');
				setDeleteConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			} else {
				toast.error(result.error ?? 'Failed to delete device');
			}
		},
		onError: () => {
			toast.error('Failed to delete device');
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
		const locationId =
			value.locationId && value.locationId !== NONE_LOCATION_VALUE
				? value.locationId
				: undefined;
		if (editingDevice) {
			await updateMutation.mutateAsync({
				id: editingDevice.id,
				code: value.code,
				name: value.name || undefined,
				deviceType: value.deviceType || undefined,
				status: value.status,
				locationId,
			});
		} else {
			await createMutation.mutateAsync({
				code: value.code,
				name: value.name || undefined,
				deviceType: value.deviceType || undefined,
				status: value.status,
				locationId,
			});
		}
		setIsDialogOpen(false);
		setEditingDevice(null);
		form.reset();
	},
});

	/**
	 * Opens the dialog for creating a new device.
	 */
	const handleCreateNew = useCallback((): void => {
		setEditingDevice(null);
		form.reset();
		setIsDialogOpen(true);
	}, [form]);

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
	 * Handles form submission for creating or updating a device.
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
	 */
	const handleDelete = (id: string): void => {
		deleteMutation.mutate(id);
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Devices</h1>
					<p className="text-muted-foreground">
						Manage check-in kiosks and devices
					</p>
				</div>
		<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
			<DialogTrigger asChild>
				<Button onClick={handleCreateNew}>
					<Plus className="mr-2 h-4 w-4" />
					Add Device
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[425px]">
						<form onSubmit={handleSubmit}>
							<DialogHeader>
								<DialogTitle>
									{editingDevice ? 'Edit Device' : 'Add Device'}
								</DialogTitle>
								<DialogDescription>
									{editingDevice
										? 'Update the device details below.'
										: 'Fill in the details to create a new device.'}
								</DialogDescription>
							</DialogHeader>
					<div className="grid gap-4 py-4">
						<form.AppField
							name="code"
							validators={{
								onChange: ({ value }) => (!value.trim() ? 'Code is required' : undefined),
							}}
						>
							{(field) => <field.TextField label="Code" />}
						</form.AppField>
						<form.AppField name="name">
							{(field) => <field.TextField label="Name" placeholder="Optional" />}
						</form.AppField>
						<form.AppField name="deviceType">
							{(field) => <field.TextField label="Type" placeholder="TABLET, KIOSK, MOBILE" />}
						</form.AppField>
						<form.AppField
							name="status"
							validators={{
								onChange: ({ value }) => (!value ? 'Status is required' : undefined),
							}}
						>
							{(field) => (
								<field.SelectField
									label="Status"
									options={[
										{ value: 'ONLINE', label: 'Online' },
										{ value: 'OFFLINE', label: 'Offline' },
										{ value: 'MAINTENANCE', label: 'Maintenance' },
									]}
									placeholder="Select status"
								/>
							)}
						</form.AppField>
						<form.AppField name="locationId">
							{(field) => (
								<field.SelectField
									label="Location"
									options={locationOptions}
									placeholder="Select location (optional)"
								/>
							)}
						</form.AppField>
					</div>
					<DialogFooter>
						<form.AppForm>
							<form.SubmitButton label="Save" loadingLabel="Saving..." />
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
						placeholder="Search devices..."
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
							<TableHead>Code</TableHead>
							<TableHead>Name</TableHead>
							<TableHead>Type</TableHead>
							<TableHead>Location</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Last Heartbeat</TableHead>
							<TableHead>Created</TableHead>
							<TableHead className="w-[100px]">Actions</TableHead>
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
						) : devices.length === 0 ? (
							<TableRow>
								<TableCell colSpan={7} className="h-24 text-center">
									No devices found.
								</TableCell>
							</TableRow>
						) : (
							devices.map((device) => (
								<TableRow key={device.id}>
									<TableCell className="font-medium">{device.code}</TableCell>
									<TableCell>{device.name ?? '-'}</TableCell>
									<TableCell>{device.deviceType ?? '-'}</TableCell>
									<TableCell>
										{device.locationId
											? locationLookup.get(device.locationId) ?? device.locationId
											: '-'}
									</TableCell>
									<TableCell>
										<Badge variant={statusVariants[device.status]}>
											{device.status}
										</Badge>
									</TableCell>
									<TableCell>
										{device.lastHeartbeat
											? format(new Date(device.lastHeartbeat), 'MMM d, yyyy HH:mm')
											: '-'}
									</TableCell>
									<TableCell>
										{format(new Date(device.createdAt), 'MMM d, yyyy')}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Button
												variant="ghost"
												size="icon"
												onClick={() => handleEdit(device)}
											>
												<Pencil className="h-4 w-4" />
											</Button>
											<Dialog
												open={deleteConfirmId === device.id}
												onOpenChange={(open) =>
													setDeleteConfirmId(open ? device.id : null)
												}
											>
												<DialogTrigger asChild>
													<Button variant="ghost" size="icon">
														<Trash2 className="h-4 w-4 text-destructive" />
													</Button>
												</DialogTrigger>
												<DialogContent>
													<DialogHeader>
														<DialogTitle>Delete Device</DialogTitle>
														<DialogDescription>
															Are you sure you want to delete {device.name || device.code}?
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
															onClick={() => handleDelete(device.id)}
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
