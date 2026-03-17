import { Button, Card, Separator } from 'heroui-native';
import { type JSX, useMemo } from 'react';
import { ScrollView, Text, View, Platform, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { i18n } from '@/lib/i18n';
import { useThemeColor } from '@/hooks/use-theme-color';

/**
 * Settings preview for Android screenshot generation.
 *
 * @returns Static settings composition with linked device data
 */
export default function PreviewSettingsScreen(): JSX.Element {
	const insets = useSafeAreaInsets();
	const iconColor = useThemeColor('foreground');
	const continuousCurve = useMemo(() => ({ borderCurve: 'continuous' }) satisfies ViewStyle, []);
	const floatingBackButtonTop = Math.max(8, insets.top + 8);
	const contentTopPadding = floatingBackButtonTop + 64;

	return (
		<View className="flex-1 bg-background">
			<ScrollView
				className="flex-1 bg-background"
				contentInsetAdjustmentBehavior="never"
				contentContainerClassName="px-4 gap-6"
				contentContainerStyle={{
					paddingTop: contentTopPadding,
					paddingBottom: Math.max(40, insets.bottom + 20),
				}}
				showsVerticalScrollIndicator={false}
			>
				<View className="gap-1">
					<Text className="text-base text-foreground-500">{i18n.t('Settings.subtitle')}</Text>
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
								{i18n.t('Preview.organizationName')}
							</Card.Title>
							<Card.Description className="text-foreground-500">
								{i18n.t('Preview.organizationDescription')}
							</Card.Description>
						</View>
					</Card.Header>
					<Card.Body className="px-5 pb-5 pt-1">
						<Text className="text-foreground-500 font-mono text-sm" selectable>
							{i18n.t('Settings.organization.idLabel')}: {i18n.t('Preview.organizationId')}
						</Text>
					</Card.Body>
				</Card>

				<Card variant="default" style={continuousCurve}>
					<Card.Body className="p-5 gap-5">
						<View className="gap-1.5">
							<Text className="text-sm font-semibold text-foreground tracking-wide">
								{i18n.t('Settings.form.fields.name.label')}
							</Text>
							<View
								className="bg-input border border-default-200 text-foreground px-4 py-3 rounded-xl"
								style={continuousCurve}
							>
								<Text className="text-foreground">{i18n.t('Preview.deviceName')}</Text>
							</View>
							<Text className="text-sm text-foreground-500">
								{i18n.t('Settings.form.fields.name.description')}
							</Text>
						</View>

						<View className="gap-1.5">
							<Text className="text-sm font-semibold text-foreground tracking-wide">
								{i18n.t('Settings.form.fields.location.label')}
							</Text>
							<View
								className="bg-input border border-default-200 text-foreground px-4 py-3 rounded-xl"
								style={continuousCurve}
							>
								<Text className="text-foreground">{i18n.t('Preview.locationName')}</Text>
							</View>
						</View>

						<Button variant="primary">
							<Button.Label>{i18n.t('Settings.form.actions.saveChanges')}</Button.Label>
						</Button>

						<View className="gap-1">
							<Text className="text-sm text-foreground-500">
								{i18n.t('Settings.deviceId.label')}
							</Text>
							<Text className="text-foreground font-mono text-sm" selectable>
								{i18n.t('Preview.deviceId')}
							</Text>
						</View>
					</Card.Body>

					<Separator className="mx-5" />

					<Card.Footer className="flex-row gap-3 px-5 pb-5 pt-3">
						<Button variant={Platform.OS === 'ios' ? 'ghost' : 'danger'} className="flex-1">
							<Button.Label
								className={Platform.OS === 'ios' ? 'text-danger-500 font-medium' : undefined}
							>
								{i18n.t('Settings.actions.signOut')}
							</Button.Label>
						</Button>
						<Button variant="secondary" className="flex-1">
							<Button.Label>{i18n.t('Settings.actions.clearCache')}</Button.Label>
						</Button>
					</Card.Footer>
				</Card>
			</ScrollView>

			<View
				pointerEvents="box-none"
				style={{
					position: 'absolute',
					top: floatingBackButtonTop,
					left: 16,
					zIndex: 30,
				}}
			>
				<Button
					variant="secondary"
					isIconOnly
					size="md"
					className="w-12 h-12 rounded-full"
					accessibilityLabel={i18n.t('Settings.navigation.backToScanner')}
				>
					<IconSymbol name="chevron.left" size={22} color={iconColor} />
				</Button>
			</View>
		</View>
	);
}
