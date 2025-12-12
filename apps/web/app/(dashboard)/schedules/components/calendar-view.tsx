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
import { EmployeeScheduleCard } from './employee-schedule-card';

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
 * Computes the start and end dates of the week containing the reference date.
 *
 * @param reference - Date to compute from
 * @param weekStartDay - Day index the week starts on (0=Sun, 1=Mon...)
 * @returns Date range for the week
 */
function computeWeekRange(reference: Date, weekStartDay: number): { start: Date; end: Date } {
	const normalized = new Date(reference);
	normalized.setUTCHours(0, 0, 0, 0);
	const diff = (normalized.getUTCDay() - weekStartDay + 7) % 7;
	const start = new Date(normalized);
	start.setUTCDate(normalized.getUTCDate() - diff);
	const end = new Date(start);
	end.setUTCDate(start.getUTCDate() + 6);
	return { start, end };
}

/**
 * Computes the start and end dates of the month containing the reference date.
 *
 * @param reference - Date to compute from
 * @returns Date range for the month
 */
function computeMonthRange(reference: Date): { start: Date; end: Date } {
	const year = reference.getUTCFullYear();
	const month = reference.getUTCMonth();
	const start = new Date(Date.UTC(year, month, 1));
	const end = new Date(Date.UTC(year, month + 1, 0));
	return { start, end };
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
	const [scope, setScope] = useState<'location' | 'employee'>('location');
	const [referenceDate, setReferenceDate] = useState<Date>(() => {
		const start = new Date(initialStartDate);
		const end = new Date(initialEndDate);
		return new Date((start.getTime() + end.getTime()) / 2);
	});
	const [selectedLocationId, setSelectedLocationId] = useState<string>('all');
	const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');

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
			locationId:
				scope === 'location' && selectedLocationId !== 'all' ? selectedLocationId : undefined,
			employeeId:
				scope === 'employee' && selectedEmployeeId !== 'all' ? selectedEmployeeId : undefined,
		}),
		[range.end, range.start, organizationId, scope, selectedEmployeeId, selectedLocationId],
	);

	const { data: calendarData, isFetching } = useQuery<CalendarEmployee[]>({
		queryKey: queryKeys.scheduling.calendar(calendarQueryParams),
		queryFn: () => fetchCalendar(calendarQueryParams),
		enabled: Boolean(organizationId),
	});

	useEffect(() => {
		const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
			setHasHydrated(true);
		}, 0);

		return () => {
			clearTimeout(timeoutId);
		};
	}, []);

	const entries = calendarData ?? [];
	const isEmpty = entries.length === 0;
	const showSkeleton = !hasHydrated || (isFetching && isEmpty);
	const showEmptyState = hasHydrated && !isFetching && isEmpty;

	const handlePrev = (): void => {
		const next = new Date(referenceDate);
		if (viewMode === 'week') {
			next.setUTCDate(next.getUTCDate() - 7);
		} else {
			next.setUTCMonth(next.getUTCMonth() - 1);
		}
		setReferenceDate(next);
	};

	const handleNext = (): void => {
		const next = new Date(referenceDate);
		if (viewMode === 'week') {
			next.setUTCDate(next.getUTCDate() + 7);
		} else {
			next.setUTCMonth(next.getUTCMonth() + 1);
		}
		setReferenceDate(next);
	};

	const handleToday = (): void => {
		setReferenceDate(new Date());
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
				<div className="flex items-center gap-2">
					<Button
						variant={scope === 'location' ? 'default' : 'outline'}
						size="sm"
						onClick={() => setScope('location')}
					>
						By Location
					</Button>
					<Button
						variant={scope === 'employee' ? 'default' : 'outline'}
						size="sm"
						onClick={() => setScope('employee')}
					>
						By Employee
					</Button>
				</div>

				{scope === 'location' ? (
					<Select value={selectedLocationId} onValueChange={(val) => setSelectedLocationId(val)}>
						<SelectTrigger className="w-[220px]">
							<SelectValue placeholder="All locations" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All locations</SelectItem>
							{locations.map((location) => (
								<SelectItem key={location.id} value={location.id}>
									{location.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : (
					<Select value={selectedEmployeeId} onValueChange={(val) => setSelectedEmployeeId(val)}>
						<SelectTrigger className="w-[240px]">
							<SelectValue placeholder="All employees" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All employees</SelectItem>
							{employees.map((employee) => (
								<SelectItem key={employee.id} value={employee.id}>
									{employee.firstName} {employee.lastName}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}

				<div className="text-sm text-muted-foreground">
					Range:{' '}
					{formatDateRangeUtc(range.start, range.end)}
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				{showSkeleton
					? Array.from({ length: 4 }).map((_, idx) => (
							<div key={idx} className="rounded-xl border p-4">
								<div className="h-4 w-32 rounded bg-muted" />
								<div className="mt-2 h-3 w-24 rounded bg-muted" />
								<div className="mt-4 grid grid-cols-7 gap-2">
									{Array.from({ length: 7 }).map((__, jdx) => (
										<div key={jdx} className="h-10 rounded bg-muted" />
									))}
								</div>
							</div>
					  ))
					: entries.map((employee) => (
							<EmployeeScheduleCard key={employee.employeeId} employee={employee} viewMode={viewMode} />
					  ))}
			</div>

			{showEmptyState && (
				<div className="rounded-md border p-4 text-sm text-muted-foreground">
					No schedules found for the selected range.
				</div>
			)}
		</div>
	);
}
