'use client';

import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toDateKeyInTimeZone } from '@/lib/time-zone';
import type { TimelineEvent } from '@/lib/client-functions';

/**
 * Allowed filter values for the activity timeline.
 */
type ActivityTimelineFilter = 'all' | 'in' | 'late' | 'offsite';

/**
 * Props for the activity timeline component.
 */
interface ActivityTimelineProps {
	events: TimelineEvent[];
	isLoading: boolean;
	filter: ActivityTimelineFilter;
	timeZone: string;
	onFilterChange: (filter: ActivityTimelineFilter) => void;
	/** Optional card class overrides for parent layouts. */
	className?: string;
}

/**
 * Visual style tokens for each activity category.
 */
interface ActivityStyleConfig {
	indicatorClassName: string;
	initialsClassName: string;
	pillClassName: string;
}

/**
 * Rendered event with layout metadata.
 */
interface PositionedTimelineEvent {
	event: TimelineEvent;
	category: Exclude<ActivityTimelineFilter, 'all'>;
	initials: string;
	leftPercent: number;
	laneIndex: number;
	shortName: string;
	timeLabel: string;
}

/**
 * Parsed timestamp parts used for deterministic layout and labels.
 */
interface ParsedTimestampParts {
	dateKey: string;
	hours: number;
	minutes: number;
}

const LANE_HEIGHT = 76;
const LANE_GAP = 14;
const MIN_PILL_WIDTH_MINUTES = 30;
const MAX_PILL_WIDTH_MINUTES = 54;

const STYLE_BY_CATEGORY: Record<Exclude<ActivityTimelineFilter, 'all'>, ActivityStyleConfig> = {
	in: {
		indicatorClassName: 'bg-success ring-1 ring-inset ring-success/20',
		initialsClassName: 'text-success',
		pillClassName: 'border-success/20 bg-success-bg/90 text-success shadow-sm',
	},
	late: {
		indicatorClassName: 'bg-warning ring-1 ring-inset ring-warning/20',
		initialsClassName: 'text-warning',
		pillClassName: 'border-warning/20 bg-warning-bg/90 text-warning shadow-sm',
	},
	offsite: {
		indicatorClassName: 'bg-info ring-1 ring-inset ring-info/20',
		initialsClassName: 'text-info',
		pillClassName: 'border-info/20 bg-info-bg/90 text-info shadow-sm',
	},
};

/**
 * Counts activity categories across the provided events.
 *
 * @param events - Visible timeline events.
 * @returns Category counters for the summary footer.
 */
function countActivityEvents(events: TimelineEvent[]): Record<Exclude<ActivityTimelineFilter, 'all'>, number> {
	return events.reduce(
		(accumulator, event) => {
			if (event.type === 'WORK_OFFSITE') {
				accumulator.offsite += 1;
			} else {
				accumulator.in += 1;
				if (event.isLate) {
					accumulator.late += 1;
				}
			}
			return accumulator;
		},
		{ in: 0, late: 0, offsite: 0 },
	);
}

/**
 * Determines whether an attendance event should render in the dashboard timeline.
 *
 * @param event - Timeline event to inspect
 * @returns True when the event belongs to the dashboard timeline
 */
function isRenderableTimelineEvent(event: TimelineEvent): boolean {
	return event.type === 'CHECK_IN' || event.type === 'WORK_OFFSITE';
}

/**
 * Determines the category for an attendance event.
 *
 * @param event - Timeline event to classify.
 * @returns The display category for the event.
 */
function resolveEventCategory(event: TimelineEvent): Exclude<ActivityTimelineFilter, 'all'> {
	if (event.type === 'WORK_OFFSITE') {
		return 'offsite';
	}

	if (event.isLate) {
		return 'late';
	}

	return 'in';
}

/**
 * Returns the filtered event set for the current timeline filter.
 *
 * @param events - Source timeline events.
 * @param filter - Active filter value.
 * @returns Filtered events to display.
 */
