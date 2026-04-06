import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';

import { errorHandlerPlugin } from '../plugins/error-handler.js';

const employeeTable = {
	id: 'employee.id',
	code: 'employee.code',
	importBatchId: 'employee.importBatchId',
	organizationId: 'employee.organizationId',
};
const locationTable = {
	id: 'location.id',
	organizationId: 'location.organizationId',
};
const jobPositionTable = {
	id: 'jobPosition.id',
	organizationId: 'jobPosition.organizationId',
};

type MockCondition =
	| {
			type: 'eq';
			column: unknown;
			value: unknown;
	  }
	| {
			type: 'and';
			conditions: MockCondition[];
	  };

interface FakeLocationRow {
	id: string;
	organizationId: string | null;
}

interface FakeJobPositionRow {
	id: string;
	organizationId: string | null;
}

interface FakeEmployeeRow {
	id: string;
	code: string;
	firstName: string;
	lastName: string;
	dailyPay: string;
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	jobPositionId: string;
	locationId: string;
	organizationId: string;
	importBatchId: string | null;
	status: 'ACTIVE';
	employmentType: 'PERMANENT';
	shiftType: 'DIURNA';
}

const fakeDbState: {
	locations: FakeLocationRow[];
	jobPositions: FakeJobPositionRow[];
	employees: FakeEmployeeRow[];
} = {
	locations: [],
	jobPositions: [],
	employees: [],
};

const TEST_ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const TEST_LOCATION_ID = '22222222-2222-4222-8222-222222222222';
const TEST_JOB_POSITION_ID = '33333333-3333-4333-8333-333333333333';

const mockProcessDocument = mock(async () => ({
	employees: [
		{
			firstName: 'María',
			lastName: 'García',
			dailyPay: 380,
			confidence: 0.92,
			fieldConfidence: {
				firstName: 0.95,
				lastName: 0.9,
				dailyPay: 0.85,
			},
		},
	],
	pagesProcessed: 1,
}));

/**
 * Extracts the value used for an equality comparison inside a mocked drizzle condition.
 *
 * @param condition - Condition passed into the fake where clause
 * @param column - Column token to locate
 * @returns Matched value or undefined when absent
 */
function getEqValue(condition: MockCondition | undefined, column: unknown): unknown {
	if (!condition) {
		return undefined;
	}

	if (condition.type === 'eq') {
		return condition.column === column ? condition.value : undefined;
	}

	for (const nestedCondition of condition.conditions) {
		const nestedValue = getEqValue(nestedCondition, column);
		if (nestedValue !== undefined) {
			return nestedValue;
		}
	}

	return undefined;
}

const fakeDb = {
	select: () => ({
		from: (table: unknown) => ({
			where: (condition: MockCondition) => ({
				limit: async () => {
					if (table === locationTable) {
						const id = getEqValue(condition, locationTable.id);
						return fakeDbState.locations.filter((row) => row.id === id);
					}

					if (table === jobPositionTable) {
						const id = getEqValue(condition, jobPositionTable.id);
						return fakeDbState.jobPositions.filter((row) => row.id === id);
					}

					if (table === employeeTable) {
						const code = getEqValue(condition, employeeTable.code);
						const batchId = getEqValue(condition, employeeTable.importBatchId);
						const organizationId = getEqValue(condition, employeeTable.organizationId);

						if (typeof code === 'string') {
							return fakeDbState.employees
								.filter((row) => row.code === code)
								.map((row) => ({ id: row.id }));
						}

						return fakeDbState.employees
							.filter((row) => {
								if (typeof batchId === 'string' && row.importBatchId !== batchId) {
									return false;
								}

								if (
									typeof organizationId === 'string' &&
									row.organizationId !== organizationId
								) {
									return false;
								}

								return true;
							})
							.map((row) => ({ id: row.id }));
					}

					return [];
				},
			}),
		}),
	}),
	insert: () => ({
		values: async (value: FakeEmployeeRow) => {
			fakeDbState.employees.push(value);
			return [value];
		},
	}),
	delete: () => ({
		where: async (condition: MockCondition) => {
			const batchId = getEqValue(condition, employeeTable.importBatchId);
			const organizationId = getEqValue(condition, employeeTable.organizationId);

			fakeDbState.employees = fakeDbState.employees.filter((row) => {
				if (typeof batchId === 'string' && row.importBatchId !== batchId) {
					return true;
				}

				if (typeof organizationId === 'string' && row.organizationId !== organizationId) {
					return true;
				}

				return false;
			});
		},
	}),
};

