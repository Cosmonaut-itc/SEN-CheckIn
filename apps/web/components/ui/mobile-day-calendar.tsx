'use client';

import type React from 'react';
import { type Locale, addDays, format, isAfter, isBefore, isSameDay, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Day-level schedule entry data for the mobile calendar.
 */
export interface MobileDayCalendarDay {
	/** Day key or ISO date string. */
	date: string;
	/** Whether this day is a working day. */
	isWorkingDay: boolean;
	/** Start time in HH:mm or null when there is no shift. */
	startTime: string | null;
	/** End time in HH:mm or null when there is no shift. */
	endTime: string | null;
	/** Source that generated the schedule entry. */
	source: 'template' | 'manual' | 'exception' | 'none';
	/** Optional reason associated with the entry. */
	reason?: string | null;
}

/**
 * Employee row rendered inside the mobile day calendar.
 */
export interface MobileDayCalendarEntry {
	/** Employee identifier. */
	employeeId: string;
	/** Employee full name. */
	employeeName: string;
	/** Shift type label or enum value. */
	shiftType: string;
	/** Day-level entries for the current range. */
	days: MobileDayCalendarDay[];
}

/**
 * Props for the mobile day calendar component.
 */
export interface MobileDayCalendarProps {
	/** Selected day rendered in the calendar. */
	date: Date;
	/** Employee schedule entries for the active week. */
	employees: MobileDayCalendarEntry[];
	/** Callback triggered when the selected day changes. */
	onDateChange: (date: Date) => void;
	/** Inclusive week range used to clamp navigation. */
	weekRange: {
		/** Week start date. */
		start: Date;
		/** Week end date. */
		end: Date;
	};
	/** Optional class name applied to the root element. */
	className?: string;
	/** Optional date-fns locale used to format the title. */
	locale?: Locale;
}

/**
 * Capitalizes the first character of a formatted date label.
 *
 * @param value - Input string
 * @returns Capitalized string
 */
function capitalize(value: string): string {
	if (value.length === 0) {
		return value;
	}
	return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/**
 * Normalizes a date-like string to a local day for comparison.
 *
 * @param value - ISO date string or day key
 * @returns Parsed Date
 */
function parseCalendarDay(value: string): Date {
	if (value.length === 10) {
		const [year, month, day] = value.split('-').map(Number);
		return new Date(year, month - 1, day);
	}
	return toUtcCalendarDateLocal(new Date(value));
}

/**
 * Converts a UTC calendar date to a local date representation for stable rendering.
 *
 * @param value - Reference date
 * @returns Local date that preserves the UTC calendar day
 */
function toUtcCalendarDateLocal(value: Date): Date {
	return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

/**
 * Converts a local calendar date to a UTC midnight date.
 *
 * @param value - Local calendar date
 * @returns UTC midnight date
 */
function toUtcMidnight(value: Date): Date {
	return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
}

/**
 * Resolves the translated badge variant for a schedule source.
 *
 * @param source - Source value
 * @returns Badge variant token
 */
function resolveSourceVariant(
	source: MobileDayCalendarDay['source'],
): 'default' | 'secondary' | 'outline' {
	switch (source) {
		case 'manual':
			return 'default';
		case 'exception':
			return 'secondary';
		case 'template':
			return 'outline';
		default:
			return 'outline';
	}
}

/**
 * Renders a single-day mobile schedule calendar with bounded week navigation.
 *
 * @param props - Component props
 * @returns Mobile day calendar element
 */
export function MobileDayCalendar({
	date,
	employees,
	onDateChange,
	weekRange,
	className,
	locale = es,
}: MobileDayCalendarProps): React.ReactElement {
	const t = useTranslations('ResponsiveCalendar');
	const selectedDate = startOfDay(toUtcCalendarDateLocal(date));
	const weekStart = startOfDay(toUtcCalendarDateLocal(weekRange.start));
	const weekEnd = startOfDay(toUtcCalendarDateLocal(weekRange.end));
	const canGoPrevious = isAfter(selectedDate, weekStart);
	const canGoNext = isBefore(selectedDate, weekEnd);
	const title = capitalize(format(selectedDate, 'EEEE d MMM yyyy', { locale }));

	/**
	 * Moves the selected date by a fixed number of days.
	 *
	 * @param delta - Positive or negative number of days
	 * @returns Nothing
	 */
	const moveDate = (delta: number): void => {
		const nextDate = startOfDay(addDays(selectedDate, delta));
		if (isBefore(nextDate, weekStart) || isAfter(nextDate, weekEnd)) {
			return;
		}
		onDateChange(toUtcMidnight(nextDate));
	};

	return (
		<section
			data-testid="mobile-day-calendar"
			className={cn('space-y-4', className)}
		>
			<Card className="overflow-hidden border-border/80 bg-card shadow-[var(--shadow-lg)]">
				<CardContent className="flex items-center gap-3 p-4">
					<Button
						type="button"
						variant="outline"
						className="min-h-11 min-w-11 rounded-full"
						data-testid="mobile-day-calendar-previous"
						onClick={() => moveDate(-1)}
						disabled={!canGoPrevious}
						aria-label={t('previousDay')}
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<div className="min-w-0 flex-1 text-center">
						<p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
							{t('weekView')}
						</p>
						<p className="truncate text-base font-semibold text-foreground">{title}</p>
					</div>
					<Button
						type="button"
						variant="outline"
						className="min-h-11 min-w-11 rounded-full"
						data-testid="mobile-day-calendar-next"
						onClick={() => moveDate(1)}
						disabled={!canGoNext}
						aria-label={t('nextDay')}
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</CardContent>
			</Card>

			<div className="grid gap-3">
				{employees.length === 0 ? (
					<Card className="border-dashed border-border/70 bg-card/70">
						<CardContent className="py-8 text-center text-sm text-muted-foreground">
							{t('empty')}
						</CardContent>
					</Card>
				) : (
					employees.map((employee) => {
						const currentDay =
							employee.days.find((day) =>
								isSameDay(parseCalendarDay(day.date), selectedDate),
							) ?? null;

						return (
							<Card
								key={employee.employeeId}
								className="overflow-hidden border-border/80 shadow-[var(--shadow-lg)]"
							>
								<CardHeader className="gap-3 border-b border-border/60 bg-muted/30 pb-4">
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0 space-y-1">
											<CardTitle className="truncate text-base">
												{employee.employeeName}
											</CardTitle>
											<p className="text-sm text-muted-foreground">
												{employee.shiftType}
											</p>
										</div>
										{currentDay ? (
											<Badge variant={resolveSourceVariant(currentDay.source)}>
												{t(`sources.${currentDay.source}`)}
											</Badge>
										) : null}
									</div>
								</CardHeader>
								<CardContent className="space-y-3 p-4">
									<div className="min-h-11 rounded-2xl bg-muted/50 px-3 py-3">
										<p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
											{t('scheduleLabel')}
										</p>
										<p className="mt-1 text-sm font-medium text-foreground">
											{currentDay?.isWorkingDay && currentDay.startTime && currentDay.endTime
												? `${currentDay.startTime} - ${currentDay.endTime}`
												: t('noShift')}
										</p>
									</div>
									{currentDay?.reason ? (
										<div className="rounded-2xl border border-border/70 bg-card px-3 py-3 text-sm text-muted-foreground">
											<span className="font-medium text-foreground">
												{t('reasonLabel')}
											</span>{' '}
											{currentDay.reason}
										</div>
									) : null}
								</CardContent>
							</Card>
						);
					})
				)}
			</div>
		</section>
	);
}
