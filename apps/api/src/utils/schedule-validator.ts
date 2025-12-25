import { addDays, differenceInMinutes, parse } from 'date-fns';

import { OVERTIME_LIMITS, SHIFT_LIMITS } from './mexico-labor-constants.js';

export interface ScheduleDayInput {
	dayOfWeek: number;
	startTime: string;
	endTime: string;
	isWorkingDay?: boolean;
}

export interface ScheduleWarning {
	type:
		| 'DAILY_HOURS_EXCEEDED'
		| 'WEEKLY_HOURS_EXCEEDED'
		| 'OVERTIME_WEEKLY_EXCEEDED'
		| 'OVERTIME_WEEKLY_DAYS_EXCEEDED'
		| 'NO_REST_DAY'
		| 'SHIFT_TYPE_MISMATCH'
		| 'INVALID_SHIFT_HOURS';
	dayOfWeek?: number;
	message: string;
	severity: 'warning' | 'error';
}

export interface ScheduleValidationResult {
	valid: boolean;
	warnings: ScheduleWarning[];
	errors: ScheduleWarning[];
}

export interface ScheduleValidationOptions {
	shiftType: 'DIURNA' | 'NOCTURNA' | 'MIXTA';
	overtimeEnforcement: 'WARN' | 'BLOCK';
}

/**
 * Parses an HH:mm or HH:mm:ss string into total minutes from midnight.
 *
 * @param timeString - Time string in HH:mm or HH:mm:ss format
 * @returns Total minutes from midnight
 */
function parseTimeToMinutes(timeString: string): number {
	const [hours = 0, minutes = 0] = timeString.split(':').map(Number);
	return hours * 60 + minutes;
}

/**
 * Calculates minutes within the nocturnal window (20:00–06:00) for a schedule day.
 *
 * @param day - Day configuration with start/end times
 * @returns Nocturnal minutes
 */
