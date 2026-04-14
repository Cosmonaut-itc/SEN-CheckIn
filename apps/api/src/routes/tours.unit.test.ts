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
	  };

interface TourProgressRow {
	tourId: string;
	status: 'completed' | 'skipped';
	completedAt: Date;
	userId: string;
	organizationId: string;
}

interface FakeDbState {
	progress: TourProgressRow[];
}

interface UpsertCall {
	values: {
		tourId: string;
		status: 'completed' | 'skipped';
		userId: string;
		organizationId: string;
	};
}

interface DeleteCall {
	condition: DrizzleCondition | null;
}

interface AuthState {
	authType: 'session' | 'apiKey';
	session: { userId: string; activeOrganizationId?: string | null } | null;
	sessionOrganizationIds: string[];
	apiKeyOrganizationId: string | null;
	apiKeyOrganizationIds: string[];
}

const authState: AuthState = {
	authType: 'session',
	session: {
		userId: 'user-1',
		activeOrganizationId: 'org-1',
	},
	sessionOrganizationIds: ['org-1'],
	apiKeyOrganizationId: null,
	apiKeyOrganizationIds: [],
};

const dbState: FakeDbState = {
	progress: [],
};

const dbInspection: {
	upserts: UpsertCall[];
	deletes: DeleteCall[];
} = {
	upserts: [],
	deletes: [],
};

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
 * Extracts a Drizzle column name from a column-like object.
 *
 * @param column - Column-like object
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

	const columnValue = column as { name?: unknown; config?: { name?: unknown } };
	if (typeof columnValue.name === 'string') {
		return columnValue.name;
	}

	if (typeof columnValue.config?.name === 'string') {
		return columnValue.config.name;
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
function matchesCondition(row: TourProgressRow, condition: DrizzleCondition | null): boolean {
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

		const normalizedColumnName = columnName.replace(/_([a-z])/g, (_, char: string) =>
			char.toUpperCase(),
		) as keyof TourProgressRow;
		return row[normalizedColumnName] === condition.value;
	}

	return true;
}

/**
 * Resets mutable test state.
 *
 * @returns Void
 */
function resetState(): void {
	dbState.progress = [
		{
			tourId: 'dashboard',
			status: 'completed',
			completedAt: new Date('2026-04-13T10:00:00.000Z'),
			userId: 'user-1',
			organizationId: 'org-1',
		},
		{
			tourId: 'employees',
			status: 'skipped',
			completedAt: new Date('2026-04-13T11:00:00.000Z'),
			userId: 'user-2',
			organizationId: 'org-1',
		},
	];
	authState.authType = 'session';
	authState.session = {
		userId: 'user-1',
		activeOrganizationId: 'org-1',
	};
	authState.sessionOrganizationIds = ['org-1'];
	authState.apiKeyOrganizationId = null;
	authState.apiKeyOrganizationIds = [];
	dbInspection.upserts = [];
	dbInspection.deletes = [];
}

/**
 * Minimal thenable query builder for route-level unit tests.
 */
class FakeSelectQuery {
	private condition: DrizzleCondition | null = null;

	/**
	 * Accepts a WHERE clause without executing immediately.
	 *
	 * @param condition - Drizzle condition tree
	 * @returns Query builder
	 */
	where(condition: DrizzleCondition): this {
		this.condition = condition;
		return this;
	}

	/**
	 * Implements PromiseLike so route code can await the query.
	 *
	 * @param onfulfilled - Success handler
	 * @param onrejected - Error handler
	 * @returns Promise of fake query rows
	 */
	then<TResult1 = unknown, TResult2 = never>(
		onfulfilled?:
			| ((value: { tourId: string; status: string; completedAt: Date }[]) => TResult1 | PromiseLike<TResult1>)
			| null
			| undefined,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined,
	): Promise<TResult1 | TResult2> {
		const rows = dbState.progress
			.filter((row) => matchesCondition(row, this.condition))
			.map((row) => ({
				tourId: row.tourId,
				status: row.status,
				completedAt: row.completedAt,
			}));

		return Promise.resolve(rows).then(onfulfilled, onrejected);
	}
}

