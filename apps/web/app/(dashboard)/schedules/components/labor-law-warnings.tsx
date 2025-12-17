'use client';

import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import type { ScheduleTemplateDayInput } from '@/actions/schedules';
import type { ShiftType } from '@/lib/client-functions';
import { useTranslations } from 'next-intl';

/**
 * Supported warning codes for schedule validation.
 */
export type ScheduleWarningType =
	| 'DAILY_HOURS_EXCEEDED'
	| 'WEEKLY_HOURS_EXCEEDED'
	| 'NO_REST_DAY'
	| 'INVALID_SHIFT_HOURS'
	| 'SHIFT_TYPE_MISMATCH'
	| 'OVERTIME_DAILY_LIMIT'
	| 'OVERTIME_WEEKLY_EXCEEDED'
	| 'OVERTIME_WEEKLY_DAYS_EXCEEDED';

/**
 * Warning descriptor returned by the validator.
 */
export interface ScheduleWarning {
	type: ScheduleWarningType;
	dayOfWeek?: number;
	severity: 'warning' | 'error';
	details?: ScheduleWarningDetails;
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

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type DayKey = (typeof DAY_KEYS)[number];

/**
 * Details for schedule warnings, used to build localized messages.
 */
export interface ScheduleWarningDetails {
	/** Hours computed for a day/week scope */
	hours?: number;
	/** Allowed limit in hours for the scope */
	limit?: number;
	/** Overtime hours computed for a day */
	overtimeHours?: number;
	/** Count of overtime days in a week */
	overtimeDays?: number;
	/** Expected shift type derived from the actual hours */
	expectedShiftType?: ShiftType;
	/** Selected shift type from the form */
	selectedShiftType?: ShiftType;
}

/**
 * Formats a number of hours for display.
 *
 * @param hours - Hours value
 * @returns Formatted hours string with 2 decimals
 */
function formatHours(hours: number): string {
	return hours.toFixed(2);
}

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
	const adjustedEnd =
		endTotalMinutes <= startTotalMinutes ? endTotalMinutes + 24 * 60 : endTotalMinutes;
	const diffMinutes = Math.max(0, adjustedEnd - startTotalMinutes);
	return diffMinutes / 60;
}

/**
 * Computes the number of minutes that fall within the nocturnal window (20:00–06:00).
 *
 * @param day - Day entry with start and end times
 * @returns Nocturnal minutes in the day entry
 */
function calculateNocturnalMinutes(day: ScheduleTemplateDayInput): number {
	if (day.isWorkingDay === false) {
		return 0;
	}

	const [startHour, startMinute] = day.startTime.split(':').map(Number);
	const [endHour, endMinute] = day.endTime.split(':').map(Number);
	const startTotalMinutes = startHour * 60 + startMinute;
	const endTotalMinutes = endHour * 60 + endMinute;
	const adjustedEnd =
		endTotalMinutes <= startTotalMinutes ? endTotalMinutes + 24 * 60 : endTotalMinutes;

	/**
	 * Calculates overlap minutes between two half-open ranges [aStart,aEnd) and [bStart,bEnd).
	 *
	 * @param aStart - Start of range A in minutes
	 * @param aEnd - End of range A in minutes
	 * @param bStart - Start of range B in minutes
	 * @param bEnd - End of range B in minutes
	 * @returns Overlap in minutes
	 */
	const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number): number => {
		const start = Math.max(aStart, bStart);
		const end = Math.min(aEnd, bEnd);
		return Math.max(0, end - start);
	};

	const totalMinutes = Math.max(0, adjustedEnd - startTotalMinutes);
	if (totalMinutes === 0) {
		return 0;
	}

	const rangeStart = startTotalMinutes;
	const rangeEnd = startTotalMinutes + totalMinutes;
	let nocturnalMinutes = 0;

	for (const offset of [0, 24 * 60]) {
		nocturnalMinutes += overlap(rangeStart, rangeEnd, offset + 0, offset + 6 * 60);
		nocturnalMinutes += overlap(rangeStart, rangeEnd, offset + 20 * 60, offset + 24 * 60);
	}

	return nocturnalMinutes;
}

