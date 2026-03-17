import * as Haptics from 'expo-haptics';
import { Button } from 'heroui-native';
import { BottomSheet } from 'heroui-native/bottom-sheet';
import type { JSX } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CheckOutReason } from '@sen-checkin/types';

import { i18n } from '@/lib/i18n';

type CheckOutReasonOption = {
	value: CheckOutReason;
	label: string;
	description: string;
};

const CHECK_OUT_REASON_OPTIONS: CheckOutReasonOption[] = [
	{
		value: 'LUNCH_BREAK',
		label: i18n.t('Scanner.checkOutReason.options.lunchBreak.label'),
		description: i18n.t('Scanner.checkOutReason.options.lunchBreak.description'),
	},
	{
		value: 'PERSONAL',
		label: i18n.t('Scanner.checkOutReason.options.personal.label'),
		description: i18n.t('Scanner.checkOutReason.options.personal.description'),
	},
	{
		value: 'REGULAR',
		label: i18n.t('Scanner.checkOutReason.options.regular.label'),
		description: i18n.t('Scanner.checkOutReason.options.regular.description'),
	},
];

export interface CheckOutReasonSheetProps {
	isOpen: boolean;
	onClose: () => void;
	onSelectReason: (reason: CheckOutReason) => void;
}

/**
 * Bottom sheet that asks the user why they are leaving before creating a check-out record.
 *
 * @param props - Sheet state and callbacks
 * @returns Rendered bottom sheet selector
 */
export function CheckOutReasonSheet(props: CheckOutReasonSheetProps): JSX.Element {
	const insets = useSafeAreaInsets();
	const bottomPadding = Math.max(insets.bottom + 12, 36);

	return (
		<BottomSheet
			isOpen={props.isOpen}
			onOpenChange={(isOpen: boolean) => (!isOpen ? props.onClose() : null)}
		>
			<BottomSheet.Portal>
				<BottomSheet.Overlay className="bg-overlay/80" />
				<BottomSheet.Content
					enablePanDownToClose
					snapPoints={['74%']}
					backgroundClassName="bg-background border border-default-200 rounded-t-xl shadow-none"
					contentContainerClassName="px-5 pt-5"
					contentContainerProps={{
						style: {
							paddingBottom: bottomPadding,
						},
					}}
				>
					<View className="gap-5">
						<ScrollView
							testID="check-out-reason-scroll"
							showsVerticalScrollIndicator={false}
							style={{ maxHeight: 480 }}
							contentContainerStyle={{ gap: 20, paddingBottom: 8 }}
						>
							<View className="gap-2">
								<BottomSheet.Title className="text-foreground text-2xl font-semibold">
									{i18n.t('Scanner.checkOutReason.title')}
								</BottomSheet.Title>
								<BottomSheet.Description className="text-foreground-500 text-sm leading-5">
									{i18n.t('Scanner.checkOutReason.description')}
								</BottomSheet.Description>
							</View>

							<View testID="check-out-reason-options" className="gap-3">
								{CHECK_OUT_REASON_OPTIONS.map((option) => (
									<Button
										key={option.value}
										variant="outline"
										onPress={() => {
											void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
											props.onSelectReason(option.value);
										}}
										className="min-h-16 justify-start border-default-200 bg-secondary-bg px-4 py-3"
										accessibilityLabel={i18n.t(
											'Scanner.checkOutReason.accessibility.option',
											{ label: option.label },
										)}
									>
										<View className="gap-1">
											<Button.Label className="text-foreground text-base font-semibold">
												{option.label}
											</Button.Label>
											<Text className="text-foreground-500 text-sm leading-5">
												{option.description}
											</Text>
										</View>
									</Button>
								))}
							</View>
						</ScrollView>

						<View
							testID="check-out-reason-footer"
							className="border-t border-default-200 bg-background pt-4"
						>
							<Button
								variant="ghost"
								onPress={props.onClose}
								className="border border-transparent"
								accessibilityLabel={i18n.t('Common.cancel')}
							>
								<Button.Label className="text-foreground-500 font-medium">
									{i18n.t('Common.cancel')}
								</Button.Label>
							</Button>
						</View>
					</View>
				</BottomSheet.Content>
			</BottomSheet.Portal>
		</BottomSheet>
	);
}
