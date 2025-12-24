/**
 * Client-side data fetching functions for TanStack Query.
 *
 * This module centralizes all API calls used by queries and mutations,
 * providing a consistent interface for data fetching across the application.
 *
 * @module client-functions
 */

import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { normalizeUserCode } from '@/lib/device-code-utils';
import type {
	AttendanceQueryParams,
	CalendarQueryParams,
	ListQueryParams,
	ScheduleExceptionQueryParams,
	ScheduleTemplateQueryParams,
	VacationRequestQueryParams,
	UsersQueryParams,
} from '@/lib/query-keys';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Employee status enum values.
 */
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';

/**
 * Device status enum values.
 */
export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';

/**
 * Attendance type enum values.
 */
export type AttendanceType = 'CHECK_IN' | 'CHECK_OUT';

/**
 * Employee record interface.
 */
export interface Employee {
	id: string;
	code: string;
	firstName: string;
	lastName: string;
	email: string | null;
	phone: string | null;
	jobPositionId: string | null;
	/** Job position name (from joined job_position table) */
	jobPositionName: string | null;
	department: string | null;
	status: EmployeeStatus;
	hireDate: Date | null;
	sbcDailyOverride: number | null;
	locationId: string | null;
	organizationId: string | null;
	userId: string | null;
	rekognitionUserId: string | null;
	lastPayrollDate?: Date | null;
	schedule?: EmployeeScheduleEntry[];
	shiftType: 'DIURNA' | 'NOCTURNA' | 'MIXTA';
	createdAt: Date;
	updatedAt: Date;
}

export interface EmployeeScheduleEntry {
	dayOfWeek: number;
	startTime: string;
	endTime: string;
	isWorkingDay: boolean;
}

/**
 * Device record interface.
 */
