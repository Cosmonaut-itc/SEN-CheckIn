import { describe, expect, it } from 'vitest';

import type { AttendanceRecord } from '@/lib/client-functions';

import {
	aggregateAttendanceByPersonDay,
	buildAttendanceEmployeePdfGroups,
	buildAttendanceEmployeePdfSummaryRows,
	type AttendanceSummaryLabels,
} from './attendance-export-helpers';

const TEST_TIME_ZONE = 'America/Mexico_City';

const TEST_LABELS: AttendanceSummaryLabels = {
	incomplete: 'Incompleto',
	noEntry: 'Sin entrada',
	noExit: 'Sin salida',
	payrollCutoffAssumed: 'Asistencia por nómina',
	vacation: 'Vacaciones',
	workOffsite: 'Fuera de oficina',
};

interface BuildAttendanceRecordArgs {
	employeeId: string;
	employeeName: string;
	timestamp: string;
	type: AttendanceRecord['type'];
	offsiteDateKey?: string | null;
	offsiteDayKind?: AttendanceRecord['offsiteDayKind'];
}

/**
 * Builds a test attendance record with the minimum required fields.
 *
 * @param args - Partial attendance values for the scenario
 * @returns Fully-typed attendance record
 */
function buildAttendanceRecord(args: BuildAttendanceRecordArgs): AttendanceRecord {
	const timestamp = new Date(args.timestamp);

	return {
		id: `${args.employeeId}-${args.type}-${args.timestamp}`,
		employeeId: args.employeeId,
		employeeName: args.employeeName,
		deviceId: 'device-1',
		deviceLocationId: 'location-1',
		deviceLocationName: 'Matriz',
		timestamp,
		type: args.type,
		offsiteDateKey: args.offsiteDateKey ?? null,
		offsiteDayKind: args.offsiteDayKind ?? null,
		offsiteReason: null,
		offsiteCreatedByUserId: null,
		offsiteUpdatedByUserId: null,
		offsiteUpdatedAt: null,
		metadata: null,
		createdAt: timestamp,
		updatedAt: timestamp,
	};
}