function calculateNocturnalMinutes(day: ScheduleDayInput): number {
	if (!day.isWorkingDay) {
		return 0;
	}

	const startMinutes = parseTimeToMinutes(day.startTime);
	let endMinutes = parseTimeToMinutes(day.endTime);
	if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
		return 0;
	}
	if (endMinutes <= startMinutes) {
		endMinutes += 24 * 60;
	}

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

	let nocturnalMinutes = 0;
	for (const offset of [0, 24 * 60]) {
		nocturnalMinutes += overlap(startMinutes, endMinutes, offset + 0, offset + 6 * 60);
		nocturnalMinutes += overlap(startMinutes, endMinutes, offset + 20 * 60, offset + 24 * 60);
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
 * @param day - Day configuration with start/end times
 * @returns Inferred shift type or null when not a working day
 */
function inferShiftTypeForDay(
	day: ScheduleDayInput,
): ScheduleValidationOptions['shiftType'] | null {
	if (!day.isWorkingDay) {
		return null;
	}

	const totalMinutes = calculateDailyMinutes(day);
	if (totalMinutes <= 0) {
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
 * Parses HH:mm or HH:mm:ss strings into total minutes, handling overnight ranges.
 *
 * @param day - Day configuration with start and end times
 * @returns Total minutes worked for the day (0 when not working or invalid)
 */
export function calculateDailyMinutes(day: ScheduleDayInput): number {
	if (!day.isWorkingDay) {
		return 0;
	}

	const normalizedStart =
		day.startTime.split(':').length === 3 ? day.startTime.slice(0, 5) : day.startTime;
	const normalizedEnd =
		day.endTime.split(':').length === 3 ? day.endTime.slice(0, 5) : day.endTime;
	const start = parse(normalizedStart, 'HH:mm', new Date());
	let end = parse(normalizedEnd, 'HH:mm', new Date());

	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return 0;
	}

	if (end <= start) {
		end = addDays(end, 1);
	}

	return differenceInMinutes(end, start);
}

/**
 * Validates schedule days against LFT constraints and overtime enforcement settings.
 *
 * @param args - Schedule days, shift type, and enforcement mode
 * @returns Validation result with warnings and errors
 */
export function validateScheduleDays(args: {
	days: ScheduleDayInput[];
	shiftType: ScheduleValidationOptions['shiftType'];
	overtimeEnforcement: ScheduleValidationOptions['overtimeEnforcement'];
}): ScheduleValidationResult {
	const { days, shiftType, overtimeEnforcement } = args;
	const limit = SHIFT_LIMITS[shiftType];
	const severityForOverage: ScheduleWarning['severity'] =
		overtimeEnforcement === 'BLOCK' ? 'error' : 'warning';

	const warnings: ScheduleWarning[] = [];
	const errors: ScheduleWarning[] = [];

	const seenDays = new Set<number>();
	let weeklyMinutes = 0;
	let weeklyOvertimeMinutes = 0;
	let weeklyOvertimeDays = 0;
	let restDayCount = 0;

	for (const day of days) {
		if (seenDays.has(day.dayOfWeek)) {
			errors.push({
				type: 'INVALID_SHIFT_HOURS',
				dayOfWeek: day.dayOfWeek,
				message: `Duplicate dayOfWeek ${day.dayOfWeek} detected.`,
				severity: 'error',
			});
			continue;
		}
		seenDays.add(day.dayOfWeek);

		const dayMinutes = calculateDailyMinutes(day);
		if (!day.isWorkingDay || dayMinutes === 0) {
			restDayCount += 1;
		}
		if (day.isWorkingDay && dayMinutes <= 0) {
			errors.push({
				type: 'INVALID_SHIFT_HOURS',
				dayOfWeek: day.dayOfWeek,
				message: 'Working day must have positive duration.',
				severity: 'error',
			});
			continue;
		}

		const inferredShiftType = inferShiftTypeForDay(day);
		if (inferredShiftType && inferredShiftType !== shiftType) {
			warnings.push({
				type: 'SHIFT_TYPE_MISMATCH',
				dayOfWeek: day.dayOfWeek,
				message: `Shift type mismatch: expected ${inferredShiftType} based on schedule hours, but template is ${shiftType}.`,
				severity: severityForOverage,
			});
		}

		const dayHours = dayMinutes / 60;
		weeklyMinutes += dayMinutes;

		if (dayHours > limit.dailyHours) {
			warnings.push({
				type: 'DAILY_HOURS_EXCEEDED',
				dayOfWeek: day.dayOfWeek,
				message: `Daily hours ${dayHours.toFixed(2)} exceed shift limit ${limit.dailyHours}.`,
				severity: severityForOverage,
			});
		}

		const overtimeHours = Math.max(0, dayHours - limit.dailyHours);
		if (overtimeHours > OVERTIME_LIMITS.MAX_DAILY_HOURS) {
			warnings.push({
				type: 'DAILY_HOURS_EXCEEDED',
				dayOfWeek: day.dayOfWeek,
				message: `Overtime ${overtimeHours.toFixed(
					2,
				)} exceeds legal daily maximum of ${OVERTIME_LIMITS.MAX_DAILY_HOURS} hours.`,
				severity: severityForOverage,
			});
		}

		if (overtimeHours > 0) {
			weeklyOvertimeMinutes += overtimeHours * 60;
			weeklyOvertimeDays += 1;
		}
	}

	const weeklyHours = weeklyMinutes / 60;
	if (weeklyHours > limit.weeklyHours) {
		warnings.push({
			type: 'WEEKLY_HOURS_EXCEEDED',
			message: `Weekly hours ${weeklyHours.toFixed(
				2,
			)} exceed shift limit ${limit.weeklyHours}.`,
			severity: severityForOverage,
		});
	}

	const weeklyOvertimeHours = weeklyOvertimeMinutes / 60;
	if (weeklyOvertimeDays > 3) {
		warnings.push({
			type: 'OVERTIME_WEEKLY_DAYS_EXCEEDED',
			message: `Overtime exceeds weekly frequency limit (${weeklyOvertimeDays} days > 3 days).`,
			severity: severityForOverage,
		});
	}

	if (weeklyOvertimeHours > OVERTIME_LIMITS.MAX_WEEKLY_HOURS) {
		warnings.push({
			type: 'OVERTIME_WEEKLY_EXCEEDED',
			message: `Overtime ${weeklyOvertimeHours.toFixed(
				2,
			)} exceeds legal weekly maximum of ${OVERTIME_LIMITS.MAX_WEEKLY_HOURS} hours.`,
			severity: severityForOverage,
		});
	}

	if (restDayCount === 0) {
		warnings.push({
			type: 'NO_REST_DAY',
			message: 'At least one rest day per week is required.',
			severity: 'error',
		});
	}

	const result: ScheduleValidationResult = {
		valid: errors.length === 0 && warnings.every((warning) => warning.severity === 'warning'),
		warnings,
		errors,
	};

	return result;
}
