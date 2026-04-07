import type React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as getQueryClientModule from '@/lib/get-query-client';
import type { AdminAccessContext } from '@/lib/organization-context';
import * as organizationContextModule from '@/lib/organization-context';
import * as serverFunctionsModule from '@/lib/server-functions';
import type { QueryClient } from '@tanstack/react-query';

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
	getQueryClient: vi.fn(),
}));

vi.mock('@/lib/organization-context', () => ({
	getAdminAccessContext: vi.fn(),
}));

vi.mock('@/lib/org-client-context', () => ({
	OrgProvider: ({ children }: { children: React.ReactNode }): React.ReactElement => (
		<>{children}</>
	),
}));

vi.mock('@/lib/server-functions', () => ({
	prefetchLocationsList: vi.fn(),
	prefetchJobPositionsList: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
	dehydrate: (): Record<string, never> => ({}),
	HydrationBoundary: ({ children }: { children: React.ReactNode }): React.ReactElement => (
		<>{children}</>
	),
}));

vi.mock('./import-client', () => ({
	ImportClient: (): React.ReactElement => <div data-testid="import-client" />,
}));

describe('EmployeeImportPage', () => {
	beforeEach(() => {
		const queryClient = { cacheKey: 'query-client' } as unknown as QueryClient;
		const getQueryClient = getQueryClientModule.getQueryClient as unknown as ReturnType<
			typeof vi.fn
		>;
		const getAdminAccessContext =
			organizationContextModule.getAdminAccessContext as unknown as ReturnType<
				typeof vi.fn
			>;
		const prefetchLocationsList =
			serverFunctionsModule.prefetchLocationsList as unknown as ReturnType<typeof vi.fn>;
		const prefetchJobPositionsList =
			serverFunctionsModule.prefetchJobPositionsList as unknown as ReturnType<typeof vi.fn>;
		getQueryClient.mockReset();
		getAdminAccessContext.mockReset();
		prefetchLocationsList.mockReset();
		prefetchJobPositionsList.mockReset();
		getQueryClient.mockReturnValue(queryClient);
		getAdminAccessContext.mockResolvedValue({
			organization: {
				organizationId: 'org-1',
				organizationSlug: 'org-1',
				organizationName: 'Org 1',
			},
			organizationRole: 'owner',
			userRole: 'admin',
			isSuperUser: false,
			canAccessAdminRoutes: true,
		} satisfies AdminAccessContext);
		prefetchLocationsList.mockReturnValue(undefined);
	});

	it('waits for job positions prefetch before returning the hydrated page', async () => {
		const getQueryClient = getQueryClientModule.getQueryClient as unknown as ReturnType<
			typeof vi.fn
		>;
		const prefetchLocationsList =
			serverFunctionsModule.prefetchLocationsList as unknown as ReturnType<typeof vi.fn>;
		const prefetchJobPositionsList =
			serverFunctionsModule.prefetchJobPositionsList as unknown as ReturnType<typeof vi.fn>;
		const deferred = createDeferred<void>();
		prefetchJobPositionsList.mockReturnValue(deferred.promise);

		const { default: EmployeeImportPage } = await import('./page');
		const pagePromise = EmployeeImportPage();
		let settled = false;

		pagePromise.then(() => {
			settled = true;
		});

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(settled).toBe(false);
		expect(prefetchLocationsList).toHaveBeenCalledWith(getQueryClient.mock.results[0].value, {
			organizationId: 'org-1',
			limit: 100,
			offset: 0,
		});

		expect(prefetchJobPositionsList).toHaveBeenCalledWith(getQueryClient.mock.results[0].value, {
			organizationId: 'org-1',
			limit: 100,
			offset: 0,
		});

		deferred.resolve();

		await expect(pagePromise).resolves.toBeDefined();
	});
});