/**
 * Infers the legal shift type based on the schedule's nocturnal minutes (20:00–06:00).
 *
 * Rule of thumb:
 * - 0 nocturnal hours → DIURNA
 * - ≥ 3.5 nocturnal hours → NOCTURNA
 * - Otherwise (and with both day+night) → MIXTA
 *
 * @param day - Day entry with start/end times
 * @returns Inferred shift type or null when the day is not a working day
 */
function inferShiftTypeForDay(day: ScheduleTemplateDayInput): ShiftType | null {
	const totalMinutes = Math.round(calculateHours(day) * 60);
	if (day.isWorkingDay === false || totalMinutes <= 0) {
		return null;
	}

	const nocturnalMinutes = calculateNocturnalMinutes(day);
	const diurnalMinutes = Math.max(0, totalMinutes - nocturnalMinutes);

	if (nocturnalMinutes <= 0) {
		return 'DIURNA';
	}
	if (diurnalMinutes <= 0) {
		return 'NOCTURNA';
	}
	if (nocturnalMinutes > 3.5 * 60) {
		return 'NOCTURNA';
	}
	return 'MIXTA';
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
export function evaluateWarnings(
	shiftType: ShiftType,
	days: ScheduleTemplateDayInput[],
	overtimeEnforcement: 'WARN' | 'BLOCK',
): ScheduleWarning[] {
	const warnings: ScheduleWarning[] = [];
	const dailyLimit = DAILY_LIMITS[shiftType] ?? 8;
	const weeklyLimit = WEEKLY_LIMITS[shiftType] ?? 48;
	const mismatchSeverity: ScheduleWarning['severity'] =
		overtimeEnforcement === 'BLOCK' ? 'error' : 'warning';

	let weeklyHours = 0;
	let weeklyOvertimeHours = 0;
	let weeklyOvertimeDays = 0;
	let hasRestDay = false;

	days.forEach((day) => {
		const hours = calculateHours(day);
		const inferredShiftType = inferShiftTypeForDay(day);
		if (inferredShiftType && inferredShiftType !== shiftType) {
			warnings.push({
				type: 'SHIFT_TYPE_MISMATCH',
				dayOfWeek: day.dayOfWeek,
				severity: mismatchSeverity,
				details: {
					expectedShiftType: inferredShiftType,
					selectedShiftType: shiftType,
				},
			});
		}

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
				severity: hours - dailyLimit > 3 ? 'error' : 'warning',
				details: { hours, limit: dailyLimit },
			});
		}

		if (hours - dailyLimit > 3) {
			warnings.push({
				type: 'OVERTIME_DAILY_LIMIT',
				dayOfWeek: day.dayOfWeek,
				severity: 'error',
				details: { overtimeHours: hours - dailyLimit },
			});
		}
	});

	if (!hasRestDay) {
		warnings.push({
			type: 'NO_REST_DAY',
			severity: 'error',
		});
	}

	if (weeklyHours > weeklyLimit) {
		warnings.push({
			type: 'WEEKLY_HOURS_EXCEEDED',
			severity: 'error',
			details: { hours: weeklyHours, limit: weeklyLimit },
		});
	}

	if (weeklyOvertimeDays > 3) {
		warnings.push({
			type: 'OVERTIME_WEEKLY_DAYS_EXCEEDED',
			severity: 'error',
			details: { overtimeDays: weeklyOvertimeDays, limit: 3 },
		});
	}

	if (weeklyOvertimeHours > 9) {
		warnings.push({
			type: 'OVERTIME_WEEKLY_EXCEEDED',
			severity: 'error',
			details: { hours: weeklyOvertimeHours, limit: 9 },
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
	/** Overtime enforcement (warn vs block) */
	overtimeEnforcement: 'WARN' | 'BLOCK';
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
	overtimeEnforcement,
}: LaborLawWarningsProps): React.ReactElement | null {
	const t = useTranslations('Schedules');
	const warnings = useMemo(
		() => evaluateWarnings(shiftType, days, overtimeEnforcement),
		[days, overtimeEnforcement, shiftType],
	);

	if (warnings.length === 0) {
		return null;
	}

	/**
	 * Returns a Spanish day name for a given day index.
	 *
	 * @param dayOfWeek - Day index (0=Sun .. 6=Sat)
	 * @returns Localized day name
	 */
	const getDayName = (dayOfWeek: number): string => {
		const dayKey: DayKey = DAY_KEYS[dayOfWeek] ?? 'sun';
		return t(`days.long.${dayKey}`);
	};

	/**
	 * Builds a localized message for a given warning.
	 *
	 * @param warning - Warning to format
	 * @returns Localized message string
	 */
	const getWarningMessage = (warning: ScheduleWarning): string => {
		const dayName = warning.dayOfWeek === undefined ? undefined : getDayName(warning.dayOfWeek);

		switch (warning.type) {
			case 'SHIFT_TYPE_MISMATCH': {
				const expected = warning.details?.expectedShiftType ?? shiftType;
				const selected = warning.details?.selectedShiftType ?? shiftType;
				return t('laborLawWarnings.messages.shiftTypeMismatch', {
					day: dayName ?? '',
					expected: t(`shiftTypes.options.${expected}`),
					selected: t(`shiftTypes.options.${selected}`),
				});
			}
			case 'DAILY_HOURS_EXCEEDED': {
				const hours = warning.details?.hours ?? 0;
				const limit = warning.details?.limit ?? 0;
				return t('laborLawWarnings.messages.dailyHoursExceeded', {
					day: dayName ?? '',
					hours: formatHours(hours),
					limit,
				});
			}
			case 'OVERTIME_DAILY_LIMIT': {
				const overtimeHours = warning.details?.overtimeHours ?? 0;
				return t('laborLawWarnings.messages.overtimeDailyLimit', {
					day: dayName ?? '',
					hours: formatHours(overtimeHours),
				});
			}
			case 'NO_REST_DAY':
				return t('laborLawWarnings.messages.noRestDay');
			case 'WEEKLY_HOURS_EXCEEDED': {
				const hours = warning.details?.hours ?? 0;
				const limit = warning.details?.limit ?? 0;
				return t('laborLawWarnings.messages.weeklyHoursExceeded', {
					hours: formatHours(hours),
					limit,
				});
			}
			case 'OVERTIME_WEEKLY_DAYS_EXCEEDED': {
				const daysExceeded = warning.details?.overtimeDays ?? 0;
				const limit = warning.details?.limit ?? 3;
				return t('laborLawWarnings.messages.overtimeWeeklyDaysExceeded', {
					days: daysExceeded,
					limit,
				});
			}
			case 'OVERTIME_WEEKLY_EXCEEDED': {
				const hours = warning.details?.hours ?? 0;
				const limit = warning.details?.limit ?? 9;
				return t('laborLawWarnings.messages.overtimeWeeklyExceeded', {
					hours: formatHours(hours),
					limit,
				});
			}
			default:
				return t('laborLawWarnings.messages.unknown');
		}
	};

	return (
		<div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950">
			<p className="text-sm font-medium">{t('laborLawWarnings.title')}</p>
			<div className="flex flex-wrap gap-2">
				{warnings.map((warning, index) => (
					<Badge
						key={`${warning.type}-${warning.dayOfWeek ?? 'all'}-${index}`}
						variant={warning.severity === 'error' ? 'destructive' : 'secondary'}
					>
						{getWarningMessage(warning)}
					</Badge>
				))}
			</div>
		</div>
	);
}
