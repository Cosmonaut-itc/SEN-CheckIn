import { addDaysToDateKey, parseDateKey, toDateKeyUtc } from '../utils/date-key.js';

export type StaffingCoverageAttendanceType =
	| 'CHECK_IN'
	| 'CHECK_OUT'
	| 'CHECK_OUT_AUTHORIZED'
	| 'WORK_OFFSITE';

export type StaffingCoverageEmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';

export type StaffingCoverageExceptionType = 'DAY_OFF' | 'MODIFIED' | 'EXTRA_DAY';

export type StaffingCoverageEmployeeCoverageStatus = 'ARRIVED' | 'MISSING';

export interface StaffingCoverageRequirementRow {
	id: string;
	organizationId: string;
	locationId: string;
	locationName: string | null;
	jobPositionId: string;
	jobPositionName: string | null;
	minimumRequired: number | null;
}

export interface StaffingCoverageEmployeeRow {
	id: string;
	organizationId: string | null;
	firstName: string;
	lastName: string;
	code: string;
	status: StaffingCoverageEmployeeStatus;
	locationId: string | null;
	jobPositionId: string | null;
	scheduleTemplateId?: string | null;
}

export interface StaffingCoverageScheduleRow {
	employeeId: string;
	dayOfWeek: number;
	isWorkingDay: boolean;
}

export interface StaffingCoverageTemplateDayRow {
	templateId: string;
	dayOfWeek: number;
	isWorkingDay: boolean;
}

export interface StaffingCoverageExceptionRow {
	employeeId: string;
	exceptionDateKey: string;
	exceptionType: StaffingCoverageExceptionType;
}

export interface StaffingCoverageAttendanceRow {
	id: string;
	employeeId: string;
	type: StaffingCoverageAttendanceType;
	timestamp: Date;
	offsiteDateKey: string | null;
	localDateKey?: string | null;
	locationId?: string | null;
}

export interface StaffingCoverageEmployeeResult {
	employeeId: string;
	employeeName: string;
	employeeCode: string;
	status: StaffingCoverageEmployeeCoverageStatus;
	checkedInAt: Date | null;
	attendanceType: 'CHECK_IN' | 'WORK_OFFSITE' | null;
}

export interface StaffingCoverageDailyItem {
	requirementId: string;
	locationId: string;
	locationName: string | null;
	jobPositionId: string;
	jobPositionName: string | null;
	minimumRequired: number;
	scheduledCount: number;
	arrivedCount: number;
	missingCount: number;
	coveragePercent: number;
	isComplete: boolean;
	employees: StaffingCoverageEmployeeResult[];
}

export interface StaffingCoverageDailyResult {
	dateKey: string;
	items: StaffingCoverageDailyItem[];
}

export interface StaffingCoverageStatsItem {
	requirementId: string;
	locationId: string;
	locationName: string | null;
	jobPositionId: string;
	jobPositionName: string | null;
	minimumRequired: number;
	daysEvaluated: number;
	completeDays: number;
	incompleteDays: number;
	averageCoveragePercent: number;
	worstCoveragePercent: number;
	currentStreakIncompleteDays: number;
	lastIncompleteDateKey: string | null;
}

export interface StaffingCoverageStatsResult {
	items: StaffingCoverageStatsItem[];
	summary: {
		requirementsEvaluated: number;
		completeToday: number;
		incompleteToday: number;
		averageCoveragePercent30d: number;
		days: number;
	};
}

export interface CalculateStaffingCoverageForDateInput {
	dateKey: string;
	organizationId: string;
	locationId?: string | null;
	requirements: StaffingCoverageRequirementRow[];
	employees: StaffingCoverageEmployeeRow[];
	schedules: StaffingCoverageScheduleRow[];
	templateDays?: StaffingCoverageTemplateDayRow[];
	exceptions: StaffingCoverageExceptionRow[];
	attendanceRecords: StaffingCoverageAttendanceRow[];
}

export interface CalculateStaffingCoverageStatsInput
	extends Omit<CalculateStaffingCoverageForDateInput, 'dateKey'> {
	todayDateKey: string;
	days: number;
}

type AttendanceArrival = {
	checkedInAt: Date;
	attendanceType: 'CHECK_IN' | 'WORK_OFFSITE';
	locationId: string | null;
};

/**
 * Formats a full employee name from first and last name parts.
 *
 * @param employee - Employee row
 * @returns Normalized display name
 */
