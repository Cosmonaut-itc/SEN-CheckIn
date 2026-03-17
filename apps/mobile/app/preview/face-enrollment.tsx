import { Button, Card, Input } from 'heroui-native';
import { type JSX, useMemo } from 'react';
import { ScrollView, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { i18n } from '@/lib/i18n';
import { BODY_TEXT_CLASS_NAME } from '@/lib/typography';
import { useThemeColor } from '@/hooks/use-theme-color';

/**
 * Face-enrollment preview route used for store listing capture.
 *
 * @returns Mocked enrollment screen with sample employees and camera stage
 */
export default function PreviewFaceEnrollmentScreen(): JSX.Element {
	const insets = useSafeAreaInsets();
	const iconColor = useThemeColor('foreground');
	const mutedForegroundColor = useThemeColor('muted-foreground');
	const successColor = useThemeColor('success');
	const inputBorderRadius = useMemo(
		() => Platform.select({ ios: 10, android: 12, default: 10 }),
		[],
	);
	const cardBorderRadius = useMemo(
		() => Platform.select({ ios: 14, android: 16, default: 14 }),
		[],
	);
	const floatingBackButtonTop = Math.max(8, insets.top + 8);
	const contentTopPadding = floatingBackButtonTop + 64;

	return (
		<View className="flex-1 bg-background">
			<ScrollView
				className="flex-1 bg-background"
				contentInsetAdjustmentBehavior="never"
				contentContainerClassName="px-4 gap-4"
				contentContainerStyle={{
					paddingTop: contentTopPadding,
					paddingBottom: Math.max(28, insets.bottom + 20),
				}}
				showsVerticalScrollIndicator={false}
			>
				<Text className={`${BODY_TEXT_CLASS_NAME} text-foreground-500`} selectable>
					{i18n.t('FaceEnrollment.subtitle')}
				</Text>

				<Card variant="default">
					<Card.Body className="p-5 gap-3">
						<Card.Title>{i18n.t('FaceEnrollment.employees.title')}</Card.Title>
						<Text className="text-sm font-semibold text-foreground tracking-wide">
							{i18n.t('FaceEnrollment.employees.searchLabel')}
						</Text>
						<Input
							value=""
							editable={false}
							placeholder={i18n.t('FaceEnrollment.employees.searchPlaceholder')}
							placeholderTextColor={mutedForegroundColor}
							className="bg-input border border-default-200 text-foreground px-4 py-3"
							style={{ borderRadius: inputBorderRadius }}
						/>
						<View className="gap-2">
							{[
								[i18n.t('Preview.employeeOne'), i18n.t('Preview.employeeCodeOne'), true],
								[i18n.t('Preview.employeeTwo'), i18n.t('Preview.employeeCodeTwo'), false],
								[i18n.t('Preview.employeeThree'), i18n.t('Preview.employeeCodeThree'), false],
							].map(([name, code, isSelected]) => (
								<Button
									key={`${name}`}
									variant={isSelected ? 'primary' : 'secondary'}
								>
									<View className="flex-row items-center justify-between gap-2 w-full">
										<View className="flex-1">
											<Text className="text-foreground font-semibold" selectable>
												{name}
											</Text>
											<Text className="text-foreground-500 text-xs" selectable>
												{code}
											</Text>
										</View>
										<View
											className={`px-2.5 py-1 rounded-full ${isSelected ? 'bg-success-500/15' : 'bg-default-200'}`}
										>
											<Text
												className={`text-xs font-semibold ${isSelected ? 'text-success-600' : 'text-foreground-500'}`}
												selectable
											>
												{isSelected
													? i18n.t('FaceEnrollment.employees.badges.registered')
													: i18n.t('FaceEnrollment.employees.badges.notRegistered')}
											</Text>
										</View>
									</View>
								</Button>
							))}
						</View>
					</Card.Body>
				</Card>

				<Card variant="default">
					<Card.Body className="p-5 gap-3">
						<View className="flex-row items-center justify-between">
							<Card.Title>{i18n.t('FaceEnrollment.camera.title')}</Card.Title>
							<Button variant="secondary" size="sm">
								<Button.Label>
									{i18n.t('FaceEnrollment.camera.switchCamera')}
								</Button.Label>
							</Button>
						</View>

						<View
							className="overflow-hidden border border-default-200 bg-content2 items-center justify-center"
							style={{ width: '100%', height: 260, borderRadius: cardBorderRadius }}
						>
							<View className="absolute inset-0 bg-emerald-100/70" />
							<View className="w-40 h-40 rounded-full border-4 border-success-500/60 items-center justify-center">
								<IconSymbol name="person.crop.circle" size={88} color={successColor} />
							</View>
							<Text className="mt-5 text-foreground font-semibold" selectable>
								{i18n.t('Preview.facePreviewTitle')}
							</Text>
							<Text className="mt-1 px-8 text-center text-foreground-500" selectable>
								{i18n.t('Preview.facePreviewBody')}
							</Text>
						</View>

						<View className="flex-row gap-2">
							<Button variant="secondary" className="flex-1">
								<Button.Label>{i18n.t('FaceEnrollment.actions.retake')}</Button.Label>
							</Button>
							<Button variant="primary" className="flex-1">
								<Button.Label>
									{i18n.t('FaceEnrollment.actions.confirm')}
								</Button.Label>
							</Button>
						</View>
					</Card.Body>
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
