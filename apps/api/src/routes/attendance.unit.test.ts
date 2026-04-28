import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';

mock.restore();

interface ResolveOrganizationIdArgs {
	requestedOrganizationId?: string | null;
}

interface AuthState {
	authType: 'session' | 'apiKey';
	session: null;
	sessionOrganizationIds: string[];
	apiKeyOrganizationId: string | null;
	apiKeyOrganizationIds: string[];
}

const authState: AuthState = {
	authType: 'apiKey',
	session: null,
	sessionOrganizationIds: [],
	apiKeyOrganizationId: null,
	apiKeyOrganizationIds: ['org-1', 'org-2'],
};

const resolveOrganizationIdCalls: ResolveOrganizationIdArgs[] = [];
const dbState: {
	selectResults: unknown[];
} = {
	selectResults: [],
};

/**
 * Builds a JSON request for route testing.
 *
 * @param path - Request path with query string
 * @returns GET request object
 */
function createGetRequest(path: string): Request {
	return new Request(`http://localhost${path}`);
}

/**
 * Restores mutable auth and fake-db state before each test.
 *
 * @returns Nothing
 */
function resetState(): void {
	authState.authType = 'apiKey';
	authState.session = null;
	authState.sessionOrganizationIds = [];
	authState.apiKeyOrganizationId = null;
	authState.apiKeyOrganizationIds = ['org-1', 'org-2'];
	resolveOrganizationIdCalls.length = 0;
	dbState.selectResults = [];
}

/**
 * Promise-like query builder that returns queued fake DB results.
 */
class FakeQueryBuilder {
	/**
	 * Accepts the `from` call in Drizzle chains.
	 *
	 * @returns Query builder
	 */
	from(): this {
		return this;
	}

	/**
	 * Accepts inner joins without executing.
	 *
	 * @returns Query builder
	 */
	innerJoin(): this {
		return this;
	}

	/**
	 * Accepts left joins without executing.
	 *
	 * @returns Query builder
	 */
	leftJoin(): this {
		return this;
	}

	/**
	 * Accepts where clauses without executing.
	 *
	 * @returns Query builder
	 */
	where(): this {
		return this;
	}

	/**
	 * Accepts order-by clauses without executing.
	 *
	 * @returns Query builder
	 */
	orderBy(): this {
		return this;
	}

	/**
	 * Accepts limit clauses without executing.
	 *
	 * @returns Query builder
	 */
	limit(): this {
		return this;
	}

	/**
	 * Accepts offset clauses without executing.
	 *
	 * @returns Query builder
	 */
	offset(): this {
		return this;
	}

	/**
	 * Accepts group-by clauses without executing.
	 *
	 * @returns Query builder
	 */
	groupBy(): this {
		return this;
	}

	/**
	 * Resolves queued fake query rows when the route awaits the chain.
	 *
	 * @param onfulfilled - Success continuation
	 * @param onrejected - Error continuation
	 * @returns Promise of queued rows
	 */
	then<TResult1 = unknown, TResult2 = never>(
		onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null | undefined,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined,
	): Promise<TResult1 | TResult2> {
		const nextResult = dbState.selectResults.shift() ?? [];
		return Promise.resolve(nextResult).then(onfulfilled, onrejected);
	}
}

const fakeDb = {
	select: () => new FakeQueryBuilder(),
};

