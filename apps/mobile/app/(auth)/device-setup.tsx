import { useQuery } from '@tanstack/react-query';
import * as ExpoDevice from 'expo-device';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Select, Spinner } from 'heroui-native';
import { type JSX, useCallback, useEffect, useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { fetchLocationsList, updateDeviceSettings } from '@/lib/client-functions';
import { useDeviceContext } from '@/lib/device-context';
import { useAppForm } from '@/lib/forms';
import { queryKeys } from '@/lib/query-keys';
import { useAuthContext } from '@/providers/auth-provider';

type SearchParams = {
	deviceId?: string | string[];
	organizationId?: string | string[];
};

type SetupFormValues = {
	name: string;
	locationId: string;
};

/**
 * Normalize a possibly array-based router param to a string.
 *
 * @param value - Param value from router search params
 * @returns Single string or null when absent
 */
function normalizeParam(value: string | string[] | undefined): string | null {
	if (!value) return null;
	return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Device setup screen shown immediately after registration when a device lacks a location.
 * Collects a friendly name and required location before entering the scanner.
 *
 * @returns Device setup JSX element
 */
export default function DeviceSetupScreen(): JSX.Element {
	const router = useRouter();
	const { session } = useAuthContext();
	const { settings, updateLocalSettings } = useDeviceContext();
	const params = useLocalSearchParams<SearchParams>();

	const deviceId = useMemo(
		() => normalizeParam(params.deviceId) ?? settings?.deviceId ?? null,
		[params.deviceId, settings?.deviceId],
	);
	const organizationId = useMemo(
		() =>
			normalizeParam(params.organizationId) ??
			settings?.organizationId ??
			session?.session?.activeOrganizationId ??
			null,
		[params.organizationId, session?.session?.activeOrganizationId, settings?.organizationId],
	);

	const defaultName = useMemo(
		() =>
			settings?.name || ExpoDevice.deviceName || ExpoDevice.modelName || 'Attendance Device',
		[settings?.name],
	);

	const { data: locationsResponse, isPending: isLocationsPending } = useQuery({
		queryKey: queryKeys.locations.list({ organizationId: organizationId ?? undefined }),
		queryFn: () =>
			fetchLocationsList({ limit: 100, organizationId: organizationId ?? undefined }),
		enabled: Boolean(organizationId),
	});

	const locationOptions = useMemo(
		() =>
			(locationsResponse?.data ?? []).map((loc) => ({
				value: loc.id,
				label: loc.name || loc.code,
			})),
		[locationsResponse?.data],
	);

	/**
	 * Submit handler that updates device metadata and persists it locally.
	 *
	 * @param input - Form payload containing name and location ID
	 * @returns Promise resolving when the device is updated and navigation occurs
	 * @throws Error bubbles from updateDeviceSettings when the API call fails
	 */
	const handleFormSubmit = useCallback(
		async ({ value }: { value: SetupFormValues }) => {
			if (!deviceId || !value.name || !value.locationId) {
				return;
			}

			const updated = await updateDeviceSettings(deviceId, {
				name: value.name,
				locationId: value.locationId,
			});

			await updateLocalSettings({
				deviceId,
				name: updated.name ?? value.name,
				locationId: updated.locationId ?? value.locationId,
				organizationId: updated.organizationId ?? organizationId,
			});

			router.replace('/(main)/scanner');
		},
		[deviceId, organizationId, router, updateLocalSettings],
	);

	const form = useAppForm({
		defaultValues: {
			name: defaultName,
			locationId: settings?.locationId ?? '',
		},
		onSubmit: handleFormSubmit,
	});

	useEffect(() => {
		if (defaultName) {
			form.setFieldValue('name', defaultName);
		}
		if (settings?.locationId) {
			form.setFieldValue('locationId', settings.locationId);
		}
	}, [defaultName, form, settings?.locationId]);

	/**
	 * Handle explicit submission of the setup form.
	 *
	 * @returns Promise that resolves after submit is processed
	 */
	const handleSubmit = useCallback(async () => {
		await form.handleSubmit();
	}, [form]);

	if (!deviceId) {
		return (
			<View className="flex-1 bg-background items-center justify-center px-6">
				<Card variant="default" className="p-8 w-full max-w-md items-center gap-5 rounded-3xl">
					{/* Error Icon */}
					<View className="w-16 h-16 rounded-full bg-danger-500/10 items-center justify-center">
						<Text className="text-3xl">⚠️</Text>
					</View>
					<View className="gap-2 items-center">
						<Text className="text-2xl font-bold text-foreground text-center">
							Device not found
						</Text>
						<Text className="text-foreground-400 text-center text-base leading-6">
							We could not determine a device to configure. Please return to login and
							try again.
						</Text>
					</View>
					<Button
						className="w-full mt-2"
						size="lg"
						onPress={() => router.replace('/(auth)/login')}
					>
						<Button.Label>Back to Login</Button.Label>
					</Button>
				</Card>
			</View>
		);
	}

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentContainerClassName="px-5 pt-14 pb-10"
			showsVerticalScrollIndicator={false}
		>
			<View className="gap-8 max-w-lg w-full self-center">
				{/* Header Section */}
				<View className="gap-3">
					<View className="flex-row items-center gap-3 mb-1">
						<View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center">
							<Text className="text-2xl">📱</Text>
						</View>
						<View className="flex-1">
							<Text className="text-xs uppercase tracking-widest text-primary font-bold">
								Device Setup
							</Text>
						</View>
					</View>
					<Text className="text-3xl font-extrabold text-foreground tracking-tight">
						Configure Terminal
					</Text>
					<Text className="text-foreground-400 text-base leading-6">
						Name this device and assign it to a location. Attendance records will be
						linked to the selected location.
					</Text>
				</View>

				{/* Device Info Badge */}
				<View className="flex-row gap-3">
					<View className="flex-1 p-4 bg-content1 rounded-2xl border border-default-200">
						<Text className="text-xs uppercase tracking-widest text-foreground-400 font-semibold mb-1">
							Device ID
						</Text>
						<Text
							className="text-foreground font-mono text-sm"
							numberOfLines={1}
							ellipsizeMode="middle"
						>
							{deviceId}
						</Text>
					</View>
					<View className="flex-1 p-4 bg-content1 rounded-2xl border border-default-200">
						<Text className="text-xs uppercase tracking-widest text-foreground-400 font-semibold mb-1">
							Organization
						</Text>
						<Text
							className="text-foreground font-mono text-sm"
							numberOfLines={1}
							ellipsizeMode="middle"
						>
							{organizationId ?? '—'}
						</Text>
					</View>
				</View>

				{/* Form Card */}
				<Card variant="default" className="p-6 gap-6 rounded-3xl">
					<form.AppField
						name="name"
						validators={{
							onChange: ({ value }) =>
								!value.trim() ? 'Name is required' : undefined,
						}}
					>
						{(field) => (
							<field.TextField
								label="Device Name"
								placeholder="e.g., Front Desk Kiosk"
								description="A memorable name helps admins identify this terminal."
							/>
						)}
					</form.AppField>

					{/* Location Select using HeroUI Native Select */}
					<form.AppField
						name="locationId"
						validators={{
							onChange: ({ value }) => (!value ? 'Location is required' : undefined),
						}}
					>
						{(field) => {
							const selectedOption = locationOptions.find(
								(opt) => opt.value === field.state.value,
							);
							const hasError = field.state.meta.errors.length > 0;

							/**
							 * Handles location selection from the HeroUI Native Select component.
							 *
							 * @param option - The selected option object or null when cleared
							 */
							const handleLocationChange = (
								option: { value: string; label: string } | null,
							): void => {
								if (option?.value) {
									field.handleChange(option.value);
								}
							};

							return (
								<View className="gap-1.5">
									<Text className="text-sm font-semibold text-foreground tracking-wide">
										Assigned Location
									</Text>
									<Select
										value={selectedOption}
										onValueChange={handleLocationChange}
										isDisabled={isLocationsPending}
									>
										<Select.Trigger asChild>
											<Button variant="tertiary" size="sm">
												{selectedOption ? (
													<View className="flex-row items-center gap-2">
														<Text className="text-sm text-foreground">
															{selectedOption.label}
														</Text>
													</View>
												) : (
													<Text className="text-foreground">
														{isLocationsPending
															? 'Loading locations…'
															: 'Choose a location'}
													</Text>
												)}
											</Button>
										</Select.Trigger>
										<Select.Portal>
											<Select.Overlay />
											<Select.Content
												width={280}
												className="rounded-2xl"
												placement="bottom"
											>
												{locationOptions.length === 0 ? (
													<View className="py-4">
														<Text className="text-foreground-400 text-center">
															No locations available
														</Text>
													</View>
												) : (
													<ScrollView>
														{locationOptions.map((opt) => (
															<Select.Item
																key={opt.value}
																value={opt.value}
																label={opt.label}
															>
																<View className="flex-row items-center gap-3 flex-1">
																	<Text className="text-base text-foreground flex-1">
																		{opt.label}
																	</Text>
																</View>
																<Select.ItemIndicator />
															</Select.Item>
														))}
													</ScrollView>
												)}
											</Select.Content>
										</Select.Portal>
									</Select>
									{hasError ? (
										<Text className="text-sm text-danger-500 font-medium">
											{field.state.meta.errors.join(', ')}
										</Text>
									) : null}
								</View>
							);
						}}
					</form.AppField>

					<form.AppForm>
						<Button
							className="mt-3"
							size="lg"
							variant="primary"
							isDisabled={isLocationsPending}
							onPress={handleSubmit}
						>
							{isLocationsPending ? (
								<View className="flex-row items-center gap-2">
									<Spinner size="sm" color="white" />
									<Button.Label className="text-white font-semibold">
										Loading…
									</Button.Label>
								</View>
							) : (
								<Button.Label className="text-white font-semibold">
									Save & Continue
								</Button.Label>
							)}
						</Button>
					</form.AppForm>
				</Card>

				{/* Tip Section */}
				<View className="p-5 bg-content2/60 rounded-2xl border border-default-200/60">
					<View className="flex-row items-start gap-3">
						<Text className="text-lg">💡</Text>
						<View className="flex-1">
							<Text className="text-sm font-semibold text-foreground mb-1">
								Pro Tip
							</Text>
							<Text className="text-sm text-foreground-400 leading-5">
								If this device moves to another site later, visit Settings to update
								its location. The app sends heartbeats to keep the device status
								online.
							</Text>
						</View>
					</View>
				</View>
			</View>
		</ScrollView>
	);
}
