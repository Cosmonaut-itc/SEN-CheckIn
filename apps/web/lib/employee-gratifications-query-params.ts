import type {
	EmployeeGratificationApplicationMode,
	EmployeeGratificationListQueryParams,
	EmployeeGratificationPeriodicity,
	EmployeeGratificationStatus,
	OrganizationGratificationListQueryParams,
} from '@/lib/query-keys';

type EmployeeGratificationsQueryParamArgs = {
	organizationId?: string;
	employeeId?: string;
	status?: EmployeeGratificationStatus;
	periodicity?: EmployeeGratificationPeriodicity;
	applicationMode?: EmployeeGratificationApplicationMode;
};

type OrganizationGratificationsQueryParamArgs = {
	organizationId?: string;
	limit: number;
	offset: number;
	employeeId?: string;
	status?: EmployeeGratificationStatus;
	periodicity?: EmployeeGratificationPeriodicity;
	applicationMode?: EmployeeGratificationApplicationMode;
};

/**
 * Builds employee-scoped gratification query params while omitting absent filters.
 *
 * @param args - Query parameter inputs
 * @returns Stable query params object or undefined when required ids are missing
 */
export function buildEmployeeGratificationsQueryParams(
	args: EmployeeGratificationsQueryParamArgs,
): EmployeeGratificationListQueryParams | undefined {
	if (!args.organizationId || !args.employeeId) {
		return undefined;
	}

	return {
		organizationId: args.organizationId,
		employeeId: args.employeeId,
		...(args.status ? { status: args.status } : {}),
		...(args.periodicity ? { periodicity: args.periodicity } : {}),
		...(args.applicationMode ? { applicationMode: args.applicationMode } : {}),
	};
}

/**
 * Builds organization-wide gratification query params while omitting absent filters.
 *
 * @param args - Query parameter inputs
 * @returns Stable query params object or undefined when organization is missing
 */
export function buildOrganizationGratificationsQueryParams(
	args: OrganizationGratificationsQueryParamArgs,
): OrganizationGratificationListQueryParams | undefined {
	if (!args.organizationId) {
		return undefined;
	}

	return {
		organizationId: args.organizationId,
		limit: args.limit,
		offset: args.offset,
		...(args.employeeId ? { employeeId: args.employeeId } : {}),
		...(args.status ? { status: args.status } : {}),
		...(args.periodicity ? { periodicity: args.periodicity } : {}),
		...(args.applicationMode ? { applicationMode: args.applicationMode } : {}),
	};
}
