'use client';

import React, { useMemo, useState } from 'react';
import { eachDayOfInterval, format, getDay } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { CalendarDay, CalendarEmployee, Employee, Location } from '@/lib/client-functions';
import { formatMonthDayUtc } from '@/lib/date-format';

type LocationSummary = Pick<Location, 'id' | 'name'>;
type CheckedState = boolean | 'indeterminate';

const EMPLOYEE_MARKER_CLASSES = [
	'bg-sky-500',
	'bg-indigo-500',
	'bg-violet-500',
	'bg-fuchsia-500',
	'bg-rose-500',
	'bg-amber-500',
	'bg-emerald-500',
	'bg-teal-500',
] as const;

type EmployeeMarkerClass = (typeof EMPLOYEE_MARKER_CLASSES)[number];

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type DayKey = (typeof DAY_KEYS)[number];

const SOURCE_LABEL_KEYS = {
	template: 'calendar.locationCard.badges.source.template',
	manual: 'calendar.locationCard.badges.source.manual',
	exception: 'calendar.locationCard.badges.source.exception',
	none: 'calendar.locationCard.badges.source.none',
} as const satisfies Record<CalendarDay['source'], string>;

const EXCEPTION_TYPE_LABEL_KEYS = {
	DAY_OFF: 'calendar.locationCard.badges.exceptionType.DAY_OFF',
	MODIFIED: 'calendar.locationCard.badges.exceptionType.MODIFIED',
	EXTRA_DAY: 'calendar.locationCard.badges.exceptionType.EXTRA_DAY',
} as const satisfies Record<NonNullable<CalendarDay['exceptionType']>, string>;

/**
 * Props for the LocationScheduleCard component.
 */
interface LocationScheduleCardProps {
	/** Location being rendered */
	location: LocationSummary;
	/** Employees belonging to the location (used for filtering) */
	employeesInLocation: Employee[];
	/** Calendar entries scoped to the location */
	calendarEmployeesInLocation: CalendarEmployee[];
	/** View mode */
	viewMode: 'week' | 'month';
	/** Range start (UTC midnight) */
	rangeStart: Date;
	/** Range end (UTC midnight) */
	rangeEnd: Date;
	/** Week start day (0=Sun, 1=Mon, ...) */
	weekStartDay: number;
}

/**
 * Display row for a single expected employee on a given day.
 */
interface ExpectedEmployeeEntry {
	employeeId: string;
	employeeName: string;
	startTime: string;
	endTime: string;
	source: CalendarDay['source'];
	exceptionType?: CalendarDay['exceptionType'];
}

/**
 * Display row for a justified absence entry on a given day.
 */
interface JustifiedAbsenceEntry {
	employeeId: string;
	employeeName: string;
	reason: string | null;
}

/**
 * Converts a date to a local date representing the same UTC calendar day.
 *
 * @param date - Reference date
 * @returns Local date with UTC year/month/day
 */
