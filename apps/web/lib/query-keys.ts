/**
 * Query key factory utilities and centralized query key definitions.
 *
 * This module provides strongly-typed query key factories for all dashboard entities,
 * ensuring consistent cache key management across the application.
 *
 * @module query-keys
 */

/**
 * Query parameters for paginated list endpoints.
 */
export interface ListQueryParams {
	/** Maximum number of items to return */
	limit?: number;
	/** Number of items to skip */
	offset?: number;
	/** Search term for filtering */
	search?: string;
	/** Index signature for compatibility with Record<string, unknown> */
	[key: string]: unknown;
}

/**
 * Query parameters for attendance records.
 */
export interface AttendanceQueryParams extends ListQueryParams {
	/** Start date for filtering records */
	fromDate?: Date;
	/** End date for filtering records */
	toDate?: Date;
	/** Filter by attendance type */
	type?: 'CHECK_IN' | 'CHECK_OUT';
}

/**
 * Query parameters for job positions list.
 */
export interface JobPositionQueryParams extends ListQueryParams {
	/** Filter by organization ID (optional for API key usage) */
	organizationId?: string;
}

/**
 * Query parameters for users list.
 */
export interface UsersQueryParams {
	/** Maximum number of items to return */
	limit?: number;
	/** Number of items to skip */
	offset?: number;
	/** Index signature for compatibility with Record<string, unknown> */
	[key: string]: unknown;
}

/**
 * Constructs a query key array from a base key and optional parameters.
 *
 * This utility function creates consistent, type-safe query keys that can be used
 * with TanStack Query's queryKey option. The resulting array is readonly to prevent
 * accidental mutations.
 *
 * @typeParam TKey - The type of the base query key (string or string array)
 * @typeParam TParams - The type of the optional parameters object
 *
 * @param qk - The base query key (string or array of strings)
 * @param params - Optional parameters to append to the query key
 * @returns A readonly array containing the base key and parameters
 *
 * @example
 * ```ts
 * // Simple key
 * queryKeyConstructor('employees'); // ['employees']
 *
 * // Key with params
 * queryKeyConstructor('employees', { search: 'john' }); // ['employees', { search: 'john' }]
 *
 * // Array key with params
 * queryKeyConstructor(['employees', 'list'], { limit: 10 }); // ['employees', 'list', { limit: 10 }]
 * ```
 */
export function queryKeyConstructor<
	TKey extends string | readonly string[],
	TParams extends Record<string, unknown> | undefined = undefined,
>(qk: TKey, params?: TParams): readonly unknown[] {
	const baseKey = typeof qk === 'string' ? [qk] : [...qk];

	if (params === undefined) {
		return baseKey as readonly unknown[];
	}

	return [...baseKey, params] as readonly unknown[];
}

/**
 * Centralized query key factories for all dashboard entities.
 *
 * Each entity has a nested structure with factory functions that generate
 * consistent query keys. This pattern enables:
 * - Type-safe query key generation
 * - Easy cache invalidation by entity or specific queries
 * - Consistent naming across the application
 *
 * @example
 * ```ts
 * // Get all employees keys (for invalidation)
 * queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
 *
 * // Get specific list query key
 * const key = queryKeys.employees.list({ search: 'john', limit: 10 });
 *
 * // Get detail query key
 * const detailKey = queryKeys.employees.detail('employee-id');
 * ```
 */
