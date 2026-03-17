/**
 * Query key factory utilities and centralized query key definitions.
 *
 * This module provides strongly-typed query key factories for all dashboard entities,
 * ensuring consistent cache key management across the application.
 *
 * @module query-keys
 */

import type {
	DisciplinaryMeasureStatus,
	DisciplinaryOutcome,
	HolidayKind,
	HolidaySource,
	HolidayStatus,
	IncapacityStatus,
	IncapacityType,
} from '@sen-checkin/types';

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
 * Query parameters for the superuser organizations list.
 */
export interface OrganizationAllQueryParams extends ListQueryParams {
	/** Field to sort by */
	sortBy?: 'name' | 'slug' | 'createdAt';
	/** Sort direction */
	sortDir?: 'asc' | 'desc';
}

/**
 * Query parameters for attendance records.
 */
export interface AttendanceQueryParams extends ListQueryParams {
	/** Filter by employee ID */
	employeeId?: string;
	/** Start date for filtering records */
	fromDate?: Date;
	/** End date for filtering records */
	toDate?: Date;
	/** Filter by attendance type */
	type?: 'CHECK_IN' | 'CHECK_OUT' | 'CHECK_OUT_AUTHORIZED' | 'WORK_OFFSITE';
	/** Filter by RH offsite day classification */
	offsiteDayKind?: 'LABORABLE' | 'NO_LABORABLE';
	/** Filter by device location ID */
	deviceLocationId?: string;
}

/**
 * Query parameters for attendance present endpoint.
 */
export interface AttendancePresentQueryParams extends Record<string, unknown> {
	/** Start date for filtering records */
	fromDate: Date;
	/** End date for filtering records */
	toDate: Date;
	/** Optional organization filter */
	organizationId?: string | null;
}

/**
 * Query parameters for today offsite attendance endpoint.
 */
