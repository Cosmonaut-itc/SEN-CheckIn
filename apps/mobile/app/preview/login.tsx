import { Button, Card, Spinner } from 'heroui-native';
import { type JSX, useMemo } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import QRCode from 'react-qr-code';

import { i18n } from '@/lib/i18n';
import { BODY_TEXT_CLASS_NAME } from '@/lib/typography';
import { useTheme } from '@/providers/theme-provider';
import { useThemeColor } from '@/hooks/use-theme-color';

/**
 * Curated login preview used for Play Store screenshots.
 *
 * @returns Static login composition with current branding
 */
export default function PreviewLoginScreen(): JSX.Element {
	const { isDarkMode } = useTheme();
	const [accentColor, foregroundColor, foregroundInverseColor] = useThemeColor([
		'accent',
		'foreground',
		'foreground-inverse',
	]);
	const qrForeground = isDarkMode ? foregroundInverseColor : foregroundColor;
	const continuousCurve = useMemo(() => ({ borderCurve: 'continuous' as const }), []);

	return (
		<KeyboardAvoidingView
			className="flex-1 bg-background"
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
		>
			<ScrollView
				className="flex-1 bg-background"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerClassName="px-5 pt-4 pb-6 gap-4"
				showsVerticalScrollIndicator={false}
			>
				<View className="gap-2 pt-4">
					<Text className={`${BODY_TEXT_CLASS_NAME} text-foreground-500 leading-relaxed`}>
						{i18n.t('Login.header.subtitle')}
					</Text>
				</View>

				<Card variant="tertiary" className="p-5 gap-3" style={continuousCurve}>
					<View className="items-center gap-2">
						<Text className="text-xs font-semibold text-foreground-400 uppercase tracking-widest">
							{i18n.t('Login.code.label')}
						</Text>
						<View className="bg-default-100 rounded-2xl px-6 py-3" style={continuousCurve}>
							<Text
								className="text-5xl font-black tracking-[0.3em] text-foreground"
								selectable
							>
								{i18n.t('Preview.userCode')}
							</Text>
						</View>
					</View>

					<View
						className="items-center py-2 gap-2"
						accessible
						accessibilityLabel={i18n.t('Login.accessibility.qrCode')}
					>
						<View
							className="bg-white p-3 rounded-2xl shadow-md"
							style={{ borderCurve: 'continuous' }}
						>
							<QRCode
								value="https://sen-checkin.app/device?user_code=FDZVNDLH"
								size={140}
								bgColor="white"
								fgColor={qrForeground}
								level="M"
							/>
						</View>
						<Text className="text-xs text-foreground-400 text-center">
							{i18n.t('Login.qr.caption')}
						</Text>
					</View>

					<Card variant="default" style={continuousCurve}>
						<Card.Body className="flex-row items-center justify-center gap-3 py-2">
							<Spinner size="sm" color={accentColor} />
							<Card.Description className="text-base">
								{i18n.t('Login.status.connecting')}
							</Card.Description>
						</Card.Body>
					</Card>

					<View className="gap-2">
						<Button className="w-full" variant="primary" size="md">
							<Button.Label>{i18n.t('Login.actions.newCode')}</Button.Label>
						</Button>
						<Button variant="secondary" className="w-full" size="md">
							<Button.Label>{i18n.t('Login.actions.openLink')}</Button.Label>
						</Button>
					</View>
				</Card>
			</ScrollView>
		</KeyboardAvoidingView>
	);
}