export interface Device {
	id: string;
	code: string;
	name: string | null;
	deviceType: string | null;
	status: DeviceStatus;
	lastHeartbeat: Date | null;
	locationId: string | null;
	organizationId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Location record interface.
 */
export interface Location {
	id: string;
	name: string;
	code: string;
	address: string | null;
	organizationId: string | null;
	geographicZone: 'GENERAL' | 'ZLFN';
	timeZone: string;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Job position record interface.
 */
export interface JobPosition {
	id: string;
	name: string;
	description: string | null;
	dailyPay: number;
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	organizationId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Attendance record interface.
 */
export interface AttendanceRecord {
	id: string;
	employeeId: string;
	employeeName: string;
	deviceId: string;
	deviceLocationName?: string | null;
	timestamp: Date;
	type: AttendanceType;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Vacation request status values.
 */
export type VacationRequestStatus =
	| 'DRAFT'
	| 'SUBMITTED'
	| 'APPROVED'
	| 'REJECTED'
	| 'CANCELLED';

/**
 * Vacation day classification values.
 */
export type VacationDayType =
	| 'SCHEDULED_WORKDAY'
	| 'SCHEDULED_REST_DAY'
	| 'EXCEPTION_WORKDAY'
	| 'EXCEPTION_DAY_OFF'
	| 'MANDATORY_REST_DAY';

/**
 * Vacation request day detail.
 */
export interface VacationRequestDay {
	dateKey: string;
	countsAsVacationDay: boolean;
	dayType: VacationDayType;
	serviceYearNumber: number | null;
}

/**
 * Vacation request summary details.
 */
export interface VacationRequestSummary {
	totalDays: number;
	vacationDays: number;
}

/**
 * Vacation request record interface.
 */
export interface VacationRequest {
	id: string;
	organizationId: string;
	employeeId: string;
	requestedByUserId: string | null;
	status: VacationRequestStatus;
	startDateKey: string;
	endDateKey: string;
	requestedNotes: string | null;
	decisionNotes: string | null;
	approvedByUserId: string | null;
	approvedAt: Date | null;
	rejectedByUserId: string | null;
	rejectedAt: Date | null;
	cancelledByUserId: string | null;
	cancelledAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
	employeeName: string | null;
	employeeLastName: string | null;
	days: VacationRequestDay[];
	summary: VacationRequestSummary;
}

/**
 * Vacation balance summary for self-service.
 */
export interface VacationBalance {
	employeeId: string;
	hireDate: Date;
	asOfDateKey: string;
	serviceYearNumber: number;
	serviceYearStartDateKey: string | null;
	serviceYearEndDateKey: string | null;
	entitledDays: number;
	usedDays: number;
	pendingDays: number;
	availableDays: number;
}

/**
 * API Key record interface from better-auth.
 */
export interface ApiKey {
	id: string;
	name: string | null;
	start: string | null;
	prefix: string | null;
	key?: string;
	userId: string;
	enabled: boolean | null;
	expiresAt: Date | null;
	createdAt: Date;
	lastRequest: Date | null;
}

/**
 * Organization record interface from better-auth.
 */
export interface Organization {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
}

/**
 * Organization member record from better-auth organization plugin.
 */
export interface OrganizationMember {
	id: string;
	userId: string;
	organizationId: string;
	role: string;
	createdAt: Date;
	user: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	};
}

/**
 * User record interface from better-auth admin.
 */
export interface User {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image: string | null;
	role: string;
	banned: boolean;
	createdAt: Date;
}

/**
 * Pagination metadata from API responses.
 */
export interface PaginationMeta {
	total: number;
	limit: number;
	offset: number;
}

/**
 * Generic paginated response structure.
 */
export interface PaginatedResponse<T> {
	data: T[];
	pagination: PaginationMeta;
}

/**
 * Dashboard entity counts.
 */
export interface DashboardCounts {
	employees: number;
	devices: number;
	locations: number;
	organizations: number;
	attendance: number;
}

/**
 * Device authorization status values.
 */
export type DeviceAuthStatus = 'pending' | 'approved' | 'denied';

/**
 * Verification result from BetterAuth device authorization.
 */
export interface DeviceVerificationResult {
	userCode: string;
	status: DeviceAuthStatus;
}

interface DeviceVerifyPayload {
	user_code: string;
	status: DeviceAuthStatus;
}

const AUTH_ORIGIN: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const AUTH_BASE_URL: string = AUTH_ORIGIN.endsWith('/api/auth')
	? AUTH_ORIGIN
	: `${AUTH_ORIGIN}/api/auth`;

interface BetterAuthErrorBody {
	error?: string;
	error_description?: string;
}

interface BetterAuthError {
	body?: BetterAuthErrorBody;
	message?: string;
	status?: number;
}

interface BetterAuthResult<TData> {
	data?: TData;
	error?: BetterAuthError;
	status?: number;
}

export interface DeviceClient {
	verify: (
		input: { query: { user_code: string } },
		init?: { headers?: HeadersInit },
	) => Promise<BetterAuthResult<{ user_code: string; status: DeviceAuthStatus }>>;
	approve: (
		input: { userCode: string },
		init?: { headers?: HeadersInit },
	) => Promise<BetterAuthResult<{ success?: boolean }>>;
	deny: (
		input: { userCode: string },
		init?: { headers?: HeadersInit },
	) => Promise<BetterAuthResult<{ success?: boolean }>>;
}

/**
 * Convenience accessor for the BetterAuth device client.
 */
function getDeviceClient(): DeviceClient {
	return (authClient as unknown as { device: DeviceClient }).device;
}

// ============================================================================
// Device Authorization (BetterAuth Device Flow)
// ============================================================================

/**
 * Verifies a device user code via BetterAuth.
 *
 * @param userCode - Raw or formatted user code (dashes allowed)
 * @returns Verification result containing normalized user code and status
 */
export async function verifyDeviceCode(userCode: string): Promise<DeviceVerificationResult> {
	const normalized = normalizeUserCode(userCode);

	const url = new URL(`${AUTH_BASE_URL}/device`);
	url.searchParams.set('user_code', normalized);

	const response = await fetch(url.toString(), {
		method: 'GET',
		credentials: 'include',
		headers: {
			'Content-Type': 'application/json',
		},
	});

	const data = (await response.json().catch(() => null)) as DeviceVerifyPayload | null;

	if (!response.ok || !data) {
		const message = data?.status ? `Invalid status: ${data.status}` : 'Invalid or expired code';
		throw new Error(message);
	}

	return {
		userCode: normalizeUserCode(data.user_code ?? normalized),
		status: data.status ?? 'pending',
	};
}

/**
 * Approves a pending device authorization request.
 *
 * @param userCode - User-facing code (formatted or raw)
 * @returns Success boolean from BetterAuth
 */
export async function approveDeviceCode(userCode: string): Promise<boolean> {
	const deviceClient = getDeviceClient();
	const normalized = normalizeUserCode(userCode);
	const response = await deviceClient.approve({ userCode: normalized });

	if (response.error) {
		const message = response.error?.body?.error_description ?? 'Failed to approve device';
		throw new Error(message);
	}
	return Boolean(response.data?.success ?? true);
}

/**
 * Denies a pending device authorization request.
 *
 * @param userCode - User-facing code (formatted or raw)
 * @returns Success boolean from BetterAuth
 */
export async function denyDeviceCode(userCode: string): Promise<boolean> {
	const deviceClient = getDeviceClient();
	const normalized = normalizeUserCode(userCode);
	const response = await deviceClient.deny({ userCode: normalized });

	if (response.error) {
		const message = response.error?.body?.error_description ?? 'Failed to deny device';
		throw new Error(message);
	}
	return Boolean(response.data?.success ?? true);
}

// ============================================================================
// Employee Functions
// ============================================================================

/**
 * Fetches a paginated list of employees from the API.
 *
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated employees response
 * @throws Error if the API request fails
 *
 * @example
 * ```ts
 * const { data, pagination } = await fetchEmployeesList({ search: 'john', limit: 10 });
 * ```
 */
export async function fetchEmployeesList(
	params?: ListQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<Employee>> {
	if (params?.organizationId === null) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit: params?.limit ?? 100,
				offset: params?.offset ?? 0,
			},
		};
	}

	// Build query object, only including defined values
	// Eden Treaty converts undefined to string "undefined" which breaks search
	const query: {
		limit: number;
		offset: number;
		organizationId?: string;
		search?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
	};

	// Only add search if it has a non-empty value
	if (params?.search) {
		query.search = params.search;
	}

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}

	const response = await api.employees.get({ $query: query });

	if (response.error) {
		console.error('Failed to fetch employees:', response.error, 'Status:', response.status);
		throw new Error('Failed to fetch employees');
	}