function toUtcCalendarDateLocal(date: Date): Date {
	return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Converts a local calendar date to a UTC midnight date.
 *
 * @param date - Local calendar date
 * @returns Date at UTC midnight for the provided calendar day
 */
function toUtcMidnight(date: Date): Date {
	return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/**
 * Formats a UTC-calendar date as `yyyy-MM-dd` for CalendarDay matching.
 *
 * @param dateUtc - Date representing a UTC day boundary
 * @returns UTC date key string
 */
function formatUtcDateKey(dateUtc: Date): string {
	return format(toUtcCalendarDateLocal(dateUtc), 'yyyy-MM-dd');
}

/**
 * Derives the day-of-week index for a UTC-calendar date.
 *
 * @param dateUtc - Date representing a UTC day boundary
 * @returns Day of week index (0=Sun .. 6=Sat)
 */
function getUtcDayOfWeekIndex(dateUtc: Date): number {
	return getDay(toUtcCalendarDateLocal(dateUtc));
}

/**
 * Maps a calendar source to a Badge variant.
 *
 * @param source - Calendar entry source
 * @returns Badge variant
 */
function sourceVariant(source: CalendarDay['source']): 'default' | 'secondary' | 'outline' {
	if (source === 'template') {
		return 'secondary';
	}
	if (source === 'exception') {
		return 'outline';
	}
	return 'default';
}

/**
 * Computes a stable, non-cryptographic hash for a string.
 *
 * @param value - Input string
 * @returns Unsigned 32-bit hash number
 */
function hashString(value: string): number {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

/**
 * Selects a deterministic marker color for an employee.
 *
 * @param employeeId - Employee identifier
 * @returns Tailwind class name for the marker
 */
function employeeMarkerClass(employeeId: string): EmployeeMarkerClass {
	const index = hashString(employeeId) % EMPLOYEE_MARKER_CLASSES.length;
	return EMPLOYEE_MARKER_CLASSES[index] ?? EMPLOYEE_MARKER_CLASSES[0];
}

/**
 * Location-scoped calendar card with per-day expected employees.
 *
 * @param props - Component props
 * @returns Rendered location schedule card
 */
export function LocationScheduleCard({
	location,
	employeesInLocation,
	calendarEmployeesInLocation,
	viewMode,
	rangeStart,
	rangeEnd,
	weekStartDay,
}: LocationScheduleCardProps): React.ReactElement {
	const t = useTranslations('Schedules');
	const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);

	const employeeOptions = useMemo(() => {
		const byEmployeeId = new Map<string, string>();

		for (const employee of employeesInLocation) {
			byEmployeeId.set(employee.id, `${employee.firstName} ${employee.lastName}`);
		}

		if (byEmployeeId.size === 0) {
			for (const calendarEmployee of calendarEmployeesInLocation) {
				byEmployeeId.set(calendarEmployee.employeeId, calendarEmployee.employeeName);
			}
		}

		return Array.from(byEmployeeId.entries())
			.map(([id, name]) => ({ id, name }))
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [calendarEmployeesInLocation, employeesInLocation]);

	const employeeIds = useMemo(() => employeeOptions.map((opt) => opt.id), [employeeOptions]);

	const effectiveSelectedEmployeeIds = useMemo(() => {
		if (selectedEmployeeIds.length === 0) {
			return [];
		}
		const valid = new Set(employeeIds);
		const next = selectedEmployeeIds.filter((id) => valid.has(id));
		return next.length === 0 ? [] : next;
	}, [employeeIds, selectedEmployeeIds]);

	/**
	 * Updates the internal employee filter state.
	 *
	 * Empty state means "all employees" for UX simplicity.
	 *
	 * @param employeeId - Employee identifier
	 * @param checked - Checkbox state from Radix
	 */
	const handleEmployeeCheckedChange = (employeeId: string, checked: CheckedState): void => {
		const isChecked = checked === true;
		setSelectedEmployeeIds((current) => {
			if (employeeIds.length === 0) {
				return [];
			}

			// Empty array means "all employees selected"
			if (current.length === 0) {
				if (isChecked) {
					return current;
				}
				const next = employeeIds.filter((id) => id !== employeeId);
				return next.length === employeeIds.length ? [] : next;
			}

			if (isChecked) {
				if (current.includes(employeeId)) {
					return current;
				}
				const next = [...current, employeeId];
				return next.length === employeeIds.length ? [] : next;
			}

			const next = current.filter((id) => id !== employeeId);
			return next.length === 0 ? current : next;
		});
	};

	/**
	 * Clears the employee filter (shows all employees).
	 */
	const handleSelectAll = (): void => {
		setSelectedEmployeeIds([]);
	};

	const filteredCalendarEmployees = useMemo(() => {
		if (effectiveSelectedEmployeeIds.length === 0) {
			return calendarEmployeesInLocation;
		}
		const selected = new Set(effectiveSelectedEmployeeIds);
		return calendarEmployeesInLocation.filter((entry) => selected.has(entry.employeeId));
	}, [calendarEmployeesInLocation, effectiveSelectedEmployeeIds]);

	const expectedByDate = useMemo(() => {
		const map = new Map<string, ExpectedEmployeeEntry[]>();

		for (const employeeEntry of filteredCalendarEmployees) {
			for (const day of employeeEntry.days) {
				if (!day.isWorkingDay || !day.startTime || !day.endTime) {
					continue;
				}

				const list = map.get(day.date) ?? [];
				list.push({
					employeeId: employeeEntry.employeeId,
					employeeName: employeeEntry.employeeName,
					startTime: day.startTime,
					endTime: day.endTime,
					source: day.source,
					exceptionType: day.exceptionType,
				});
				map.set(day.date, list);
			}
		}

		for (const [key, list] of map.entries()) {
			list.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
			map.set(key, list);
		}

		return map;
	}, [filteredCalendarEmployees]);

	const justifiedAbsencesByDate = useMemo(() => {
		const map = new Map<string, JustifiedAbsenceEntry[]>();

		for (const employeeEntry of filteredCalendarEmployees) {
			for (const day of employeeEntry.days) {
				if (day.source !== 'exception' || day.exceptionType !== 'DAY_OFF') {
					continue;
				}

				const list = map.get(day.date) ?? [];
				list.push({
					employeeId: employeeEntry.employeeId,
					employeeName: employeeEntry.employeeName,
					reason: day.reason ?? null,
				});
				map.set(day.date, list);
			}
		}

		for (const [key, list] of map.entries()) {
			list.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
			map.set(key, list);
		}

		return map;
	}, [filteredCalendarEmployees]);

	const daysInRangeUtc = useMemo(() => {
		const daysLocal = eachDayOfInterval({
			start: toUtcCalendarDateLocal(rangeStart),
			end: toUtcCalendarDateLocal(rangeEnd),
		});
		return daysLocal.map((day) => toUtcMidnight(day));
	}, [rangeEnd, rangeStart]);

	const filterLabel =
		effectiveSelectedEmployeeIds.length === 0
			? t('calendar.locationCard.filter.all')
			: t('calendar.locationCard.filter.selected', {
					count: effectiveSelectedEmployeeIds.length,
				});

	return (
		<Card>
			<CardHeader className="space-y-1">
				<div className="flex items-center justify-between gap-2">
					<CardTitle className="text-base font-semibold">{location.name}</CardTitle>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="sm" disabled={employeeIds.length === 0}>
								{filterLabel}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-[260px]">
							<DropdownMenuLabel>
								{t('calendar.locationCard.filter.menuLabel')}
							</DropdownMenuLabel>
							<DropdownMenuCheckboxItem
								checked={effectiveSelectedEmployeeIds.length === 0}
								onCheckedChange={() => handleSelectAll()}
							>
								{t('calendar.locationCard.filter.selectAll')}
							</DropdownMenuCheckboxItem>
							<DropdownMenuSeparator />
							{employeeOptions.map((employee) => (
								<DropdownMenuCheckboxItem
									key={employee.id}
									checked={
										effectiveSelectedEmployeeIds.length === 0 ||
										effectiveSelectedEmployeeIds.includes(employee.id)
									}
									onCheckedChange={(checked) =>
										handleEmployeeCheckedChange(employee.id, checked)
									}
								>
									{employee.name}
								</DropdownMenuCheckboxItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<div className="text-xs text-muted-foreground">
					{t('calendar.locationCard.employeeCount', { count: employeeIds.length })}
				</div>
			</CardHeader>
			<CardContent>
				{viewMode === 'week' ? (
					<TooltipProvider>
						<div className="grid grid-cols-7 gap-2">
							{daysInRangeUtc.slice(0, 7).map((dayUtc) => {
								const dayKey = formatUtcDateKey(dayUtc);
								const expected = expectedByDate.get(dayKey) ?? [];
								const justified = justifiedAbsencesByDate.get(dayKey) ?? [];
								const dayOfWeekIndex = getUtcDayOfWeekIndex(dayUtc);
								const dayTranslationKey: DayKey = DAY_KEYS[dayOfWeekIndex] ?? 'sun';
								const label = t(`days.short.${dayTranslationKey}`);
								const dateLabel = formatMonthDayUtc(dayUtc);

								return (
									<div key={dayKey} className="space-y-2 rounded-md border p-2">
										<div className="space-y-0.5">
											<div className="text-xs font-semibold">{label}</div>
											<div className="text-[11px] text-muted-foreground">
												{dateLabel}
											</div>
										</div>
										<div className="space-y-1">
											{expected.length === 0 ? (
												<div className="text-[11px] text-muted-foreground">
													{t('calendar.locationCard.noEmployees')}
												</div>
											) : (
												expected.map((entry) => (
													<div
														key={`${dayKey}-${entry.employeeId}`}
														className="flex items-start justify-between gap-2 rounded-md border px-2 py-1"
													>
														<div className="min-w-0">
															<Tooltip>
																<TooltipTrigger asChild>
																	<span className="block truncate text-xs font-medium">
																		{entry.employeeName}
																	</span>
																</TooltipTrigger>
																<TooltipContent className="max-w-xs text-xs">
																	{entry.employeeName}
																</TooltipContent>
															</Tooltip>
															<div className="text-[11px] text-muted-foreground">
																{entry.startTime}–{entry.endTime}
															</div>
														</div>
														<div className="flex shrink-0 flex-wrap items-center gap-1">
															<Badge
																variant={sourceVariant(entry.source)}
																className="text-[10px] uppercase"
															>
																{t(SOURCE_LABEL_KEYS[entry.source])}
															</Badge>
															{entry.exceptionType && (
																<Badge
																	variant="outline"
																	className="text-[10px] uppercase"
																>
																	{t(
																		EXCEPTION_TYPE_LABEL_KEYS[
																			entry.exceptionType
																		],
																	)}
																</Badge>
															)}
														</div>
													</div>
												))
											)}
										</div>
										{justified.length > 0 && (
											<div className="space-y-1 border-t border-amber-100 pt-2">
												<div className="text-[11px] font-semibold text-amber-700">
													{t('calendar.locationCard.justifiedLabel')}
												</div>
												<div className="space-y-1">
													{justified.map((entry) => {
														const absenceBadge = (
															<Badge
																variant="outline"
																className="border-amber-200 bg-amber-50 text-[10px] uppercase text-amber-700"
															>
																{t(
																	EXCEPTION_TYPE_LABEL_KEYS.DAY_OFF,
																)}
															</Badge>
														);

														return (
															<div
																key={`${dayKey}-leave-${entry.employeeId}`}
																className="flex items-center justify-between gap-2 rounded-md border border-amber-100 bg-amber-50/40 px-2 py-1"
															>
																<span className="min-w-0 truncate text-xs font-medium">
																	{entry.employeeName}
																</span>
																{entry.reason ? (
																	<Tooltip>
																		<TooltipTrigger asChild>
																			{absenceBadge}
																		</TooltipTrigger>
																		<TooltipContent className="max-w-xs text-xs">
																			{entry.reason}
																		</TooltipContent>
																	</Tooltip>
																) : (
																	absenceBadge
																)}
															</div>
														);
													})}
												</div>
											</div>
										)}
									</div>
								);
							})}
						</div>
					</TooltipProvider>
				) : (
					<TooltipProvider>
						<div className="grid grid-cols-7 gap-2">
							{((): Array<Date | null> => {
								const monthDays: Date[] = daysInRangeUtc;
								if (monthDays.length === 0) {
									return [];
								}

								const firstDay = monthDays[0]!;
								const leadingBlankCount =
									(getUtcDayOfWeekIndex(firstDay) - weekStartDay + 7) % 7;

								const cells: Array<Date | null> = [
									...Array.from({ length: leadingBlankCount }, () => null),
									...monthDays,
								];
								const trailing = (7 - (cells.length % 7)) % 7;
								cells.push(...Array.from({ length: trailing }, () => null));
								return cells;
							})().map((dayUtc, index) => {
								if (!dayUtc) {
									return (
										<div
											key={`blank-${index}`}
											className="min-h-[96px] rounded-md border bg-muted/20"
										/>
									);
								}

								const dayKey = formatUtcDateKey(dayUtc);
								const expected = expectedByDate.get(dayKey) ?? [];
								const justified = justifiedAbsencesByDate.get(dayKey) ?? [];
								const visible = expected.slice(0, 3);
								const remaining = Math.max(0, expected.length - visible.length);
								const dayNumber = format(toUtcCalendarDateLocal(dayUtc), 'd');

								const cell = (
									<div className="min-h-[96px] rounded-md border p-2">
										<div className="mb-1 text-xs font-semibold">
											{dayNumber}
										</div>
										<div className="space-y-0.5">
											{visible.map((entry) => {
												const markerClass = employeeMarkerClass(
													entry.employeeId,
												);
												return (
													<div
														key={`${dayKey}-${entry.employeeId}`}
														className="grid grid-cols-[auto_1fr_auto] items-center gap-1 rounded-sm bg-muted/20 px-1 py-0.5 text-[11px]"
													>
														<span
															aria-hidden="true"
															className={`h-2 w-2 shrink-0 rounded-full ${markerClass}`}
														/>
														<span className="min-w-0 truncate font-medium">
															{entry.employeeName}
														</span>
														<span className="shrink-0 text-muted-foreground">
															{entry.startTime}–{entry.endTime}
														</span>
													</div>
												);
											})}
											{remaining > 0 && (
												<div className="text-[11px] text-muted-foreground">
													{t('calendar.locationCard.more', {
														count: remaining,
													})}
												</div>
											)}
											{justified.length > 0 && (
												<div className="text-[11px] font-medium text-amber-700">
													{t('calendar.locationCard.justifiedCount', {
														count: justified.length,
													})}
												</div>
											)}
										</div>
									</div>
								);

								if (expected.length === 0 && justified.length === 0) {
									return <div key={dayKey}>{cell}</div>;
								}

								return (
									<Tooltip key={dayKey}>
										<TooltipTrigger asChild>{cell}</TooltipTrigger>
										<TooltipContent className="max-w-sm">
											<div className="space-y-1">
												<div className="text-xs font-semibold">
													{(() => {
														const dayOfWeekIndex =
															getUtcDayOfWeekIndex(dayUtc);
														const dayTranslationKey: DayKey =
															DAY_KEYS[dayOfWeekIndex] ?? 'sun';
														return t(
															'calendar.locationCard.tooltipDate',
															{
																day: t(
																	`days.long.${dayTranslationKey}`,
																),
																date: formatMonthDayUtc(dayUtc),
															},
														);
													})()}
												</div>
												{expected.map((entry) => (
													<div
														key={`${dayKey}-full-${entry.employeeId}`}
														className="flex flex-wrap items-center justify-between gap-2 text-[11px]"
													>
														<div className="flex min-w-0 items-center gap-2">
															<span
																aria-hidden="true"
																className={`h-2 w-2 shrink-0 rounded-full ${employeeMarkerClass(entry.employeeId)}`}
															/>
															<span className="min-w-0 truncate font-medium">
																{entry.employeeName}
															</span>
														</div>
														<span className="shrink-0 text-muted-foreground">
															{entry.startTime}–{entry.endTime}
														</span>
														<div className="flex shrink-0 items-center gap-1">
															<Badge
																variant={sourceVariant(
																	entry.source,
																)}
																className="text-[10px] uppercase"
															>
																{t(SOURCE_LABEL_KEYS[entry.source])}
															</Badge>
															{entry.exceptionType && (
																<Badge
																	variant="outline"
																	className="text-[10px] uppercase"
																>
																	{t(
																		EXCEPTION_TYPE_LABEL_KEYS[
																			entry.exceptionType
																		],
																	)}
																</Badge>
															)}
														</div>
													</div>
												))}
												{justified.length > 0 && (
													<div className="space-y-1 pt-1">
														<div className="text-[11px] font-semibold text-amber-700">
															{t(
																'calendar.locationCard.justifiedLabel',
															)}
														</div>
														{justified.map((entry) => (
															<div
																key={`${dayKey}-justified-${entry.employeeId}`}
																className="text-[11px]"
															>
																<div className="font-medium">
																	{entry.employeeName}
																</div>
																{entry.reason && (
																	<div className="text-muted-foreground">
																		{entry.reason}
																	</div>
																)}
															</div>
														))}
													</div>
												)}
											</div>
										</TooltipContent>
									</Tooltip>
								);
							})}
						</div>
					</TooltipProvider>
				)}
			</CardContent>
		</Card>
	);
}
