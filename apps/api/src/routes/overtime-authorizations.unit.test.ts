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
			kind: 'gte' | 'lte';
			column: unknown;
			value: Date | string;
	  };

interface FakeAuthorizationRow {
	id: string;
	organizationId: string;
	employeeId: string;
	dateKey: string;
	authorizedHours: string;
	authorizedByUserId: string | null;
	status: 'PENDING' | 'ACTIVE' | 'CANCELLED';
	notes: string | null;
	createdAt: Date;
	updatedAt: Date;
}

interface FakeDbState {
	organizationId: string;
	existingAuthorization: FakeAuthorizationRow | null;
	updateReturningRows: FakeAuthorizationRow[];
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
 * Minimal thenable query builder for route-level unit tests.
 */
class FakeQuery {
	private tableName: string | null = null;

	/**
	 * Creates the builder.
	 *
	 * @param state - Shared mutable DB state
	 */
	constructor(private readonly state: FakeDbState) {}

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
	 * Accepts a WHERE clause without evaluating it.
	 *
	 * @param condition - Drizzle-like condition tree
	 * @returns The query builder
	 */
	where(condition: DrizzleCondition): this {
		void condition;
		return this;
	}

	/**
	 * Accepts a LIMIT clause without evaluating it.
	 *
	 * @param count - Maximum rows to return
	 * @returns The query builder
	 */
	limit(count: number): this {
		void count;
		return this;
	}

