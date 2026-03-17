import { Button, Card } from 'heroui-native';
import type { JSX, ReactNode } from 'react';
import { Text, View } from 'react-native';

type EmptyStateProps = {
	title: string;
	description: string;
	actionLabel?: string;
	onAction?: () => void;
	icon?: ReactNode;
};

/**
 * Reusable empty state with optional icon and CTA.
 *
 * @param props - Empty state copy, icon, and optional action callback
 * @returns {JSX.Element} Card-based empty state UI
 */
export function EmptyState({
	title,
	description,
	actionLabel,
	onAction,
	icon,
}: EmptyStateProps): JSX.Element {
	return (
		<Card variant="default">
			<Card.Body className="items-center gap-3 p-5">
				{icon ? (
					<View className="w-12 h-12 rounded-full bg-primary/10 items-center justify-center">
						{icon}
					</View>
				) : null}
				<View className="items-center gap-1">
					<Text className="text-center text-foreground font-semibold">{title}</Text>
					<Text className="text-center text-foreground-500">{description}</Text>
				</View>
				{actionLabel && onAction ? (
					<Button onPress={onAction} className="w-full">
						<Button.Label>{actionLabel}</Button.Label>
					</Button>
				) : null}
			</Card.Body>
		</Card>
	);
}