	return {
		data: (response.data?.data ?? []) as Employee[],
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}

/**
 * Fetches a single employee by ID (includes schedule).
 *
 * @param id - Employee ID
 * @returns Employee record or null when not found
 */
export async function fetchEmployeeById(id: string): Promise<Employee | null> {
	const response = await api.employees[id].get();

	if (response.error) {
		console.error(
			'Failed to fetch employee detail:',
			response.error,
			'Status:',
			response.status,
		);
		return null;
	}

	return (response.data?.data as Employee) ?? null;
}

// ============================================================================
// Device Functions
// ============================================================================

/**
 * Fetches a paginated list of devices from the API.
 *
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated devices response
 * @throws Error if the API request fails
 *
 * @example
 * ```ts
 * const { data, pagination } = await fetchDevicesList({ limit: 50 });
 * ```
 */
export async function fetchDevicesList(
	params?: ListQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<Device>> {
	if (params?.organizationId === null) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit: params?.limit ?? 100,
				offset: params?.offset ?? 0,
			},
		};
	}

	// Build query object, only including defined values
	const query: {
		limit: number;
		offset: number;
		organizationId?: string;
		search?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
	};

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}

	if (params?.search) {
		query.search = params.search;
	}

	const response = await api.devices.get({ $query: query });

	if (response.error) {
		throw new Error('Failed to fetch devices');
	}

	return {
		data: (response.data?.data ?? []) as Device[],
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}

// ============================================================================
// Location Functions
// ============================================================================

/**
 * Fetches a paginated list of locations from the API.
 *
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated locations response
 * @throws Error if the API request fails
 *
 * @example
 * ```ts
 * const { data, pagination } = await fetchLocationsList({ search: 'main' });
 * ```
 */
export async function fetchLocationsList(
	params?: ListQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<Location>> {
	if (params?.organizationId === null) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit: params?.limit ?? 100,
				offset: params?.offset ?? 0,
			},
		};
	}

	// Build query object, only including defined values
	const query: {
		limit: number;
		offset: number;
		organizationId?: string;
		search?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
	};

	if (params?.search) {
		query.search = params.search;
	}

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}

	const response = await api.locations.get({ $query: query });

	if (response.error) {
		throw new Error('Failed to fetch locations');
	}

	return {
		data: (response.data?.data ?? []) as Location[],
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}

// ============================================================================
// Job Position Functions
// ============================================================================

/**
 * Query parameters specific to job positions.
 */
export interface JobPositionQueryParams extends ListQueryParams {
	/** Filter by organization ID (optional for API key usage) */
	organizationId?: string;
}

/**
 * Fetches a paginated list of job positions from the API.
 *
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated job positions response
 * @throws Error if the API request fails
 *
 * @example
 * ```ts
 * const { data, pagination } = await fetchJobPositionsList({ search: 'engineer' });
 * ```
 */
export async function fetchJobPositionsList(
	params?: JobPositionQueryParams,
): Promise<PaginatedResponse<JobPosition>> {
	// Require organization context; avoid hitting API with missing org
	if (!params?.organizationId) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit: params?.limit ?? 100,
				offset: params?.offset ?? 0,
			},
		};
	}
	// Build query object, only including defined values
	// Eden Treaty converts undefined to string "undefined" which breaks search
	const query: {
		limit: number;
		offset: number;
		organizationId?: string;
		search?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
	};

	// Only add organizationId if it has a non-empty value
	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}

	// Only add search if it has a non-empty value
	if (params?.search) {
		query.search = params.search;
	}

	const response = await api['job-positions'].get({ $query: query });

	if (response.error) {
		console.error('Failed to fetch job positions:', response.error, 'Status:', response.status);
		throw new Error('Failed to fetch job positions');
	}

	const positions =
		(response.data?.data as
			| (Omit<JobPosition, 'dailyPay'> & { dailyPay?: string | number })[]
			| undefined) ?? [];

	return {
		data: positions.map((jp) => ({
			...jp,
			dailyPay: Number(jp.dailyPay ?? 0),
		})),
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}

// ============================================================================
// Attendance Functions
// ============================================================================

/**
 * Fetches a paginated list of attendance records from the API.
 *
 * @param params - Optional query parameters for filtering and pagination
 * @returns A promise resolving to the paginated attendance records response
 * @throws Error if the API request fails
 *
 * @example
 * ```ts
 * const { data, pagination } = await fetchAttendanceRecords({
 *   fromDate: startOfDay(new Date()),
 *   toDate: endOfDay(new Date()),
 *   type: 'CHECK_IN',
 * });
 * ```
 */
export async function fetchAttendanceRecords(
	params?: AttendanceQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<AttendanceRecord>> {
	if (params?.organizationId === null) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit: params?.limit ?? 100,
				offset: params?.offset ?? 0,
			},
		};
	}

	// Build query object, only including type if it's defined
	const query: {
		limit: number;
		offset: number;
		fromDate?: Date;
		toDate?: Date;
		type?: AttendanceType;
		organizationId?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
		fromDate: params?.fromDate,
		toDate: params?.toDate,
	};

	// Only add type if it's a valid enum value (not undefined)
	if (params?.type) {
		query.type = params.type;
	}

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}

	const response = await api.attendance.get({ $query: query });

	if (response.error) {
		throw new Error('Failed to fetch attendance records');
	}

	return {
		data: (response.data?.data ?? []) as AttendanceRecord[],
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}

