import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';

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
			kind: 'inArray';
			column: unknown;
			values: unknown[];
	  };

interface FakeSelectCall {
	tableName: string | null;
	condition: DrizzleCondition | null;
	limit: number | null;
	offset: number | null;
	selection: 'all' | 'count';
}

interface FakeUpdateCall {
	tableName: string | null;
	condition: DrizzleCondition | null;
	values: Record<string, unknown>;
}

interface FakeEmployeeRow {
	id: string;
	organizationId: string;
	firstName: string;
	lastName: string;
}

interface FakeDeductionRow {
	id: string;
	organizationId: string;
	employeeId: string;
	type:
		| 'INFONAVIT'
		| 'ALIMONY'
		| 'FONACOT'
		| 'LOAN'
		| 'UNION_FEE'
		| 'ADVANCE'
		| 'OTHER';
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
	createdByUserId: string;
	createdAt: Date;
	updatedAt: Date;
}

interface FakeDbState {
	organizationId: string;
	memberRole: 'admin' | 'member';
	employees: FakeEmployeeRow[];
	deductions: FakeDeductionRow[];
}

/**
 * Creates a JSON request for route testing.
 *
 * @param method - HTTP method
 * @param path - Request path
 * @param body - Optional JSON body
 * @returns Request instance
 */
