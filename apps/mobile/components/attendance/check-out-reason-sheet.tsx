import { Button } from 'heroui-native';
import { BottomSheet } from 'heroui-native/bottom-sheet';
import type { JSX } from 'react';
import { Text, View } from 'react-native';
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
	return (
		<BottomSheet
			isOpen={props.isOpen}
			onOpenChange={(isOpen: boolean) => (!isOpen ? props.onClose() : null)}
		>
			<BottomSheet.Portal>
				<BottomSheet.Overlay className="bg-foreground/35" />
				<BottomSheet.Content
					snapPoints={['52%']}
					enablePanDownToClose
					className="bg-background border-default-200 px-5 pt-5 pb-6"
				>
					<View className="gap-5">
						<View className="gap-2">
							<BottomSheet.Title className="text-foreground text-2xl font-semibold">
								{i18n.t('Scanner.checkOutReason.title')}
							</BottomSheet.Title>
							<BottomSheet.Description className="text-foreground-500 text-sm leading-5">
								{i18n.t('Scanner.checkOutReason.description')}
							</BottomSheet.Description>
						</View>

						<View className="gap-3">
							{CHECK_OUT_REASON_OPTIONS.map((option) => (
								<Button
									key={option.value}
									variant="outline"
									onPress={() => props.onSelectReason(option.value)}
									className="min-h-16 justify-start border-default-200 bg-secondary px-4 py-3"
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

						<Button
							variant="ghost"
							onPress={props.onClose}
							className="border border-transparent"
						>
							<Button.Label className="text-foreground-500 font-medium">
								{i18n.t('Common.cancel')}
							</Button.Label>
						</Button>
					</View>
				</BottomSheet.Content>
			</BottomSheet.Portal>
		</BottomSheet>
	);
}
