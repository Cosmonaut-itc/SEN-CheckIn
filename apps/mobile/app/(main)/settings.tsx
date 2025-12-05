import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
	Modal,
	ScrollView,
	Text,
	TouchableOpacity,
	TouchableWithoutFeedback,
	View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Divider } from 'heroui-native';
import { useRouter } from 'expo-router';

import { useTheme } from '@/providers/theme-provider';
import { useAppForm } from '@/lib/forms';
import { queryKeys } from '@/lib/query-keys';
import { fetchLocationsList } from '@/lib/client-functions';
import { useDeviceContext } from '@/lib/device-context';
import { useAuthContext } from '@/providers/auth-provider';
import { signOut } from '@/lib/auth-client';

/**
 * Settings screen for configuring device metadata and linkage.
 *
 * @returns JSX Element that renders the device settings form and navigation controls
 */
export default function SettingsScreen(): JSX.Element {
	const router = useRouter();
	const { isDarkMode } = useTheme();
	const { session } = useAuthContext();
	const {
		settings,
		isHydrated,
		isUpdating,
		saveRemoteSettings,
		updateLocalSettings,
		clearSettings,
	} = useDeviceContext();

	const { data: locationsResponse, isPending: isLocationsPending } = useQuery({
		queryKey: queryKeys.locations.list({ limit: 100 }),
		queryFn: () => fetchLocationsList({ limit: 100 }),
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

	const form = useAppForm({
		defaultValues: {
			name: settings?.name ?? '',
			locationId: settings?.locationId ?? '',
		},
		onSubmit: async ({ value }) => {
			if (!settings?.deviceId) {
				return;
			}

			const updated = await saveRemoteSettings({
				name: value.name,
				locationId: value.locationId || undefined,
			});

			if (updated) {
				await updateLocalSettings({
					name: updated.name,
					locationId: updated.locationId,
					organizationId: updated.organizationId,
					deviceId: updated.deviceId,
				});
			}
		},
	});

	useEffect(() => {
		if (!settings) return;
		form.setFieldValue('name', settings.name);
		form.setFieldValue('locationId', settings.locationId ?? '');
	}, [form, settings]);

	const organizationId = session?.session?.activeOrganizationId ?? '—';
	const organizationName = (session as any)?.session?.organization?.name ?? 'Organization';

	return (
		<ScrollView
			className="flex-1 bg-background px-4 pt-10"
			contentInsetAdjustmentBehavior="automatic"
			showsVerticalScrollIndicator={false}
		>
			<View className="mb-6 gap-3">
				<Button
					size="sm"
					variant="shadow"
					className={`self-start px-4 ${
						isDarkMode ? 'bg-white' : 'bg-black'
					} rounded-xl border border-default-200`}
					onPress={() => router.replace('/(main)/scanner')}
				>
					<Button.Label className={isDarkMode ? 'text-black' : 'text-white'}>
						← Back to Scanner
					</Button.Label>
				</Button>
				<View className="gap-1">
					<Text className="text-3xl font-extrabold text-foreground">Device Settings</Text>
					<Text className="text-base text-foreground-500">
						Configure this kiosk before scanning. Organization context comes from your
						session.
					</Text>
				</View>
			</View>

			<Card className="p-5 gap-3 mb-4 border border-default-200 bg-content1">
				<Text className="text-xs text-foreground-400 uppercase tracking-wide">
					Organization
				</Text>
				<Text className="text-lg font-semibold text-foreground">{organizationName}</Text>
				<Text
					className="text-foreground-500 font-mono text-sm"
					numberOfLines={1}
					ellipsizeMode="middle"
				>
					ID: {organizationId}
				</Text>
			</Card>

			<Card className="p-5 gap-5 mb-10 border border-default-200 bg-content1">
				<form.AppField
					name="name"
					validators={{
						onChange: ({ value }) => (!value.trim() ? 'Name is required' : undefined),
					}}
				>
					{(field) => (
						<field.TextField
							label="Device name"
							placeholder="Front desk tablet"
							description="Shown in dashboards and audit logs."
						/>
					)}
				</form.AppField>

				<form.AppField name="locationId">
					{(field) => {
						const selectedOption = locationOptions.find(
							(opt) => opt.value === field.state.value,
						);
						const displayText =
							selectedOption?.label ??
							(isLocationsPending ? 'Loading locations...' : 'Select location');
						const hasError = field.state.meta.errors.length > 0;

						return (
							<View className="gap-1.5">
								<Text className="text-sm font-semibold text-foreground tracking-wide">
									Location
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
																	field.handleChange(opt.value);
																	setIsLocationPickerOpen(false);
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
					<form.SubmitButton
						label={settings?.deviceId ? 'Save changes' : 'Link device first'}
						loadingLabel="Saving..."
						className="mt-2"
					/>
				</form.AppForm>

				<View className="gap-1">
					<Text className="text-sm text-foreground-500">Device ID</Text>
					<Text
						className="text-foreground font-mono text-sm"
						numberOfLines={1}
						ellipsizeMode="middle"
					>
						{settings?.deviceId ?? 'Not set. Use login screen.'}
					</Text>
					{!isHydrated ? (
						<Text className="text-foreground-500">Loading saved device settings…</Text>
					) : null}
				</View>

				<Divider />

				<View className="flex-row gap-3">
					<Button
						variant="destructive"
						className="flex-1"
						isDisabled={isUpdating}
						onPress={async () => {
							await signOut();
							await clearSettings();
						}}
					>
						<Button.Label>Sign out</Button.Label>
					</Button>
					<Button variant="secondary" className="flex-1" onPress={() => clearSettings()}>
						<Button.Label>Clear device cache</Button.Label>
					</Button>
				</View>
			</Card>
		</ScrollView>
	);
}
