import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CalendarEmployee } from '@/lib/client-functions';
import { formatMonthDayUtc } from '@/lib/date-format';

/**
 * Props for EmployeeScheduleCard component.
 */
interface EmployeeScheduleCardProps {
	/** Employee calendar entry */
	employee: CalendarEmployee;
	/** Current view mode */
	viewMode: 'week' | 'month';
}

/**
 * Returns a color variant for the given shift type.
 *
 * @param shiftType - Employee shift type
 * @returns Badge variant
 */
function shiftVariant(shiftType: CalendarEmployee['shiftType']): 'default' | 'secondary' {
	return shiftType === 'NOCTURNA' ? 'secondary' : 'default';
}

/**
 * Card that renders schedule details for a single employee.
 *
 * @param props - Component props
 * @returns Rendered card
 */
export function EmployeeScheduleCard({
	employee,
	viewMode,
}: EmployeeScheduleCardProps): React.ReactElement {
	const sortedDays = useMemo(
		() =>
			[...employee.days].sort(
				(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
			),
		[employee.days],
	);

	return (
		<Card>
			<CardHeader className="space-y-1">
				<div className="flex items-center justify-between gap-2">
					<CardTitle className="text-base font-semibold">{employee.employeeName}</CardTitle>
					<Badge variant={shiftVariant(employee.shiftType)} className="uppercase">
						{employee.shiftType}
					</Badge>
				</div>
				<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					{employee.scheduleTemplateId ? (
						<span>Template: {employee.scheduleTemplateId}</span>
					) : (
						<span>Template: Not assigned</span>
					)}
					{employee.locationId && <span>Location: {employee.locationId}</span>}
				</div>
			</CardHeader>
			<CardContent>
				<div
					className={
						viewMode === 'week'
							? 'grid grid-cols-7 gap-2'
							: 'grid grid-cols-7 gap-2 md:grid-cols-10'
					}
				>
					{sortedDays.map((day) => {
						const date = new Date(day.date);
						const isWorking = day.isWorkingDay && day.startTime && day.endTime;
						const exceptionBadge =
							day.exceptionType === 'DAY_OFF'
								? 'bg-amber-100 text-amber-900'
								: day.exceptionType
									? 'bg-indigo-100 text-indigo-900'
									: '';
						return (
							<div
								key={day.date}
								className={`space-y-1 rounded-md border p-2 text-xs ${exceptionBadge}`}
							>
								<div className="font-semibold">
									{formatMonthDayUtc(date)}
								</div>
								<div className="text-muted-foreground">
									{isWorking ? `${day.startTime} - ${day.endTime}` : 'Off'}
								</div>
								{day.exceptionType && (
									<Badge variant="outline" className="text-[10px] uppercase">
										{day.exceptionType}
									</Badge>
								)}
								<div className="text-[10px] text-muted-foreground capitalize">
									Source: {day.source}
								</div>
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
