'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Props for the HeroStatCard component.
 */
export interface HeroStatCardProps {
	onTime: number;
	total: number;
	late: number;
	absent: number;
	offsite: number;
	isLoading: boolean;
}

type HeroStatChipKey = 'late' | 'absent' | 'offsite';

type HeroStatChipConfig = {
	key: HeroStatChipKey;
	dotClassName: string;
};

const HERO_STAT_CHIPS: HeroStatChipConfig[] = [
	{
		key: 'late',
		dotClassName: 'bg-[var(--status-warning)]',
	},
	{
		key: 'absent',
		dotClassName: 'bg-[var(--status-error)]',
	},
	{
		key: 'offsite',
		dotClassName: 'bg-[var(--status-info)]',
	},
];

/**
 * Formats a number for display in the hero card.
 *
 * @param value - Numeric value to format.
 * @returns Locale-aware string representation.
 */
function formatCount(value: number): string {
	return new Intl.NumberFormat('es-MX').format(value);
}

/**
 * Resolves the label for a status chip, handling singular and plural forms.
 *
 * @param t - Dashboard hero translations helper.
 * @param key - Status chip identifier.
 * @param count - Status count for pluralization.
 * @returns Localized label string.
 */
function getChipLabel(
	t: ReturnType<typeof useTranslations>,
	key: HeroStatChipKey,
	count: number,
): string {
	if (key === 'late') {
		return count === 1 ? t('late', { count }) : t('lateP', { count });
	}
	if (key === 'absent') {
		return count === 1 ? t('absent', { count }) : t('absentP', { count });
	}
	return t('offsite', { count });
}

/**
 * Renders the dashboard hero attendance summary card.
 *
 * @param props - Summary totals and loading state.
 * @returns A hero stat card showing on-time attendance and issue chips.
 */
export function HeroStatCard({
	onTime,
	total,
	late,
	absent,
	offsite,
	isLoading,
}: HeroStatCardProps): React.ReactElement {
	const t = useTranslations('Dashboard.hero');

	if (isLoading) {
		return (
			<Card className="overflow-hidden border-foreground/10 bg-foreground text-background shadow-[var(--shadow-lg)]">
				<CardContent className="space-y-5 p-5 sm:p-6">
					<div className="space-y-3">
						<Skeleton className="h-14 w-40 bg-background/15" />
						<Skeleton className="h-4 w-28 bg-background/15" />
					</div>
					<div className="flex flex-wrap gap-2">
						<Skeleton className="h-7 w-24 rounded-full bg-background/15" />
						<Skeleton className="h-7 w-24 rounded-full bg-background/15" />
						<Skeleton className="h-7 w-24 rounded-full bg-background/15" />
					</div>
				</CardContent>
			</Card>
		);
	}

	const chips = HERO_STAT_CHIPS.map((chip) => {
		const count = chip.key === 'late' ? late : chip.key === 'absent' ? absent : offsite;
		return {
			...chip,
			count,
			label: getChipLabel(t, chip.key, count),
		};
	});

	return (
		<Card className="overflow-hidden border-foreground/10 bg-foreground text-background shadow-[var(--shadow-lg)]">
			<CardContent className="space-y-5 p-5 sm:p-6">
				<div className="space-y-2">
					<p className="text-sm font-medium text-background/75">{t('onTime')}</p>
					<div className="flex flex-wrap items-end gap-2 leading-none">
						<span className="text-5xl font-semibold tracking-tight sm:text-6xl">
							{formatCount(onTime)}
						</span>
						<span className="pb-1 text-lg font-medium text-background/65 sm:text-xl">
							/ {formatCount(total)}
						</span>
					</div>
				</div>

				<div className="flex flex-wrap gap-2">
					{chips.map((chip) => (
						<span
							key={chip.key}
							className="inline-flex items-center gap-2 rounded-full border border-background/15 bg-background/10 px-3 py-1 text-sm font-medium text-background/90"
						>
							<span className={`size-2 rounded-full ${chip.dotClassName}`} />
							<span>{chip.label}</span>
						</span>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