function filterTimelineEvents(
	events: TimelineEvent[],
	filter: ActivityTimelineFilter,
): TimelineEvent[] {
	if (filter === 'all') {
		return events;
	}

	if (filter === 'in') {
		return events.filter((event) => event.type === 'CHECK_IN');
	}

	return events.filter((event) => resolveEventCategory(event) === filter);
}

/**
 * Extracts deterministic date and time parts from an ISO timestamp.
 *
 * @param timestamp - Event timestamp string.
 * @param timeZone - Organization timezone used for display.
 * @returns Parsed date key and clock parts.
 */
function parseTimestampParts(timestamp: string, timeZone: string): ParsedTimestampParts {
	const wallClockMatch = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
	const hasExplicitTimeZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp);

	if (wallClockMatch && !hasExplicitTimeZone) {
		const [, year, month, day, hours, minutes] = wallClockMatch;
		return {
			dateKey: `${year}-${month}-${day}`,
			hours: Number(hours),
			minutes: Number(minutes),
		};
	}

	const parsedDate = new Date(timestamp);
	if (Number.isNaN(parsedDate.getTime())) {
		throw new Error(`Invalid timeline timestamp "${timestamp}".`);
	}

	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(parsedDate);
	const year = parts.find((part) => part.type === 'year')?.value;
	const month = parts.find((part) => part.type === 'month')?.value;
	const day = parts.find((part) => part.type === 'day')?.value;
	const hours = parts.find((part) => part.type === 'hour')?.value;
	const minutes = parts.find((part) => part.type === 'minute')?.value;

	if (!year || !month || !day || !hours || !minutes) {
		throw new Error(`Failed to resolve timeline time parts for timezone "${timeZone}".`);
	}

	return {
		dateKey: `${year}-${month}-${day}`,
		hours: Number(hours),
		minutes: Number(minutes),
	};
}

/**
 * Parses an ISO timestamp and returns the absolute minute value.
 *
 * @param timestamp - Event timestamp string.
 * @param timeZone - Organization timezone used for display.
 * @returns Minute value since the Unix epoch.
 */
function getTimelineMinute(timestamp: string, timeZone: string): number {
	const { dateKey, hours, minutes } = parseTimestampParts(timestamp, timeZone);
	const [year, month, day] = dateKey.split('-').map(Number);
	const epochDay = Math.floor(Date.UTC(year!, month! - 1, day!) / 86_400_000);

	return epochDay * 1_440 + hours * 60 + minutes;
}

/**
 * Formats a timestamp in 24-hour clock notation.
 *
 * @param timestamp - Event timestamp string.
 * @param timeZone - Organization timezone used for display.
 * @returns Clock label such as 07:00.
 */
