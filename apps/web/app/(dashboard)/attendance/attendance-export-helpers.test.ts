import { describe, expect, it } from 'vitest';

import type { AttendanceRecord } from '@/lib/client-functions';

import {
	aggregateAttendanceByPersonDay,
	buildAttendanceEmployeePdfGroups,
	type AttendanceSummaryLabels,
} from './attendance-export-helpers';

const TEST_TIME_ZONE = 'America/Mexico_City';

const TEST_LABELS: AttendanceSummaryLabels = {
	incomplete: 'Incompleto',
	noEntry: 'Sin entrada',
	noExit: 'Sin salida',
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

	it('treats CHECK_OUT_AUTHORIZED as a valid exit', () => {
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
		expect(rows[0]?.totalHours).toBe('05:30');
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
			totalHours: 'Fuera de oficina',
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
			totalHours: 'Fuera de oficina',
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
});

describe('buildAttendanceEmployeePdfGroups', () => {
	it('groups daily summaries by employee and keeps row order', () => {
		const rows = aggregateAttendanceByPersonDay(
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

	it('keeps incomplete and offsite rows visible without adding them to totals', () => {
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
			totalWorkedMinutes: 0,
			rows: [
				{
					day: '10/04/2026',
					firstEntry: 'Fuera de oficina',
					lastExit: 'Fuera de oficina',
					totalHours: 'Fuera de oficina',
					workMinutes: null,
				},
			],
		});
	});

	it('excludes employees fully outside the filtered range', () => {
		const rows = aggregateAttendanceByPersonDay(
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
});
