'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
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

/**
 * Device status enum values.
 */
type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';

/**
 * Device record interface.
 */
interface Device {
	id: string;
	code: string;
	name: string | null;
	deviceType: string | null;
	status: DeviceStatus;
	lastHeartbeat: Date | null;
	locationId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Form data interface for creating/editing devices.
 */
interface DeviceFormData {
	code: string;
	name: string;
	deviceType: string;
	status: DeviceStatus;
}

/**
 * Initial empty form data.
 */
const initialFormData: DeviceFormData = {
	code: '',
	name: '',
	deviceType: '',
	status: 'OFFLINE',
};

/**
 * Status badge variant mapping.
 */
const statusVariants: Record<DeviceStatus, 'default' | 'secondary' | 'destructive'> = {
	ONLINE: 'default',
	OFFLINE: 'secondary',
	MAINTENANCE: 'destructive',
};

/**
 * Devices list page component.
 * Provides CRUD operations for device management.
 *
 * @returns The devices page JSX element
 */
export default function DevicesPage(): React.ReactElement {
	const [devices, setDevices] = useState<Device[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [search, setSearch] = useState<string>('');
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
	const [editingDevice, setEditingDevice] = useState<Device | null>(null);
	const [formData, setFormData] = useState<DeviceFormData>(initialFormData);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

	/**
	 * Fetches devices from the API.
	 */
	const fetchDevices = useCallback(async (): Promise<void> => {
		setIsLoading(true);
		try {
			const response = await api.devices.get({
				$query: { limit: 100, offset: 0, search: search || undefined },
			});
			if (response.data?.data) {
				setDevices(response.data.data as Device[]);
			}
		} catch (error) {
			console.error('Failed to fetch devices:', error);
			toast.error('Failed to load devices');
		} finally {
			setIsLoading(false);
		}
	}, [search]);

	useEffect(() => {
		fetchDevices();
	}, [fetchDevices]);

	/**
	 * Opens the dialog for creating a new device.
	 */
	const handleCreateNew = (): void => {
		setEditingDevice(null);
		setFormData(initialFormData);
		setIsDialogOpen(true);
	};

	/**
	 * Opens the dialog for editing an existing device.
	 *
	 * @param device - The device to edit
	 */
	const handleEdit = (device: Device): void => {
		setEditingDevice(device);
		setFormData({
			code: device.code,
			name: device.name ?? '',
			deviceType: device.deviceType ?? '',
			status: device.status,
		});
		setIsDialogOpen(true);
	};

	/**
	 * Handles form submission for creating or updating a device.
	 *
	 * @param e - The form submission event
	 */
	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
		e.preventDefault();
		setIsSubmitting(true);

		try {
			if (editingDevice) {
				// Update existing device
				const response = await api.devices[editingDevice.id].put({
					code: formData.code,
					name: formData.name || undefined,
					deviceType: formData.deviceType || undefined,
					status: formData.status,
				});

				if (response.error) {
					throw new Error('Failed to update device');
				}

				toast.success('Device updated successfully');
			} else {
				// Create new device
				const response = await api.devices.post({
					code: formData.code,
					name: formData.name || undefined,
					deviceType: formData.deviceType || undefined,
					status: formData.status,
				});

				if (response.error) {
					throw new Error('Failed to create device');
				}

				toast.success('Device created successfully');
			}

			setIsDialogOpen(false);
			fetchDevices();
		} catch (error) {
			console.error('Failed to save device:', error);
			toast.error(editingDevice ? 'Failed to update device' : 'Failed to create device');
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Handles device deletion.
	 *
	 * @param id - The device ID to delete
	 */
	const handleDelete = async (id: string): Promise<void> => {
		try {
			const response = await api.devices[id].delete();

			if (response.error) {
				throw new Error('Failed to delete device');
			}

			toast.success('Device deleted successfully');
			setDeleteConfirmId(null);
			fetchDevices();
		} catch (error) {
			console.error('Failed to delete device:', error);
			toast.error('Failed to delete device');
		}
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
				<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="code" className="text-right">
										Code
									</Label>
									<Input
										id="code"
										value={formData.code}
										onChange={(e) =>
											setFormData({ ...formData, code: e.target.value })
										}
										className="col-span-3"
										required
									/>
								</div>
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
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="deviceType" className="text-right">
										Type
									</Label>
									<Input
										id="deviceType"
										value={formData.deviceType}
										onChange={(e) =>
											setFormData({ ...formData, deviceType: e.target.value })
										}
										className="col-span-3"
										placeholder="TABLET, KIOSK, MOBILE"
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="status" className="text-right">
										Status
									</Label>
									<Select
										value={formData.status}
										onValueChange={(value: DeviceStatus) =>
											setFormData({ ...formData, status: value })
										}
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
							</div>
							<DialogFooter>
								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Saving...
										</>
									) : (
										'Save'
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
