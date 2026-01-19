'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppForm, useStore } from '@/lib/forms';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
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
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '@/components/ui/command';
import { toast } from 'sonner';
import { Check, ChevronsUpDown, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import {
	fetchLocationById,
	fetchLocationsList,
	type Location,
} from '@/lib/client-functions';
import {
	createLocation,
	updateLocation,
	deleteLocation,
	type LocationMutationErrorCode,
} from '@/actions/locations';
import { useOrgContext } from '@/lib/org-client-context';
import type { ColumnDef, ColumnFiltersState, PaginationState, SortingState } from '@tanstack/react-table';
import type { LocationMapPickerProps } from './location-map-picker';

/**
 * Form values for creating/editing locations.
 */
interface LocationFormValues {
	name: string;
	code: string;
	address: string;
	geographicZone: 'GENERAL' | 'ZLFN';
	timeZone: string;
	latitude: number | null;
	longitude: number | null;
}

const GEOCODE_MIN_CHARS = 3;
const GEOCODE_DEBOUNCE_MS = 350;

/**
 * Loads the location map picker lazily.
 *
 * @returns Promise resolving to the location map picker component
 */
const loadLocationMapPicker = async () => {
	const mapModule = await import('./location-map-picker');
	return mapModule.LocationMapPicker;
};

/**
 * Placeholder rendered while the map picker bundle loads.
 *
 * @returns The map picker placeholder element
 */
function LocationMapPickerFallback(): React.ReactElement {
	return (
		<div className="relative h-56 w-full overflow-hidden rounded-md border bg-muted/20" />
	);
}

const LocationMapPicker = dynamic<LocationMapPickerProps>(loadLocationMapPicker, {
	ssr: false,
	loading: LocationMapPickerFallback,
});

/**
 * Geocode suggestion returned from the proxy endpoint.
 */
interface GeocodeSuggestion {
	displayName: string;
	lat: number;
	lng: number;
}

/**
 * Debounces a string value to limit rapid updates.
 *
 * @param value - Current string value.
 * @param delayMs - Delay in milliseconds.
 * @returns The debounced string value.
 */
function useDebouncedValue(value: string, delayMs: number): string {
	const [debouncedValue, setDebouncedValue] = useState<string>(value);

	useEffect(() => {
		const handle = setTimeout(() => {
			setDebouncedValue(value);
		}, delayMs);

		return () => clearTimeout(handle);
	}, [value, delayMs]);

	return debouncedValue;
}

/**
 * Fetches geocode suggestions for a query string.
 *
 * @param query - Address query string.
 * @returns A list of geocode suggestions.
 * @throws Error when the endpoint fails.
 */
async function fetchGeocodeSuggestions(query: string): Promise<GeocodeSuggestion[]> {
	const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);

	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as
			| { errorCode?: string }
			| null;
		throw new Error(payload?.errorCode ?? 'UNKNOWN_ERROR');
	}

	const payload = (await response.json()) as { data?: GeocodeSuggestion[] };
	return payload.data ?? [];
}

/**
 * Maps mutation error codes to translated messages.
 *
 * @param t - Translation helper for Locations namespace.
 * @param errorCode - Error code from the mutation result.
 * @param fallbackKey - Translation key for the fallback message.
 * @returns Localized error message.
 */
function getLocationErrorMessage(
	t: (key: string) => string,
	errorCode: LocationMutationErrorCode | undefined,
	fallbackKey: string,
): string {
	if (!errorCode) {
		return t(fallbackKey);
	}

	switch (errorCode) {
		case 'CONFLICT':
			return t('toast.errors.conflict');
		case 'NOT_FOUND':
			return t('toast.errors.notFound');
		case 'FORBIDDEN':
			return t('toast.errors.forbidden');
		case 'BAD_REQUEST':
			return t('toast.errors.badRequest');
		default:
			return t(fallbackKey);
	}
}

/**
 * Locations page client component.
 * Provides CRUD operations for location management using TanStack Query.
 *
 * @returns The locations page JSX element
 */
