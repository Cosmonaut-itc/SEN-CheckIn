import { useQuery } from '@tanstack/react-query';
import * as ExpoDevice from 'expo-device';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Spinner } from 'heroui-native';
import { type JSX, useCallback, useEffect, useMemo, useState } from 'react';
import {
	Modal,
	ScrollView,
	Text,
	TouchableOpacity,
	TouchableWithoutFeedback,
	View,
} from 'react-native';

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

	// State for location picker modal
	const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);

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
				<Card className="p-8 w-full max-w-md items-center gap-5 rounded-3xl border border-default-200 bg-content1">
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
				<Card className="p-6 gap-6 bg-content1 border border-default-200 rounded-3xl">
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

					{/* Simple Location Picker */}
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
							const displayText =
								selectedOption?.label ??
								(isLocationsPending ? 'Loading locations…' : 'Choose a location');
							const hasError = field.state.meta.errors.length > 0;

							return (
								<View className="gap-1.5">
									<Text className="text-sm font-semibold text-foreground tracking-wide">
										Assigned Location
									</Text>
									<TouchableOpacity
										activeOpacity={0.82}
										className="border border-default-200 rounded-xl px-4 py-3.5 bg-content1"
										disabled={isLocationsPending}
										onPress={() => setIsLocationPickerOpen(true)}
									>
										<Text
											className={`text-base ${
												selectedOption
													? 'text-foreground'
													: 'text-foreground-400'
											}`}
										>
											{displayText}
										</Text>
									</TouchableOpacity>
									{hasError ? (
										<Text className="text-sm text-danger-500 font-medium">
											{field.state.meta.errors.join(', ')}
										</Text>
									) : null}

									{/* Location Picker Modal */}
									<Modal
										transparent
										animationType="fade"
										visible={isLocationPickerOpen}
										onRequestClose={() => setIsLocationPickerOpen(false)}
									>
										<View className="flex-1 bg-black/50 px-6 justify-center">
											<TouchableWithoutFeedback
												onPress={() => setIsLocationPickerOpen(false)}
											>
												<View className="absolute inset-0" />
											</TouchableWithoutFeedback>

											<View
												className="bg-background rounded-2xl p-4"
												style={{ maxHeight: '70%' }}
											>
												<Text className="text-base font-semibold text-foreground mb-3">
													Select Location
												</Text>
												<ScrollView keyboardShouldPersistTaps="handled">
													{locationOptions.length === 0 ? (
														<Text className="text-foreground-400 py-4 text-center">
															No locations available
														</Text>
													) : (
														locationOptions.map((opt) => {
															const isSelected =
																opt.value === field.state.value;
															return (
																<TouchableOpacity
																	key={opt.value}
																	activeOpacity={0.85}
																	className={`py-3 px-3 rounded-xl mb-1 flex-row items-center justify-between ${
																		isSelected
																			? 'bg-primary/10'
																			: ''
																	}`}
																	onPress={() => {
																		field.handleChange(
																			opt.value,
																		);
																		setIsLocationPickerOpen(
																			false,
																		);
																	}}
																>
																	<Text
																		className={`text-base ${
																			isSelected
																				? 'text-primary font-semibold'
																				: 'text-foreground'
																		}`}
																	>
																		{opt.label}
																	</Text>
																	{isSelected ? (
																		<Text className="text-primary font-bold">
																			✓
																		</Text>
																	) : null}
																</TouchableOpacity>
															);
														})
													)}
												</ScrollView>
												<TouchableOpacity
													activeOpacity={0.85}
													className="mt-3 py-3 rounded-xl border border-default-200 items-center"
													onPress={() => setIsLocationPickerOpen(false)}
												>
													<Text className="text-foreground font-semibold">
														Cancel
													</Text>
												</TouchableOpacity>
											</View>
										</View>
									</Modal>
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
