import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	setSystemTime,
} from 'bun:test';
import { Elysia } from 'elysia';

import {
	getPayrollPeriodBounds,
	type AttendanceRow,
	type PayrollEmployeeRow,
} from '../services/payroll-calculation.js';
import {
	AET_P10_2026_PAYROLL_SETTINGS,
	AET_P10_2026_PERIOD,
	AET_P10_TDD_LISTA_RAYA_EXPECTED,
	buildAetP10PayrollArgs,
} from '../services/payroll-real-fixtures.test-data.js';
import {
	calculateFiscalVoucherDeductions,
	expectCurrencyClose,
	sumCurrency,
} from '../test-utils/payroll-currency-helpers.js';
import { roundCurrency } from '../utils/money.js';
import { getUtcDateForZonedMidnight } from '../utils/time-zone.js';

mock.restore();

const actualDrizzleOrmModule = await import('drizzle-orm');
const actualDrizzleSqlModule = await import('drizzle-orm/sql');

type DrizzleCondition =
	| {
			kind: 'and';
			conditions: DrizzleCondition[];
	  }
	| {
			kind: 'eq';
			column: unknown;
			value: unknown;
	  }
	| {
			kind: 'gte' | 'lte';
			column: unknown;
			value: Date | string;
	  }
	| {
			kind: 'isNull';
			column: unknown;
	  }
	| {
			kind: 'inArray';
			column: unknown;
			values: unknown[];
	  };

interface FakePayrollSettingRow {
	organizationId: string;
	overtimeEnforcement: 'WARN' | 'BLOCK';
	weekStartDay: number;
	additionalMandatoryRestDays: string[];
	timeZone: string;
	riskWorkRate?: number;
	statePayrollTaxRate?: number;
	absorbImssEmployeeShare?: boolean;
	absorbIsr?: boolean;
	aguinaldoDays?: number;
	vacationPremiumRate?: number;
	realVacationPremiumRate?: number;
	enableSeventhDayPay?: boolean;
	enableDualPayroll?: boolean;
	autoDeductLunchBreak?: boolean;
	lunchBreakMinutes?: number;
	lunchBreakThresholdHours?: number;
	countSaturdayAsWorkedForSeventhDay?: boolean;
}

type FakeEmployeeRow = PayrollEmployeeRow & {
	organizationId: string;
	lastPayrollDate: Date | null;
	status?: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
};

interface FakeEmployeeScheduleRow {
	employeeId: string;
	dayOfWeek: number;
	startTime: string;
	endTime: string;
	isWorkingDay: boolean;
}

interface FakeVacationRequestRow {
	id: string;
	organizationId: string;
	employeeId: string;
	status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
	startDateKey: string;
	endDateKey: string;
}

interface FakeVacationRequestDayRow {
	requestId: string;
	employeeId: string;
	dateKey: string;
	countsAsVacationDay: boolean;
}

interface FakeEmployeeDeductionRow {
	id: string;
	organizationId: string;
	employeeId: string;
	type: 'INFONAVIT' | 'ALIMONY' | 'FONACOT' | 'LOAN' | 'UNION_FEE' | 'ADVANCE' | 'OTHER';
	label: string;
	calculationMethod:
		| 'PERCENTAGE_SBC'
		| 'PERCENTAGE_NET'
		| 'PERCENTAGE_GROSS'
		| 'FIXED_AMOUNT'
		| 'VSM_FACTOR';
	value: string;
	frequency: 'RECURRING' | 'ONE_TIME' | 'INSTALLMENTS';
	totalInstallments: number | null;
	completedInstallments: number;
	totalAmount: string | null;
	remainingAmount: string | null;
	status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
	startDateKey: string;
	endDateKey: string | null;
	referenceNumber: string | null;
	satDeductionCode: string | null;
	notes: string | null;
	createdAt: Date;
}

interface FakePendingDeductionMutation {
	id: string;
	status?: FakeEmployeeDeductionRow['status'];
	completedInstallments?: number;
	remainingAmount?: string | null;
	value?: string;
	calculationMethod?: FakeEmployeeDeductionRow['calculationMethod'];
	frequency?: FakeEmployeeDeductionRow['frequency'];
	totalInstallments?: number | null;
	totalAmount?: string | null;
	startDateKey?: string;
	endDateKey?: string | null;
}

interface FakeDbState {
	organizationId: string;
	sessionRole: 'owner' | 'admin' | 'member' | null;
	payrollSettings: FakePayrollSettingRow[];
	employees: FakeEmployeeRow[];
	schedules: FakeEmployeeScheduleRow[];
	attendanceRecords: AttendanceRow[];
	vacationRequests: FakeVacationRequestRow[];
	vacationRequestDays: FakeVacationRequestDayRow[];
	employeeDeductions: FakeEmployeeDeductionRow[];
	payrollRuns: Record<string, unknown>[];
	payrollRunEmployees: Record<string, unknown>[];
	payrollFiscalVouchers: Record<string, unknown>[];
	payrollCfdiXmlArtifacts: Record<string, unknown>[];
	payrollFiscalVoucherUpdateCount: number;
	transactionCalled: boolean;
	deductionUpdateConditions: DrizzleCondition[];
	pendingDeductionMutationBeforeTransaction: FakePendingDeductionMutation | null;
	pendingDeductionMutationBeforeUpdate: FakePendingDeductionMutation | null;
	pendingBodylessFiscalVoucherConflictOnNextInsert: boolean;
	pendingFiscalVoucherStampBeforeUpdate: boolean;
}

/**
 * Builds a UTC Date for a local wall-clock time in the given timezone.
 *
 * @param dateKey - Local date key (YYYY-MM-DD)
 * @param hour - Local hour (0..23)
 * @param minute - Local minute (0..59)
 * @param timeZone - IANA timezone identifier
 * @returns UTC Date representing that local instant
 */
function getUtcDateForZonedTime(
	dateKey: string,
	hour: number,
	minute: number,
	timeZone: string,
): Date {
	const midnightUtc = getUtcDateForZonedMidnight(dateKey, timeZone);
	return new Date(midnightUtc.getTime() + hour * 60 * 60 * 1000 + minute * 60 * 1000);
}

/**
 * Creates a check-in/check-out pair for a single employee.
 *
 * @param employeeId - Employee identifier
 * @param checkIn - Check-in instant
 * @param checkOut - Check-out instant
 * @returns Attendance rows in chronological order
 */
function createAttendancePair(employeeId: string, checkIn: Date, checkOut: Date): AttendanceRow[] {
	return [
		{ employeeId, timestamp: checkIn, type: 'CHECK_IN' },
		{ employeeId, timestamp: checkOut, type: 'CHECK_OUT' },
	];
}

/**
 * Creates standard 09:00-17:00 attendance pairs for local date keys.
 *
 * @param employeeId - Employee identifier
 * @param dateKeys - Local date keys to mark as worked
 * @param timeZone - IANA timezone identifier
 * @returns Attendance rows for all requested dates
 */
function buildAttendanceRowsForDateKeys(
	employeeId: string,
	dateKeys: string[],
	timeZone: string,
): AttendanceRow[] {
	return dateKeys.flatMap((dateKey) =>
		createAttendancePair(
			employeeId,
			getUtcDateForZonedTime(dateKey, 9, 0, timeZone),
			getUtcDateForZonedTime(dateKey, 17, 0, timeZone),
		),
	);
}

/**
 * Creates a JSON POST request.
 *
 * @param path - Request path
 * @param body - JSON body
 * @returns Request instance
 */
function createJsonPostRequest(path: string, body: unknown): Request {
	return new Request(`http://localhost${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

/**
 * Creates an API-key flavored JSON POST request for auth-sensitive unit tests.
 *
 * @param path - Request path
 * @param body - JSON body
 * @returns Request instance
 */
function createApiKeyJsonPostRequest(path: string, body: unknown): Request {
	return new Request(`http://localhost${path}`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-test-auth-type': 'apiKey',
		},
		body: JSON.stringify(body),
	});
}

/**
 * Creates an API-key POST request without a request body.
 *
 * @param path - Request path
 * @returns Request instance
 */
function createApiKeyEmptyPostRequest(path: string): Request {
	return new Request(`http://localhost${path}`, {
		method: 'POST',
		headers: {
			'x-test-auth-type': 'apiKey',
		},
	});
}

/**
 * Creates an API-key flavored GET request for auth-sensitive unit tests.
 *
 * @param path - Request path
 * @returns Request instance
 */
function createApiKeyJsonGetRequest(path: string): Request {
	return new Request(`http://localhost${path}`, {
		method: 'GET',
		headers: {
			accept: 'application/json',
			'x-test-auth-type': 'apiKey',
		},
	});
}

/**
 * Creates a JSON GET request.
 *
 * @param path - Request path
 * @returns Request instance
 */
function createJsonGetRequest(path: string): Request {
	return new Request(`http://localhost${path}`, {
		method: 'GET',
		headers: { accept: 'application/json' },
	});
}

/**
 * Asserts that exactly one persisted payroll-run employee row exists.
 *
 * @template TRow - Expected row shape
 * @param rows - Persisted payroll-run employee rows
 * @returns The single persisted row cast to the requested shape
 * @throws {Error} Propagates Bun assertion failures when row count differs
 */
function expectSinglePayrollRunEmployee<TRow extends Record<string, unknown>>(
	rows: Record<string, unknown>[],
): TRow {
	expect(rows).toHaveLength(1);
	return rows[0] as TRow;
}

/**
 * Seeds a standard weekly payroll scenario for process-route tests.
 *
 * @param args - Organization/employee identity values
 * @returns Nothing
 */
function seedWeeklyProcessScenario(args: {
	organizationId: string;
	employeeId: string;
	firstName: string;
	lastName: string;
	timeZone: string;
}): void {
	dbState.organizationId = args.organizationId;
	dbState.payrollSettings = [
		{
			organizationId: args.organizationId,
			overtimeEnforcement: 'WARN',
			weekStartDay: 1,
			additionalMandatoryRestDays: [],
			timeZone: args.timeZone,
		},
	];
	dbState.employees = [
		{
			id: args.employeeId,
			organizationId: args.organizationId,
			firstName: args.firstName,
			lastName: args.lastName,
			dailyPay: 800,
			paymentFrequency: 'WEEKLY',
			shiftType: 'DIURNA',
			locationGeographicZone: 'GENERAL',
			locationTimeZone: args.timeZone,
			lastPayrollDate: null,
		},
	];
	dbState.schedules = Array.from({ length: 7 }, (_, dayOfWeek) => ({
		employeeId: args.employeeId,
		dayOfWeek,
		startTime: '09:00',
		endTime: '17:00',
		isWorkingDay: dayOfWeek !== 0,
	}));
	dbState.attendanceRecords = [
		...createAttendancePair(
			args.employeeId,
			getUtcDateForZonedTime('2025-03-03', 9, 0, args.timeZone),
			getUtcDateForZonedTime('2025-03-03', 17, 0, args.timeZone),
		),
		...createAttendancePair(
			args.employeeId,
			getUtcDateForZonedTime('2025-03-04', 9, 0, args.timeZone),
			getUtcDateForZonedTime('2025-03-04', 17, 0, args.timeZone),
		),
		...createAttendancePair(
			args.employeeId,
			getUtcDateForZonedTime('2025-03-05', 9, 0, args.timeZone),
			getUtcDateForZonedTime('2025-03-05', 17, 0, args.timeZone),
		),
		...createAttendancePair(
			args.employeeId,
			getUtcDateForZonedTime('2025-03-06', 9, 0, args.timeZone),
			getUtcDateForZonedTime('2025-03-06', 17, 0, args.timeZone),
		),
		...createAttendancePair(
			args.employeeId,
			getUtcDateForZonedTime('2025-03-07', 9, 0, args.timeZone),
			getUtcDateForZonedTime('2025-03-07', 17, 0, args.timeZone),
		),
		...createAttendancePair(
			args.employeeId,
			getUtcDateForZonedTime('2025-03-08', 9, 0, args.timeZone),
			getUtcDateForZonedTime('2025-03-08', 17, 0, args.timeZone),
		),
	];
}

/**
 * Converts a fixture deduction row into the route fake-DB row shape.
 *
 * @param deduction - Payroll calculation deduction row
 * @param organizationId - Organization identifier
 * @returns Fake database deduction row
 */
function buildFakeDeductionFromFixture(
	deduction: NonNullable<ReturnType<typeof buildAetP10PayrollArgs>['employeeDeductions']>[number],
	organizationId: string,
): FakeEmployeeDeductionRow {
	const totalAmount =
		deduction.totalAmount === null || deduction.totalAmount === undefined
			? null
			: Number(deduction.totalAmount).toFixed(2);
	const remainingAmount =
		deduction.remainingAmount === null || deduction.remainingAmount === undefined
			? null
			: Number(deduction.remainingAmount).toFixed(2);

	return {
		id: deduction.id,
		organizationId,
		employeeId: deduction.employeeId,
		type: deduction.type,
		label: deduction.label,
		calculationMethod: deduction.calculationMethod,
		value: Number(deduction.value).toFixed(2),
		frequency: deduction.frequency,
		totalInstallments: deduction.totalInstallments,
		completedInstallments: deduction.completedInstallments,
		totalAmount,
		remainingAmount,
		status: deduction.status,
		startDateKey: deduction.startDateKey,
		endDateKey: deduction.endDateKey,
		referenceNumber: deduction.referenceNumber ?? null,
		satDeductionCode: deduction.satDeductionCode ?? null,
		notes: deduction.notes ?? null,
		createdAt: deduction.createdAt ?? new Date('2026-02-27T00:00:00.000Z'),
	};
}

/**
 * Seeds the AET period-10 route fixture from derived CONTPAQi/workbook data.
 *
 * @returns Nothing
 */
function seedAetP10ProcessScenario(): void {
	const organizationId = 'org-aet-p10-2026';
	const args = buildAetP10PayrollArgs({ scope: 'TDD' });

	dbState.organizationId = organizationId;
	dbState.payrollSettings = [
		{
			organizationId,
			overtimeEnforcement: 'WARN',
			weekStartDay: 1,
			additionalMandatoryRestDays: [],
			timeZone: AET_P10_2026_PERIOD.timeZone,
			...AET_P10_2026_PAYROLL_SETTINGS,
		},
	];
	dbState.employees = args.employees.map((employee) => ({
		...employee,
		organizationId,
		lastPayrollDate: null,
	}));
	dbState.schedules = args.schedules;
	dbState.attendanceRecords = args.attendanceRows;
	dbState.employeeDeductions = (args.employeeDeductions ?? []).map((deduction) =>
		buildFakeDeductionFromFixture(deduction, organizationId),
	);
}

/**
 * Seeds a valid persisted fiscal voucher that can generate a Phase 3 CFDI XML artifact.
 *
 * @param args - Scenario identifiers
 * @returns Seeded run and voucher identifiers
 */