// ============================================================================
// Vacation Functions
// ============================================================================

type VacationRequestPayload = Omit<
	VacationRequest,
	'approvedAt' | 'rejectedAt' | 'cancelledAt' | 'createdAt' | 'updatedAt'
> & {
	approvedAt: string | Date | null;
	rejectedAt: string | Date | null;
	cancelledAt: string | Date | null;
	createdAt: string | Date;
	updatedAt: string | Date;
};

type VacationBalancePayload = Omit<VacationBalance, 'hireDate'> & {
	hireDate: string | Date;
};

/**
 * Normalizes vacation request payload timestamps into Date objects.
 *
 * @param payload - Raw vacation request payload
 * @returns Normalized vacation request
 */
function normalizeVacationRequest(payload: VacationRequestPayload): VacationRequest {
	return {
		...payload,
		approvedAt: payload.approvedAt ? new Date(payload.approvedAt) : null,
		rejectedAt: payload.rejectedAt ? new Date(payload.rejectedAt) : null,
		cancelledAt: payload.cancelledAt ? new Date(payload.cancelledAt) : null,
		createdAt: new Date(payload.createdAt),
		updatedAt: new Date(payload.updatedAt),
	};
}

/**
 * Normalizes vacation balance payload timestamps into Date objects.
 *
 * @param payload - Raw vacation balance payload
 * @returns Normalized vacation balance
 */
function normalizeVacationBalance(payload: VacationBalancePayload): VacationBalance {
	return {
		...payload,
		hireDate: new Date(payload.hireDate),
	};
}

/**
 * Fetches vacation requests list for HR/admin workflows.
 *
 * @param params - Query parameters for vacation requests
 * @returns Paginated vacation requests
 * @throws Error if the API request fails
 */
export async function fetchVacationRequestsList(
	params?: VacationRequestQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<VacationRequest>> {
	if (params?.organizationId === null) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit: params?.limit ?? 50,
				offset: params?.offset ?? 0,
			},
		};
	}

	const query: {
		limit: number;
		offset: number;
		organizationId?: string;
		employeeId?: string;
		status?: VacationRequestStatus;
		from?: string;
		to?: string;
	} = {
		limit: params?.limit ?? 50,
		offset: params?.offset ?? 0,
	};

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}
	if (params?.employeeId) {
		query.employeeId = params.employeeId;
	}
	if (params?.status) {
		query.status = params.status;
	}
	if (params?.from) {
		query.from = params.from;
	}
	if (params?.to) {
		query.to = params.to;
	}

	const response = await api.vacations.requests.get({ $query: query });

	if (response.error) {
		console.error('Failed to fetch vacation requests:', response.error, 'Status:', response.status);
		throw new Error('Failed to fetch vacation requests');
	}

	const payload =
		(response.data?.data as VacationRequestPayload[] | undefined) ?? [];
	return {
		data: payload.map(normalizeVacationRequest),
		pagination: response.data?.pagination ?? {
			total: 0,
			limit: query.limit,
			offset: query.offset,
		},
	};
}

/**
 * Fetches vacation balance for the current employee (self-service).
 *
 * @param params - Optional organization context
 * @returns Vacation balance or null when missing
 */
export async function fetchVacationBalance(params?: {
	organizationId?: string | null;
}): Promise<VacationBalance | null> {
	if (params?.organizationId === null) {
		return null;
	}

	const query = params?.organizationId ? { organizationId: params.organizationId } : undefined;
	const response = await api.vacations.me.balance.get({ $query: query });

	if (response.error) {
		console.error('Failed to fetch vacation balance:', response.error, 'Status:', response.status);
		return null;
	}

	const payload = response.data?.data as VacationBalancePayload | undefined;
	return payload ? normalizeVacationBalance(payload) : null;
}

// ============================================================================
// Payroll Functions
// ============================================================================

