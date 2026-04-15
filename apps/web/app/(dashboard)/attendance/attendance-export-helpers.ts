import type { AttendanceRecord } from '@/lib/client-functions';
import { toDateKeyInTimeZone } from '@/lib/time-zone';

export interface AttendanceSummaryCsvRow {
	employeeName: string;
	employeeId: string;
	date: string;
	firstEntry: string;
	lastExit: string;
	totalHours: string;
}

export interface AttendanceSummaryLabels {
	incomplete: string;
	noEntry: string;
	noExit: string;
	workOffsite: string;
}

export interface AggregateAttendanceOptions {
	timeZone: string;
	labels: AttendanceSummaryLabels;
}

interface AttendanceSummaryGroup {
	employeeId: string;
	employeeName: string;
	dateKey: string;
	records: AttendanceRecord[];
}

interface AttendanceSummaryResult {
	dateKey: string;
	row: AttendanceSummaryCsvRow;
}

/**
 * Formats a local date key as dd/MM/yyyy.
 *
 * @param dateKey - Local date key in YYYY-MM-DD format
 * @returns Human-readable date string for CSV output
 */
function formatDateKey(dateKey: string): string {
	const [year, month, day] = dateKey.split('-');
	return `${day}/${month}/${year}`;
}

/**
 * Formats a timestamp in the provided timezone as HH:mm.
 *
 * @param timestamp - UTC timestamp for the attendance event
 * @param timeZone - Organization timezone
 * @returns Localized time string using 24-hour format
 */
function formatTimeInTimeZone(timestamp: Date, timeZone: string): string {
	const parts = new Intl.DateTimeFormat('es-MX', {
		timeZone,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(timestamp);

	const hour = parts.find((part) => part.type === 'hour')?.value;
	const minute = parts.find((part) => part.type === 'minute')?.value;

	if (!hour || !minute) {
		throw new Error(`Failed to format attendance time in timezone "${timeZone}".`);
	}

	return `${hour}:${minute}`;
}

/**
 * Formats a worked-minute total as HH:mm.
 *
 * @param totalMinutes - Total worked minutes for the day
 * @returns Worked-hours string with zero-padded components
 */
function formatWorkedMinutes(totalMinutes: number): string {
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Resolves the local grouping date for an attendance record.
 *
 * @param record - Attendance record being grouped
 * @param timeZone - Organization timezone
 * @returns Local date key for the record
 */
function getAttendanceDateKey(record: AttendanceRecord, timeZone: string): string {
	if (record.type === 'WORK_OFFSITE' && record.offsiteDateKey) {
		return record.offsiteDateKey;
	}

	return toDateKeyInTimeZone(new Date(record.timestamp), timeZone);
}

/**
 * Groups attendance records by employee and local date.
 *
 * @param records - Attendance records to group
 * @param timeZone - Organization timezone
 * @returns Grouped attendance records
 */
function groupAttendanceRecords(
	records: readonly AttendanceRecord[],
	timeZone: string,
): Map<string, AttendanceSummaryGroup> {
	const groups = new Map<string, AttendanceSummaryGroup>();

	for (const record of records) {
		const dateKey = getAttendanceDateKey(record, timeZone);
		const groupKey = `${record.employeeId}:${dateKey}`;
		const currentGroup = groups.get(groupKey);

		if (currentGroup) {
			currentGroup.records.push(record);
			continue;
		}

		groups.set(groupKey, {
			employeeId: record.employeeId,
			employeeName: record.employeeName,
			dateKey,
			records: [record],
		});
	}

	return groups;
}

/**
 * Builds the CSV summary row for a WORK_OFFSITE day.
 *
 * @param group - Grouped attendance records for the employee/day
 * @param labels - Localized summary labels
 * @returns CSV summary row for the offsite day
 */
function buildOffsiteSummaryRow(
	group: AttendanceSummaryGroup,
	labels: AttendanceSummaryLabels,
): AttendanceSummaryCsvRow {
	return {
		employeeName: group.employeeName,
		employeeId: group.employeeId,
		date: formatDateKey(group.dateKey),
		firstEntry: labels.workOffsite,
		lastExit: labels.workOffsite,
		totalHours: labels.workOffsite,
	};
}

/**
 * Builds the CSV summary row for a normal attendance day.
 *
 * @param group - Grouped attendance records for the employee/day
 * @param options - Aggregation options including timezone and labels
 * @returns CSV summary row for the grouped attendance day
 */
function buildWorkedSummaryRow(
	group: AttendanceSummaryGroup,
	options: AggregateAttendanceOptions,
): AttendanceSummaryCsvRow {
	const sortedRecords = [...group.records].sort(
		(left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
	);
	const openEntries: Date[] = [];
	let firstEntryAt: Date | null = null;
	let lastExitAt: Date | null = null;
	let totalWorkedMinutes = 0;
	let hasIncompletePair = false;

	for (const record of sortedRecords) {
		const timestamp = new Date(record.timestamp);

		if (record.type === 'CHECK_IN') {
			if (!firstEntryAt) {
				firstEntryAt = timestamp;
			}
			openEntries.push(timestamp);
			continue;
		}

		if (record.type === 'CHECK_OUT' || record.type === 'CHECK_OUT_AUTHORIZED') {
			lastExitAt = timestamp;

			const entryTimestamp = openEntries.shift();
			if (!entryTimestamp) {
				hasIncompletePair = true;
				continue;
			}

			totalWorkedMinutes += Math.max(
				0,
				Math.round((timestamp.getTime() - entryTimestamp.getTime()) / 60_000),
			);
		}
	}

	if (openEntries.length > 0) {
		hasIncompletePair = true;
	}

	return {
		employeeName: group.employeeName,
		employeeId: group.employeeId,
		date: formatDateKey(group.dateKey),
		firstEntry: firstEntryAt
			? formatTimeInTimeZone(firstEntryAt, options.timeZone)
			: options.labels.noEntry,
		lastExit: lastExitAt ? formatTimeInTimeZone(lastExitAt, options.timeZone) : options.labels.noExit,
		totalHours: hasIncompletePair
			? options.labels.incomplete
			: formatWorkedMinutes(totalWorkedMinutes),
	};
}

/**
 * Aggregates per-event attendance rows into one summary row per employee per local day.
 *
 * @param records - Attendance records fetched for the CSV export
 * @param options - Aggregation options including timezone and localized labels
 * @returns CSV summary rows sorted by employee name and date
 */
export function aggregateAttendanceByPersonDay(
	records: readonly AttendanceRecord[],
	options: AggregateAttendanceOptions,
): AttendanceSummaryCsvRow[] {
	if (records.length === 0) {
		return [];
	}

	const groupedRecords = groupAttendanceRecords(records, options.timeZone);
	const results: AttendanceSummaryResult[] = [];

	for (const group of groupedRecords.values()) {
		const row = group.records.some((record) => record.type === 'WORK_OFFSITE')
			? buildOffsiteSummaryRow(group, options.labels)
			: buildWorkedSummaryRow(group, options);

		results.push({
			dateKey: group.dateKey,
			row,
		});
	}

	results.sort((left, right) => {
		const employeeNameComparison = left.row.employeeName.localeCompare(right.row.employeeName, 'es-MX');
		if (employeeNameComparison !== 0) {
			return employeeNameComparison;
		}

		const dateComparison = left.dateKey.localeCompare(right.dateKey);
		if (dateComparison !== 0) {
			return dateComparison;
		}

		return left.row.employeeId.localeCompare(right.row.employeeId, 'es-MX');
	});

	return results.map((result) => result.row);
}
