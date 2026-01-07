'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

const DEFAULT_CARD_OFFSET = 12;
const DEFAULT_SCALE_FACTOR = 0.06;
const DEFAULT_INTERVAL_MS = 5000;

/**
 * Data model for an item displayed in the card stack.
 */
export interface CardStackItem {
	/** Stable identifier for the card */
	id: number;
	/** Primary label for the card */
	name: string;
	/** Secondary label for the card */
	designation: string;
	/** Main content for the card */
	content: ReactNode;
}

/**
 * Props for the CardStack component.
 */
export interface CardStackProps {
	/** Items to render in the stack */
	items: CardStackItem[];
	/** Offset in pixels between stacked cards */
	offset?: number;
	/** Scale reduction applied per stacked card */
	scaleFactor?: number;
	/** Interval in milliseconds between card flips */
	intervalMs?: number;
	/** Optional class name for the container */
	className?: string;
}

/**
 * Normalize a numeric index into a list length.
 *
 * @param index - Current index value
 * @param length - Total length of the list
 * @returns Normalized index within the list bounds
 */
function normalizeIndex(index: number, length: number): number {
	if (length <= 0) {
		return 0;
	}

	const modded = index % length;
	return modded < 0 ? modded + length : modded;
}

/**
 * Card stack component with automatic flipping animation.
 *
 * @param props - Component props with items and animation controls
 * @returns The card stack JSX element
 */
export function CardStack({
	items,
	offset = DEFAULT_CARD_OFFSET,
	scaleFactor = DEFAULT_SCALE_FACTOR,
	intervalMs = DEFAULT_INTERVAL_MS,
	className,
}: CardStackProps): React.ReactElement {
	const [activeIndex, setActiveIndex] = useState<number>(0);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	/**
	 * Advance the stack by one card.
	 *
	 * @returns Nothing
	 */
	const advanceCards = useCallback((): void => {
		if (items.length < 2) {
			return;
		}

		setActiveIndex((index) => {
			const length = items.length;
			return normalizeIndex(index - 1, length);
		});
	}, [items.length]);

	/**
	 * Start the auto-rotation interval and return cleanup when active.
	 *
	 * @returns Cleanup function when interval is enabled
	 */
	const startRotation = useCallback((): (() => void) | undefined => {
		if (intervalMs <= 0 || items.length < 2) {
			return undefined;
		}

		intervalRef.current = setInterval(advanceCards, intervalMs);

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		};
	}, [advanceCards, intervalMs, items.length]);

	const orderedCards = useMemo<CardStackItem[]>(() => {
		if (items.length === 0) {
			return [];
		}

		const normalizedIndex = normalizeIndex(activeIndex, items.length);
		return [...items.slice(normalizedIndex), ...items.slice(0, normalizedIndex)];
	}, [activeIndex, items]);

	/**
	 * Render an individual stacked card.
	 *
	 * @param card - Card data to render
	 * @param index - Index in the stack
	 * @returns The card JSX element
	 */
	const renderCard = (card: CardStackItem, index: number): React.ReactElement => (
		<motion.div
			key={card.id}
			className="absolute inset-0 flex flex-col justify-between rounded-3xl border border-neutral-200/80 bg-white/90 p-5 shadow-xl shadow-black/10 backdrop-blur dark:border-white/10 dark:bg-black/70 dark:shadow-white/5"
			style={{ transformOrigin: 'top center' }}
			animate={{
				top: index * -offset,
				scale: 1 - index * scaleFactor,
				zIndex: orderedCards.length - index,
			}}
		>
			<div className="text-sm font-normal text-neutral-700 dark:text-neutral-200">
				{card.content}
			</div>
			<div className="space-y-1">
				<p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
					{card.name}
				</p>
				<p className="text-xs font-medium text-neutral-500 dark:text-neutral-300">
					{card.designation}
				</p>
			</div>
		</motion.div>
	);

	useEffect(startRotation, [startRotation]);

	return (
		<div className={cn('relative h-72 w-full max-w-md', className)}>
			{orderedCards.map(renderCard)}
		</div>
	);
}