function formatEmployeeName(employee: StaffingCoverageEmployeeRow): string {
	return `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim().replace(/\s+/g, ' ');
}

/**
 * Rounds a percentage to two decimal places for stable API responses.
 *
 * @param value - Raw percentage value
 * @returns Rounded percentage
 */
function roundPercent(value: number): number {
	return Math.round(value * 100) / 100;
}

/**
 * Calculates a capped coverage percentage.
 *
 * @param arrivedCount - Number of scheduled employees who arrived
 * @param minimumRequired - Minimum required staffing count
 * @returns Coverage percentage capped at 100
 */
function calculateCoveragePercent(arrivedCount: number, minimumRequired: number): number {
	if (minimumRequired === 0) {
		return 100;
	}
	return Math.min(100, roundPercent((arrivedCount / minimumRequired) * 100));
}

/**
 * Converts a date key into the JavaScript weekday index.
 *
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Weekday index where 0 is Sunday
 * @throws When the date key is invalid
 */
function getDayOfWeek(dateKey: string): number {
	parseDateKey(dateKey);
	return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

/**
 * Builds a lookup key for employee/date scoped exception rows.
 *
 * @param employeeId - Employee identifier
 * @param dateKey - Date key in YYYY-MM-DD format
 * @returns Stable lookup key
 */
function buildEmployeeDateKey(employeeId: string, dateKey: string): string {
	return `${employeeId}:${dateKey}`;
}

/**
 * Gets the business date key for an attendance row.
 *
 * @param record - Attendance row
 * @returns Attendance business date key
 */
function getAttendanceDateKey(record: StaffingCoverageAttendanceRow): string {
	if (record.type === 'WORK_OFFSITE' && record.offsiteDateKey) {
		return record.offsiteDateKey;
	}
	return record.localDateKey ?? toDateKeyUtc(record.timestamp);
}

/**
 * Determines whether an employee is scheduled on a date.
 *
 * @param args - Schedule lookup inputs
 * @returns True when the employee is scheduled to work
 */
function isEmployeeScheduled(args: {
	employeeId: string;
	scheduleTemplateId?: string | null;
	dateKey: string;
	dayOfWeek: number;
	scheduleByEmployeeDay: Map<string, StaffingCoverageScheduleRow>;
	templateDayByTemplateDay: Map<string, StaffingCoverageTemplateDayRow>;
	templateIdsWithRows: Set<string>;
	exceptionByEmployeeDate: Map<string, StaffingCoverageExceptionRow>;
}): boolean {
	const exception = args.exceptionByEmployeeDate.get(
		buildEmployeeDateKey(args.employeeId, args.dateKey),
	);
	if (exception?.exceptionType === 'DAY_OFF') {
		return false;
	}
	if (exception?.exceptionType === 'MODIFIED' || exception?.exceptionType === 'EXTRA_DAY') {
		return true;
	}

	if (args.scheduleTemplateId && args.templateIdsWithRows.has(args.scheduleTemplateId)) {
		const templateDay = args.templateDayByTemplateDay.get(
			`${args.scheduleTemplateId}:${args.dayOfWeek}`,
		);
		return templateDay?.isWorkingDay === true;
	}

	const schedule = args.scheduleByEmployeeDay.get(`${args.employeeId}:${args.dayOfWeek}`);
	return schedule?.isWorkingDay === true;
}

/**
 * Selects the first arrival record for each employee on the evaluated date.
 *
 * @param attendanceRecords - Attendance rows
 * @param dateKey - Evaluated date key
 * @returns Arrival lookup by employee
 */
function buildArrivalsByEmployee(
	attendanceRecords: StaffingCoverageAttendanceRow[],
	dateKey: string,
): Map<string, AttendanceArrival[]> {
	const arrivals = new Map<string, AttendanceArrival[]>();
	const relevantRecords = attendanceRecords
		.filter((record) => {
			if (record.type !== 'CHECK_IN' && record.type !== 'WORK_OFFSITE') {
				return false;
			}
			return getAttendanceDateKey(record) === dateKey;
		})
		.sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());

	for (const record of relevantRecords) {
		const attendanceType = record.type === 'CHECK_IN' ? 'CHECK_IN' : 'WORK_OFFSITE';
		const employeeArrivals = arrivals.get(record.employeeId) ?? [];
		employeeArrivals.push({
			checkedInAt: record.timestamp,
			attendanceType,
			locationId: record.locationId ?? null,
		});
		arrivals.set(record.employeeId, employeeArrivals);
	}

	return arrivals;
}

/**
 * Selects the first arrival that covers the evaluated requirement location.
 *
 * @param employee - Employee row
 * @param requirementLocationId - Staffing requirement location
 * @param arrivalsByEmployee - Arrival rows grouped by employee
 * @returns First matching arrival, if any
 */
function findArrivalForRequirement(args: {
	employee: StaffingCoverageEmployeeRow;
	requirementLocationId: string;
	arrivalsByEmployee: Map<string, AttendanceArrival[]>;
}): AttendanceArrival | null {
	const arrivals = args.arrivalsByEmployee.get(args.employee.id) ?? [];
	return (
		arrivals.find((arrival) => {
			const arrivalLocationId =
				arrival.attendanceType === 'WORK_OFFSITE'
					? (arrival.locationId ?? args.employee.locationId)
					: arrival.locationId;
			return arrivalLocationId === args.requirementLocationId;
		}) ?? null
	);
}

/**
 * Filters requirements to the evaluated organization/location and configured minimums.
 *
 * @param requirements - Requirement rows
 * @param organizationId - Organization identifier
 * @param locationId - Optional location filter
 * @returns Scoped requirements
 */
function scopeRequirements(
	requirements: StaffingCoverageRequirementRow[],
	organizationId: string,
	locationId?: string | null,
): StaffingCoverageRequirementRow[] {
	return requirements.filter((requirement) => {
		if (requirement.organizationId !== organizationId) {
			return false;
		}
		if (locationId && requirement.locationId !== locationId) {
			return false;
		}
		return requirement.minimumRequired !== null && requirement.minimumRequired !== undefined;
	});
}

/**
 * Calculates staffing coverage for one organization-local date.
 *
 * @param input - Coverage source rows and filters
 * @returns Daily staffing coverage payload
 * @throws When dateKey is invalid
 */
export function calculateStaffingCoverageForDate(
	input: CalculateStaffingCoverageForDateInput,
): StaffingCoverageDailyResult {
	const dayOfWeek = getDayOfWeek(input.dateKey);
	const scheduleByEmployeeDay = new Map<string, StaffingCoverageScheduleRow>();
	for (const schedule of input.schedules) {
		scheduleByEmployeeDay.set(`${schedule.employeeId}:${schedule.dayOfWeek}`, schedule);
	}
	const templateDayByTemplateDay = new Map<string, StaffingCoverageTemplateDayRow>();
	const templateIdsWithRows = new Set<string>();
	for (const templateDay of input.templateDays ?? []) {
		templateDayByTemplateDay.set(`${templateDay.templateId}:${templateDay.dayOfWeek}`, templateDay);
		templateIdsWithRows.add(templateDay.templateId);
	}

	const exceptionByEmployeeDate = new Map<string, StaffingCoverageExceptionRow>();
	for (const exception of input.exceptions) {
		exceptionByEmployeeDate.set(
			buildEmployeeDateKey(exception.employeeId, exception.exceptionDateKey),
			exception,
		);
	}

	const arrivalsByEmployee = buildArrivalsByEmployee(input.attendanceRecords, input.dateKey);
	const scopedRequirements = scopeRequirements(
		input.requirements,
		input.organizationId,
		input.locationId,
	);

	const items = scopedRequirements.map((requirement) => {
		const employeesForRequirement = input.employees.filter((employee) => {
			return (
				employee.organizationId === input.organizationId &&
				employee.status === 'ACTIVE' &&
				employee.jobPositionId === requirement.jobPositionId
			);
		});
		const scheduledEmployees = employeesForRequirement
			.filter((employee) => {
				if (employee.locationId !== requirement.locationId) {
					return false;
				}
				return isEmployeeScheduled({
					employeeId: employee.id,
					scheduleTemplateId: employee.scheduleTemplateId,
					dateKey: input.dateKey,
					dayOfWeek,
					scheduleByEmployeeDay,
					templateDayByTemplateDay,
					templateIdsWithRows,
					exceptionByEmployeeDate,
				});
			})
			.sort((left, right) => {
				const leftName = formatEmployeeName(left);
				const rightName = formatEmployeeName(right);
				return leftName.localeCompare(rightName, 'es-MX');
			});
		const scheduledEmployeeIds = new Set(scheduledEmployees.map((employee) => employee.id));
		const arrivedEmployees = employeesForRequirement.filter((employee) => {
			return Boolean(
				findArrivalForRequirement({
					employee,
					requirementLocationId: requirement.locationId,
					arrivalsByEmployee,
				}),
			);
		});
		const arrivedEmployeeIds = new Set(arrivedEmployees.map((employee) => employee.id));
		const displayEmployees = [
			...scheduledEmployees,
			...arrivedEmployees.filter((employee) => !scheduledEmployeeIds.has(employee.id)),
		].sort((left, right) => {
			const leftName = formatEmployeeName(left);
			const rightName = formatEmployeeName(right);
			return leftName.localeCompare(rightName, 'es-MX');
		});

		const employees = displayEmployees.map((employee) => {
			const arrival = findArrivalForRequirement({
				employee,
				requirementLocationId: requirement.locationId,
				arrivalsByEmployee,
			});
			const arrivedForRequirement = arrivedEmployeeIds.has(employee.id);
			return {
				employeeId: employee.id,
				employeeName: formatEmployeeName(employee),
				employeeCode: employee.code,
				status: arrivedForRequirement ? 'ARRIVED' : 'MISSING',
				checkedInAt: arrivedForRequirement ? (arrival?.checkedInAt ?? null) : null,
				attendanceType: arrivedForRequirement ? (arrival?.attendanceType ?? null) : null,
			} satisfies StaffingCoverageEmployeeResult;
		});

		const arrivedCount = arrivedEmployees.length;
		const minimumRequired = requirement.minimumRequired ?? 0;
		const coveragePercent = calculateCoveragePercent(arrivedCount, minimumRequired);

		return {
			requirementId: requirement.id,
			locationId: requirement.locationId,
			locationName: requirement.locationName,
			jobPositionId: requirement.jobPositionId,
			jobPositionName: requirement.jobPositionName,
			minimumRequired,
			scheduledCount: scheduledEmployees.length,
			arrivedCount,
			missingCount: Math.max(minimumRequired - arrivedCount, 0),
			coveragePercent,
			isComplete: arrivedCount >= minimumRequired,
			employees,
		} satisfies StaffingCoverageDailyItem;
	});

	return {
		dateKey: input.dateKey,
		items,
	};
}

/**
 * Builds the inclusive date window ending on today.
 *
 * @param todayDateKey - Last date in the window
 * @param days - Number of days to include
 * @returns Date keys from oldest to newest
 * @throws When todayDateKey is invalid
 */
function buildDateWindow(todayDateKey: string, days: number): string[] {
	parseDateKey(todayDateKey);
	return Array.from({ length: days }, (_, index) =>
		addDaysToDateKey(todayDateKey, index - days + 1),
	);
}

/**
 * Calculates the arithmetic average of a numeric array.
 *
 * @param values - Numeric values
 * @returns Average value or zero for an empty array
 */
function average(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	return roundPercent(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * Calculates staffing coverage statistics for an inclusive date window.
 *
 * @param input - Coverage source rows, filters, and date-window options
 * @returns Aggregated coverage statistics
 * @throws When the date key is invalid
 */
export function calculateStaffingCoverageStats(
	input: CalculateStaffingCoverageStatsInput,
): StaffingCoverageStatsResult {
	const dateWindow = buildDateWindow(input.todayDateKey, input.days);
	const scopedRequirements = scopeRequirements(
		input.requirements,
		input.organizationId,
		input.locationId,
	);
	const dailyResults = dateWindow.map((dateKey) =>
		calculateStaffingCoverageForDate({
			...input,
			dateKey,
		}),
	);

	const items = scopedRequirements.map((requirement) => {
		const dailyItems = dailyResults.map((dailyResult) => {
			const item = dailyResult.items.find((candidate) => candidate.requirementId === requirement.id);
			if (!item) {
				throw new Error(`Missing daily coverage item for requirement ${requirement.id}.`);
			}
			return {
				dateKey: dailyResult.dateKey,
				item,
			};
		});
		const coverageValues = dailyItems.map(({ item }) => item.coveragePercent);
		const incompleteItems = dailyItems.filter(({ item }) => !item.isComplete);
		let currentStreakIncompleteDays = 0;

		for (let index = dailyItems.length - 1; index >= 0; index -= 1) {
			if (dailyItems[index]?.item.isComplete) {
				break;
			}
			currentStreakIncompleteDays += 1;
		}

		return {
			requirementId: requirement.id,
			locationId: requirement.locationId,
			locationName: requirement.locationName,
			jobPositionId: requirement.jobPositionId,
			jobPositionName: requirement.jobPositionName,
			minimumRequired: requirement.minimumRequired ?? 0,
			daysEvaluated: dailyItems.length,
			completeDays: dailyItems.length - incompleteItems.length,
			incompleteDays: incompleteItems.length,
			averageCoveragePercent: average(coverageValues),
			worstCoveragePercent: coverageValues.length > 0 ? Math.min(...coverageValues) : 0,
			currentStreakIncompleteDays,
			lastIncompleteDateKey: incompleteItems.at(-1)?.dateKey ?? null,
		} satisfies StaffingCoverageStatsItem;
	});

	const todayItems = dailyResults.at(-1)?.items ?? [];
	const allCoverageValues = dailyResults.flatMap((dailyResult) =>
		dailyResult.items.map((item) => item.coveragePercent),
	);

	return {
		items,
		summary: {
			requirementsEvaluated: scopedRequirements.length,
			completeToday: todayItems.filter((item) => item.isComplete).length,
			incompleteToday: todayItems.filter((item) => !item.isComplete).length,
			averageCoveragePercent30d: average(allCoverageValues),
			days: input.days,
		},
	};
}
