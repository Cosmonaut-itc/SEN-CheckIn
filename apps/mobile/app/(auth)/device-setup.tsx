import { useQuery } from '@tanstack/react-query';
import * as ExpoDevice from 'expo-device';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Select, Spinner } from 'heroui-native';
import { type JSX, useCallback, useEffect, useMemo, useState } from 'react';
import {
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	Text,
	View,
	type ViewStyle,
} from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { fetchLocationsList, updateDeviceSettings } from '@/lib/client-functions';
import { useDeviceContext } from '@/lib/device-context';
import { useAppForm } from '@/lib/forms';
import { i18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import { BODY_TEXT_CLASS_NAME } from '@/lib/typography';
import { useAuthContext } from '@/providers/auth-provider';

type SearchParams = {
	deviceId?: string | string[];
	organizationId?: string | string[];
};

type SetupFormValues = {
	name: string;
	locationId: string;
};
const LOCATION_OPTIONS_MAX_HEIGHT = 320;

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
 * @returns {JSX.Element} Device setup screen content
 */
export default function DeviceSetupScreen(): JSX.Element {
	const router = useRouter();
	const { session } = useAuthContext();
	const { settings, updateLocalSettings } = useDeviceContext();
	const params = useLocalSearchParams<SearchParams>();
	const keyboardVerticalOffset = Platform.OS === 'ios' ? 24 : 0;
	const [submissionError, setSubmissionError] = useState<string | null>(null);
	const [dangerColor, primaryColor, warningColor] = useThemeColor([
		'destructive',
		'primary',
		'warning',
	]);

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
	const continuousCurve = useMemo(() => ({ borderCurve: 'continuous' }) satisfies ViewStyle, []);

	const defaultName = useMemo(
		() =>
			settings?.name ||
			ExpoDevice.deviceName ||
			ExpoDevice.modelName ||
			i18n.t('DeviceSetup.defaults.deviceName'),
		[settings?.name],
	);

	const {
		data: locationsResponse,
		isError: isLocationsError,
		isPending: isLocationsPending,
	} = useQuery({
		queryKey: queryKeys.locations.list({ organizationId: organizationId ?? undefined }),
		queryFn: () =>
			fetchLocationsList({ limit: 100, organizationId: organizationId ?? undefined }),
		enabled: Boolean(deviceId && organizationId),
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
			setSubmissionError(null);
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
		try {
			await form.handleSubmit();
		} catch {
			setSubmissionError(i18n.t('DeviceSetup.form.errors.saveFailed'));
		}
	}, [form]);

	/**
	 * Route back to login from the fallback missing-device state.
	 *
	 * @returns {void} No return value
	 */
	const handleBackToLogin = useCallback((): void => {
		router.replace('/(auth)/login');
	}, [router]);

	if (!deviceId) {
		return (
			<KeyboardAvoidingView
				className="flex-1 bg-background"
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				keyboardVerticalOffset={keyboardVerticalOffset}
			>
				<ScrollView
					className="flex-1 bg-background"
					contentInsetAdjustmentBehavior="automatic"
					contentContainerClassName="flex-1 items-center justify-center px-6"
					keyboardShouldPersistTaps="handled"
					showsVerticalScrollIndicator={false}
				>
					<Card
						variant="default"
						className="p-8 w-full max-w-md items-center gap-5 rounded-xl"
						style={continuousCurve}
					>
						{/* Error Icon */}
						<View className="w-16 h-16 rounded-full bg-danger-500/10 items-center justify-center">
							<IconSymbol
								name="exclamationmark.triangle.fill"
								size={28}
								color={dangerColor}
							/>
						</View>
						<View className="gap-2 items-center">
							<Text className="text-2xl font-bold text-foreground text-center">
								{i18n.t('DeviceSetup.errors.deviceNotFound.title')}
							</Text>
							<Text
								className={`${BODY_TEXT_CLASS_NAME} text-foreground-400 text-center leading-6`}
							>
								{i18n.t('DeviceSetup.errors.deviceNotFound.description')}
							</Text>
						</View>
						<Button className="w-full" size="lg" onPress={handleBackToLogin}>
							<Button.Label>
								{i18n.t('DeviceSetup.errors.deviceNotFound.backToLogin')}
							</Button.Label>
						</Button>
					</Card>
				</ScrollView>
			</KeyboardAvoidingView>
		);
	}

	return (
		<KeyboardAvoidingView
			className="flex-1 bg-background"
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			keyboardVerticalOffset={keyboardVerticalOffset}
		>
			<ScrollView
				className="flex-1 bg-background"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerClassName="px-5 pt-6 pb-10"
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
			>
				<View className="gap-8 max-w-lg w-full self-center">
					{/* Header Section */}
					<View className="gap-3">
						<View className="flex-row items-center gap-3">
							<View
								className="w-12 h-12 rounded-xl bg-primary/10 items-center justify-center"
								style={continuousCurve}
							>
								<IconSymbol name="iphone" size={20} color={primaryColor} />
							</View>
							<View className="flex-1">
								<Text className="text-xs uppercase tracking-widest text-primary font-bold">
									{i18n.t('DeviceSetup.header.kicker')}
								</Text>
							</View>
						</View>
						<Text className={`${BODY_TEXT_CLASS_NAME} text-foreground-400 leading-6`}>
							{i18n.t('DeviceSetup.header.subtitle')}
						</Text>
					</View>

					{/* Device Info Badge */}
					<View className="flex-row gap-3">
						<View
							className="flex-1 p-4 bg-content1 rounded-lg border border-default-200 gap-1"
							style={continuousCurve}
						>
							<Text className="text-xs uppercase tracking-widest text-foreground-400 font-semibold">
								{i18n.t('DeviceSetup.deviceInfo.deviceId')}
							</Text>
							<Text
								className="text-foreground font-mono text-sm"
								numberOfLines={1}
								ellipsizeMode="middle"
								selectable
							>
								{deviceId}
							</Text>
						</View>
						<View
							className="flex-1 p-4 bg-content1 rounded-lg border border-default-200 gap-1"
							style={continuousCurve}
						>
							<Text className="text-xs uppercase tracking-widest text-foreground-400 font-semibold">
								{i18n.t('DeviceSetup.deviceInfo.organization')}
							</Text>
							<Text
								className="text-foreground font-mono text-sm"
								numberOfLines={1}
								ellipsizeMode="middle"
								selectable
							>
								{organizationId ?? '—'}
							</Text>
						</View>
					</View>

					{/* Form Card */}
					<Card
						variant="default"
						className="p-6 gap-6 rounded-xl"
						style={continuousCurve}
					>
						<form.AppField
							name="name"
							validators={{
								onChange: ({ value }) =>
									!value.trim()
										? i18n.t('DeviceSetup.form.validation.nameRequired')
										: undefined,
							}}
						>
							{(field) => (
								<field.TextField
									label={i18n.t('DeviceSetup.form.fields.name.label')}
									placeholder={i18n.t('DeviceSetup.form.fields.name.placeholder')}
									description={i18n.t('DeviceSetup.form.fields.name.description')}
								/>
							)}
						</form.AppField>

						{/* Location Select using HeroUI Native Select */}
						<form.AppField
							name="locationId"
							validators={{
								onChange: ({ value }) =>
									!value
										? i18n.t('DeviceSetup.form.validation.locationRequired')
										: undefined,
							}}
						>
							{(field) => {
								const selectedOption = locationOptions.find(
									(opt) => opt.value === field.state.value,
								);
								const hasError = field.state.meta.errors.length > 0;
								const locationTriggerLabel = isLocationsPending
									? i18n.t('DeviceSetup.form.fields.location.loading')
									: isLocationsError
										? i18n.t('DeviceSetup.form.fields.location.loadError')
										: i18n.t('DeviceSetup.form.fields.location.placeholder');

								/**
								 * Handles location selection from the HeroUI Native Select component.
								 *
								 * @param option - The selected option object
								 */
								const handleLocationChange = (option: {
									value: string;
									label: string;
								}): void => {
									field.handleChange(option.value);
								};

								return (
									<View className="gap-1.5">
										<Text className="text-sm font-semibold text-foreground tracking-wide">
											{i18n.t('DeviceSetup.form.fields.location.label')}
										</Text>
										<Select
											value={selectedOption}
											onValueChange={handleLocationChange}
											isDisabled={isLocationsPending || isLocationsError}
											presentation="popover"
										>
											<Select.Trigger
												accessibilityLabel={`${i18n.t(
													'DeviceSetup.form.fields.location.accessibilityLabel',
												)}: ${selectedOption?.label ?? locationTriggerLabel}`}
												accessibilityHint={i18n.t(
													'DeviceSetup.form.fields.location.accessibilityHint',
												)}
											>
												<Select.Value placeholder={locationTriggerLabel} />
												<Select.TriggerIndicator />
											</Select.Trigger>
											<Select.Portal>
												<Select.Overlay className="bg-overlay/80" />
												<Select.Content
													presentation="popover"
													width="trigger"
													placement="bottom"
													className="bg-popover gap-2 shadow-lg"
													style={continuousCurve}
												>
													<Select.ListLabel className="text-base font-semibold text-foreground">
														{i18n.t(
															'DeviceSetup.form.fields.location.label',
														)}
													</Select.ListLabel>
													{isLocationsError ? (
														<View className="py-4">
															<Text className="text-danger-500 text-center">
																{i18n.t(
																	'DeviceSetup.form.fields.location.loadError',
																)}
															</Text>
														</View>
													) : locationOptions.length === 0 ? (
														<View className="py-4">
															<Text className="text-foreground-400 text-center">
																{i18n.t(
																	'DeviceSetup.form.fields.location.empty',
																)}
															</Text>
														</View>
													) : (
														<ScrollView
															nestedScrollEnabled
															showsVerticalScrollIndicator={
																locationOptions.length > 6
															}
															testID="device-setup-location-options-scroll"
															style={{
																maxHeight:
																	LOCATION_OPTIONS_MAX_HEIGHT,
															}}
														>
															{locationOptions.map((opt) => (
																<Select.Item
																	key={opt.value}
																	value={opt.value}
																	label={opt.label}
																/>
															))}
														</ScrollView>
													)}
												</Select.Content>
											</Select.Portal>
										</Select>
										{hasError ? (
											<Text
												className="text-sm text-danger-500 font-medium"
												selectable
											>
												{field.state.meta.errors.join(', ')}
											</Text>
										) : null}
									</View>
								);
							}}
						</form.AppField>

						<form.AppForm>
							<Button
								size="lg"
								variant="primary"
								isDisabled={isLocationsPending || isLocationsError}
								onPress={handleSubmit}
							>
								{isLocationsPending ? (
									<View className="flex-row items-center gap-2">
										<Spinner size="sm" color="white" />
										<Button.Label className="text-white font-semibold">
											{i18n.t('Common.loading')}
										</Button.Label>
									</View>
								) : (
									<Button.Label className="text-white font-semibold">
										{i18n.t('DeviceSetup.form.actions.saveAndContinue')}
									</Button.Label>
								)}
							</Button>
						</form.AppForm>
						{submissionError ? (
							<Text className="text-sm text-danger-500 font-medium" selectable>
								{submissionError}
							</Text>
						) : null}
					</Card>

					{/* Tip Section */}
					<View
						className="p-5 bg-content2/60 rounded-xl border border-default-200/60"
						style={continuousCurve}
					>
						<View className="flex-row items-start gap-3">
							<IconSymbol name="lightbulb.fill" size={18} color={warningColor} />
							<View className="flex-1 gap-1">
								<Text className="text-sm font-semibold text-foreground">
									{i18n.t('DeviceSetup.tip.title')}
								</Text>
								<Text
									className={`${BODY_TEXT_CLASS_NAME} text-foreground-400 leading-5`}
								>
									{i18n.t('DeviceSetup.tip.body')}
								</Text>
							</View>
						</View>
					</View>
				</View>
			</ScrollView>
		</KeyboardAvoidingView>
	);
}