function seedValidPayrollCfdiXmlScenario(args: { runId: string; voucherId: string }): {
	runId: string;
	voucherId: string;
} {
	dbState.sessionRole = 'admin';
	dbState.payrollRuns = [
		{
			id: args.runId,
			organizationId: dbState.organizationId,
			status: 'PROCESSED',
			paymentFrequency: 'WEEKLY',
			periodStart: new Date('2026-04-06T06:00:00.000Z'),
			periodEnd: new Date('2026-04-13T05:59:59.999Z'),
		},
	];
	dbState.payrollFiscalVouchers = [
		{
			id: args.voucherId,
			payrollRunId: args.runId,
			payrollRunEmployeeId: `${args.voucherId}-run-employee`,
			organizationId: dbState.organizationId,
			employeeId: `${args.voucherId}-employee`,
			status: 'READY_TO_STAMP',
			uuid: null,
			stampedAt: null,
			voucher: {
				issuer: {
					rfc: 'AAA010101AAA',
					name: 'ACME SA DE CV',
					fiscalRegime: '601',
					expeditionPostalCode: '64000',
					employerRegistration: 'A1234567890',
				},
				receiver: {
					name: 'Ada Lovelace',
					rfc: 'LOAA800101ABC',
					curp: 'LOAA800101MDFABC09',
					nss: '12345678901',
					fiscalRegime: '605',
					fiscalPostalCode: '64000',
					employmentStartDateKey: '2024-01-01',
					contractType: '01',
					unionized: 'No',
					workdayType: '01',
					regimeType: '02',
					employeeNumber: 'EMP-001',
					department: 'Operaciones',
					position: 'Tecnica',
					positionRisk: '1',
					baseContributionSalary: 500,
					integratedDailySalary: 550,
					federalEntity: 'NLE',
				},
				paymentFrequency: '02',
				periodStartDateKey: '2026-04-06',
				periodEndDateKey: '2026-04-12',
				paymentDateKey: '2026-04-12',
				daysPaid: 7,
				perceptions: [
					{
						internalType: 'SALARY',
						satTypeCode: '001',
						internalCode: '001',
						description: 'Sueldo',
						taxedAmount: 1000,
						exemptAmount: 0,
					},
				],
				deductions: [
					{
						internalType: 'ISR',
						satTypeCode: '002',
						internalCode: '002',
						description: 'ISR',
						amount: 100,
					},
				],
				otherPayments: [],
			},
			validationErrors: [],
			validationWarnings: [],
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	];

	return args;
}

type PersistedPayrollDeductionBreakdown = {
	appliedAmount: number;
	satDeductionCode: string | null;
};

type PersistedPayrollRunEmployee = {
	deductionsBreakdown: PersistedPayrollDeductionBreakdown[];
	taxBreakdown: {
		grossPay: number;
		employeeWithholdings: {
			total: number;
		};
		employerCosts: {
			total: number;
		};
		netPay: number;
	};
};

/**
 * Sums fiscal voucher deductions from a persisted payroll row.
 *
 * @param row - Persisted payroll employee row
 * @returns ISR/IMSS plus SAT-coded deductions
 */
function calculatePersistedFiscalVoucherDeductions(row: PersistedPayrollRunEmployee): number {
	return calculateFiscalVoucherDeductions(
		row.taxBreakdown.employeeWithholdings.total,
		row.deductionsBreakdown,
	);
}

/**
 * Extracts the table name from a Drizzle table object.
 *
 * @param table - Drizzle table instance
 * @returns Table name when available
 */
function getTableName(table: unknown): string | null {
	if (!table || typeof table !== 'object') {
		return null;
	}

	const nameSymbol = Symbol.for('drizzle:Name');
	const value = (table as Record<symbol, unknown>)[nameSymbol];
	return typeof value === 'string' ? value : null;
}

/**
 * Finds the first date range constraint (gte/lte) inside a WHERE condition tree.
 *
 * @param condition - Drizzle-like condition tree
 * @returns Date bounds when present
 */
function extractDateRange(condition: DrizzleCondition | null): {
	start: Date | null;
	end: Date | null;
} {
	if (!condition) {
		return { start: null, end: null };
	}

	if (condition.kind === 'gte') {
		return typeof condition.value === 'string'
			? { start: null, end: null }
			: { start: condition.value, end: null };
	}

	if (condition.kind === 'lte') {
		return typeof condition.value === 'string'
			? { start: null, end: null }
			: { start: null, end: condition.value };
	}

	if (condition.kind !== 'and') {
		return { start: null, end: null };
	}

	let start: Date | null = null;
	let end: Date | null = null;

	for (const child of condition.conditions) {
		const extracted = extractDateRange(child);
		start ??= extracted.start;
		end ??= extracted.end;
	}

	return { start, end };
}

/**
 * Finds date key boundaries (YYYY-MM-DD) inside a WHERE condition tree.
 *
 * @param condition - Drizzle-like condition tree
 * @returns Date key bounds when present
 */
function extractDateKeyRange(condition: DrizzleCondition | null): {
	start: string | null;
	end: string | null;
} {
	if (!condition) {
		return { start: null, end: null };
	}

	if (condition.kind === 'gte' && typeof condition.value === 'string') {
		return { start: condition.value, end: null };
	}

	if (condition.kind === 'lte' && typeof condition.value === 'string') {
		return { start: null, end: condition.value };
	}

	if (condition.kind !== 'and') {
		return { start: null, end: null };
	}

	let start: string | null = null;
	let end: string | null = null;

	for (const child of condition.conditions) {
		const extracted = extractDateKeyRange(child);
		start ??= extracted.start;
		end ??= extracted.end;
	}

	return { start, end };
}

/**
 * Extracts the first eq(...) value matching a predicate.
 *
 * @param condition - Drizzle-like condition tree
 * @param predicate - Matcher for condition values
 * @returns Matched value or null
 */
function extractEqValue(
	condition: DrizzleCondition | null,
	predicate: (value: unknown) => boolean,
): unknown | null {
	if (!condition) {
		return null;
	}

	if (condition.kind === 'eq' && predicate(condition.value)) {
		return condition.value;
	}

	if (condition.kind !== 'and') {
		return null;
	}

	for (const child of condition.conditions) {
		const value = extractEqValue(child, predicate);
		if (value !== null) {
			return value;
		}
	}

	return null;
}

/**
 * Extracts equality conditions into a column/value record.
 *
 * @param condition - Drizzle-like WHERE condition tree
 * @returns Map keyed by column name
 */
function flattenEqualityConditions(condition: DrizzleCondition | null): Record<string, unknown> {
	if (!condition) {
		return {};
	}

	if (condition.kind === 'and') {
		return condition.conditions.reduce<Record<string, unknown>>((result, child) => {
			return { ...result, ...flattenEqualityConditions(child) };
		}, {});
	}

	if (condition.kind !== 'eq') {
		return {};
	}

	const columnName = getConditionColumnName(condition.column);

	return columnName ? { [columnName]: condition.value } : {};
}

/**
 * Extracts the drizzle column name from a condition operand.
 *
 * @param column - Drizzle column reference
 * @returns Column name when available
 */
function getConditionColumnName(column: unknown): string | null {
	const resolvedColumn = column as { name?: unknown; config?: { name?: unknown } };
	if (typeof resolvedColumn.name === 'string') {
		return resolvedColumn.name;
	}
	return typeof resolvedColumn.config?.name === 'string' ? resolvedColumn.config.name : null;
}

/**
 * Reads a fake row value by a Drizzle column name.
 *
 * @param row - Fake database row
 * @param columnName - Drizzle column name
 * @returns Row value
 */
function readFakeRowColumn(row: Record<string, unknown>, columnName: string): unknown {
	if (columnName === 'stamped_at') {
		return row.stampedAt;
	}
	if (columnName === 'payroll_run_id') {
		return row.payrollRunId;
	}
	if (columnName === 'payroll_fiscal_voucher_id') {
		return row.payrollFiscalVoucherId;
	}
	if (columnName === 'artifact_kind') {
		return row.artifactKind;
	}
	if (columnName === 'fiscal_snapshot_hash') {
		return row.fiscalSnapshotHash;
	}
	if (columnName === 'organization_id') {
		return row.organizationId;
	}
	if (columnName === 'employee_id') {
		return row.employeeId;
	}
	return row[columnName];
}

/**
 * Checks whether a fake row matches a Drizzle-like condition tree.
 *
 * @param row - Fake database row
 * @param condition - Drizzle-like condition tree
 * @returns True when the row matches
 */
function matchesFakeRowCondition(
	row: Record<string, unknown>,
	condition: DrizzleCondition,
): boolean {
	if (condition.kind === 'and') {
		return condition.conditions.every((child) => matchesFakeRowCondition(row, child));
	}

	const columnName = getConditionColumnName(condition.column);
	if (!columnName) {
		return false;
	}

	if (condition.kind === 'eq') {
		return readFakeRowColumn(row, columnName) === condition.value;
	}

	if (condition.kind === 'isNull') {
		return readFakeRowColumn(row, columnName) === null;
	}

	if (condition.kind === 'inArray') {
		return condition.values.includes(readFakeRowColumn(row, columnName));
	}

	return false;
}

/**
 * Extracts the first inArray(...) value list from a WHERE condition tree.
 *
 * @param condition - Drizzle-like condition tree
 * @returns Array values when present
 */
function extractInArrayValues(condition: DrizzleCondition | null): unknown[] | null {
	if (!condition) {
		return null;
	}

	if (condition.kind === 'inArray') {
		return condition.values;
	}

	if (condition.kind !== 'and') {
		return null;
	}

	for (const child of condition.conditions) {
		const values = extractInArrayValues(child);
		if (values) {
			return values;
		}
	}

	return null;
}

/**
 * Extracts an inArray value list for a specific column name.
 *
 * @param condition - Drizzle-like condition tree
 * @param columnName - Column name to match
 * @returns Matching value list or null
 */
function extractInArrayValuesForColumn(
	condition: DrizzleCondition | null,
	columnName: string,
): unknown[] | null {
	if (!condition) {
		return null;
	}

	if (condition.kind === 'inArray') {
		return getConditionColumnName(condition.column) === columnName ? condition.values : null;
	}

	if (condition.kind !== 'and') {
		return null;
	}

	for (const child of condition.conditions) {
		const values = extractInArrayValuesForColumn(child, columnName);
		if (values) {
			return values;
		}
	}

	return null;
}

/**
 * Extracts the first string comparison value for a specific column.
 *
 * @param condition - Drizzle-like condition tree
 * @param columnName - Column name to match
 * @param kind - Comparison operator kind to extract
 * @returns Matching string value or null
 */
function extractStringComparisonForColumn(
	condition: DrizzleCondition | null,
	columnName: string,
	kind: 'gte' | 'lte',
): string | null {
	if (!condition) {
		return null;
	}

	if (condition.kind === kind) {
		return getConditionColumnName(condition.column) === columnName &&
			typeof condition.value === 'string'
			? condition.value
			: null;
	}

	if (condition.kind !== 'and') {
		return null;
	}

	for (const child of condition.conditions) {
		const value = extractStringComparisonForColumn(child, columnName, kind);
		if (value !== null) {
			return value;
		}
	}

	return null;
}

/**
 * Evaluates whether a fake deduction row matches a Drizzle-like WHERE tree.
 *
 * @param row - Deduction row candidate
 * @param condition - Drizzle-like condition tree
 * @returns True when the row satisfies the condition
 */
function matchesDeductionCondition(
	row: FakeEmployeeDeductionRow,
	condition: DrizzleCondition | null,
): boolean {
	if (!condition) {
		return true;
	}

	if (condition.kind === 'and') {
		return condition.conditions.every((child) => matchesDeductionCondition(row, child));
	}

	const columnName = getConditionColumnName(condition.column);
	if (!columnName) {
		return true;
	}

	switch (condition.kind) {
		case 'eq':
			return getDeductionColumnValue(row, columnName) === condition.value;
		case 'isNull':
			return getDeductionColumnValue(row, columnName) === null;
		default:
			return true;
	}
}

/**
 * Maps fake deduction rows to the persisted column values used by predicates.
 *
 * @param row - Deduction row
 * @param columnName - Persisted column name
 * @returns Comparable column value
 */
function getDeductionColumnValue(
	row: FakeEmployeeDeductionRow,
	columnName: string,
): string | number | null {
	switch (columnName) {
		case 'id':
			return row.id;
		case 'organization_id':
			return row.organizationId;
		case 'status':
			return row.status;
		case 'completed_installments':
			return row.completedInstallments;
		case 'remaining_amount':
			return row.remainingAmount;
		case 'value':
			return row.value;
		case 'calculation_method':
			return row.calculationMethod;
		case 'frequency':
			return row.frequency;
		case 'total_installments':
			return row.totalInstallments;
		case 'total_amount':
			return row.totalAmount;
		case 'start_date_key':
			return row.startDateKey;
		case 'end_date_key':
			return row.endDateKey;
		default:
			return null;
	}
}

/**
 * Applies a staged deduction mutation to the in-memory row.
 *
 * @param deduction - Mutable fake deduction row
 * @param mutation - Pending mutation payload
 * @returns Nothing
 */
function applyPendingDeductionMutation(
	deduction: FakeEmployeeDeductionRow,
	mutation: FakePendingDeductionMutation,
): void {
	if (mutation.status) {
		deduction.status = mutation.status;
	}
	if (typeof mutation.completedInstallments === 'number') {
		deduction.completedInstallments = mutation.completedInstallments;
	}
	if (mutation.remainingAmount !== undefined) {
		deduction.remainingAmount = mutation.remainingAmount;
	}
	if (mutation.value !== undefined) {
		deduction.value = mutation.value;
	}
	if (mutation.calculationMethod !== undefined) {
		deduction.calculationMethod = mutation.calculationMethod;
	}
	if (mutation.frequency !== undefined) {
		deduction.frequency = mutation.frequency;
	}
	if (mutation.totalInstallments !== undefined) {
		deduction.totalInstallments = mutation.totalInstallments;
	}
	if (mutation.totalAmount !== undefined) {
		deduction.totalAmount = mutation.totalAmount;
	}
	if (mutation.startDateKey !== undefined) {
		deduction.startDateKey = mutation.startDateKey;
	}
	if (mutation.endDateKey !== undefined) {
		deduction.endDateKey = mutation.endDateKey;
	}
}

/**
 * Detects the mocked SQL object emitted by the payment-date bulk update.
 *
 * @param value - Candidate update value
 * @returns True when the value is the mocked jsonb_set voucher update
 */
function isMockedPaymentDateVoucherSql(
	value: unknown,
): value is { text: string; values: unknown[] } {
	return (
		!!value &&
		typeof value === 'object' &&
		typeof (value as { text?: unknown }).text === 'string' &&
		Array.isArray((value as { values?: unknown }).values) &&
		(value as { text: string }).text.includes('jsonb_set')
	);
}

/**
 * Applies the route's mocked bulk payment-date SQL update to an in-memory row.
 *
 * @param voucher - In-memory fiscal voucher row
 * @param values - Update values passed to the fake DB
 */
function applyMockedPaymentDateBulkUpdate(
	voucher: Record<string, unknown>,
	values: Record<string, unknown>,
): void {
	if (!isMockedPaymentDateVoucherSql(values.voucher)) {
		Object.assign(voucher, values);
		return;
	}

	const paymentDateKey = values.voucher.values.find(
		(value): value is string => typeof value === 'string',
	);
	const voucherSnapshot = (voucher.voucher ?? {}) as Record<string, unknown>;
	const validationErrors = Array.isArray(voucher.validationErrors)
		? voucher.validationErrors.filter((error) => {
				const issue = error as { code?: unknown };
				return issue.code !== 'PAYMENT_DATE_REQUIRED';
			})
		: [];

	voucher.voucher = {
		...voucherSnapshot,
		paymentDateKey,
	};
	voucher.validationErrors = validationErrors;
	voucher.status = validationErrors.length === 0 ? 'READY_TO_STAMP' : voucher.status;
	if (values.updatedAt instanceof Date) {
		voucher.updatedAt = values.updatedAt;
	}
}

/**
 * Creates a minimal Drizzle-like DB stub for route tests.
 *
 * @param state - Shared mutable DB state
 * @returns Fake DB instance
 */
function createFakeDb(state: FakeDbState): {
	insert: (table: unknown) => {
		values: (values: Record<string, unknown> | Record<string, unknown>[]) => Promise<void> & {
			onConflictDoNothing: () => Promise<void>;
		};
	};
	select: (selection?: unknown) => unknown;
	transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
	update: (table: unknown) => {
		set: (values: Record<string, unknown>) => {
			where: (condition: DrizzleCondition) => {
				returning: (
					selection?: Record<string, unknown>,
				) => Promise<Record<string, unknown>[]>;
			} & Promise<void>;
		};
	};
} {
	/**
	 * Minimal Drizzle-like query builder that is awaitable (`thenable`).
	 */
	class FakeQuery {
		private tableName: string | null = null;
		private whereCondition: DrizzleCondition | null = null;
		private limitCount: number | null = null;
		private offsetCount: number = 0;

		/**
		 * Creates a fake query builder instance.
		 *
		 * @param selection - Drizzle-style selection shape passed to `select()`
		 */
		constructor(private readonly selection: unknown) {}

		/**
		 * Sets the source table for the query.
		 *
		 * @param table - Drizzle table instance
		 * @returns The current query builder
		 */
		from(table: unknown): this {
			this.tableName = getTableName(table);
			return this;
		}

		/**
		 * No-op join implementation for route queries.
		 *
		 * @param _table - Joined table (ignored)
		 * @param _on - Join condition (ignored)
		 * @returns The current query builder
		 */
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		leftJoin(_table: unknown, _on: unknown): this {
			return this;
		}

		/**
		 * Sets the WHERE condition for the query.
		 *
		 * @param condition - Drizzle-like condition tree
		 * @returns The current query builder
		 */
		where(condition: DrizzleCondition): this {
			this.whereCondition = condition;
			return this;
		}

		/**
		 * Applies a LIMIT to the query.
		 *
		 * @param count - Max number of rows
		 * @returns The current query builder
		 */
		limit(count: number): this {
			this.limitCount = count;
			return this;
		}

		/**
		 * Applies an OFFSET to the query.
		 *
		 * @param count - Number of rows to skip
		 * @returns The current query builder
		 */
		offset(count: number): this {
			this.offsetCount = count;
			return this;
		}

		/**
		 * No-op ordering implementation for route queries.
		 *
		 * @param _args - Ordering expressions (ignored)
		 * @returns The current query builder
		 */
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		orderBy(..._args: unknown[]): this {
			return this;
		}

		/**
		 * Executes the query against the in-memory DB state.
		 *
		 * @returns Result rows
		 */
		private execute(): unknown[] {
			const tableName = this.tableName;
			if (!tableName) {
				return [];
			}

			if (tableName === 'payroll_setting') {
				const rows = state.payrollSettings.filter(
					(row) => row.organizationId === state.organizationId,
				);
				return this.limitCount ? rows.slice(0, this.limitCount) : rows;
			}

			if (tableName === 'member') {
				return state.sessionRole
					? [
							{
								userId: 'test-user',
								organizationId: state.organizationId,
								role: state.sessionRole,
							},
						]
					: [];
			}

			if (tableName === 'employee') {
				const rows = state.employees.filter(
					(row) => row.organizationId === state.organizationId,
				);
				return rows;
			}

			if (tableName === 'employee_schedule') {
				const employeeIds =
					extractInArrayValues(this.whereCondition)?.filter(
						(value): value is string => typeof value === 'string',
					) ?? [];
				return state.schedules.filter((row) =>
					employeeIds.length === 0 ? true : employeeIds.includes(row.employeeId),
				);
			}

			if (tableName === 'attendance_record') {
				const employeeIds =
					extractInArrayValues(this.whereCondition)?.filter(
						(value): value is string => typeof value === 'string',
					) ?? [];
				const { start, end } = extractDateRange(this.whereCondition);
				const rows = state.attendanceRecords
					.filter((row) =>
						employeeIds.length === 0 ? true : employeeIds.includes(row.employeeId),
					)
					.filter((row) => (start ? row.timestamp >= start : true))
					.filter((row) => (end ? row.timestamp <= end : true));
				if (!this.selection || typeof this.selection !== 'object') {
					return rows;
				}
				const selectionKeys = Object.keys(this.selection as Record<string, unknown>);
				return rows.map((row) => {
					const rowRecord = row as unknown as Record<string, unknown>;
					const projectedRow: Record<string, unknown> = {};
					for (const key of selectionKeys) {
						projectedRow[key] = rowRecord[key];
					}
					return projectedRow;
				});
			}

			if (tableName === 'vacation_request_day') {
				const employeeIds =
					extractInArrayValues(this.whereCondition)?.filter(
						(value): value is string => typeof value === 'string',
					) ?? [];
				const { start, end } = extractDateKeyRange(this.whereCondition);
				const countsFilter = extractEqValue(
					this.whereCondition,
					(value) => typeof value === 'boolean',
				);
				const statusFilter = extractEqValue(
					this.whereCondition,
					(value) =>
						typeof value === 'string' &&
						['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(value),
				);
				const orgFilter = extractEqValue(
					this.whereCondition,
					(value) => typeof value === 'string' && value === state.organizationId,
				);

				const requestsById = new Map(state.vacationRequests.map((row) => [row.id, row]));

				return state.vacationRequestDays
					.filter((row) =>
						employeeIds.length === 0 ? true : employeeIds.includes(row.employeeId),
					)
					.filter((row) =>
						typeof countsFilter === 'boolean'
							? row.countsAsVacationDay === countsFilter
							: true,
					)
					.filter((row) => (start ? row.dateKey >= start : true))
					.filter((row) => (end ? row.dateKey <= end : true))
					.filter((row) => {
						const request = requestsById.get(row.requestId);
						if (!request) {
							return false;
						}
						if (typeof statusFilter === 'string' && request.status !== statusFilter) {
							return false;
						}
						if (typeof orgFilter === 'string' && request.organizationId !== orgFilter) {
							return false;
						}
						return true;
					});
			}

			if (tableName === 'vacation_request') {
				const employeeIds =
					extractInArrayValuesForColumn(this.whereCondition, 'employee_id')?.filter(
						(value): value is string => typeof value === 'string',
					) ?? [];
				const statusFilter = extractEqValue(
					this.whereCondition,
					(value) =>
						typeof value === 'string' &&
						['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(value),
				);
				const orgFilter = extractEqValue(
					this.whereCondition,
					(value) => typeof value === 'string' && value === state.organizationId,
				);
				const startDateKeyUpperBound = extractStringComparisonForColumn(
					this.whereCondition,
					'start_date_key',
					'lte',
				);
				const endDateKeyLowerBound = extractStringComparisonForColumn(
					this.whereCondition,
					'end_date_key',
					'gte',
				);

				const rows = state.vacationRequests
					.filter((row) =>
						employeeIds.length === 0 ? true : employeeIds.includes(row.employeeId),
					)
					.filter((row) =>
						typeof statusFilter === 'string' ? row.status === statusFilter : true,
					)
					.filter((row) =>
						typeof orgFilter === 'string' ? row.organizationId === orgFilter : true,
					)
					.filter((row) =>
						startDateKeyUpperBound ? row.startDateKey <= startDateKeyUpperBound : true,
					)
					.filter((row) =>
						endDateKeyLowerBound ? row.endDateKey >= endDateKeyLowerBound : true,
					);

				if (!this.selection || typeof this.selection !== 'object') {
					return rows;
				}

				const selectionKeys = Object.keys(this.selection as Record<string, unknown>);
				return rows.map((row) => {
					const rowRecord = row as unknown as Record<string, unknown>;
					const projectedRow: Record<string, unknown> = {};
					for (const key of selectionKeys) {
						projectedRow[key] = rowRecord[key];
					}
					return projectedRow;
				});
			}

			if (tableName === 'employee_deduction') {
				const deductionIds =
					extractInArrayValuesForColumn(this.whereCondition, 'id')?.filter(
						(value): value is string => typeof value === 'string',
					) ?? [];
				const employeeIds =
					extractInArrayValuesForColumn(this.whereCondition, 'employee_id')?.filter(
						(value): value is string => typeof value === 'string',
					) ?? [];
				return state.employeeDeductions.filter((row) => {
					if (deductionIds.length > 0 && !deductionIds.includes(row.id)) {
						return false;
					}
					return employeeIds.length === 0 ? true : employeeIds.includes(row.employeeId);
				});
			}

			if (tableName === 'payroll_run') {
				const whereEq = this.whereCondition?.kind === 'eq' ? this.whereCondition : null;
				const id = typeof whereEq?.value === 'string' ? whereEq.value : null;
				const rows =
					id === null
						? state.payrollRuns
						: state.payrollRuns.filter((row) => row.id === id);
				const sliced = rows.slice(this.offsetCount);
				return this.limitCount ? sliced.slice(0, this.limitCount) : sliced;
			}

			if (tableName === 'payroll_run_employee') {
				const whereEq = this.whereCondition?.kind === 'eq' ? this.whereCondition : null;
				const runId = typeof whereEq?.value === 'string' ? whereEq.value : null;
				return runId === null
					? state.payrollRunEmployees
					: state.payrollRunEmployees.filter((row) => row.payrollRunId === runId);
			}

			if (tableName === 'payroll_fiscal_voucher') {
				const whereEq = this.whereCondition?.kind === 'eq' ? this.whereCondition : null;
				const runId = typeof whereEq?.value === 'string' ? whereEq.value : null;
				return runId === null
					? state.payrollFiscalVouchers
					: state.payrollFiscalVouchers.filter((row) => row.payrollRunId === runId);
			}

			if (tableName === 'payroll_cfdi_xml_artifact') {
				return this.whereCondition
					? state.payrollCfdiXmlArtifacts.filter((row) =>
							matchesFakeRowCondition(row, this.whereCondition as DrizzleCondition),
						)
					: state.payrollCfdiXmlArtifacts;
			}

			return [];
		}

		/**
		 * Implements `PromiseLike` so `await db.select()...` works in the route code.
		 *
		 * @param onfulfilled - Callback invoked with query results
		 * @param onrejected - Callback invoked on rejection
		 * @returns Promise resolving to transformed results
		 */
		then<TResult1 = unknown[], TResult2 = never>(
			onfulfilled?:
				| ((value: unknown[]) => TResult1 | PromiseLike<TResult1>)
				| null
				| undefined,
			onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined,
		): Promise<TResult1 | TResult2> {
			return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
		}
	}

	/**
	 * Creates a transaction-scoped DB facade used by `/payroll/process`.
	 *
	 * @returns Transaction client with insert/update/select helpers
	 */
	const createTransaction = (): {
		insert: (table: unknown) => {
			values: (
				values: Record<string, unknown> | Record<string, unknown>[],
			) => Promise<void> & {
				onConflictDoNothing: () => Promise<void>;
			};
		};
		update: (table: unknown) => {
			set: (values: Record<string, unknown>) => {
				where: (condition: DrizzleCondition) => {
					returning: (
						selection?: Record<string, unknown>,
					) => Promise<Record<string, unknown>[]>;
				} & Promise<void>;
			};
		};
		select: (selection?: unknown) => unknown;
		execute: (query: unknown) => Promise<void>;
	} => {
		/**
		 * Begins an insert operation.
		 *
		 * @param table - Drizzle table instance
		 * @returns Insert builder exposing a `values()` method
		 */
		const insert = (table: unknown) => {
			const tableName = getTableName(table);

			/**
			 * Inserts one or many rows into an in-memory table.
			 *
			 * @param values - Row object or list of rows
			 * @returns Nothing
			 */
			const valuesFn = (
				values: Record<string, unknown> | Record<string, unknown>[],
			): Promise<void> & {
				onConflictDoNothing: () => Promise<void>;
			} => {
				const rows = Array.isArray(values) ? values : [values];
				if (tableName === 'payroll_run') {
					state.payrollRuns.push(...rows);
					return Object.assign(Promise.resolve(), {
						onConflictDoNothing: async () => undefined,
					});
				}
				if (tableName === 'payroll_run_employee') {
					state.payrollRunEmployees.push(...rows);
					return Object.assign(Promise.resolve(), {
						onConflictDoNothing: async () => undefined,
					});
				}
				if (tableName === 'payroll_fiscal_voucher') {
					if (state.pendingBodylessFiscalVoucherConflictOnNextInsert) {
						state.pendingBodylessFiscalVoucherConflictOnNextInsert = false;
						state.payrollFiscalVouchers.push(
							...rows.map((row, index) => ({
								id: `concurrent-fiscal-voucher-${
									state.payrollFiscalVouchers.length + index + 1
								}`,
								createdAt: new Date(),
								updatedAt: new Date(),
								...row,
								voucher: {
									...((row.voucher as Record<string, unknown>) ?? {}),
									paymentDateKey: null,
								},
								validationErrors: [
									...((row.validationErrors as Record<string, unknown>[]) ?? []),
									{
										code: 'PAYMENT_DATE_REQUIRED',
										field: 'paymentDateKey',
										message: 'Payroll voucher payment date is required.',
									},
								],
								status: 'BLOCKED',
							})),
						);
					}
					state.payrollFiscalVouchers.push(
						...rows
							.filter(
								(row) =>
									!state.payrollFiscalVouchers.some(
										(existing) =>
											existing.payrollRunEmployeeId ===
											row.payrollRunEmployeeId,
									),
							)
							.map((row, index) => ({
								id:
									typeof row.id === 'string'
										? row.id
										: `fiscal-voucher-${
												state.payrollFiscalVouchers.length + index + 1
											}`,
								createdAt: new Date(),
								updatedAt: new Date(),
								...row,
							})),
					);
				}
				if (tableName === 'payroll_cfdi_xml_artifact') {
					state.payrollCfdiXmlArtifacts.push(
						...rows.map((row, index) => ({
							id:
								typeof row.id === 'string'
									? row.id
									: `cfdi-xml-artifact-${
											state.payrollCfdiXmlArtifacts.length + index + 1
										}`,
							createdAt: new Date(),
							...row,
						})),
					);
				}
				return Object.assign(Promise.resolve(), {
					onConflictDoNothing: async () => undefined,
				});
			};

			return { values: valuesFn };
		};

		/**
		 * Begins an update operation.
		 *
		 * @param table - Drizzle table instance
		 * @returns Update builder exposing a `set()` method
		 */
		const update = (table: unknown) => {
			const tableName = getTableName(table);

			/**
			 * Assigns update values.
			 *
			 * @param values - Column updates
			 * @returns Update builder exposing a `where()` method
			 */
			const set = (values: Record<string, unknown>) => {
				/**
				 * Applies the WHERE clause and executes the update.
				 *
				 * @param condition - Drizzle-like condition tree
				 * @returns Nothing
				 */
				const applyWhere = async (
					condition: DrizzleCondition,
				): Promise<Record<string, unknown>[]> => {
					if (tableName === 'employee') {
						const employeeIds =
							extractInArrayValues(condition)?.filter(
								(value): value is string => typeof value === 'string',
							) ?? [];
						for (const emp of state.employees) {
							if (employeeIds.includes(emp.id)) {
								if (
									values.lastPayrollDate instanceof Date ||
									values.lastPayrollDate === null
								) {
									emp.lastPayrollDate = values.lastPayrollDate;
								}
							}
						}
						return [];
					}

					if (tableName === 'employee_deduction') {
						state.deductionUpdateConditions.push(condition);
						if (state.pendingDeductionMutationBeforeUpdate) {
							for (const deduction of state.employeeDeductions) {
								if (
									deduction.id !== state.pendingDeductionMutationBeforeUpdate.id
								) {
									continue;
								}
								applyPendingDeductionMutation(
									deduction,
									state.pendingDeductionMutationBeforeUpdate,
								);
							}
							state.pendingDeductionMutationBeforeUpdate = null;
						}

						const updatedRows: Record<string, unknown>[] = [];
						for (const deduction of state.employeeDeductions) {
							if (!matchesDeductionCondition(deduction, condition)) {
								continue;
							}
							if (
								values.status === 'ACTIVE' ||
								values.status === 'PAUSED' ||
								values.status === 'COMPLETED' ||
								values.status === 'CANCELLED'
							) {
								deduction.status = values.status;
							}
							if (typeof values.completedInstallments === 'number') {
								deduction.completedInstallments = values.completedInstallments;
							}
							if (
								values.remainingAmount === null ||
								typeof values.remainingAmount === 'string'
							) {
								deduction.remainingAmount = values.remainingAmount as string | null;
							}
							updatedRows.push({ id: deduction.id });
						}

						return updatedRows;
					}

					if (tableName === 'payroll_fiscal_voucher') {
						const voucherId = extractEqValue(
							condition,
							(value) => typeof value === 'string',
						);
						const voucherIds =
							extractInArrayValuesForColumn(condition, 'id')?.filter(
								(value): value is string => typeof value === 'string',
							) ?? [];
						state.payrollFiscalVoucherUpdateCount += 1;
						if (state.pendingFiscalVoucherStampBeforeUpdate) {
							for (const voucher of state.payrollFiscalVouchers) {
								const shouldStamp =
									voucher.id === voucherId ||
									(voucherId === null &&
										voucherIds.includes(voucher.id as string));
								if (!shouldStamp) {
									continue;
								}
								voucher.uuid = 'concurrent-stamp-uuid';
								voucher.stampedAt = new Date('2026-03-09T00:00:00.000Z');
								voucher.status = 'STAMPED';
								break;
							}
							state.pendingFiscalVoucherStampBeforeUpdate = false;
						}

						const updatedRows: Record<string, unknown>[] = [];
						for (const voucher of state.payrollFiscalVouchers) {
							if (!matchesFakeRowCondition(voucher, condition)) {
								continue;
							}
							applyMockedPaymentDateBulkUpdate(voucher, values);
							updatedRows.push({ id: voucher.id });
						}

						return updatedRows;
					}

					if (tableName === 'payroll_cfdi_xml_artifact') {
						const updatedRows: Record<string, unknown>[] = [];
						for (const artifact of state.payrollCfdiXmlArtifacts) {
							if (!matchesFakeRowCondition(artifact, condition)) {
								continue;
							}
							Object.assign(artifact, values);
							updatedRows.push({ id: artifact.id });
						}

						return updatedRows;
					}

					return [];
				};

				const where = (condition: DrizzleCondition) => {
					let execution: Promise<Record<string, unknown>[]> | null = null;
					const executeOnce = (): Promise<Record<string, unknown>[]> => {
						execution ??= applyWhere(condition);
						return execution;
					};
					const updatePromise = executeOnce().then(() => undefined);
					return Object.assign(updatePromise, {
						returning: async (selection?: Record<string, unknown>) => {
							const rows = await executeOnce();
							if (!selection) {
								return rows;
							}
							const selectedKeys = Object.keys(selection);
							return rows.map((row) => {
								const projectedRow: Record<string, unknown> = {};
								for (const key of selectedKeys) {
									projectedRow[key] = row[key];
								}
								return projectedRow;
							});
						},
					});
				};

				return { where };
			};

			return { set };
		};

		/**
		 * Creates a SELECT query builder.
		 *
		 * @param selection - Drizzle-style selection shape passed to `select()`
		 * @returns Thenable query builder
		 */
		const select = (selection?: unknown) => new FakeQuery(selection);

		/**
		 * Executes a raw SQL statement (no-op for tests).
		 *
		 * @param _query - SQL query payload
		 * @returns Nothing
		 */
		const execute = async (_query: unknown): Promise<void> => {
			void _query;
		};

		return { insert, update, select, execute };
	};

	/**
	 * Creates a SELECT query builder.
	 *
	 * @param selection - Drizzle-style selection shape passed to `select()`
	 * @returns Thenable query builder
	 */
	const select = (selection?: unknown): unknown => new FakeQuery(selection);

	/**
	 * Executes a callback in a fake transaction and captures whether it ran.
	 *
	 * @param fn - Transaction callback
	 * @returns Callback result
	 */
	const transaction = async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
		state.transactionCalled = true;
		if (state.pendingDeductionMutationBeforeTransaction) {
			for (const deduction of state.employeeDeductions) {
				if (deduction.id !== state.pendingDeductionMutationBeforeTransaction.id) {
					continue;
				}
				applyPendingDeductionMutation(
					deduction,
					state.pendingDeductionMutationBeforeTransaction,
				);
			}
			state.pendingDeductionMutationBeforeTransaction = null;
		}

		const snapshot = structuredClone({
			employees: state.employees,
			employeeDeductions: state.employeeDeductions,
			payrollRuns: state.payrollRuns,
			payrollRunEmployees: state.payrollRunEmployees,
			payrollFiscalVouchers: state.payrollFiscalVouchers,
			payrollCfdiXmlArtifacts: state.payrollCfdiXmlArtifacts,
		});

		try {
			return await fn(createTransaction());
		} catch (error) {
			state.employees = snapshot.employees;
			state.employeeDeductions = snapshot.employeeDeductions;
			state.payrollRuns = snapshot.payrollRuns;
			state.payrollRunEmployees = snapshot.payrollRunEmployees;
			state.payrollFiscalVouchers = snapshot.payrollFiscalVouchers;
			state.payrollCfdiXmlArtifacts = snapshot.payrollCfdiXmlArtifacts;
			throw error;
		}
	};

	/**
	 * Begins a top-level insert operation.
	 *
	 * @param table - Drizzle table instance
	 * @returns Insert builder
	 */
	const insert = (table: unknown) => createTransaction().insert(table);

	/**
	 * Begins a top-level update operation.
	 *
	 * @param table - Drizzle table instance
	 * @returns Update builder
	 */
	const update = (table: unknown) => createTransaction().update(table);

	return {
		insert,
		select,
		transaction,
		update,
	};
}

const dbState: FakeDbState = {
	organizationId: 'org-test',
	sessionRole: null,
	payrollSettings: [],
	employees: [],
	schedules: [],
	attendanceRecords: [],
	vacationRequests: [],
	vacationRequestDays: [],
	employeeDeductions: [],
	payrollRuns: [],
	payrollRunEmployees: [],
	payrollFiscalVouchers: [],
	payrollCfdiXmlArtifacts: [],
	payrollFiscalVoucherUpdateCount: 0,
	transactionCalled: false,
	deductionUpdateConditions: [],
	pendingDeductionMutationBeforeTransaction: null,
	pendingDeductionMutationBeforeUpdate: null,
	pendingBodylessFiscalVoucherConflictOnNextInsert: false,
	pendingFiscalVoucherStampBeforeUpdate: false,
};

const fakeDb = createFakeDb(dbState);

/**
 * Mock implementation of drizzle's sql template tag.
 *
 * @param strings - Template string segments
 * @param values - Interpolated values
 * @returns Simplified SQL payload
 */
function sqlTag(
	strings: TemplateStringsArray,
	...values: unknown[]
): { text: string; values: unknown[] } {
	return {
		text: strings.join('?'),
		values,
	};
}

mock.module('drizzle-orm', () => {
	return {
		...actualDrizzleOrmModule,
		and: (...conditions: DrizzleCondition[]) => ({
			kind: 'and' as const,
			conditions,
		}),
		eq: (column: unknown, value: unknown) => ({ kind: 'eq' as const, column, value }),
		gte: (column: unknown, value: Date) => ({ kind: 'gte' as const, column, value }),
		inArray: (column: unknown, values: unknown[]) => ({
			kind: 'inArray' as const,
			column,
			values,
		}),
		isNull: (column: unknown) => ({ kind: 'isNull' as const, column }),
		lte: (column: unknown, value: Date) => ({ kind: 'lte' as const, column, value }),
		or: (...conditions: DrizzleCondition[]) => ({
			kind: 'and' as const,
			conditions,
		}),
		relations: () => ({}),
		sql: sqlTag,
	};
});

mock.module('drizzle-orm/sql', () => {
	return {
		...actualDrizzleSqlModule,
		inArray: (column: unknown, values: unknown[]) => ({
			kind: 'inArray' as const,
			column,
			values,
		}),
	};
});

mock.module('../db/index.js', () => ({ default: fakeDb }));
mock.module('../plugins/auth.js', () => ({
	combinedAuthPlugin: new Elysia({ name: 'mock-auth-plugin' }).derive(
		{ as: 'scoped' },
		({ request }) => {
			const authTypeHeader = request.headers.get('x-test-auth-type');
			return {
				authType: authTypeHeader === 'apiKey' ? ('apiKey' as const) : ('session' as const),
				session: { userId: 'test-user' },
				sessionOrganizationIds: [dbState.organizationId],
				apiKeyOrganizationId: dbState.organizationId,
				apiKeyOrganizationIds: [dbState.organizationId],
			};
		},
	),
}));
mock.module('../utils/organization.js', () => ({
	resolveOrganizationId: () => dbState.organizationId,
}));

describe('payroll routes', () => {
	const timeZone = 'America/Mexico_City';

	beforeEach(() => {
		dbState.organizationId = 'org-test';
		dbState.sessionRole = null;
		dbState.payrollSettings = [];
		dbState.employees = [];
		dbState.schedules = [];
		dbState.attendanceRecords = [];
		dbState.vacationRequests = [];
		dbState.vacationRequestDays = [];
		dbState.employeeDeductions = [];
		dbState.payrollRuns = [];
		dbState.payrollRunEmployees = [];
		dbState.payrollFiscalVouchers = [];
		dbState.payrollCfdiXmlArtifacts = [];
		dbState.payrollFiscalVoucherUpdateCount = 0;
		dbState.transactionCalled = false;
		dbState.deductionUpdateConditions = [];
		dbState.pendingDeductionMutationBeforeTransaction = null;
		dbState.pendingDeductionMutationBeforeUpdate = null;
		dbState.pendingBodylessFiscalVoucherConflictOnNextInsert = false;
		dbState.pendingFiscalVoucherStampBeforeUpdate = false;
	});

	afterEach(() => {
		setSystemTime();
	});

	afterAll(() => {
		mock.restore();
	});

	it('includes edge attendance events so clipped sessions are counted in /payroll/calculate', async () => {
		dbState.organizationId = 'org-1';
		dbState.payrollSettings = [
			{
				organizationId: dbState.organizationId,
				overtimeEnforcement: 'WARN',
				weekStartDay: 1,
				additionalMandatoryRestDays: [],
				timeZone,
			},
		];

		const employeeId = 'emp-1';
		dbState.employees = [
			{
				id: employeeId,
				firstName: 'Ada',
				lastName: 'Lovelace',
				dailyPay: 800,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				organizationId: dbState.organizationId,
				lastPayrollDate: null,
			},
		];

		const checkIn = getUtcDateForZonedTime('2024-12-31', 23, 0, timeZone);
		const checkOut = getUtcDateForZonedTime('2025-01-01', 1, 0, timeZone);
		dbState.attendanceRecords = createAttendancePair(employeeId, checkIn, checkOut);

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/calculate', {
				organizationId: dbState.organizationId,
				periodStartDateKey: '2025-01-01',
				periodEndDateKey: '2025-01-01',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			data: {
				employees: { employeeId: string; hoursWorked: number; totalPay: number }[];
				totalAmount: number;
			};
		};

		expect(json.data.employees).toHaveLength(1);
		expect(json.data.employees[0]?.employeeId).toBe(employeeId);
		expect(json.data.employees[0]?.hoursWorked).toBe(1);
		expect(json.data.employees[0]?.totalPay).toBe(1700);
		expect(json.data.totalAmount).toBe(1700);
	});

	it('includes edge CHECK_OUT events after the period so sessions ending after period are counted', async () => {
		dbState.organizationId = 'org-1';
		dbState.payrollSettings = [
			{
				organizationId: dbState.organizationId,
				overtimeEnforcement: 'WARN',
				weekStartDay: 1,
				additionalMandatoryRestDays: [],
				timeZone,
			},
		];

		const employeeId = 'emp-2';
		dbState.employees = [
			{
				id: employeeId,
				firstName: 'Ada',
				lastName: 'Lovelace',
				dailyPay: 800,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				organizationId: dbState.organizationId,
				lastPayrollDate: null,
			},
		];

		const checkIn = getUtcDateForZonedTime('2025-01-01', 23, 0, timeZone);
		const checkOut = getUtcDateForZonedTime('2025-01-02', 1, 0, timeZone);
		dbState.attendanceRecords = createAttendancePair(employeeId, checkIn, checkOut);

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/calculate', {
				organizationId: dbState.organizationId,
				periodStartDateKey: '2025-01-01',
				periodEndDateKey: '2025-01-01',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			data: {
				employees: { employeeId: string; hoursWorked: number; totalPay: number }[];
				totalAmount: number;
			};
		};

		expect(json.data.employees).toHaveLength(1);
		expect(json.data.employees[0]?.employeeId).toBe(employeeId);
		expect(json.data.employees[0]?.hoursWorked).toBe(1);
		expect(json.data.employees[0]?.totalPay).toBe(1700);
		expect(json.data.totalAmount).toBe(1700);
	});

	it('returns overtime totals and warnings in /payroll/calculate', async () => {
		dbState.organizationId = 'org-4';
		dbState.payrollSettings = [
			{
				organizationId: dbState.organizationId,
				overtimeEnforcement: 'WARN',
				weekStartDay: 1,
				additionalMandatoryRestDays: [],
				timeZone,
			},
		];

		const employeeId = 'emp-5';
		dbState.employees = [
			{
				id: employeeId,
				firstName: 'Ada',
				lastName: 'Lovelace',
				dailyPay: 800,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				organizationId: dbState.organizationId,
				lastPayrollDate: null,
			},
		];

		dbState.attendanceRecords = createAttendancePair(
			employeeId,
			getUtcDateForZonedTime('2025-01-02', 8, 0, timeZone),
			getUtcDateForZonedTime('2025-01-02', 20, 0, timeZone),
		);

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/calculate', {
				organizationId: dbState.organizationId,
				periodStartDateKey: '2025-01-02',
				periodEndDateKey: '2025-01-02',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			data: {
				employees: {
					employeeId: string;
					normalHours: number;
					overtimeDoubleHours: number;
					overtimeTripleHours: number;
					warnings: { type: string; severity: string }[];
				}[];
			};
		};

		expect(json.data.employees).toHaveLength(1);
		const row = json.data.employees[0];
		expect(row?.employeeId).toBe(employeeId);
		expect(row?.normalHours).toBe(8);
		expect(row?.overtimeDoubleHours).toBe(4);
		expect(row?.overtimeTripleHours).toBe(0);
		expect(row?.warnings.some((warning) => warning.type === 'OVERTIME_DAILY_EXCEEDED')).toBe(
			true,
		);
	});

	it('applies configured lunch-break auto deduction in /payroll/calculate', async () => {
		dbState.organizationId = 'org-lunch-settings';
		dbState.payrollSettings = [
			{
				organizationId: dbState.organizationId,
				overtimeEnforcement: 'WARN',
				weekStartDay: 1,
				additionalMandatoryRestDays: [],
				timeZone,
				autoDeductLunchBreak: true,
				lunchBreakMinutes: 60,
				lunchBreakThresholdHours: 6,
			},
		];

		const employeeId = 'emp-lunch-settings';
		dbState.employees = [
			{
				id: employeeId,
				firstName: 'Ada',
				lastName: 'Lovelace',
				dailyPay: 800,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				organizationId: dbState.organizationId,
				lastPayrollDate: null,
			},
		];

		dbState.attendanceRecords = createAttendancePair(
			employeeId,
			getUtcDateForZonedTime('2025-01-02', 9, 0, timeZone),
			getUtcDateForZonedTime('2025-01-02', 17, 0, timeZone),
		);

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/calculate', {
				organizationId: dbState.organizationId,
				periodStartDateKey: '2025-01-02',
				periodEndDateKey: '2025-01-02',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			data: {
				employees: Array<{
					employeeId: string;
					hoursWorked: number;
					lunchBreakAutoDeductedDays: number;
					lunchBreakAutoDeductedMinutes: number;
					warnings: Array<{ type: string }>;
				}>;
			};
		};

		const row = json.data.employees[0];
		expect(row?.employeeId).toBe(employeeId);
		expect(row?.hoursWorked).toBe(7);
		expect(row?.lunchBreakAutoDeductedDays).toBe(1);
		expect(row?.lunchBreakAutoDeductedMinutes).toBe(60);
		expect(row?.warnings.some((warning) => warning.type === 'LUNCH_BREAK_AUTO_DEDUCTED')).toBe(
			true,
		);
	});

	it('skips lunch-break auto deduction when a lunch checkout already exists in /payroll/calculate', async () => {
		dbState.organizationId = 'org-lunch-checkout';
		dbState.payrollSettings = [
			{
				organizationId: dbState.organizationId,
				overtimeEnforcement: 'WARN',
				weekStartDay: 1,
				additionalMandatoryRestDays: [],
				timeZone,
				autoDeductLunchBreak: true,
				lunchBreakMinutes: 60,
				lunchBreakThresholdHours: 6,
			},
		];

		const employeeId = 'emp-lunch-checkout';
		dbState.employees = [
			{
				id: employeeId,
				firstName: 'Ada',
				lastName: 'Lovelace',
				dailyPay: 800,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				organizationId: dbState.organizationId,
				lastPayrollDate: null,
			},
		];

		dbState.attendanceRecords = [
			{
				employeeId,
				timestamp: getUtcDateForZonedTime('2025-01-02', 9, 0, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime('2025-01-02', 13, 0, timeZone),
				type: 'CHECK_OUT',
				checkOutReason: 'LUNCH_BREAK',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime('2025-01-02', 14, 0, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId,
				timestamp: getUtcDateForZonedTime('2025-01-02', 18, 0, timeZone),
				type: 'CHECK_OUT',
			},
		];

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/calculate', {
				organizationId: dbState.organizationId,
				periodStartDateKey: '2025-01-02',
				periodEndDateKey: '2025-01-02',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			data: {
				employees: Array<{
					employeeId: string;
					hoursWorked: number;
					lunchBreakAutoDeductedDays: number;
					lunchBreakAutoDeductedMinutes: number;
					warnings: Array<{ type: string }>;
				}>;
			};
		};

		const row = json.data.employees[0];
		expect(row?.employeeId).toBe(employeeId);
		expect(row?.hoursWorked).toBe(8);
		expect(row?.lunchBreakAutoDeductedDays).toBe(0);
		expect(row?.lunchBreakAutoDeductedMinutes).toBe(0);
		expect(row?.warnings.some((warning) => warning.type === 'LUNCH_BREAK_AUTO_DEDUCTED')).toBe(
			false,
		);
	});

	it('blocks /payroll/process when overtimeEnforcement is BLOCK and there are error warnings', async () => {
		dbState.organizationId = 'org-2';
		dbState.payrollSettings = [
			{
				organizationId: dbState.organizationId,
				overtimeEnforcement: 'BLOCK',
				weekStartDay: 1,
				additionalMandatoryRestDays: [],
				timeZone,
			},
		];

		const employeeId = 'emp-3';
		dbState.employees = [
			{
				id: employeeId,
				firstName: 'Ada',
				lastName: 'Lovelace',
				dailyPay: 800,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				organizationId: dbState.organizationId,
				lastPayrollDate: null,
			},
		];

		dbState.attendanceRecords = createAttendancePair(
			employeeId,
			getUtcDateForZonedTime('2025-01-02', 8, 0, timeZone),
			getUtcDateForZonedTime('2025-01-02', 20, 0, timeZone),
		);

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey: '2025-01-02',
				periodEndDateKey: '2025-01-02',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(400);
		expect(dbState.transactionCalled).toBe(false);
	});

	it('persists a payroll run and updates employee lastPayrollDate in /payroll/process', async () => {
		dbState.organizationId = 'org-3';
		dbState.payrollSettings = [
			{
				organizationId: dbState.organizationId,
				overtimeEnforcement: 'WARN',
				weekStartDay: 1,
				additionalMandatoryRestDays: [],
				timeZone,
			},
		];

		const employeeId = 'emp-4';
		dbState.employees = [
			{
				id: employeeId,
				firstName: 'Ada',
				lastName: 'Lovelace',
				dailyPay: 800,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				organizationId: dbState.organizationId,
				lastPayrollDate: null,
			},
		];

		const periodStartDateKey = '2025-01-06';
		const periodEndDateKey = '2025-01-06';
		const periodBounds = getPayrollPeriodBounds({
			periodStartDateKey,
			periodEndDateKey,
			timeZone,
		});

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey,
				periodEndDateKey,
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(200);
		expect(dbState.transactionCalled).toBe(true);
		expect(dbState.payrollRuns).toHaveLength(1);
		expect(dbState.payrollRunEmployees).toHaveLength(1);

		const employeeAfter = dbState.employees[0];
		expect(employeeAfter?.lastPayrollDate?.getTime()).toBe(
			periodBounds.periodEndInclusiveUtc.getTime(),
		);
	});

	it('persists enough period-10 data to validate the AET TDD lista de raya', async () => {
		seedAetP10ProcessScenario();

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey: AET_P10_2026_PERIOD.periodStartDateKey,
				periodEndDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
				paymentFrequency: AET_P10_2026_PERIOD.paymentFrequency,
			}),
		);

		expect(response.status).toBe(200);
		expect(dbState.payrollRunEmployees).toHaveLength(
			AET_P10_TDD_LISTA_RAYA_EXPECTED.employeeCount,
		);

		const persistedRows = dbState.payrollRunEmployees as PersistedPayrollRunEmployee[];
		const fiscalGrossTotal = sumCurrency(persistedRows.map((row) => row.taxBreakdown.grossPay));
		const fiscalVoucherDeductionsTotal = sumCurrency(
			persistedRows.map(calculatePersistedFiscalVoucherDeductions),
		);
		const fiscalNetPayTotal = roundCurrency(fiscalGrossTotal - fiscalVoucherDeductionsTotal);
		const employerCostsTotal = sumCurrency(
			persistedRows.map((row) => row.taxBreakdown.employerCosts.total),
		);
		const realNetPayTotal = sumCurrency(persistedRows.map((row) => row.taxBreakdown.netPay));

		expectCurrencyClose(
			fiscalGrossTotal,
			AET_P10_TDD_LISTA_RAYA_EXPECTED.fiscalGrossTotal,
			0.01,
		);
		expectCurrencyClose(
			fiscalVoucherDeductionsTotal,
			AET_P10_TDD_LISTA_RAYA_EXPECTED.fiscalVoucherDeductionsTotal,
		);
		expectCurrencyClose(fiscalNetPayTotal, AET_P10_TDD_LISTA_RAYA_EXPECTED.fiscalNetPayTotal);
		expectCurrencyClose(
			employerCostsTotal,
			AET_P10_TDD_LISTA_RAYA_EXPECTED.employerCostsTotal,
			0.01,
		);
		expectCurrencyClose(realNetPayTotal, AET_P10_TDD_LISTA_RAYA_EXPECTED.realNetPayTotal);
	});

	it('prepares fiscal vouchers from processed payroll rows and lists readiness issues', async () => {
		seedAetP10ProcessScenario();
		dbState.sessionRole = 'admin';

		const { payrollRoutes } = await import('./payroll.js');
		const processResponse = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey: AET_P10_2026_PERIOD.periodStartDateKey,
				periodEndDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
				paymentFrequency: AET_P10_2026_PERIOD.paymentFrequency,
			}),
		);
		expect(processResponse.status).toBe(200);

		const runId = dbState.payrollRuns[0]?.id;
		if (typeof runId !== 'string') {
			throw new Error('Expected persisted payroll run id.');
		}

		const prepareResponse = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/prepare`, {
				paymentDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
			}),
		);
		expect(prepareResponse.status).toBe(200);
		const prepareJson = (await prepareResponse.json()) as {
			data?: {
				statusSummary?: {
					total: number;
					blocked: number;
					ready: number;
					stamped: number;
					failed: number;
					cancelled: number;
				};
				vouchers?: Array<{
					status: string;
					voucher: {
						periodStartDateKey: string;
						periodEndDateKey: string;
						paymentDateKey: string | null;
						totals: {
							totalPerceptions: number;
							totalDeductions: number;
							totalOtherPayments: number;
							netPay: number;
						};
					};
					validationErrors: Array<{ code: string }>;
				}>;
			};
		};

		expect(prepareJson.data?.statusSummary).toEqual({
			total: AET_P10_TDD_LISTA_RAYA_EXPECTED.employeeCount,
			blocked: AET_P10_TDD_LISTA_RAYA_EXPECTED.employeeCount,
			ready: 0,
			stamped: 0,
			failed: 0,
			cancelled: 0,
		});
		expect(dbState.payrollFiscalVouchers).toHaveLength(
			AET_P10_TDD_LISTA_RAYA_EXPECTED.employeeCount,
		);

		const vouchers = prepareJson.data?.vouchers ?? [];
		expect(vouchers[0]?.voucher.periodStartDateKey).toBe(
			AET_P10_2026_PERIOD.periodStartDateKey,
		);
		expect(vouchers[0]?.voucher.periodEndDateKey).toBe(AET_P10_2026_PERIOD.periodEndDateKey);
		expect(vouchers[0]?.voucher.paymentDateKey).toBe(AET_P10_2026_PERIOD.periodEndDateKey);
		const fiscalGrossTotal = sumCurrency(
			vouchers.map((row) => row.voucher.totals.totalPerceptions),
		);
		const fiscalNetDeductionsTotal = sumCurrency(
			vouchers.map((row) =>
				roundCurrency(
					row.voucher.totals.totalDeductions - row.voucher.totals.totalOtherPayments,
				),
			),
		);
		const fiscalNetPayTotal = sumCurrency(vouchers.map((row) => row.voucher.totals.netPay));
		const fiscalTechnicalOtherPaymentsTotal = sumCurrency(
			vouchers.map((row) => row.voucher.totals.totalOtherPayments),
		);

		expectCurrencyClose(
			fiscalGrossTotal,
			AET_P10_TDD_LISTA_RAYA_EXPECTED.fiscalGrossTotal,
			0.01,
		);
		expectCurrencyClose(
			fiscalNetDeductionsTotal,
			roundCurrency(
				AET_P10_TDD_LISTA_RAYA_EXPECTED.fiscalVoucherDeductionsTotal -
					fiscalTechnicalOtherPaymentsTotal,
			),
		);
		expectCurrencyClose(
			fiscalNetPayTotal,
			roundCurrency(
				AET_P10_TDD_LISTA_RAYA_EXPECTED.fiscalNetPayTotal +
					fiscalTechnicalOtherPaymentsTotal,
			),
		);
		expect(vouchers[0]?.validationErrors.map((error) => error.code)).toContain(
			'ISSUER_RFC_REQUIRED',
		);
		expect(vouchers[0]?.validationErrors.map((error) => error.code)).toContain(
			'RECEIVER_CURP_REQUIRED',
		);

		const listResponse = await payrollRoutes.handle(
			createApiKeyJsonGetRequest(`/payroll/runs/${runId}/fiscal-vouchers`),
		);
		const listJson = (await listResponse.json()) as {
			data?: {
				statusSummary?: {
					total: number;
					blocked: number;
					ready: number;
					stamped: number;
					failed: number;
					cancelled: number;
				};
				vouchers?: unknown[];
			};
		};

		expect(listResponse.status).toBe(200);
		expect(listJson.data?.vouchers).toHaveLength(AET_P10_TDD_LISTA_RAYA_EXPECTED.employeeCount);
		expect(listJson.data?.statusSummary).toEqual(prepareJson.data?.statusSummary);

		dbState.transactionCalled = false;
		const repeatPrepareResponse = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/prepare`, {
				paymentDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
			}),
		);
		expect(repeatPrepareResponse.status).toBe(200);
		expect(dbState.transactionCalled).toBe(true);
		expect(dbState.payrollFiscalVouchers).toHaveLength(
			AET_P10_TDD_LISTA_RAYA_EXPECTED.employeeCount,
		);
	});

	it('requires an explicit fiscal voucher payment date when preparing vouchers', async () => {
		seedAetP10ProcessScenario();
		dbState.sessionRole = 'admin';

		const { payrollRoutes } = await import('./payroll.js');
		const processResponse = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey: AET_P10_2026_PERIOD.periodStartDateKey,
				periodEndDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
				paymentFrequency: AET_P10_2026_PERIOD.paymentFrequency,
			}),
		);
		expect(processResponse.status).toBe(200);

		const runId = dbState.payrollRuns[0]?.id;
		if (typeof runId !== 'string') {
			throw new Error('Expected persisted payroll run id.');
		}

		const response = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/prepare`, {}),
		);
		const json = (await response.json()) as {
			data?: {
				vouchers?: Array<{
					validationErrors: Array<{ code: string }>;
					voucher: { paymentDateKey: string | null };
				}>;
			};
		};

		expect(response.status).toBe(200);
		expect(json.data?.vouchers?.[0]?.voucher.paymentDateKey).toBeNull();
		expect(json.data?.vouchers?.[0]?.validationErrors.map((error) => error.code)).toContain(
			'PAYMENT_DATE_REQUIRED',
		);
	});

	it('accepts fiscal voucher preparation without a request body for existing clients', async () => {
		seedAetP10ProcessScenario();
		dbState.sessionRole = 'admin';

		const { payrollRoutes } = await import('./payroll.js');
		const processResponse = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey: AET_P10_2026_PERIOD.periodStartDateKey,
				periodEndDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
				paymentFrequency: AET_P10_2026_PERIOD.paymentFrequency,
			}),
		);
		expect(processResponse.status).toBe(200);

		const runId = dbState.payrollRuns[0]?.id;
		if (typeof runId !== 'string') {
			throw new Error('Expected persisted payroll run id.');
		}

		const response = await payrollRoutes.handle(
			createApiKeyEmptyPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/prepare`),
		);
		const json = (await response.json()) as {
			data?: {
				vouchers?: Array<{
					validationErrors: Array<{ code: string }>;
					voucher: { paymentDateKey: string | null };
				}>;
			};
		};

		expect(response.status).toBe(200);
		expect(json.data?.vouchers?.[0]?.voucher.paymentDateKey).toBeNull();
		expect(json.data?.vouchers?.[0]?.validationErrors.map((error) => error.code)).toContain(
			'PAYMENT_DATE_REQUIRED',
		);
	});

	it('updates existing prepared fiscal vouchers when a payment date is provided later', async () => {
		seedAetP10ProcessScenario();
		dbState.sessionRole = 'admin';

		const { payrollRoutes } = await import('./payroll.js');
		const processResponse = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey: AET_P10_2026_PERIOD.periodStartDateKey,
				periodEndDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
				paymentFrequency: AET_P10_2026_PERIOD.paymentFrequency,
			}),
		);
		expect(processResponse.status).toBe(200);

		const runId = dbState.payrollRuns[0]?.id;
		if (typeof runId !== 'string') {
			throw new Error('Expected persisted payroll run id.');
		}

		const initialResponse = await payrollRoutes.handle(
			createApiKeyEmptyPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/prepare`),
		);
		expect(initialResponse.status).toBe(200);
		expect(dbState.payrollFiscalVouchers).toHaveLength(
			AET_P10_TDD_LISTA_RAYA_EXPECTED.employeeCount,
		);

		const response = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/prepare`, {
				paymentDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
			}),
		);
		const json = (await response.json()) as {
			data?: {
				vouchers?: Array<{
					validationErrors: Array<{ code: string }>;
					voucher: { paymentDateKey: string | null };
				}>;
			};
		};

		expect(response.status).toBe(200);
		expect(json.data?.vouchers?.[0]?.voucher.paymentDateKey).toBe(
			AET_P10_2026_PERIOD.periodEndDateKey,
		);
		expect(json.data?.vouchers?.[0]?.validationErrors.map((error) => error.code)).not.toContain(
			'PAYMENT_DATE_REQUIRED',
		);
		expect(dbState.payrollFiscalVouchers).toHaveLength(
			AET_P10_TDD_LISTA_RAYA_EXPECTED.employeeCount,
		);
	});

	it('updates payment date for existing fiscal vouchers with one bulk update', async () => {
		seedAetP10ProcessScenario();
		dbState.sessionRole = 'admin';

		const { payrollRoutes } = await import('./payroll.js');
		const processResponse = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey: AET_P10_2026_PERIOD.periodStartDateKey,
				periodEndDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
				paymentFrequency: AET_P10_2026_PERIOD.paymentFrequency,
			}),
		);
		expect(processResponse.status).toBe(200);

		const runId = dbState.payrollRuns[0]?.id;
		if (typeof runId !== 'string') {
			throw new Error('Expected persisted payroll run id.');
		}

		const initialResponse = await payrollRoutes.handle(
			createApiKeyEmptyPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/prepare`),
		);
		expect(initialResponse.status).toBe(200);
		dbState.payrollFiscalVoucherUpdateCount = 0;

		const response = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/prepare`, {
				paymentDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
			}),
		);

		expect(response.status).toBe(200);
		expect(dbState.payrollFiscalVoucherUpdateCount).toBe(1);
	});

	it('updates payment date when a concurrent bodyless prepare wins the insert race', async () => {
		seedAetP10ProcessScenario();
		dbState.sessionRole = 'admin';

		const { payrollRoutes } = await import('./payroll.js');
		const processResponse = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey: AET_P10_2026_PERIOD.periodStartDateKey,
				periodEndDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
				paymentFrequency: AET_P10_2026_PERIOD.paymentFrequency,
			}),
		);
		expect(processResponse.status).toBe(200);

		const runId = dbState.payrollRuns[0]?.id;
		if (typeof runId !== 'string') {
			throw new Error('Expected persisted payroll run id.');
		}

		dbState.pendingBodylessFiscalVoucherConflictOnNextInsert = true;
		const response = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/prepare`, {
				paymentDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
			}),
		);
		const json = (await response.json()) as {
			data?: {
				vouchers?: Array<{
					validationErrors: Array<{ code: string }>;
					voucher: { paymentDateKey: string | null };
				}>;
			};
		};

		expect(response.status).toBe(200);
		expect(json.data?.vouchers?.[0]?.voucher.paymentDateKey).toBe(
			AET_P10_2026_PERIOD.periodEndDateKey,
		);
		expect(json.data?.vouchers?.[0]?.validationErrors.map((error) => error.code)).not.toContain(
			'PAYMENT_DATE_REQUIRED',
		);
		expect(dbState.payrollFiscalVouchers).toHaveLength(
			AET_P10_TDD_LISTA_RAYA_EXPECTED.employeeCount,
		);
	});

	it('does not update a fiscal voucher stamped between read and payment-date update', async () => {
		seedAetP10ProcessScenario();
		dbState.sessionRole = 'admin';

		const { payrollRoutes } = await import('./payroll.js');
		const processResponse = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey: AET_P10_2026_PERIOD.periodStartDateKey,
				periodEndDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
				paymentFrequency: AET_P10_2026_PERIOD.paymentFrequency,
			}),
		);
		expect(processResponse.status).toBe(200);

		const runId = dbState.payrollRuns[0]?.id;
		if (typeof runId !== 'string') {
			throw new Error('Expected persisted payroll run id.');
		}

		const initialResponse = await payrollRoutes.handle(
			createApiKeyEmptyPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/prepare`),
		);
		expect(initialResponse.status).toBe(200);

		dbState.pendingFiscalVoucherStampBeforeUpdate = true;
		const response = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/prepare`, {
				paymentDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
			}),
		);
		const json = (await response.json()) as {
			data?: {
				vouchers?: Array<{
					uuid: string | null;
					stampedAt: string | null;
					validationErrors: Array<{ code: string }>;
					voucher: { paymentDateKey: string | null };
				}>;
			};
		};

		expect(response.status).toBe(200);
		expect(json.data?.vouchers?.[0]?.uuid).toBe('concurrent-stamp-uuid');
		expect(json.data?.vouchers?.[0]?.stampedAt).not.toBeNull();
		expect(json.data?.vouchers?.[0]?.voucher.paymentDateKey).toBeNull();
		expect(json.data?.vouchers?.[0]?.validationErrors.map((error) => error.code)).toContain(
			'PAYMENT_DATE_REQUIRED',
		);
	});

	it('normalizes legacy informational lines before building fiscal vouchers', async () => {
		seedAetP10ProcessScenario();
		dbState.sessionRole = 'admin';

		const { payrollRoutes } = await import('./payroll.js');
		const processResponse = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey: AET_P10_2026_PERIOD.periodStartDateKey,
				periodEndDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
				paymentFrequency: AET_P10_2026_PERIOD.paymentFrequency,
			}),
		);
		expect(processResponse.status).toBe(200);

		const runId = dbState.payrollRuns[0]?.id;
		const payrollRunEmployee = dbState.payrollRunEmployees[0];
		if (typeof runId !== 'string' || !payrollRunEmployee) {
			throw new Error('Expected persisted payroll data.');
		}

		const taxBreakdown = payrollRunEmployee.taxBreakdown as Record<string, unknown>;
		taxBreakdown.informationalLines = {
			isrBeforeSubsidy: 123.34,
			subsidyApplied: 123.34,
		};

		const response = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/prepare`, {
				paymentDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
			}),
		);
		const json = (await response.json()) as {
			data?: {
				vouchers?: Array<{
					voucher: {
						otherPayments: Array<{
							amount: number;
							subsidyCausedAmount: number;
						}>;
					};
				}>;
			};
		};

		expect(response.status).toBe(200);
		expect(json.data?.vouchers?.[0]?.voucher.otherPayments[0]).toMatchObject({
			amount: 0,
			subsidyCausedAmount: 123.34,
		});
	});

	it('blocks fiscal vouchers when informational lines cannot be normalized', async () => {
		seedAetP10ProcessScenario();
		dbState.sessionRole = 'admin';

		const { payrollRoutes } = await import('./payroll.js');
		const processResponse = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey: AET_P10_2026_PERIOD.periodStartDateKey,
				periodEndDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
				paymentFrequency: AET_P10_2026_PERIOD.paymentFrequency,
			}),
		);
		expect(processResponse.status).toBe(200);

		const runId = dbState.payrollRuns[0]?.id;
		const payrollRunEmployee = dbState.payrollRunEmployees[0];
		if (typeof runId !== 'string' || !payrollRunEmployee) {
			throw new Error('Expected persisted payroll data.');
		}

		const taxBreakdown = payrollRunEmployee.taxBreakdown as Record<string, unknown>;
		taxBreakdown.informationalLines = {
			isrBeforeSubsidy: 123.34,
			subsidyApplied: 'invalid',
		};

		const response = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/prepare`, {
				paymentDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
			}),
		);
		const json = (await response.json()) as {
			data?: {
				vouchers?: Array<{
					status: string;
					validationErrors: Array<{ code: string }>;
				}>;
			};
		};

		expect(response.status).toBe(200);
		expect(json.data?.vouchers?.[0]?.status).toBe('BLOCKED');
		expect(json.data?.vouchers?.[0]?.validationErrors.map((error) => error.code)).toContain(
			'INFORMATIONAL_LINES_INVALID',
		);
	});

	it('blocks fiscal vouchers when persisted deduction JSONB is corrupt', async () => {
		seedAetP10ProcessScenario();
		dbState.sessionRole = 'admin';

		const { payrollRoutes } = await import('./payroll.js');
		const processResponse = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey: AET_P10_2026_PERIOD.periodStartDateKey,
				periodEndDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
				paymentFrequency: AET_P10_2026_PERIOD.paymentFrequency,
			}),
		);
		expect(processResponse.status).toBe(200);

		const runId = dbState.payrollRuns[0]?.id;
		const payrollRunEmployee = dbState.payrollRunEmployees[0];
		if (typeof runId !== 'string' || !payrollRunEmployee) {
			throw new Error('Expected persisted payroll data.');
		}

		payrollRunEmployee.deductionsBreakdown = [
			{
				deductionId: 'deduction-valid',
				type: 'LOAN',
				label: 'Prestamo interno',
				appliedAmount: 10,
				satDeductionCode: '004',
			},
			{
				deductionId: 'deduction-corrupt',
				type: 'LOAN',
				label: 'Prestamo corrupto',
				appliedAmount: 'not-a-number',
				satDeductionCode: '004',
			},
		];

		const response = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/prepare`, {
				paymentDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
			}),
		);
		const json = (await response.json()) as {
			data?: {
				vouchers?: Array<{
					status: string;
					validationErrors: Array<{ code: string }>;
					voucher: {
						deductions: Array<{ internalCode: string }>;
						unmappedDeductions: Array<{ internalCode: string }>;
					};
				}>;
			};
		};

		expect(response.status).toBe(200);
		expect(json.data?.vouchers?.[0]?.status).toBe('BLOCKED');
		expect(json.data?.vouchers?.[0]?.validationErrors.map((error) => error.code)).toContain(
			'DEDUCTION_BREAKDOWN_INVALID',
		);
		expect(
			json.data?.vouchers?.[0]?.voucher.deductions.map((deduction) => deduction.internalCode),
		).not.toContain('deduction-valid');
		expect(json.data?.vouchers?.[0]?.voucher.unmappedDeductions).toHaveLength(0);
	});

	it('blocks fiscal vouchers when persisted employee withholdings JSONB is corrupt', async () => {
		seedAetP10ProcessScenario();
		dbState.sessionRole = 'admin';

		const { payrollRoutes } = await import('./payroll.js');
		const processResponse = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey: AET_P10_2026_PERIOD.periodStartDateKey,
				periodEndDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
				paymentFrequency: AET_P10_2026_PERIOD.paymentFrequency,
			}),
		);
		expect(processResponse.status).toBe(200);

		const runId = dbState.payrollRuns[0]?.id;
		const payrollRunEmployee = dbState.payrollRunEmployees[0];
		if (typeof runId !== 'string' || !payrollRunEmployee) {
			throw new Error('Expected persisted payroll data.');
		}

		const taxBreakdown = payrollRunEmployee.taxBreakdown as Record<string, unknown>;
		taxBreakdown.employeeWithholdings = {};

		const response = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/prepare`, {
				paymentDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
			}),
		);
		const json = (await response.json()) as {
			data?: {
				vouchers?: Array<{
					status: string;
					validationErrors: Array<{ code: string }>;
				}>;
			};
		};

		expect(response.status).toBe(200);
		expect(json.data?.vouchers?.[0]?.status).toBe('BLOCKED');
		expect(json.data?.vouchers?.[0]?.validationErrors.map((error) => error.code)).toContain(
			'EMPLOYEE_WITHHOLDINGS_INVALID',
		);
	});

	it('blocks fiscal vouchers when persisted employee withholdings JSONB is not an object', async () => {
		seedAetP10ProcessScenario();
		dbState.sessionRole = 'admin';

		const { payrollRoutes } = await import('./payroll.js');
		const processResponse = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey: AET_P10_2026_PERIOD.periodStartDateKey,
				periodEndDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
				paymentFrequency: AET_P10_2026_PERIOD.paymentFrequency,
			}),
		);
		expect(processResponse.status).toBe(200);

		const runId = dbState.payrollRuns[0]?.id;
		const payrollRunEmployee = dbState.payrollRunEmployees[0];
		if (typeof runId !== 'string' || !payrollRunEmployee) {
			throw new Error('Expected persisted payroll data.');
		}

		const taxBreakdown = payrollRunEmployee.taxBreakdown as Record<string, unknown>;
		taxBreakdown.employeeWithholdings = [];

		const response = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/prepare`, {
				paymentDateKey: AET_P10_2026_PERIOD.periodEndDateKey,
			}),
		);
		const json = (await response.json()) as {
			data?: {
				vouchers?: Array<{
					status: string;
					validationErrors: Array<{ code: string }>;
				}>;
			};
		};

		expect(response.status).toBe(200);
		expect(json.data?.vouchers?.[0]?.status).toBe('BLOCKED');
		expect(json.data?.vouchers?.[0]?.validationErrors.map((error) => error.code)).toContain(
			'EMPLOYEE_WITHHOLDINGS_INVALID',
		);
	});

	it('returns a blocked XML artifact summary without XML when Phase 3 voucher fields are missing', async () => {
		dbState.sessionRole = 'admin';
		dbState.payrollRuns = [
			{
				id: 'processed-run-xml-1',
				organizationId: dbState.organizationId,
				status: 'PROCESSED',
				paymentFrequency: 'WEEKLY',
				periodStart: new Date('2026-04-06T06:00:00.000Z'),
				periodEnd: new Date('2026-04-13T05:59:59.999Z'),
			},
		];
		dbState.payrollFiscalVouchers = [
			{
				id: 'voucher-xml-blocked',
				payrollRunId: 'processed-run-xml-1',
				payrollRunEmployeeId: 'run-employee-xml-1',
				organizationId: dbState.organizationId,
				employeeId: 'emp-xml-1',
				status: 'READY_TO_STAMP',
				uuid: null,
				stampedAt: null,
				voucher: {
					issuer: {
						rfc: 'AAA010101AAA',
						name: 'ACME SA DE CV',
						fiscalRegime: '601',
						expeditionPostalCode: '64000',
					},
					receiver: {
						name: 'Ada Lovelace',
						rfc: 'LOAA800101ABC',
						curp: 'LOAA800101MDFABC09',
						nss: '12345678901',
						fiscalRegime: '605',
						fiscalPostalCode: '64000',
						contractType: '01',
						workdayType: '01',
					},
					paymentFrequency: 'WEEKLY',
					periodStartDateKey: '2026-04-06',
					periodEndDateKey: '2026-04-12',
					paymentDateKey: '2026-04-12',
					perceptions: [
						{
							internalType: 'SALARY',
							satTypeCode: '001',
							internalCode: 'SALARY',
							description: 'Sueldo',
							taxedAmount: 1000,
							exemptAmount: 0,
						},
					],
					deductions: [],
					otherPayments: [],
					realPayrollComplementPay: null,
				},
				validationErrors: [],
				validationWarnings: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(
				'/payroll/runs/processed-run-xml-1/fiscal-vouchers/voucher-xml-blocked/xml',
				{ issuedAt: '2026-04-12T12:00:00.000Z' },
			),
		);
		const json = (await response.json()) as {
			data?: {
				artifactId: string | null;
				status: string;
				errors: Array<{ code: string }>;
				xml?: string;
			};
		};

		expect(response.status).toBe(422);
		expect(json.data?.artifactId).toBeNull();
		expect(json.data?.status).toBe('BLOCKED');
		expect(json.data).not.toHaveProperty('xml');
		expect(json.data?.errors.map((error) => error.code)).toContain(
			'XML_EMPLOYMENT_START_DATE_REQUIRED',
		);
		expect(dbState.payrollCfdiXmlArtifacts).toHaveLength(0);
	});

	it('generates XML artifacts idempotently and downloads the newest XML with attachment headers', async () => {
		dbState.sessionRole = 'admin';
		dbState.payrollRuns = [
			{
				id: 'processed-run-xml-2',
				organizationId: dbState.organizationId,
				status: 'PROCESSED',
				paymentFrequency: 'WEEKLY',
				periodStart: new Date('2026-04-06T06:00:00.000Z'),
				periodEnd: new Date('2026-04-13T05:59:59.999Z'),
			},
		];
		dbState.payrollFiscalVouchers = [
			{
				id: 'voucher-xml-valid',
				payrollRunId: 'processed-run-xml-2',
				payrollRunEmployeeId: 'run-employee-xml-2',
				organizationId: dbState.organizationId,
				employeeId: 'emp-xml-2',
				status: 'READY_TO_STAMP',
				uuid: null,
				stampedAt: null,
				voucher: {
					issuer: {
						rfc: 'AAA010101AAA',
						name: 'ACME SA DE CV',
						fiscalRegime: '601',
						expeditionPostalCode: '64000',
						employerRegistration: 'A1234567890',
					},
					receiver: {
						name: 'Ada Lovelace',
						rfc: 'LOAA800101ABC',
						curp: 'LOAA800101MDFABC09',
						nss: '12345678901',
						fiscalRegime: '605',
						fiscalPostalCode: '64000',
						employmentStartDateKey: '2024-01-01',
						contractType: '01',
						unionized: 'No',
						workdayType: '01',
						regimeType: '02',
						employeeNumber: 'EMP-001',
						department: 'Operaciones',
						position: 'Tecnica',
						positionRisk: '1',
						baseContributionSalary: 500,
						integratedDailySalary: 550,
						federalEntity: 'NLE',
					},
					paymentFrequency: '02',
					periodStartDateKey: '2026-04-06',
					periodEndDateKey: '2026-04-12',
					paymentDateKey: '2026-04-12',
					daysPaid: 7,
					perceptions: [
						{
							internalType: 'SALARY',
							satTypeCode: '001',
							internalCode: '001',
							description: 'Sueldo',
							taxedAmount: 1000,
							exemptAmount: 0,
						},
					],
					deductions: [
						{
							internalType: 'ISR',
							satTypeCode: '002',
							internalCode: '002',
							description: 'ISR',
							amount: 100,
						},
					],
					otherPayments: [],
				},
				validationErrors: [],
				validationWarnings: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];

		const { payrollRoutes } = await import('./payroll.js');
		const firstResponse = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(
				'/payroll/runs/processed-run-xml-2/fiscal-vouchers/voucher-xml-valid/xml',
				{ issuedAt: '2026-04-12T12:00:00.000Z' },
			),
		);
		const firstJson = (await firstResponse.json()) as {
			data?: {
				artifactId: string | null;
				xmlHash: string | null;
				status: string;
				xml?: string;
			};
		};

		expect(firstResponse.status).toBe(200);
		expect(typeof firstJson.data?.artifactId).toBe('string');
		expect(firstJson.data?.status).toBe('VALID');
		expect(firstJson.data).not.toHaveProperty('xml');
		expect(dbState.payrollCfdiXmlArtifacts).toHaveLength(1);

		const secondResponse = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(
				'/payroll/runs/processed-run-xml-2/fiscal-vouchers/voucher-xml-valid/xml',
				{ issuedAt: '2026-04-12T12:00:00.000Z' },
			),
		);
		const secondJson = (await secondResponse.json()) as {
			data?: { artifactId: string | null; xmlHash: string | null; xml?: string };
		};

		expect(secondResponse.status).toBe(200);
		expect(secondJson.data?.artifactId).toBe(firstJson.data?.artifactId);
		expect(secondJson.data?.xmlHash).toBe(firstJson.data?.xmlHash);
		expect(secondJson.data).not.toHaveProperty('xml');
		expect(dbState.payrollCfdiXmlArtifacts).toHaveLength(1);

		const downloadResponse = await payrollRoutes.handle(
			createApiKeyJsonGetRequest(
				'/payroll/runs/processed-run-xml-2/fiscal-vouchers/voucher-xml-valid/xml',
			),
		);

		expect(downloadResponse.status).toBe(200);
		expect(downloadResponse.headers.get('content-type')).toBe('application/xml; charset=utf-8');
		expect(downloadResponse.headers.get('cache-control')).toBe('no-store');
		expect(downloadResponse.headers.get('content-disposition')).toContain(
			'voucher-xml-valid-XML_WITHOUT_SEAL.xml',
		);
		expect(await downloadResponse.text()).toContain('<cfdi:Comprobante');
	});

	it('force-regenerates XML by replacing the existing unstamped voucher artifact even when the snapshot hash changes', async () => {
		const { runId, voucherId } = seedValidPayrollCfdiXmlScenario({
			runId: 'processed-run-xml-force',
			voucherId: 'voucher-xml-force',
		});

		const { payrollRoutes } = await import('./payroll.js');
		const firstResponse = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/${voucherId}/xml`, {
				issuedAt: '2026-04-12T12:00:00.000Z',
			}),
		);
		const firstJson = (await firstResponse.json()) as {
			data?: { artifactId: string | null; xmlHash: string | null };
		};
		const voucher = dbState.payrollFiscalVouchers[0]?.voucher as Record<string, unknown>;
		const receiver = voucher.receiver as Record<string, unknown>;
		receiver.department = 'Finanzas';

		const forceResponse = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/${voucherId}/xml`, {
				issuedAt: '2026-04-12T12:00:00.000Z',
				forceRegenerate: true,
			}),
		);
		const forceJson = (await forceResponse.json()) as {
			data?: { artifactId: string | null; xmlHash: string | null };
		};

		expect(firstResponse.status).toBe(200);
		expect(forceResponse.status).toBe(200);
		expect(forceJson.data?.artifactId).toBe(firstJson.data?.artifactId);
		expect(forceJson.data?.xmlHash).not.toBe(firstJson.data?.xmlHash);
		expect(dbState.payrollCfdiXmlArtifacts).toHaveLength(1);
		expect(dbState.payrollCfdiXmlArtifacts[0]?.xml).toContain('Departamento="Finanzas"');
	});

	it('blocks forced XML regeneration for stamped vouchers instead of reusing an existing artifact', async () => {
		const { runId, voucherId } = seedValidPayrollCfdiXmlScenario({
			runId: 'processed-run-xml-stamped-force',
			voucherId: 'voucher-xml-stamped-force',
		});

		const { payrollRoutes } = await import('./payroll.js');
		const firstResponse = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/${voucherId}/xml`, {
				issuedAt: '2026-04-12T12:00:00.000Z',
			}),
		);
		const voucher = dbState.payrollFiscalVouchers[0];
		if (!voucher) {
			throw new Error('Expected seeded fiscal voucher.');
		}
		voucher.status = 'STAMPED';
		voucher.uuid = 'stamped-uuid-1';
		voucher.stampedAt = new Date('2026-04-12T13:00:00.000Z');

		const forceResponse = await payrollRoutes.handle(
			createApiKeyJsonPostRequest(`/payroll/runs/${runId}/fiscal-vouchers/${voucherId}/xml`, {
				issuedAt: '2026-04-12T12:00:00.000Z',
				forceRegenerate: true,
			}),
		);
		const json = (await forceResponse.json()) as { error?: { message?: string } };

		expect(firstResponse.status).toBe(200);
		expect(forceResponse.status).toBe(409);
		expect(json.error?.message).toBe('Stamped fiscal vouchers cannot regenerate XML artifacts');
		expect(dbState.payrollCfdiXmlArtifacts).toHaveLength(1);
	});

	it('rejects fiscal voucher preparation for payroll runs that are not processed', async () => {
		dbState.sessionRole = 'admin';
		dbState.payrollRuns = [
			{
				id: 'draft-run-1',
				organizationId: dbState.organizationId,
				status: 'DRAFT',
				paymentFrequency: 'WEEKLY',
				periodStart: new Date('2026-03-02T00:00:00.000Z'),
				periodEnd: new Date('2026-03-08T00:00:00.000Z'),
			},
		];

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createApiKeyJsonPostRequest('/payroll/runs/draft-run-1/fiscal-vouchers/prepare', {}),
		);
		const json = (await response.json()) as { error?: { message?: string } };

		expect(response.status).toBe(409);
		expect(json.error?.message).toBe(
			'Payroll run must be processed before preparing fiscal vouchers',
		);
		expect(dbState.payrollFiscalVouchers).toHaveLength(0);
	});

	it('blocks fiscal voucher access for members without dual-payroll visibility', async () => {
		dbState.payrollRuns = [
			{
				id: 'processed-run-1',
				organizationId: dbState.organizationId,
				status: 'PROCESSED',
				paymentFrequency: 'WEEKLY',
				periodStart: new Date('2026-03-02T00:00:00.000Z'),
				periodEnd: new Date('2026-03-08T00:00:00.000Z'),
			},
		];

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonGetRequest('/payroll/runs/processed-run-1/fiscal-vouchers'),
		);
		const json = (await response.json()) as { error?: { message?: string } };

		expect(response.status).toBe(403);
		expect(json.error?.message).toBe('You do not have access to payroll fiscal vouchers');
	});

	it('does not reveal whether a payroll run exists outside the caller organization', async () => {
		dbState.sessionRole = 'admin';
		dbState.payrollRuns = [
			{
				id: 'foreign-run-1',
				organizationId: 'org-foreign',
				status: 'PROCESSED',
				paymentFrequency: 'WEEKLY',
				periodStart: new Date('2026-03-02T06:00:00.000Z'),
				periodEnd: new Date('2026-03-09T05:59:59.999Z'),
			},
		];

		const { payrollRoutes } = await import('./payroll.js');
		const prepareResponse = await payrollRoutes.handle(
			createApiKeyJsonPostRequest('/payroll/runs/foreign-run-1/fiscal-vouchers/prepare', {
				paymentDateKey: '2026-03-08',
			}),
		);
		const listResponse = await payrollRoutes.handle(
			createApiKeyJsonGetRequest('/payroll/runs/foreign-run-1/fiscal-vouchers'),
		);

		expect(prepareResponse.status).toBe(404);
		expect(listResponse.status).toBe(404);
	});

	it('processes payroll including WORK_OFFSITE and preserves CHECK_OUT_AUTHORIZED paid span behavior', async () => {
		dbState.organizationId = 'org-offsite';
		dbState.payrollSettings = [
			{
				organizationId: dbState.organizationId,
				overtimeEnforcement: 'WARN',
				weekStartDay: 1,
				additionalMandatoryRestDays: [],
				timeZone,
			},
		];

		const offsiteEmployeeId = 'emp-offsite';
		const authorizedEmployeeId = 'emp-authorized';
		dbState.employees = [
			{
				id: offsiteEmployeeId,
				firstName: 'Ofelia',
				lastName: 'Campos',
				dailyPay: 800,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				organizationId: dbState.organizationId,
				lastPayrollDate: null,
			},
			{
				id: authorizedEmployeeId,
				firstName: 'Carlos',
				lastName: 'Ruiz',
				dailyPay: 800,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				organizationId: dbState.organizationId,
				lastPayrollDate: null,
			},
		];

		const payrollDateKey = '2025-01-08';
		dbState.attendanceRecords = [
			{
				employeeId: offsiteEmployeeId,
				timestamp: getUtcDateForZonedMidnight(payrollDateKey, timeZone),
				type: 'WORK_OFFSITE',
				offsiteDateKey: payrollDateKey,
				offsiteDayKind: 'NO_LABORABLE',
			},
			{
				employeeId: authorizedEmployeeId,
				timestamp: getUtcDateForZonedTime(payrollDateKey, 9, 0, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId: authorizedEmployeeId,
				timestamp: getUtcDateForZonedTime(payrollDateKey, 11, 0, timeZone),
				type: 'CHECK_OUT_AUTHORIZED',
			},
			{
				employeeId: authorizedEmployeeId,
				timestamp: getUtcDateForZonedTime(payrollDateKey, 13, 0, timeZone),
				type: 'CHECK_IN',
			},
			{
				employeeId: authorizedEmployeeId,
				timestamp: getUtcDateForZonedTime(payrollDateKey, 18, 0, timeZone),
				type: 'CHECK_OUT',
			},
		];

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey: payrollDateKey,
				periodEndDateKey: payrollDateKey,
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(200);
		expect(dbState.payrollRuns).toHaveLength(1);
		expect(dbState.payrollRunEmployees).toHaveLength(2);

		const json = (await response.json()) as {
			data: {
				calculation: {
					employees: Array<{
						employeeId: string;
						hoursWorked: number;
						normalHours: number;
						mandatoryRestDayPremiumAmount: number;
					}>;
				};
			};
		};

		const offsiteRow = json.data.calculation.employees.find(
			(row) => row.employeeId === offsiteEmployeeId,
		);
		if (!offsiteRow) {
			throw new Error('Expected offsite payroll row.');
		}
		expect(offsiteRow.hoursWorked).toBe(8);
		expect(offsiteRow.normalHours).toBe(8);
		expect(offsiteRow.mandatoryRestDayPremiumAmount).toBe(1600);

		const authorizedRow = json.data.calculation.employees.find(
			(row) => row.employeeId === authorizedEmployeeId,
		);
		if (!authorizedRow) {
			throw new Error('Expected CHECK_OUT_AUTHORIZED payroll row.');
		}
		expect(authorizedRow.hoursWorked).toBe(9);

		const persistedOffsiteRow = dbState.payrollRunEmployees.find(
			(row) => row.employeeId === offsiteEmployeeId,
		);
		expect(persistedOffsiteRow?.normalHours).toBe('8.00');
		expect(persistedOffsiteRow?.mandatoryRestDayPremiumAmount).toBe('1600.00');
	});

	it('adds vacation pay and premium for approved vacation days in /payroll/calculate', async () => {
		dbState.organizationId = 'org-vac';
		dbState.payrollSettings = [
			{
				organizationId: dbState.organizationId,
				overtimeEnforcement: 'WARN',
				weekStartDay: 1,
				additionalMandatoryRestDays: [],
				timeZone,
				vacationPremiumRate: 0.25,
			},
		];

		const employeeId = 'emp-vac';
		dbState.employees = [
			{
				id: employeeId,
				firstName: 'Ada',
				lastName: 'Lovelace',
				dailyPay: 800,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				organizationId: dbState.organizationId,
				lastPayrollDate: null,
			},
		];

		const requestId = 'vac-req-1';
		dbState.vacationRequests = [
			{
				id: requestId,
				organizationId: dbState.organizationId,
				employeeId,
				status: 'APPROVED',
				startDateKey: '2025-01-03',
				endDateKey: '2025-01-03',
			},
		];
		dbState.vacationRequestDays = [
			{
				requestId,
				employeeId,
				dateKey: '2025-01-03',
				countsAsVacationDay: true,
			},
		];

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/calculate', {
				organizationId: dbState.organizationId,
				periodStartDateKey: '2025-01-03',
				periodEndDateKey: '2025-01-03',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			data: {
				employees: {
					employeeId: string;
					vacationDaysPaid: number;
					vacationPayAmount: number;
					vacationPremiumAmount: number;
					totalPay: number;
				}[];
			};
		};

		const row = json.data.employees[0];
		expect(row?.employeeId).toBe(employeeId);
		expect(row?.vacationDaysPaid).toBe(1);
		expect(row?.vacationPayAmount).toBe(800);
		expect(row?.vacationPremiumAmount).toBe(200);
		expect(row?.totalPay).toBe(1000);
	});

	it('adds saturday vacation bonus pay for approved vacation periods spanning saturday in /payroll/calculate', async () => {
		dbState.organizationId = 'org-vac-saturday';
		dbState.payrollSettings = [
			{
				organizationId: dbState.organizationId,
				overtimeEnforcement: 'WARN',
				weekStartDay: 1,
				additionalMandatoryRestDays: [],
				timeZone,
				vacationPremiumRate: 0.25,
				countSaturdayAsWorkedForSeventhDay: true,
			},
		];

		const employeeId = 'emp-vac-saturday';
		dbState.employees = [
			{
				id: employeeId,
				firstName: 'Ada',
				lastName: 'Lovelace',
				dailyPay: 800,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				organizationId: dbState.organizationId,
				lastPayrollDate: null,
			},
		];
		dbState.schedules = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
			employeeId,
			dayOfWeek,
			startTime: '09:00',
			endTime: '17:00',
			isWorkingDay: true,
		}));

		const requestId = 'vac-req-saturday-1';
		dbState.vacationRequests = [
			{
				id: requestId,
				organizationId: dbState.organizationId,
				employeeId,
				status: 'APPROVED',
				startDateKey: '2025-12-19',
				endDateKey: '2025-12-22',
			},
		];
		dbState.vacationRequestDays = [
			{
				requestId,
				employeeId,
				dateKey: '2025-12-19',
				countsAsVacationDay: true,
			},
			{
				requestId,
				employeeId,
				dateKey: '2025-12-22',
				countsAsVacationDay: true,
			},
		];

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/calculate', {
				organizationId: dbState.organizationId,
				periodStartDateKey: '2025-12-15',
				periodEndDateKey: '2025-12-21',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			data: {
				employees: {
					employeeId: string;
					vacationDaysPaid: number;
					vacationPayAmount: number;
					vacationPremiumAmount: number;
					totalPay: number;
					grossPay: number;
				}[];
			};
		};

		const row = json.data.employees[0];
		expect(row?.employeeId).toBe(employeeId);
		expect(row?.vacationDaysPaid).toBe(1);
		expect(row?.vacationPayAmount).toBe(800);
		expect(row?.vacationPremiumAmount).toBe(200);
		expect(row?.totalPay).toBe(1800);
		expect(row?.grossPay).toBe(1800);
	});

	it('exposes assumed attendance date keys after the Friday payroll cutoff in /payroll/calculate', async () => {
		setSystemTime(new Date('2026-04-24T16:00:00.000Z'));
		dbState.organizationId = 'org-cutoff-assumed';
		dbState.payrollSettings = [
			{
				organizationId: dbState.organizationId,
				overtimeEnforcement: 'WARN',
				weekStartDay: 1,
				additionalMandatoryRestDays: [],
				timeZone,
				vacationPremiumRate: 0.25,
			},
		];

		const employeeId = 'emp-cutoff-assumed';
		const inactiveEmployeeId = 'emp-cutoff-inactive';
		dbState.employees = [
			{
				id: employeeId,
				firstName: 'Carlos',
				lastName: 'Corte',
				dailyPay: 800,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				organizationId: dbState.organizationId,
				lastPayrollDate: null,
				status: 'ACTIVE',
			},
			{
				id: inactiveEmployeeId,
				firstName: 'Iris',
				lastName: 'Inactiva',
				dailyPay: 800,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				organizationId: dbState.organizationId,
				lastPayrollDate: null,
				status: 'INACTIVE',
			},
		];
		dbState.schedules = [employeeId, inactiveEmployeeId].flatMap((scheduledEmployeeId) =>
			[1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
				employeeId: scheduledEmployeeId,
				dayOfWeek,
				startTime: '09:00',
				endTime: '17:00',
				isWorkingDay: true,
			})),
		);
		dbState.attendanceRecords = buildAttendanceRowsForDateKeys(
			employeeId,
			['2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23'],
			timeZone,
		);

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/calculate', {
				organizationId: dbState.organizationId,
				periodStartDateKey: '2026-04-20',
				periodEndDateKey: '2026-04-26',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			data: {
				employees: {
					employeeId: string;
					assumedAttendanceDateKeys: string[];
					hoursWorked: number;
					normalHours: number;
				}[];
			};
		};

		const row = json.data.employees[0];
		expect(row?.employeeId).toBe(employeeId);
		expect(row?.assumedAttendanceDateKeys).toEqual(['2026-04-24', '2026-04-25']);
		expect(row?.hoursWorked).toBe(48);
		expect(row?.normalHours).toBe(48);
		const inactiveRow = json.data.employees.find(
			(employeeRow) => employeeRow.employeeId === inactiveEmployeeId,
		);
		expect(inactiveRow?.assumedAttendanceDateKeys).toEqual([]);
		expect(inactiveRow?.hoursWorked).toBe(0);
		expect(inactiveRow?.normalHours).toBe(0);
	});

	it('does not add saturday vacation bonus pay when the approved request has no payable vacation days', async () => {
		dbState.organizationId = 'org-vac-saturday-non-payable';
		dbState.payrollSettings = [
			{
				organizationId: dbState.organizationId,
				overtimeEnforcement: 'WARN',
				weekStartDay: 1,
				additionalMandatoryRestDays: [],
				timeZone,
				vacationPremiumRate: 0.25,
				countSaturdayAsWorkedForSeventhDay: true,
			},
		];

		const employeeId = 'emp-vac-saturday-non-payable';
		dbState.employees = [
			{
				id: employeeId,
				firstName: 'Ada',
				lastName: 'Lovelace',
				dailyPay: 800,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				organizationId: dbState.organizationId,
				lastPayrollDate: null,
			},
		];
		dbState.schedules = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
			employeeId,
			dayOfWeek,
			startTime: '09:00',
			endTime: '17:00',
			isWorkingDay: true,
		}));

		const requestId = 'vac-req-saturday-non-payable-1';
		dbState.vacationRequests = [
			{
				id: requestId,
				organizationId: dbState.organizationId,
				employeeId,
				status: 'APPROVED',
				startDateKey: '2025-12-20',
				endDateKey: '2025-12-21',
			},
		];
		dbState.vacationRequestDays = [
			{
				requestId,
				employeeId,
				dateKey: '2025-12-20',
				countsAsVacationDay: false,
			},
			{
				requestId,
				employeeId,
				dateKey: '2025-12-21',
				countsAsVacationDay: false,
			},
		];

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/calculate', {
				organizationId: dbState.organizationId,
				periodStartDateKey: '2025-12-15',
				periodEndDateKey: '2025-12-21',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			data: {
				employees: {
					employeeId: string;
					vacationDaysPaid: number;
					vacationPayAmount: number;
					vacationPremiumAmount: number;
					totalPay: number;
					grossPay: number;
				}[];
			};
		};

		const row = json.data.employees[0];
		expect(row?.employeeId).toBe(employeeId);
		expect(row?.vacationDaysPaid).toBe(0);
		expect(row?.vacationPayAmount).toBe(0);
		expect(row?.vacationPremiumAmount).toBe(0);
		expect(row?.totalPay).toBe(0);
		expect(row?.grossPay).toBe(0);
	});

	it('does not add saturday vacation bonus pay when payable vacation days fall outside the payroll period', async () => {
		dbState.organizationId = 'org-vac-saturday-outside-period';
		dbState.payrollSettings = [
			{
				organizationId: dbState.organizationId,
				overtimeEnforcement: 'WARN',
				weekStartDay: 1,
				additionalMandatoryRestDays: [],
				timeZone,
				vacationPremiumRate: 0.25,
				countSaturdayAsWorkedForSeventhDay: true,
			},
		];

		const employeeId = 'emp-vac-saturday-outside-period';
		dbState.employees = [
			{
				id: employeeId,
				firstName: 'Ada',
				lastName: 'Lovelace',
				dailyPay: 800,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				organizationId: dbState.organizationId,
				lastPayrollDate: null,
			},
		];
		dbState.schedules = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
			employeeId,
			dayOfWeek,
			startTime: '09:00',
			endTime: '17:00',
			isWorkingDay: true,
		}));

		const requestId = 'vac-req-saturday-outside-period-1';
		dbState.vacationRequests = [
			{
				id: requestId,
				organizationId: dbState.organizationId,
				employeeId,
				status: 'APPROVED',
				startDateKey: '2025-12-12',
				endDateKey: '2025-12-21',
			},
		];
		dbState.vacationRequestDays = [
			{
				requestId,
				employeeId,
				dateKey: '2025-12-12',
				countsAsVacationDay: true,
			},
			{
				requestId,
				employeeId,
				dateKey: '2025-12-20',
				countsAsVacationDay: false,
			},
			{
				requestId,
				employeeId,
				dateKey: '2025-12-21',
				countsAsVacationDay: false,
			},
		];

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/calculate', {
				organizationId: dbState.organizationId,
				periodStartDateKey: '2025-12-15',
				periodEndDateKey: '2025-12-21',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			data: {
				employees: {
					employeeId: string;
					vacationDaysPaid: number;
					vacationPayAmount: number;
					vacationPremiumAmount: number;
					totalPay: number;
					grossPay: number;
				}[];
			};
		};

		const row = json.data.employees[0];
		expect(row?.employeeId).toBe(employeeId);
		expect(row?.vacationDaysPaid).toBe(0);
		expect(row?.vacationPayAmount).toBe(0);
		expect(row?.vacationPremiumAmount).toBe(0);
		expect(row?.totalPay).toBe(0);
		expect(row?.grossPay).toBe(0);
	});

	it('persists separated fiscal and real vacation premium rates in dual payroll runs', async () => {
		dbState.organizationId = 'org-vac-dual';
		dbState.payrollSettings = [
			{
				organizationId: dbState.organizationId,
				overtimeEnforcement: 'WARN',
				weekStartDay: 1,
				additionalMandatoryRestDays: [],
				timeZone,
				enableDualPayroll: true,
				vacationPremiumRate: 0.25,
				realVacationPremiumRate: 0.5,
			},
		];

		const employeeId = 'emp-vac-dual';
		dbState.employees = [
			{
				id: employeeId,
				firstName: 'Ada',
				lastName: 'Lovelace',
				dailyPay: 800,
				fiscalDailyPay: 500,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				organizationId: dbState.organizationId,
				lastPayrollDate: null,
			},
		];

		const requestId = 'vac-req-dual-1';
		dbState.vacationRequests = [
			{
				id: requestId,
				organizationId: dbState.organizationId,
				employeeId,
				status: 'APPROVED',
				startDateKey: '2025-01-03',
				endDateKey: '2025-01-03',
			},
		];
		dbState.vacationRequestDays = [
			{
				requestId,
				employeeId,
				dateKey: '2025-01-03',
				countsAsVacationDay: true,
			},
		];

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey: '2025-01-03',
				periodEndDateKey: '2025-01-03',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			data: {
				run: {
					id: string;
				};
			};
		};

		expect(typeof json.data.run.id).toBe('string');

		const storedRow = expectSinglePayrollRunEmployee<{
			employeeId?: string;
			vacationPayAmount?: string;
			vacationPremiumAmount?: string;
			totalPay?: string;
			taxBreakdown?: {
				grossPay?: number;
				realCompensation?: {
					vacationPayAmount?: number | null;
					vacationPremiumAmount?: number | null;
				};
			};
		}>(dbState.payrollRunEmployees);

		expect(storedRow?.employeeId).toBe(employeeId);
		expect(storedRow?.vacationPayAmount).toBe('500.00');
		expect(storedRow?.vacationPremiumAmount).toBe('125.00');
		expect(storedRow?.totalPay).toBe('1200.00');
		expect(storedRow?.taxBreakdown?.grossPay).toBe(625);
		expect(storedRow?.taxBreakdown?.realCompensation?.vacationPayAmount).toBe(800);
		expect(storedRow?.taxBreakdown?.realCompensation?.vacationPremiumAmount).toBe(400);
	});

	it('persists the real vacation breakdown in non-dual payroll runs when the real rate differs', async () => {
		dbState.organizationId = 'org-vac-real-standard';
		dbState.payrollSettings = [
			{
				organizationId: dbState.organizationId,
				overtimeEnforcement: 'WARN',
				weekStartDay: 1,
				additionalMandatoryRestDays: [],
				timeZone,
				enableDualPayroll: false,
				vacationPremiumRate: 0.25,
				realVacationPremiumRate: 0.5,
			},
		];

		const employeeId = 'emp-vac-real-standard';
		dbState.employees = [
			{
				id: employeeId,
				firstName: 'Ada',
				lastName: 'Lovelace',
				dailyPay: 800,
				paymentFrequency: 'WEEKLY',
				shiftType: 'DIURNA',
				locationGeographicZone: 'GENERAL',
				locationTimeZone: timeZone,
				organizationId: dbState.organizationId,
				lastPayrollDate: null,
			},
		];

		const requestId = 'vac-req-real-standard-1';
		dbState.vacationRequests = [
			{
				id: requestId,
				organizationId: dbState.organizationId,
				employeeId,
				status: 'APPROVED',
				startDateKey: '2025-01-03',
				endDateKey: '2025-01-03',
			},
		];
		dbState.vacationRequestDays = [
			{
				requestId,
				employeeId,
				dateKey: '2025-01-03',
				countsAsVacationDay: true,
			},
		];

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: dbState.organizationId,
				periodStartDateKey: '2025-01-03',
				periodEndDateKey: '2025-01-03',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(200);
		const storedRow = expectSinglePayrollRunEmployee<{
			employeeId?: string;
			vacationPayAmount?: string;
			vacationPremiumAmount?: string;
			totalPay?: string;
			taxBreakdown?: {
				realCompensation?: {
					vacationPayAmount?: number | null;
					vacationPremiumAmount?: number | null;
				};
			};
		}>(dbState.payrollRunEmployees);

		expect(storedRow?.employeeId).toBe(employeeId);
		expect(storedRow?.vacationPayAmount).toBe('800.00');
		expect(storedRow?.vacationPremiumAmount).toBe('200.00');
		expect(storedRow?.totalPay).toBe('1200.00');
		expect(storedRow?.taxBreakdown?.realCompensation?.vacationPayAmount).toBe(800);
		expect(storedRow?.taxBreakdown?.realCompensation?.vacationPremiumAmount).toBe(400);
	});

	it('persists deduction snapshots and completes one-time deductions in /payroll/process', async () => {
		seedWeeklyProcessScenario({
			organizationId: 'org-deductions',
			employeeId: 'emp-ded-1',
			firstName: 'Ada',
			lastName: 'Lovelace',
			timeZone,
		});
		dbState.employeeDeductions = [
			{
				id: 'deduction-one-time',
				organizationId: 'org-deductions',
				employeeId: 'emp-ded-1',
				type: 'OTHER',
				label: 'Descuento unico',
				calculationMethod: 'FIXED_AMOUNT',
				value: '500.0000',
				frequency: 'ONE_TIME',
				totalInstallments: null,
				completedInstallments: 0,
				totalAmount: '500.00',
				remainingAmount: '500.00',
				status: 'ACTIVE',
				startDateKey: '2025-03-03',
				endDateKey: null,
				referenceNumber: null,
				satDeductionCode: null,
				notes: null,
				createdAt: new Date('2025-03-01T00:00:00.000Z'),
			},
		];

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: 'org-deductions',
				periodStartDateKey: '2025-03-03',
				periodEndDateKey: '2025-03-09',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(200);
		const persistedRow = expectSinglePayrollRunEmployee<{
			totalDeductions?: string;
			deductionsBreakdown?: Array<Record<string, unknown>>;
		}>(dbState.payrollRunEmployees);
		expect(persistedRow.totalDeductions).toBe('500.00');
		expect(Array.isArray(persistedRow.deductionsBreakdown)).toBe(true);
		expect(persistedRow.deductionsBreakdown?.[0]?.statusAfter).toBe('COMPLETED');
		expect(dbState.employeeDeductions[0]?.status).toBe('COMPLETED');
		expect(dbState.employeeDeductions[0]?.remainingAmount).toBe('0.00');
	});

	it('increments installment deductions when payroll is processed', async () => {
		seedWeeklyProcessScenario({
			organizationId: 'org-installments',
			employeeId: 'emp-install-1',
			firstName: 'Grace',
			lastName: 'Hopper',
			timeZone,
		});
		dbState.employeeDeductions = [
			{
				id: 'deduction-installment',
				organizationId: 'org-installments',
				employeeId: 'emp-install-1',
				type: 'LOAN',
				label: 'Prestamo nomina',
				calculationMethod: 'FIXED_AMOUNT',
				value: '500.0000',
				frequency: 'INSTALLMENTS',
				totalInstallments: 10,
				completedInstallments: 3,
				totalAmount: '5000.00',
				remainingAmount: '3500.00',
				status: 'ACTIVE',
				startDateKey: '2025-03-03',
				endDateKey: null,
				referenceNumber: null,
				satDeductionCode: null,
				notes: null,
				createdAt: new Date('2025-03-01T00:00:00.000Z'),
			},
		];

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: 'org-installments',
				periodStartDateKey: '2025-03-03',
				periodEndDateKey: '2025-03-09',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(200);
		expect(dbState.employeeDeductions[0]?.completedInstallments).toBe(4);
		expect(dbState.employeeDeductions[0]?.status).toBe('ACTIVE');
		expect(dbState.employeeDeductions[0]?.remainingAmount).toBe('3000.00');
		expect(
			flattenEqualityConditions(dbState.deductionUpdateConditions[0] ?? null),
		).toMatchObject({
			id: 'deduction-installment',
			organization_id: 'org-installments',
		});
	});

	it('completes recurring capped deductions when payroll settles the remaining balance', async () => {
		seedWeeklyProcessScenario({
			organizationId: 'org-recurring-cap',
			employeeId: 'emp-recurring-1',
			firstName: 'Katherine',
			lastName: 'Johnson',
			timeZone,
		});
		dbState.employeeDeductions = [
			{
				id: 'deduction-recurring-cap',
				organizationId: 'org-recurring-cap',
				employeeId: 'emp-recurring-1',
				type: 'OTHER',
				label: 'Saldo administrativo',
				calculationMethod: 'FIXED_AMOUNT',
				value: '500.0000',
				frequency: 'RECURRING',
				totalInstallments: null,
				completedInstallments: 0,
				totalAmount: '500.00',
				remainingAmount: '500.00',
				status: 'ACTIVE',
				startDateKey: '2025-03-03',
				endDateKey: null,
				referenceNumber: null,
				satDeductionCode: null,
				notes: null,
				createdAt: new Date('2025-03-01T00:00:00.000Z'),
			},
		];

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: 'org-recurring-cap',
				periodStartDateKey: '2025-03-03',
				periodEndDateKey: '2025-03-09',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(200);
		const persistedRow = expectSinglePayrollRunEmployee<{
			deductionsBreakdown?: Array<Record<string, unknown>>;
		}>(dbState.payrollRunEmployees);
		expect(persistedRow.deductionsBreakdown?.[0]?.statusAfter).toBe('COMPLETED');
		expect(dbState.employeeDeductions[0]?.status).toBe('COMPLETED');
		expect(dbState.employeeDeductions[0]?.remainingAmount).toBe('0.00');
	});

	it('returns conflict when deduction state changes before payroll updates are persisted', async () => {
		seedWeeklyProcessScenario({
			organizationId: 'org-deduction-conflict',
			employeeId: 'emp-conflict-1',
			firstName: 'Dorothy',
			lastName: 'Vaughan',
			timeZone,
		});
		dbState.employeeDeductions = [
			{
				id: 'deduction-conflict',
				organizationId: 'org-deduction-conflict',
				employeeId: 'emp-conflict-1',
				type: 'LOAN',
				label: 'Prestamo en carrera',
				calculationMethod: 'FIXED_AMOUNT',
				value: '500.0000',
				frequency: 'INSTALLMENTS',
				totalInstallments: 10,
				completedInstallments: 3,
				totalAmount: '5000.00',
				remainingAmount: '3500.00',
				status: 'ACTIVE',
				startDateKey: '2025-03-03',
				endDateKey: null,
				referenceNumber: null,
				satDeductionCode: null,
				notes: null,
				createdAt: new Date('2025-03-01T00:00:00.000Z'),
			},
		];
		dbState.pendingDeductionMutationBeforeTransaction = {
			id: 'deduction-conflict',
			completedInstallments: 4,
			remainingAmount: '3000.00',
		};

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: 'org-deduction-conflict',
				periodStartDateKey: '2025-03-03',
				periodEndDateKey: '2025-03-09',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(409);
		expect(dbState.payrollRuns).toHaveLength(0);
		expect(dbState.payrollRunEmployees).toHaveLength(0);
		expect(dbState.employeeDeductions[0]?.completedInstallments).toBe(4);
		expect(dbState.employeeDeductions[0]?.remainingAmount).toBe('3000.00');
	});

	it('returns conflict when deduction configuration changes before payroll updates are persisted', async () => {
		seedWeeklyProcessScenario({
			organizationId: 'org-deduction-config-conflict',
			employeeId: 'emp-config-conflict-1',
			firstName: 'Katherine',
			lastName: 'Johnson',
			timeZone,
		});
		dbState.employeeDeductions = [
			{
				id: 'deduction-config-conflict',
				organizationId: 'org-deduction-config-conflict',
				employeeId: 'emp-config-conflict-1',
				type: 'LOAN',
				label: 'Prestamo reconfigurado',
				calculationMethod: 'FIXED_AMOUNT',
				value: '500.0000',
				frequency: 'INSTALLMENTS',
				totalInstallments: 10,
				completedInstallments: 3,
				totalAmount: '5000.00',
				remainingAmount: '3500.00',
				status: 'ACTIVE',
				startDateKey: '2025-03-03',
				endDateKey: null,
				referenceNumber: null,
				satDeductionCode: null,
				notes: null,
				createdAt: new Date('2025-03-01T00:00:00.000Z'),
			},
		];
		dbState.pendingDeductionMutationBeforeTransaction = {
			id: 'deduction-config-conflict',
			value: '650.0000',
		};

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: 'org-deduction-config-conflict',
				periodStartDateKey: '2025-03-03',
				periodEndDateKey: '2025-03-09',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(409);
		expect(dbState.payrollRuns).toHaveLength(0);
		expect(dbState.payrollRunEmployees).toHaveLength(0);
		expect(dbState.employeeDeductions[0]?.value).toBe('650.0000');
	});

	it('returns conflict when an applied deduction changes configuration without changing state', async () => {
		seedWeeklyProcessScenario({
			organizationId: 'org-deduction-recurring-conflict',
			employeeId: 'emp-recurring-conflict-1',
			firstName: 'Ellen',
			lastName: 'Ochoa',
			timeZone,
		});
		dbState.employeeDeductions = [
			{
				id: 'deduction-recurring-conflict',
				organizationId: 'org-deduction-recurring-conflict',
				employeeId: 'emp-recurring-conflict-1',
				type: 'OTHER',
				label: 'Cuota recurrente',
				calculationMethod: 'FIXED_AMOUNT',
				value: '500.0000',
				frequency: 'RECURRING',
				totalInstallments: null,
				completedInstallments: 0,
				totalAmount: null,
				remainingAmount: null,
				status: 'ACTIVE',
				startDateKey: '2025-03-03',
				endDateKey: null,
				referenceNumber: null,
				satDeductionCode: null,
				notes: null,
				createdAt: new Date('2025-03-01T00:00:00.000Z'),
			},
		];
		dbState.pendingDeductionMutationBeforeTransaction = {
			id: 'deduction-recurring-conflict',
			value: '650.0000',
		};

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: 'org-deduction-recurring-conflict',
				periodStartDateKey: '2025-03-03',
				periodEndDateKey: '2025-03-09',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(409);
		expect(dbState.payrollRuns).toHaveLength(0);
		expect(dbState.payrollRunEmployees).toHaveLength(0);
		expect(dbState.employeeDeductions[0]?.value).toBe('650.0000');
	});

	it('guards deduction updates with previous-state predicates', async () => {
		seedWeeklyProcessScenario({
			organizationId: 'org-deduction-stale-write',
			employeeId: 'emp-stale-1',
			firstName: 'Mary',
			lastName: 'Jackson',
			timeZone,
		});
		dbState.employeeDeductions = [
			{
				id: 'deduction-stale-write',
				organizationId: 'org-deduction-stale-write',
				employeeId: 'emp-stale-1',
				type: 'LOAN',
				label: 'Prestamo stale',
				calculationMethod: 'FIXED_AMOUNT',
				value: '500.0000',
				frequency: 'INSTALLMENTS',
				totalInstallments: 10,
				completedInstallments: 3,
				totalAmount: '5000.00',
				remainingAmount: '3500.00',
				status: 'ACTIVE',
				startDateKey: '2025-03-03',
				endDateKey: null,
				referenceNumber: null,
				satDeductionCode: null,
				notes: null,
				createdAt: new Date('2025-03-01T00:00:00.000Z'),
			},
		];
		dbState.pendingDeductionMutationBeforeUpdate = {
			id: 'deduction-stale-write',
			completedInstallments: 4,
			remainingAmount: '3000.00',
			value: '650.0000',
		};

		const { payrollRoutes } = await import('./payroll.js');
		const response = await payrollRoutes.handle(
			createJsonPostRequest('/payroll/process', {
				organizationId: 'org-deduction-stale-write',
				periodStartDateKey: '2025-03-03',
				periodEndDateKey: '2025-03-09',
				paymentFrequency: 'WEEKLY',
			}),
		);

		expect(response.status).toBe(409);
		expect(
			flattenEqualityConditions(dbState.deductionUpdateConditions[0] ?? null),
		).toMatchObject({
			id: 'deduction-stale-write',
			organization_id: 'org-deduction-stale-write',
			status: 'ACTIVE',
			completed_installments: 3,
			remaining_amount: '3500.00',
			value: '500.0000',
			calculation_method: 'FIXED_AMOUNT',
			frequency: 'INSTALLMENTS',
			total_installments: 10,
			total_amount: '5000.00',
			start_date_key: '2025-03-03',
		});
		expect(dbState.payrollRuns).toHaveLength(0);
	});
});
