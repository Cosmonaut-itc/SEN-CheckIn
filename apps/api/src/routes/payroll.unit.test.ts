import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';

import {
	getPayrollPeriodBounds,
	type AttendanceRow,
	type PayrollEmployeeRow,
} from '../services/payroll-calculation.js';
import { getUtcDateForZonedMidnight } from '../utils/time-zone.js';

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
	enableSeventhDayPay?: boolean;
}

type FakeEmployeeRow = PayrollEmployeeRow & {
	organizationId: string;
	lastPayrollDate: Date | null;
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

interface FakeDbState {
	organizationId: string;
	payrollSettings: FakePayrollSettingRow[];
	employees: FakeEmployeeRow[];
	schedules: FakeEmployeeScheduleRow[];
	attendanceRecords: AttendanceRow[];
	vacationRequests: FakeVacationRequestRow[];
	vacationRequestDays: FakeVacationRequestDayRow[];
	payrollRuns: Record<string, unknown>[];
	payrollRunEmployees: Record<string, unknown>[];
	transactionCalled: boolean;
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
 * Creates a minimal Drizzle-like DB stub for route tests.
 *
 * @param state - Shared mutable DB state
 * @returns Fake DB instance
 */
function createFakeDb(state: FakeDbState): {
	select: (selection?: unknown) => unknown;
	transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
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
				return state.attendanceRecords
					.filter((row) =>
						employeeIds.length === 0 ? true : employeeIds.includes(row.employeeId),
					)
					.filter((row) => (start ? row.timestamp >= start : true))
					.filter((row) => (end ? row.timestamp <= end : true));
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
			values: (values: Record<string, unknown> | Record<string, unknown>[]) => Promise<void>;
		};
		update: (table: unknown) => {
			set: (values: Record<string, unknown>) => {
				where: (condition: DrizzleCondition) => Promise<void>;
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
			const valuesFn = async (
				values: Record<string, unknown> | Record<string, unknown>[],
			): Promise<void> => {
				const rows = Array.isArray(values) ? values : [values];
				if (tableName === 'payroll_run') {
					state.payrollRuns.push(...rows);
					return;
				}
				if (tableName === 'payroll_run_employee') {
					state.payrollRunEmployees.push(...rows);
				}
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
				const where = async (condition: DrizzleCondition): Promise<void> => {
					if (tableName !== 'employee') {
						return;
					}
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
		return fn(createTransaction());
	};

	return {
		select,
		transaction,
	};
}

const dbState: FakeDbState = {
	organizationId: 'org-test',
	payrollSettings: [],
	employees: [],
	schedules: [],
	attendanceRecords: [],
	vacationRequests: [],
	vacationRequestDays: [],
	payrollRuns: [],
	payrollRunEmployees: [],
	transactionCalled: false,
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
		lte: (column: unknown, value: Date) => ({ kind: 'lte' as const, column, value }),
		relations: () => ({}),
		sql: sqlTag,
	};
});

mock.module('../db/index.js', () => ({ default: fakeDb }));
mock.module('../plugins/auth.js', () => ({
	combinedAuthPlugin: new Elysia({ name: 'mock-auth-plugin' }),
}));
mock.module('../utils/organization.js', () => ({
	resolveOrganizationId: () => dbState.organizationId,
}));

describe('payroll routes', () => {
	const timeZone = 'America/Mexico_City';

	beforeEach(() => {
		dbState.organizationId = 'org-test';
		dbState.payrollSettings = [];
		dbState.employees = [];
		dbState.schedules = [];
		dbState.attendanceRecords = [];
		dbState.vacationRequests = [];
		dbState.vacationRequestDays = [];
		dbState.payrollRuns = [];
		dbState.payrollRunEmployees = [];
		dbState.transactionCalled = false;
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
});
