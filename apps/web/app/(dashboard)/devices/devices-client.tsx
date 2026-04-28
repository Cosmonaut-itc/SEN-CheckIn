'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SETTINGS_PIN_REGEX } from '@sen-checkin/types';
import { useAppForm } from '@/lib/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Separator } from '@/components/ui/separator';
import { TourHelpButton } from '@/components/tour-help-button';
import { toast } from 'sonner';
import { KeyRound, Pencil, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import {
	fetchDeviceSettingsPinConfig,
	fetchDevicesList,
	fetchLocationsList,
	type Device,
	type DeviceSettingsPinConfigDevice,
	type DeviceSettingsPinListStatus,
	type DeviceSettingsPinMode,
	type DeviceStatus,
	type Location,
} from '@/lib/client-functions';
import {
	updateDevice,
	deleteDevice,
	updateDeviceSettingsPin,
	updateDeviceSettingsPinConfig,
} from '@/actions/devices';
import { useTour } from '@/hooks/use-tour';
import { useOrgContext } from '@/lib/org-client-context';
import type {
	ColumnDef,
	ColumnFiltersState,
	PaginationState,
	SortingState,
} from '@tanstack/react-table';

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

interface ScopedPinModeSelection {
	organizationId: string | null;
	mode: DeviceSettingsPinMode;
}

interface ScopedTextInputState {
	organizationId: string | null;
	value: string;
}

interface ScopedTextErrorState {
	organizationId: string | null;
	value: string | null;
}

interface ScopedDevicePinSelection {
	organizationId: string | null;
	device: DeviceSettingsPinConfigDevice | null;
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

const settingsPinStatusVariants: Record<
	DeviceSettingsPinListStatus,
	'default' | 'secondary' | 'outline'
> = {
	OWN_PIN: 'default',
	USES_GLOBAL: 'secondary',
	NOT_CONFIGURED: 'outline',
};

/**
 * Validates a PIN and confirmation pair.
 *
 * @param pin - PIN value
 * @param confirmation - Confirmation value
 * @returns Validation result key or null when valid
 */
function validatePinPair(pin: string, confirmation: string): 'format' | 'mismatch' | null {
	if (!SETTINGS_PIN_REGEX.test(pin)) {
		return 'format';
	}

	return pin === confirmation ? null : 'mismatch';
}

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
	useTour('devices');
	const [globalFilter, setGlobalFilter] = useState<string>('');
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [editingDevice, setEditingDevice] = useState<Device | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const [selectedPinMode, setSelectedPinMode] = useState<ScopedPinModeSelection | null>(null);
	const [globalPinState, setGlobalPinState] = useState<ScopedTextInputState>({
		organizationId: null,
		value: '',
	});
	const [globalPinConfirmationState, setGlobalPinConfirmationState] =
		useState<ScopedTextInputState>({
			organizationId: null,
			value: '',
		});
	const [globalPinErrorState, setGlobalPinErrorState] = useState<ScopedTextErrorState>({
		organizationId: null,
		value: null,
	});
	const [selectedPinDeviceState, setSelectedPinDeviceState] = useState<ScopedDevicePinSelection>({
		organizationId: null,
		device: null,
	});
	const [devicePinState, setDevicePinState] = useState<ScopedTextInputState>({
		organizationId: null,
		value: '',
	});
	const [devicePinConfirmationState, setDevicePinConfirmationState] =
		useState<ScopedTextInputState>({
			organizationId: null,
			value: '',
		});
	const [devicePinErrorState, setDevicePinErrorState] = useState<ScopedTextErrorState>({
		organizationId: null,
		value: null,
	});
	const isOrgSelected = Boolean(organizationId);

	// Build query params - only include search if it has a value
	const queryParams = {
		limit: pagination.pageSize,
		offset: pagination.pageIndex * pagination.pageSize,
		...(globalFilter ? { search: globalFilter } : {}),
		...(organizationId ? { organizationId } : {}),
	};
	const locationParams = { limit: 100, offset: 0, organizationId };
	const settingsPinParams = { organizationId };

	// Query for devices list
	const { data, isFetching } = useQuery({
		queryKey: queryKeys.devices.list(queryParams),
		queryFn: () => fetchDevicesList(queryParams),
		enabled: Boolean(organizationId),
	});

	const { data: settingsPinConfig, isPending: isSettingsPinConfigPending } = useQuery({
		queryKey: queryKeys.devices.settingsPinConfig(settingsPinParams),
		queryFn: () => fetchDeviceSettingsPinConfig(settingsPinParams),
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

	const globalPin = globalPinState.organizationId === organizationId ? globalPinState.value : '';
	const globalPinConfirmation =
		globalPinConfirmationState.organizationId === organizationId
			? globalPinConfirmationState.value
			: '';
	const globalPinError =
		globalPinErrorState.organizationId === organizationId ? globalPinErrorState.value : null;
	const selectedPinDevice =
		selectedPinDeviceState.organizationId === organizationId
			? selectedPinDeviceState.device
			: null;
	const devicePin = devicePinState.organizationId === organizationId ? devicePinState.value : '';
	const devicePinConfirmation =
		devicePinConfirmationState.organizationId === organizationId
			? devicePinConfirmationState.value
			: '';
	const devicePinError =
		devicePinErrorState.organizationId === organizationId ? devicePinErrorState.value : null;
	const effectivePinMode =
		selectedPinMode?.organizationId === organizationId
			? selectedPinMode.mode
			: settingsPinConfig?.mode;
	const isSettingsPinConfigReady = Boolean(settingsPinConfig);

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

	const settingsPinConfigMutation = useMutation({
		mutationKey: mutationKeys.devices.settingsPinConfig,
		mutationFn: updateDeviceSettingsPinConfig,
		onSuccess: (result) => {
			if (result.success) {
				setGlobalPinState({ organizationId, value: '' });
				setGlobalPinConfirmationState({ organizationId, value: '' });
				setGlobalPinErrorState({ organizationId, value: null });
				toast.success(t('settingsPin.toast.configSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
				queryClient.invalidateQueries({
					queryKey: queryKeys.devices.settingsPinConfig(settingsPinParams),
				});
			} else {
				toast.error(t('settingsPin.toast.configError'));
			}
		},
		onError: () => {
			toast.error(t('settingsPin.toast.configError'));
		},
	});

	const deviceSettingsPinMutation = useMutation({
		mutationKey: mutationKeys.devices.settingsPin,
		mutationFn: updateDeviceSettingsPin,
		onSuccess: (result) => {
			if (result.success) {
				setDevicePinState({ organizationId, value: '' });
				setDevicePinConfirmationState({ organizationId, value: '' });
				setDevicePinErrorState({ organizationId, value: null });
				setSelectedPinDeviceState({ organizationId, device: null });
				toast.success(t('settingsPin.toast.deviceSuccess'));
				queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
				queryClient.invalidateQueries({
					queryKey: queryKeys.devices.settingsPinConfig(settingsPinParams),
				});
			} else {
				toast.error(t('settingsPin.toast.deviceError'));
			}
		},
		onError: () => {
			toast.error(t('settingsPin.toast.deviceError'));
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
	const handleGlobalFilterChange = useCallback((value: React.SetStateAction<string>): void => {
		setGlobalFilter((prev) => (typeof value === 'function' ? value(prev) : value));
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}, []);

	/**
	 * Saves the selected settings PIN policy and optional global PIN.
	 *
	 * @returns void
	 */
	const handleSaveSettingsPinConfig = useCallback((): void => {
		if (!isSettingsPinConfigReady || !effectivePinMode) {
			return;
		}

		const trimmedPin = globalPin.trim();
		const trimmedConfirmation = globalPinConfirmation.trim();
		const shouldUpdateGlobalPin = trimmedPin.length > 0 || trimmedConfirmation.length > 0;

		if (shouldUpdateGlobalPin) {
			const validationResult = validatePinPair(trimmedPin, trimmedConfirmation);
			if (validationResult) {
				setGlobalPinErrorState({
					organizationId,
					value: t(`settingsPin.validation.${validationResult}`),
				});
				return;
			}
		}

		setGlobalPinErrorState({ organizationId, value: null });
		settingsPinConfigMutation.mutate({
			mode: effectivePinMode,
			globalPin: shouldUpdateGlobalPin ? trimmedPin : undefined,
			organizationId,
		});
	}, [
		effectivePinMode,
		globalPin,
		globalPinConfirmation,
		isSettingsPinConfigReady,
		organizationId,
		settingsPinConfigMutation,
		t,
	]);

	/**
	 * Opens the device PIN dialog.
	 *
	 * @param device - Device PIN status row
	 * @returns void
	 */
	const handleOpenDevicePinDialog = useCallback(
		(device: DeviceSettingsPinConfigDevice): void => {
			setSelectedPinDeviceState({ organizationId, device });
			setDevicePinState({ organizationId, value: '' });
			setDevicePinConfirmationState({ organizationId, value: '' });
			setDevicePinErrorState({ organizationId, value: null });
		},
		[organizationId],
	);

	/**
	 * Handles device PIN dialog open state changes.
	 *
	 * @param open - Whether the dialog should remain open
	 * @returns void
	 */
	const handleDevicePinDialogOpenChange = useCallback(
		(open: boolean): void => {
			if (!open) {
				setSelectedPinDeviceState({ organizationId, device: null });
				setDevicePinState({ organizationId, value: '' });
				setDevicePinConfirmationState({ organizationId, value: '' });
				setDevicePinErrorState({ organizationId, value: null });
			}
		},
		[organizationId],
	);

	/**
	 * Saves a device-specific settings PIN.
	 *
	 * @returns void
	 */
	const handleSaveDeviceSettingsPin = useCallback((): void => {
		if (!selectedPinDevice) {
			return;
		}

		const trimmedPin = devicePin.trim();
		const validationResult = validatePinPair(trimmedPin, devicePinConfirmation.trim());
		if (validationResult) {
			setDevicePinErrorState({
				organizationId,
				value: t(`settingsPin.validation.${validationResult}`),
			});
			return;
		}

		setDevicePinErrorState({ organizationId, value: null });
		deviceSettingsPinMutation.mutate({
			deviceId: selectedPinDevice.id,
			pin: trimmedPin,
		});
	}, [
		devicePin,
		devicePinConfirmation,
		deviceSettingsPinMutation,
		organizationId,
		selectedPinDevice,
		t,
	]);

	const columns = useMemo<ColumnDef<Device>[]>(
		() => [
			{
				accessorKey: 'code',
				header: t('table.headers.code'),
				cell: ({ row }) => <span className="font-medium">{row.original.code}</span>,
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
						? (locationLookup.get(row.original.locationId) ?? row.original.locationId)
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
				cell: ({ row }) => format(new Date(row.original.createdAt), t('dateFormat')),
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
							aria-label={t('dialog.title')}
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

	const renderDeviceCard = useCallback(
		(device: Device): React.ReactNode => (
			<div className="space-y-4">
				<div className="flex items-start justify-between gap-3">
					<div className="space-y-1">
						<Badge variant="outline">{device.code}</Badge>
						<p className="text-base font-semibold">{device.name ?? device.code}</p>
					</div>
					<Badge variant={statusVariants[device.status]}>
						{t(`status.${device.status}`)}
					</Badge>
				</div>

				<div className="grid gap-3">
					<div className="space-y-1">
						<p className="text-sm text-muted-foreground">{t('table.headers.type')}</p>
						<p className="text-sm font-medium">{device.deviceType ?? '-'}</p>
					</div>
					<div className="space-y-1">
						<p className="text-sm text-muted-foreground">
							{t('table.headers.location')}
						</p>
						<p className="text-sm font-medium">
							{device.locationId
								? (locationLookup.get(device.locationId) ?? device.locationId)
								: '-'}
						</p>
					</div>
					<div className="space-y-1">
						<p className="text-sm text-muted-foreground">
							{t('table.headers.lastHeartbeat')}
						</p>
						<p className="text-sm font-medium">
							{device.lastHeartbeat
								? format(new Date(device.lastHeartbeat), t('dateTimeFormat'))
								: '-'}
						</p>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-2">
					<Button
						type="button"
						variant="outline"
						className="min-h-11"
						onClick={() => handleEdit(device)}
					>
						<Pencil className="mr-2 h-4 w-4" />
						{tCommon('edit')}
					</Button>
					<Dialog
						open={deleteConfirmId === device.id}
						onOpenChange={(open) => setDeleteConfirmId(open ? device.id : null)}
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
									{t('dialogs.delete.description', {
										name: device.name || device.code,
									})}
								</DialogDescription>
							</DialogHeader>
							<DialogFooter className="flex-col-reverse gap-2 min-[640px]:flex-row [&>button]:min-h-11 [&>button]:w-full min-[640px]:[&>button]:w-auto">
								<Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
									{tCommon('cancel')}
								</Button>
								<Button
									variant="destructive"
									onClick={() => handleDelete(device.id)}
								>
									{tCommon('delete')}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</div>
			</div>
		),
		[deleteConfirmId, handleDelete, handleEdit, locationLookup, t, tCommon],
	);

	if (!isOrgSelected) {
		return (
			<div className="space-y-4">
				<ResponsivePageHeader title={t('title')} description={t('noOrganization')} />
			</div>
		);
	}

	return (
		<div className="min-w-0 space-y-6">
			<ResponsivePageHeader
				title={t('title')}
				description={t('subtitle')}
				actions={
					<>
						<TourHelpButton tourId="devices" />
						<Button
							asChild
							variant="secondary"
							aria-label={t('mobileSetup.ariaLabel')}
							data-testid="devices-setup-button"
							className="min-h-11"
						>
							<Link href="/device" className="flex items-center gap-2">
								<Smartphone className="h-4 w-4" />
								<span>{t('mobileSetup.label')}</span>
							</Link>
						</Button>
					</>
				}
			/>
			<p className="text-sm text-muted-foreground">{t('description')}</p>

			<section
				aria-labelledby="settings-pin-heading"
				className="space-y-4 rounded-md border border-border bg-background/70 p-4"
			>
				<div className="flex flex-col gap-3 min-[720px]:flex-row min-[720px]:items-start min-[720px]:justify-between">
					<div className="flex items-start gap-3">
						<div className="flex size-9 items-center justify-center rounded-md bg-muted">
							<KeyRound className="h-4 w-4 text-muted-foreground" />
						</div>
						<div className="min-w-0 space-y-1">
							<h2 id="settings-pin-heading" className="text-base font-semibold">
								{t('settingsPin.title')}
							</h2>
							<p className="max-w-2xl text-sm text-muted-foreground">
								{t('settingsPin.description')}
							</p>
						</div>
					</div>
					<Badge
						variant={settingsPinConfig?.globalPinConfigured ? 'default' : 'outline'}
						className="w-fit"
					>
						{isSettingsPinConfigPending || !settingsPinConfig
							? t('settingsPin.loading')
							: settingsPinConfig.globalPinConfigured
								? t('settingsPin.global.configured')
								: t('settingsPin.global.notConfigured')}
					</Badge>
				</div>

				<div
					className="grid gap-2 min-[560px]:grid-cols-2"
					role="group"
					aria-label={t('settingsPin.mode.label')}
				>
					<Button
						type="button"
						variant={effectivePinMode === 'GLOBAL' ? 'default' : 'outline'}
						aria-pressed={effectivePinMode === 'GLOBAL'}
						onClick={() => setSelectedPinMode({ organizationId, mode: 'GLOBAL' })}
						disabled={!isSettingsPinConfigReady}
						className="min-h-11 justify-start"
					>
						<ShieldCheck className="mr-2 h-4 w-4" />
						{t('settingsPin.mode.global')}
					</Button>
					<Button
						type="button"
						variant={effectivePinMode === 'PER_DEVICE' ? 'default' : 'outline'}
						aria-pressed={effectivePinMode === 'PER_DEVICE'}
						onClick={() => setSelectedPinMode({ organizationId, mode: 'PER_DEVICE' })}
						disabled={!isSettingsPinConfigReady}
						className="min-h-11 justify-start"
					>
						<KeyRound className="mr-2 h-4 w-4" />
						{t('settingsPin.mode.perDevice')}
					</Button>
				</div>

				<div className="grid gap-3 min-[720px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] min-[720px]:items-end">
					<div className="space-y-2">
						<Label htmlFor="settings-pin-global-pin">
							{t('settingsPin.global.pinLabel')}
						</Label>
						<Input
							id="settings-pin-global-pin"
							type="password"
							inputMode="numeric"
							maxLength={4}
							autoComplete="off"
							value={globalPin}
							onChange={(event) =>
								setGlobalPinState({
									organizationId,
									value: event.target.value,
								})
							}
							disabled={!isSettingsPinConfigReady}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="settings-pin-global-confirmation">
							{t('settingsPin.global.confirmLabel')}
						</Label>
						<Input
							id="settings-pin-global-confirmation"
							type="password"
							inputMode="numeric"
							maxLength={4}
							autoComplete="off"
							value={globalPinConfirmation}
							onChange={(event) =>
								setGlobalPinConfirmationState({
									organizationId,
									value: event.target.value,
								})
							}
							disabled={!isSettingsPinConfigReady}
						/>
					</div>
					<Button
						type="button"
						className="min-h-11"
						onClick={handleSaveSettingsPinConfig}
						disabled={!isSettingsPinConfigReady || settingsPinConfigMutation.isPending}
					>
						{settingsPinConfigMutation.isPending
							? tCommon('saving')
							: t('settingsPin.global.save')}
					</Button>
				</div>
				{globalPinError ? (
					<p className="text-sm text-destructive" role="alert">
						{globalPinError}
					</p>
				) : null}

				<Separator />

				<div className="space-y-3">
					<div className="flex items-center justify-between gap-3">
						<h3 className="text-sm font-semibold">{t('settingsPin.devices.title')}</h3>
						<p className="text-xs text-muted-foreground">
							{settingsPinConfig
								? t('settingsPin.devices.count', {
										count: settingsPinConfig.devices.length,
									})
								: t('settingsPin.loading')}
						</p>
					</div>
					<div className="grid gap-2">
						{!settingsPinConfig ? (
							<p className="text-sm text-muted-foreground">
								{t('settingsPin.loading')}
							</p>
						) : settingsPinConfig.devices.length ? (
							settingsPinConfig.devices.map((device) => {
								const deviceName = device.name ?? device.code;

								return (
									<div
										key={device.id}
										className="grid gap-3 rounded-md border border-border/70 px-3 py-2 min-[720px]:grid-cols-[minmax(0,1fr)_auto_auto] min-[720px]:items-center"
									>
										<div className="min-w-0">
											<p className="truncate text-sm font-medium">
												{deviceName}
											</p>
											<p className="text-xs text-muted-foreground">
												{device.code}
											</p>
										</div>
										<Badge
											variant={settingsPinStatusVariants[device.status]}
											className="w-fit"
										>
											{t(`settingsPin.status.${device.status}`)}
										</Badge>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => handleOpenDevicePinDialog(device)}
											aria-label={t('settingsPin.devices.changeAria', {
												name: deviceName,
											})}
										>
											<KeyRound className="mr-2 h-4 w-4" />
											{t('settingsPin.devices.change')}
										</Button>
									</div>
								);
							})
						) : (
							<p className="text-sm text-muted-foreground">
								{t('settingsPin.devices.empty')}
							</p>
						)}
					</div>
				</div>
			</section>

			<Dialog
				open={Boolean(selectedPinDevice)}
				onOpenChange={handleDevicePinDialogOpenChange}
			>
				<DialogContent className="w-full max-w-[calc(100vw-2rem)] min-[640px]:max-w-[425px]">
					<DialogHeader>
						<DialogTitle>{t('settingsPin.deviceDialog.title')}</DialogTitle>
						<DialogDescription>
							{selectedPinDevice
								? t('settingsPin.deviceDialog.description', {
										name: selectedPinDevice.name ?? selectedPinDevice.code,
									})
								: t('settingsPin.deviceDialog.descriptionFallback')}
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-2">
						<div className="space-y-2">
							<Label htmlFor="settings-pin-device-pin">
								{t('settingsPin.deviceDialog.pinLabel')}
							</Label>
							<Input
								id="settings-pin-device-pin"
								type="password"
								inputMode="numeric"
								maxLength={4}
								autoComplete="off"
								value={devicePin}
								onChange={(event) =>
									setDevicePinState({
										organizationId,
										value: event.target.value,
									})
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="settings-pin-device-confirmation">
								{t('settingsPin.deviceDialog.confirmLabel')}
							</Label>
							<Input
								id="settings-pin-device-confirmation"
								type="password"
								inputMode="numeric"
								maxLength={4}
								autoComplete="off"
								value={devicePinConfirmation}
								onChange={(event) =>
									setDevicePinConfirmationState({
										organizationId,
										value: event.target.value,
									})
								}
							/>
						</div>
						{devicePinError ? (
							<p className="text-sm text-destructive" role="alert">
								{devicePinError}
							</p>
						) : null}
					</div>
					<DialogFooter className="flex-col-reverse gap-2 min-[640px]:flex-row [&>button]:min-h-11 [&>button]:w-full min-[640px]:[&>button]:w-auto">
						<Button
							type="button"
							variant="outline"
							onClick={() => handleDevicePinDialogOpenChange(false)}
						>
							{tCommon('cancel')}
						</Button>
						<Button
							type="button"
							onClick={handleSaveDeviceSettingsPin}
							disabled={deviceSettingsPinMutation.isPending}
						>
							{deviceSettingsPinMutation.isPending
								? tCommon('saving')
								: t('settingsPin.deviceDialog.save')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
				<DialogContent className="w-full max-w-[calc(100vw-2rem)] min-[640px]:max-w-[425px]">
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
										orientation="vertical"
									/>
								)}
							</form.AppField>
							<form.AppField name="deviceType">
								{(field) => (
									<field.TextField
										label={t('fields.type')}
										placeholder={t('placeholders.deviceType')}
										orientation="vertical"
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
										orientation="vertical"
									/>
								)}
							</form.AppField>
							<form.AppField name="locationId">
								{(field) => (
									<field.SelectField
										label={t('fields.location')}
										options={locationOptions}
										placeholder={t('placeholders.selectLocationOptional')}
										orientation="vertical"
									/>
								)}
							</form.AppField>
						</div>
						<DialogFooter className="flex-col-reverse gap-2 min-[640px]:flex-row [&>button]:min-h-11 [&>button]:w-full min-[640px]:[&>button]:w-auto">
							<form.AppForm>
								<form.SubmitButton
									label={t('actions.saveChanges')}
									loadingLabel={tCommon('saving')}
									className="min-h-11 w-full min-[640px]:w-auto"
								/>
							</form.AppForm>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<div data-tour="devices-list">
				<ResponsiveDataView
					columns={columns}
					data={devices}
					cardRenderer={renderDeviceCard}
					getCardKey={(device) => device.id}
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
		</div>
	);
}
