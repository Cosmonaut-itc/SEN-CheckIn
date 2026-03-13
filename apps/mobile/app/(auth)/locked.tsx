import { useRouter } from 'expo-router';
import { Button, Card } from 'heroui-native';
import type { JSX } from 'react';
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { i18n } from '@/lib/i18n';
import { clearAuthStorage, signOut } from '@/lib/auth-client';
import { useAuthContext } from '@/providers/auth-provider';

/**
 * Locked screen shown when a device must reauthenticate.
 *
 * @returns Locked screen component
 */
export default function LockedScreen(): JSX.Element {
	const router = useRouter();
	const { requestReauth, lockReason } = useAuthContext();
	const continuousCurve = useMemo(() => ({ borderCurve: 'continuous' as const }), []);
	const requiresDeviceRelinking =
		lockReason === 'device_disabled' || lockReason === 'device_missing';

	const reasonMessage = useMemo(() => {
		switch (lockReason) {
			case 'device_disabled':
				return i18n.t('Locked.reason.deviceDisabled');
			case 'device_missing':
				return i18n.t('Locked.reason.deviceMissing');
			case 'refresh_failed':
				return i18n.t('Locked.reason.refreshFailed');
			default:
				return null;
		}
	}, [lockReason]);

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentInsetAdjustmentBehavior="automatic"
			contentContainerClassName="px-5 pt-4 pb-6 gap-4"
			showsVerticalScrollIndicator={false}
		>
			<View className="gap-2">
				<Text className="text-base text-foreground-500">{i18n.t('Locked.subtitle')}</Text>
			</View>

			<Card variant="default" style={continuousCurve}>
				<Card.Body className="gap-3 p-5">
					<Text className="text-lg font-semibold text-foreground">
						{i18n.t('Locked.body')}
					</Text>
					{reasonMessage ? (
						<Text className="text-sm text-foreground-500" selectable>
							{reasonMessage}
						</Text>
					) : null}
				</Card.Body>
			</Card>

			<View className="gap-2">
				<Button
					variant="primary"
					size="md"
					className="w-full"
					isDisabled={requiresDeviceRelinking}
					onPress={() => {
						if (requiresDeviceRelinking) return;
						void requestReauth();
					}}
				>
					<Button.Label>{i18n.t('Locked.actions.retry')}</Button.Label>
				</Button>
				<Button
					variant="secondary"
					size="md"
					className="w-full"
					onPress={() => {
						void (async () => {
							try {
								await signOut();
							} catch (error) {
								console.warn('[locked] Failed to sign out', error);
							} finally {
								try {
									await clearAuthStorage();
								} catch (error) {
									console.warn('[locked] Cleanup error before sign-in', error);
								}
								router.replace('/(auth)/login');
							}
						})();
					}}
				>
					<Button.Label>{i18n.t('Locked.actions.signIn')}</Button.Label>
				</Button>
			</View>
		</ScrollView>
	);
}
