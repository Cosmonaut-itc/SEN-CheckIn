import type {
	EmployeeDeductionListQueryParams,
	EmployeeDeductionStatus,
	EmployeeDeductionType,
	OrganizationDeductionListQueryParams,
} from '@/lib/query-keys';

type EmployeeDeductionsQueryParamArgs = {
	organizationId?: string;
	employeeId?: string;
	status?: EmployeeDeductionStatus;
	type?: EmployeeDeductionType;
};

type OrganizationDeductionsQueryParamArgs = {
	organizationId?: string;
	limit: number;
	offset: number;
	employeeId?: string;
	status?: EmployeeDeductionStatus;
	type?: EmployeeDeductionType;
};

/**
 * Builds employee-scoped deduction query params while omitting absent filters.
 *
 * @param args - Query parameter inputs
 * @returns Stable query params object or undefined when required ids are missing
 */
export function buildEmployeeDeductionsQueryParams(
	args: EmployeeDeductionsQueryParamArgs,
): EmployeeDeductionListQueryParams | undefined {
	if (!args.organizationId || !args.employeeId) {
		return undefined;
	}

	return {
		organizationId: args.organizationId,
		employeeId: args.employeeId,
		...(args.status ? { status: args.status } : {}),
		...(args.type ? { type: args.type } : {}),
	};
}

/**
 * Builds organization-wide deduction query params while omitting absent filters.
 *
 * @param args - Query parameter inputs
 * @returns Stable query params object or undefined when organization is missing
 */
export function buildOrganizationDeductionsQueryParams(
	args: OrganizationDeductionsQueryParamArgs,
): OrganizationDeductionListQueryParams | undefined {
	if (!args.organizationId) {
		return undefined;
	}

	return {
		organizationId: args.organizationId,
		limit: args.limit,
		offset: args.offset,
		...(args.employeeId ? { employeeId: args.employeeId } : {}),
		...(args.status ? { status: args.status } : {}),
		...(args.type ? { type: args.type } : {}),
	};
}