export const queryKeys = {
	/**
	 * Query keys for employee-related queries.
	 */
	employees: {
		/** Base key for all employee queries */
		all: ['employees'] as const,
		/**
		 * Generates a query key for the employees list.
		 * @param params - Optional list query parameters
		 */
		list: (params?: ListQueryParams) =>
			queryKeyConstructor(['employees', 'list'] as const, params),
		/**
		 * Generates a query key for a specific employee.
		 * @param id - The employee ID
		 */
		detail: (id: string) => ['employees', 'detail', id] as const,
	},

	/**
	 * Query keys for device-related queries.
	 */
	devices: {
		/** Base key for all device queries */
		all: ['devices'] as const,
		/**
		 * Generates a query key for the devices list.
		 * @param params - Optional list query parameters
		 */
		list: (params?: ListQueryParams) =>
			queryKeyConstructor(['devices', 'list'] as const, params),
		/**
		 * Generates a query key for a specific device.
		 * @param id - The device ID
		 */
		detail: (id: string) => ['devices', 'detail', id] as const,
	},

	/**
	 * Query keys for location-related queries.
	 */
	locations: {
		/** Base key for all location queries */
		all: ['locations'] as const,
		/**
		 * Generates a query key for the locations list.
		 * @param params - Optional list query parameters
		 */
		list: (params?: ListQueryParams) =>
			queryKeyConstructor(['locations', 'list'] as const, params),
		/**
		 * Generates a query key for a specific location.
		 * @param id - The location ID
		 */
		detail: (id: string) => ['locations', 'detail', id] as const,
	},

	/**
	 * Query keys for job position-related queries.
	 */
	jobPositions: {
		/** Base key for all job position queries */
		all: ['jobPositions'] as const,
		/**
		 * Generates a query key for the job positions list.
		 * @param params - Optional job position query parameters
		 */
		list: (params?: JobPositionQueryParams) =>
			queryKeyConstructor(['jobPositions', 'list'] as const, params),
		/**
		 * Generates a query key for a specific job position.
		 * @param id - The job position ID
		 */
		detail: (id: string) => ['jobPositions', 'detail', id] as const,
	},

	/**
	 * Query keys for attendance-related queries.
	 */
	attendance: {
		/** Base key for all attendance queries */
		all: ['attendance'] as const,
		/**
		 * Generates a query key for the attendance records list.
		 * @param params - Optional attendance query parameters
		 */
		list: (params?: AttendanceQueryParams) =>
			queryKeyConstructor(['attendance', 'list'] as const, params),
	},

	/**
	 * Query keys for dashboard-related queries.
	 */
	dashboard: {
		/** Base key for all dashboard queries */
		all: ['dashboard'] as const,
		/**
		 * Generates a query key for dashboard entity counts.
		 */
		counts: () => ['dashboard', 'counts'] as const,
	},

	/**
	 * Query keys for API key-related queries (via better-auth).
	 */
	apiKeys: {
		/** Base key for all API key queries */
		all: ['apiKeys'] as const,
		/**
		 * Generates a query key for the API keys list.
		 */
		list: () => ['apiKeys', 'list'] as const,
	},

	/**
	 * Query keys for organization-related queries (via better-auth).
	 */
	organizations: {
		/** Base key for all organization queries */
		all: ['organizations'] as const,
		/**
		 * Generates a query key for the organizations list.
		 */
		list: () => ['organizations', 'list'] as const,
		/**
		 * Generates a query key for a specific organization.
		 * @param id - The organization ID
		 */
		detail: (id: string) => ['organizations', 'detail', id] as const,
	},

	/**
	 * Query keys for user-related queries (via better-auth admin).
	 */
	users: {
		/** Base key for all user queries */
		all: ['users'] as const,
		/**
		 * Generates a query key for the users list.
		 * @param params - Optional users query parameters
		 */
		list: (params?: UsersQueryParams) =>
			queryKeyConstructor(['users', 'list'] as const, params),
		/**
		 * Generates a query key for a specific user.
		 * @param id - The user ID
		 */
		detail: (id: string) => ['users', 'detail', id] as const,
	},
} as const;

/**
 * Centralized mutation key factories for all mutation operations.
 *
 * These keys are used with useMutation to track mutation state and
 * enable features like optimistic updates and mutation deduplication.
 *
 * @example
 * ```ts
 * useMutation({
 *   mutationKey: mutationKeys.employees.create,
 *   mutationFn: createEmployee,
 * });
 * ```
 */
export const mutationKeys = {
	/**
	 * Mutation keys for employee operations.
	 */
	employees: {
		create: ['employees', 'create'] as const,
		update: ['employees', 'update'] as const,
		delete: ['employees', 'delete'] as const,
		createRekognitionUser: ['employees', 'createRekognitionUser'] as const,
		enrollFace: ['employees', 'enrollFace'] as const,
		deleteRekognitionUser: ['employees', 'deleteRekognitionUser'] as const,
		fullEnrollment: ['employees', 'fullEnrollment'] as const,
	},

	/**
	 * Mutation keys for device operations.
	 */
	devices: {
		create: ['devices', 'create'] as const,
		update: ['devices', 'update'] as const,
		delete: ['devices', 'delete'] as const,
	},

	/**
	 * Mutation keys for location operations.
	 */
	locations: {
		create: ['locations', 'create'] as const,
		update: ['locations', 'update'] as const,
		delete: ['locations', 'delete'] as const,
	},

	/**
	 * Mutation keys for job position operations.
	 */
	jobPositions: {
		create: ['jobPositions', 'create'] as const,
		update: ['jobPositions', 'update'] as const,
		delete: ['jobPositions', 'delete'] as const,
	},

	/**
	 * Mutation keys for API key operations.
	 */
	apiKeys: {
		create: ['apiKeys', 'create'] as const,
		delete: ['apiKeys', 'delete'] as const,
	},

	/**
	 * Mutation keys for organization operations.
	 */
	organizations: {
		create: ['organizations', 'create'] as const,
		update: ['organizations', 'update'] as const,
		delete: ['organizations', 'delete'] as const,
	},

	/**
	 * Mutation keys for user operations.
	 */
	users: {
		setRole: ['users', 'setRole'] as const,
		ban: ['users', 'ban'] as const,
		unban: ['users', 'unban'] as const,
	},
} as const;
