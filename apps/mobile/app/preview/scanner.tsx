import { Button, Card } from 'heroui-native';
import { type JSX, useMemo } from 'react';
import { ScrollView, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { i18n } from '@/lib/i18n';
import { useThemeColor } from '@/hooks/use-theme-color';

/**
 * Calculates the visual face-guide size for the preview route.
 *
 * @param width - Screen width in pixels
 * @param height - Screen height in pixels
 * @returns Circle size constrained for handset screenshots
 */
function calculatePreviewGuideSize(width: number, height: number): number {
	return Math.min(Math.min(width, height) * 0.7, 320);
}

/**
 * Static scanner preview that mirrors the production scanner layout.
 *
 * @returns Mocked scanner screen for store screenshots
 */
export default function PreviewScannerScreen(): JSX.Element {
	const insets = useSafeAreaInsets();
	const { width, height } = useWindowDimensions();
	const faceGuideSize = calculatePreviewGuideSize(width, height);
	const [backgroundColor, foregroundColor, mutedColor, successColor, surfaceColor, warningColor] =
		useThemeColor([
			'background',
			'foreground',
			'muted',
			'success',
			'surface',
			'warning',
		]);
	const continuousCurve = useMemo(() => ({ borderCurve: 'continuous' }) satisfies ViewStyle, []);

	return (
		<ScrollView
			className="flex-1"
			style={{ backgroundColor }}
			contentInsetAdjustmentBehavior="never"
			contentContainerStyle={{
				paddingTop: Math.max(insets.top + 10, 18),
				paddingBottom: Math.max(insets.bottom + 18, 24),
				paddingHorizontal: 16,
			}}
			scrollEnabled={false}
		>
			<View className="gap-4">
				<View className="flex-row items-center gap-3">
					<Button
						variant="secondary"
						size="md"
						className="flex-1 flex-row items-center gap-2 justify-center rounded-full"
					>
						<View className="w-2.5 h-2.5 rounded-full bg-success-500" />
						<Button.Label className="text-base font-semibold">
							{i18n.t('Scanner.attendanceType.checkIn')}
						</Button.Label>
						<IconSymbol
							name="arrow.left.arrow.right"
							size={18}
							color={mutedColor}
						/>
					</Button>
					<Button variant="secondary" isIconOnly size="md" className="w-12 h-12 rounded-full">
						<IconSymbol name="person.crop.circle.badge.plus" size={20} color={foregroundColor} />
					</Button>
					<Button variant="secondary" isIconOnly size="md" className="w-12 h-12 rounded-full">
						<IconSymbol name="gearshape" size={20} color={foregroundColor} />
					</Button>
				</View>

				<View
					className="overflow-hidden rounded-[32px] border border-default-200"
					style={[continuousCurve, { backgroundColor: '#DDF0A9', height: 470 }]}
				>
					<View className="absolute inset-0 bg-lime-200/80" />
					<View className="absolute left-0 right-0 bottom-0 h-44 bg-[#4A7C3F]" />
					<View className="absolute left-0 right-0 bottom-0 h-24 bg-[#3A5F31]" />
					<View className="absolute right-6 top-20 w-20 h-20 bg-lime-300/60" />
					<View className="absolute left-7 top-24 w-28 h-28 rounded-full border border-white/50" />
					<View className="absolute right-20 top-12 w-44 h-44 rounded-full border border-white/35" />

					<View className="flex-1 items-center justify-center px-6">
						<View
							className="items-center justify-center"
							style={{
								width: faceGuideSize,
								height: faceGuideSize,
							}}
						>
							<View
								style={{
									width: faceGuideSize,
									height: faceGuideSize,
									borderRadius: faceGuideSize / 2,
									borderWidth: 4,
									borderColor: '#FFF6',
								}}
							/>
						</View>
						<View className="items-center gap-2 mt-6">
							<IconSymbol name="checkmark.circle.fill" size={28} color={successColor} />
							<Text className="text-base font-semibold text-white" selectable>
								{i18n.t('Preview.scannerEmployee')}
							</Text>
							<Text className="text-center text-white/90" selectable>
								{i18n.t('Preview.scannerStatus')}
							</Text>
						</View>
					</View>
				</View>

				<Card variant="default" style={continuousCurve}>
					<Card.Body className="p-4 gap-4">
						<View className="rounded-2xl border border-warning-500/30 bg-warning-500/10 px-4 py-3 flex-row items-start gap-3">
							<IconSymbol name="sparkles" size={18} color={warningColor} />
							<View className="flex-1 gap-1">
								<Text className="text-sm font-semibold text-foreground">
									{i18n.t('Preview.cameraHint')}
								</Text>
								<Text className="text-xs text-foreground-500 leading-5">
									{i18n.t('Preview.scannerInstruction')}
								</Text>
							</View>
						</View>

						<View className="flex-row items-start justify-between gap-3">
							<View className="flex-1 gap-1.5">
								<View className="flex-row items-center gap-2">
									<View className="w-2.5 h-2.5 rounded-full bg-success-500" />
									<Text className="text-foreground text-sm font-medium">
										{i18n.t('Preview.deviceName')}
									</Text>
								</View>
							</View>
							<View className="flex-row items-center gap-1 pt-0.5">
								<IconSymbol name="checkmark.circle" size={14} color={successColor} />
								<Text className="text-foreground-400 text-xs">
									{i18n.t('Scanner.deviceStatus.connected')}
								</Text>
							</View>
						</View>

						<Button
							variant="primary"
							className="w-full h-14"
							style={{ backgroundColor: successColor, borderColor: successColor }}
						>
							<View className="flex-row items-center gap-2">
								<IconSymbol name="viewfinder" size={22} color={surfaceColor} />
								<Button.Label style={{ color: surfaceColor }} className="text-lg">
									{i18n.t('Scanner.actions.scanCheckIn')}
								</Button.Label>
							</View>
						</Button>
					</Card.Body>
				</Card>
			</View>
		</ScrollView>
	);
}
