import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';

import { errorHandlerPlugin } from '../plugins/error-handler.js';

mock.restore();

const actualDrizzleOrmModule = await import('drizzle-orm');
const actualSchemaModule = await import('../db/schema.js');
const actualDocumentAiModule = await import('../services/document-ai.js');

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
			type: 'inArray';
			column: unknown;
			values: unknown[];
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
	insertErrorsByCode: Map<string, { code?: string; message: string }>;
	transactionCalls: number;
} = {
	locations: [],
	jobPositions: [],
	employees: [],
	insertErrorsByCode: new Map(),
	transactionCalls: 0,
};

const TEST_ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const TEST_LOCATION_ID = '22222222-2222-4222-8222-222222222222';
const TEST_JOB_POSITION_ID = '33333333-3333-4333-8333-333333333333';
let mockCombinedAuthContext:
	| {
			authType: 'session';
			user: { id: string };
			session: {
				id: string;
				expiresAt: Date;
				token: string;
				createdAt: Date;
				updatedAt: Date;
				userId: string;
				activeOrganizationId: string;
			};
			sessionOrganizationIds: string[];
			apiKeyId: null;
			apiKeyName: null;
			apiKeyUserId: null;
			apiKeyOrganizationId: null;
			apiKeyOrganizationIds: [];
	  }
	| {
			authType: 'apiKey';
			user: null;
			session: null;
			sessionOrganizationIds: [];
			apiKeyId: string;
			apiKeyName: string | null;
			apiKeyUserId: string | null;
			apiKeyOrganizationId: string | null;
			apiKeyOrganizationIds: string[];
	  };

const mockProcessDocument = mock(
	async (
		_fileBuffer: Buffer,
		_mimeType: string,
		onProgress?: (progress: {
			step: 'processing' | 'extracting';
			currentPage?: number;
			totalPages?: number;
			message: string;
		}) => void,
	) => {
		onProgress?.({
			step: 'processing',
			currentPage: 1,
			totalPages: 1,
			message: 'Procesando imagen...',
		});
		onProgress?.({
			step: 'extracting',
			currentPage: 1,
			totalPages: 1,
			message: 'Extrayendo datos del documento...',
		});

		return {
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
		};
	},
);

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

	if (condition.type === 'inArray') {
		return undefined;
	}

	for (const nestedCondition of condition.conditions) {
		const nestedValue = getEqValue(nestedCondition, column);
		if (nestedValue !== undefined) {
			return nestedValue;
		}
	}

	return undefined;
}

/**
 * Extracts values used for an inArray comparison inside a mocked drizzle condition.
 *
 * @param condition - Condition passed into the fake where clause
 * @param column - Column token to locate
 * @returns Matched values or undefined when absent
 */
