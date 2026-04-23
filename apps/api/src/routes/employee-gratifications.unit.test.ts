import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';

mock.restore();

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

interface FakeEmployeeRow {
	id: string;
	organizationId: string;
	firstName: string;
	lastName: string;
}

interface FakeGratificationRow {
	id: string;
	organizationId: string;
	employeeId: string;
	concept: string;
	amount: string;
	periodicity: 'ONE_TIME' | 'RECURRING';
	applicationMode: 'MANUAL' | 'AUTOMATIC';
	status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
	startDateKey: string;
	endDateKey: string | null;
	notes: string | null;
	createdByUserId: string;
	createdAt: Date;
	updatedAt: Date;
}

interface FakeDbState {
	organizationId: string;
	memberRole: 'admin' | 'member';
	employees: FakeEmployeeRow[];
	gratifications: FakeGratificationRow[];
}

interface FakeQueryLike {
	from(table: unknown): FakeQueryLike;
	leftJoin(): FakeQueryLike;
	where(condition: DrizzleCondition): FakeQueryLike;
	limit(count: number): FakeQueryLike;
	offset(count: number): FakeQueryLike;
	orderBy(): FakeQueryLike;
	then<TResult1 = unknown[], TResult2 = never>(
		onfulfilled?:
			| ((value: unknown[]) => TResult1 | PromiseLike<TResult1>)
			| null
			| undefined,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined,
	): Promise<TResult1 | TResult2>;
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

/**
 * Resolves a Drizzle table name from a table object.
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
 * Resolves a Drizzle column name from a column object.
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
 * Evaluates a simplified Drizzle condition tree.
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

	const columnName = getColumnName(condition.column);
	if (!columnName) {
		return true;
	}

	const normalizedColumnName = columnName
		.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())
		.replace(/^organizationId$/, 'organizationId');

	if (condition.kind === 'eq') {
		return row[normalizedColumnName] === condition.value;
	}

	if (condition.kind === 'inArray') {
		return condition.values.includes(row[normalizedColumnName]);
	}

	return true;
}

/**
 * Creates a fake Drizzle DB facade for gratification route tests.
 *
 * @param state - Shared mutable DB state
 * @returns Fake database implementation
 */
function createFakeDb(state: FakeDbState): {
	select: (selection?: Record<string, unknown>) => FakeQueryLike;
	insert: (table: unknown) => {
		values: (values: Record<string, unknown>) => {
			returning: () => Promise<FakeGratificationRow[]>;
		};
	};
	update: (table: unknown) => {
		set: (values: Record<string, unknown>) => {
			where: (condition: DrizzleCondition) => {
				returning: () => Promise<FakeGratificationRow[]>;
			};
		};
	};
} {
	class FakeQuery implements FakeQueryLike {
		private tableName: string | null = null;
		private condition: DrizzleCondition | null = null;
		private limitCount: number | null = null;
		private offsetCount = 0;

		constructor(private readonly selection?: Record<string, unknown>) {}

		from(table: unknown): this {
			this.tableName = getTableName(table);
			return this;
		}

		leftJoin(): this {
			return this;
		}

		where(condition: DrizzleCondition): this {
			this.condition = condition;
			return this;
		}

		limit(count: number): this {
			this.limitCount = count;
			return this;
		}

		offset(count: number): this {
			this.offsetCount = count;
			return this;
		}

		orderBy(): this {
			return this;
		}

		private execute(): unknown[] {
			const isCountSelection = Object.values(this.selection ?? {}).some(
				(value) =>
					typeof value === 'object' && value !== null && (value as { kind?: string }).kind === 'count',
			);

			if (this.tableName === 'member') {
				return [{ role: state.memberRole }];
			}

			if (this.tableName === 'employee') {
				return state.employees.filter((row) =>
					matchesCondition(row as unknown as Record<string, unknown>, this.condition),
				);
			}

			if (this.tableName === 'employee_gratification') {
				const rows = state.gratifications.filter((row) =>
					matchesCondition(row as unknown as Record<string, unknown>, this.condition),
				);
				const paginatedRows = rows.slice(
					this.offsetCount,
					this.limitCount === null ? undefined : this.offsetCount + this.limitCount,
				);
				return isCountSelection ? [{ count: rows.length }] : paginatedRows;
			}

			return isCountSelection ? [{ count: 0 }] : [];
		}

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

	return {
		select: (selection?: Record<string, unknown>) => new FakeQuery(selection),
		insert: (table: unknown) => ({
			values: (values: Record<string, unknown>) => ({
				returning: async (): Promise<FakeGratificationRow[]> => {
					void table;
					const created: FakeGratificationRow = {
						id: (values.id as string | undefined) ?? 'gratification-created',
						organizationId: values.organizationId as string,
						employeeId: values.employeeId as string,
						concept: values.concept as string,
						amount: String(values.amount),
						periodicity: values.periodicity as FakeGratificationRow['periodicity'],
						applicationMode: values.applicationMode as FakeGratificationRow['applicationMode'],
						status: (values.status as FakeGratificationRow['status'] | undefined) ?? 'ACTIVE',
						startDateKey: values.startDateKey as string,
						endDateKey: (values.endDateKey as string | null | undefined) ?? null,
						notes: (values.notes as string | null | undefined) ?? null,
						createdByUserId: values.createdByUserId as string,
						createdAt: new Date('2026-03-13T00:00:00.000Z'),
						updatedAt: new Date('2026-03-13T00:00:00.000Z'),
					};
					state.gratifications.push(created);
					return [created];
				},
			}),
		}),
		update: (table: unknown) => ({
			set: (values: Record<string, unknown>) => ({
				where: (condition: DrizzleCondition) => ({
					returning: async (): Promise<FakeGratificationRow[]> => {
						const tableName = getTableName(table);
						void tableName;
						const row = state.gratifications.find((entry) =>
							matchesCondition(entry as unknown as Record<string, unknown>, condition),
						);
						if (!row) {
							return [];
						}

						const updated: FakeGratificationRow = {
							...row,
							...values,
							amount: values.amount === undefined ? row.amount : String(values.amount),
							endDateKey:
								values.endDateKey === undefined
									? row.endDateKey
									: (values.endDateKey as string | null),
							notes:
								values.notes === undefined ? row.notes : (values.notes as string | null),
							updatedAt: new Date('2026-03-13T01:00:00.000Z'),
						};
						const index = state.gratifications.findIndex((entry) => entry.id === row.id);
						state.gratifications[index] = updated;
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
	gratifications: [],
};

const fakeDb = createFakeDb(dbState);

mock.module('drizzle-orm', () => ({
	and: (...conditions: DrizzleCondition[]) => ({ kind: 'and' as const, conditions }),
	count: () => ({ kind: 'count' as const }),
	desc: (value: unknown) => ({ value }),
	eq: (column: unknown, value: unknown) => ({ kind: 'eq' as const, column, value }),
	inArray: (column: unknown, values: unknown[]) => ({
		kind: 'inArray' as const,
		column,
		values,
	}),
	relations: () => ({}),
	sql: sqlTag,
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
	resolveOrganizationId: ({
		requestedOrganizationId,
		session,
	}: {
		requestedOrganizationId?: string | null;
		session?: { activeOrganizationId?: string | null } | null;
	}) => requestedOrganizationId ?? session?.activeOrganizationId ?? dbState.organizationId,
}));

afterAll(() => {
	mock.restore();
});

describe('employee gratification routes', () => {
	beforeEach(() => {
		dbState.memberRole = 'admin';
		dbState.gratifications = [
			{
				id: 'gratification-active',
				organizationId: 'org-test',
				employeeId: 'employee-1',
				concept: 'Bono trimestral',
				amount: '1500.00',
				periodicity: 'RECURRING',
				applicationMode: 'AUTOMATIC',
				status: 'ACTIVE',
				startDateKey: '2026-03-01',
				endDateKey: null,
				notes: 'Vigente',
				createdByUserId: 'user-1',
				createdAt: new Date('2026-03-01T00:00:00.000Z'),
				updatedAt: new Date('2026-03-01T00:00:00.000Z'),
			},
		];
	});

	it('creates, lists, updates, and cancels employee gratifications', async () => {
		const { employeeGratificationRoutes } = await import('./employee-gratifications.js');

		const createResponse = await employeeGratificationRoutes.handle(
			createJsonRequest(
				'POST',
				'/organizations/org-test/employees/employee-1/gratifications',
				{
					concept: 'Bono por cumpleaños',
					amount: 2500,
					periodicity: 'ONE_TIME',
					applicationMode: 'MANUAL',
					startDateKey: '2026-03-10',
					notes: 'Alta inicial',
				},
			),
		);

		expect(createResponse.status).toBe(201);
		const createdPayload = await createResponse.json();
		const createdGratification = (createdPayload as { data: { id: string; status: string } }).data;
		expect(createdGratification.status).toBe('ACTIVE');

		const listResponse = await employeeGratificationRoutes.handle(
			createJsonRequest('GET', '/organizations/org-test/employees/employee-1/gratifications'),
		);

		expect(listResponse.status).toBe(200);
		const listPayload = await listResponse.json();
		expect(
			(listPayload as { data: Array<{ id: string }> }).data.some(
				(item) => item.id === createdGratification.id,
			),
		).toBe(true);

		const detailRoute = (await import('./employee-gratifications.js')).employeeGratificationRoutes;
		const updateResponse = await detailRoute.handle(
			createJsonRequest(
				'PUT',
				`/organizations/org-test/employees/employee-1/gratifications/${createdGratification.id}`,
				{
					status: 'PAUSED',
					notes: 'Pausa temporal',
				},
			),
		);

		expect(updateResponse.status).toBe(200);
		const updatedPayload = await updateResponse.json();
		expect((updatedPayload as { data: { status: string; notes: string | null } }).data).toMatchObject(
			{
				status: 'PAUSED',
				notes: 'Pausa temporal',
			},
		);

		const deleteResponse = await detailRoute.handle(
			createJsonRequest(
				'DELETE',
				`/organizations/org-test/employees/employee-1/gratifications/${createdGratification.id}`,
			),
		);

		expect(deleteResponse.status).toBe(200);
		const deletedPayload = await deleteResponse.json();
		expect((deletedPayload as { data: { status: string } }).data.status).toBe('CANCELLED');
	});

	it('rejects gratification creation for non-admin members', async () => {
		dbState.memberRole = 'member';
		const { employeeGratificationRoutes } = await import('./employee-gratifications.js');

		const response = await employeeGratificationRoutes.handle(
			createJsonRequest(
				'POST',
				'/organizations/org-test/employees/employee-1/gratifications',
				{
					concept: 'Bono no autorizado',
					amount: 200,
					periodicity: 'ONE_TIME',
					applicationMode: 'MANUAL',
					startDateKey: '2026-03-10',
				},
			),
		);

		expect(response.status).toBe(403);
		const payload = await response.json();
		expect(payload).toMatchObject({
			error: {
				message: 'Only owner/admin can manage employee gratifications',
			},
		});
	});
});
