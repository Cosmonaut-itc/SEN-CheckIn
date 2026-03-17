import { Button, Card } from 'heroui-native';
import type { JSX } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { i18n } from '@/lib/i18n';

/**
 * Locked-state preview for store listing captures.
 *
 * @returns Static locked screen
 */
export default function PreviewLockedScreen(): JSX.Element {
	return (
		<ScrollView
			className="flex-1 bg-background"
			contentInsetAdjustmentBehavior="automatic"
			contentContainerClassName="px-5 pt-6 pb-6 gap-4"
			showsVerticalScrollIndicator={false}
		>
			<View className="gap-2">
				<Text className="text-base text-foreground-500">{i18n.t('Locked.subtitle')}</Text>
			</View>

			<Card variant="default">
				<Card.Body className="gap-3 p-5">
					<Text className="text-lg font-semibold text-foreground">
						{i18n.t('Locked.body')}
					</Text>
					<Text className="text-sm text-foreground-500" selectable>
						{i18n.t('Preview.lockedReason')}
					</Text>
				</Card.Body>
			</Card>

			<View className="gap-2">
				<Button variant="primary" size="md" className="w-full">
					<Button.Label>{i18n.t('Locked.actions.retry')}</Button.Label>
				</Button>
				<Button variant="secondary" size="md" className="w-full">
					<Button.Label>{i18n.t('Locked.actions.signIn')}</Button.Label>
				</Button>
			</View>
		</ScrollView>
	);
}
