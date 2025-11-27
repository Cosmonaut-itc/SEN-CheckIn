'use client';

import React, { useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchDevicesList, type Device, type DeviceStatus } from '@/lib/client-functions';
import { createDevice, updateDevice, deleteDevice } from '@/actions/devices';

/**
 * Form values for creating/editing devices.
 */
interface DeviceFormValues {
	code: string;
	name: string;
	deviceType: string;
	status: DeviceStatus;
}

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
	const [search, setSearch] = useState<string>('');
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [editingDevice, setEditingDevice] = useState<Device | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

	// Build query params - only include search if it has a value
	const queryParams = search
		? { search, limit: 100, offset: 0 }
		: { limit: 100, offset: 0 };

	// Query for devices list
	const { data, isFetching } = useQuery({
		queryKey: queryKeys.devices.list(queryParams),
		queryFn: () => fetchDevicesList(queryParams),
	});

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

	const isSubmitting = createMutation.isPending || updateMutation.isPending;

	// TanStack Form instance (after mutations to avoid TDZ)
	const form = useForm({
		defaultValues: {
			code: '',
			name: '',
			deviceType: '',
			status: 'OFFLINE',
		},
		onSubmit: async ({ value }: { value: DeviceFormValues }) => {
			if (editingDevice) {
				updateMutation.mutate({
					id: editingDevice.id,
					code: value.code,
					name: value.name || undefined,
					deviceType: value.deviceType || undefined,
					status: value.status,
				});
			} else {
				createMutation.mutate({
					code: value.code,
					name: value.name || undefined,
					deviceType: value.deviceType || undefined,
					status: value.status,
				});
			}
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
						<form.Field
							name="code"
							validators={{
								onChange: ({ value }) => (!value.trim() ? 'Code is required' : undefined),
							}}
						>
							{(field) => (
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor={field.name} className="text-right">
										Code
									</Label>
									<div className="col-span-3">
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
											onBlur={field.handleBlur}
											required
										/>
										{field.state.meta.errors.length > 0 && (
											<p className="mt-1 text-sm text-destructive">
												{field.state.meta.errors.join(', ')}
											</p>
										)}
									</div>
								</div>
							)}
						</form.Field>
						<form.Field name="name">
							{(field) => (
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor={field.name} className="text-right">
										Name
									</Label>
									<div className="col-span-3">
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
											onBlur={field.handleBlur}
											placeholder="Optional"
										/>
									</div>
								</div>
							)}
						</form.Field>
						<form.Field name="deviceType">
							{(field) => (
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor={field.name} className="text-right">
										Type
									</Label>
									<div className="col-span-3">
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
											onBlur={field.handleBlur}
											placeholder="TABLET, KIOSK, MOBILE"
										/>
									</div>
								</div>
							)}
						</form.Field>
						<form.Field
							name="status"
							validators={{
								onChange: ({ value }) => (!value ? 'Status is required' : undefined),
							}}
						>
							{(field) => (
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor={field.name} className="text-right">
										Status
									</Label>
									<Select
										value={field.state.value}
										onValueChange={(value: DeviceStatus) => field.handleChange(value)}
									>
										<SelectTrigger className="col-span-3">
											<SelectValue placeholder="Select status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="ONLINE">Online</SelectItem>
											<SelectItem value="OFFLINE">Offline</SelectItem>
											<SelectItem value="MAINTENANCE">Maintenance</SelectItem>
										</SelectContent>
									</Select>
								</div>
							)}
						</form.Field>
					</div>
					<DialogFooter>
						<form.Subscribe selector={(state) => [state.canSubmit]}>
							{([canSubmit]) => (
								<Button type="submit" disabled={!canSubmit || isSubmitting}>
									{isSubmitting ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Saving...
										</>
									) : (
										'Save'
									)}
								</Button>
							)}
						</form.Subscribe>
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
