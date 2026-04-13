import type { PaginatedResponse } from './client-functions.js';
import { MAX_PAGINATION_LIMIT } from '@/lib/pagination';

/**
 * Fetches one page of employees using the provided query shape.
 */
export type EmployeePageFetcher<TEmployee, TParams extends Record<string, unknown>> = (
	params: TParams & { limit: number; offset: number },
) => Promise<PaginatedResponse<TEmployee>>;

/**
 * Loads every employee across all pages until the full result set is collected.
 *
 * @param args - Paging configuration and page fetcher
 * @param args.fetchEmployees - Function that fetches one page of employees
 * @param args.params - Base query params to pass through to each request
 * @param args.pageSize - Requested page size used for each fetch
 * @returns All employees returned by the paginated fetcher
 * @throws Error if the fetcher rejects
 */
export async function fetchAllEmployeesPages<
	TEmployee,
	TParams extends Record<string, unknown> = Record<string, never>,
>(args: {
	fetchEmployees: EmployeePageFetcher<TEmployee, TParams>;
	params?: TParams;
	pageSize?: number;
}): Promise<TEmployee[]> {
	const pageSize = Math.max(1, Math.floor(args.pageSize ?? MAX_PAGINATION_LIMIT));
	const baseParams = args.params ?? ({} as TParams);
	const employees: TEmployee[] = [];
	let offset = 0;
	let total = 0;

	do {
		const response = await args.fetchEmployees({
			...baseParams,
			limit: pageSize,
			offset,
		});

		employees.push(...response.data);
		total = response.pagination.total;

		if (response.data.length === 0) {
			break;
		}

		const nextOffset = offset + Math.max(1, response.pagination.limit);
		if (nextOffset <= offset) {
			break;
		}

		offset = nextOffset;
	} while (employees.length < total);

	return employees;
}

/**
 * Loads every employee and returns the result using the shared paginated shape.
 *
 * @param args - Paging configuration and page fetcher
 * @param args.fetchEmployees - Function that fetches one page of employees
 * @param args.params - Base query params to pass through to each request
 * @param args.pageSize - Requested page size used for each fetch
 * @returns Full employee response compatible with selector queries
 * @throws Error if the fetcher rejects
 */
export async function fetchAllEmployeesListResult<
	TEmployee,
	TParams extends Record<string, unknown> = Record<string, never>,
>(args: {
	fetchEmployees: EmployeePageFetcher<TEmployee, TParams>;
	params?: TParams;
	pageSize?: number;
}): Promise<PaginatedResponse<TEmployee>> {
	const employees = await fetchAllEmployeesPages(args);

	return {
		data: employees,
		pagination: {
			total: employees.length,
			limit:
				employees.length || Math.max(1, Math.floor(args.pageSize ?? MAX_PAGINATION_LIMIT)),
			offset: 0,
		},
	};
}