describe('aggregateAttendanceByPersonDay', () => {
	it('aggregates a simple check-in and check-out pair', () => {
		const rows = aggregateAttendanceByPersonDay(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T14:30:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T23:30:00.000Z',
					type: 'CHECK_OUT',
				}),
			],
			{ labels: TEST_LABELS, timeZone: TEST_TIME_ZONE },
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({
			employeeName: 'Juan',
			employeeId: 'emp-1',
			date: '10/04/2026',
			firstEntry: '08:30',
			lastExit: '17:30',
			totalHours: '09:00',
		});
	});

	it('sums two worked spans around a lunch break', () => {
		const rows = aggregateAttendanceByPersonDay(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T14:30:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T18:30:00.000Z',
					type: 'CHECK_OUT',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T19:30:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T23:30:00.000Z',
					type: 'CHECK_OUT',
				}),
			],
			{ labels: TEST_LABELS, timeZone: TEST_TIME_ZONE },
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]?.firstEntry).toBe('08:30');
		expect(rows[0]?.lastExit).toBe('17:30');
		expect(rows[0]?.totalHours).toBe('08:00');
	});

	it('ignores duplicate check-ins between the first entry and the final exit', () => {
		const rows = aggregateAttendanceByPersonDay(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-21T15:56:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-21T16:05:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-22T00:47:00.000Z',
					type: 'CHECK_OUT',
				}),
			],
			{ labels: TEST_LABELS, timeZone: TEST_TIME_ZONE },
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({
			employeeName: 'Juan',
			employeeId: 'emp-1',
			date: '21/04/2026',
			firstEntry: '09:56',
			lastExit: '18:47',
			totalHours: '08:51',
		});
	});

	it('shows a missing exit as incomplete', () => {
		const rows = aggregateAttendanceByPersonDay(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T14:30:00.000Z',
					type: 'CHECK_IN',
				}),
			],
			{ labels: TEST_LABELS, timeZone: TEST_TIME_ZONE },
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]?.firstEntry).toBe('08:30');
		expect(rows[0]?.lastExit).toBe('Sin salida');
		expect(rows[0]?.totalHours).toBe('Incompleto');
	});

	it('shows a missing entry as incomplete', () => {
		const rows = aggregateAttendanceByPersonDay(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T23:30:00.000Z',
					type: 'CHECK_OUT',
				}),
			],
			{ labels: TEST_LABELS, timeZone: TEST_TIME_ZONE },
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]?.firstEntry).toBe('Sin entrada');
		expect(rows[0]?.lastExit).toBe('17:30');
		expect(rows[0]?.totalHours).toBe('Incompleto');
	});

	it('keeps an authorized check-out visible without closing worked hours', () => {
		const rows = aggregateAttendanceByPersonDay(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T14:30:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T20:00:00.000Z',
					type: 'CHECK_OUT_AUTHORIZED',
				}),
			],
			{ labels: TEST_LABELS, timeZone: TEST_TIME_ZONE },
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]?.lastExit).toBe('14:00');
		expect(rows[0]?.totalHours).toBe('Incompleto');
	});

	it('keeps counting worked hours through an authorized check-out until the normal exit', () => {
		const rows = aggregateAttendanceByPersonDay(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T13:13:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T13:32:00.000Z',
					type: 'CHECK_OUT_AUTHORIZED',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T17:54:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T23:00:00.000Z',
					type: 'CHECK_OUT',
				}),
			],
			{ labels: TEST_LABELS, timeZone: TEST_TIME_ZONE },
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({
			employeeName: 'Juan',
			employeeId: 'emp-1',
			date: '10/04/2026',
			firstEntry: '07:13',
			lastExit: '17:00',
			totalHours: '09:47',
		});
	});

	it('shows WORK_OFFSITE rows as offsite summaries', () => {
		const rows = aggregateAttendanceByPersonDay(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T06:00:00.000Z',
					type: 'WORK_OFFSITE',
					offsiteDateKey: '2026-04-10',
					offsiteDayKind: 'LABORABLE',
				}),
			],
			{ labels: TEST_LABELS, timeZone: TEST_TIME_ZONE },
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({
			employeeName: 'Juan',
			employeeId: 'emp-1',
			date: '10/04/2026',
			firstEntry: 'Fuera de oficina',
			lastExit: 'Fuera de oficina',
			totalHours: '08:00',
		});
	});

	it('keeps WORK_OFFSITE precedence when a day also has check-in records', () => {
		const rows = aggregateAttendanceByPersonDay(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T06:00:00.000Z',
					type: 'WORK_OFFSITE',
					offsiteDateKey: '2026-04-10',
					offsiteDayKind: 'LABORABLE',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T14:30:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T23:30:00.000Z',
					type: 'CHECK_OUT',
				}),
			],
			{ labels: TEST_LABELS, timeZone: TEST_TIME_ZONE },
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({
			employeeName: 'Juan',
			employeeId: 'emp-1',
			date: '10/04/2026',
			firstEntry: 'Fuera de oficina',
			lastExit: 'Fuera de oficina',
			totalHours: '08:00',
		});
	});

	it('preserves malformed offsite date keys instead of rendering undefined segments', () => {
		const rows = aggregateAttendanceByPersonDay(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-10T06:00:00.000Z',
					type: 'WORK_OFFSITE',
					offsiteDateKey: '2026-04',
					offsiteDayKind: 'LABORABLE',
				}),
			],
			{ labels: TEST_LABELS, timeZone: TEST_TIME_ZONE },
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]?.date).toBe('2026-04');
	});

	it('sorts rows by employee name and then date', () => {
		const rows = aggregateAttendanceByPersonDay(
			[
				buildAttendanceRecord({
					employeeId: 'emp-2',
					employeeName: 'María',
					timestamp: '2026-04-10T14:00:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Ana',
					timestamp: '2026-04-11T14:00:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Ana',
					timestamp: '2026-04-10T14:00:00.000Z',
					type: 'CHECK_IN',
				}),
			],
			{ labels: TEST_LABELS, timeZone: TEST_TIME_ZONE },
		);

		expect(rows).toHaveLength(3);
		expect(rows.map((row) => `${row.employeeName}-${row.date}`)).toEqual([
			'Ana-10/04/2026',
			'Ana-11/04/2026',
			'María-10/04/2026',
		]);
	});

	it('returns an empty array for empty input', () => {
		const rows = aggregateAttendanceByPersonDay([], {
			labels: TEST_LABELS,
			timeZone: TEST_TIME_ZONE,
		});

		expect(rows).toEqual([]);
	});

	it('pairs overnight entry and exit under the check-in date key', () => {
		const rows = aggregateAttendanceByPersonDay(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-11T05:00:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-11T13:00:00.000Z',
					type: 'CHECK_OUT',
				}),
			],
			{ labels: TEST_LABELS, timeZone: TEST_TIME_ZONE },
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({
			employeeName: 'Juan',
			employeeId: 'emp-1',
			date: '10/04/2026',
			firstEntry: '23:00',
			lastExit: '07:00',
			totalHours: '08:00',
		});
	});

	it('filters overnight spillover rows back to the selected local date range', () => {
		const rows = aggregateAttendanceByPersonDay(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-11T05:00:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-11T13:00:00.000Z',
					type: 'CHECK_OUT',
				}),
			],
			{
				dateRange: {
					startDateKey: '2026-04-10',
					endDateKey: '2026-04-10',
				},
				labels: TEST_LABELS,
				timeZone: TEST_TIME_ZONE,
			},
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]?.date).toBe('10/04/2026');
		expect(rows[0]?.totalHours).toBe('08:00');
	});

	it('creates separate rows for two employees on the same day', () => {
		const rows = aggregateAttendanceByPersonDay(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Ana',
					timestamp: '2026-04-10T14:00:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-2',
					employeeName: 'Bruno',
					timestamp: '2026-04-10T15:00:00.000Z',
					type: 'CHECK_IN',
				}),
			],
			{ labels: TEST_LABELS, timeZone: TEST_TIME_ZONE },
		);

		expect(rows).toHaveLength(2);
		expect(rows[0]?.employeeId).toBe('emp-1');
		expect(rows[1]?.employeeId).toBe('emp-2');
	});

	it('does not pair a previous-day open entry with the next worked day exit', () => {
		const rows = aggregateAttendanceByPersonDay(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-24T13:00:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-25T14:00:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Juan',
					timestamp: '2026-04-25T22:00:00.000Z',
					type: 'CHECK_OUT',
				}),
			],
			{ labels: TEST_LABELS, timeZone: TEST_TIME_ZONE },
		);

		expect(rows).toEqual([
			{
				employeeName: 'Juan',
				employeeId: 'emp-1',
				date: '24/04/2026',
				firstEntry: '07:00',
				lastExit: 'Sin salida',
				totalHours: 'Incompleto',
			},
			{
				employeeName: 'Juan',
				employeeId: 'emp-1',
				date: '25/04/2026',
				firstEntry: '08:00',
				lastExit: '16:00',
				totalHours: '08:00',
			},
		]);
	});
});

