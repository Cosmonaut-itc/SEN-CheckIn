import type React from 'react';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	getQueryClient: vi.fn(),
	getAdminAccessContext: vi.fn(),
	prefetchLocationsList: vi.fn(),
	prefetchJobPositionsList: vi.fn(),
	dehydrate: vi.fn(),
}));

/**
 * Creates a deferred promise for controlling async resolution in a test.
 *
 * @returns Deferred promise helpers
 */
function createDeferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
} {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});

	return {
		promise,
		resolve,
	};
}

vi.mock('@/lib/get-query-client', () => ({
	getQueryClient: mocks.getQueryClient,
}));

vi.mock('@/lib/organization-context', () => ({
	getAdminAccessContext: mocks.getAdminAccessContext,
}));

vi.mock('@/lib/org-client-context', () => ({
	OrgProvider: ({ children }: { children: React.ReactNode }): React.ReactElement => (
		<>{children}</>
	),
}));

vi.mock('@/lib/server-functions', () => ({
	prefetchLocationsList: mocks.prefetchLocationsList,
	prefetchJobPositionsList: mocks.prefetchJobPositionsList,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-query')>();

	return {
		...actual,
		dehydrate: mocks.dehydrate,
		HydrationBoundary: ({ children }: { children: React.ReactNode }): React.ReactElement => (
			<>{children}</>
		),
	};
});

vi.mock('./import-client', () => ({
	ImportClient: (): React.ReactElement => <div data-testid="import-client" />,
}));

describe('EmployeeImportPage', () => {
	beforeEach(() => {
		const queryClient = new QueryClient();

		mocks.getQueryClient.mockReset();
		mocks.getAdminAccessContext.mockReset();
		mocks.prefetchLocationsList.mockReset();
		mocks.prefetchJobPositionsList.mockReset();
		mocks.dehydrate.mockReset();
		mocks.getQueryClient.mockReturnValue(queryClient);
		mocks.getAdminAccessContext.mockResolvedValue({
			organization: {
				organizationId: 'org-1',
				organizationSlug: 'org-1',
				organizationName: 'Org 1',
			},
			organizationRole: 'owner',
			userRole: 'admin',
		});
		mocks.prefetchLocationsList.mockReturnValue(undefined);
		mocks.dehydrate.mockReturnValue({});
	});

	it('waits for job positions prefetch before returning the hydrated page', async () => {
		const deferred = createDeferred<void>();
		mocks.prefetchJobPositionsList.mockReturnValue(deferred.promise);

		const { default: EmployeeImportPage } = await import('./page');
		const pagePromise = EmployeeImportPage();
		let settled = false;

		pagePromise.then(() => {
			settled = true;
		});

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(settled).toBe(false);

		deferred.resolve();

		await expect(pagePromise).resolves.toBeDefined();
		expect(mocks.prefetchJobPositionsList).toHaveBeenCalledWith(
			mocks.getQueryClient.mock.results[0].value,
			{
				organizationId: 'org-1',
			},
		);
	});
});
