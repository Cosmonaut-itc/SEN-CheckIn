"use client";

import * as React from "react";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, Wifi, WifiOff, Wrench } from "lucide-react";
import { Header } from "@/components/header";
import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

/**
 * Device interface representing a kiosk device record.
 */
interface Device {
	id: string;
	code: string;
	name: string | null;
	deviceType: string | null;
	status: "ONLINE" | "OFFLINE" | "MAINTENANCE";
	lastHeartbeat: string | null;
	locationId: string | null;
	createdAt: string;
	updatedAt: string;
}

/**
 * Form data interface for creating/editing devices.
 */
interface DeviceFormData {
	code: string;
	name: string;
	deviceType: string;
	status: "ONLINE" | "OFFLINE" | "MAINTENANCE";
}

const PAGE_SIZE = 10;

/**
 * Devices page component.
 * Provides CRUD operations for device management.
 *
 * @returns Rendered devices page
 */
export default function DevicesPage(): React.JSX.Element {
	const { toast } = useToast();
	const [devices, setDevices] = React.useState<Device[]>([]);
	const [isLoading, setIsLoading] = React.useState<boolean>(true);
	const [page, setPage] = React.useState<number>(1);
	const [totalPages, setTotalPages] = React.useState<number>(1);
	const [searchQuery, setSearchQuery] = React.useState<string>("");

	// Dialog states
	const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState<boolean>(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = React.useState<boolean>(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState<boolean>(false);
	const [selectedDevice, setSelectedDevice] = React.useState<Device | null>(null);
	const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);

	// Form state
	const [formData, setFormData] = React.useState<DeviceFormData>({
		code: "",
		name: "",
		deviceType: "",
		status: "OFFLINE",
	});

	/**
	 * Fetches devices from the API.
	 */
	const fetchDevices = React.useCallback(async (): Promise<void> => {
		setIsLoading(true);
		try {
			const response = await api.devices.get({
				query: {
					limit: PAGE_SIZE,
					offset: (page - 1) * PAGE_SIZE,
				},
			});

			if (response.data) {
				setDevices(response.data.data as Device[]);
				const total = response.data.pagination?.total ?? 0;
				setTotalPages(Math.ceil(total / PAGE_SIZE));
			}
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to fetch devices",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	}, [page, toast]);

	React.useEffect(() => {
		fetchDevices();
	}, [fetchDevices]);

	/**
	 * Resets form data to initial state.
	 */
	const resetForm = (): void => {
		setFormData({
			code: "",
			name: "",
			deviceType: "",
			status: "OFFLINE",
		});
	};

	/**
	 * Handles creating a new device.
	 */
	const handleCreate = async (): Promise<void> => {
		setIsSubmitting(true);
		try {
			const response = await api.devices.post({
				code: formData.code,
				name: formData.name || undefined,
				deviceType: formData.deviceType || undefined,
				status: formData.status,
			});

			if (response.error) {
				toast({
					title: "Error",
					description: "Failed to create device",
					variant: "destructive",
				});
				return;
			}

			toast({
				title: "Success",
				description: "Device created successfully",
			});
			setIsCreateDialogOpen(false);
			resetForm();
			fetchDevices();
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to create device",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Handles updating a device.
	 */
	const handleUpdate = async (): Promise<void> => {
		if (!selectedDevice) return;

		setIsSubmitting(true);
		try {
			const response = await api.devices({ id: selectedDevice.id }).put({
				code: formData.code,
				name: formData.name || undefined,
				deviceType: formData.deviceType || undefined,
				status: formData.status,
			});

			if (response.error) {
				toast({
					title: "Error",
					description: "Failed to update device",
					variant: "destructive",
				});
				return;
			}

			toast({
				title: "Success",
				description: "Device updated successfully",
			});
			setIsEditDialogOpen(false);
			setSelectedDevice(null);
			resetForm();
			fetchDevices();
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to update device",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Handles deleting a device.
	 */
	const handleDelete = async (): Promise<void> => {
		if (!selectedDevice) return;

		setIsSubmitting(true);
		try {
			const response = await api.devices({ id: selectedDevice.id }).delete();

			if (response.error) {
				toast({
					title: "Error",
					description: "Failed to delete device",
					variant: "destructive",
				});
				return;
			}

			toast({
				title: "Success",
				description: "Device deleted successfully",
			});
			setIsDeleteDialogOpen(false);
			setSelectedDevice(null);
			fetchDevices();
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to delete device",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Opens the edit dialog with device data.
	 */
	const openEditDialog = (device: Device): void => {
		setSelectedDevice(device);
		setFormData({
			code: device.code,
			name: device.name ?? "",
			deviceType: device.deviceType ?? "",
			status: device.status,
		});
		setIsEditDialogOpen(true);
	};

	/**
	 * Opens the delete confirmation dialog.
	 */
	const openDeleteDialog = (device: Device): void => {
		setSelectedDevice(device);
		setIsDeleteDialogOpen(true);
	};

	/**
	 * Returns badge variant based on device status.
	 */
	const getStatusBadge = (status: Device["status"]): React.JSX.Element => {
		const config: Record<
			Device["status"],
			{ variant: "success" | "secondary" | "warning"; icon: React.ReactNode; label: string }
		> = {
			ONLINE: { variant: "success", icon: <Wifi className="h-3 w-3" />, label: "Online" },
			OFFLINE: { variant: "secondary", icon: <WifiOff className="h-3 w-3" />, label: "Offline" },
			MAINTENANCE: { variant: "warning", icon: <Wrench className="h-3 w-3" />, label: "Maintenance" },
		};
		const { variant, icon, label } = config[status];
		return (
			<Badge variant={variant} className="gap-1">
				{icon}
				{label}
			</Badge>
		);
	};

	/**
	 * Column definitions for the data table.
	 */
	const columns: Column<Device>[] = [
		{
			key: "code",
			header: "Code",
			cell: (device) => (
				<span className="font-mono text-sm">{device.code}</span>
			),
		},
		{
			key: "name",
			header: "Name",
			cell: (device) => device.name ?? "—",
		},
		{
			key: "deviceType",
			header: "Type",
			cell: (device) => device.deviceType ?? "—",
		},
		{
			key: "status",
			header: "Status",
			cell: (device) => getStatusBadge(device.status),
		},
		{
			key: "lastHeartbeat",
			header: "Last Heartbeat",
			cell: (device) =>
				device.lastHeartbeat
					? format(new Date(device.lastHeartbeat), "MMM d, h:mm a")
					: "—",
		},
		{
			key: "createdAt",
			header: "Created",
			cell: (device) => format(new Date(device.createdAt), "MMM d, yyyy"),
		},
		{
			key: "actions",
			header: "Actions",
			cell: (device) => (
				<div className="flex gap-2">
					<Button
						variant="ghost"
						size="icon"
						onClick={(e) => {
							e.stopPropagation();
							openEditDialog(device);
						}}
					>
						<Pencil className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={(e) => {
							e.stopPropagation();
							openDeleteDialog(device);
						}}
					>
						<Trash2 className="h-4 w-4 text-destructive" />
					</Button>
				</div>
			),
		},
	];

	return (
		<>
			<Header title="Devices" />
			<div className="p-6 space-y-6">
				{/* Toolbar */}
				<div className="flex items-center justify-between gap-4">
					<div className="flex-1 max-w-sm">
						<Input
							placeholder="Search devices..."
							value={searchQuery}
							onChange={(e) => {
								setSearchQuery(e.target.value);
								setPage(1);
							}}
						/>
					</div>
					<Button
						onClick={() => {
							resetForm();
							setIsCreateDialogOpen(true);
						}}
					>
						<Plus className="h-4 w-4 mr-2" />
						Add Device
					</Button>
				</div>

				{/* Data Table */}
				<DataTable
					columns={columns}
					data={devices}
					isLoading={isLoading}
					keyExtractor={(device) => device.id}
					emptyMessage="No devices found"
					page={page}
					totalPages={totalPages}
					onPageChange={setPage}
				/>
			</div>

			{/* Create Dialog */}
			<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add Device</DialogTitle>
						<DialogDescription>
							Register a new kiosk device in the system.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="code">Device Code *</Label>
								<Input
									id="code"
									value={formData.code}
									onChange={(e) =>
										setFormData({ ...formData, code: e.target.value })
									}
									placeholder="KIOSK-001"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="status">Status</Label>
								<Select
									value={formData.status}
									onValueChange={(value: Device["status"]) =>
										setFormData({ ...formData, status: value })
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="ONLINE">Online</SelectItem>
										<SelectItem value="OFFLINE">Offline</SelectItem>
										<SelectItem value="MAINTENANCE">Maintenance</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="name">Name</Label>
								<Input
									id="name"
									value={formData.name}
									onChange={(e) =>
										setFormData({ ...formData, name: e.target.value })
									}
									placeholder="Main Lobby Kiosk"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="deviceType">Device Type</Label>
								<Select
									value={formData.deviceType}
									onValueChange={(value) =>
										setFormData({ ...formData, deviceType: value })
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select type" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="TABLET">Tablet</SelectItem>
										<SelectItem value="KIOSK">Kiosk</SelectItem>
										<SelectItem value="MOBILE">Mobile</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setIsCreateDialogOpen(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button onClick={handleCreate} disabled={isSubmitting || !formData.code}>
							{isSubmitting ? "Creating..." : "Create Device"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Edit Dialog */}
			<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Device</DialogTitle>
						<DialogDescription>Update the device information below.</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="edit-code">Device Code *</Label>
								<Input
									id="edit-code"
									value={formData.code}
									onChange={(e) =>
										setFormData({ ...formData, code: e.target.value })
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="edit-status">Status</Label>
								<Select
									value={formData.status}
									onValueChange={(value: Device["status"]) =>
										setFormData({ ...formData, status: value })
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="ONLINE">Online</SelectItem>
										<SelectItem value="OFFLINE">Offline</SelectItem>
										<SelectItem value="MAINTENANCE">Maintenance</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="edit-name">Name</Label>
								<Input
									id="edit-name"
									value={formData.name}
									onChange={(e) =>
										setFormData({ ...formData, name: e.target.value })
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="edit-deviceType">Device Type</Label>
								<Select
									value={formData.deviceType}
									onValueChange={(value) =>
										setFormData({ ...formData, deviceType: value })
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select type" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="TABLET">Tablet</SelectItem>
										<SelectItem value="KIOSK">Kiosk</SelectItem>
										<SelectItem value="MOBILE">Mobile</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setIsEditDialogOpen(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button onClick={handleUpdate} disabled={isSubmitting || !formData.code}>
							{isSubmitting ? "Saving..." : "Save Changes"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Device</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete device{" "}
							<strong>{selectedDevice?.name ?? selectedDevice?.code}</strong>? This
							action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setIsDeleteDialogOpen(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleDelete}
							disabled={isSubmitting}
						>
							{isSubmitting ? "Deleting..." : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