function createJsonRequest(method: string, path: string, body?: unknown): Request {
	return new Request(`http://localhost${path}`, {
		method,
		headers: body === undefined ? undefined : { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

/**
 * Extracts the Drizzle table name from a table object.
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
 * Extracts a column name from a Drizzle column-like object.
 *
 * @param column - Drizzle column
 * @returns Column name when available
 */
function getColumnName(column: unknown): string | null {
	if (!column || typeof column !== 'object') {
		return null;
	}

	const nameSymbol = Symbol.for('drizzle:Name');
	const symbolValue = (column as Record<symbol, unknown>)[nameSymbol];
	if (typeof symbolValue === 'string') {
		return symbolValue;
	}

	const objectValue = column as { name?: unknown; config?: { name?: unknown } };
	if (typeof objectValue.name === 'string') {
		return objectValue.name;
	}
	if (typeof objectValue.config?.name === 'string') {
		return objectValue.config.name;
	}

	return null;
}

/**
 * Evaluates a minimal subset of Drizzle conditions against a fake row.
 *
 * @param row - Row candidate
 * @param condition - Condition tree
 * @returns True when the row matches
 */
function matchesCondition(row: Record<string, unknown>, condition: DrizzleCondition | null): boolean {
	if (!condition) {
		return true;
	}

	if (condition.kind === 'and') {
		return condition.conditions.every((entry) => matchesCondition(row, entry));
	}

	if (condition.kind === 'eq') {
		const columnName = getColumnName(condition.column);
		if (!columnName) {
			return true;
		}

		const normalizedColumnName = columnName
			.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())
			.replace(/^organizationId$/, 'organizationId');
		return row[normalizedColumnName] === condition.value;
	}

	if (condition.kind === 'inArray') {
		const columnName = getColumnName(condition.column);
		if (!columnName) {
			return true;
		}

		const normalizedColumnName = columnName
			.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())
			.replace(/^organizationId$/, 'organizationId');
		return condition.values.includes(row[normalizedColumnName]);
	}

	return true;
}

/**
 * Flattens equality conditions into a column/value map for assertions.
 *
 * @param condition - Drizzle-like condition tree
 * @returns Map of column names to expected values
 */
function flattenEqualityConditions(
	condition: DrizzleCondition | null,
): Record<string, unknown> {
	if (!condition) {
		return {};
	}

	if (condition.kind === 'and') {
		return condition.conditions.reduce<Record<string, unknown>>((result, entry) => {
			return { ...result, ...flattenEqualityConditions(entry) };
		}, {});
	}

	if (condition.kind === 'eq') {
		const columnName = getColumnName(condition.column);
		return columnName ? { [columnName]: condition.value } : {};
	}

	return {};
}

const dbInspection: {
	selects: FakeSelectCall[];
	updates: FakeUpdateCall[];
} = {
	selects: [],
	updates: [],
};

/**
 * Clears recorded fake DB interactions between test cases.
 *
 * @returns Void
 */
function resetDbInspection(): void {
	dbInspection.selects = [];
	dbInspection.updates = [];
}

/**
 * Minimal thenable query builder for route-level unit tests.
 */
class FakeQuery {
	private tableName: string | null = null;
	private condition: DrizzleCondition | null = null;
	private limitCount: number | null = null;
	private offsetCount: number | null = null;

	/**
	 * Creates the builder.
	 *
	 * @param state - Shared mutable DB state
	 * @param selection - Optional selected fields
	 */
	constructor(
		private readonly state: FakeDbState,
		private readonly selection?: Record<string, unknown>,
	) {}

	/**
	 * Sets the source table.
	 *
	 * @param table - Drizzle table object
	 * @returns The query builder
	 */
	from(table: unknown): this {
		this.tableName = getTableName(table);
		return this;
	}

	/**
	 * Accepts LEFT JOIN without applying it.
	 *
	 * @param table - Joined table
	 * @param condition - Join condition
	 * @returns The query builder
	 */
	leftJoin(table: unknown, condition: DrizzleCondition): this {
		void table;
		void condition;
		return this;
	}

	/**
	 * Accepts a WHERE clause and stores it for later evaluation.
	 *
	 * @param condition - Drizzle-like condition tree
	 * @returns The query builder
	 */
	where(condition: DrizzleCondition): this {
		this.condition = condition;
		return this;
	}

	/**
	 * Accepts a LIMIT clause without evaluating it.
	 *
	 * @param count - Maximum rows to return
	 * @returns The query builder
	 */
	limit(count: number): this {
		this.limitCount = count;
		return this;
	}

	/**
	 * Accepts an OFFSET clause without evaluating it.
	 *
	 * @param offset - Row offset
	 * @returns The query builder
	 */
	offset(offset: number): this {
		this.offsetCount = offset;
		return this;
	}

	/**
	 * Accepts ORDER BY without evaluating it.
	 *
	 * @param values - Ordering values
	 * @returns The query builder
	 */
	orderBy(...values: unknown[]): this {
		void values;
		return this;
	}

	/**
	 * Resolves rows for the active table.
	 *
	 * @returns Fake query results
	 */
	private execute(): unknown[] {
		const isCountSelection = Object.values(this.selection ?? {}).some(
			(value) =>
				typeof value === 'object' && value !== null && (value as { kind?: string }).kind === 'count',
		);
		if (this.tableName === 'member') {
			dbInspection.selects.push({
				tableName: this.tableName,
				condition: this.condition,
				limit: this.limitCount,
				offset: this.offsetCount,
				selection: isCountSelection ? 'count' : 'all',
			});
			return [{ role: this.state.memberRole }];
		}

		if (this.tableName === 'employee') {
			const rows = this.state.employees.filter((row) =>
				matchesCondition(row as unknown as Record<string, unknown>, this.condition),
			);
			const paginatedRows = rows.slice(
				this.offsetCount ?? 0,
				this.limitCount === null ? undefined : (this.offsetCount ?? 0) + this.limitCount,
			);
			dbInspection.selects.push({
				tableName: this.tableName,
				condition: this.condition,
				limit: this.limitCount,
				offset: this.offsetCount,
				selection: isCountSelection ? 'count' : 'all',
			});
			return isCountSelection ? [{ count: rows.length }] : paginatedRows;
		}

		if (this.tableName === 'employee_deduction') {
			const rows = this.state.deductions.filter((row) =>
				matchesCondition(row as unknown as Record<string, unknown>, this.condition),
			);
			const paginatedRows = rows.slice(
				this.offsetCount ?? 0,
				this.limitCount === null ? undefined : (this.offsetCount ?? 0) + this.limitCount,
			);
			dbInspection.selects.push({
				tableName: this.tableName,
				condition: this.condition,
				limit: this.limitCount,
				offset: this.offsetCount,
				selection: isCountSelection ? 'count' : 'all',
			});
			return isCountSelection ? [{ count: rows.length }] : paginatedRows;
		}

		dbInspection.selects.push({
			tableName: this.tableName,
			condition: this.condition,
			limit: this.limitCount,
			offset: this.offsetCount,
			selection: isCountSelection ? 'count' : 'all',
		});
		return [];
	}

	/**
	 * Implements PromiseLike so route code can await the query.
	 *
	 * @param onfulfilled - Success handler
	 * @param onrejected - Error handler
	 * @returns Promise of the fake result
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
 * Creates a fake Drizzle DB facade for employee deduction route tests.
 *
 * @param state - Shared mutable DB state
 * @returns Fake database implementation
 */
function createFakeDb(state: FakeDbState): {
	select: (selection?: Record<string, unknown>) => FakeQuery;
	insert: (table: unknown) => {
		values: (values: Record<string, unknown>) => {
			returning: () => Promise<FakeDeductionRow[]>;
		};
	};
	update: (table: unknown) => {
		set: (values: Record<string, unknown>) => {
			where: (condition: DrizzleCondition) => {
				returning: () => Promise<FakeDeductionRow[]>;
			};
		};
	};
} {
	return {
		select: (selection?: Record<string, unknown>) => new FakeQuery(state, selection),
		insert: (table: unknown) => ({
			values: (values: Record<string, unknown>) => ({
				returning: async (): Promise<FakeDeductionRow[]> => {
					void table;
					const created: FakeDeductionRow = {
						id: (values.id as string | undefined) ?? 'deduction-created',
						organizationId: values.organizationId as string,
						employeeId: values.employeeId as string,
						type: values.type as FakeDeductionRow['type'],
						label: values.label as string,
						calculationMethod: values.calculationMethod as FakeDeductionRow['calculationMethod'],
						value: String(values.value),
						frequency: values.frequency as FakeDeductionRow['frequency'],
						totalInstallments: (values.totalInstallments as number | null | undefined) ?? null,
						completedInstallments: (values.completedInstallments as number | undefined) ?? 0,
						totalAmount:
							values.totalAmount === null || values.totalAmount === undefined
								? null
								: String(values.totalAmount),
						remainingAmount:
							values.remainingAmount === null || values.remainingAmount === undefined
								? null
								: String(values.remainingAmount),
						status: (values.status as FakeDeductionRow['status'] | undefined) ?? 'ACTIVE',
						startDateKey: values.startDateKey as string,
						endDateKey: (values.endDateKey as string | null | undefined) ?? null,
						referenceNumber:
							(values.referenceNumber as string | null | undefined) ?? null,
						satDeductionCode:
							(values.satDeductionCode as string | null | undefined) ?? null,
						notes: (values.notes as string | null | undefined) ?? null,
						createdByUserId: values.createdByUserId as string,
						createdAt: new Date('2026-03-13T00:00:00.000Z'),
						updatedAt: new Date('2026-03-13T00:00:00.000Z'),
					};
					state.deductions.push(created);
					return [created];
				},
			}),
		}),
		update: (table: unknown) => ({
			set: (values: Record<string, unknown>) => ({
				where: (condition: DrizzleCondition) => ({
					returning: async (): Promise<FakeDeductionRow[]> => {
						const tableName = getTableName(table);
						dbInspection.updates.push({
							tableName,
							condition,
							values,
						});
						const row = state.deductions.find((entry) =>
							matchesCondition(entry as unknown as Record<string, unknown>, condition),
						);
						if (!row) {
							return [];
						}

						const updated: FakeDeductionRow = {
							...row,
							...values,
							value:
								values.value === undefined ? row.value : String(values.value),
							totalAmount:
								values.totalAmount === undefined
									? row.totalAmount
									: values.totalAmount === null
										? null
										: String(values.totalAmount),
							remainingAmount:
								values.remainingAmount === undefined
									? row.remainingAmount
									: values.remainingAmount === null
										? null
										: String(values.remainingAmount),
							updatedAt: new Date('2026-03-13T01:00:00.000Z'),
						};
						const index = state.deductions.findIndex((entry) => entry.id === row.id);
						state.deductions[index] = updated;
						return [updated];
					},
				}),
			}),
		}),
	};
}

const dbState: FakeDbState = {
	organizationId: 'org-test',
	memberRole: 'admin',
	employees: [
		{
			id: 'employee-1',
			organizationId: 'org-test',
			firstName: 'Ada',
			lastName: 'Lovelace',
		},
	],
	deductions: [],
};

const fakeDb = createFakeDb(dbState);

mock.module('drizzle-orm', () => ({
	and: (...conditions: DrizzleCondition[]) => ({ kind: 'and' as const, conditions }),
	count: () => ({ kind: 'count' as const }),
	desc: (value: unknown) => ({ kind: 'desc' as const, value }),
	eq: (column: unknown, value: unknown) => ({ kind: 'eq' as const, column, value }),
	gte: (column: unknown, value: Date | string) => ({
		kind: 'gte' as const,
		column,
		value,
	}),
	inArray: (column: unknown, values: unknown[]) => ({
		kind: 'inArray' as const,
		column,
		values,
	}),
	isNull: (column: unknown) => ({ kind: 'isNull' as const, column }),
	lte: (column: unknown, value: Date | string) => ({
		kind: 'lte' as const,
		column,
		value,
	}),
	or: (...conditions: DrizzleCondition[]) => ({ kind: 'and' as const, conditions }),
	relations: () => ({}),
	sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
		kind: 'sql' as const,
		strings: Array.from(strings),
		values,
	}),
}));

mock.module('../db/index.js', () => ({ default: fakeDb }));
mock.module('../plugins/auth.js', () => ({
	combinedAuthPlugin: new Elysia({ name: 'mock-auth-plugin' }).derive(
		{ as: 'scoped' },
		() => ({
			authType: 'session' as const,
			session: {
				id: 'session-1',
				expiresAt: new Date('2099-01-01T00:00:00.000Z'),
				token: 'token-1',
				createdAt: new Date('2099-01-01T00:00:00.000Z'),
				updatedAt: new Date('2099-01-01T00:00:00.000Z'),
				userId: 'user-1',
				activeOrganizationId: dbState.organizationId,
			},
			sessionOrganizationIds: [dbState.organizationId],
			apiKeyOrganizationId: null,
			apiKeyOrganizationIds: [],
		}),
	),
}));
mock.module('../utils/organization.js', () => ({
	resolveOrganizationId: ({ requestedOrganizationId }: { requestedOrganizationId?: string | null }) =>
		requestedOrganizationId ?? dbState.organizationId,
}));

describe('employee deduction routes', () => {
	beforeEach(() => {
		resetDbInspection();
		dbState.memberRole = 'admin';
		dbState.employees = [
			{
				id: 'employee-1',
				organizationId: 'org-test',
				firstName: 'Ada',
				lastName: 'Lovelace',
			},
		];
		dbState.deductions = [
			{
				id: 'deduction-active',
				organizationId: 'org-test',
				employeeId: 'employee-1',
				type: 'INFONAVIT',
				label: 'INFONAVIT principal',
				calculationMethod: 'PERCENTAGE_SBC',
				value: '12.5000',
				frequency: 'RECURRING',
				totalInstallments: null,
				completedInstallments: 0,
				totalAmount: null,
				remainingAmount: null,
				status: 'ACTIVE',
				startDateKey: '2026-03-01',
				endDateKey: null,
				referenceNumber: 'INF-123',
				satDeductionCode: '001',
				notes: 'Descuento vigente',
				createdByUserId: 'user-1',
				createdAt: new Date('2026-03-01T00:00:00.000Z'),
				updatedAt: new Date('2026-03-01T00:00:00.000Z'),
			},
			{
				id: 'deduction-paused',
				organizationId: 'org-test',
				employeeId: 'employee-1',
				type: 'OTHER',
				label: 'Cuota interna',
				calculationMethod: 'FIXED_AMOUNT',
				value: '350.0000',
				frequency: 'RECURRING',
				totalInstallments: null,
				completedInstallments: 0,
				totalAmount: null,
				remainingAmount: null,
				status: 'PAUSED',
				startDateKey: '2026-02-01',
				endDateKey: null,
				referenceNumber: null,
				satDeductionCode: null,
				notes: null,
				createdByUserId: 'user-1',
				createdAt: new Date('2026-02-01T00:00:00.000Z'),
				updatedAt: new Date('2026-02-01T00:00:00.000Z'),
			},
			{
				id: 'deduction-cancelled',
				organizationId: 'org-test',
				employeeId: 'employee-1',
				type: 'LOAN',
				label: 'Prestamo antiguo',
				calculationMethod: 'FIXED_AMOUNT',
				value: '500.0000',
				frequency: 'INSTALLMENTS',
				totalInstallments: 5,
				completedInstallments: 2,
				totalAmount: '2500.00',
				remainingAmount: '1500.00',
				status: 'CANCELLED',
				startDateKey: '2026-01-01',
				endDateKey: null,
				referenceNumber: 'LOAN-1',
				satDeductionCode: null,
				notes: null,
				createdByUserId: 'user-1',
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
				updatedAt: new Date('2026-02-10T00:00:00.000Z'),
			},
		];
	});

	it('rejects unsupported calculation methods for INFONAVIT', async () => {
		const { employeeDeductionRoutes } = await import('./employee-deductions.js');

		const response = await employeeDeductionRoutes.handle(
			createJsonRequest(
				'POST',
				'/organizations/org-test/employees/employee-1/deductions',
				{
					type: 'INFONAVIT',
					label: 'Credito INFONAVIT',
					calculationMethod: 'PERCENTAGE_NET',
					value: 12.5,
					frequency: 'RECURRING',
					startDateKey: '2026-03-01',
				},
			),
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			error: {
				message:
					'INFONAVIT deductions only allow PERCENTAGE_SBC, FIXED_AMOUNT, or VSM_FACTOR',
			},
		});
	});

	it('rejects recurring loan deductions', async () => {
		const { employeeDeductionRoutes } = await import('./employee-deductions.js');

		const response = await employeeDeductionRoutes.handle(
			createJsonRequest(
				'POST',
				'/organizations/org-test/employees/employee-1/deductions',
				{
					type: 'LOAN',
					label: 'Prestamo caja',
					calculationMethod: 'FIXED_AMOUNT',
					value: 500,
					frequency: 'RECURRING',
					startDateKey: '2026-03-01',
				},
			),
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			error: {
				message: 'LOAN and ADVANCE deductions only allow INSTALLMENTS or ONE_TIME',
			},
		});
	});

	describe('type-specific validation', () => {
		it('rejects ALIMONY with PERCENTAGE_SBC calculation method', async () => {
			const { employeeDeductionRoutes } = await import('./employee-deductions.js');

			const response = await employeeDeductionRoutes.handle(
				createJsonRequest(
					'POST',
					'/organizations/org-test/employees/employee-1/deductions',
					{
						type: 'ALIMONY',
						label: 'Pension alimenticia',
						calculationMethod: 'PERCENTAGE_SBC',
						value: 15,
						frequency: 'RECURRING',
						startDateKey: '2026-03-01',
					},
				),
			);

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({
				error: {
					message: 'ALIMONY deductions only allow PERCENTAGE_NET or FIXED_AMOUNT',
				},
			});
		});

		for (const type of ['LOAN', 'ADVANCE'] as const) {
			it(`rejects ${type} with non-fixed calculation method`, async () => {
				const { employeeDeductionRoutes } = await import('./employee-deductions.js');

				const response = await employeeDeductionRoutes.handle(
					createJsonRequest(
						'POST',
						'/organizations/org-test/employees/employee-1/deductions',
						{
							type,
							label: type === 'LOAN' ? 'Prestamo variable' : 'Adelanto variable',
							calculationMethod: 'VSM_FACTOR',
							value: 1.2,
							frequency: 'INSTALLMENTS',
							totalInstallments: 6,
							startDateKey: '2026-03-01',
						},
					),
				);

				expect(response.status).toBe(400);
				await expect(response.json()).resolves.toMatchObject({
					error: {
						message: 'LOAN and ADVANCE deductions only allow FIXED_AMOUNT',
					},
				});
			});
		}

		it('rejects ADVANCE with RECURRING frequency', async () => {
			const { employeeDeductionRoutes } = await import('./employee-deductions.js');

			const response = await employeeDeductionRoutes.handle(
				createJsonRequest(
					'POST',
					'/organizations/org-test/employees/employee-1/deductions',
					{
						type: 'ADVANCE',
						label: 'Adelanto extraordinario',
						calculationMethod: 'FIXED_AMOUNT',
						value: 500,
						frequency: 'RECURRING',
						startDateKey: '2026-03-01',
					},
				),
			);

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({
				error: {
					message: 'LOAN and ADVANCE deductions only allow INSTALLMENTS or ONE_TIME',
				},
			});
		});
	});

	describe('input validation', () => {
		it('rejects value exceeding MAX_DEDUCTION_VALUE', async () => {
			const { employeeDeductionRoutes } = await import('./employee-deductions.js');

			const response = await employeeDeductionRoutes.handle(
				createJsonRequest(
					'POST',
					'/organizations/org-test/employees/employee-1/deductions',
					{
						type: 'OTHER',
						label: 'Descuento excedido',
						calculationMethod: 'FIXED_AMOUNT',
						value: 1000000,
						frequency: 'RECURRING',
						startDateKey: '2026-03-01',
					},
				),
			);

			expect(response.status).toBe(422);
			expect(JSON.stringify(await response.json())).toContain(
				'value must be less than or equal to 999999.9999',
			);
		});

		it('rejects invalid dateKey format', async () => {
			const { employeeDeductionRoutes } = await import('./employee-deductions.js');

			const response = await employeeDeductionRoutes.handle(
				createJsonRequest(
					'POST',
					'/organizations/org-test/employees/employee-1/deductions',
					{
						type: 'OTHER',
						label: 'Fecha invalida',
						calculationMethod: 'FIXED_AMOUNT',
						value: 200,
						frequency: 'RECURRING',
						startDateKey: '2026/03/01',
					},
				),
			);

			expect(response.status).toBe(422);
			expect(JSON.stringify(await response.json())).toContain('Date must be YYYY-MM-DD');
		});

		it('requires totalInstallments when frequency is INSTALLMENTS', async () => {
			const { employeeDeductionRoutes } = await import('./employee-deductions.js');

			const response = await employeeDeductionRoutes.handle(
				createJsonRequest(
					'POST',
					'/organizations/org-test/employees/employee-1/deductions',
					{
						type: 'LOAN',
						label: 'Prestamo sin parcialidades',
						calculationMethod: 'FIXED_AMOUNT',
						value: 500,
						frequency: 'INSTALLMENTS',
						startDateKey: '2026-03-01',
					},
				),
			);

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({
				error: {
					message: 'INSTALLMENTS deductions require totalInstallments greater than 0',
				},
			});
		});

		it('rejects remainingAmount greater than totalAmount', async () => {
			const { employeeDeductionRoutes } = await import('./employee-deductions.js');

			const response = await employeeDeductionRoutes.handle(
				createJsonRequest(
					'POST',
					'/organizations/org-test/employees/employee-1/deductions',
					{
						type: 'LOAN',
						label: 'Prestamo con saldo invalido',
						calculationMethod: 'FIXED_AMOUNT',
						value: 500,
						frequency: 'INSTALLMENTS',
						totalInstallments: 10,
						totalAmount: 5000,
						remainingAmount: 5500,
						startDateKey: '2026-03-01',
					},
				),
			);

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({
				error: {
					message: 'remainingAmount cannot be greater than totalAmount',
				},
			});
		});
	});

	it('filters employee deductions by status and type', async () => {
		const { employeeDeductionRoutes } = await import('./employee-deductions.js');

		const response = await employeeDeductionRoutes.handle(
			createJsonRequest(
				'GET',
				'/organizations/org-test/employees/employee-1/deductions?status=PAUSED&type=OTHER',
			),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			data: [
				{
					id: 'deduction-paused',
					type: 'OTHER',
					status: 'PAUSED',
					value: 350,
				},
			],
		});
		const deductionSelectCall = dbInspection.selects.find(
			(call) => call.tableName === 'employee_deduction' && call.selection === 'all',
		);
		expect(flattenEqualityConditions(deductionSelectCall?.condition ?? null)).toMatchObject({
			organization_id: 'org-test',
			employee_id: 'employee-1',
			status: 'PAUSED',
			type: 'OTHER',
		});
	});

	it('filters employee deductions by status only', async () => {
		const { employeeDeductionRoutes } = await import('./employee-deductions.js');

		const response = await employeeDeductionRoutes.handle(
			createJsonRequest(
				'GET',
				'/organizations/org-test/employees/employee-1/deductions?status=ACTIVE',
			),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			data: [
				{
					id: 'deduction-active',
					status: 'ACTIVE',
				},
			],
		});
	});

	it('filters employee deductions by type only', async () => {
		const { employeeDeductionRoutes } = await import('./employee-deductions.js');

		const response = await employeeDeductionRoutes.handle(
			createJsonRequest(
				'GET',
				'/organizations/org-test/employees/employee-1/deductions?type=LOAN',
			),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			data: [
				{
					id: 'deduction-cancelled',
					type: 'LOAN',
				},
			],
		});
	});

	it('returns all deductions without filters', async () => {
		const { employeeDeductionRoutes } = await import('./employee-deductions.js');

		const response = await employeeDeductionRoutes.handle(
			createJsonRequest(
				'GET',
				'/organizations/org-test/employees/employee-1/deductions',
			),
		);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			data: Array<{
				id: string;
			}>;
		};
		expect(payload.data).toHaveLength(3);
		expect(payload.data.map((deduction) => deduction.id)).toEqual([
			'deduction-active',
			'deduction-paused',
			'deduction-cancelled',
		]);
	});

	describe('update validation', () => {
		it('rejects empty update payload', async () => {
			const { employeeDeductionRoutes } = await import('./employee-deductions.js');

			const response = await employeeDeductionRoutes.handle(
				createJsonRequest(
					'PUT',
					'/organizations/org-test/employees/employee-1/deductions/deduction-active',
					{},
				),
			);

			expect(response.status).toBe(422);
			expect(JSON.stringify(await response.json())).toContain(
				'At least one field must be provided for update',
			);
		});
	});

	it('updates deduction value and notes correctly', async () => {
		const { employeeDeductionRoutes } = await import('./employee-deductions.js');

		const response = await employeeDeductionRoutes.handle(
			createJsonRequest(
				'PUT',
				'/organizations/org-test/employees/employee-1/deductions/deduction-active',
				{
					value: 15.75,
					notes: 'Ajuste administrativo',
				},
			),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			data: {
				id: 'deduction-active',
				value: 15.75,
				notes: 'Ajuste administrativo',
			},
		});
		expect(dbState.deductions.find((entry) => entry.id === 'deduction-active')).toMatchObject({
			value: '15.7500',
			notes: 'Ajuste administrativo',
		});
	});

	it('preserves remainingAmount when only totalAmount is updated', async () => {
		const { employeeDeductionRoutes } = await import('./employee-deductions.js');

		const response = await employeeDeductionRoutes.handle(
			createJsonRequest(
				'PUT',
				'/organizations/org-test/employees/employee-1/deductions/deduction-cancelled',
				{
					totalAmount: 3000,
				},
			),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			data: {
				id: 'deduction-cancelled',
				totalAmount: 3000,
				remainingAmount: 1500,
			},
		});
		expect(dbState.deductions.find((entry) => entry.id === 'deduction-cancelled')).toMatchObject({
			totalAmount: '3000.00',
			remainingAmount: '1500.00',
		});
	});

	it('clears totalInstallments when frequency changes away from INSTALLMENTS', async () => {
		const { employeeDeductionRoutes } = await import('./employee-deductions.js');

		const response = await employeeDeductionRoutes.handle(
			createJsonRequest(
				'PUT',
				'/organizations/org-test/employees/employee-1/deductions/deduction-cancelled',
				{
					frequency: 'ONE_TIME',
				},
			),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			data: {
				id: 'deduction-cancelled',
				frequency: 'ONE_TIME',
				totalInstallments: null,
			},
		});
		expect(dbState.deductions.find((entry) => entry.id === 'deduction-cancelled')).toMatchObject({
			frequency: 'ONE_TIME',
			totalInstallments: null,
		});
	});

	it('scopes deduction lookup and update by id, organization, and employee', async () => {
		const { employeeDeductionRoutes } = await import('./employee-deductions.js');

		const response = await employeeDeductionRoutes.handle(
			createJsonRequest(
				'PUT',
				'/organizations/org-test/employees/employee-1/deductions/deduction-active',
				{
					notes: 'Ajuste con scope estricto',
				},
			),
		);

		expect(response.status).toBe(200);

		const deductionSelectCall = dbInspection.selects.find(
			(call) => call.tableName === 'employee_deduction' && call.selection === 'all',
		);
		const deductionUpdateCall = dbInspection.updates.find(
			(call) => call.tableName === 'employee_deduction',
		);

		expect(flattenEqualityConditions(deductionSelectCall?.condition ?? null)).toMatchObject({
			id: 'deduction-active',
			organization_id: 'org-test',
			employee_id: 'employee-1',
		});
		expect(flattenEqualityConditions(deductionUpdateCall?.condition ?? null)).toMatchObject({
			id: 'deduction-active',
			organization_id: 'org-test',
			employee_id: 'employee-1',
		});
	});

	it('transitions from PAUSED to ACTIVE successfully', async () => {
		dbState.deductions = [
			dbState.deductions[1] as FakeDeductionRow,
			dbState.deductions[0] as FakeDeductionRow,
			dbState.deductions[2] as FakeDeductionRow,
		];
		const { employeeDeductionRoutes } = await import('./employee-deductions.js');

		const response = await employeeDeductionRoutes.handle(
			createJsonRequest(
				'PUT',
				'/organizations/org-test/employees/employee-1/deductions/deduction-paused',
				{
					status: 'ACTIVE',
				},
			),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			data: {
				id: 'deduction-paused',
				status: 'ACTIVE',
			},
		});
		expect(dbState.deductions.find((entry) => entry.id === 'deduction-paused')?.status).toBe(
			'ACTIVE',
		);
	});

	it('rejects invalid status transitions on update', async () => {
		const { employeeDeductionRoutes } = await import('./employee-deductions.js');

		const response = await employeeDeductionRoutes.handle(
			createJsonRequest(
				'PUT',
				'/organizations/org-test/employees/employee-1/deductions/deduction-cancelled',
				{
					status: 'ACTIVE',
				},
			),
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			error: {
				message: 'Invalid status transition from CANCELLED to ACTIVE',
			},
		});
	});

	describe('error handling', () => {
		it('returns 404 for non-existent employee', async () => {
			dbState.employees = [];
			const { employeeDeductionRoutes } = await import('./employee-deductions.js');

			const response = await employeeDeductionRoutes.handle(
				createJsonRequest(
					'POST',
					'/organizations/org-test/employees/employee-1/deductions',
					{
						type: 'OTHER',
						label: 'Descuento inexistente',
						calculationMethod: 'FIXED_AMOUNT',
						value: 100,
						frequency: 'RECURRING',
						startDateKey: '2026-03-01',
					},
				),
			);

			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({
				error: {
					message: 'Employee not found',
					code: 'NOT_FOUND',
				},
			});
		});

		it('returns 404 for non-existent deduction', async () => {
			const { employeeDeductionRoutes } = await import('./employee-deductions.js');

			const response = await employeeDeductionRoutes.handle(
				createJsonRequest(
					'PUT',
					'/organizations/org-test/employees/employee-1/deductions/deduction-missing',
					{
						status: 'PAUSED',
					},
				),
			);

			expect(response.status).toBe(404);
			await expect(response.json()).resolves.toMatchObject({
				error: {
					message: 'Employee deduction not found',
					code: 'NOT_FOUND',
				},
			});
		});
	});

	it('rejects organization-wide deduction listing for non-admin members', async () => {
		dbState.memberRole = 'member';
		const { employeeDeductionRoutes } = await import('./employee-deductions.js');

		const response = await employeeDeductionRoutes.handle(
			createJsonRequest('GET', '/organizations/org-test/deductions?limit=10&offset=0'),
		);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({
			error: {
				message: 'Only owner/admin can manage employee deductions',
			},
		});
	});

	it('pushes organization-wide filters and pagination to the deductions queries', async () => {
		dbState.employees = [
			{
				id: 'employee-1',
				organizationId: 'org-test',
				firstName: 'Ada',
				lastName: 'Lovelace',
			},
			{
				id: 'employee-2',
				organizationId: 'org-test',
				firstName: 'Grace',
				lastName: 'Hopper',
			},
		];
		dbState.deductions = [
			dbState.deductions[1] as FakeDeductionRow,
			{
				...(dbState.deductions[1] as FakeDeductionRow),
				id: 'deduction-paused-employee-2',
				employeeId: 'employee-2',
			},
			{
				...(dbState.deductions[1] as FakeDeductionRow),
				id: 'deduction-active-other',
				status: 'ACTIVE',
			},
		];

		const { employeeDeductionRoutes } = await import('./employee-deductions.js');

		const response = await employeeDeductionRoutes.handle(
			createJsonRequest(
				'GET',
				'/organizations/org-test/deductions?status=PAUSED&type=OTHER&employeeId=employee-1&limit=1&offset=0',
			),
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			data: [
				{
					id: 'deduction-paused',
					employeeId: 'employee-1',
				},
			],
			pagination: {
				limit: 1,
				offset: 0,
				total: 1,
			},
		});

		const deductionSelectCalls = dbInspection.selects.filter(
			(call) => call.tableName === 'employee_deduction',
		);
		const countCall = deductionSelectCalls.find((call) => call.selection === 'count');
		const pageCall = deductionSelectCalls.find((call) => call.selection === 'all');

		expect(flattenEqualityConditions(countCall?.condition ?? null)).toMatchObject({
			organization_id: 'org-test',
			status: 'PAUSED',
			type: 'OTHER',
			employee_id: 'employee-1',
		});
		expect(flattenEqualityConditions(pageCall?.condition ?? null)).toMatchObject({
			organization_id: 'org-test',
			status: 'PAUSED',
			type: 'OTHER',
			employee_id: 'employee-1',
		});
		expect(pageCall).toMatchObject({
			limit: 1,
			offset: 0,
		});
	});
});
