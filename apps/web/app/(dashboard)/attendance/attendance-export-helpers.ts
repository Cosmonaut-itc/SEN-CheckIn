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
	dateRange?: {
		startDateKey: string;
		endDateKey: string;
	};
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

interface PendingEntryByEmployee {
	employeeId: string;
	record: AttendanceRecord;
}

/**
 * Formats a local date key as dd/MM/yyyy.
 *
 * @param dateKey - Local date key in YYYY-MM-DD format
 * @returns Human-readable date string for CSV output
 */
function formatDateKey(dateKey: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
	if (!match) {
		return dateKey;
	}

	const [, year, month, day] = match;
	return `${day}/${month}/${year}`;
}

/**
 * Formats a timestamp in the provided timezone as HH:mm.
 *
 * @param timestamp - UTC timestamp for the attendance event
 * @param timeZone - Organization timezone
 * @returns Localized time string using 24-hour format
 * @throws {Error} If the formatted parts do not contain hour or minute values
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
 * Resolves or creates a grouped attendance bucket.
 *
 * @param groups - Existing grouped attendance buckets
 * @param record - Attendance record to append
 * @param dateKey - Local date key assigned to the record
 * @returns Group for the employee/date combination
 */
function getOrCreateAttendanceGroup(
	groups: Map<string, AttendanceSummaryGroup>,
	record: AttendanceRecord,
	dateKey: string,
): AttendanceSummaryGroup {
	const groupKey = `${record.employeeId}:${dateKey}`;
	const currentGroup = groups.get(groupKey);

	if (currentGroup) {
		return currentGroup;
	}

	const nextGroup: AttendanceSummaryGroup = {
		employeeId: record.employeeId,
		employeeName: record.employeeName,
		dateKey,
		records: [],
	};
	groups.set(groupKey, nextGroup);
	return nextGroup;
}

/**
 * Appends an attendance record into the grouped bucket for the provided day key.
 *
 * @param groups - Existing grouped attendance buckets
 * @param record - Attendance record to append
 * @param dateKey - Local date key assigned to the record
 * @returns void
 */
function appendRecordToGroup(
	groups: Map<string, AttendanceSummaryGroup>,
	record: AttendanceRecord,
	dateKey: string,
): void {
	const group = getOrCreateAttendanceGroup(groups, record, dateKey);
	group.records.push(record);
}

/**
 * Groups attendance records by employee and export day.
 *
 * Regular attendance pairs are matched first per employee so overnight shifts can
 * stay together even when the exit lands on the following local day. Once paired,
 * the full span is attributed to the check-in local date, which keeps the export
 * aligned with the shift start while preserving the current "one row per employee
 * per day" shape of the CSV.
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
	const openEntriesByEmployee = new Map<string, PendingEntryByEmployee[]>();
	const sortedRecords = [...records].sort((left, right) => {
		const employeeComparison = left.employeeId.localeCompare(right.employeeId, 'es-MX');
		if (employeeComparison !== 0) {
			return employeeComparison;
		}

		return new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
	});

	for (const record of sortedRecords) {
		if (record.type === 'WORK_OFFSITE') {
			appendRecordToGroup(groups, record, getAttendanceDateKey(record, timeZone));
			continue;
		}

		if (record.type === 'CHECK_IN') {
			const openEntries = openEntriesByEmployee.get(record.employeeId) ?? [];
			openEntries.push({ employeeId: record.employeeId, record });
			openEntriesByEmployee.set(record.employeeId, openEntries);
			continue;
		}

		if (record.type === 'CHECK_OUT' || record.type === 'CHECK_OUT_AUTHORIZED') {
			const openEntries = openEntriesByEmployee.get(record.employeeId);
			const pendingEntry = openEntries?.shift();

			if (!pendingEntry) {
				appendRecordToGroup(groups, record, getAttendanceDateKey(record, timeZone));
				continue;
			}

			if (openEntries && openEntries.length === 0) {
				openEntriesByEmployee.delete(record.employeeId);
			}

			const entryDateKey = getAttendanceDateKey(pendingEntry.record, timeZone);
			appendRecordToGroup(groups, pendingEntry.record, entryDateKey);
			appendRecordToGroup(groups, record, entryDateKey);
		}
	}

	for (const openEntries of openEntriesByEmployee.values()) {
		for (const pendingEntry of openEntries) {
			appendRecordToGroup(groups, pendingEntry.record, getAttendanceDateKey(pendingEntry.record, timeZone));
		}
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

	return results
		.filter((result) => {
			if (!options.dateRange) {
				return true;
			}

			return (
				result.dateKey >= options.dateRange.startDateKey &&
				result.dateKey <= options.dateRange.endDateKey
			);
		})
		.map((result) => result.row);
}
