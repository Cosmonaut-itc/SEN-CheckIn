const DEFAULT_PAYROLL_TIME_ZONE = 'America/Mexico_City';
const PAYROLL_CUTOFF_HOUR = 10;

/**
 * Checks whether a value is a valid IANA timezone identifier.
 *
 * @param timeZone - IANA timezone identifier
 * @returns True when the timezone is supported by the runtime
 */
function isValidIanaTimeZone(timeZone: string): boolean {
	try {
		const formatter = new Intl.DateTimeFormat('en-US', { timeZone });
		formatter.format(0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Formats a UTC instant as a local date key in a timezone.
 *
 * @param timestamp - UTC instant
 * @param timeZone - IANA timezone identifier
 * @returns Local date key in YYYY-MM-DD format
 * @throws When date parts cannot be extracted
 */
function toDateKeyInTimeZone(timestamp: Date, timeZone: string): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(timestamp);
	const yearPart = parts.find((part) => part.type === 'year')?.value;
	const monthPart = parts.find((part) => part.type === 'month')?.value;
	const dayPart = parts.find((part) => part.type === 'day')?.value;

	if (!yearPart || !monthPart || !dayPart) {
		throw new Error(`Failed to format date parts for timezone "${timeZone}".`);
	}

	return `${yearPart}-${monthPart}-${dayPart}`;
}

/**
 * Adds calendar days to a date key using UTC date math.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @param days - Number of days to add
 * @returns Resulting date key
 */
function addDaysToDateKey(dateKey: string, days: number): string {
	const base = new Date(`${dateKey}T00:00:00Z`);
	base.setUTCDate(base.getUTCDate() + days);
	return base.toISOString().slice(0, 10);
}

/**
 * Finds the latest target day-of-week inside an inclusive date-key period.
 *
 * @param args - Period and target day inputs
 * @returns Matching date key, or null when the day is not in the period
 */
function getLatestDateKeyForDayOfWeekInPeriod(args: {
	periodStartDateKey: string;
	periodEndDateKey: string;
	targetDayOfWeek: number;
}): string | null {
	let currentKey = args.periodStartDateKey;
	let matchingDateKey: string | null = null;
	for (let index = 0; index < 400 && currentKey <= args.periodEndDateKey; index += 1) {
		if (new Date(`${currentKey}T00:00:00Z`).getUTCDay() === args.targetDayOfWeek) {
			matchingDateKey = currentKey;
		}
		if (currentKey === args.periodEndDateKey) {
			break;
		}
		currentKey = addDaysToDateKey(currentKey, 1);
	}
	return matchingDateKey;
}

/**
 * Resolves Friday/Saturday date keys assumed attended after the payroll cutoff.
 *
 * @param args - Cutoff resolution inputs
 * @param args.now - Current instant used to decide whether cutoff has passed
 * @param args.periodStartDateKey - Payroll/report period start key
 * @param args.periodEndDateKey - Payroll/report period end key
 * @param args.timeZone - Organization payroll timezone
 * @returns Friday and Saturday date keys when the current period is past Friday 10:00
 */
export function resolvePayrollCutoffAssumedDateKeys(args: {
	now: Date;
	periodStartDateKey: string;
	periodEndDateKey: string;
	timeZone: string;
}): string[] {
	const resolvedTimeZone = isValidIanaTimeZone(args.timeZone)
		? args.timeZone
		: DEFAULT_PAYROLL_TIME_ZONE;
	const currentDateKey = toDateKeyInTimeZone(args.now, resolvedTimeZone);
	if (currentDateKey < args.periodStartDateKey || currentDateKey > args.periodEndDateKey) {
		return [];
	}

	const fridayDateKey = getLatestDateKeyForDayOfWeekInPeriod({
		periodStartDateKey: args.periodStartDateKey,
		periodEndDateKey: args.periodEndDateKey,
		targetDayOfWeek: 5,
	});
	if (!fridayDateKey || currentDateKey < fridayDateKey) {
		return [];
	}

	if (currentDateKey === fridayDateKey) {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone: resolvedTimeZone,
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23',
		}).formatToParts(args.now);
		const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
		if (hour < PAYROLL_CUTOFF_HOUR) {
			return [];
		}
	}

	const saturdayDateKey = addDaysToDateKey(fridayDateKey, 1);
	return [fridayDateKey, saturdayDateKey].filter(
		(dateKey) => dateKey >= args.periodStartDateKey && dateKey <= args.periodEndDateKey,
	);
}