export interface AttendanceOffsiteTodayQueryParams extends Record<string, unknown> {
	/** Optional organization filter */
	organizationId?: string | null;
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
 * Query parameters for geocoding searches.
 */
export interface GeocodeQueryParams extends Record<string, unknown> {
	/** Address query string */
	query: string;
}

/**
 * Query parameters for organization members.
 */
export interface OrganizationMembersQueryParams extends UsersQueryParams {
	organizationId?: string | null;
	search?: string;
}

/**
 * Query parameters for payroll calculations.
 */
export interface PayrollCalculateParams {
	periodStartDateKey: string;
	periodEndDateKey: string;
	paymentFrequency?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	organizationId?: string;
	[key: string]: unknown;
}

/**
 * Query parameters for payroll holiday listing.
 */
export interface PayrollHolidayListQueryParams extends Record<string, unknown> {
	organizationId?: string;
	year?: number;
	source?: HolidaySource;
	status?: HolidayStatus;
	kind?: HolidayKind;
}

/**
 * Overtime authorization status values.
 */
export type OvertimeAuthorizationStatus = 'PENDING' | 'ACTIVE' | 'CANCELLED';

export type EmployeeDeductionStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type EmployeeDeductionType =
	| 'INFONAVIT'
	| 'ALIMONY'
	| 'FONACOT'
	| 'LOAN'
	| 'UNION_FEE'
	| 'ADVANCE'
	| 'OTHER';

export interface EmployeeDeductionListQueryParams extends Record<string, unknown> {
	organizationId?: string;
	employeeId: string;
	status?: EmployeeDeductionStatus;
	type?: EmployeeDeductionType;
}

export interface OrganizationDeductionListQueryParams extends ListQueryParams {
	organizationId?: string;
	employeeId?: string;
	status?: EmployeeDeductionStatus;
	type?: EmployeeDeductionType;
}

/**
 * Query parameters for overtime authorizations list.
 */
export interface OvertimeAuthorizationQueryParams extends ListQueryParams {
	organizationId?: string;
	employeeId?: string;
	startDate?: string;
	endDate?: string;
	status?: OvertimeAuthorizationStatus;
}

/**
 * Query parameters for PTU calculations.
 */
export interface PtuCalculateParams {
	fiscalYear: number;
	paymentDateKey: string;
	taxableIncome: number;
	ptuPercentage?: number;
	includeInactive?: boolean;
	smgDailyOverride?: number;
	organizationId?: string;
	[key: string]: unknown;
}

/**
 * Query parameters for Aguinaldo calculations.
 */
export interface AguinaldoCalculateParams {
	calendarYear: number;
	paymentDateKey: string;
	includeInactive?: boolean;
	smgDailyOverride?: number;
	organizationId?: string;
	[key: string]: unknown;
}

/**
 * Query parameters for PTU run listing.
 */
export interface PtuRunQueryParams extends ListQueryParams {
	organizationId?: string;
	fiscalYear?: number;
}

/**
 * Query parameters for Aguinaldo run listing.
 */
export interface AguinaldoRunQueryParams extends ListQueryParams {
	organizationId?: string;
	calendarYear?: number;
}

/**
 * Query parameters for schedule templates.
 */
export interface ScheduleTemplateQueryParams extends ListQueryParams {
	organizationId?: string;
}

/**
 * Query parameters for schedule exceptions.
 */
export interface ScheduleExceptionQueryParams extends ListQueryParams {
	employeeId?: string;
	fromDate?: Date | string;
	toDate?: Date | string;
	organizationId?: string;
}

/**
 * Vacation request status values.
 */
export type VacationRequestStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/**
 * Query parameters for vacation requests list.
 */
export interface VacationRequestQueryParams extends ListQueryParams {
	organizationId?: string;
	employeeId?: string;
	status?: VacationRequestStatus;
	from?: string;
	to?: string;
}

/**
 * Query parameters for incapacity list.
 */
export interface IncapacityQueryParams extends ListQueryParams {
	organizationId?: string;
	employeeId?: string;
	type?: IncapacityType;
	status?: IncapacityStatus;
	from?: string;
	to?: string;
}

/**
 * Query parameters for calendar schedules.
 */
export interface CalendarQueryParams extends Record<string, unknown> {
	startDate: Date | string;
	endDate: Date | string;
	organizationId?: string;
	locationId?: string;
	employeeId?: string;
}

/**
 * Query parameters for disciplinary measures list.
 */
export interface DisciplinaryMeasuresQueryParams extends ListQueryParams {
	employeeId?: string;
	fromDateKey?: string;
	toDateKey?: string;
	status?: DisciplinaryMeasureStatus;
	outcome?: DisciplinaryOutcome;
}

/**
 * Query parameters for disciplinary KPI aggregations.
 */
export interface DisciplinaryKpisQueryParams extends Record<string, unknown> {
	fromDateKey?: string;
	toDateKey?: string;
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
		/**
		 * Generates a query key for employee insights.
		 * @param id - The employee ID
		 */
		insights: (id: string) => ['employees', 'insights', id] as const,
		/**
		 * Generates a query key for employee audit events.
		 * @param params - Audit query parameters
		 */
		audit: (params: { employeeId: string; limit?: number; offset?: number }) =>
			queryKeyConstructor(['employees', 'audit'] as const, params),
		/**
		 * Generates a query key for termination settlement lookup.
		 * @param id - The employee ID
		 */
		terminationSettlement: (id: string) =>
			['employees', 'termination', 'settlement', id] as const,
		/**
		 * Generates a query key for termination draft lookup.
		 * @param id - The employee ID
		 */
		terminationDraft: (id: string) => ['employees', 'termination', 'draft', id] as const,
		/**
		 * Generates a query key for latest payroll run lookup.
		 * @param id - The employee ID
		 */
		latestPayroll: (id: string) => ['employees', 'payroll', 'latest', id] as const,
		/**
		 * Generates a query key for employee document summary.
		 * @param id - The employee ID
		 */
		documentsSummary: (id: string) => ['employees', 'documents', 'summary', id] as const,
		/**
		 * Generates a query key for employee document history.
		 * @param params - Employee document history params
		 */
		documentsHistory: (params: {
			employeeId: string;
			limit?: number;
			offset?: number;
			requirementKey?: string;
		}) => queryKeyConstructor(['employees', 'documents', 'history'] as const, params),
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
		 * Generates a query key for the full locations list.
		 * @param organizationId - Optional organization filter
		 */
		allList: (organizationId?: string | null) =>
			queryKeyConstructor(['locations', 'allList'] as const, {
				organizationId: organizationId ?? undefined,
			}),
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
		/**
		 * Generates a query key for attendance present records.
		 * @param params - Attendance present query parameters
		 */
		present: (params: AttendancePresentQueryParams) =>
			queryKeyConstructor(['attendance', 'present'] as const, params),
		/**
		 * Generates a query key for today's offsite records.
		 * @param params - Today offsite query parameters
		 */
		offsiteToday: (params: AttendanceOffsiteTodayQueryParams) =>
			queryKeyConstructor(['attendance', 'offsiteToday'] as const, params),
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
		counts: (organizationId?: string | null) =>
			queryKeyConstructor(['dashboard', 'counts'] as const, {
				organizationId: organizationId ?? undefined,
			}),
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
	 * Query keys for superuser-scoped queries.
	 */
	super: {
		organizationsAll: {
			/** Base key for all superuser organization queries */
			all: ['super', 'organizationsAll'] as const,
			/**
			 * Generates a query key for the superuser organizations list.
			 * @param params - Optional list query parameters
			 */
			list: (params?: OrganizationAllQueryParams) =>
				queryKeyConstructor(['super', 'organizationsAll', 'list'] as const, params),
		},
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

	/**
	 * Query keys for organization member-related queries.
	 */
	organizationMembers: {
		all: ['organizationMembers'] as const,
		list: (params?: OrganizationMembersQueryParams) =>
			queryKeyConstructor(['organizationMembers', 'list'] as const, params),
	},

	/**
	 * Query keys for geocoding searches.
	 */
	geocode: {
		all: ['geocode'] as const,
		search: (params: GeocodeQueryParams) =>
			queryKeyConstructor(['geocode', 'search'] as const, params),
	},

	/**
	 * Query keys for payroll settings and runs.
	 */
	payrollSettings: {
		all: ['payrollSettings'] as const,
		current: (organizationId?: string | null) =>
			queryKeyConstructor(['payrollSettings', 'current'] as const, {
				organizationId: organizationId ?? undefined,
			}),
		holidays: (params?: PayrollHolidayListQueryParams) =>
			queryKeyConstructor(['payrollSettings', 'holidays'] as const, params),
		holidaySyncStatus: (organizationId?: string | null) =>
			queryKeyConstructor(['payrollSettings', 'holidaySyncStatus'] as const, {
				organizationId: organizationId ?? undefined,
			}),
	},
	payroll: {
		all: ['payroll'] as const,
		calculate: (params: PayrollCalculateParams) =>
			queryKeyConstructor(['payroll', 'calculate'] as const, params),
		runs: (params?: { organizationId?: string }) =>
			queryKeyConstructor(['payroll', 'runs'] as const, params),
		runDetail: (id: string) => ['payroll', 'runs', id] as const,
	},
	employeeDeductions: {
		all: ['employeeDeductions'] as const,
		employee: (params: EmployeeDeductionListQueryParams) =>
			queryKeyConstructor(['employeeDeductions', 'employee'] as const, params),
		organization: (params?: OrganizationDeductionListQueryParams) =>
			queryKeyConstructor(['employeeDeductions', 'organization'] as const, params),
	},
	overtimeAuthorizations: {
		all: ['overtimeAuthorizations'] as const,
		list: (params?: OvertimeAuthorizationQueryParams) =>
			queryKeyConstructor(['overtimeAuthorizations', 'list'] as const, params),
	},
	ptu: {
		all: ['ptu'] as const,
		calculate: (params: PtuCalculateParams) =>
			queryKeyConstructor(['ptu', 'calculate'] as const, params),
		runs: (params?: PtuRunQueryParams) => queryKeyConstructor(['ptu', 'runs'] as const, params),
		runDetail: (id: string) => ['ptu', 'runs', id] as const,
		history: (employeeId: string) => ['ptu', 'history', employeeId] as const,
	},
	aguinaldo: {
		all: ['aguinaldo'] as const,
		calculate: (params: AguinaldoCalculateParams) =>
			queryKeyConstructor(['aguinaldo', 'calculate'] as const, params),
		runs: (params?: AguinaldoRunQueryParams) =>
			queryKeyConstructor(['aguinaldo', 'runs'] as const, params),
		runDetail: (id: string) => ['aguinaldo', 'runs', id] as const,
	},

	/**
	 * Query keys for disciplinary measure workflows.
	 */
	disciplinaryMeasures: {
		all: ['disciplinaryMeasures'] as const,
		list: (params?: DisciplinaryMeasuresQueryParams) =>
			queryKeyConstructor(['disciplinaryMeasures', 'list'] as const, params),
		kpis: (params?: DisciplinaryKpisQueryParams) =>
			queryKeyConstructor(['disciplinaryMeasures', 'kpis'] as const, params),
		detail: (id: string) => ['disciplinaryMeasures', 'detail', id] as const,
	},

	/**
	 * Query keys for schedule templates.
	 */
	scheduleTemplates: {
		all: ['scheduleTemplates'] as const,
		list: (params?: ScheduleTemplateQueryParams) =>
			queryKeyConstructor(['scheduleTemplates', 'list'] as const, params),
		detail: (id: string) => ['scheduleTemplates', 'detail', id] as const,
	},

	/**
	 * Query keys for schedule exceptions.
	 */
	scheduleExceptions: {
		all: ['scheduleExceptions'] as const,
		list: (params?: ScheduleExceptionQueryParams) =>
			queryKeyConstructor(['scheduleExceptions', 'list'] as const, params),
	},

	/**
	 * Query keys for vacation requests.
	 */
	vacations: {
		all: ['vacations'] as const,
		list: (params?: VacationRequestQueryParams) =>
			queryKeyConstructor(['vacations', 'list'] as const, params),
		balance: (organizationId?: string | null) =>
			queryKeyConstructor(['vacations', 'balance'] as const, {
				organizationId: organizationId ?? undefined,
			}),
	},

	/**
	 * Query keys for incapacity records.
	 */
	incapacities: {
		all: ['incapacities'] as const,
		list: (params?: IncapacityQueryParams) =>
			queryKeyConstructor(['incapacities', 'list'] as const, params),
	},

	/**
	 * Query keys for employee document workflow configuration.
	 */
	documentWorkflow: {
		all: ['documentWorkflow'] as const,
		config: ['documentWorkflow', 'config'] as const,
		templates: (
			kind: 'CONTRACT' | 'NDA' | 'ACTA_ADMINISTRATIVA' | 'CONSTANCIA_NEGATIVA_FIRMA',
		) => ['documentWorkflow', 'templates', kind] as const,
		branding: ['documentWorkflow', 'branding'] as const,
	},

	/**
	 * Query keys for scheduling/calendar queries.
	 */
	scheduling: {
		all: ['scheduling'] as const,
		calendar: (params: CalendarQueryParams) =>
			queryKeyConstructor(['scheduling', 'calendar'] as const, params),
	},

	/**
	 * Query keys for device authorization (BetterAuth device flow).
	 */
	deviceAuth: {
		all: ['deviceAuth'] as const,
		verify: (userCode: string) =>
			queryKeyConstructor(['deviceAuth', 'verify'] as const, {
				userCode,
			}),
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
		previewTermination: ['employees', 'previewTermination'] as const,
		terminate: ['employees', 'terminate'] as const,
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
	 * Mutation keys for schedule templates.
	 */
	scheduleTemplates: {
		create: ['scheduleTemplates', 'create'] as const,
		update: ['scheduleTemplates', 'update'] as const,
		delete: ['scheduleTemplates', 'delete'] as const,
	},

	/**
	 * Mutation keys for schedule exceptions.
	 */
	scheduleExceptions: {
		create: ['scheduleExceptions', 'create'] as const,
		update: ['scheduleExceptions', 'update'] as const,
		delete: ['scheduleExceptions', 'delete'] as const,
	},

	/**
	 * Mutation keys for vacation requests.
	 */
	vacations: {
		create: ['vacations', 'create'] as const,
		approve: ['vacations', 'approve'] as const,
		reject: ['vacations', 'reject'] as const,
		cancel: ['vacations', 'cancel'] as const,
	},

	/**
	 * Mutation keys for incapacity workflows.
	 */
	incapacities: {
		create: ['incapacities', 'create'] as const,
		update: ['incapacities', 'update'] as const,
		cancel: ['incapacities', 'cancel'] as const,
		presign: ['incapacities', 'presign'] as const,
		confirm: ['incapacities', 'confirm'] as const,
	},

	/**
	 * Mutation keys for employee document workflows.
	 */
	employeeDocuments: {
		presign: ['employeeDocuments', 'presign'] as const,
		confirm: ['employeeDocuments', 'confirm'] as const,
		review: ['employeeDocuments', 'review'] as const,
		generateLegal: ['employeeDocuments', 'generateLegal'] as const,
		signDigital: ['employeeDocuments', 'signDigital'] as const,
		signPhysicalPresign: ['employeeDocuments', 'signPhysicalPresign'] as const,
		signPhysicalConfirm: ['employeeDocuments', 'signPhysicalConfirm'] as const,
	},

	/**
	 * Mutation keys for organization document workflow configuration.
	 */
	documentWorkflow: {
		updateConfig: ['documentWorkflow', 'updateConfig'] as const,
		createTemplateDraft: ['documentWorkflow', 'createTemplateDraft'] as const,
		updateTemplate: ['documentWorkflow', 'updateTemplate'] as const,
		publishTemplate: ['documentWorkflow', 'publishTemplate'] as const,
		presignBranding: ['documentWorkflow', 'presignBranding'] as const,
		confirmBranding: ['documentWorkflow', 'confirmBranding'] as const,
	},

	/**
	 * Mutation keys for scheduling operations.
	 */
	scheduling: {
		assignTemplate: ['scheduling', 'assignTemplate'] as const,
		validate: ['scheduling', 'validate'] as const,
	},

	/**
	 * Mutation keys for payroll operations.
	 */
	payroll: {
		calculate: ['payroll', 'calculate'] as const,
		process: ['payroll', 'process'] as const,
	},
	employeeDeductions: {
		create: ['employeeDeductions', 'create'] as const,
		update: ['employeeDeductions', 'update'] as const,
		cancel: ['employeeDeductions', 'cancel'] as const,
	},
	payrollSettings: {
		update: ['payrollSettings', 'update'] as const,
	},
	overtimeAuthorizations: {
		create: ['overtimeAuthorizations', 'create'] as const,
		update: ['overtimeAuthorizations', 'update'] as const,
		cancel: ['overtimeAuthorizations', 'cancel'] as const,
	},
	ptu: {
		calculate: ['ptu', 'calculate'] as const,
		create: ['ptu', 'create'] as const,
		update: ['ptu', 'update'] as const,
		process: ['ptu', 'process'] as const,
		cancel: ['ptu', 'cancel'] as const,
	},
	aguinaldo: {
		calculate: ['aguinaldo', 'calculate'] as const,
		create: ['aguinaldo', 'create'] as const,
		update: ['aguinaldo', 'update'] as const,
		process: ['aguinaldo', 'process'] as const,
		cancel: ['aguinaldo', 'cancel'] as const,
	},
	ptuHistory: {
		upsert: ['ptu', 'history', 'upsert'] as const,
	},
	disciplinaryMeasures: {
		create: ['disciplinaryMeasures', 'create'] as const,
		update: ['disciplinaryMeasures', 'update'] as const,
		generateActa: ['disciplinaryMeasures', 'generateActa'] as const,
		presignActa: ['disciplinaryMeasures', 'presignActa'] as const,
		confirmActa: ['disciplinaryMeasures', 'confirmActa'] as const,
		generateRefusal: ['disciplinaryMeasures', 'generateRefusal'] as const,
		presignRefusal: ['disciplinaryMeasures', 'presignRefusal'] as const,
		confirmRefusal: ['disciplinaryMeasures', 'confirmRefusal'] as const,
		presignAttachment: ['disciplinaryMeasures', 'presignAttachment'] as const,
		confirmAttachment: ['disciplinaryMeasures', 'confirmAttachment'] as const,
		deleteAttachment: ['disciplinaryMeasures', 'deleteAttachment'] as const,
		close: ['disciplinaryMeasures', 'close'] as const,
	},

	/**
	 * Mutation keys for user operations.
	 */
	users: {
		setRole: ['users', 'setRole'] as const,
		ban: ['users', 'ban'] as const,
		unban: ['users', 'unban'] as const,
	},

	/**
	 * Mutation keys for organization member operations.
	 */
	organizationMembers: {
		create: ['organizationMembers', 'create'] as const,
		add: ['organizationMembers', 'add'] as const,
		update: ['organizationMembers', 'update'] as const,
	},

	deviceAuth: {
		approve: ['deviceAuth', 'approve'] as const,
		deny: ['deviceAuth', 'deny'] as const,
	},
} as const;
