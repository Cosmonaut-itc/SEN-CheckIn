import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { queryKeys } from '@/lib/query-keys';
import { formatDateRangeUtc } from '@/lib/date-format';
import {
	fetchCalendar,
	type CalendarEmployee,
	type Employee,
	type Location,
} from '@/lib/client-functions';
import { addMonths, addWeeks, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import { LocationScheduleCard } from './location-schedule-card';

const EMPTY_CALENDAR_EMPLOYEES: CalendarEmployee[] = [];

/**
 * Props for the CalendarView component.
 */
interface CalendarViewProps {
	/** ISO start date for initial range */
	initialStartDate: string;
	/** ISO end date for initial range */
	initialEndDate: string;
	/** Available employees */
	employees: Employee[];
	/** Available locations */
	locations: Location[];
	/** Current organization id */
	organizationId?: string | null;
	/** Week start day preference */
	weekStartDay: number;
}

/**
 * Converts a date to a local date representing the same UTC calendar day.
 *
 * This allows date-fns functions (which operate in local time) to be used
 * safely for UTC-calendar-based ranges by treating UTC day components as local.
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
 * Computes the start and end dates (UTC midnight) of the week containing the reference date.
 *
 * @param reference - Date to compute from
 * @param weekStartDay - Day index the week starts on (0=Sun, 1=Mon...)
 * @returns Date range for the week (UTC midnight boundaries)
 */
function computeWeekRange(reference: Date, weekStartDay: number): { start: Date; end: Date } {
	const referenceCalendar = toUtcCalendarDateLocal(reference);
	const startLocal = startOfWeek(referenceCalendar, {
		weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
	});
	const endLocal = endOfWeek(referenceCalendar, {
		weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
	});
	return {
		start: toUtcMidnight(startLocal),
		end: toUtcMidnight(endLocal),
	};
}

/**
 * Computes the start and end dates (UTC midnight) of the month containing the reference date.
 *
 * @param reference - Date to compute from
 * @returns Date range for the month (UTC midnight boundaries)
 */
function computeMonthRange(reference: Date): { start: Date; end: Date } {
	const referenceCalendar = toUtcCalendarDateLocal(reference);
	return {
		start: toUtcMidnight(startOfMonth(referenceCalendar)),
		end: toUtcMidnight(endOfMonth(referenceCalendar)),
	};
}

/**
 * Renders the scheduling calendar with weekly/monthly views.
 *
 * @param props - Component props
 * @returns Calendar view content
 */
export function CalendarView({
	initialStartDate,
	initialEndDate,
	employees,
	locations,
	organizationId,
	weekStartDay,
}: CalendarViewProps): React.ReactElement {
	const [hasHydrated, setHasHydrated] = useState<boolean>(false);
	const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
	const [selectedLocationId, setSelectedLocationId] = useState<string>('');
	const [referenceDate, setReferenceDate] = useState<Date>(() => {
		const start = new Date(initialStartDate);
		const end = new Date(initialEndDate);
		return new Date((start.getTime() + end.getTime()) / 2);
	});

	const sortedLocations = useMemo(() => {
		return [...locations].sort((a, b) => a.name.localeCompare(b.name));
	}, [locations]);

	const locationIdSet = useMemo(() => {
		return new Set(sortedLocations.map((loc) => loc.id));
	}, [sortedLocations]);

	const effectiveLocationId = useMemo(() => {
		const normalizedSelected = locationIdSet.has(selectedLocationId) ? selectedLocationId : '';
		return normalizedSelected || sortedLocations[0]?.id || '';
	}, [locationIdSet, selectedLocationId, sortedLocations]);

	const selectedLocation = useMemo(() => {
		if (!effectiveLocationId) {
			return null;
		}
		const location = sortedLocations.find((loc) => loc.id === effectiveLocationId);
		return location ? { id: location.id, name: location.name } : { id: effectiveLocationId, name: effectiveLocationId };
	}, [effectiveLocationId, sortedLocations]);

	const employeesInLocation = useMemo(() => {
		if (!effectiveLocationId) {
			return [];
		}
		return employees.filter((employee) => employee.locationId === effectiveLocationId);
	}, [employees, effectiveLocationId]);

	const range = useMemo(() => {
		return viewMode === 'week'
			? computeWeekRange(referenceDate, weekStartDay ?? 1)
			: computeMonthRange(referenceDate);
	}, [referenceDate, viewMode, weekStartDay]);

	const calendarQueryParams = useMemo(
		() => ({
			startDate: range.start.toISOString(),
			endDate: range.end.toISOString(),
			organizationId: organizationId ?? undefined,
			locationId: effectiveLocationId || undefined,
		}),
		[effectiveLocationId, range.end, range.start, organizationId],
	);

	const { data: calendarData, isFetching } = useQuery<CalendarEmployee[]>({
		queryKey: queryKeys.scheduling.calendar(calendarQueryParams),
		queryFn: () => fetchCalendar(calendarQueryParams),
		enabled: Boolean(organizationId) && Boolean(effectiveLocationId),
	});

	useEffect(() => {
		const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
			setHasHydrated(true);
		}, 0);

		return () => {
			clearTimeout(timeoutId);
		};
	}, []);

	const entries = calendarData ?? EMPTY_CALENDAR_EMPLOYEES;
	const isEmpty = entries.length === 0;
	const showSkeleton = !hasHydrated || (isFetching && isEmpty);
	const showEmptyState = hasHydrated && !isFetching && isEmpty;

	const unassignedCount = useMemo(() => {
		return employees.filter((employee) => !employee.locationId).length;
	}, [employees]);

	/**
	 * Navigates to the previous week/month (UTC calendar).
	 */
	const handlePrev = (): void => {
		setReferenceDate((current) => {
			const currentCalendar = toUtcCalendarDateLocal(current);
			const nextCalendar =
				viewMode === 'week'
					? addWeeks(currentCalendar, -1)
					: addMonths(currentCalendar, -1);
			return toUtcMidnight(nextCalendar);
		});
	};

	/**
	 * Navigates to the next week/month (UTC calendar).
	 */
	const handleNext = (): void => {
		setReferenceDate((current) => {
			const currentCalendar = toUtcCalendarDateLocal(current);
			const nextCalendar =
				viewMode === 'week'
					? addWeeks(currentCalendar, 1)
					: addMonths(currentCalendar, 1);
			return toUtcMidnight(nextCalendar);
		});
	};

	/**
	 * Navigates to the current UTC day.
	 */
	const handleToday = (): void => {
		setReferenceDate(toUtcMidnight(toUtcCalendarDateLocal(new Date())));
	};

	if (!organizationId) {
		return (
			<div className="space-y-2 rounded-md border p-4">
				<h2 className="text-lg font-semibold">Calendar</h2>
				<p className="text-muted-foreground">
					Select an active organization to view schedules.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant={viewMode === 'week' ? 'default' : 'outline'}
					size="sm"
					onClick={() => setViewMode('week')}
				>
					Weekly
				</Button>
				<Button
					variant={viewMode === 'month' ? 'default' : 'outline'}
					size="sm"
					onClick={() => setViewMode('month')}
				>
					Monthly
				</Button>
				<div className="ml-auto flex items-center gap-2">
					<Button variant="outline" size="sm" onClick={handlePrev}>
						Prev
					</Button>
					<Button variant="outline" size="sm" onClick={handleToday}>
						Today
					</Button>
					<Button variant="outline" size="sm" onClick={handleNext}>
						Next
					</Button>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<div className="text-sm text-muted-foreground">
					Range: {formatDateRangeUtc(range.start, range.end)}
				</div>
				<div className="flex items-center gap-2">
					<span className="text-sm text-muted-foreground">Location</span>
					<Select
						value={effectiveLocationId}
						onValueChange={(value) => setSelectedLocationId(value)}
						disabled={sortedLocations.length === 0}
					>
						<SelectTrigger className="w-[260px]">
							<SelectValue placeholder="Select location" />
						</SelectTrigger>
						<SelectContent>
							{sortedLocations.map((location) => (
								<SelectItem key={location.id} value={location.id}>
									{location.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{unassignedCount > 0 && (
				<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
					{unassignedCount} employee{unassignedCount === 1 ? '' : 's'} have no location
					assigned. Assign a location in Employees to render schedules by location.
				</div>
			)}

			<div className="grid gap-4">
				{showSkeleton
					? (
							<div className="rounded-xl border p-4">
								<div className="h-4 w-48 rounded bg-muted" />
								<div className="mt-2 h-3 w-32 rounded bg-muted" />
								<div className="mt-4 grid grid-cols-7 gap-2">
									{Array.from({ length: 7 }).map((_, jdx) => (
										<div key={jdx} className="h-12 rounded bg-muted" />
									))}
								</div>
							</div>
					  )
					: selectedLocation && effectiveLocationId ? (
							<LocationScheduleCard
								key={effectiveLocationId}
								location={selectedLocation}
								employeesInLocation={employeesInLocation}
								calendarEmployeesInLocation={entries}
								viewMode={viewMode}
								rangeStart={range.start}
								rangeEnd={range.end}
								weekStartDay={weekStartDay}
							/>
					  ) : (
							<div className="rounded-md border p-4 text-sm text-muted-foreground">
								Select a location to view schedules.
							</div>
					  )}
			</div>

			{showEmptyState && (
				<div className="rounded-md border p-4 text-sm text-muted-foreground">
					No schedules found for the selected range.
				</div>
			)}
		</div>
	);
}
