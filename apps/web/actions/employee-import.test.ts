import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { bulkCreateEmployees, undoBulkImport } from '@/actions/employee-import';

const bulkPostMock = vi.fn();
const bulkDeleteMock = vi.fn();
const originalFetch = globalThis.fetch;

vi.mock('next/headers', () => ({
	headers: vi.fn(async () => ({
		get: (key: string) => (key === 'cookie' ? 'session=mock' : null),
	})),
}));

vi.mock('@/lib/server-api', () => ({
	API_BASE_URL: 'http://localhost:3000',
	createServerApiClient: vi.fn(() => ({
		employees: {
			bulk: {
				post: bulkPostMock,
				'batch-1': {
					delete: bulkDeleteMock,
				},
			},
		},
	})),
}));

describe('employee import actions', () => {
	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	beforeEach(() => {
		bulkPostMock.mockReset();
		bulkDeleteMock.mockReset();
		globalThis.fetch = vi.fn(async () => {
			throw new Error('raw fetch should not be used here');
		}) as typeof fetch;
	});

	it('creates employees through the typed server api client', async () => {
		bulkPostMock.mockResolvedValue({
			data: {
				batchId: 'batch-1',
				results: [{ index: 0, success: true, employeeId: 'emp-1' }],
				summary: {
					total: 1,
					created: 1,
					failed: 0,
				},
			},
			error: null,
		});

		const result = await bulkCreateEmployees({
			employees: [
				{
					code: 'EMP-001',
					firstName: 'Ana',
					lastName: 'López',
					dailyPay: 380,
					paymentFrequency: 'MONTHLY',
					jobPositionId: 'job-1',
					locationId: 'loc-1',
				},
			],
		});

		expect(result.success).toBe(true);
		expect(bulkPostMock).toHaveBeenCalledWith({
			employees: [
				{
					code: 'EMP-001',
					firstName: 'Ana',
					lastName: 'López',
					dailyPay: 380,
					paymentFrequency: 'MONTHLY',
					jobPositionId: 'job-1',
					locationId: 'loc-1',
				},
			],
		});
	});

	it('undos bulk imports through the typed server api client', async () => {
		bulkDeleteMock.mockResolvedValue({
			data: {
				deleted: 2,
				batchId: 'batch-1',
			},
			error: null,
		});

		const result = await undoBulkImport('batch-1');

		expect(result.success).toBe(true);
		expect(bulkDeleteMock).toHaveBeenCalledTimes(1);
	});
});
