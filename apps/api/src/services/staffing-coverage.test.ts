import { describe, expect, it } from 'bun:test';

import {
	calculateStaffingCoverageForDate,
	calculateStaffingCoverageStats,
	type StaffingCoverageAttendanceRow,
	type StaffingCoverageEmployeeRow,
	type StaffingCoverageRequirementRow,
	type StaffingCoverageScheduleRow,
	type StaffingCoverageTemplateDayRow,
} from './staffing-coverage.js';

const mondayDateKey = '2026-04-20';
const tuesdayDateKey = '2026-04-21';

const baseRequirement: StaffingCoverageRequirementRow = {
	id: 'requirement-guards',
	organizationId: 'org-1',
	locationId: 'location-1',
	locationName: 'Planta Norte',
	jobPositionId: 'position-guard',
	jobPositionName: 'Guardia',
	minimumRequired: 2,
};

const baseEmployees: StaffingCoverageEmployeeRow[] = [
	{
		id: 'employee-arrived',
		organizationId: 'org-1',
		firstName: 'Ana',
		lastName: 'Lara',
		code: 'A001',
		status: 'ACTIVE',
		locationId: 'location-1',
		jobPositionId: 'position-guard',
	},
	{
		id: 'employee-missing',
		organizationId: 'org-1',
		firstName: 'Luis',
		lastName: 'Mora',
		code: 'A002',
		status: 'ACTIVE',
		locationId: 'location-1',
		jobPositionId: 'position-guard',
	},
];

const mondaySchedules: StaffingCoverageScheduleRow[] = baseEmployees.map((employee) => ({
	employeeId: employee.id,
	dayOfWeek: 1,
	isWorkingDay: true,
}));

/**
 * Builds a CHECK_IN attendance row for coverage tests.
 *
 * @param employeeId - Employee identifier
 * @param timestamp - Attendance timestamp
 * @returns Attendance row
 */
function checkIn(
	employeeId: string,
	timestamp: Date = new Date('2026-04-20T15:00:00.000Z'),
): StaffingCoverageAttendanceRow {
	return {
		id: `check-in-${employeeId}`,
		employeeId,
		type: 'CHECK_IN',
		timestamp,
		locationId: 'location-1',
		offsiteDateKey: null,
	};
}