function getInArrayValues(condition: MockCondition | undefined, column: unknown): unknown[] | undefined {
	if (!condition) {
		return undefined;
	}

	if (condition.type === 'inArray') {
		return condition.column === column ? condition.values : undefined;
	}

	if (condition.type === 'and') {
		for (const nestedCondition of condition.conditions) {
			const nestedValue = getInArrayValues(nestedCondition, column);
			if (nestedValue !== undefined) {
				return nestedValue;
			}
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
						const organizationId = getEqValue(condition, locationTable.organizationId);
						const ids = getInArrayValues(condition, locationTable.id);

						return fakeDbState.locations.filter((row) => {
							if (typeof id === 'string' && row.id !== id) {
								return false;
							}

							if (Array.isArray(ids) && ids.length > 0 && !ids.includes(row.id)) {
								return false;
							}

							if (
								typeof organizationId === 'string' &&
								row.organizationId !== organizationId
							) {
								return false;
							}

							return true;
						});
					}

					if (table === jobPositionTable) {
						const id = getEqValue(condition, jobPositionTable.id);
						const organizationId = getEqValue(condition, jobPositionTable.organizationId);
						const ids = getInArrayValues(condition, jobPositionTable.id);

						return fakeDbState.jobPositions.filter((row) => {
							if (typeof id === 'string' && row.id !== id) {
								return false;
							}

							if (Array.isArray(ids) && ids.length > 0 && !ids.includes(row.id)) {
								return false;
							}

							if (
								typeof organizationId === 'string' &&
								row.organizationId !== organizationId
							) {
								return false;
							}

							return true;
						});
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
			const configuredError = fakeDbState.insertErrorsByCode.get(value.code);
			if (configuredError) {
				throw configuredError;
			}

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
	transaction: async <T>(callback: (tx: typeof fakeDb) => Promise<T>): Promise<T> => {
		fakeDbState.transactionCalls += 1;
		return await callback(fakeDb);
	},
};

mock.module('drizzle-orm', () => ({
	...actualDrizzleOrmModule,
	and: (...conditions: MockCondition[]) => ({ type: 'and', conditions }),
	eq: (column: unknown, value: unknown) => ({ type: 'eq', column, value }),
	inArray: (column: unknown, values: unknown[]) => ({ type: 'inArray', column, values }),
}));

mock.module('../db/index.js', () => ({
	default: fakeDb,
}));

mock.module('../db/schema.js', () => ({
	...actualSchemaModule,
	employee: employeeTable,
	location: locationTable,
	jobPosition: jobPositionTable,
}));

mock.module('../plugins/auth.js', () => ({
	combinedAuthPlugin: new Elysia({ name: 'mock-combined-auth' }).derive(
		{ as: 'scoped' },
		() => mockCombinedAuthContext,
	),
}));

mock.module('../services/document-ai.js', () => ({
	...actualDocumentAiModule,
	processDocument: mockProcessDocument,
}));

afterAll(() => {
	mock.restore();
});

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
		mockCombinedAuthContext = {
			authType: 'session',
			user: { id: 'user-1' },
			session: {
				id: 'session-1',
				expiresAt: new Date('2099-01-01T00:00:00.000Z'),
				token: 'token-1',
				createdAt: new Date('2099-01-01T00:00:00.000Z'),
				updatedAt: new Date('2099-01-01T00:00:00.000Z'),
				userId: 'user-1',
				activeOrganizationId: TEST_ORGANIZATION_ID,
			},
			sessionOrganizationIds: [TEST_ORGANIZATION_ID],
			apiKeyId: null,
			apiKeyName: null,
			apiKeyUserId: null,
			apiKeyOrganizationId: null,
			apiKeyOrganizationIds: [],
		};
		fakeDbState.locations = [{ id: TEST_LOCATION_ID, organizationId: TEST_ORGANIZATION_ID }];
		fakeDbState.jobPositions = [
			{ id: TEST_JOB_POSITION_ID, organizationId: TEST_ORGANIZATION_ID },
		];
		fakeDbState.employees = [];
		fakeDbState.insertErrorsByCode = new Map();
		fakeDbState.transactionCalls = 0;
		mockProcessDocument.mockClear();
	});

	it('returns 400 when the uploaded file mime type is not supported', async () => {
		const employeeImportModule = await import('./employee-import.js');
		employeeImportModule.resetEmployeeImportRateLimiterForTests();
		const app = new Elysia().use(errorHandlerPlugin).use(employeeImportModule.employeeImportRoutes);
		const formData = new FormData();
		formData.append(
			'file',
			new File(['fake text'], 'employees.txt', {
				type: 'text/plain',
			}),
		);
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
		expect(payload.error.message).toBe('Formato no soportado. Usa JPG, PNG, HEIC o PDF.');
		expect(mockProcessDocument).not.toHaveBeenCalled();
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

	it('does not consume the import rate limit for invalid mime-type requests', async () => {
		const employeeImportModule = await import('./employee-import.js');
		employeeImportModule.resetEmployeeImportRateLimiterForTests();
		const app = new Elysia().use(errorHandlerPlugin).use(employeeImportModule.employeeImportRoutes);

		for (let attempt = 0; attempt < 10; attempt += 1) {
			const invalidFormData = new FormData();
			invalidFormData.append(
				'file',
				new File(['fake text'], `invalid-${attempt}.txt`, {
					type: 'text/plain',
				}),
			);
			invalidFormData.append('defaultLocationId', TEST_LOCATION_ID);
			invalidFormData.append('defaultJobPositionId', TEST_JOB_POSITION_ID);
			invalidFormData.append('defaultPaymentFrequency', 'MONTHLY');

			const invalidResponse = await app.handle(createMultipartRequest(invalidFormData));
			expect(invalidResponse.status).toBe(400);
		}

		const validFormData = new FormData();
		validFormData.append(
			'file',
			new File(['fake image'], 'employees.png', {
				type: 'image/png',
			}),
		);
		validFormData.append('defaultLocationId', TEST_LOCATION_ID);
		validFormData.append('defaultJobPositionId', TEST_JOB_POSITION_ID);
		validFormData.append('defaultPaymentFrequency', 'MONTHLY');

		const response = await app.handle(createMultipartRequest(validFormData));

		expect(response.status).toBe(200);
		expect(mockProcessDocument).toHaveBeenCalledTimes(1);
	});

	it('returns 429 after the import rate limit is exceeded', async () => {
		const employeeImportModule = await import('./employee-import.js');
		employeeImportModule.resetEmployeeImportRateLimiterForTests();
		const app = new Elysia().use(errorHandlerPlugin).use(employeeImportModule.employeeImportRoutes);

		for (let attempt = 0; attempt < 10; attempt += 1) {
			const formData = new FormData();
			formData.append(
				'file',
				new File([`fake image ${attempt}`], `employees-${attempt}.png`, {
					type: 'image/png',
				}),
			);
			formData.append('defaultLocationId', TEST_LOCATION_ID);
			formData.append('defaultJobPositionId', TEST_JOB_POSITION_ID);
			formData.append('defaultPaymentFrequency', 'MONTHLY');

			const response = await app.handle(createMultipartRequest(formData));
			expect(response.status).toBe(200);
		}

		const exceededFormData = new FormData();
		exceededFormData.append(
			'file',
			new File(['fake image overflow'], 'employees-overflow.png', {
				type: 'image/png',
			}),
		);
		exceededFormData.append('defaultLocationId', TEST_LOCATION_ID);
		exceededFormData.append('defaultJobPositionId', TEST_JOB_POSITION_ID);
		exceededFormData.append('defaultPaymentFrequency', 'MONTHLY');

		const response = await app.handle(createMultipartRequest(exceededFormData));
		const payload = (await response.json()) as {
			error: {
				message: string;
			};
		};

		expect(response.status).toBe(429);
		expect(payload.error.message).toBe(
			'Has alcanzado el límite de importaciones. Intenta más tarde.',
		);
	});

	it('isolates the import rate limit bucket by api key id when the api key has no user id', async () => {
		const employeeImportModule = await import('./employee-import.js');
		employeeImportModule.resetEmployeeImportRateLimiterForTests();
		const app = new Elysia().use(errorHandlerPlugin).use(employeeImportModule.employeeImportRoutes);

		mockCombinedAuthContext = {
			authType: 'apiKey',
			user: null,
			session: null,
			sessionOrganizationIds: [],
			apiKeyId: 'api-key-a',
			apiKeyName: 'Service A',
			apiKeyUserId: null,
			apiKeyOrganizationId: TEST_ORGANIZATION_ID,
			apiKeyOrganizationIds: [TEST_ORGANIZATION_ID],
		};

		for (let attempt = 0; attempt < 10; attempt += 1) {
			const formData = new FormData();
			formData.append(
				'file',
				new File([`fake image ${attempt}`], `employees-${attempt}.png`, {
					type: 'image/png',
				}),
			);
			formData.append('defaultLocationId', TEST_LOCATION_ID);
			formData.append('defaultJobPositionId', TEST_JOB_POSITION_ID);
			formData.append('defaultPaymentFrequency', 'MONTHLY');

			const response = await app.handle(createMultipartRequest(formData));
			expect(response.status).toBe(200);
		}

		mockCombinedAuthContext = {
			authType: 'apiKey',
			user: null,
			session: null,
			sessionOrganizationIds: [],
			apiKeyId: 'api-key-b',
			apiKeyName: 'Service B',
			apiKeyUserId: null,
			apiKeyOrganizationId: TEST_ORGANIZATION_ID,
			apiKeyOrganizationIds: [TEST_ORGANIZATION_ID],
		};

		const secondKeyFormData = new FormData();
		secondKeyFormData.append(
			'file',
			new File(['fake image other key'], 'employees-other-key.png', {
				type: 'image/png',
			}),
		);
		secondKeyFormData.append('defaultLocationId', TEST_LOCATION_ID);
		secondKeyFormData.append('defaultJobPositionId', TEST_JOB_POSITION_ID);
		secondKeyFormData.append('defaultPaymentFrequency', 'MONTHLY');

		const response = await app.handle(createMultipartRequest(secondKeyFormData));

		expect(response.status).toBe(200);
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

	it('rejects bulk creation when any location does not belong to the organization', async () => {
		fakeDbState.locations.push({
			id: 'loc-other-org',
			organizationId: '99999999-9999-4999-8999-999999999999',
		});
		const { employeeImportRoutes } = await import('./employee-import.js');
		const app = new Elysia().use(errorHandlerPlugin).use(employeeImportRoutes);

		const response = await app.handle(
			createJsonRequest('/employees/bulk', 'POST', {
				employees: [
					{
						code: 'EMP-010',
						firstName: 'Ana',
						lastName: 'López',
						dailyPay: 410,
						paymentFrequency: 'MONTHLY',
						jobPositionId: TEST_JOB_POSITION_ID,
						locationId: 'loc-other-org',
					},
				],
			}),
		);
		const payload = (await response.json()) as {
			error: {
				message: string;
			};
		};

		expect(response.status).toBe(400);
		expect(payload.error.message).toBe('Las ubicaciones seleccionadas no existen en tu organización.');
		expect(fakeDbState.employees).toHaveLength(0);
	});

	it('rejects bulk creation when any job position does not belong to the organization', async () => {
		fakeDbState.jobPositions.push({
			id: 'job-other-org',
			organizationId: '99999999-9999-4999-8999-999999999999',
		});
		const { employeeImportRoutes } = await import('./employee-import.js');
		const app = new Elysia().use(errorHandlerPlugin).use(employeeImportRoutes);

		const response = await app.handle(
			createJsonRequest('/employees/bulk', 'POST', {
				employees: [
					{
						code: 'EMP-011',
						firstName: 'Luis',
						lastName: 'Pérez',
						dailyPay: 410,
						paymentFrequency: 'MONTHLY',
						jobPositionId: 'job-other-org',
						locationId: TEST_LOCATION_ID,
					},
				],
			}),
		);
		const payload = (await response.json()) as {
			error: {
				message: string;
			};
		};

		expect(response.status).toBe(400);
		expect(payload.error.message).toBe('Los puestos seleccionados no existen en tu organización.');
		expect(fakeDbState.employees).toHaveLength(0);
	});

	it('returns a row-level duplicate error when the insert hits a unique violation', async () => {
		fakeDbState.insertErrorsByCode.set('EMP-003', {
			code: '23505',
			message: 'duplicate key value violates unique constraint',
		});
		const { employeeImportRoutes } = await import('./employee-import.js');
		const app = new Elysia().use(errorHandlerPlugin).use(employeeImportRoutes);

		const response = await app.handle(
			createJsonRequest('/employees/bulk', 'POST', {
				employees: [
					{
						code: 'EMP-003',
						firstName: 'Ana',
						lastName: 'López',
						dailyPay: 410,
						paymentFrequency: 'MONTHLY',
						jobPositionId: TEST_JOB_POSITION_ID,
						locationId: TEST_LOCATION_ID,
					},
				],
			}),
		);
		const payload = (await response.json()) as {
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
		expect(payload.summary).toEqual({
			total: 1,
			created: 0,
			failed: 1,
		});
		expect(payload.results).toEqual([
			{
				index: 0,
				success: false,
				error: 'Código "EMP-003" duplicado',
			},
		]);
		expect(fakeDbState.employees).toHaveLength(0);
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
		expect(fakeDbState.transactionCalls).toBe(1);
		expect(fakeDbState.employees).toHaveLength(0);
	});

	it('returns 404 when deleting a non-existent import batch', async () => {
		const { employeeImportRoutes } = await import('./employee-import.js');
		const app = new Elysia().use(errorHandlerPlugin).use(employeeImportRoutes);

		const response = await app.handle(
			createJsonRequest('/employees/bulk/batch-missing', 'DELETE'),
		);
		const payload = (await response.json()) as {
			error: {
				message: string;
			};
		};

		expect(response.status).toBe(404);
		expect(payload.error.message).toBe('No se encontró el lote de importación.');
	});

	it('scopes bulk delete to the active organization', async () => {
		fakeDbState.employees = [
			{
				id: 'employee-foreign-org',
				code: 'EMP-099',
				firstName: 'Otra',
				lastName: 'Organización',
				dailyPay: '380.00',
				paymentFrequency: 'MONTHLY',
				jobPositionId: TEST_JOB_POSITION_ID,
				locationId: TEST_LOCATION_ID,
				organizationId: '99999999-9999-4999-8999-999999999999',
				importBatchId: 'batch-shared',
				status: 'ACTIVE',
				employmentType: 'PERMANENT',
				shiftType: 'DIURNA',
			},
		];
		const { employeeImportRoutes } = await import('./employee-import.js');
		const app = new Elysia().use(errorHandlerPlugin).use(employeeImportRoutes);

		const response = await app.handle(
			createJsonRequest('/employees/bulk/batch-shared', 'DELETE'),
		);
		const payload = (await response.json()) as {
			error: {
				message: string;
			};
		};

		expect(response.status).toBe(404);
		expect(payload.error.message).toBe('No se encontró el lote de importación.');
		expect(fakeDbState.employees).toHaveLength(1);
	});
});
