import { useQuery } from '@tanstack/react-query';
import { type Href, useNavigation, useRouter } from 'expo-router';
import { Button, Card, Select, Separator, useThemeColor, useToast } from 'heroui-native';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import {
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	Text,
	View,
	type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { clearAuthStorage, signOut } from '@/lib/auth-client';
import { fetchLocationsList } from '@/lib/client-functions';
import { useDeviceContext } from '@/lib/device-context';
import { useAppForm } from '@/lib/forms';
import { i18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import { BODY_TEXT_CLASS_NAME } from '@/lib/typography';
import { useAuthContext } from '@/providers/auth-provider';

const SCANNER_ROUTE = '/(main)/scanner' as Href;

/**
 * Settings screen for configuring device metadata and linkage.
 *
 * @returns {JSX.Element} Settings screen with device configuration controls
 */
export default function SettingsScreen(): JSX.Element {
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const navigation = useNavigation();
	const iconColor = useThemeColor('foreground');
	const { toast } = useToast();
	const { session } = useAuthContext();
	const activeOrganizationId = session?.session?.activeOrganizationId ?? null;
	const {
		settings,
		isHydrated,
		isUpdating,
		saveRemoteSettings,
		updateLocalSettings,
		clearSettings,
	} = useDeviceContext();

	const { data: locationsResponse, isError: isLocationsError, isPending: isLocationsPending } =
		useQuery({
		queryKey: queryKeys.locations.list({ organizationId: activeOrganizationId ?? undefined }),
		queryFn: () =>
			fetchLocationsList({ limit: 100, organizationId: activeOrganizationId ?? undefined }),
		enabled: Boolean(activeOrganizationId),
		});

	const locationOptions = useMemo(
		() =>
			(locationsResponse?.data ?? []).map((loc) => ({
				value: loc.id,
				label: loc.name || loc.code,
			})),
		[locationsResponse?.data],
	);

	const form = useAppForm({
		defaultValues: {
			name: settings?.name ?? '',
			locationId: settings?.locationId ?? '',
		},
		onSubmit: async ({ value }) => {
			if (!settings?.deviceId) {
				return;
			}

			try {
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

				toast.show({
					variant: 'success',
					label: i18n.t('Settings.toast.saveSuccess.title'),
					description: i18n.t('Settings.toast.saveSuccess.description'),
					actionLabel: i18n.t('Common.ok'),
					onActionPress: ({ hide }: { hide: () => void }) => hide(),
				});
			} catch {
				toast.show({
					variant: 'danger',
					label: i18n.t('Settings.toast.saveError.title'),
					description: i18n.t('Settings.toast.saveError.fallbackDescription'),
					actionLabel: i18n.t('Common.dismiss'),
					onActionPress: ({ hide }: { hide: () => void }) => hide(),
				});
			}
		},
	});

	useEffect(() => {
		form.setFieldValue('name', settings?.name ?? '');
		form.setFieldValue('locationId', settings?.locationId ?? '');
	}, [form, settings?.locationId, settings?.name]);

	const organizationId = activeOrganizationId ?? '—';
	const organizationName =
		(session?.session as { organization?: { name?: string } })?.organization?.name ??
		i18n.t('Settings.organization.fallbackName');
	const continuousCurve = useMemo(() => ({ borderCurve: 'continuous' }) satisfies ViewStyle, []);
	const floatingBackButtonSize = 48;
	const floatingBackButtonTop = Math.max(8, insets.top + 8);
	const floatingBackButtonLeft = 16;
	const contentTopPadding = floatingBackButtonTop + floatingBackButtonSize + 16;
	const keyboardVerticalOffset = Platform.OS === 'ios' ? Math.max(insets.top, 16) : 0;
	const signOutButtonVariant = Platform.OS === 'ios' ? 'ghost' : 'danger';

	/**
	 * Navigate back to the previous screen when history exists.
	 * Falls back to scanner replacement for direct-entry scenarios.
	 *
	 * @returns {void} No return value
	 */
	const handleBackToScanner = useCallback((): void => {
		if (navigation.canGoBack()) {
			navigation.goBack();
			return;
		}

		router.replace(SCANNER_ROUTE);
	}, [navigation, router]);

	return (
		<View className="flex-1 bg-background">
			<KeyboardAvoidingView
				className="flex-1 bg-background"
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				keyboardVerticalOffset={keyboardVerticalOffset}
			>
				<ScrollView
					className="flex-1 bg-background"
					contentInsetAdjustmentBehavior="never"
					contentContainerClassName="px-4 gap-6"
					contentContainerStyle={{
						paddingTop: contentTopPadding,
						paddingBottom: Math.max(40, insets.bottom + 20),
					}}
					keyboardShouldPersistTaps="handled"
					showsVerticalScrollIndicator={false}
				>
				<View className="gap-1">
					<Text className={`${BODY_TEXT_CLASS_NAME} text-foreground-500`}>
						{i18n.t('Settings.subtitle')}
					</Text>
				</View>

				<Card variant="default" style={continuousCurve}>
					<Card.Header className="flex-row items-center gap-3 px-5 pt-5 pb-2">
						<View
							className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center"
							style={continuousCurve}
						>
							<IconSymbol name="building.2" size={18} color={iconColor} />
						</View>
						<View className="flex-1">
							<Card.Title className="text-foreground text-lg">
								{organizationName}
							</Card.Title>
							<Card.Description className="text-foreground-500">
								{i18n.t('Settings.organization.description')}
							</Card.Description>
						</View>
					</Card.Header>
					<Card.Body className="px-5 pb-5 pt-1">
						<Text
							className="text-foreground-500 font-mono text-sm"
							numberOfLines={1}
							ellipsizeMode="middle"
							selectable
						>
							{i18n.t('Settings.organization.idLabel')}: {organizationId}
						</Text>
					</Card.Body>
				</Card>

				<Card variant="default" style={continuousCurve}>
					<Card.Body className="p-5 gap-5">
						<form.AppField
							name="name"
							validators={{
								onChange: ({ value }) =>
									!value.trim()
										? i18n.t('Settings.form.validation.nameRequired')
										: undefined,
							}}
						>
							{(field) => (
								<field.TextField
									label={i18n.t('Settings.form.fields.name.label')}
									placeholder={i18n.t('Settings.form.fields.name.placeholder')}
									description={i18n.t('Settings.form.fields.name.description')}
								/>
							)}
						</form.AppField>

						<form.AppField name="locationId">
							{(field) => {
								const selectedOption = locationOptions.find(
									(opt) => opt.value === field.state.value,
								);
								const hasError = field.state.meta.errors.length > 0;

								const handleLocationChange = (option: {
									value: string;
									label: string;
								}): void => {
									field.handleChange(option.value);
								};

								return (
									<View className="gap-1.5">
										<Text className="text-sm font-semibold text-foreground tracking-wide">
											{i18n.t('Settings.form.fields.location.label')}
										</Text>
										<Select
											value={selectedOption}
											onValueChange={handleLocationChange}
											isDisabled={
												!activeOrganizationId ||
												isLocationsPending ||
												isLocationsError
											}
										>
											<Select.Trigger variant="outline" asChild>
												<Button
													variant="tertiary"
													size="sm"
													accessibilityLabel={`${i18n.t(
														'Settings.form.fields.location.accessibilityLabel',
													)}: ${
														selectedOption?.label ??
														i18n.t(
															'Settings.form.fields.location.placeholder',
														)
													}`}
													accessibilityHint={i18n.t(
														'Settings.form.fields.location.accessibilityHint',
													)}
												>
													{selectedOption ? (
														<View className="flex-row items-center gap-2">
															<Text className="text-sm text-foreground">
																{selectedOption.label}
															</Text>
														</View>
													) : (
														<Text className="text-foreground">
															{isLocationsPending
																? i18n.t(
																		'Settings.form.fields.location.loading',
																	)
																: isLocationsError
																	? i18n.t(
																			'Settings.form.fields.location.loadError',
																		)
																: i18n.t(
																		'Settings.form.fields.location.placeholder',
																	)}
														</Text>
													)}
												</Button>
											</Select.Trigger>
											<Select.Portal>
												<Select.Overlay className="bg-overlay/80" />
												<Select.Content
													presentation="dialog"
													classNames={{
														wrapper: 'px-5',
														content: 'rounded-xl bg-popover gap-2 shadow-lg',
													}}
													style={continuousCurve}
												>
													<Select.Close />
													<Select.ListLabel className="text-lg font-bold text-foreground">
														{i18n.t('Settings.form.fields.location.label')}
													</Select.ListLabel>
													{isLocationsError ? (
														<View className="py-4">
															<Text className="text-danger-500 text-center">
																{i18n.t(
																	'Settings.form.fields.location.loadError',
																)}
															</Text>
														</View>
													) : locationOptions.length === 0 ? (
														<View className="py-4">
															<Text className="text-foreground-400 text-center">
																{i18n.t(
																	'Settings.form.fields.location.empty',
																)}
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
							<form.SubmitButton
								label={
									settings?.deviceId
										? i18n.t('Settings.form.actions.saveChanges')
										: i18n.t('Settings.form.actions.linkDeviceFirst')
								}
								loadingLabel={i18n.t('Common.saving')}
							/>
						</form.AppForm>

						<View className="gap-1">
							<Text className="text-sm text-foreground-500">
								{i18n.t('Settings.deviceId.label')}
							</Text>
							<Text
								className="text-foreground font-mono text-sm"
								numberOfLines={1}
								ellipsizeMode="middle"
								selectable
							>
								{settings?.deviceId ?? i18n.t('Settings.deviceId.notSet')}
							</Text>
							{!isHydrated ? (
								<Text className="text-foreground-500">
									{i18n.t('Settings.deviceId.loading')}
								</Text>
							) : null}
						</View>
					</Card.Body>

					<Separator className="mx-5" />

					<Card.Footer className="flex-row gap-3 px-5 pb-5 pt-3">
						<Button
							variant={signOutButtonVariant}
							className="flex-1"
							isDisabled={isUpdating}
							onPress={async () => {
								try {
									await signOut();
									await clearAuthStorage();
									await clearSettings();
									toast.show({
										variant: 'success',
										label: i18n.t('Settings.toast.signOutSuccess.title'),
										description: i18n.t(
											'Settings.toast.signOutSuccess.description',
										),
										actionLabel: i18n.t('Common.ok'),
										onActionPress: ({ hide }: { hide: () => void }) => hide(),
									});
								} catch {
									toast.show({
										variant: 'danger',
										label: i18n.t('Settings.toast.signOutError.title'),
										description: i18n.t(
											'Settings.toast.signOutError.fallbackDescription',
										),
										actionLabel: i18n.t('Common.dismiss'),
										onActionPress: ({ hide }: { hide: () => void }) => hide(),
									});
								}
							}}
						>
							<Button.Label
								className={
									Platform.OS === 'ios'
										? 'text-danger-500 font-medium'
										: undefined
								}
							>
								{i18n.t('Settings.actions.signOut')}
							</Button.Label>
						</Button>
						<Button
							variant="secondary"
							className="flex-1"
							onPress={() => clearSettings()}
						>
							<Button.Label>{i18n.t('Settings.actions.clearCache')}</Button.Label>
						</Button>
					</Card.Footer>
				</Card>
				</ScrollView>
			</KeyboardAvoidingView>

			<View
				pointerEvents="box-none"
				style={{
					position: 'absolute',
					top: floatingBackButtonTop,
					left: floatingBackButtonLeft,
					zIndex: 30,
				}}
			>
				<Button
					variant="secondary"
					isIconOnly
					size="md"
					className="w-12 h-12 rounded-full"
					accessibilityLabel={i18n.t('Settings.navigation.backToScanner')}
					onPress={handleBackToScanner}
				>
					<IconSymbol name="chevron.left" size={22} color={iconColor} />
				</Button>
			</View>
		</View>
	);
}