export interface PayrollSettings {
	id: string;
	organizationId: string;
	weekStartDay: number;
	timeZone: string;
	overtimeEnforcement: 'WARN' | 'BLOCK';
	additionalMandatoryRestDays: string[];
	riskWorkRate: number;
	statePayrollTaxRate: number;
	absorbImssEmployeeShare: boolean;
	absorbIsr: boolean;
	aguinaldoDays: number;
	vacationPremiumRate: number;
	enableSeventhDayPay: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface PayrollWarning {
	type:
		| 'OVERTIME_DAILY_EXCEEDED'
		| 'OVERTIME_WEEKLY_EXCEEDED'
		| 'OVERTIME_WEEKLY_DAYS_EXCEEDED'
		| 'BELOW_MINIMUM_WAGE';
	message: string;
	severity: 'warning' | 'error';
}

export interface PayrollTaxBases {
	sbcDaily: number;
	sbcPeriod: number;
	isrBase: number;
	daysInPeriod: number;
	umaDaily: number;
	minimumWageDaily: number;
}

export interface PayrollImssEmployeeBreakdown {
	emExcess: number;
	pd: number;
	gmp: number;
	iv: number;
	cv: number;
	total: number;
}

export interface PayrollImssEmployerBreakdown {
	emFixed: number;
	emExcess: number;
	pd: number;
	gmp: number;
	iv: number;
	cv: number;
	guarderias: number;
	total: number;
}

export interface PayrollEmployeeWithholdings {
	imssEmployee: PayrollImssEmployeeBreakdown;
	isrWithheld: number;
	infonavitCredit: number;
	total: number;
}

export interface PayrollEmployerCosts {
	imssEmployer: PayrollImssEmployerBreakdown;
	sarRetiro: number;
	infonavit: number;
	isn: number;
	riskWork: number;
	absorbedImssEmployeeShare: number;
	absorbedIsr: number;
	total: number;
}

export interface PayrollInformationalLines {
	isrBeforeSubsidy: number;
	subsidyApplied: number;
}

export interface PayrollTaxSummary {
	grossTotal: number;
	employeeWithholdingsTotal: number;
	employerCostsTotal: number;
	netPayTotal: number;
	companyCostTotal: number;
}

export interface PayrollCalculationEmployee {
	employeeId: string;
	name: string;
	shiftType: 'DIURNA' | 'NOCTURNA' | 'MIXTA';
	dailyPay: number;
	hourlyPay: number;
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	seventhDayPay: number;
	hoursWorked: number;
	expectedHours: number;
	normalHours: number;
	overtimeDoubleHours: number;
	overtimeTripleHours: number;
	sundayHoursWorked: number;
	mandatoryRestDaysWorkedCount: number;
	normalPay: number;
	overtimeDoublePay: number;
	overtimeTriplePay: number;
	sundayPremiumAmount: number;
	mandatoryRestDayPremiumAmount: number;
	vacationDaysPaid: number;
	vacationPayAmount: number;
	vacationPremiumAmount: number;
	totalPay: number;
	grossPay: number;
	bases: PayrollTaxBases;
	employeeWithholdings: PayrollEmployeeWithholdings;
	employerCosts: PayrollEmployerCosts;
	informationalLines: PayrollInformationalLines;
	netPay: number;
	companyCost: number;
	warnings: PayrollWarning[];
}

export interface PayrollCalculationResult {
	employees: PayrollCalculationEmployee[];
	totalAmount: number;
	taxSummary: PayrollTaxSummary;
	periodStartDateKey: string;
	periodEndDateKey: string;
	timeZone?: string;
	overtimeEnforcement?: 'WARN' | 'BLOCK';
}

export interface PayrollRun {
	id: string;
	organizationId: string;
	periodStart: Date;
	periodEnd: Date;
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	status: 'DRAFT' | 'PROCESSED';
	totalAmount: number;
	employeeCount: number;
	processedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface PayrollRunEmployee {
	id: string;
	payrollRunId: string;
	employeeId: string;
	hoursWorked: number;
	hourlyPay: number;
	totalPay: number;
	normalHours: number;
	normalPay: number;
	overtimeDoubleHours: number;
	overtimeDoublePay: number;
	overtimeTripleHours: number;
	overtimeTriplePay: number;
	sundayPremiumAmount: number;
	mandatoryRestDayPremiumAmount: number;
	vacationDaysPaid: number;
	vacationPayAmount: number;
	vacationPremiumAmount: number;
	taxBreakdown?: {
		grossPay: number;
		seventhDayPay: number;
		bases: PayrollTaxBases;
		employeeWithholdings: PayrollEmployeeWithholdings;
		employerCosts: PayrollEmployerCosts;
		informationalLines: PayrollInformationalLines;
		netPay: number;
		companyCost: number;
	};
	periodStart: Date;
	periodEnd: Date;
	createdAt: Date;
	updatedAt: Date;
}

type PayrollSettingsPayload = Omit<
	PayrollSettings,
	| 'riskWorkRate'
	| 'statePayrollTaxRate'
	| 'aguinaldoDays'
	| 'vacationPremiumRate'
	| 'absorbImssEmployeeShare'
	| 'absorbIsr'
	| 'enableSeventhDayPay'
> & {
	riskWorkRate?: number | string | null;
	statePayrollTaxRate?: number | string | null;
	aguinaldoDays?: number | string | null;
	vacationPremiumRate?: number | string | null;
	absorbImssEmployeeShare?: boolean | null;
	absorbIsr?: boolean | null;
	enableSeventhDayPay?: boolean | null;
};

/**
 * Normalizes numeric values that may arrive as strings.
 *
 * @param value - Incoming value from the API
 * @param fallback - Fallback value when missing or invalid
 * @returns Normalized numeric value
 */
function normalizeNumber(value: number | string | null | undefined, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return fallback;
}

/**
 * Normalizes payroll settings payload to ensure numeric values are numbers.
 *
 * @param payload - Raw payroll settings payload
 * @returns Normalized payroll settings or null when missing
 */
function normalizePayrollSettings(payload?: PayrollSettingsPayload | null): PayrollSettings | null {
	if (!payload) {
		return null;
	}
	return {
		...payload,
		riskWorkRate: normalizeNumber(payload.riskWorkRate, 0),
		statePayrollTaxRate: normalizeNumber(payload.statePayrollTaxRate, 0),
		aguinaldoDays: normalizeNumber(payload.aguinaldoDays, 15),
		vacationPremiumRate: normalizeNumber(payload.vacationPremiumRate, 0.25),
		absorbImssEmployeeShare: Boolean(payload.absorbImssEmployeeShare ?? false),
		absorbIsr: Boolean(payload.absorbIsr ?? false),
		enableSeventhDayPay: Boolean(payload.enableSeventhDayPay ?? false),
	};
}

export async function fetchPayrollSettings(
	organizationId?: string,
): Promise<PayrollSettings | null> {
	const response = await api['payroll-settings'].get({
		$query: organizationId ? { organizationId } : undefined,
	});

	if (response.error) {
		console.error(
			'Failed to fetch payroll settings:',
			response.error,
			'Status:',
			response.status,
		);
		return null;
	}

	return normalizePayrollSettings(response.data?.data as PayrollSettingsPayload | undefined);
}

export async function calculatePayroll(params: {
	periodStartDateKey: string;
	periodEndDateKey: string;
	paymentFrequency?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	organizationId?: string;
}): Promise<PayrollCalculationResult> {
	const response = await api.payroll.calculate.post({
		periodStartDateKey: params.periodStartDateKey,
		periodEndDateKey: params.periodEndDateKey,
		paymentFrequency: params.paymentFrequency,
		organizationId: params.organizationId,
	});

	if (response.error) {
		console.error('Failed to calculate payroll:', response.error, 'Status:', response.status);
		throw new Error('Failed to calculate payroll');
	}

	return response.data?.data as PayrollCalculationResult;
}

export async function processPayroll(params: {
	periodStartDateKey: string;
	periodEndDateKey: string;
	paymentFrequency?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	organizationId?: string;
}): Promise<{ run: PayrollRun; calculation: PayrollCalculationResult }> {
	const response = await api.payroll.process.post({
		periodStartDateKey: params.periodStartDateKey,
		periodEndDateKey: params.periodEndDateKey,
		paymentFrequency: params.paymentFrequency,
		organizationId: params.organizationId,
	});

	if (response.error) {
		console.error('Failed to process payroll:', response.error, 'Status:', response.status);
		throw new Error('Failed to process payroll');
	}

	const payload = response.data?.data as unknown as
		| { run: PayrollRun; calculation: PayrollCalculationResult }
		| undefined;
	if (!payload) {
		throw new Error('Failed to process payroll: empty response');
	}
	const runTotalAmount =
		typeof payload.run.totalAmount === 'string'
			? Number(payload.run.totalAmount)
			: payload.run.totalAmount;
	return {
		run: { ...payload.run, totalAmount: runTotalAmount ?? 0 },
		calculation: payload.calculation,
	};
}

/**
 * Retrieves payroll runs list.
 *
 * @param params - Filters for organization and pagination
 * @returns Array of payroll runs with numeric totalAmount
 */
export async function fetchPayrollRuns(params?: {
	organizationId?: string;
	limit?: number;
	offset?: number;
}): Promise<PayrollRun[]> {
	const response = await api.payroll.runs.get({
		$query: {
			limit: params?.limit ?? 100,
			offset: params?.offset ?? 0,
			organizationId: params?.organizationId,
		},
	});

	if (response.error) {
		console.error('Failed to fetch payroll runs:', response.error, 'Status:', response.status);
		throw new Error('Failed to fetch payroll runs');
	}

	const runs =
		(response.data?.data as (PayrollRun & { totalAmount?: number | string })[] | undefined) ??
		[];
	return runs.map((run) => ({
		...run,
		totalAmount: Number(run.totalAmount ?? 0),
	}));
}

/**
 * Retrieves a payroll run and its employees by ID.
 *
 * @param id - Payroll run ID
 * @returns Payroll run detail or null when missing
 */
export async function fetchPayrollRunDetail(
	id: string,
): Promise<{ run: PayrollRun; employees: PayrollRunEmployee[] } | null> {
	const response = await api.payroll.runs[id].get();

	if (response.error) {
		console.error(
			'Failed to fetch payroll run detail:',
			response.error,
			'Status:',
			response.status,
		);
		return null;
	}

	const payload = response.data?.data as unknown as
		| {
				run: PayrollRun & { totalAmount?: number | string };
				employees: (PayrollRunEmployee & {
					hoursWorked?: number | string;
					hourlyPay?: number | string;
					totalPay?: number | string;
					normalHours?: number | string;
					normalPay?: number | string;
					overtimeDoubleHours?: number | string;
					overtimeDoublePay?: number | string;
					overtimeTripleHours?: number | string;
					overtimeTriplePay?: number | string;
					sundayPremiumAmount?: number | string;
					mandatoryRestDayPremiumAmount?: number | string;
					vacationDaysPaid?: number | string;
					vacationPayAmount?: number | string;
					vacationPremiumAmount?: number | string;
					periodStart: string | Date;
					periodEnd: string | Date;
					createdAt: string | Date;
					updatedAt: string | Date;
				})[];
		  }
		| undefined;
	if (!payload) {
		return null;
	}
	const normalizedRun: PayrollRun = {
		...payload.run,
		totalAmount: Number(payload.run.totalAmount ?? 0),
		periodStart: new Date(payload.run.periodStart),
		periodEnd: new Date(payload.run.periodEnd),
		paymentFrequency: payload.run.paymentFrequency,
		status: payload.run.status,
		employeeCount: payload.run.employeeCount,
		processedAt: payload.run.processedAt ? new Date(payload.run.processedAt) : null,
		createdAt: new Date(payload.run.createdAt),
		updatedAt: new Date(payload.run.updatedAt),
	};
	const normalizedEmployees = payload.employees.map((employee) => ({
		...employee,
		hoursWorked: Number(employee.hoursWorked ?? 0),
		hourlyPay: Number(employee.hourlyPay ?? 0),
		totalPay: Number(employee.totalPay ?? 0),
		normalHours: Number(employee.normalHours ?? 0),
		normalPay: Number(employee.normalPay ?? 0),
		overtimeDoubleHours: Number(employee.overtimeDoubleHours ?? 0),
		overtimeDoublePay: Number(employee.overtimeDoublePay ?? 0),
		overtimeTripleHours: Number(employee.overtimeTripleHours ?? 0),
		overtimeTriplePay: Number(employee.overtimeTriplePay ?? 0),
		sundayPremiumAmount: Number(employee.sundayPremiumAmount ?? 0),
		mandatoryRestDayPremiumAmount: Number(employee.mandatoryRestDayPremiumAmount ?? 0),
		vacationDaysPaid: Number(employee.vacationDaysPaid ?? 0),
		vacationPayAmount: Number(employee.vacationPayAmount ?? 0),
		vacationPremiumAmount: Number(employee.vacationPremiumAmount ?? 0),
		periodStart: new Date(employee.periodStart),
		periodEnd: new Date(employee.periodEnd),
		createdAt: new Date(employee.createdAt),
		updatedAt: new Date(employee.updatedAt),
	}));
	return {
		run: normalizedRun,
		employees: normalizedEmployees,
	};
}

// ============================================================================
// Dashboard Functions
// ============================================================================

/**
 * Fetches dashboard entity counts from the API.
 *
 * This function fetches all entity counts in parallel for optimal performance.
 *
 * @returns A promise resolving to the dashboard counts object
 * @throws Error if any API request fails
 *
 * @example
 * ```ts
 * const counts = await fetchDashboardCounts();
 * console.log(`Total employees: ${counts.employees}`);
 * ```
 */
export async function fetchDashboardCounts(params?: {
	organizationId?: string | null;
}): Promise<DashboardCounts> {
	if (params?.organizationId === null) {
		return {
			employees: 0,
			devices: 0,
			locations: 0,
			organizations: 0,
			attendance: 0,
		};
	}

	const organizationId = params?.organizationId ?? undefined;

	const baseQuery = {
		limit: 1,
		offset: 0,
		...(organizationId ? { organizationId } : {}),
	};

	const [employeesRes, devicesRes, locationsRes, organizationsRes, attendanceRes] =
		await Promise.all([
			api.employees.get({ $query: baseQuery }),
			api.devices.get({ $query: baseQuery }),
			api.locations.get({ $query: baseQuery }),
			authClient.organization.list(),
			api.attendance.get({ $query: baseQuery }),
		]);

	return {
		employees: employeesRes.data?.pagination?.total ?? 0,
		devices: devicesRes.data?.pagination?.total ?? 0,
		locations: locationsRes.data?.pagination?.total ?? 0,
		organizations: organizationsRes.data?.length ?? 0,
		attendance: attendanceRes.data?.pagination?.total ?? 0,
	};
}

// ============================================================================
// API Key Functions (via better-auth)
// ============================================================================

/**
 * Fetches the list of API keys for the current user.
 *
 * @returns A promise resolving to the array of API keys
 * @throws Error if the API request fails
 *
 * @example
 * ```ts
 * const apiKeys = await fetchApiKeys();
 * ```
 */
export async function fetchApiKeys(): Promise<ApiKey[]> {
	const response = await authClient.apiKey.list();

	if (response.error) {
		throw new Error('Failed to fetch API keys');
	}

	return (response.data ?? []) as ApiKey[];
}

// ============================================================================
// Organization Functions (via better-auth)
// ============================================================================

/**
 * Fetches the list of organizations for the current user.
 *
 * @returns A promise resolving to the array of organizations
 * @throws Error if the API request fails
 *
 * @example
 * ```ts
 * const organizations = await fetchOrganizations();
 * ```
 */
export async function fetchOrganizations(): Promise<Organization[]> {
	const response = await authClient.organization.list();

	if (response.error) {
		throw new Error('Failed to fetch organizations');
	}

	return (response.data ?? []) as Organization[];
}

// ============================================================================
// Organization Member Functions (via better-auth organization plugin)
// ============================================================================

export interface OrganizationMembersResponse {
	members: OrganizationMember[];
	total: number;
}

export async function fetchOrganizationMembers(params: {
	organizationId: string | null;
	limit?: number;
	offset?: number;
}): Promise<OrganizationMembersResponse> {
	if (!params.organizationId) {
		return { members: [], total: 0 };
	}

	const response = await authClient.organization.listMembers({
		query: {
			organizationId: params.organizationId,
			limit: params.limit ?? 100,
			offset: params.offset ?? 0,
		},
	});

	if (response.error) {
		throw new Error('Failed to fetch organization members');
	}

	return {
		members: (response.data?.members ?? []) as OrganizationMember[],
		total: response.data?.total ?? 0,
	};
}

// ============================================================================
// User Functions (via better-auth admin)
// ============================================================================

/**
 * Fetches the list of users (admin only).
 *
 * @param params - Optional query parameters for pagination
 * @returns A promise resolving to the array of users
 * @throws Error if the API request fails
 *
 * @example
 * ```ts
 * const users = await fetchUsers({ limit: 100, offset: 0 });
 * ```
 */
export async function fetchUsers(params?: UsersQueryParams): Promise<User[]> {
	const response = await authClient.admin.listUsers({
		query: {
			limit: params?.limit ?? 100,
			offset: params?.offset ?? 0,
		},
	});

	if (response.error) {
		throw new Error('Failed to fetch users');
	}

	return (response.data?.users ?? []) as User[];
}

// ============================================================================
// Scheduling Functions
// ============================================================================

export type ShiftType = 'DIURNA' | 'NOCTURNA' | 'MIXTA';
export type ScheduleExceptionType = 'DAY_OFF' | 'MODIFIED' | 'EXTRA_DAY';

export interface ScheduleTemplateDay {
	id?: string;
	templateId?: string;
	dayOfWeek: number;
	startTime: string;
	endTime: string;
	isWorkingDay: boolean;
	createdAt?: Date;
	updatedAt?: Date;
}

export interface ScheduleTemplate {
	id: string;
	name: string;
	description: string | null;
	shiftType: ShiftType;
	organizationId: string;
	createdAt: Date;
	updatedAt: Date;
	days?: ScheduleTemplateDay[];
}

export interface ScheduleException {
	id: string;
	employeeId: string;
	exceptionDate: Date;
	exceptionType: ScheduleExceptionType;
	startTime: string | null;
	endTime: string | null;
	reason: string | null;
	createdAt: Date;
	updatedAt: Date;
	employeeName?: string | null;
	employeeLastName?: string | null;
}

export interface CalendarDay {
	date: string;
	isWorkingDay: boolean;
	startTime: string | null;
	endTime: string | null;
	source: 'template' | 'manual' | 'exception' | 'none';
	exceptionType?: ScheduleExceptionType;
}

export interface CalendarEmployee {
	employeeId: string;
	employeeName: string;
	locationId: string | null;
	scheduleTemplateId: string | null;
	shiftType: ShiftType;
	days: CalendarDay[];
}

/**
 * Normalizes a date-like value into a Date instance.
 *
 * @param value - A Date object or ISO date string
 * @returns Date instance or undefined when input is falsy
 */
function normalizeDate(value?: Date | string): Date | undefined {
	if (!value) {
		return undefined;
	}
	return typeof value === 'string' ? new Date(value) : value;
}

/**
 * Fetches schedule templates list.
 *
 * @param params - Query parameters including organization scope
 * @returns Paginated list of schedule templates
 */
export async function fetchScheduleTemplatesList(
	params?: ScheduleTemplateQueryParams,
): Promise<PaginatedResponse<ScheduleTemplate>> {
	if (!params?.organizationId) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit: params?.limit ?? 100,
				offset: params?.offset ?? 0,
			},
		};
	}

	const query: {
		limit: number;
		offset: number;
		organizationId: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
		organizationId: params.organizationId,
	};

	const response = await api['schedule-templates'].get({ $query: query });

	if (response.error) {
		throw new Error('Failed to fetch schedule templates');
	}

	return {
		data: (response.data?.data ?? []) as ScheduleTemplate[],
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}

