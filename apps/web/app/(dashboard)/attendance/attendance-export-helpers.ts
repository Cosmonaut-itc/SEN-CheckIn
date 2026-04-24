import type { AttendanceRecord } from '@/lib/client-functions';
import { toDateKeyInTimeZone } from '@/lib/time-zone';

const WORK_OFFSITE_STANDARD_MINUTES = 480;
const MAX_WORKED_SPAN_MINUTES = 16 * 60;

export interface AttendanceSummaryCsvRow {
	employeeName: string;
	employeeId: string;
	date: string;
	firstEntry: string;
	lastExit: string;
	totalHours: string;
}

export interface AttendanceSummaryPdfRow extends AttendanceSummaryCsvRow {
	workMinutes: number | null;
}

export interface AttendanceEmployeePdfRow {
	day: string;
	firstEntry: string;
	lastExit: string;
	totalHours: string;
	workMinutes: number | null;
}

export interface AttendanceEmployeePdfGroup {
	employeeId: string;
	employeeName: string;
	rows: AttendanceEmployeePdfRow[];
	totalWorkedMinutes: number;
}

export interface AttendanceSummaryLabels {
	incomplete: string;
	noEntry: string;
	noExit: string;
	payrollCutoffAssumed: string;
	vacation: string;
	workOffsite: string;
}

export interface AttendanceVirtualDay {
	employeeId: string;
	employeeName: string;
	dateKey: string;
	kind: 'VACATION' | 'PAYROLL_CUTOFF_ASSUMED';
	workMinutes: number;
}

export interface AggregateAttendanceOptions {
	timeZone: string;
	labels: AttendanceSummaryLabels;
	dateRange?: {
		startDateKey: string;
		endDateKey: string;
	};
	overnightEligibleEmployeeIds?: ReadonlySet<string>;
	virtualDays?: AttendanceVirtualDay[];
}

interface AttendanceSummaryGroup {
	employeeId: string;
	employeeName: string;
	dateKey: string;
	records: AttendanceRecord[];
}