function formatClock(timestamp: string, timeZone: string): string {
	const { hours, minutes } = parseTimestampParts(timestamp, timeZone);
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Formats an absolute minute value for the timeline axis.
 *
 * @param timelineMinute - Minute value since the Unix epoch.
 * @returns Clock label such as 07:00 in the local timezone.
 */
function formatAxisTickLabel(timelineMinute: number): string {
	const normalizedMinute = ((timelineMinute % 1_440) + 1_440) % 1_440;
	const hours = Math.floor(normalizedMinute / 60);
	const minutes = normalizedMinute % 60;

	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Returns the initials used inside the avatar circle.
 *
 * @param name - Employee display name.
 * @returns Uppercase initials.
 */
function getInitials(name: string): string {
	const parts = name
		.trim()
		.split(/\s+/)
		.filter(Boolean);

	if (parts.length === 0) {
		return '';
	}

	const firstInitial = parts[0]?.[0] ?? '';
	const lastInitial = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';

	return `${firstInitial}${lastInitial}`.toUpperCase();
}

/**
 * Shortens a full employee name for compact pill rendering.
 *
 * @param name - Employee display name.
 * @returns Compact name string.
 */
function abbreviateName(name: string): string {
	const parts = name
		.trim()
		.split(/\s+/)
		.filter(Boolean);

	if (parts.length === 0) {
		return '';
	}

	if (parts.length === 1) {
		return parts[0]!;
	}

	const firstName = parts[0]!;
	const lastName = parts[parts.length - 1]!;

	return `${firstName} ${lastName.slice(0, 3)}.`;
}

/**
 * Estimates the pill width in minutes so the lane packing can avoid overlap.
 *
 * @param event - Timeline event being laid out.
 * @returns Estimated width in minutes.
 */
function estimatePillWidthMinutes(event: TimelineEvent): number {
	const estimated = 20 + event.employeeName.trim().length * 1.3;
	return Math.max(MIN_PILL_WIDTH_MINUTES, Math.min(MAX_PILL_WIDTH_MINUTES, Math.round(estimated)));
}

/**
 * Resolves the time axis range for the current data set.
 *
 * @param events - Visible timeline events.
 * @param timeZone - Organization timezone used for display.
 * @returns Axis start, end, and tick labels.
 */
function resolveAxisRange(events: TimelineEvent[], timeZone: string): {
	endMinutes: number;
	startMinutes: number;
	ticks: number[];
} {
	if (events.length === 0) {
		const todayDateKey = toDateKeyInTimeZone(new Date(), timeZone);
		const [year, month, day] = todayDateKey.split('-').map(Number);
		const epochDay = Math.floor(Date.UTC(year!, month! - 1, day!) / 86_400_000);
		const startMinutes = epochDay * 1_440 + 7 * 60;
		const endMinutes = epochDay * 1_440 + 10 * 60;
		const ticks = [
			startMinutes,
			startMinutes + 60,
			startMinutes + 120,
			endMinutes,
		];
		return {
			startMinutes,
			endMinutes,
			ticks,
		};
	}

	const minutes = events.map((event) => getTimelineMinute(event.timestamp, timeZone));
	const earliest = Math.min(...minutes);
	const latest = Math.max(...minutes);
	const startMinutes = Math.floor(earliest / 60) * 60;
	const endMinutes = Math.ceil(latest / 60) * 60;
	const normalizedEndMinutes = endMinutes <= startMinutes ? startMinutes + 60 : endMinutes;
	const ticks: number[] = [];

	for (let currentMinute = startMinutes; currentMinute <= normalizedEndMinutes; currentMinute += 60) {
		ticks.push(currentMinute);
	}

	return {
		startMinutes,
		endMinutes: normalizedEndMinutes,
		ticks,
	};
}

/**
 * Packs timeline events into rows using a greedy overlap-avoidance algorithm.
 *
 * @param events - Visible and already filtered timeline events.
 * @param timeZone - Organization timezone used for display.
 * @returns Positioned events with left offsets and lane indexes.
 */
function layoutTimelineEvents(events: TimelineEvent[], timeZone: string): PositionedTimelineEvent[] {
	if (events.length === 0) {
		return [];
	}

	const sortedEvents = [...events].sort((left, right) => {
		return getTimelineMinute(left.timestamp, timeZone) - getTimelineMinute(right.timestamp, timeZone);
	});
	const { startMinutes, endMinutes } = resolveAxisRange(sortedEvents, timeZone);
	const spanMinutes = Math.max(endMinutes - startMinutes, 1);
	const laneAvailability: number[] = [];

	return sortedEvents.map((event) => {
		const minuteOfDay = getTimelineMinute(event.timestamp, timeZone);
		const estimatedWidthMinutes = estimatePillWidthMinutes(event);
		const laneIndex = laneAvailability.findIndex((availableMinute) => minuteOfDay >= availableMinute);
		const resolvedLaneIndex = laneIndex === -1 ? laneAvailability.length : laneIndex;

		laneAvailability[resolvedLaneIndex] = minuteOfDay + estimatedWidthMinutes + LANE_GAP;

		return {
			event,
			category: resolveEventCategory(event),
			initials: getInitials(event.employeeName),
			leftPercent: ((minuteOfDay - startMinutes) / spanMinutes) * 100,
			laneIndex: resolvedLaneIndex,
			shortName: abbreviateName(event.employeeName),
			timeLabel: formatClock(event.timestamp, timeZone),
		};
	});
}

/**
 * Returns the chip styles for a filter option.
 *
 * @param isActive - Whether the filter is currently selected.
 * @returns Class names for the filter chip.
 */
function getFilterChipClassName(isActive: boolean): string {
	return cn(
		'inline-flex min-h-10 items-center justify-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-primary)] focus-visible:ring-offset-2',
		isActive
			? 'border-transparent bg-[color:var(--accent-primary)] text-white shadow-sm'
			: 'border-[color:var(--border-default)] bg-background text-muted-foreground hover:border-[color:var(--accent-primary)] hover:text-[color:var(--accent-primary)]',
	);
}

/**
 * Renders a compact loading skeleton row.
 *
 * @returns Skeleton placeholder element.
 */
function ActivityTimelineSkeleton(): React.ReactElement {
	return (
		<div className="space-y-4">
			<div className="flex flex-wrap gap-2">
				<Skeleton className="h-10 w-20 rounded-full" />
				<Skeleton className="h-10 w-24 rounded-full" />
				<Skeleton className="h-10 w-24 rounded-full" />
				<Skeleton className="h-10 w-24 rounded-full" />
			</div>
			<div className="space-y-3 rounded-2xl border border-[color:var(--border-subtle)] bg-background/60 p-4">
				{Array.from({ length: 4 }, (_, index) => (
					<div key={`timeline-skeleton-${index}`} className="flex items-center gap-3">
						<Skeleton data-testid="activity-timeline-skeleton" className="h-10 w-10 rounded-full" />
						<div className="min-w-0 flex-1 space-y-2">
							<Skeleton className="h-4 w-36" />
							<Skeleton className="h-3 w-24" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

/**
 * Activity timeline component used on the dashboard.
 *
 * @param props - Timeline events, loading flag, and current filter state.
 * @param timeZone - Organization timezone used for display.
 * @returns Rendered activity timeline.
 */
function ActivityTimeline({
	events,
	isLoading,
	filter,
	timeZone,
	onFilterChange,
	className,
}: ActivityTimelineProps): React.ReactElement {
	const t = useTranslations('Dashboard.timeline');
	const renderableEvents = useMemo(
		() => events.filter(isRenderableTimelineEvent),
		[events],
	);
	const visibleEvents = useMemo(
		() => filterTimelineEvents(renderableEvents, filter),
		[filter, renderableEvents],
	);
	const filterOptions = useMemo<Array<{ label: string; value: ActivityTimelineFilter }>>(
		() => [
			{ value: 'all', label: t('filters.all') },
			{ value: 'in', label: t('filters.checkIn') },
			{ value: 'late', label: t('filters.late') },
			{ value: 'offsite', label: t('filters.offsite') },
		],
		[t],
	);
	const counts = useMemo(() => countActivityEvents(visibleEvents), [visibleEvents]);
	const axisRange = useMemo(() => resolveAxisRange(visibleEvents, timeZone), [timeZone, visibleEvents]);
	const positionedEvents = useMemo(
		() => layoutTimelineEvents(visibleEvents, timeZone),
		[timeZone, visibleEvents],
	);
	const summaryText = useMemo(
		() => {
			const checkInLabel = counts.in === 1 ? t('event.checkIn') : t('filters.checkIn');
			const lateLabel = counts.late === 1 ? t('event.late') : t('filters.late');
			const offsiteLabel =
				counts.offsite === 1 ? t('event.offsite') : t('filters.offsite');

			return `${counts.in} ${checkInLabel.toLowerCase()} ${counts.late} ${lateLabel.toLowerCase()} ${counts.offsite} ${offsiteLabel.toLowerCase()}`;
		},
		[counts, t],
	);
	const trackHeight = Math.max(164, positionedEvents.reduce((maxLane, event) => Math.max(maxLane, event.laneIndex), 0) * LANE_HEIGHT + 96);
	const hasVisibleEvents = visibleEvents.length > 0;

	if (isLoading) {
		return <ActivityTimelineSkeleton />;
	}

	return (
		<Card
			className={cn(
				'overflow-hidden border-[color:var(--border-subtle)] bg-card shadow-sm',
				className,
			)}
		>
			<CardContent className="flex min-h-0 flex-1 flex-col gap-5 p-4 sm:p-6">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="space-y-1">
						<p className="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">
							{t('eyebrow')}
						</p>
						<p className="text-lg font-semibold text-foreground">{t('title')}</p>
					</div>
					<div className="flex flex-wrap gap-2">
						{filterOptions.map((option) => (
							<Badge key={option.value} asChild variant="neutral">
								<button
									type="button"
									aria-pressed={filter === option.value}
									className={getFilterChipClassName(filter === option.value)}
									onClick={() => onFilterChange(option.value)}
								>
									{option.label}
								</button>
							</Badge>
						))}
					</div>
				</div>

				{hasVisibleEvents ? (
					<ScrollArea className="w-full min-h-0 flex-1 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)]/50">
						<div className="min-w-[780px] p-4">
							<div className="relative h-10">
								<div className="absolute left-0 right-0 top-5 h-px bg-border/70" />
								{axisRange.ticks.map((minute) => {
									const tickPercent =
										((minute - axisRange.startMinutes) /
											Math.max(axisRange.endMinutes - axisRange.startMinutes, 1)) *
										100;

									return (
										<div
											key={`tick-${minute}`}
											className="absolute top-0 -translate-x-1/2 text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground"
											style={{ left: `${tickPercent}%` }}
										>
											{formatAxisTickLabel(minute)}
										</div>
									);
								})}
							</div>

							<div className="relative mt-2" style={{ height: `${trackHeight}px` }}>
								{Array.from(
									{ length: Math.max(...positionedEvents.map((event) => event.laneIndex), 0) + 1 },
									(_, laneIndex) => (
										<div
											key={`lane-${laneIndex}`}
											className="absolute left-0 right-0 border-t border-dashed border-[color:var(--border-subtle)]/70"
											style={{
												top: `${laneIndex * LANE_HEIGHT + 24}px`,
											}}
										/>
									),
								)}

								{positionedEvents.map((item) => {
									const styleConfig = STYLE_BY_CATEGORY[item.category];

									return (
										<div
											key={item.event.id}
											data-testid="activity-timeline-pill"
											className={cn(
												'absolute z-10 flex w-[13.5rem] -translate-x-1/2 items-center gap-2 rounded-2xl border px-3 py-2.5 backdrop-blur-sm',
												styleConfig.pillClassName,
											)}
											style={{
												left: `${item.leftPercent}%`,
												top: `${item.laneIndex * LANE_HEIGHT + 8}px`,
											}}
										>
											<div className="flex shrink-0 items-center gap-1.5">
												<span
													className={cn(
														'inline-flex size-4 shrink-0 rounded-full',
														styleConfig.indicatorClassName,
													)}
												/>
												<span
													className={cn(
														'text-[0.72rem] font-semibold uppercase tracking-[0.16em]',
														styleConfig.initialsClassName,
													)}
												>
													{item.initials}
												</span>
											</div>
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-semibold leading-tight">
													{item.shortName}
												</p>
												<p className="mt-1 font-mono text-[11px] uppercase tracking-[0.3em] text-current/70">
													{item.timeLabel}
												</p>
											</div>
										</div>
									);
								})}
							</div>
						</div>
					</ScrollArea>
				) : (
					<div className="flex min-h-[220px] flex-1 items-center justify-center rounded-2xl border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)]/50 px-6 text-center">
						<div className="max-w-sm space-y-2">
							<p className="text-base font-semibold text-foreground">{t('empty')}</p>
						</div>
					</div>
				)}

				<div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--border-subtle)] pt-4 text-sm text-muted-foreground">
					<p>{summaryText}</p>
				</div>
			</CardContent>
		</Card>
	);
}

export { ActivityTimeline };
export type { ActivityTimelineProps };
