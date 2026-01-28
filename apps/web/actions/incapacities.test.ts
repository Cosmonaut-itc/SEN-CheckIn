import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createIncapacityAction, presignIncapacityDocumentAction } from '@/actions/incapacities';

const createPostMock = vi.fn();
const presignPostMock = vi.fn();
const confirmPostMock = vi.fn();
const updatePutMock = vi.fn();
const cancelPostMock = vi.fn();
const documentUrlGetMock = vi.fn();

const documentsProxy = new Proxy(
	{
		presign: { post: presignPostMock },
		confirm: { post: confirmPostMock },
	},
	{
		get(target, prop) {
			if (prop in target) {
				return target[prop as keyof typeof target];
			}
			return { url: { get: documentUrlGetMock } };
		},
	},
);

const incapacityIdProxy = {
	put: updatePutMock,
	cancel: { post: cancelPostMock },
	documents: documentsProxy,
};

const incapacitiesProxy = new Proxy(
	{
		post: createPostMock,
	},
	{
		get(target, prop) {
			if (prop in target) {
				return target[prop as keyof typeof target];
			}
			return incapacityIdProxy;
		},
	},
);

vi.mock('next/headers', () => ({
	headers: vi.fn(async () => ({
		get: (key: string) => (key === 'cookie' ? 'session=mock' : null),
	})),
}));

vi.mock('@/lib/server-api', () => ({
	createServerApiClient: vi.fn(() => ({
		incapacities: incapacitiesProxy,
	})),
}));

describe('incapacity actions', () => {
	beforeEach(() => {
		createPostMock.mockReset();
		presignPostMock.mockReset();
		confirmPostMock.mockReset();
		updatePutMock.mockReset();
		cancelPostMock.mockReset();
		documentUrlGetMock.mockReset();
	});

	it('returns data on successful creation', async () => {
		createPostMock.mockResolvedValue({
			data: { data: { id: 'inc-1' } },
			error: null,
			status: 200,
		});

		const result = await createIncapacityAction({
			employeeId: 'emp-1',
			caseId: 'CASE-1',
			type: 'EG',
			startDateKey: '2026-01-05',
			endDateKey: '2026-01-06',
			daysAuthorized: 2,
		});

		expect(result.success).toBe(true);
		expect(result.data?.id).toBe('inc-1');
	});

	it('maps API error codes for create failures', async () => {
		createPostMock.mockResolvedValue({
			error: {
				value: {
					error: {
						message: 'SAT mismatch',
						code: 'INCAPACITY_SAT_MISMATCH',
					},
				},
			},
			status: 400,
		});

		const result = await createIncapacityAction({
			employeeId: 'emp-1',
			caseId: 'CASE-2',
			type: 'EG',
			startDateKey: '2026-01-05',
			endDateKey: '2026-01-06',
			daysAuthorized: 2,
		});

		expect(result.success).toBe(false);
		expect(result.errorCode).toBe('INCAPACITY_SAT_MISMATCH');
	});

	it('maps bucket errors for presign failures', async () => {
		presignPostMock.mockResolvedValue({
			error: {
				value: {
					error: {
						message: 'Bucket missing',
						code: 'INCAPACITY_BUCKET_NOT_CONFIGURED',
					},
				},
			},
			status: 400,
		});

		const result = await presignIncapacityDocumentAction({
			incapacityId: 'inc-1',
			fileName: 'incapacidad.pdf',
			contentType: 'application/pdf',
			sizeBytes: 2048,
		});

		expect(result.success).toBe(false);
		expect(result.errorCode).toBe('INCAPACITY_BUCKET_NOT_CONFIGURED');
	});
});
