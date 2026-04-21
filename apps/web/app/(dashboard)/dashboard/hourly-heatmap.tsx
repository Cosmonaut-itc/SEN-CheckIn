'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

import { Skeleton } from '@/components/ui/skeleton';
import type { HourlyActivity } from '@/lib/client-functions';

const HOURS = Array.from({ length: 15 }, (_, index) => index + 6);

/**
 * Props accepted by the hourly heatmap component.
 */
export interface HourlyHeatmapProps {
	data: HourlyActivity[];
	isLoading: boolean;
}

interface HourlyHeatmapSlot {
	hour: number;
	count: number;
	height: number;
	opacity: number;
}

interface HourlyHeatmapHeaderProps {
	rangeLabel: string;
	title: string;
}

/**
 * Renders the shared heatmap header used across all component states.
 *
 * @param props - Header content for the hourly heatmap.
 * @returns The hourly heatmap header markup.
 */
function HourlyHeatmapHeader({
	rangeLabel,
	title,
}: HourlyHeatmapHeaderProps): React.ReactElement {
	return (
		<header className="space-y-1">
			<h3 className="text-sm font-semibold text-foreground">{title}</h3>
			<p className="text-xs text-muted-foreground">{rangeLabel}</p>
		</header>
	);
}

/**
 * Formats an hour label for the chart axis in 24-hour notation.
 *
 * @param hour - Hour value to format.
 * @returns Localized axis label.
 */
function formatAxisLabel(hour: number): string {
	return `${hour}:00`;
}

/**
 * Builds the visible time-range subtitle from the configured chart hours.
 *
 * @returns Time-range subtitle for the heatmap header.
 */
function getRangeLabel(): string {
	return `${formatAxisLabel(HOURS[0] ?? 6)} - ${formatAxisLabel(HOURS[HOURS.length - 1] ?? 20)}`;
}

/**
 * Builds a normalized list of hour slots from the supplied activity data.
 *
 * @param data - Hourly activity records to normalize.
 * @returns The ordered set of hourly slots from 6 through 20.
 */
export function buildHourlySlots(data: HourlyActivity[]): HourlyHeatmapSlot[] {
	const counts = new Map<number, number>();

	for (const entry of data) {
		if (entry.hour < 6 || entry.hour > 20) {
			continue;
		}

		const currentCount = counts.get(entry.hour) ?? 0;
		counts.set(entry.hour, currentCount + entry.count);
	}

	const maxCount = Math.max(0, ...counts.values());

	return HOURS.map((hour) => {
		const count = counts.get(hour) ?? 0;
		const ratio = maxCount > 0 ? count / maxCount : 0;

		return {
			hour,
			count,
			height: ratio * 100,
			opacity: 0.2 + ratio * 0.8,
		};
	});
}

/**
 * Renders the hourly activity heat strip used in dashboard summaries.
 *
 * @param props - Hourly heatmap data and loading state.
 * @returns The hourly heatmap component.
 */
export function HourlyHeatmap({ data, isLoading }: HourlyHeatmapProps): React.ReactElement {
	const t = useTranslations('Dashboard');
	const rangeLabel = getRangeLabel();
	const slots = buildHourlySlots(data);
	const hasVisibleData = slots.some((slot) => slot.count > 0);

	if (isLoading) {
		return (
			<section aria-busy="true" aria-live="polite" className="space-y-4" data-testid="hourly-heatmap">
				<HourlyHeatmapHeader rangeLabel={rangeLabel} title={t('hourly.title')} />
				<div
					className="grid grid-cols-[repeat(15,minmax(0,1fr))] items-end gap-1 rounded-2xl border border-border/60 bg-[color:var(--bg-secondary)]/70 p-4"
					data-testid="hourly-heatmap-loading"
				>
					{HOURS.map((hour) => (
						<div key={hour} className="flex h-40 items-end">
							<Skeleton
								className="h-8 w-full rounded-t-md"
								data-testid="hourly-heatmap-loading-bar"
							/>
						</div>
					))}
				</div>
			</section>
		);
	}

	if (!hasVisibleData) {
		return (
			<section className="space-y-4" data-testid="hourly-heatmap">
				<HourlyHeatmapHeader rangeLabel={rangeLabel} title={t('hourly.title')} />
				<div
					className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-[color:var(--bg-secondary)]/60 px-4 py-8 text-center"
					data-testid="hourly-heatmap-empty"
				>
					<p className="text-sm text-muted-foreground">{t('hourly.empty')}</p>
				</div>
			</section>
		);
	}

	return (
		<section className="space-y-4" data-testid="hourly-heatmap">
			<HourlyHeatmapHeader rangeLabel={rangeLabel} title={t('hourly.title')} />
			<div className="space-y-3 rounded-2xl border border-border/60 bg-[color:var(--bg-secondary)]/70 p-4">
				<ul className="sr-only" aria-label={t('hourly.title')}>
					{slots.map((slot) => (
						<li key={`hourly-heatmap-summary-${slot.hour}`}>
							{`${formatAxisLabel(slot.hour)}: ${slot.count}`}
						</li>
					))}
				</ul>
				<div
					className="grid grid-cols-[repeat(15,minmax(0,1fr))] items-end gap-1"
					data-testid="hourly-heatmap-chart"
				>
					{slots.map((slot) => (
						<div key={slot.hour} className="flex h-40 items-end">
							<div className="flex h-full w-full items-end">
								<div
									aria-hidden="true"
									className="w-full rounded-t-md bg-[color:var(--accent-primary)] transition-[height,opacity] duration-300 motion-reduce:transition-none"
									data-count={slot.count}
									data-testid={`hourly-heatmap-bar-${slot.hour}`}
									style={{
										height: `${slot.height}%`,
										opacity: slot.opacity,
									}}
								/>
							</div>
						</div>
					))}
				</div>
				<div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1 text-[11px] font-medium text-muted-foreground">
					{HOURS.map((hour) => (
						<div key={hour} className="text-center" data-testid={`hourly-heatmap-axis-${hour}`}>
							{hour === 6 || hour === 12 || hour === 18 ? formatAxisLabel(hour) : ''}
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
