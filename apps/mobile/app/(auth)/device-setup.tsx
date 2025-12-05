import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, type JSX } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Divider, Spinner } from 'heroui-native';
import * as ExpoDevice from 'expo-device';

import { useAppForm } from '@/lib/forms';
import { queryKeys } from '@/lib/query-keys';
import { fetchLocationsList, updateDeviceSettings } from '@/lib/client-functions';
import { useDeviceContext } from '@/lib/device-context';
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
	return Array.isArray(value) ? value[0] ?? null : value;
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
		() => settings?.name || ExpoDevice.deviceName || ExpoDevice.modelName || 'Attendance Device',
		[settings?.name],
	);

	const { data: locationsResponse, isPending: isLocationsPending } = useQuery({
		queryKey: queryKeys.locations.list({ organizationId: organizationId ?? undefined }),
		queryFn: () => fetchLocationsList({ limit: 200, organizationId: organizationId ?? undefined }),
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
				<Card className="p-6 w-full max-w-md items-center gap-3">
					<Text className="text-2xl font-bold text-foreground">Device not found</Text>
					<Text className="text-foreground-500 text-center">
						We could not determine a device to configure. Please return to login and try again.
					</Text>
					<Button className="w-full" onPress={() => router.replace('/(auth)/login')}>
						<Button.Label>Back to Login</Button.Label>
					</Button>
				</Card>
			</View>
		);
	}

	return (
		<ScrollView className="flex-1 bg-gradient-to-b from-background via-background to-background px-5 pt-12">
			<View className="gap-4 max-w-3xl w-full self-center">
				<View className="gap-2">
					<Text className="text-3xl font-bold text-foreground">Set up this device</Text>
					<Text className="text-foreground-500 text-base leading-6">
						Name your terminal and assign a location so attendance records stay organized. This step only appears the first time a device is registered.
					</Text>
				</View>

				<Card className="p-5 gap-5 bg-content1/80 border border-default-200">
					<View className="flex-row items-center justify-between">
						<View className="gap-1">
							<Text className="text-sm uppercase tracking-wide text-foreground-400">
								Device ID
							</Text>
							<Text className="text-foreground font-semibold">{deviceId}</Text>
						</View>
						<View className="items-end">
							<Text className="text-sm text-foreground-500">Organization</Text>
							<Text className="text-foreground font-medium">
								{organizationId ?? 'Not set'}
							</Text>
						</View>
					</View>
					<Divider />

					<form.AppField
						name="name"
						validators={{
							onChange: ({ value }) => (!value.trim() ? 'Name is required' : undefined),
						}}
					>
						{(field) => (
							<field.TextField
								label="Device name"
								placeholder="Front desk kiosk"
								description="Pick a clear label so admins can recognize this device."
							/>
						)}
					</form.AppField>

					<form.AppField
						name="locationId"
						validators={{
							onChange: ({ value }) => (!value ? 'Location is required' : undefined),
						}}
					>
						{(field) => (
							<field.SelectField
								label="Location"
								placeholder={isLocationsPending ? 'Loading locations…' : 'Select a location'}
								options={locationOptions}
								disabled={isLocationsPending}
							/>
						)}
					</form.AppField>

					<form.AppForm>
						<Button
							className="mt-2"
							size="lg"
							isDisabled={isLocationsPending}
							onPress={handleSubmit}
						>
							{isLocationsPending ? (
								<View className="flex-row items-center gap-2">
									<Spinner size="sm" />
									<Button.Label>Loading…</Button.Label>
								</View>
							) : (
								<Button.Label>Save and continue</Button.Label>
							)}
						</Button>
					</form.AppForm>
				</Card>

				<View className="p-4 bg-content2/70 rounded-2xl border border-default-200">
					<Text className="text-sm text-foreground-500">
						Tip: If this device moves to another site later, visit Settings to update its location and name. Heartbeats keep its status online while the app is active.
					</Text>
				</View>
			</View>
		</ScrollView>
	);
}
