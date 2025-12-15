import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import type { ScheduleTemplateDayInput } from '@/actions/schedules';
import type { ShiftType } from '@/lib/client-functions';

/**
 * Supported warning codes for schedule validation.
 */
export type ScheduleWarningType =
	| 'DAILY_HOURS_EXCEEDED'
	| 'WEEKLY_HOURS_EXCEEDED'
	| 'NO_REST_DAY'
	| 'INVALID_SHIFT_HOURS'
	| 'OVERTIME_DAILY_LIMIT'
	| 'OVERTIME_WEEKLY_EXCEEDED'
	| 'OVERTIME_WEEKLY_DAYS_EXCEEDED';

/**
 * Warning descriptor returned by the validator.
 */
export interface ScheduleWarning {
	type: ScheduleWarningType;
	dayOfWeek?: number;
	message: string;
	severity: 'warning' | 'error';
}

const DAILY_LIMITS: Record<ShiftType, number> = {
	DIURNA: 8,
	NOCTURNA: 7,
	MIXTA: 7.5,
};

const WEEKLY_LIMITS: Record<ShiftType, number> = {
	DIURNA: 48,
	NOCTURNA: 42,
	MIXTA: 45,
};

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Calculates hours worked for a given day entry.
 *
 * Supports overnight ranges by rolling end time into the next day when end < start.
 *
 * @param day - Day entry with start and end times
 * @returns Number of hours (floating) or 0 when not working
 */
export function calculateHours(day: ScheduleTemplateDayInput): number {
	if (day.isWorkingDay === false) {
		return 0;
	}
	const [startHour, startMinute] = day.startTime.split(':').map(Number);
	const [endHour, endMinute] = day.endTime.split(':').map(Number);
	const startTotalMinutes = startHour * 60 + startMinute;
	const endTotalMinutes = endHour * 60 + endMinute;
	const adjustedEnd = endTotalMinutes <= startTotalMinutes ? endTotalMinutes + 24 * 60 : endTotalMinutes;
	const diffMinutes = Math.max(0, adjustedEnd - startTotalMinutes);
	return diffMinutes / 60;
}

/**
 * Computes the total weekly hours for the provided schedule days.
 *
 * @param days - Day configuration
 * @returns Total hours across all days
 */
export function computeWeeklyHours(days: ScheduleTemplateDayInput[]): number {
	return days.reduce((total, day) => total + calculateHours(day), 0);
}

/**
 * Evaluates schedule warnings based on LFT-inspired limits.
 *
 * @param shiftType - Selected shift type
 * @param days - Day configuration
 * @returns Array of warnings/errors
 */
export function evaluateWarnings(shiftType: ShiftType, days: ScheduleTemplateDayInput[]): ScheduleWarning[] {
	const warnings: ScheduleWarning[] = [];
	const dailyLimit = DAILY_LIMITS[shiftType] ?? 8;
	const weeklyLimit = WEEKLY_LIMITS[shiftType] ?? 48;

	let weeklyHours = 0;
	let weeklyOvertimeHours = 0;
	let weeklyOvertimeDays = 0;
	let hasRestDay = false;

	days.forEach((day) => {
		const hours = calculateHours(day);
		if (day.isWorkingDay === false || hours === 0) {
			hasRestDay = true;
		} else {
			weeklyHours += hours;
		}

		const overtimeHours = Math.max(0, hours - dailyLimit);
		if (overtimeHours > 0) {
			weeklyOvertimeHours += overtimeHours;
			weeklyOvertimeDays += 1;
		}

		if (hours > dailyLimit) {
			warnings.push({
				type: 'DAILY_HOURS_EXCEEDED',
				dayOfWeek: day.dayOfWeek,
				message: `${dayLabels[day.dayOfWeek]} exceeds daily limit (${hours.toFixed(2)}h > ${dailyLimit}h)`,
				severity: hours - dailyLimit > 3 ? 'error' : 'warning',
			});
		}

		if (hours - dailyLimit > 3) {
			warnings.push({
				type: 'OVERTIME_DAILY_LIMIT',
				dayOfWeek: day.dayOfWeek,
				message: `${dayLabels[day.dayOfWeek]} has more than 3h overtime (${(hours - dailyLimit).toFixed(2)}h)`,
				severity: 'error',
			});
		}
	});

	if (!hasRestDay) {
		warnings.push({
			type: 'NO_REST_DAY',
			message: 'At least one rest day per week is required.',
			severity: 'error',
		});
	}

	if (weeklyHours > weeklyLimit) {
		warnings.push({
			type: 'WEEKLY_HOURS_EXCEEDED',
			message: `Weekly total exceeds limit (${weeklyHours.toFixed(2)}h > ${weeklyLimit}h).`,
			severity: 'error',
		});
	}

	if (weeklyOvertimeDays > 3) {
		warnings.push({
			type: 'OVERTIME_WEEKLY_DAYS_EXCEEDED',
			message: `Overtime exceeds weekly frequency limit (${weeklyOvertimeDays} days > 3 days).`,
			severity: 'error',
		});
	}

	if (weeklyOvertimeHours > 9) {
		warnings.push({
			type: 'OVERTIME_WEEKLY_EXCEEDED',
			message: `Overtime exceeds weekly legal limit (${weeklyOvertimeHours.toFixed(2)}h > 9h).`,
			severity: 'error',
		});
	}

	return warnings;
}

/**
 * Props for LaborLawWarnings component.
 */
interface LaborLawWarningsProps {
	/** Selected shift type */
	shiftType: ShiftType;
	/** Current day configuration */
	days: ScheduleTemplateDayInput[];
}

/**
 * Displays validation warnings and errors for a schedule.
 *
 * @param props - Component props
 * @returns Rendered list of warnings
 */
export function LaborLawWarnings({
	shiftType,
	days,
}: LaborLawWarningsProps): React.ReactElement | null {
	const warnings = useMemo(() => evaluateWarnings(shiftType, days), [shiftType, days]);

	if (warnings.length === 0) {
		return null;
	}

	return (
		<div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950">
			<p className="text-sm font-medium">Labor law checks</p>
			<div className="flex flex-wrap gap-2">
				{warnings.map((warning, index) => (
					<Badge
						key={`${warning.type}-${warning.dayOfWeek ?? 'all'}-${index}`}
						variant={warning.severity === 'error' ? 'destructive' : 'secondary'}
					>
						{warning.message}
					</Badge>
				))}
			</div>
		</div>
	);
}
