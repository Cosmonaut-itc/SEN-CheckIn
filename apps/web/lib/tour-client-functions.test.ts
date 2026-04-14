import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTourProgressGet, mockTourCompletePost } = vi.hoisted(() => ({
	mockTourProgressGet: vi.fn(),
	mockTourCompletePost: vi.fn(),
}));

vi.mock('@/lib/api', () => {
	const toursResource = new Proxy<Record<string | symbol, unknown>>(
		{
			progress: {
				get: mockTourProgressGet,
			},
		},
		{
			get: (target, property: string | symbol): unknown => {
				if (property in target) {
					return target[property];
				}
				if (typeof property === 'string') {
					return {
						complete: {
							post: mockTourCompletePost,
						},
					};
				}
				return undefined;
			},
		},
	);

	return {
		API_BASE_URL: 'http://localhost:3000',
		api: {
			tours: toursResource,
		},
	};
});

import { mutationKeys, queryKeys } from '@/lib/query-keys';
import { completeTour, fetchTourProgress } from '@/lib/tour-client-functions';

describe('tour client functions', () => {
	beforeEach(() => {
		mockTourProgressGet.mockReset();
		mockTourCompletePost.mockReset();
	});

	it('exposes stable query and mutation keys for tour progress', () => {
		expect(queryKeys.tours.all).toEqual(['tours']);
		expect(queryKeys.tours.progress('user-1', 'org-1')).toEqual([
			'tours',
			'progress',
			{ userId: 'user-1', organizationId: 'org-1' },
		]);
		expect(queryKeys.tours.progress('user-1', 'org-2')).not.toEqual(
			queryKeys.tours.progress('user-1', 'org-1'),
		);
		expect(mutationKeys.tours.complete).toEqual(['tours', 'complete']);
		expect(mutationKeys.tours.reset).toEqual(['tours', 'reset']);
	});

	it('returns tour progress records from the API payload', async () => {
		mockTourProgressGet.mockResolvedValue({
			data: {
				data: {
					tours: [
						{
							tourId: 'dashboard',
							status: 'completed',
							completedAt: '2026-04-14T12:00:00.000Z',
						},
					],
				},
			},
			error: null,
			status: 200,
		});

		await expect(fetchTourProgress()).resolves.toEqual([
			{
				tourId: 'dashboard',
				status: 'completed',
				completedAt: '2026-04-14T12:00:00.000Z',
			},
		]);
	});

	it('throws when loading tour progress fails', async () => {
		mockTourProgressGet.mockResolvedValue({
			data: null,
			error: {
				value: {
					message: 'Unauthorized',
				},
			},
			status: 401,
		});

		await expect(fetchTourProgress()).rejects.toThrow();
	});

	it('posts completion status to the tour endpoint', async () => {
		mockTourCompletePost.mockResolvedValue({
			data: {
				tourId: 'employees',
				status: 'skipped',
			},
			error: null,
			status: 200,
		});

		await completeTour('employees', 'skipped');

		expect(mockTourCompletePost).toHaveBeenCalledWith({ status: 'skipped' });
	});

	it('throws when persisting tour completion fails', async () => {
		mockTourCompletePost.mockResolvedValue({
			data: null,
			error: {
				value: {
					message: 'Forbidden',
				},
			},
			status: 403,
		});

		await expect(completeTour('employees', 'skipped')).rejects.toThrow();
	});
});