describe('buildAttendanceEmployeePdfGroups', () => {
	it('uses numeric work minutes instead of reparsing totalHours text', () => {
		const groups = buildAttendanceEmployeePdfGroups([
			{
				employeeId: 'emp-1',
				employeeName: 'Ana',
				date: '10/04/2026',
				firstEntry: '08:00',
				lastExit: '16:00',
				totalHours: 'Fuera de oficina',
				workMinutes: 125,
			},
		]);

		expect(groups).toEqual([
			{
				employeeId: 'emp-1',
				employeeName: 'Ana',
				totalWorkedMinutes: 125,
				rows: [
					{
						day: '10/04/2026',
						firstEntry: '08:00',
						lastExit: '16:00',
						totalHours: 'Fuera de oficina',
						workMinutes: 125,
					},
				],
			},
		]);
	});

	it('builds summary rows with numeric work minutes from the attendance aggregation', () => {
		const summaryRows = buildAttendanceEmployeePdfSummaryRows(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Ana',
					timestamp: '2026-04-10T14:00:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Ana',
					timestamp: '2026-04-10T22:00:00.000Z',
					type: 'CHECK_OUT',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-2',
					employeeName: 'Bruno',
					timestamp: '2026-04-10T06:00:00.000Z',
					type: 'WORK_OFFSITE',
					offsiteDateKey: '2026-04-10',
					offsiteDayKind: 'LABORABLE',
				}),
			],
			{ labels: TEST_LABELS, timeZone: TEST_TIME_ZONE },
		);

		expect(summaryRows).toEqual([
			{
				employeeName: 'Ana',
				employeeId: 'emp-1',
				date: '10/04/2026',
				firstEntry: '08:00',
				lastExit: '16:00',
				totalHours: '08:00',
				workMinutes: 480,
			},
			{
				employeeName: 'Bruno',
				employeeId: 'emp-2',
				date: '10/04/2026',
				firstEntry: 'Fuera de oficina',
				lastExit: 'Fuera de oficina',
				totalHours: '08:00',
				workMinutes: 480,
			},
		]);
	});

	it('groups daily summaries by employee and keeps row order', () => {
		const rows = buildAttendanceEmployeePdfSummaryRows(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Ana',
					timestamp: '2026-04-10T14:00:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Ana',
					timestamp: '2026-04-10T22:00:00.000Z',
					type: 'CHECK_OUT',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Ana',
					timestamp: '2026-04-11T14:00:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Ana',
					timestamp: '2026-04-11T22:30:00.000Z',
					type: 'CHECK_OUT',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-2',
					employeeName: 'Bruno',
					timestamp: '2026-04-10T15:00:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-2',
					employeeName: 'Bruno',
					timestamp: '2026-04-10T18:00:00.000Z',
					type: 'CHECK_OUT',
				}),
			],
			{ labels: TEST_LABELS, timeZone: TEST_TIME_ZONE },
		);

		const groups = buildAttendanceEmployeePdfGroups(rows);

		expect(groups).toHaveLength(2);
		expect(groups[0]).toEqual({
			employeeId: 'emp-1',
			employeeName: 'Ana',
			totalWorkedMinutes: 990,
			rows: [
				{
					day: '10/04/2026',
					firstEntry: '08:00',
					lastExit: '16:00',
					totalHours: '08:00',
					workMinutes: 480,
				},
				{
					day: '11/04/2026',
					firstEntry: '08:00',
					lastExit: '16:30',
					totalHours: '08:30',
					workMinutes: 510,
				},
			],
		});
		expect(groups[1]).toEqual({
			employeeId: 'emp-2',
			employeeName: 'Bruno',
			totalWorkedMinutes: 180,
			rows: [
				{
					day: '10/04/2026',
					firstEntry: '09:00',
					lastExit: '12:00',
					totalHours: '03:00',
					workMinutes: 180,
				},
			],
		});
	});

	it('keeps incomplete rows visible and counts offsite rows in totals', () => {
		const rows = buildAttendanceEmployeePdfSummaryRows(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Ana',
					timestamp: '2026-04-10T14:00:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-2',
					employeeName: 'Bruno',
					timestamp: '2026-04-10T06:00:00.000Z',
					type: 'WORK_OFFSITE',
					offsiteDateKey: '2026-04-10',
					offsiteDayKind: 'LABORABLE',
				}),
			],
			{
				dateRange: {
					startDateKey: '2026-04-10',
					endDateKey: '2026-04-10',
				},
				labels: TEST_LABELS,
				timeZone: TEST_TIME_ZONE,
			},
		);

		const groups = buildAttendanceEmployeePdfGroups(rows);

		expect(groups).toHaveLength(2);
		expect(groups[0]).toEqual({
			employeeId: 'emp-1',
			employeeName: 'Ana',
			totalWorkedMinutes: 0,
			rows: [
				{
					day: '10/04/2026',
					firstEntry: '08:00',
					lastExit: 'Sin salida',
					totalHours: 'Incompleto',
					workMinutes: null,
				},
			],
		});
		expect(groups[1]).toEqual({
			employeeId: 'emp-2',
			employeeName: 'Bruno',
			totalWorkedMinutes: 480,
			rows: [
				{
					day: '10/04/2026',
					firstEntry: 'Fuera de oficina',
					lastExit: 'Fuera de oficina',
					totalHours: '08:00',
					workMinutes: 480,
				},
			],
		});
	});

	it('counts WORK_OFFSITE rows as eight worked hours in employee PDF groups', () => {
		const rows = buildAttendanceEmployeePdfSummaryRows(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Ana',
					timestamp: '2026-04-10T06:00:00.000Z',
					type: 'WORK_OFFSITE',
					offsiteDateKey: '2026-04-10',
					offsiteDayKind: 'LABORABLE',
				}),
			],
			{
				dateRange: {
					startDateKey: '2026-04-10',
					endDateKey: '2026-04-10',
				},
				labels: TEST_LABELS,
				timeZone: TEST_TIME_ZONE,
			},
		);

		const groups = buildAttendanceEmployeePdfGroups(rows);

		expect(groups).toEqual([
			{
				employeeId: 'emp-1',
				employeeName: 'Ana',
				totalWorkedMinutes: 480,
				rows: [
					{
						day: '10/04/2026',
						firstEntry: 'Fuera de oficina',
						lastExit: 'Fuera de oficina',
						totalHours: '08:00',
						workMinutes: 480,
					},
				],
			},
		]);
	});

	it('excludes employees fully outside the filtered range', () => {
		const rows = buildAttendanceEmployeePdfSummaryRows(
			[
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Ana',
					timestamp: '2026-04-09T14:00:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-1',
					employeeName: 'Ana',
					timestamp: '2026-04-09T22:00:00.000Z',
					type: 'CHECK_OUT',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-2',
					employeeName: 'Bruno',
					timestamp: '2026-04-10T14:00:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-2',
					employeeName: 'Bruno',
					timestamp: '2026-04-10T22:00:00.000Z',
					type: 'CHECK_OUT',
				}),
			],
			{
				dateRange: {
					startDateKey: '2026-04-10',
					endDateKey: '2026-04-10',
				},
				labels: TEST_LABELS,
				timeZone: TEST_TIME_ZONE,
			},
		);

		const groups = buildAttendanceEmployeePdfGroups(rows);

		expect(groups).toHaveLength(1);
		expect(groups[0]).toEqual({
			employeeId: 'emp-2',
			employeeName: 'Bruno',
			totalWorkedMinutes: 480,
			rows: [
				{
					day: '10/04/2026',
					firstEntry: '08:00',
					lastExit: '16:00',
					totalHours: '08:00',
					workMinutes: 480,
				},
			],
		});
	});

	it('renders approved vacations as worked virtual days in attendance summaries', () => {
		const rows = buildAttendanceEmployeePdfSummaryRows([], {
			dateRange: {
				startDateKey: '2026-04-20',
				endDateKey: '2026-04-26',
			},
			labels: TEST_LABELS,
			timeZone: TEST_TIME_ZONE,
			virtualDays: [
				{
					employeeId: 'emp-vac',
					employeeName: 'María Vacaciones',
					dateKey: '2026-04-23',
					kind: 'VACATION',
					workMinutes: 480,
				},
			],
		});

		expect(rows).toEqual([
			{
				employeeName: 'María Vacaciones',
				employeeId: 'emp-vac',
				date: '23/04/2026',
				firstEntry: 'Vacaciones',
				lastExit: 'Vacaciones',
				totalHours: '08:00',
				workMinutes: 480,
			},
		]);
	});

	it('uses payroll cutoff virtual days to complete Friday and add Saturday attendance', () => {
		const rows = buildAttendanceEmployeePdfSummaryRows(
			[
				buildAttendanceRecord({
					employeeId: 'emp-cutoff',
					employeeName: 'Carlos Corte',
					timestamp: '2026-04-24T13:15:00.000Z',
					type: 'CHECK_IN',
				}),
			],
			{
				dateRange: {
					startDateKey: '2026-04-20',
					endDateKey: '2026-04-26',
				},
				labels: TEST_LABELS,
				timeZone: TEST_TIME_ZONE,
				virtualDays: [
					{
						employeeId: 'emp-cutoff',
						employeeName: 'Carlos Corte',
						dateKey: '2026-04-24',
						kind: 'PAYROLL_CUTOFF_ASSUMED',
						workMinutes: 480,
					},
					{
						employeeId: 'emp-cutoff',
						employeeName: 'Carlos Corte',
						dateKey: '2026-04-25',
						kind: 'PAYROLL_CUTOFF_ASSUMED',
						workMinutes: 480,
					},
				],
			},
		);

		expect(rows).toEqual([
			{
				employeeName: 'Carlos Corte',
				employeeId: 'emp-cutoff',
				date: '24/04/2026',
				firstEntry: '07:15',
				lastExit: 'Asistencia por nómina',
				totalHours: '08:00',
				workMinutes: 480,
			},
			{
				employeeName: 'Carlos Corte',
				employeeId: 'emp-cutoff',
				date: '25/04/2026',
				firstEntry: 'Asistencia por nómina',
				lastExit: 'Asistencia por nómina',
				totalHours: '08:00',
				workMinutes: 480,
			},
		]);
	});

	it('preserves complete real Friday attendance when payroll cutoff virtual attendance exists', () => {
		const rows = buildAttendanceEmployeePdfSummaryRows(
			[
				buildAttendanceRecord({
					employeeId: 'emp-cutoff',
					employeeName: 'Carlos Corte',
					timestamp: '2026-04-24T13:15:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-cutoff',
					employeeName: 'Carlos Corte',
					timestamp: '2026-04-24T21:15:00.000Z',
					type: 'CHECK_OUT',
				}),
			],
			{
				dateRange: {
					startDateKey: '2026-04-20',
					endDateKey: '2026-04-26',
				},
				labels: TEST_LABELS,
				timeZone: TEST_TIME_ZONE,
				virtualDays: [
					{
						employeeId: 'emp-cutoff',
						employeeName: 'Carlos Corte',
						dateKey: '2026-04-24',
						kind: 'PAYROLL_CUTOFF_ASSUMED',
						workMinutes: 480,
					},
				],
			},
		);

		expect(rows).toEqual([
			{
				employeeName: 'Carlos Corte',
				employeeId: 'emp-cutoff',
				date: '24/04/2026',
				firstEntry: '07:15',
				lastExit: '15:15',
				totalHours: '08:00',
				workMinutes: 480,
			},
		]);
	});

	it('preserves complete real attendance when a vacation virtual day exists', () => {
		const rows = buildAttendanceEmployeePdfSummaryRows(
			[
				buildAttendanceRecord({
					employeeId: 'emp-vacation-real',
					employeeName: 'Valeria Real',
					timestamp: '2026-04-24T13:00:00.000Z',
					type: 'CHECK_IN',
				}),
				buildAttendanceRecord({
					employeeId: 'emp-vacation-real',
					employeeName: 'Valeria Real',
					timestamp: '2026-04-24T21:30:00.000Z',
					type: 'CHECK_OUT',
				}),
			],
			{
				dateRange: {
					startDateKey: '2026-04-20',
					endDateKey: '2026-04-26',
				},
				labels: TEST_LABELS,
				timeZone: TEST_TIME_ZONE,
				virtualDays: [
					{
						employeeId: 'emp-vacation-real',
						employeeName: 'Valeria Real',
						dateKey: '2026-04-24',
						kind: 'VACATION',
						workMinutes: 480,
					},
				],
			},
		);

		expect(rows).toEqual([
			{
				employeeName: 'Valeria Real',
				employeeId: 'emp-vacation-real',
				date: '24/04/2026',
				firstEntry: '07:00',
				lastExit: '15:30',
				totalHours: '08:30',
				workMinutes: 510,
			},
		]);
	});

	it('preserves work offsite rows when payroll cutoff virtual attendance exists', () => {
		const rows = buildAttendanceEmployeePdfSummaryRows(
			[
				buildAttendanceRecord({
					employeeId: 'emp-offsite',
					employeeName: 'Olivia Oficina',
					timestamp: '2026-04-24T06:00:00.000Z',
					type: 'WORK_OFFSITE',
					offsiteDateKey: '2026-04-24',
					offsiteDayKind: 'LABORABLE',
				}),
			],
			{
				dateRange: {
					startDateKey: '2026-04-20',
					endDateKey: '2026-04-26',
				},
				labels: TEST_LABELS,
				timeZone: TEST_TIME_ZONE,
				virtualDays: [
					{
						employeeId: 'emp-offsite',
						employeeName: 'Olivia Oficina',
						dateKey: '2026-04-24',
						kind: 'PAYROLL_CUTOFF_ASSUMED',
						workMinutes: 480,
					},
				],
			},
		);

		expect(rows).toEqual([
			{
				employeeName: 'Olivia Oficina',
				employeeId: 'emp-offsite',
				date: '24/04/2026',
				firstEntry: 'Fuera de oficina',
				lastExit: 'Fuera de oficina',
				totalHours: '08:00',
				workMinutes: 480,
			},
		]);
	});
});