const fakeDb = {
	select: () => ({
		from: () => new FakeSelectQuery(),
	}),
	insert: () => ({
		values: (values: UpsertCall['values']) => ({
			onConflictDoUpdate: async (): Promise<void> => {
				dbInspection.upserts.push({ values });
				const existingIndex = dbState.progress.findIndex(
					(entry) =>
						entry.userId === values.userId &&
						entry.organizationId === values.organizationId &&
						entry.tourId === values.tourId,
				);
				const nextRow: TourProgressRow = {
					...values,
					completedAt: new Date('2026-04-14T12:00:00.000Z'),
				};
				if (existingIndex >= 0) {
					dbState.progress[existingIndex] = nextRow;
					return;
				}
				dbState.progress.push(nextRow);
			},
		}),
	}),
	delete: () => ({
		where: async (condition: DrizzleCondition): Promise<void> => {
			dbInspection.deletes.push({ condition });
			dbState.progress = dbState.progress.filter((row) => !matchesCondition(row, condition));
		},
	}),
};

mock.module('drizzle-orm', () => ({
	and: (...conditions: DrizzleCondition[]) => ({ kind: 'and' as const, conditions }),
	eq: (column: unknown, value: unknown) => ({ kind: 'eq' as const, column, value }),
	relations: () => ({}),
}));

mock.module('../db/index.js', () => ({ default: fakeDb }));
mock.module('../plugins/auth.js', () => ({
	combinedAuthPlugin: new Elysia({ name: 'mock-auth-plugin' }).derive(
		{ as: 'scoped' },
		() => ({
			authType: authState.authType,
			session: authState.session,
			sessionOrganizationIds: authState.sessionOrganizationIds,
			apiKeyOrganizationId: authState.apiKeyOrganizationId,
			apiKeyOrganizationIds: authState.apiKeyOrganizationIds,
		}),
	),
}));

const { tourRoutes } = await import('./tours.js');

describe('tour routes', () => {
	beforeEach(() => {
		resetState();
	});

	afterAll(() => {
		mock.restore();
	});

	it('returns tour progress for the authenticated session user and active organization', async () => {
		const response = await tourRoutes.handle(createJsonRequest('GET', '/tours/progress'));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({
			data: {
				tours: [
					{
						tourId: 'dashboard',
						status: 'completed',
						completedAt: '2026-04-13T10:00:00.000Z',
					},
				],
			},
		});
	});

	it('rejects progress reads for api-key auth because a user session is required', async () => {
		authState.authType = 'apiKey';
		authState.session = null;
		authState.apiKeyOrganizationId = 'org-1';

		const response = await tourRoutes.handle(createJsonRequest('GET', '/tours/progress'));
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body).toEqual({
			error: {
				message: 'Session auth required',
				code: 'UNAUTHORIZED',
			},
		});
	});

	it('upserts completed tour progress for the active user and organization', async () => {
		const response = await tourRoutes.handle(
			createJsonRequest('POST', '/tours/employees/complete', { status: 'completed' }),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({
			data: {
				tourId: 'employees',
				status: 'completed',
			},
		});
		expect(dbInspection.upserts).toEqual([
			{
				values: {
					tourId: 'employees',
					status: 'completed',
					userId: 'user-1',
					organizationId: 'org-1',
				},
			},
		]);
	});

	it('deletes tour progress for the active user and organization', async () => {
		const response = await tourRoutes.handle(
			createJsonRequest('DELETE', '/tours/dashboard/progress'),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({
			data: {
				tourId: 'dashboard',
				deleted: true,
			},
		});
		expect(dbInspection.deletes).toHaveLength(1);
		expect(dbState.progress).toEqual([
			{
				tourId: 'employees',
				status: 'skipped',
				completedAt: new Date('2026-04-13T11:00:00.000Z'),
				userId: 'user-2',
				organizationId: 'org-1',
			},
		]);
	});
});