interface AttendanceSummaryResult {
	dateKey: string;
	row: AttendanceSummaryPdfRow;
	virtualKind?: AttendanceVirtualDay['kind'];
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
	options: AggregateAttendanceOptions,
): Map<string, AttendanceSummaryGroup> {
	const groups = new Map<string, AttendanceSummaryGroup>();
	const openEntriesByEmployee = new Map<string, AttendanceRecord>();
	const sortedRecords = [...records].sort((left, right) => {
		const employeeComparison = left.employeeId.localeCompare(right.employeeId, 'es-MX');
		if (employeeComparison !== 0) {
			return employeeComparison;
		}

		return new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
	});

	for (const record of sortedRecords) {
		if (record.type === 'WORK_OFFSITE') {
			const openEntry = openEntriesByEmployee.get(record.employeeId);
			if (openEntry) {
				appendRecordToGroup(
					groups,
					openEntry,
					getAttendanceDateKey(openEntry, options.timeZone),
				);
				openEntriesByEmployee.delete(record.employeeId);
			}
			appendRecordToGroup(groups, record, getAttendanceDateKey(record, options.timeZone));
			continue;
		}

		if (record.type === 'CHECK_IN') {
			const openEntry = openEntriesByEmployee.get(record.employeeId);
			if (openEntry) {
				const openEntryDateKey = getAttendanceDateKey(openEntry, options.timeZone);
				const currentEntryDateKey = getAttendanceDateKey(record, options.timeZone);
				if (openEntryDateKey === currentEntryDateKey) {
					appendRecordToGroup(groups, record, currentEntryDateKey);
					continue;
				}

				appendRecordToGroup(groups, openEntry, openEntryDateKey);
			}
			openEntriesByEmployee.set(record.employeeId, record);
			continue;
		}

		if (record.type === 'CHECK_OUT_AUTHORIZED') {
			const pendingEntry = openEntriesByEmployee.get(record.employeeId);
			const dateKey = pendingEntry
				? getAttendanceDateKey(pendingEntry, options.timeZone)
				: getAttendanceDateKey(record, options.timeZone);
			appendRecordToGroup(groups, record, dateKey);
			continue;
		}

		if (record.type === 'CHECK_OUT') {
			const pendingEntry = openEntriesByEmployee.get(record.employeeId);

			if (!pendingEntry) {
				appendRecordToGroup(groups, record, getAttendanceDateKey(record, options.timeZone));
				continue;
			}

			openEntriesByEmployee.delete(record.employeeId);
			const entryDateKey = getAttendanceDateKey(pendingEntry, options.timeZone);
			const exitDateKey = getAttendanceDateKey(record, options.timeZone);
			if (
				entryDateKey !== exitDateKey &&
				!options.overnightEligibleEmployeeIds?.has(record.employeeId)
			) {
				appendRecordToGroup(groups, pendingEntry, entryDateKey);
				appendRecordToGroup(groups, record, exitDateKey);
				continue;
			}

			appendRecordToGroup(groups, pendingEntry, entryDateKey);
			appendRecordToGroup(groups, record, entryDateKey);
		}
	}

	for (const pendingEntry of openEntriesByEmployee.values()) {
		appendRecordToGroup(
			groups,
			pendingEntry,
			getAttendanceDateKey(pendingEntry, options.timeZone),
		);
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
): AttendanceSummaryPdfRow {
	return {
		employeeName: group.employeeName,
		employeeId: group.employeeId,
		date: formatDateKey(group.dateKey),
		firstEntry: labels.workOffsite,
		lastExit: labels.workOffsite,
		totalHours: formatWorkedMinutes(WORK_OFFSITE_STANDARD_MINUTES),
		workMinutes: WORK_OFFSITE_STANDARD_MINUTES,
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
): AttendanceSummaryPdfRow {
	const sortedRecords = [...group.records].sort(
		(left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
	);
	let openEntryAt: Date | null = null;
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
			if (!openEntryAt) {
				openEntryAt = timestamp;
			}
			continue;
		}

		if (record.type === 'CHECK_OUT_AUTHORIZED') {
			lastExitAt = timestamp;
			continue;
		}

		if (record.type === 'CHECK_OUT') {
			lastExitAt = timestamp;

			if (!openEntryAt) {
				if (!firstEntryAt && totalWorkedMinutes === 0) {
					hasIncompletePair = true;
				}
				continue;
			}

			const workedMinutes = Math.max(
				0,
				Math.round((timestamp.getTime() - openEntryAt.getTime()) / 60_000),
			);
			if (workedMinutes > MAX_WORKED_SPAN_MINUTES) {
				hasIncompletePair = true;
				openEntryAt = null;
				continue;
			}

			totalWorkedMinutes += workedMinutes;
			openEntryAt = null;
		}
	}

	if (openEntryAt) {
		hasIncompletePair = true;
	}

	return {
		employeeName: group.employeeName,
		employeeId: group.employeeId,
		date: formatDateKey(group.dateKey),
		firstEntry: firstEntryAt
			? formatTimeInTimeZone(firstEntryAt, options.timeZone)
			: options.labels.noEntry,
		lastExit: lastExitAt
			? formatTimeInTimeZone(lastExitAt, options.timeZone)
			: options.labels.noExit,
		totalHours: hasIncompletePair
			? options.labels.incomplete
			: formatWorkedMinutes(totalWorkedMinutes),
		workMinutes: hasIncompletePair ? null : totalWorkedMinutes,
	};
}

/**
 * Builds a worked summary row from a virtual attendance day.
 *
 * @param virtualDay - Virtual attendance day to render
 * @param options - Aggregation options including labels
 * @param existingRow - Existing real attendance row for the same employee/date
 * @returns Summary row representing the virtual day
 */
function buildVirtualSummaryRow(
	virtualDay: AttendanceVirtualDay,
	options: AggregateAttendanceOptions,
	existingRow?: AttendanceSummaryPdfRow,
): AttendanceSummaryPdfRow {
	const fallbackLabel =
		virtualDay.kind === 'VACATION'
			? options.labels.vacation
			: options.labels.payrollCutoffAssumed;
	const firstEntry =
		virtualDay.kind === 'PAYROLL_CUTOFF_ASSUMED' &&
		existingRow &&
		existingRow.firstEntry !== options.labels.noEntry
			? existingRow.firstEntry
			: fallbackLabel;

	return {
		employeeName: virtualDay.employeeName,
		employeeId: virtualDay.employeeId,
		date: formatDateKey(virtualDay.dateKey),
		firstEntry,
		lastExit: fallbackLabel,
		totalHours: formatWorkedMinutes(virtualDay.workMinutes),
		workMinutes: virtualDay.workMinutes,
	};
}

/**
 * Resolves a stable map key for employee/date summary rows.
 *
 * @param employeeId - Employee identifier
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Composite key
 */
function getSummaryResultKey(employeeId: string, dateKey: string): string {
	return `${employeeId}:${dateKey}`;
}

/**
 * Aggregates per-event attendance rows into one summary row per employee per local day.
 *
 * @param records - Attendance records fetched for the CSV export
 * @param options - Aggregation options including timezone and localized labels
 * @returns Detailed summary rows sorted by employee name and date
 */
export function buildAttendanceEmployeePdfSummaryRows(
	records: readonly AttendanceRecord[],
	options: AggregateAttendanceOptions,
): AttendanceSummaryPdfRow[] {
	if (records.length === 0 && (!options.virtualDays || options.virtualDays.length === 0)) {
		return [];
	}

	const groupedRecords = groupAttendanceRecords(records, options);
	const resultsByKey = new Map<string, AttendanceSummaryResult>();

	for (const group of groupedRecords.values()) {
		const row = group.records.some((record) => record.type === 'WORK_OFFSITE')
			? buildOffsiteSummaryRow(group, options.labels)
			: buildWorkedSummaryRow(group, options);

		resultsByKey.set(getSummaryResultKey(group.employeeId, group.dateKey), {
			dateKey: group.dateKey,
			row,
		});
	}

	for (const virtualDay of options.virtualDays ?? []) {
		const key = getSummaryResultKey(virtualDay.employeeId, virtualDay.dateKey);
		const existing = resultsByKey.get(key);
		if (existing?.virtualKind === 'VACATION') {
			continue;
		}
		if (existing?.virtualKind === 'PAYROLL_CUTOFF_ASSUMED' && virtualDay.kind !== 'VACATION') {
			continue;
		}
		if (
			(virtualDay.kind === 'PAYROLL_CUTOFF_ASSUMED' || virtualDay.kind === 'VACATION') &&
			existing &&
			existing.virtualKind === undefined &&
			existing.row.totalHours !== options.labels.incomplete
		) {
			continue;
		}

		resultsByKey.set(key, {
			dateKey: virtualDay.dateKey,
			row: buildVirtualSummaryRow(virtualDay, options, existing?.row),
			virtualKind: virtualDay.kind,
		});
	}

	const results = Array.from(resultsByKey.values());

	results.sort((left, right) => {
		const employeeNameComparison = left.row.employeeName.localeCompare(
			right.row.employeeName,
			'es-MX',
		);
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
	return buildAttendanceEmployeePdfSummaryRows(records, options).map((row) => ({
		employeeName: row.employeeName,
		employeeId: row.employeeId,
		date: row.date,
		firstEntry: row.firstEntry,
		lastExit: row.lastExit,
		totalHours: row.totalHours,
	}));
}

/**
 * Groups attendance summary rows by employee for PDF export.
 *
 * @param rows - Daily attendance summary rows already sorted by employee and date
 * @returns Per-employee PDF groups with daily rows and duration totals
 */
export function buildAttendanceEmployeePdfGroups(
	rows: readonly AttendanceSummaryPdfRow[],
): AttendanceEmployeePdfGroup[] {
	const groups = new Map<string, AttendanceEmployeePdfGroup>();
	const orderedGroups: AttendanceEmployeePdfGroup[] = [];

	for (const row of rows) {
		let group = groups.get(row.employeeId);

		if (!group) {
			group = {
				employeeId: row.employeeId,
				employeeName: row.employeeName,
				rows: [],
				totalWorkedMinutes: 0,
			};
			groups.set(row.employeeId, group);
			orderedGroups.push(group);
		}

		group.rows.push({
			day: row.date,
			firstEntry: row.firstEntry,
			lastExit: row.lastExit,
			totalHours: row.totalHours,
			workMinutes: row.workMinutes,
		});

		if (row.workMinutes !== null) {
			group.totalWorkedMinutes += row.workMinutes;
		}
	}

	return orderedGroups;
}