/**
 * Fetches a schedule template by ID including its days.
 *
 * @param id - Template identifier
 * @returns Template with days or null when missing
 */
export async function fetchScheduleTemplateDetail(id: string): Promise<ScheduleTemplate | null> {
	const response = await api['schedule-templates'][id].get();

	if (response.error) {
		return null;
	}

	return (response.data?.data as ScheduleTemplate) ?? null;
}

/**
 * Fetches schedule exceptions with optional filters.
 *
 * @param params - Query parameters for filtering exceptions
 * @returns Paginated schedule exceptions
 */
export async function fetchScheduleExceptionsList(
	params?: ScheduleExceptionQueryParams,
): Promise<PaginatedResponse<ScheduleException>> {
	if (!params?.organizationId) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit: params?.limit ?? 100,
				offset: params?.offset ?? 0,
			},
		};
	}

	const query: {
		limit: number;
		offset: number;
		employeeId?: string;
		fromDate?: Date;
		toDate?: Date;
		organizationId: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
		organizationId: params.organizationId,
	};

	if (params.employeeId) {
		query.employeeId = params.employeeId;
	}
	if (params.fromDate) {
		query.fromDate = normalizeDate(params.fromDate);
	}
	if (params.toDate) {
		query.toDate = normalizeDate(params.toDate);
	}

	const response = await api['schedule-exceptions'].get({ $query: query });

	if (response.error) {
		throw new Error('Failed to fetch schedule exceptions');
	}

	return {
		data: (response.data?.data ?? []) as ScheduleException[],
		pagination: response.data?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}

/**
 * Fetches the scheduling calendar for the given date range and scope.
 *
 * @param params - Calendar query parameters
 * @returns Calendar entries per employee
 */
export async function fetchCalendar(params: CalendarQueryParams): Promise<CalendarEmployee[]> {
	const startDate = normalizeDate(params.startDate);
	const endDate = normalizeDate(params.endDate);

	if (!startDate || !endDate) {
		throw new Error('Start and end date are required');
	}

	const query = {
		...params,
		startDate,
		endDate,
	};

	const response = await api.scheduling.calendar.get({
		$query: query,
	});

	if (response.error) {
		throw new Error('Failed to fetch scheduling calendar');
	}

	return (response.data?.data ?? []) as CalendarEmployee[];
}