	/**
	 * Resolves rows for the active table.
	 *
	 * @returns Fake query results
	 */
	private execute(): unknown[] {
		if (this.tableName === 'member') {
			return [{ role: 'admin' }];
		}
		if (this.tableName === 'employee') {
			return [{ id: 'employee-1' }];
		}
		if (this.tableName === 'payroll_setting') {
			return [{ timeZone: 'America/Mexico_City' }];
		}
		if (this.tableName === 'overtime_authorization') {
			return this.state.existingAuthorization ? [this.state.existingAuthorization] : [];
		}
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
 * Creates a fake Drizzle DB facade for the overtime route handlers.
 *
 * @param state - Shared mutable DB state
 * @returns Fake database implementation
 */
function createFakeDb(state: FakeDbState): {
	select: () => FakeQuery;
	update: (table: unknown) => {
		set: (values: Record<string, unknown>) => {
			where: (condition: DrizzleCondition) => {
				returning: () => Promise<FakeAuthorizationRow[]>;
			};
		};
	};
} {
	return {
		select: () => new FakeQuery(state),
		update: (table: unknown) => ({
			set: (values: Record<string, unknown>) => ({
				where: (condition: DrizzleCondition) => ({
					returning: async (): Promise<FakeAuthorizationRow[]> => {
						void table;
						void values;
						void condition;
						return state.updateReturningRows;
					},
				}),
			}),
		}),
	};
}

const dbState: FakeDbState = {
	organizationId: 'org-test',
	existingAuthorization: null,
	updateReturningRows: [],
};

const fakeDb = createFakeDb(dbState);

/**
 * Mock implementation of drizzle's SQL tag.
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
	lte: (column: unknown, value: Date | string) => ({
		kind: 'lte' as const,
		column,
		value,
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
	resolveOrganizationId: ({ requestedOrganizationId }: { requestedOrganizationId?: string | null }) =>
		requestedOrganizationId ?? dbState.organizationId,
}));

describe('overtime authorization routes', () => {
	beforeEach(() => {
		dbState.organizationId = 'org-test';
		dbState.existingAuthorization = {
			id: 'authorization-1',
			organizationId: dbState.organizationId,
			employeeId: 'employee-1',
			dateKey: '2099-01-10',
			authorizedHours: '2.00',
			authorizedByUserId: 'user-1',
			status: 'ACTIVE',
			notes: 'Autorizacion inicial',
			createdAt: new Date('2099-01-01T00:00:00.000Z'),
			updatedAt: new Date('2099-01-01T00:00:00.000Z'),
		};
		dbState.updateReturningRows = [];
	});

	it('returns 500 when update loses the row before returning data', async () => {
		const { overtimeAuthorizationRoutes } = await import('./overtime-authorizations.js');

		const response = await overtimeAuthorizationRoutes.handle(
			createJsonRequest(
				'PUT',
				`/organizations/${dbState.organizationId}/overtime-authorizations/${dbState.existingAuthorization?.id}`,
				{
					authorizedHours: 3,
				},
			),
		);

		expect(response.status).toBe(500);
		const payload = (await response.json()) as {
			error: {
				message: string;
				code: string;
			};
		};
		expect(payload.error.message).toBe('Failed to update overtime authorization');
		expect(payload.error.code).toBe('INTERNAL_ERROR');
	});

	it('returns the legal warning when updating authorized hours above three', async () => {
		const existingAuthorization = dbState.existingAuthorization;
		if (!existingAuthorization) {
			throw new Error('Expected existing overtime authorization.');
		}

		dbState.updateReturningRows = [
			{
				...existingAuthorization,
				authorizedHours: '4.00',
				notes: 'Extension extraordinaria',
				updatedAt: new Date('2099-01-02T00:00:00.000Z'),
			},
		];

		const { overtimeAuthorizationRoutes } = await import('./overtime-authorizations.js');

		const response = await overtimeAuthorizationRoutes.handle(
			createJsonRequest(
				'PUT',
				`/organizations/${dbState.organizationId}/overtime-authorizations/${existingAuthorization.id}`,
				{
					authorizedHours: 4,
					notes: 'Extension extraordinaria',
				},
			),
		);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			data: {
				id: string;
				authorizedHours: number;
			};
			warning?: string;
		};
		expect(payload.data.id).toBe(existingAuthorization.id);
		expect(payload.data.authorizedHours).toBe(4);
		expect(payload.warning).toBe(
			'Las horas autorizadas exceden el limite diario de 3 horas establecido por la LFT. Horas superiores a 3 se pagan a tasa triple.',
		);
	});

	it('rejects updates for cancelled authorizations', async () => {
		dbState.existingAuthorization = {
			...(dbState.existingAuthorization as FakeAuthorizationRow),
			status: 'CANCELLED',
		};

		const { overtimeAuthorizationRoutes } = await import('./overtime-authorizations.js');

		const response = await overtimeAuthorizationRoutes.handle(
			createJsonRequest(
				'PUT',
				`/organizations/${dbState.organizationId}/overtime-authorizations/${dbState.existingAuthorization.id}`,
				{
					authorizedHours: 3,
				},
			),
		);

		expect(response.status).toBe(400);
		const payload = (await response.json()) as {
			error: {
				message: string;
				code: string;
			};
		};
		expect(payload.error.message).toBe(
			'Cannot modify a cancelled overtime authorization. Create a new one instead.',
		);
		expect(payload.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns the legal warning when reactivating a cancelled authorization above three hours', async () => {
		dbState.existingAuthorization = {
			...(dbState.existingAuthorization as FakeAuthorizationRow),
			status: 'CANCELLED',
		};
		dbState.updateReturningRows = [
			{
				...(dbState.existingAuthorization as FakeAuthorizationRow),
				status: 'ACTIVE',
				authorizedHours: '4.00',
				notes: 'Reactivada con jornada extraordinaria',
				updatedAt: new Date('2099-01-02T00:00:00.000Z'),
			},
		];

		const { overtimeAuthorizationRoutes } = await import('./overtime-authorizations.js');

		const response = await overtimeAuthorizationRoutes.handle(
			createJsonRequest(
				'POST',
				`/organizations/${dbState.organizationId}/overtime-authorizations`,
				{
					employeeId: 'employee-1',
					dateKey: dbState.existingAuthorization?.dateKey,
					authorizedHours: 4,
					notes: 'Reactivada con jornada extraordinaria',
				},
			),
		);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			data: {
				id: string;
				status: string;
				authorizedHours: number;
			};
			warning?: string;
		};
		expect(payload.data.id).toBe(dbState.existingAuthorization?.id);
		expect(payload.data.status).toBe('ACTIVE');
		expect(payload.data.authorizedHours).toBe(4);
		expect(payload.warning).toBe(
			'Las horas autorizadas exceden el limite diario de 3 horas establecido por la LFT. Horas superiores a 3 se pagan a tasa triple.',
		);
	});

	it('returns 500 when cancellation update loses the row before returning data', async () => {
		const { overtimeAuthorizationRoutes } = await import('./overtime-authorizations.js');

		const response = await overtimeAuthorizationRoutes.handle(
			createJsonRequest(
				'DELETE',
				`/organizations/${dbState.organizationId}/overtime-authorizations/${dbState.existingAuthorization?.id}`,
			),
		);

		expect(response.status).toBe(500);
		const payload = (await response.json()) as {
			error: {
				message: string;
				code: string;
			};
		};
		expect(payload.error.message).toBe('Failed to cancel overtime authorization');
		expect(payload.error.code).toBe('INTERNAL_ERROR');
	});
});