describe('staffing coverage calculations', () => {
	it('uses assigned schedule template days to decide whether employees are scheduled', () => {
		const employees: StaffingCoverageEmployeeRow[] = [
			{
				...baseEmployees[0]!,
				scheduleTemplateId: 'template-guards',
			},
		];
		const templateDays: StaffingCoverageTemplateDayRow[] = [
			{
				templateId: 'template-guards',
				dayOfWeek: 1,
				isWorkingDay: true,
			},
		];

		const result = calculateStaffingCoverageForDate({
			dateKey: mondayDateKey,
			organizationId: 'org-1',
			requirements: [{ ...baseRequirement, minimumRequired: 1 }],
			employees,
			schedules: [],
			templateDays,
			exceptions: [],
			attendanceRecords: [checkIn('employee-arrived')],
		});

		expect(result.items[0]).toMatchObject({
			scheduledCount: 1,
			arrivedCount: 1,
			isComplete: true,
		});
	});

	it('marks a requirement incomplete when one scheduled employee has not arrived', () => {
		const result = calculateStaffingCoverageForDate({
			dateKey: mondayDateKey,
			organizationId: 'org-1',
			requirements: [baseRequirement],
			employees: baseEmployees,
			schedules: mondaySchedules,
			exceptions: [],
			attendanceRecords: [checkIn('employee-arrived')],
		});

		expect(result.items).toHaveLength(1);
		expect(result.items[0]).toMatchObject({
			requirementId: 'requirement-guards',
			locationId: 'location-1',
			locationName: 'Planta Norte',
			jobPositionId: 'position-guard',
			jobPositionName: 'Guardia',
			minimumRequired: 2,
			scheduledCount: 2,
			arrivedCount: 1,
			missingCount: 1,
			coveragePercent: 50,
			isComplete: false,
		});
		expect(result.items[0]?.employees).toEqual([
			{
				employeeId: 'employee-arrived',
				employeeName: 'Ana Lara',
				employeeCode: 'A001',
				status: 'ARRIVED',
				checkedInAt: new Date('2026-04-20T15:00:00.000Z'),
				attendanceType: 'CHECK_IN',
			},
			{
				employeeId: 'employee-missing',
				employeeName: 'Luis Mora',
				employeeCode: 'A002',
				status: 'MISSING',
				checkedInAt: null,
				attendanceType: null,
			},
		]);
	});

	it('counts WORK_OFFSITE as arrived and excludes DAY_OFF exceptions from scheduled employees', () => {
		const result = calculateStaffingCoverageForDate({
			dateKey: mondayDateKey,
			organizationId: 'org-1',
			requirements: [baseRequirement],
			employees: baseEmployees,
			schedules: mondaySchedules,
			exceptions: [
				{
					employeeId: 'employee-missing',
					exceptionDateKey: mondayDateKey,
					exceptionType: 'DAY_OFF',
				},
			],
			attendanceRecords: [
				{
					id: 'offsite-employee-arrived',
					employeeId: 'employee-arrived',
					type: 'WORK_OFFSITE',
					timestamp: new Date('2026-04-20T06:00:00.000Z'),
					offsiteDateKey: mondayDateKey,
				},
			],
		});

		expect(result.items[0]).toMatchObject({
			scheduledCount: 1,
			arrivedCount: 1,
			missingCount: 1,
			coveragePercent: 50,
			isComplete: false,
		});
		expect(result.items[0]?.employees).toEqual([
			{
				employeeId: 'employee-arrived',
				employeeName: 'Ana Lara',
				employeeCode: 'A001',
				status: 'ARRIVED',
				checkedInAt: new Date('2026-04-20T06:00:00.000Z'),
				attendanceType: 'WORK_OFFSITE',
			},
		]);
	});

	it('counts active arrivals at the requirement location even when the employee was not scheduled', () => {
		const unscheduledArrival: StaffingCoverageEmployeeRow = {
			id: 'employee-unscheduled-arrival',
			organizationId: 'org-1',
			firstName: 'Marta',
			lastName: 'Cano',
			code: 'A003',
			status: 'ACTIVE',
			locationId: 'location-1',
			jobPositionId: 'position-guard',
		};

		const result = calculateStaffingCoverageForDate({
			dateKey: mondayDateKey,
			organizationId: 'org-1',
			requirements: [baseRequirement],
			employees: [...baseEmployees, unscheduledArrival],
			schedules: mondaySchedules,
			exceptions: [],
			attendanceRecords: [
				checkIn('employee-arrived'),
				checkIn('employee-unscheduled-arrival', new Date('2026-04-20T15:10:00.000Z')),
			],
		});

		expect(result.items[0]).toMatchObject({
			scheduledCount: 2,
			arrivedCount: 2,
			missingCount: 0,
			coveragePercent: 100,
			isComplete: true,
		});
		expect(result.items[0]?.employees).toContainEqual({
			employeeId: 'employee-unscheduled-arrival',
			employeeName: 'Marta Cano',
			employeeCode: 'A003',
			status: 'ARRIVED',
			checkedInAt: new Date('2026-04-20T15:10:00.000Z'),
			attendanceType: 'CHECK_IN',
		});
	});

	it('uses the attendance location instead of assigned location for CHECK_IN coverage', () => {
		const floatingEmployee: StaffingCoverageEmployeeRow = {
			id: 'employee-floating',
			organizationId: 'org-1',
			firstName: 'Rene',
			lastName: 'Diaz',
			code: 'A004',
			status: 'ACTIVE',
			locationId: 'location-2',
			jobPositionId: 'position-guard',
		};

		const result = calculateStaffingCoverageForDate({
			dateKey: mondayDateKey,
			organizationId: 'org-1',
			requirements: [baseRequirement],
			employees: [...baseEmployees, floatingEmployee],
			schedules: mondaySchedules,
			exceptions: [],
			attendanceRecords: [
				checkIn('employee-arrived'),
				{
					...checkIn('employee-floating', new Date('2026-04-20T15:15:00.000Z')),
					locationId: 'location-1',
				},
			],
		});

		expect(result.items[0]).toMatchObject({
			arrivedCount: 2,
			missingCount: 0,
			isComplete: true,
		});
		expect(result.items[0]?.employees).toContainEqual({
			employeeId: 'employee-floating',
			employeeName: 'Rene Diaz',
			employeeCode: 'A004',
			status: 'ARRIVED',
			checkedInAt: new Date('2026-04-20T15:15:00.000Z'),
			attendanceType: 'CHECK_IN',
		});
	});

	it('uses the first arrival at the requirement location when an employee checks in elsewhere first', () => {
		const result = calculateStaffingCoverageForDate({
			dateKey: mondayDateKey,
			organizationId: 'org-1',
			requirements: [{ ...baseRequirement, minimumRequired: 1 }],
			employees: [baseEmployees[0]!],
			schedules: mondaySchedules,
			exceptions: [],
			attendanceRecords: [
				{
					...checkIn('employee-arrived', new Date('2026-04-20T13:00:00.000Z')),
					locationId: 'location-2',
				},
				{
					...checkIn('employee-arrived', new Date('2026-04-20T14:00:00.000Z')),
					locationId: 'location-1',
				},
			],
		});

		expect(result.items[0]).toMatchObject({
			arrivedCount: 1,
			isComplete: true,
		});
		expect(result.items[0]?.employees[0]).toMatchObject({
			status: 'ARRIVED',
			checkedInAt: new Date('2026-04-20T14:00:00.000Z'),
		});
	});

	it('does not use the assigned location as a fallback for CHECK_IN arrivals without a device location', () => {
		const result = calculateStaffingCoverageForDate({
			dateKey: mondayDateKey,
			organizationId: 'org-1',
			requirements: [{ ...baseRequirement, minimumRequired: 1 }],
			employees: [baseEmployees[0]!],
			schedules: [{ employeeId: 'employee-arrived', dayOfWeek: 1, isWorkingDay: true }],
			exceptions: [],
			attendanceRecords: [
				{
					...checkIn('employee-arrived'),
					locationId: null,
				},
			],
		});

		expect(result.items[0]).toMatchObject({
			arrivedCount: 0,
			missingCount: 1,
			isComplete: false,
		});
		expect(result.items[0]?.employees[0]).toMatchObject({
			status: 'MISSING',
			checkedInAt: null,
			attendanceType: null,
		});
	});

	it('aggregates stats with current incomplete streak and scoped requirements', () => {
		const secondRequirement: StaffingCoverageRequirementRow = {
			...baseRequirement,
			id: 'requirement-cashiers',
			locationId: 'location-2',
			locationName: 'Planta Sur',
			jobPositionId: 'position-cashier',
			jobPositionName: 'Cajero',
			minimumRequired: 1,
		};
		const scopedEmployees: StaffingCoverageEmployeeRow[] = [
			...baseEmployees,
			{
				id: 'employee-other-location',
				organizationId: 'org-1',
				firstName: 'Sofia',
				lastName: 'Rios',
				code: 'B001',
				status: 'ACTIVE',
				locationId: 'location-2',
				jobPositionId: 'position-cashier',
			},
		];

		const result = calculateStaffingCoverageStats({
			todayDateKey: tuesdayDateKey,
			days: 2,
			organizationId: 'org-1',
			locationId: 'location-1',
			requirements: [baseRequirement, secondRequirement],
			employees: scopedEmployees,
			schedules: [
				...mondaySchedules,
				{ employeeId: 'employee-arrived', dayOfWeek: 2, isWorkingDay: true },
				{ employeeId: 'employee-missing', dayOfWeek: 2, isWorkingDay: true },
				{ employeeId: 'employee-other-location', dayOfWeek: 1, isWorkingDay: true },
				{ employeeId: 'employee-other-location', dayOfWeek: 2, isWorkingDay: true },
			],
			exceptions: [],
			attendanceRecords: [
				checkIn('employee-arrived', new Date('2026-04-20T15:00:00.000Z')),
				checkIn('employee-missing', new Date('2026-04-20T15:05:00.000Z')),
				checkIn('employee-arrived', new Date('2026-04-21T15:00:00.000Z')),
			],
		});

		expect(result.items).toEqual([
			{
				requirementId: 'requirement-guards',
				locationId: 'location-1',
				locationName: 'Planta Norte',
				jobPositionId: 'position-guard',
				jobPositionName: 'Guardia',
				minimumRequired: 2,
				daysEvaluated: 2,
				completeDays: 1,
				incompleteDays: 1,
				averageCoveragePercent: 75,
				worstCoveragePercent: 50,
				currentStreakIncompleteDays: 1,
				lastIncompleteDateKey: tuesdayDateKey,
			},
		]);
		expect(result.summary).toEqual({
			requirementsEvaluated: 1,
			completeToday: 0,
			incompleteToday: 1,
			averageCoveragePercent30d: 75,
			days: 2,
		});
	});
});
