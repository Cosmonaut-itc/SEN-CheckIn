import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
	createOvertimeAuthorizationAction,
	type UpdateOvertimeAuthorizationInput,
} from '@/actions/overtime-authorizations';

type UpdateOvertimeAuthorizationStatus = NonNullable<UpdateOvertimeAuthorizationInput['status']>;

// @ts-expect-error PENDING is not a valid update target for the current API contract.
const invalidUpdateStatus: UpdateOvertimeAuthorizationStatus = 'PENDING';
void invalidUpdateStatus;

const createPostMock = vi.fn();

vi.mock('next/headers', () => ({
	headers: vi.fn(async () => ({
		get: (key: string) => (key === 'cookie' ? 'session=mock' : null),
	})),
}));

vi.mock('@/lib/server-api', () => ({
	createServerApiClient: vi.fn(() => ({
		organizations: new Proxy(
			{},
			{
				get: () => ({
					'overtime-authorizations': {
						post: createPostMock,
					},
				}),
			},
		),
	})),
}));

describe('overtime authorization actions', () => {
	beforeEach(() => {
		createPostMock.mockReset();
	});

	it('threads the API error message through create failures', async () => {
		createPostMock.mockResolvedValue({
			error: {
				value: {
					error: {
						message:
							'An overtime authorization already exists for this employee and date',
					},
				},
			},
			status: 409,
		});

		const result = await createOvertimeAuthorizationAction({
			organizationId: 'org-1',
			employeeId: 'emp-1',
			dateKey: '2026-03-20',
			authorizedHours: 2,
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe(
			'An overtime authorization already exists for this employee and date',
		);
	});
});