export function LocationsPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId } = useOrgContext();
	const t = useTranslations('Locations');
	const tCommon = useTranslations('Common');
	const [globalFilter, setGlobalFilter] = useState<string>('');
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [isAddressOpen, setIsAddressOpen] = useState<boolean>(false);
	const [editingLocation, setEditingLocation] = useState<Location | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const isOrgSelected = Boolean(organizationId);
	const searchParams = useSearchParams();
	const editLocationId = searchParams.get('edit')?.trim() ?? null;
	const handledEditRef = React.useRef<string | null>(null);

	// Build query params - only include search if it has a value
	const queryParams = {
		limit: pagination.pageSize,
		offset: pagination.pageIndex * pagination.pageSize,
		...(globalFilter ? { search: globalFilter } : {}),
		...(organizationId ? { organizationId } : {}),
	};

	// Create mutation
	const createMutation = useMutation({
		mutationKey: mutationKeys.locations.create,
		mutationFn: createLocation,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.createSuccess'));
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
			} else {
				toast.error(getLocationErrorMessage(t, result.errorCode, 'toast.createError'));
			}
		},
		onError: () => {
			toast.error(t('toast.createError'));
		},
	});

	// Update mutation
	const updateMutation = useMutation({
		mutationKey: mutationKeys.locations.update,
		mutationFn: updateLocation,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.updateSuccess'));
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
			} else {
				toast.error(getLocationErrorMessage(t, result.errorCode, 'toast.updateError'));
			}
		},
		onError: () => {
			toast.error(t('toast.updateError'));
		},
	});

	// Delete mutation
	const deleteMutation = useMutation({
		mutationKey: mutationKeys.locations.delete,
		mutationFn: deleteLocation,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.deleteSuccess'));
				setDeleteConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
			} else {
				toast.error(getLocationErrorMessage(t, result.errorCode, 'toast.deleteError'));
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
			code: '',
			address: '',
			geographicZone: 'GENERAL',
			timeZone: 'America/Mexico_City',
			latitude: null,
			longitude: null,
		},
		onSubmit: async ({ value }: { value: LocationFormValues }) => {
			let result;
			if (editingLocation) {
				result = await updateMutation.mutateAsync({
					id: editingLocation.id,
					name: value.name,
					code: value.code,
					address: value.address || undefined,
					latitude: value.latitude,
					longitude: value.longitude,
					geographicZone: value.geographicZone,
					timeZone: value.timeZone,
				});
			} else {
				if (!organizationId) {
					toast.error(t('toast.noOrganization'));
					return;
				}
				result = await createMutation.mutateAsync({
					name: value.name,
					code: value.code,
					address: value.address || undefined,
					latitude: value.latitude,
					longitude: value.longitude,
					geographicZone: value.geographicZone,
					timeZone: value.timeZone,
					organizationId,
				});
			}
			// Only close dialog and reset form on successful mutation
			if (result.success) {
				setIsDialogOpen(false);
				setEditingLocation(null);
				form.reset();
			}
		},
	});

	const addressValue = useStore(form.store, (state) => state.values.address);
	const latitudeValue = useStore(form.store, (state) => state.values.latitude);
	const longitudeValue = useStore(form.store, (state) => state.values.longitude);
	const nameValue = useStore(form.store, (state) => state.values.name);
	const debouncedAddress = useDebouncedValue(addressValue, GEOCODE_DEBOUNCE_MS);
	const trimmedAddress = debouncedAddress.trim();
	const canQueryGeocode =
		isDialogOpen && trimmedAddress.length >= GEOCODE_MIN_CHARS && isAddressOpen;

	const {
		data: geocodeSuggestions = [],
		isFetching: isGeocodeFetching,
		error: geocodeError,
	} = useQuery({
		queryKey: queryKeys.geocode.search({ query: trimmedAddress }),
		queryFn: () => fetchGeocodeSuggestions(trimmedAddress),
		enabled: canQueryGeocode,
		staleTime: 5 * 60 * 1000,
	});
	const isGeocodeQueryTooShort =
		trimmedAddress.length > 0 && trimmedAddress.length < GEOCODE_MIN_CHARS;
	const showGeocodeEmpty =
		trimmedAddress.length >= GEOCODE_MIN_CHARS &&
		!isGeocodeFetching &&
		geocodeSuggestions.length === 0 &&
		!geocodeError;
	const hasCoordinates = latitudeValue !== null && longitudeValue !== null;

	/**
	 * Updates the address value while clearing existing coordinates.
	 *
	 * @param value - New address string.
	 * @returns void
	 */
	const handleAddressChange = useCallback(
		(value: string): void => {
			form.setFieldValue('address', value);
			form.setFieldValue('latitude', null);
			form.setFieldValue('longitude', null);
		},
		[form],
	);

	/**
	 * Applies a geocode suggestion to the form values.
	 *
	 * @param suggestion - Selected geocode suggestion.
	 * @returns void
	 */
	const handleGeocodeSelect = useCallback(
		(suggestion: GeocodeSuggestion): void => {
			form.setFieldValue('address', suggestion.displayName);
			form.setFieldValue('latitude', suggestion.lat);
			form.setFieldValue('longitude', suggestion.lng);
			setIsAddressOpen(false);
		},
		[form],
	);

	/**
	 * Updates coordinates based on a map click event.
	 *
	 * @param coords - The selected coordinates.
	 * @returns void
	 */
	const handleMapSelect = useCallback(
		(coords: { latitude: number; longitude: number }): void => {
			form.setFieldValue('latitude', coords.latitude);
			form.setFieldValue('longitude', coords.longitude);
		},
		[form],
	);

	/**
	 * Applies a location record to the form and opens the dialog.
	 *
	 * @param location - Location record to edit.
	 * @returns void
	 */
	const applyLocationToForm = useCallback(
		(location: Location): void => {
			setEditingLocation(location);
			form.setFieldValue('name', location.name);
			form.setFieldValue('code', location.code);
			form.setFieldValue('address', location.address ?? '');
			form.setFieldValue('latitude', location.latitude ?? null);
			form.setFieldValue('longitude', location.longitude ?? null);
			form.setFieldValue('geographicZone', location.geographicZone ?? 'GENERAL');
			form.setFieldValue('timeZone', location.timeZone ?? 'America/Mexico_City');
			setIsAddressOpen(false);
			setIsDialogOpen(true);
		},
		[form],
	);

	/**
	 * Opens the dialog for creating a new location.
	 */
	const handleCreateNew = useCallback((): void => {
		setEditingLocation(null);
		form.reset();
		setIsAddressOpen(false);
		setIsDialogOpen(true);
	}, [form]);

	/**
	 * Opens the dialog for editing an existing location.
	 *
	 * @param location - The location to edit
	 */
	const handleEdit = useCallback(
		(location: Location): void => {
			applyLocationToForm(location);
		},
		[applyLocationToForm],
	);

	/**
	 * Handles form submission for creating or updating a location.
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
	 * Handles open state changes for the location dialog.
	 *
	 * @param open - Whether the dialog should be open.
	 * @returns void
	 */
	const handleDialogOpenChange = useCallback(
		(open: boolean): void => {
			setIsDialogOpen(open);
			if (!open) {
				setEditingLocation(null);
				setIsAddressOpen(false);
				form.reset();
			}
		},
		[form],
	);

	// Query for locations list
	const { data, isFetching } = useQuery({
		queryKey: queryKeys.locations.list(queryParams),
		queryFn: () => fetchLocationsList(queryParams),
		enabled: isOrgSelected,
	});

	const locations = useMemo(() => data?.data ?? [], [data?.data]);
	const totalRows = data?.pagination.total ?? 0;

	const editLocationFromList = useMemo(() => {
		if (!editLocationId) {
			return null;
		}

		return locations.find((location) => location.id === editLocationId) ?? null;
	}, [editLocationId, locations]);

	const { data: editLocationDetail, isFetched: isEditLocationFetched } = useQuery({
		queryKey: queryKeys.locations.detail(editLocationId ?? ''),
		queryFn: () => fetchLocationById(editLocationId ?? ''),
		enabled: Boolean(editLocationId && isOrgSelected),
		staleTime: 5 * 60 * 1000,
	});

	useEffect(() => {
		if (!editLocationId) {
			handledEditRef.current = null;
			return;
		}

		if (handledEditRef.current === editLocationId) {
			return;
		}

		const targetLocation = editLocationFromList ?? editLocationDetail ?? null;

		if (!targetLocation) {
			if (isEditLocationFetched) {
				toast.error(t('toast.errors.notFound'));
				handledEditRef.current = editLocationId;
			}
			return;
		}

		// eslint-disable-next-line react-hooks/set-state-in-effect -- seed form state from edit query param
		applyLocationToForm(targetLocation);
		handledEditRef.current = editLocationId;
	}, [
		applyLocationToForm,
		editLocationDetail,
		editLocationFromList,
		editLocationId,
		isEditLocationFetched,
		t,
	]);

	/**
	 * Handles location deletion.
	 *
	 * @param id - The location ID to delete
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

	const columns = useMemo<ColumnDef<Location>[]>(
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
				cell: ({ row }) => row.original.name,
			},
			{
				accessorKey: 'address',
				header: t('table.headers.address'),
				cell: ({ row }) => row.original.address ?? '-',
			},
			{
				accessorKey: 'geographicZone',
				header: t('table.headers.zone'),
				cell: ({ row }) =>
					t(`zones.${row.original.geographicZone ?? 'GENERAL'}`),
			},
			{
				accessorKey: 'timeZone',
				header: t('table.headers.timeZone'),
				cell: ({ row }) => row.original.timeZone,
			},
			{
				accessorKey: 'createdAt',
				header: t('table.headers.created'),
				cell: ({ row }) =>
					format(new Date(row.original.createdAt), t('dateFormat')),
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
							aria-label={t('dialog.title.edit')}
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
											name: row.original.name,
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
		[deleteConfirmId, handleDelete, handleEdit, t, tCommon],
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
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
					<p className="text-muted-foreground">{t('subtitle')}</p>
				</div>
				<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
					<DialogTrigger asChild>
						<Button onClick={handleCreateNew}>
							<Plus className="mr-2 h-4 w-4" />
							{t('actions.add')}
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[760px]">
						<form onSubmit={handleSubmit}>
							<DialogHeader>
								<DialogTitle>
									{editingLocation
										? t('dialog.title.edit')
										: t('dialog.title.add')}
								</DialogTitle>
								<DialogDescription>
									{editingLocation
										? t('dialog.description.edit')
										: t('dialog.description.add')}
								</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4 py-4">
								<form.AppField
									name="name"
									validators={{
										onChange: ({ value }) =>
											!value.trim()
												? t('validation.nameRequired')
												: undefined,
									}}
								>
									{(field) => <field.TextField label={t('fields.name')} />}
								</form.AppField>
								<form.AppField
									name="code"
									validators={{
										onChange: ({ value }) =>
											!value.trim()
												? t('validation.codeRequired')
												: undefined,
									}}
								>
									{(field) => <field.TextField label={t('fields.code')} />}
								</form.AppField>
								<form.AppField name="geographicZone">
									{(field) => (
										<field.SelectField
											label={t('fields.geographicZone')}
											options={[
												{
													value: 'GENERAL',
													label: t('zonesWithWage.GENERAL'),
												},
												{
													value: 'ZLFN',
													label: t('zonesWithWage.ZLFN'),
												},
											]}
											placeholder={t('placeholders.selectZone')}
										/>
									)}
								</form.AppField>
								<form.AppField
									name="timeZone"
									validators={{
										onChange: ({ value }) =>
											!value.trim()
												? t('validation.timeZoneRequired')
												: undefined,
									}}
								>
									{(field) => (
										<field.TextField
											label={t('fields.timeZone')}
											placeholder={t('placeholders.timeZoneExample')}
										/>
									)}
								</form.AppField>
								<form.AppField name="address">
									{(field) => (
										<div className="grid grid-cols-4 items-start gap-4">
											<Label htmlFor="location-address" className="pt-2 text-right">
												{t('fields.address')}
											</Label>
											<div className="col-span-3 space-y-2">
												<Popover open={isAddressOpen} onOpenChange={setIsAddressOpen}>
													<PopoverTrigger asChild>
														<Button
															variant="outline"
															role="combobox"
															aria-expanded={isAddressOpen}
															className="w-full justify-between text-left"
														>
															{addressValue
																? addressValue
																: t('address.placeholder')}
															<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
														</Button>
													</PopoverTrigger>
													<PopoverContent className="p-0" align="start">
														<Command>
															<CommandInput
																id="location-address"
																name={field.name}
																value={addressValue}
																onValueChange={handleAddressChange}
																onBlur={field.handleBlur}
																placeholder={t('address.searchPlaceholder')}
															/>
															<CommandList>
																{isGeocodeFetching && (
																	<div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
																		<Loader2 className="h-4 w-4 animate-spin" />
																		{t('address.loading')}
																	</div>
																)}
																{isGeocodeQueryTooShort && (
																	<div className="px-3 py-3 text-sm text-muted-foreground">
																		{t('address.minChars', {
																			count: GEOCODE_MIN_CHARS,
																		})}
																	</div>
																)}
																{showGeocodeEmpty && (
																	<CommandEmpty>{t('address.empty')}</CommandEmpty>
																)}
																{geocodeSuggestions.length > 0 && (
																	<CommandGroup heading={t('address.resultsTitle')}>
																		{geocodeSuggestions.map((suggestion) => {
																			const isSelected =
																				suggestion.displayName === addressValue;
																			return (
																				<CommandItem
																					key={`${suggestion.lat}-${suggestion.lng}-${suggestion.displayName}`}
																					value={suggestion.displayName}
																					onSelect={() =>
																						handleGeocodeSelect(suggestion)
																					}
																				>
																					<Check
																						className={`h-4 w-4 ${isSelected ? 'opacity-100' : 'opacity-0'}`}
																					/>
																					<span className="text-sm">
																						{suggestion.displayName}
																					</span>
																				</CommandItem>
																			);
																		})}
																	</CommandGroup>
																)}
															</CommandList>
														</Command>
													</PopoverContent>
												</Popover>
												{geocodeError && (
													<p className="text-xs text-destructive">
														{t('address.error')}
													</p>
												)}
												{field.state.meta.errors.length > 0 && (
													<p className="text-sm text-destructive">
														{field.state.meta.errors.join(', ')}
													</p>
												)}
											</div>
										</div>
									)}
								</form.AppField>
								<div className="grid grid-cols-4 items-start gap-4">
									<Label className="pt-2 text-right">{t('mapPicker.title')}</Label>
									<div className="col-span-3 space-y-2">
										<LocationMapPicker
											latitude={latitudeValue}
											longitude={longitudeValue}
											name={nameValue ?? ''}
											onSelect={handleMapSelect}
										/>
										<p className="text-xs text-muted-foreground">
											{t('mapPicker.helper')}
										</p>
										<p className="text-xs text-muted-foreground">
											{hasCoordinates
												? t('mapPicker.coordinates', {
														lat: latitudeValue?.toFixed(5) ?? '',
														lng: longitudeValue?.toFixed(5) ?? '',
												  })
												: t('mapPicker.coordinatesEmpty')}
										</p>
									</div>
								</div>
							</div>
							<DialogFooter>
								<form.AppForm>
									<form.SubmitButton
										label={tCommon('save')}
										loadingLabel={tCommon('saving')}
									/>
								</form.AppForm>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			</div>

			<DataTable
				columns={columns}
				data={locations}
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
