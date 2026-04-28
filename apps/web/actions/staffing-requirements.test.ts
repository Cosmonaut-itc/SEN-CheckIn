import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
	createStaffingRequirement,
	deleteStaffingRequirement,
	updateStaffingRequirement,
} from '@/actions/staffing-requirements';

const createPostMock = vi.fn();
const updatePutMock = vi.fn();
const deleteMock = vi.fn();

const staffingRequirementsResource = new Proxy(
	{
		post: createPostMock,
	},
	{
		get(target, prop) {
			if (prop in target) {
				return target[prop as keyof typeof target];
			}

			return {
				put: updatePutMock,
				delete: deleteMock,
			};
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
		'staffing-requirements': staffingRequirementsResource,
	})),
}));

describe('staffing requirement actions', () => {
	beforeEach(() => {
		createPostMock.mockReset();
		updatePutMock.mockReset();
		deleteMock.mockReset();
	});

	it('creates a staffing requirement through the API', async () => {
		createPostMock.mockResolvedValue({
			data: { data: { id: 'requirement-1' } },
			error: null,
			status: 201,
		});

		const result = await createStaffingRequirement({
			organizationId: 'org-1',
			locationId: 'location-1',
			jobPositionId: 'job-position-1',
			minimumRequired: 3,
		});

		expect(createPostMock).toHaveBeenCalledWith({
			organizationId: 'org-1',
			locationId: 'location-1',
			jobPositionId: 'job-position-1',
			minimumRequired: 3,
		});
		expect(result).toEqual({
			success: true,
			data: { data: { id: 'requirement-1' } },
		});
	});

	it('updates only defined staffing requirement fields', async () => {
		updatePutMock.mockResolvedValue({
			data: { data: { id: 'requirement-1', minimumRequired: 4 } },
			error: null,
			status: 200,
		});

		const result = await updateStaffingRequirement({
			id: 'requirement-1',
			locationId: undefined,
			jobPositionId: 'job-position-2',
			minimumRequired: 4,
		});

		expect(updatePutMock).toHaveBeenCalledWith({
			jobPositionId: 'job-position-2',
			minimumRequired: 4,
		});
		expect(result.success).toBe(true);
	});

	it('deletes a staffing requirement through the API', async () => {
		deleteMock.mockResolvedValue({
			data: { message: 'deleted' },
			error: null,
			status: 200,
		});

		const result = await deleteStaffingRequirement('requirement-1');

		expect(deleteMock).toHaveBeenCalledWith();
		expect(result).toEqual({ success: true });
	});

	it('normalizes conflict errors for create failures', async () => {
		createPostMock.mockResolvedValue({
			error: {
				value: {
					error: {
						message: 'Staffing requirement already exists',
						code: 'CONFLICT',
					},
				},
			},
			status: 409,
		});

		const result = await createStaffingRequirement({
			locationId: 'location-1',
			jobPositionId: 'job-position-1',
			minimumRequired: 3,
		});

		expect(result).toEqual({
			success: false,
			errorCode: 'CONFLICT',
		});
	});
});
