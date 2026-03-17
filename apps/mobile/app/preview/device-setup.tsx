import { Button, Card } from 'heroui-native';
import { type JSX, useMemo } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View, type ViewStyle } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { i18n } from '@/lib/i18n';
import { BODY_TEXT_CLASS_NAME } from '@/lib/typography';

/**
 * Curated device-setup preview for Android store screenshots.
 *
 * @returns Static device setup screen
 */
export default function PreviewDeviceSetupScreen(): JSX.Element {
	const [primaryColor, warningColor] = useThemeColor(['primary', 'warning']);
	const continuousCurve = useMemo(() => ({ borderCurve: 'continuous' }) satisfies ViewStyle, []);

	return (
		<KeyboardAvoidingView
			className="flex-1 bg-background"
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
		>
			<ScrollView
				className="flex-1 bg-background"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerClassName="px-5 pt-6 pb-10"
				showsVerticalScrollIndicator={false}
			>
				<View className="gap-8 max-w-lg w-full self-center">
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
								<Text className="text-2xl font-bold text-foreground">
									{i18n.t('DeviceSetup.header.title')}
								</Text>
							</View>
						</View>
						<Text className={`${BODY_TEXT_CLASS_NAME} text-foreground-400 leading-6`}>
							{i18n.t('DeviceSetup.header.subtitle')}
						</Text>
					</View>

					<View className="flex-row gap-3">
						<View
							className="flex-1 p-4 bg-content1 rounded-lg border border-default-200 gap-1"
							style={continuousCurve}
						>
							<Text className="text-xs uppercase tracking-widest text-foreground-400 font-semibold">
								{i18n.t('DeviceSetup.deviceInfo.deviceId')}
							</Text>
							<Text className="text-sm font-mono text-foreground" selectable>
								{i18n.t('Preview.deviceId')}
							</Text>
						</View>
						<View
							className="flex-1 p-4 bg-content1 rounded-lg border border-default-200 gap-1"
							style={continuousCurve}
						>
							<Text className="text-xs uppercase tracking-widest text-foreground-400 font-semibold">
								{i18n.t('DeviceSetup.deviceInfo.organization')}
							</Text>
							<Text className="text-sm font-mono text-foreground" selectable>
								{i18n.t('Preview.organizationId')}
							</Text>
						</View>
					</View>

					<Card variant="default" style={continuousCurve}>
						<Card.Body className="p-5 gap-5">
							<View className="gap-1.5">
								<Text className="text-sm font-semibold text-foreground tracking-wide">
									{i18n.t('DeviceSetup.form.fields.name.label')}
								</Text>
								<View
									className="bg-input border border-default-200 px-4 py-3 rounded-xl"
									style={continuousCurve}
								>
									<Text className="text-foreground">{i18n.t('Preview.deviceName')}</Text>
								</View>
								<Text className="text-sm text-foreground-500">
									{i18n.t('DeviceSetup.form.fields.name.description')}
								</Text>
							</View>

							<View className="gap-1.5">
								<Text className="text-sm font-semibold text-foreground tracking-wide">
									{i18n.t('DeviceSetup.form.fields.location.label')}
								</Text>
								<View
									className="bg-input border border-default-200 px-4 py-3 rounded-xl"
									style={continuousCurve}
								>
									<Text className="text-foreground">{i18n.t('Preview.locationName')}</Text>
								</View>
							</View>

							<Button variant="primary" size="lg">
								<Button.Label>
									{i18n.t('DeviceSetup.form.actions.saveAndContinue')}
								</Button.Label>
							</Button>
						</Card.Body>
					</Card>

					<Card variant="default" style={continuousCurve}>
						<Card.Body className="p-4 gap-2">
							<View className="flex-row items-center gap-2">
								<IconSymbol
									name="lightbulb.fill"
									size={16}
									color={warningColor}
								/>
								<Text className="font-semibold text-foreground">
									{i18n.t('DeviceSetup.tip.title')}
								</Text>
							</View>
							<Text className="text-foreground-500 leading-6">
								{i18n.t('DeviceSetup.tip.body')}
							</Text>
						</Card.Body>
					</Card>
				</View>
			</ScrollView>
		</KeyboardAvoidingView>
	);
}