mock.module('drizzle-orm', () => ({
	and: (...conditions: MockCondition[]) => ({ type: 'and', conditions }),
	eq: (column: unknown, value: unknown) => ({ type: 'eq', column, value }),
}));

mock.module('../db/index.js', () => ({
	default: fakeDb,
}));

mock.module('../db/schema.js', () => ({
	employee: employeeTable,
	location: locationTable,
	jobPosition: jobPositionTable,
}));

mock.module('../plugins/auth.js', () => ({
	combinedAuthPlugin: new Elysia({ name: 'mock-combined-auth' }).derive({ as: 'scoped' }, () => ({
		authType: 'session' as const,
		user: { id: 'user-1' },
		session: { activeOrganizationId: TEST_ORGANIZATION_ID },
		sessionOrganizationIds: [TEST_ORGANIZATION_ID],
		apiKeyId: null,
		apiKeyName: null,
		apiKeyUserId: null,
		apiKeyOrganizationId: null,
		apiKeyOrganizationIds: [],
	})),
}));

mock.module('../services/document-ai.js', () => ({
	processDocument: mockProcessDocument,
}));

/**
 * Creates a multipart POST request for the import endpoint.
 *
 * @param formData - Multipart request body
 * @returns Request instance
 */
function createMultipartRequest(formData: FormData): Request {
	return new Request('http://localhost/employees/import', {
		method: 'POST',
		body: formData,
	});
}

/**
 * Creates a JSON request for the bulk and undo endpoints.
 *
 * @param path - Request path
 * @param method - HTTP method
 * @param body - Optional JSON body payload
 * @returns Request instance
 */
function createJsonRequest(path: string, method: 'POST' | 'DELETE', body?: unknown): Request {
	return new Request(`http://localhost${path}`, {
		method,
		headers: body ? { 'content-type': 'application/json' } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	});
}