/**
 * Minimal SQL tag mock for route construction.
 *
 * @param strings - Template segments
 * @param values - Interpolated values
 * @returns Simplified SQL descriptor
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
	and: (...conditions: unknown[]) => ({ kind: 'and' as const, conditions }),
	count: () => ({ kind: 'count' as const }),
	desc: (value: unknown) => ({ kind: 'desc' as const, value }),
	eq: (column: unknown, value: unknown) => ({ kind: 'eq' as const, column, value }),
	gte: (column: unknown, value: unknown) => ({ kind: 'gte' as const, column, value }),
	ilike: (column: unknown, value: unknown) => ({ kind: 'ilike' as const, column, value }),
	inArray: (column: unknown, value: unknown) => ({ kind: 'inArray' as const, column, value }),
	lt: (column: unknown, value: unknown) => ({ kind: 'lt' as const, column, value }),
	lte: (column: unknown, value: unknown) => ({ kind: 'lte' as const, column, value }),
	ne: (column: unknown, value: unknown) => ({ kind: 'ne' as const, column, value }),
	or: (...conditions: unknown[]) => ({ kind: 'or' as const, conditions }),
	relations: () => ({}),
	sql: Object.assign(sqlTag, {
		raw: (value: string) => ({ raw: value }),
	}),
}));

mock.module('../db/index.js', () => ({ default: fakeDb }));
mock.module('../plugins/auth.js', () => ({
	combinedAuthPlugin: new Elysia({ name: 'mock-auth-plugin' }).derive({ as: 'scoped' }, () => ({
		authType: authState.authType,
		session: authState.session,
		sessionOrganizationIds: authState.sessionOrganizationIds,
		apiKeyOrganizationId: authState.apiKeyOrganizationId,
		apiKeyOrganizationIds: authState.apiKeyOrganizationIds,
	})),
}));
mock.module('../utils/error-response.js', () => ({
	buildErrorResponse: (message: string, status: number) => ({
		error: { message, code: status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST' },
	}),
}));
mock.module('../utils/organization.js', () => ({
	hasOrganizationAccess: () => true,
	resolveOrganizationId: (args: ResolveOrganizationIdArgs) => {
		resolveOrganizationIdCalls.push(args);
		return args.requestedOrganizationId ?? null;
	},
}));

describe('attendance dashboard routes', () => {
	beforeEach(() => {
		resetState();
	});

	afterAll(() => {
		mock.restore();
	});

	it('allows multi-org api keys to disambiguate organization on timeline requests', async () => {
		dbState.selectResults = [
			[{ timeZone: 'America/Mexico_City' }],
			[],
			[{ count: 0 }],
			[{ count: 0 }],
		];

		const { attendanceRoutes } = await import('./attendance.js');
		const response = await attendanceRoutes.handle(
			createGetRequest('/attendance/timeline?organizationId=org-2&limit=50&offset=0'),
		);

		expect(response.status).toBe(200);
		expect(resolveOrganizationIdCalls.at(-1)?.requestedOrganizationId).toBe('org-2');
		const payload = (await response.json()) as {
			data: unknown[];
			pagination: { total: number };
			summary: { lateTotal: number };
		};
		expect(payload.data).toEqual([]);
		expect(payload.pagination.total).toBe(0);
		expect(payload.summary.lateTotal).toBe(0);
	});

	it('rejects multi-org api key timeline requests without organization disambiguation', async () => {
		const { attendanceRoutes } = await import('./attendance.js');
		const response = await attendanceRoutes.handle(
			createGetRequest('/attendance/timeline?limit=50&offset=0'),
		);

		expect(response.status).toBe(403);
		expect(resolveOrganizationIdCalls.at(-1)?.requestedOrganizationId).toBeNull();
		const payload = (await response.json()) as { error: { message: string } };
		expect(payload.error.message).toBe('Organization is required or not permitted');
	});

	it('allows multi-org api keys to disambiguate organization on hourly requests', async () => {
		dbState.selectResults = [[{ timeZone: 'America/Mexico_City' }], []];

		const { attendanceRoutes } = await import('./attendance.js');
		const response = await attendanceRoutes.handle(
			createGetRequest('/attendance/hourly?organizationId=org-1&date=2026-04-21'),
		);

		expect(response.status).toBe(200);
		expect(resolveOrganizationIdCalls.at(-1)?.requestedOrganizationId).toBe('org-1');
		const payload = (await response.json()) as {
			data: Array<{ hour: number; count: number }>;
			date: string;
		};
		expect(payload.date).toBe('2026-04-21');
		expect(payload.data).toHaveLength(24);
		expect(payload.data.every((row) => row.count === 0)).toBe(true);
	});

	it('allows multi-org api keys to disambiguate organization on staffing coverage requests', async () => {
		dbState.selectResults = [[{ timeZone: 'America/Mexico_City' }], [], [], [], [], []];

		const { attendanceRoutes } = await import('./attendance.js');
		const response = await attendanceRoutes.handle(
			createGetRequest(
				'/attendance/staffing-coverage?organizationId=org-2&date=2026-04-20',
			),
		);

		expect(response.status).toBe(200);
		expect(resolveOrganizationIdCalls.at(-1)?.requestedOrganizationId).toBe('org-2');
		const payload = (await response.json()) as {
			dateKey: string;
			data: unknown[];
		};
		expect(payload.dateKey).toBe('2026-04-20');
		expect(payload.data).toEqual([]);
	});

	it('maps legacy Mexico City manual schedule exceptions to the requested staffing coverage date', async () => {
		dbState.selectResults = [
			[{ timeZone: 'America/Tijuana' }],
			[
				{
					id: 'requirement-guards',
					organizationId: 'org-2',
					locationId: 'location-1',
					locationName: 'Planta Norte',
					jobPositionId: 'position-guard',
					jobPositionName: 'Guardia',
					minimumRequired: 1,
				},
			],
			[
				{
					id: 'employee-1',
					organizationId: 'org-2',
					firstName: 'Ana',
					lastName: 'Lara',
					code: 'A001',
					status: 'ACTIVE',
					locationId: 'location-1',
					jobPositionId: 'position-guard',
					scheduleTemplateId: null,
				},
			],
			[
				{
					employeeId: 'employee-1',
					dayOfWeek: 1,
					isWorkingDay: false,
				},
			],
			[
				{
					employeeId: 'employee-1',
					exceptionDate: new Date('2026-04-19T06:00:00.000Z'),
					exceptionType: 'MODIFIED',
				},
			],
			[],
		];

		const { attendanceRoutes } = await import('./attendance.js');
		const response = await attendanceRoutes.handle(
			createGetRequest('/attendance/staffing-coverage?organizationId=org-2&date=2026-04-20'),
		);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			data: Array<{ scheduledCount: number; employees: Array<{ employeeId: string }> }>;
		};
		expect(payload.data[0]?.scheduledCount).toBe(1);
		expect(payload.data[0]?.employees).toEqual([
			expect.objectContaining({ employeeId: 'employee-1' }),
		]);
	});

	it('does not remap generated previous-day exceptions to the requested staffing coverage date', async () => {
		dbState.selectResults = [
			[{ timeZone: 'America/Mexico_City' }],
			[
				{
					id: 'requirement-guards',
					organizationId: 'org-2',
					locationId: 'location-1',
					locationName: 'Planta Norte',
					jobPositionId: 'position-guard',
					jobPositionName: 'Guardia',
					minimumRequired: 1,
				},
			],
			[
				{
					id: 'employee-1',
					organizationId: 'org-2',
					firstName: 'Ana',
					lastName: 'Lara',
					code: 'A001',
					status: 'ACTIVE',
					locationId: 'location-1',
					jobPositionId: 'position-guard',
					scheduleTemplateId: null,
				},
			],
			[
				{
					employeeId: 'employee-1',
					dayOfWeek: 1,
					isWorkingDay: false,
				},
			],
			[
				{
					employeeId: 'employee-1',
					exceptionDate: new Date('2026-04-19T06:00:00.000Z'),
					exceptionType: 'MODIFIED',
					vacationRequestId: 'vacation-1',
					incapacityId: null,
				},
			],
			[],
		];

		const { attendanceRoutes } = await import('./attendance.js');
		const response = await attendanceRoutes.handle(
			createGetRequest('/attendance/staffing-coverage?organizationId=org-2&date=2026-04-20'),
		);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			data: Array<{ scheduledCount: number; employees: Array<{ employeeId: string }> }>;
		};
		expect(payload.data[0]?.scheduledCount).toBe(0);
		expect(payload.data[0]?.employees).toEqual([]);
	});

	it('keeps generated UTC-midnight exceptions on the requested staffing coverage date', async () => {
		dbState.selectResults = [
			[{ timeZone: 'America/Mexico_City' }],
			[
				{
					id: 'requirement-guards',
					organizationId: 'org-2',
					locationId: 'location-1',
					locationName: 'Planta Norte',
					jobPositionId: 'position-guard',
					jobPositionName: 'Guardia',
					minimumRequired: 1,
				},
			],
			[
				{
					id: 'employee-1',
					organizationId: 'org-2',
					firstName: 'Ana',
					lastName: 'Lara',
					code: 'A001',
					status: 'ACTIVE',
					locationId: 'location-1',
					jobPositionId: 'position-guard',
					scheduleTemplateId: null,
				},
			],
			[
				{
					employeeId: 'employee-1',
					dayOfWeek: 1,
					isWorkingDay: true,
				},
			],
			[
				{
					employeeId: 'employee-1',
					exceptionDate: new Date('2026-04-20T00:00:00.000Z'),
					exceptionType: 'DAY_OFF',
					vacationRequestId: 'vacation-1',
					incapacityId: null,
				},
			],
			[],
		];

		const { attendanceRoutes } = await import('./attendance.js');
		const response = await attendanceRoutes.handle(
			createGetRequest('/attendance/staffing-coverage?organizationId=org-2&date=2026-04-20'),
		);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			data: Array<{ scheduledCount: number; employees: Array<{ employeeId: string }> }>;
		};
		expect(payload.data[0]?.scheduledCount).toBe(0);
		expect(payload.data[0]?.employees).toEqual([]);
	});

	it('keeps generated server-local midnight exceptions on the requested staffing coverage date', async () => {
		dbState.selectResults = [
			[{ timeZone: 'America/Los_Angeles' }],
			[
				{
					id: 'requirement-guards',
					organizationId: 'org-2',
					locationId: 'location-1',
					locationName: 'Planta Norte',
					jobPositionId: 'position-guard',
					jobPositionName: 'Guardia',
					minimumRequired: 1,
				},
			],
			[
				{
					id: 'employee-1',
					organizationId: 'org-2',
					firstName: 'Ana',
					lastName: 'Lara',
					code: 'A001',
					status: 'ACTIVE',
					locationId: 'location-1',
					jobPositionId: 'position-guard',
					scheduleTemplateId: null,
				},
			],
			[
				{
					employeeId: 'employee-1',
					dayOfWeek: 1,
					isWorkingDay: true,
				},
			],
			[
				{
					employeeId: 'employee-1',
					exceptionDate: new Date('2026-04-20T06:00:00.000Z'),
					exceptionType: 'DAY_OFF',
					vacationRequestId: 'vacation-1',
					incapacityId: null,
				},
			],
			[],
		];

		const { attendanceRoutes } = await import('./attendance.js');
		const response = await attendanceRoutes.handle(
			createGetRequest('/attendance/staffing-coverage?organizationId=org-2&date=2026-04-20'),
		);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			data: Array<{ scheduledCount: number; employees: Array<{ employeeId: string }> }>;
		};
		expect(payload.data[0]?.scheduledCount).toBe(0);
		expect(payload.data[0]?.employees).toEqual([]);
	});

	it('rejects multi-org api key staffing coverage requests without organization disambiguation', async () => {
		const { attendanceRoutes } = await import('./attendance.js');
		const response = await attendanceRoutes.handle(
			createGetRequest('/attendance/staffing-coverage?date=2026-04-20'),
		);

		expect(response.status).toBe(403);
		expect(resolveOrganizationIdCalls.at(-1)?.requestedOrganizationId).toBeNull();
		const payload = (await response.json()) as { error: { message: string } };
		expect(payload.error.message).toBe('Organization is required or not permitted');
	});

	it('allows multi-org api keys to disambiguate organization on staffing coverage stats requests', async () => {
		dbState.selectResults = [[{ timeZone: 'America/Mexico_City' }], [], [], [], [], []];

		const { attendanceRoutes } = await import('./attendance.js');
		const response = await attendanceRoutes.handle(
			createGetRequest('/attendance/staffing-coverage/stats?organizationId=org-1&days=2'),
		);

		expect(response.status).toBe(200);
		expect(resolveOrganizationIdCalls.at(-1)?.requestedOrganizationId).toBe('org-1');
		const payload = (await response.json()) as {
			data: unknown[];
			summary: { days: number; requirementsEvaluated: number };
		};
		expect(payload.data).toEqual([]);
		expect(payload.summary).toMatchObject({
			days: 2,
			requirementsEvaluated: 0,
		});
	});
});