describe('employee import routes', () => {
	beforeEach(() => {
		fakeDbState.locations = [{ id: TEST_LOCATION_ID, organizationId: TEST_ORGANIZATION_ID }];
		fakeDbState.jobPositions = [
			{ id: TEST_JOB_POSITION_ID, organizationId: TEST_ORGANIZATION_ID },
		];
		fakeDbState.employees = [];
		mockProcessDocument.mockClear();
	});

	it('returns 400 when no file is provided', async () => {
		const { employeeImportRoutes } = await import('./employee-import.js');
		const app = new Elysia().use(errorHandlerPlugin).use(employeeImportRoutes);
		const formData = new FormData();
		formData.append('defaultLocationId', TEST_LOCATION_ID);
		formData.append('defaultJobPositionId', TEST_JOB_POSITION_ID);
		formData.append('defaultPaymentFrequency', 'MONTHLY');

		const response = await app.handle(createMultipartRequest(formData));
		const payload = (await response.json()) as {
			error: {
				message: string;
			};
		};

		expect(response.status).toBe(400);
		expect(payload.error.message).toBe('No se proporcionó un archivo.');
	});

	it('returns extracted employees with default values', async () => {
		const { employeeImportRoutes } = await import('./employee-import.js');
		const app = new Elysia().use(errorHandlerPlugin).use(employeeImportRoutes);
		const formData = new FormData();
		formData.append(
			'file',
			new File(['fake image'], 'employees.png', {
				type: 'image/png',
			}),
		);
		formData.append('defaultLocationId', TEST_LOCATION_ID);
		formData.append('defaultJobPositionId', TEST_JOB_POSITION_ID);
		formData.append('defaultPaymentFrequency', 'BIWEEKLY');

		const response = await app.handle(createMultipartRequest(formData));
		const payload = (await response.json()) as {
			employees: Array<{
				firstName: string;
				lastName: string;
				locationId: string;
				jobPositionId: string;
				paymentFrequency: string;
			}>;
			processingMeta: {
				pagesProcessed: number;
				totalEmployeesFound: number;
			};
		};

		expect(response.status).toBe(200);
		expect(payload.employees).toHaveLength(1);
		expect(payload.employees[0]?.locationId).toBe(TEST_LOCATION_ID);
		expect(payload.employees[0]?.jobPositionId).toBe(TEST_JOB_POSITION_ID);
		expect(payload.employees[0]?.paymentFrequency).toBe('BIWEEKLY');
		expect(payload.processingMeta.pagesProcessed).toBe(1);
		expect(payload.processingMeta.totalEmployeesFound).toBe(1);
	});

	it('creates employees in bulk and reports duplicate codes', async () => {
		fakeDbState.employees = [
			{
				id: 'existing-1',
				code: 'EMP-001',
				firstName: 'Existente',
				lastName: 'Uno',
				dailyPay: '500.00',
				paymentFrequency: 'MONTHLY',
				jobPositionId: TEST_JOB_POSITION_ID,
				locationId: TEST_LOCATION_ID,
				organizationId: TEST_ORGANIZATION_ID,
				importBatchId: null,
				status: 'ACTIVE',
				employmentType: 'PERMANENT',
				shiftType: 'DIURNA',
			},
		];
		const { employeeImportRoutes } = await import('./employee-import.js');
		const app = new Elysia().use(errorHandlerPlugin).use(employeeImportRoutes);

		const response = await app.handle(
			createJsonRequest('/employees/bulk', 'POST', {
				employees: [
					{
						code: 'EMP-001',
						firstName: 'Duplicada',
						lastName: 'Uno',
						dailyPay: 380,
						paymentFrequency: 'MONTHLY',
						jobPositionId: TEST_JOB_POSITION_ID,
						locationId: TEST_LOCATION_ID,
					},
					{
						code: 'EMP-002',
						firstName: 'Nueva',
						lastName: 'Dos',
						dailyPay: 420,
						paymentFrequency: 'MONTHLY',
						jobPositionId: TEST_JOB_POSITION_ID,
						locationId: TEST_LOCATION_ID,
					},
				],
			}),
		);
		const payload = (await response.json()) as {
			batchId: string;
			summary: {
				total: number;
				created: number;
				failed: number;
			};
			results: Array<{
				index: number;
				success: boolean;
				error?: string;
			}>;
		};

		expect(response.status).toBe(200);
		expect(payload.batchId).toBeString();
		expect(payload.summary).toEqual({
			total: 2,
			created: 1,
			failed: 1,
		});
		expect(payload.results[0]?.success).toBe(false);
		expect(payload.results[1]?.success).toBe(true);
	});

	it('deletes employees for an imported batch', async () => {
		fakeDbState.employees = [
			{
				id: 'employee-1',
				code: 'EMP-010',
				firstName: 'María',
				lastName: 'García',
				dailyPay: '380.00',
				paymentFrequency: 'MONTHLY',
				jobPositionId: TEST_JOB_POSITION_ID,
				locationId: TEST_LOCATION_ID,
				organizationId: TEST_ORGANIZATION_ID,
				importBatchId: 'batch-1',
				status: 'ACTIVE',
				employmentType: 'PERMANENT',
				shiftType: 'DIURNA',
			},
		];
		const { employeeImportRoutes } = await import('./employee-import.js');
		const app = new Elysia().use(errorHandlerPlugin).use(employeeImportRoutes);

		const response = await app.handle(
			createJsonRequest('/employees/bulk/batch-1', 'DELETE'),
		);
		const payload = (await response.json()) as {
			deleted: number;
			batchId: string;
		};

		expect(response.status).toBe(200);
		expect(payload).toEqual({
			deleted: 1,
			batchId: 'batch-1',
		});
		expect(fakeDbState.employees).toHaveLength(0);
	});
});
