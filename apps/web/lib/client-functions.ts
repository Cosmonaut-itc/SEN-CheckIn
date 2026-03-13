/**
 * Client-side data fetching functions for TanStack Query.
 *
 * This module centralizes all API calls used by queries and mutations,
 * providing a consistent interface for data fetching across the application.
 *
 * @module client-functions
 */

import { API_BASE_URL, api } from '@/lib/api';
import { getApiResponseData } from '@/lib/api-response';
import { authClient } from '@/lib/auth-client';
import { normalizeUserCode } from '@/lib/device-code-utils';
import { clampPaginationLimit, clampPaginationOffset } from '@/lib/pagination';
import type {
	DisciplinaryKpis as DisciplinaryKpisContract,
	DisciplinaryMeasure as DisciplinaryMeasureContract,
	DisciplinaryMeasureAttachment as DisciplinaryMeasureAttachmentContract,
	DisciplinaryMeasureDocument as DisciplinaryMeasureDocumentContract,
	DisciplinaryMeasureStatus,
	DisciplinaryOutcome,
	EmployeeDocumentRequirementKey,
	EmployeeDocumentReviewStatus,
	EmployeeDocumentSource,
	EmployeeDocumentActivationStage,
	EmploymentProfileSubtype,
	EmployeeAuditEvent,
	EmployeeIncapacity,
	EmployeeIncapacityDocument,
	EmployeeInsights,
	EmployeeTerminationSettlement,
	IdentificationSubtype,
	LegalDocumentKind,
	LegalTemplateStatus,
	HolidayCalendarEntry,
	HolidayKind,
	HolidaySource,
	HolidayStatus,
	IncapacityIssuedBy,
	IncapacitySequence,
	IncapacityStatus,
	IncapacityType,
	PayrollEmployeeHolidayImpact as PayrollEmployeeHolidayImpactContract,
	PayrollHolidayNotice as PayrollHolidayNoticeContract,
	SatTipoIncapacidad,
	TerminationDraft as TerminationDraftContract,
} from '@sen-checkin/types';
import type {
	AttendancePresentQueryParams,
	AttendanceQueryParams,
	CalendarQueryParams,
	DisciplinaryKpisQueryParams,
	EmployeeDeductionListQueryParams,
	EmployeeDeductionStatus,
	EmployeeDeductionType,
	DisciplinaryMeasuresQueryParams,
	IncapacityQueryParams,
	ListQueryParams,
	OrganizationDeductionListQueryParams,
	OvertimeAuthorizationQueryParams,
	OrganizationAllQueryParams,
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
export type AttendanceType = 'CHECK_IN' | 'CHECK_OUT' | 'CHECK_OUT_AUTHORIZED' | 'WORK_OFFSITE';

/**
 * RH day classification for offsite records.
 */
export type OffsiteDayKind = 'LABORABLE' | 'NO_LABORABLE';

/**
 * Employee record interface.
 */
export interface Employee {
	id: string;
	code: string;
	firstName: string;
	lastName: string;
	nss: string | null;
	rfc: string | null;
	email: string | null;
	phone: string | null;
	jobPositionId: string | null;
	/** Job position name (from joined job_position table) */
	jobPositionName: string | null;
	department: string | null;
	status: EmployeeStatus;
	hireDate: Date | null;
	dailyPay: number;
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	employmentType: 'PERMANENT' | 'EVENTUAL';
	isTrustEmployee: boolean;
	isDirectorAdminGeneralManager: boolean;
	isDomesticWorker: boolean;
	isPlatformWorker: boolean;
	platformHoursYear: number;
	ptuEligibilityOverride: 'DEFAULT' | 'INCLUDE' | 'EXCLUDE';
	aguinaldoDaysOverride: number | null;
	sbcDailyOverride: number | null;
	locationId: string | null;
	organizationId: string | null;
	userId: string | null;
	rekognitionUserId: string | null;
	documentProgressPercent?: number;
	documentMissingCount?: number;
	documentWorkflowStatus?: 'INCOMPLETE' | 'IN_REVIEW' | 'COMPLETE';
	disciplinaryMeasuresCount?: number;
	disciplinaryOpenMeasuresCount?: number;
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
	latitude: number | null;
	longitude: number | null;
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
	deviceLocationId?: string | null;
	deviceLocationName?: string | null;
	timestamp: Date;
	type: AttendanceType;
	offsiteDateKey?: string | null;
	offsiteDayKind?: OffsiteDayKind | null;
	offsiteReason?: string | null;
	offsiteCreatedByUserId?: string | null;
	offsiteUpdatedByUserId?: string | null;
	offsiteUpdatedAt?: Date | null;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Today offsite attendance list payload.
 */
export interface AttendanceOffsiteTodayResponse {
	dateKey: string;
	count: number;
	data: AttendanceRecord[];
}

/**
 * Attendance record representing current on-site employees.
 */
export interface AttendancePresentRecord {
	employeeId: string;
	employeeName: string;
	employeeCode: string;
	deviceId: string;
	locationId: string | null;
	locationName: string | null;
	checkedInAt: Date;
}

/**
 * Vacation request status values.
 */
export type VacationRequestStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/**
 * Vacation day classification values.
 */
export type VacationDayType =
	| 'SCHEDULED_WORKDAY'
	| 'SCHEDULED_REST_DAY'
	| 'EXCEPTION_WORKDAY'
	| 'EXCEPTION_DAY_OFF'
	| 'MANDATORY_REST_DAY'
	| 'INCAPACITY';

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
	accruedDays: number;
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
 * Response payload for superuser organization listings.
 */
export interface OrganizationsAllResponse {
	organizations: Organization[];
	total: number;
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

type EmployeePayload = Omit<
	Employee,
	'dailyPay' | 'sbcDailyOverride' | 'platformHoursYear' | 'aguinaldoDaysOverride'
> & {
	dailyPay?: number | string;
	sbcDailyOverride?: number | string | null;
	platformHoursYear?: number | string | null;
	aguinaldoDaysOverride?: number | string | null;
};

/**
 * Normalizes employee payloads with numeric strings into typed values.
 *
 * @param record - Raw employee payload from the API
 * @returns Normalized employee record
 */
function normalizeEmployeeRecord(record: EmployeePayload): Employee {
	return {
		...record,
		dailyPay: Number(record.dailyPay ?? 0),
		employmentType: record.employmentType ?? 'PERMANENT',
		isTrustEmployee: Boolean(record.isTrustEmployee ?? false),
		isDirectorAdminGeneralManager: Boolean(record.isDirectorAdminGeneralManager ?? false),
		isDomesticWorker: Boolean(record.isDomesticWorker ?? false),
		isPlatformWorker: Boolean(record.isPlatformWorker ?? false),
		platformHoursYear: Number(record.platformHoursYear ?? 0),
		ptuEligibilityOverride: record.ptuEligibilityOverride ?? 'DEFAULT',
		aguinaldoDaysOverride:
			record.aguinaldoDaysOverride === null || record.aguinaldoDaysOverride === undefined
				? null
				: Number(record.aguinaldoDaysOverride),
		sbcDailyOverride:
			record.sbcDailyOverride === null || record.sbcDailyOverride === undefined
				? null
				: Number(record.sbcDailyOverride),
		documentProgressPercent:
			record.documentProgressPercent === undefined
				? undefined
				: Number(record.documentProgressPercent),
		documentMissingCount:
			record.documentMissingCount === undefined
				? undefined
				: Number(record.documentMissingCount),
		documentWorkflowStatus: record.documentWorkflowStatus,
		disciplinaryMeasuresCount:
			record.disciplinaryMeasuresCount === undefined
				? undefined
				: Number(record.disciplinaryMeasuresCount),
		disciplinaryOpenMeasuresCount:
			record.disciplinaryOpenMeasuresCount === undefined
				? undefined
				: Number(record.disciplinaryOpenMeasuresCount),
	};
}

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
	params?: ListQueryParams & {
		organizationId?: string | null;
		locationId?: string;
		jobPositionId?: string;
		status?: EmployeeStatus;
	},
): Promise<PaginatedResponse<Employee>> {
	const limit = clampPaginationLimit(params?.limit);
	const offset = clampPaginationOffset(params?.offset);

	if (params?.organizationId === null) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit,
				offset,
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
		locationId?: string;
		jobPositionId?: string;
		status?: EmployeeStatus;
	} = {
		limit,
		offset,
	};

	// Only add search if it has a non-empty value
	if (params?.search) {
		query.search = params.search;
	}

	if (params?.locationId) {
		query.locationId = params.locationId;
	}

	if (params?.jobPositionId) {
		query.jobPositionId = params.jobPositionId;
	}

	if (params?.status) {
		query.status = params.status;
	}

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}

	const response = await api.employees.get({ $query: query });

	if (response.error) {
		console.error('Failed to fetch employees:', response.error, 'Status:', response.status);
		throw new Error('Failed to fetch employees');
	}

	const payload = getApiResponseData(response);
	const employees = (payload?.data as EmployeePayload[] | undefined) ?? [];
	return {
		data: employees.map(normalizeEmployeeRecord),
		pagination: payload?.pagination ?? { total: 0, limit, offset },
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

	const payload = getApiResponseData(response);
	const record = payload?.data as EmployeePayload | undefined;
	return record ? normalizeEmployeeRecord(record) : null;
}

/**
 * Fetches employee insights for the detail dialog.
 *
 * @param id - Employee ID
 * @returns Employee insights payload or null when not found
 */
export async function fetchEmployeeInsights(id: string): Promise<EmployeeInsights | null> {
	const response = await api.employees[id].insights.get();

	if (response.error) {
		console.error(
			'Failed to fetch employee insights:',
			response.error,
			'Status:',
			response.status,
		);
		return null;
	}

	const payload = getApiResponseData(response);
	return (payload?.data as EmployeeInsights) ?? null;
}

/**
 * Fetches employee audit events.
 *
 * @param params - Audit query parameters
 * @param params.employeeId - Employee identifier
 * @param params.limit - Max number of events to return
 * @param params.offset - Offset for pagination
 * @returns Paginated audit events response
 */
export async function fetchEmployeeAudit(params: {
	employeeId: string;
	limit?: number;
	offset?: number;
}): Promise<PaginatedResponse<EmployeeAuditEvent>> {
	const response = await api.employees[params.employeeId].audit.get({
		$query: {
			limit: params.limit ?? 20,
			offset: params.offset ?? 0,
		},
	});

	if (response.error) {
		console.error(
			'Failed to fetch employee audit:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch employee audit');
	}

	const payload = getApiResponseData(response);
	return {
		data: (payload?.data ?? []) as EmployeeAuditEvent[],
		pagination: payload?.pagination ?? {
			total: 0,
			limit: params.limit ?? 20,
			offset: params.offset ?? 0,
		},
	};
}

export interface EmployeeTerminationSettlementRecord {
	id: string;
	employeeId: string;
	organizationId: string | null;
	calculation: EmployeeTerminationSettlement;
	totalsGross: number;
	finiquitoTotalGross: number;
	liquidacionTotalGross: number;
	createdAt: Date;
}

type EmployeeTerminationSettlementPayload = Omit<
	EmployeeTerminationSettlementRecord,
	'totalsGross' | 'finiquitoTotalGross' | 'liquidacionTotalGross' | 'createdAt'
> & {
	totalsGross: number | string;
	finiquitoTotalGross: number | string;
	liquidacionTotalGross: number | string;
	createdAt: string | Date;
};

/**
 * Normalizes termination settlement payload values.
 *
 * @param record - Raw settlement payload from the API
 * @returns Normalized settlement record
 */
function normalizeTerminationSettlement(
	record: EmployeeTerminationSettlementPayload,
): EmployeeTerminationSettlementRecord {
	return {
		...record,
		totalsGross: Number(record.totalsGross ?? 0),
		finiquitoTotalGross: Number(record.finiquitoTotalGross ?? 0),
		liquidacionTotalGross: Number(record.liquidacionTotalGross ?? 0),
		createdAt: new Date(record.createdAt),
	};
}

export interface EmployeeLatestPayroll {
	payrollRunId: string;
	periodStart: Date;
	periodEnd: Date;
	paymentFrequency: PayrollRun['paymentFrequency'];
	processedAt: Date | null;
	taxBreakdown: PayrollRunEmployee['taxBreakdown'];
	totalPay: number;
}

export interface EmployeeTerminationDraftRecord extends TerminationDraftContract {
	createdAt: Date;
	updatedAt: Date;
	consumedAt: Date | null;
	cancelledAt: Date | null;
}

type EmployeeLatestPayrollPayload = Omit<
	EmployeeLatestPayroll,
	'periodStart' | 'periodEnd' | 'processedAt' | 'totalPay'
> & {
	periodStart: string | Date;
	periodEnd: string | Date;
	processedAt?: string | Date | null;
	totalPay?: number | string | null;
	taxBreakdown?: PayrollRunEmployee['taxBreakdown'];
};

/**
 * Normalizes latest payroll payload values.
 *
 * @param record - Raw payroll payload from the API
 * @returns Normalized payroll record
 */
function normalizeEmployeeLatestPayroll(
	record: EmployeeLatestPayrollPayload,
): EmployeeLatestPayroll {
	return {
		payrollRunId: record.payrollRunId,
		periodStart: new Date(record.periodStart),
		periodEnd: new Date(record.periodEnd),
		paymentFrequency: record.paymentFrequency,
		processedAt: record.processedAt ? new Date(record.processedAt) : null,
		taxBreakdown: record.taxBreakdown,
		totalPay: Number(record.totalPay ?? 0),
	};
}

/**
 * Fetches the active termination draft for an employee.
 *
 * @param id - Employee identifier
 * @returns Active draft or null when not found
 */
export async function fetchEmployeeTerminationDraft(
	id: string,
): Promise<EmployeeTerminationDraftRecord | null> {
	const payload = (await fetchDashboardApiJson(`/employees/${id}/termination/draft`)) as {
		data?:
			| (TerminationDraftContract & {
					createdAt: string | Date;
					updatedAt: string | Date;
					consumedAt?: string | Date | null;
					cancelledAt?: string | Date | null;
			  })
			| null;
	};

	const record = payload?.data;
	if (!record) {
		return null;
	}

	return {
		...record,
		createdAt: new Date(record.createdAt),
		updatedAt: new Date(record.updatedAt),
		consumedAt: record.consumedAt ? new Date(record.consumedAt) : null,
		cancelledAt: record.cancelledAt ? new Date(record.cancelledAt) : null,
	};
}

/**
 * Fetches the latest termination settlement for an employee.
 *
 * @param id - Employee ID
 * @returns Termination settlement record or null when missing
 */
export async function fetchEmployeeTerminationSettlement(
	id: string,
): Promise<EmployeeTerminationSettlementRecord | null> {
	try {
		const response = await api.employees[id].termination.settlement.get();

		if (response.error) {
			if (response.status === 404) {
				return null;
			}
			console.error(
				'Failed to fetch termination settlement:',
				response.error,
				'Status:',
				response.status,
			);
			return null;
		}

		const payload = getApiResponseData(response);
		const record = payload?.data as EmployeeTerminationSettlementPayload | undefined;
		return record ? normalizeTerminationSettlement(record) : null;
	} catch (error) {
		console.error('Failed to fetch termination settlement:', error);
		return null;
	}
}

/**
 * Fetches the latest processed payroll run for an employee.
 *
 * @param id - Employee ID
 * @returns Latest payroll run payload or null when missing
 */
export async function fetchEmployeeLatestPayroll(
	id: string,
): Promise<EmployeeLatestPayroll | null> {
	const response = await api.employees[id].payroll.latest.get();

	if (response.error) {
		console.error(
			'Failed to fetch latest payroll run:',
			response.error,
			'Status:',
			response.status,
		);
		return null;
	}

	const payload = getApiResponseData(response);
	const record = payload?.data as EmployeeLatestPayrollPayload | undefined;
	return record ? normalizeEmployeeLatestPayroll(record) : null;
}

// ============================================================================
// Employee Document Workflow Functions
// ============================================================================

export type EmployeeDocumentWorkflowStatus = 'INCOMPLETE' | 'IN_REVIEW' | 'COMPLETE';

export interface EmployeeLegalGenerationRecord {
	id: string;
	organizationId: string;
	employeeId: string;
	kind: LegalDocumentKind;
	templateId: string;
	templateVersionNumber: number;
	generatedHtmlHash: string;
	generatedPdfHash: string | null;
	variablesSnapshot: Record<string, unknown>;
	generatedByUserId: string | null;
	generatedAt: Date;
	createdAt: Date;
	updatedAt: Date;
}

export interface EmployeeDocumentVersionRecord {
	id: string;
	organizationId: string;
	employeeId: string;
	requirementKey: EmployeeDocumentRequirementKey;
	versionNumber: number;
	isCurrent: boolean;
	reviewStatus: EmployeeDocumentReviewStatus;
	reviewComment: string | null;
	reviewedByUserId: string | null;
	reviewedAt: Date | null;
	source: EmployeeDocumentSource;
	generationId: string | null;
	identificationSubtype: IdentificationSubtype | null;
	employmentProfileSubtype: EmploymentProfileSubtype | null;
	signedAtDateKey: string | null;
	verifiedByUserId: string | null;
	bucket: string;
	objectKey: string;
	fileName: string;
	contentType: string;
	sizeBytes: number;
	sha256: string;
	uploadedByUserId: string | null;
	uploadedAt: Date;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface EmployeeDocumentRequirementState {
	requirementKey: EmployeeDocumentRequirementKey;
	isRequired: boolean;
	displayOrder: number;
	activationStage: EmployeeDocumentActivationStage;
	isActive: boolean;
	currentVersion: EmployeeDocumentVersionRecord | null;
}

export interface EmployeeDocumentsSummary {
	employeeId: string;
	employeeName: string;
	baseApprovedThresholdForLegal: number;
	gateUnlocked: boolean;
	baseApprovedCount: number;
	documentProgressPercent: number;
	documentMissingCount: number;
	documentWorkflowStatus: EmployeeDocumentWorkflowStatus;
	approvedRequiredActive: number;
	totalRequiredActive: number;
	requirements: EmployeeDocumentRequirementState[];
	latestGenerations: Partial<Record<LegalDocumentKind, EmployeeLegalGenerationRecord>>;
}

export interface EmployeeDocumentsHistoryResponse {
	current: EmployeeDocumentVersionRecord[];
	history: EmployeeDocumentVersionRecord[];
}

/**
 * Response payload for employee document history queries.
 */
export interface EmployeeDocumentsHistoryQueryResult extends EmployeeDocumentsHistoryResponse {
	pagination: PaginationMeta;
}

export interface OrganizationDocumentRequirementConfig {
	id: string;
	organizationId: string;
	requirementKey: EmployeeDocumentRequirementKey;
	isRequired: boolean;
	displayOrder: number;
	activationStage: EmployeeDocumentActivationStage;
	createdAt: Date;
	updatedAt: Date;
}

export interface DocumentWorkflowConfigRecord {
	id: string;
	organizationId: string;
	baseApprovedThresholdForLegal: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface DocumentWorkflowConfigResponse {
	config: DocumentWorkflowConfigRecord;
	requirements: OrganizationDocumentRequirementConfig[];
}

export interface LegalTemplateRecord {
	id: string;
	organizationId: string;
	kind: LegalDocumentKind;
	versionNumber: number;
	status: LegalTemplateStatus;
	htmlContent: string;
	variablesSchemaSnapshot: Record<string, unknown>;
	brandingSnapshot: Record<string, unknown> | null;
	createdByUserId: string | null;
	publishedByUserId: string | null;
	publishedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface LegalBrandingRecord {
	id: string;
	organizationId: string;
	displayName: string | null;
	headerText: string | null;
	actaState: string | null;
	actaEmployerTreatment: string | null;
	actaEmployerName: string | null;
	actaEmployerPosition: string | null;
	actaEmployeeTreatment: string | null;
	logoBucket: string | null;
	logoObjectKey: string | null;
	logoFileName: string | null;
	logoContentType: string | null;
	logoSizeBytes: number | null;
	logoSha256: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Normalizes employee document version timestamps.
 *
 * @param payload - Raw version payload
 * @returns Normalized document version
 */
function normalizeEmployeeDocumentVersion(
	payload: EmployeeDocumentVersionRecord,
): EmployeeDocumentVersionRecord {
	return {
		...payload,
		reviewedAt: payload.reviewedAt ? new Date(payload.reviewedAt) : null,
		uploadedAt: new Date(payload.uploadedAt),
		createdAt: new Date(payload.createdAt),
		updatedAt: new Date(payload.updatedAt),
	};
}

/**
 * Fetches JSON from the web API proxy using cookie credentials.
 *
 * @param path - API path beginning with "/"
 * @returns Parsed JSON payload
 * @throws Error when the request fails
 */
async function fetchDashboardApiJson(path: string): Promise<unknown> {
	const response = await fetch(`${API_BASE_URL}${path}`, {
		method: 'GET',
		credentials: 'include',
	});

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}

	return (await response.json()) as unknown;
}

/**
 * Fetches employee document workflow summary.
 *
 * @param employeeId - Employee identifier
 * @returns Workflow summary or null when not found
 */
export async function fetchEmployeeDocumentsSummary(
	employeeId: string,
): Promise<EmployeeDocumentsSummary | null> {
	const response = await api.employees[employeeId].documents.summary.get();
	if (response.error) {
		if (response.status === 404) {
			return null;
		}
		console.error(
			'Failed to fetch employee document summary:',
			response.error,
			'Status:',
			response.status,
		);
		return null;
	}

	const payload = getApiResponseData(response);
	const data = payload?.data as EmployeeDocumentsSummary | undefined;
	if (!data) {
		return null;
	}

	return {
		...data,
		requirements: data.requirements.map((requirement) => ({
			...requirement,
			currentVersion: requirement.currentVersion
				? normalizeEmployeeDocumentVersion(requirement.currentVersion)
				: null,
		})),
		latestGenerations: Object.fromEntries(
			Object.entries(data.latestGenerations ?? {}).map(([kind, generation]) => [
				kind,
				generation
					? {
							...generation,
							generatedAt: new Date(generation.generatedAt),
							createdAt: new Date(generation.createdAt),
							updatedAt: new Date(generation.updatedAt),
						}
					: generation,
			]),
		) as Partial<Record<LegalDocumentKind, EmployeeLegalGenerationRecord>>,
	};
}

/**
 * Fetches current and historical employee document versions.
 *
 * @param args - Query arguments
 * @returns Paginated history response
 * @throws Error when the request fails
 */
export async function fetchEmployeeDocumentsHistory(args: {
	employeeId: string;
	limit?: number;
	offset?: number;
	requirementKey?: EmployeeDocumentRequirementKey;
}): Promise<EmployeeDocumentsHistoryQueryResult> {
	const query: {
		limit: number;
		offset: number;
		requirementKey?: EmployeeDocumentRequirementKey;
	} = {
		limit: args.limit ?? 20,
		offset: args.offset ?? 0,
	};

	if (args.requirementKey) {
		query.requirementKey = args.requirementKey;
	}

	const response = await api.employees[args.employeeId].documents.get({
		$query: query,
	});

	if (response.error) {
		console.error(
			'Failed to fetch employee document history:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch employee documents');
	}

	const payload = getApiResponseData(response);
	const data = (payload?.data ?? {
		current: [],
		history: [],
	}) as EmployeeDocumentsHistoryResponse;

	return {
		current: data.current.map((row) => normalizeEmployeeDocumentVersion(row)),
		history: data.history.map((row) => normalizeEmployeeDocumentVersion(row)),
		pagination: payload?.pagination ?? {
			total: 0,
			limit: args.limit ?? 20,
			offset: args.offset ?? 0,
		},
	};
}

/**
 * Fetches a presigned URL to view an employee document version.
 *
 * @param args - Employee/document identifiers
 * @returns Presigned URL or null
 */
export async function fetchEmployeeDocumentUrl(args: {
	employeeId: string;
	docVersionId: string;
}): Promise<string | null> {
	const payload = (await fetchDashboardApiJson(
		`/employees/${args.employeeId}/documents/${args.docVersionId}/url`,
	)) as { data?: { url?: string } };
	return payload?.data?.url ?? null;
}

/**
 * Fetches organization document workflow configuration.
 *
 * @returns Workflow config and requirement ordering
 */
export async function fetchDocumentWorkflowConfig(): Promise<DocumentWorkflowConfigResponse | null> {
	const response = await api['document-workflow'].config.get();
	if (response.error) {
		console.error(
			'Failed to fetch document workflow config:',
			response.error,
			'Status:',
			response.status,
		);
		return null;
	}

	const payload = getApiResponseData(response);
	const data = payload?.data as DocumentWorkflowConfigResponse | undefined;
	if (!data) {
		return null;
	}

	return {
		config: {
			...data.config,
			createdAt: new Date(data.config.createdAt),
			updatedAt: new Date(data.config.updatedAt),
		},
		requirements: data.requirements.map((requirement) => ({
			...requirement,
			createdAt: new Date(requirement.createdAt),
			updatedAt: new Date(requirement.updatedAt),
		})),
	};
}

/**
 * Fetches legal templates for a specific kind.
 *
 * @param kind - Legal template kind
 * @returns List of templates
 * @throws Error when the request fails
 */
export async function fetchLegalTemplates(kind: LegalDocumentKind): Promise<LegalTemplateRecord[]> {
	const payload = (await fetchDashboardApiJson(`/document-workflow/templates/${kind}`)) as {
		data?: LegalTemplateRecord[];
	};
	return (payload?.data ?? []).map((template) => ({
		...template,
		publishedAt: template.publishedAt ? new Date(template.publishedAt) : null,
		createdAt: new Date(template.createdAt),
		updatedAt: new Date(template.updatedAt),
	}));
}

/**
 * Fetches legal branding metadata and optional logo URL.
 *
 * @returns Branding payload and logo URL
 * @throws Error when the request fails
 */
export async function fetchLegalBranding(): Promise<{
	branding: LegalBrandingRecord | null;
	url: string | null;
}> {
	const payload = (await fetchDashboardApiJson('/document-workflow/branding/url')) as {
		data?: { branding?: LegalBrandingRecord | null; url?: string | null };
	};

	const branding = payload?.data?.branding
		? {
				...payload.data.branding,
				createdAt: new Date(payload.data.branding.createdAt),
				updatedAt: new Date(payload.data.branding.updatedAt),
			}
		: null;

	return {
		branding,
		url: payload?.data?.url ?? null,
	};
}

// ============================================================================
// Disciplinary Measures Functions
// ============================================================================

type DisciplinaryMeasureBase = Omit<
	DisciplinaryMeasureContract,
	| 'employeeCode'
	| 'employeeName'
	| 'documents'
	| 'attachments'
	| 'terminationDraft'
	| 'createdAt'
	| 'updatedAt'
	| 'closedAt'
>;

export interface DisciplinaryMeasureRecord extends DisciplinaryMeasureBase {
	employeeCode: string | null;
	employeeFirstName: string | null;
	employeeLastName: string | null;
	createdAt: Date;
	updatedAt: Date;
	closedAt: Date | null;
}

export interface DisciplinaryMeasureDocumentRecord extends DisciplinaryMeasureDocumentContract {
	createdAt: Date;
	updatedAt: Date;
	uploadedAt: Date;
}

export interface DisciplinaryMeasureAttachmentRecord extends DisciplinaryMeasureAttachmentContract {
	createdAt: Date;
	updatedAt: Date;
	uploadedAt: Date;
}

export interface DisciplinaryMeasureDetailRecord extends DisciplinaryMeasureRecord {
	generatedActaGenerationId: string | null;
	generatedRefusalGenerationId: string | null;
	documents: DisciplinaryMeasureDocumentRecord[];
	attachments: DisciplinaryMeasureAttachmentRecord[];
	terminationDraft: EmployeeTerminationDraftRecord | null;
}

type DisciplinaryMeasurePayload = DisciplinaryMeasureBase & {
	employeeCode?: string | null;
	employeeFirstName?: string | null;
	employeeLastName?: string | null;
	createdAt: string | Date;
	updatedAt: string | Date;
	closedAt?: string | Date | null;
};

type DisciplinaryMeasureDocumentPayload = Omit<
	DisciplinaryMeasureDocumentRecord,
	'createdAt' | 'updatedAt' | 'uploadedAt'
> & {
	createdAt: string | Date;
	updatedAt: string | Date;
	uploadedAt: string | Date;
};

type DisciplinaryMeasureAttachmentPayload = Omit<
	DisciplinaryMeasureAttachmentRecord,
	'createdAt' | 'updatedAt' | 'uploadedAt'
> & {
	createdAt: string | Date;
	updatedAt: string | Date;
	uploadedAt: string | Date;
};

type DisciplinaryMeasureDetailPayload = Omit<
	DisciplinaryMeasurePayload,
	'employeeCode' | 'employeeFirstName' | 'employeeLastName'
> & {
	employeeCode?: string | null;
	employeeFirstName?: string | null;
	employeeLastName?: string | null;
	generatedActaGenerationId?: string | null;
	generatedRefusalGenerationId?: string | null;
	createdAt: string | Date;
	updatedAt: string | Date;
	closedAt?: string | Date | null;
	documents?: DisciplinaryMeasureDocumentPayload[];
	attachments?: DisciplinaryMeasureAttachmentPayload[];
	terminationDraft?:
		| (TerminationDraftContract & {
				createdAt: string | Date;
				updatedAt: string | Date;
				consumedAt?: string | Date | null;
				cancelledAt?: string | Date | null;
		  })
		| null;
};

/**
 * Normalizes a disciplinary measure record payload.
 *
 * @param record - Raw measure payload
 * @returns Normalized measure record
 */
function normalizeDisciplinaryMeasureRecord(
	record: DisciplinaryMeasurePayload,
): DisciplinaryMeasureRecord {
	return {
		...record,
		employeeCode: record.employeeCode ?? null,
		employeeFirstName: record.employeeFirstName ?? null,
		employeeLastName: record.employeeLastName ?? null,
		createdAt: new Date(record.createdAt),
		updatedAt: new Date(record.updatedAt),
		closedAt: record.closedAt ? new Date(record.closedAt) : null,
	};
}

/**
 * Normalizes a disciplinary document version payload.
 *
 * @param record - Raw document payload
 * @returns Normalized document record
 */
function normalizeDisciplinaryDocumentRecord(
	record: DisciplinaryMeasureDocumentPayload,
): DisciplinaryMeasureDocumentRecord {
	return {
		...record,
		createdAt: new Date(record.createdAt),
		updatedAt: new Date(record.updatedAt),
		uploadedAt: new Date(record.uploadedAt),
	};
}

/**
 * Normalizes a disciplinary evidence attachment payload.
 *
 * @param record - Raw attachment payload
 * @returns Normalized attachment record
 */
function normalizeDisciplinaryAttachmentRecord(
	record: DisciplinaryMeasureAttachmentPayload,
): DisciplinaryMeasureAttachmentRecord {
	return {
		...record,
		createdAt: new Date(record.createdAt),
		updatedAt: new Date(record.updatedAt),
		uploadedAt: new Date(record.uploadedAt),
	};
}

/**
 * Fetches paginated disciplinary measures.
 *
 * @param params - Optional filters and pagination
 * @returns Paginated disciplinary measures payload
 * @throws Error when request fails
 */
export async function fetchDisciplinaryMeasures(
	params?: DisciplinaryMeasuresQueryParams,
): Promise<PaginatedResponse<DisciplinaryMeasureRecord>> {
	const query: {
		limit: number;
		offset: number;
		employeeId?: string;
		search?: string;
		fromDateKey?: string;
		toDateKey?: string;
		status?: DisciplinaryMeasureStatus;
		outcome?: DisciplinaryOutcome;
	} = {
		limit: params?.limit ?? 20,
		offset: params?.offset ?? 0,
	};

	if (params?.employeeId) {
		query.employeeId = params.employeeId;
	}
	if (params?.search) {
		query.search = params.search;
	}
	if (params?.fromDateKey) {
		query.fromDateKey = params.fromDateKey;
	}
	if (params?.toDateKey) {
		query.toDateKey = params.toDateKey;
	}
	if (params?.status) {
		query.status = params.status;
	}
	if (params?.outcome) {
		query.outcome = params.outcome;
	}

	const response = await api['disciplinary-measures'].get({
		$query: query,
	});

	if (response.error) {
		console.error(
			'Failed to fetch disciplinary measures:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch disciplinary measures');
	}

	const payload = getApiResponseData(response);
	const rows = (payload?.data as DisciplinaryMeasurePayload[] | undefined) ?? [];
	return {
		data: rows.map((row) => normalizeDisciplinaryMeasureRecord(row)),
		pagination: payload?.pagination ?? {
			total: 0,
			limit: query.limit,
			offset: query.offset,
		},
	};
}

/**
 * Fetches disciplinary KPI summary.
 *
 * @param params - Optional date range filters
 * @returns KPI summary or null when not available
 */
export async function fetchDisciplinaryKpis(
	params?: DisciplinaryKpisQueryParams,
): Promise<DisciplinaryKpisContract | null> {
	const query: {
		fromDateKey?: string;
		toDateKey?: string;
	} = {};

	if (params?.fromDateKey) {
		query.fromDateKey = params.fromDateKey;
	}
	if (params?.toDateKey) {
		query.toDateKey = params.toDateKey;
	}

	const response = await api['disciplinary-measures'].kpis.get({
		$query: query,
	});

	if (response.error) {
		console.error(
			'Failed to fetch disciplinary KPIs:',
			response.error,
			'Status:',
			response.status,
		);
		return null;
	}

	const payload = getApiResponseData(response);
	const raw = (payload?.data ?? null) as
		| (Partial<DisciplinaryKpisContract> & {
				actasInPeriod?: number;
				suspensionsActive?: number;
		  })
		| null;
	if (!raw) {
		return null;
	}

	return {
		employeesWithMeasures: Number(raw.employeesWithMeasures ?? 0),
		measuresInPeriod: Number(raw.measuresInPeriod ?? raw.actasInPeriod ?? 0),
		activeSuspensions: Number(raw.activeSuspensions ?? raw.suspensionsActive ?? 0),
		terminationEscalations: Number(raw.terminationEscalations ?? 0),
		openMeasures: Number(raw.openMeasures ?? 0),
	};
}

/**
 * Fetches disciplinary measure detail payload.
 *
 * @param id - Measure identifier
 * @returns Detailed measure payload or null when not found
 */
export async function fetchDisciplinaryMeasureById(
	id: string,
): Promise<DisciplinaryMeasureDetailRecord | null> {
	const payload = (await fetchDashboardApiJson(`/disciplinary-measures/${id}`)) as {
		data?: DisciplinaryMeasureDetailPayload;
	};

	const row = payload?.data;
	if (!row) {
		return null;
	}

	return {
		...normalizeDisciplinaryMeasureRecord(row),
		generatedActaGenerationId: row.generatedActaGenerationId ?? null,
		generatedRefusalGenerationId: row.generatedRefusalGenerationId ?? null,
		documents: (row.documents ?? []).map((document) =>
			normalizeDisciplinaryDocumentRecord(document),
		),
		attachments: (row.attachments ?? []).map((attachment) =>
			normalizeDisciplinaryAttachmentRecord(attachment),
		),
		terminationDraft: row.terminationDraft
			? {
					...row.terminationDraft,
					createdAt: new Date(row.terminationDraft.createdAt),
					updatedAt: new Date(row.terminationDraft.updatedAt),
					consumedAt: row.terminationDraft.consumedAt
						? new Date(row.terminationDraft.consumedAt)
						: null,
					cancelledAt: row.terminationDraft.cancelledAt
						? new Date(row.terminationDraft.cancelledAt)
						: null,
				}
			: null,
	};
}

/**
 * Fetches a temporary URL for a disciplinary document version.
 *
 * @param args - Measure and document identifiers
 * @returns Presigned URL or null when unavailable
 */
export async function fetchDisciplinaryDocumentUrl(args: {
	measureId: string;
	documentVersionId: string;
}): Promise<string | null> {
	const payload = (await fetchDashboardApiJson(
		`/disciplinary-measures/${args.measureId}/documents/${args.documentVersionId}/url`,
	)) as { data?: { url?: string } };

	return payload?.data?.url ?? null;
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

	const payload = getApiResponseData(response);
	return {
		data: (payload?.data ?? []) as Device[],
		pagination: payload?.pagination ?? { total: 0, limit: 100, offset: 0 },
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

	const payload = getApiResponseData(response);
	return {
		data: (payload?.data ?? []) as Location[],
		pagination: payload?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}

/**
 * Fetches a single location by ID.
 *
 * @param id - Location identifier.
 * @returns Location record or null when not found.
 */
export async function fetchLocationById(id: string): Promise<Location | null> {
	if (!id) {
		return null;
	}

	const response = await api.locations[id].get();

	if (response.error) {
		console.error(
			'Failed to fetch location detail:',
			response.error,
			'Status:',
			response.status,
		);
		return null;
	}

	const payload = getApiResponseData(response);
	return (payload?.data as Location) ?? null;
}

/**
 * Fetches all locations by paging through the API.
 *
 * @param params - Optional query parameters for filtering.
 * @returns A promise resolving to the full list of locations.
 * @throws Error if the API request fails.
 */
export async function fetchLocationsAll(params?: {
	organizationId?: string | null;
	search?: string;
}): Promise<Location[]> {
	if (params?.organizationId === null) {
		return [];
	}

	const limit = 100;
	let offset = 0;
	let total = 0;
	const results: Location[] = [];

	do {
		const query: {
			limit: number;
			offset: number;
			organizationId?: string;
			search?: string;
		} = {
			limit,
			offset,
		};

		if (params?.organizationId) {
			query.organizationId = params.organizationId;
		}

		if (params?.search) {
			query.search = params.search;
		}

		const response = await api.locations.get({ $query: query });

		if (response.error) {
			throw new Error('Failed to fetch locations');
		}

		const payload = getApiResponseData(response);
		const batch = (payload?.data ?? []) as Location[];
		const pagination = payload?.pagination ?? {
			total: 0,
			limit,
			offset,
		};

		results.push(...batch);
		total = pagination.total;
		offset += limit;

		if (batch.length === 0) {
			break;
		}
	} while (results.length < total);

	return results;
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

	const payload = getApiResponseData(response);
	const positions = (payload?.data as JobPosition[] | undefined) ?? [];

	return {
		data: positions,
		pagination: payload?.pagination ?? { total: 0, limit: 100, offset: 0 },
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
		employeeId?: string;
		fromDate?: Date;
		toDate?: Date;
		type?: AttendanceType;
		offsiteDayKind?: OffsiteDayKind;
		search?: string;
		deviceLocationId?: string;
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

	if (params?.employeeId) {
		query.employeeId = params.employeeId;
	}

	if (params?.offsiteDayKind) {
		query.offsiteDayKind = params.offsiteDayKind;
	}

	if (params?.search?.trim()) {
		query.search = params.search.trim();
	}

	if (params?.deviceLocationId) {
		query.deviceLocationId = params.deviceLocationId;
	}

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}

	const response = await api.attendance.get({ $query: query });

	if (response.error) {
		throw new Error('Failed to fetch attendance records');
	}

	const payload = getApiResponseData(response);
	return {
		data: (payload?.data ?? []) as AttendanceRecord[],
		pagination: payload?.pagination ?? { total: 0, limit: 100, offset: 0 },
	};
}

/**
 * Creates a manual WORK_OFFSITE attendance record.
 *
 * @param input - Offsite record input payload
 * @returns Created attendance record
 * @throws Error when API call fails
 */
export async function createWorkOffsiteAttendance(input: {
	employeeId: string;
	offsiteDateKey: string;
	offsiteDayKind: OffsiteDayKind;
	offsiteReason: string;
}): Promise<AttendanceRecord> {
	const response = await api.attendance.post({
		employeeId: input.employeeId,
		type: 'WORK_OFFSITE',
		offsiteDateKey: input.offsiteDateKey,
		offsiteDayKind: input.offsiteDayKind,
		offsiteReason: input.offsiteReason,
	});

	if (response.error) {
		console.error(
			'Failed to create offsite attendance record:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to create offsite attendance record');
	}

	const payload = getApiResponseData(response);
	if (!payload?.data) {
		throw new Error('Missing attendance payload');
	}
	return payload.data as AttendanceRecord;
}

/**
 * Updates a WORK_OFFSITE attendance record.
 *
 * @param input - Target record id and updated values
 * @returns Updated attendance record
 * @throws Error when API call fails
 */
export async function updateWorkOffsiteAttendance(input: {
	id: string;
	offsiteDateKey: string;
	offsiteDayKind: OffsiteDayKind;
	offsiteReason: string;
}): Promise<AttendanceRecord> {
	const response = await api.attendance[input.id].offsite.put({
		offsiteDateKey: input.offsiteDateKey,
		offsiteDayKind: input.offsiteDayKind,
		offsiteReason: input.offsiteReason,
	});

	if (response.error) {
		console.error(
			'Failed to update offsite attendance record:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to update offsite attendance record');
	}

	const payload = getApiResponseData(response);
	if (!payload?.data) {
		throw new Error('Missing attendance payload');
	}
	return payload.data as AttendanceRecord;
}

/**
 * Deletes a WORK_OFFSITE attendance record.
 *
 * @param input - Target record id and optional organization context
 * @returns True when deleted
 * @throws Error when API call fails
 */
export async function deleteWorkOffsiteAttendance(input: { id: string }): Promise<boolean> {
	const response = await api.attendance[input.id].offsite.delete();

	if (response.error) {
		console.error(
			'Failed to delete offsite attendance record:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to delete offsite attendance record');
	}

	return true;
}

/**
 * Fetches the latest attendance event per employee within a date range.
 *
 * @param params - Required date range and optional organization context
 * @returns A promise resolving to the list of present employees
 * @throws Error if the API request fails
 */
export async function fetchAttendancePresent(
	params: AttendancePresentQueryParams,
): Promise<AttendancePresentRecord[]> {
	if (params.organizationId === null) {
		return [];
	}

	const query = {
		fromDate: params.fromDate,
		toDate: params.toDate,
		organizationId: params.organizationId ?? undefined,
	};

	const response = await api.attendance.present.get({ $query: query });

	if (response.error) {
		throw new Error('Failed to fetch attendance present records');
	}

	const payload = getApiResponseData(response);
	return (payload?.data ?? []) as AttendancePresentRecord[];
}

/**
 * Fetches today's WORK_OFFSITE records for dashboard visibility.
 *
 * @param params - Optional organization context
 * @returns Offsite today list and count
 * @throws Error when API call fails
 */
export async function fetchAttendanceOffsiteToday(params?: {
	organizationId?: string | null;
}): Promise<AttendanceOffsiteTodayResponse> {
	if (params?.organizationId === null) {
		return {
			dateKey: '',
			count: 0,
			data: [],
		};
	}

	const response = await api.attendance.offsite.today.get({
		$query: {
			organizationId: params?.organizationId ?? undefined,
		},
	});

	if (response.error) {
		throw new Error('Failed to fetch offsite attendance records');
	}

	const payload = getApiResponseData(response);
	return {
		dateKey: String(payload?.dateKey ?? ''),
		count: Number(payload?.count ?? 0),
		data: (payload?.data ?? []) as AttendanceRecord[],
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
		console.error(
			'Failed to fetch vacation requests:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch vacation requests');
	}

	const responsePayload = getApiResponseData(response);
	const payload = (responsePayload?.data as VacationRequestPayload[] | undefined) ?? [];
	return {
		data: payload.map(normalizeVacationRequest),
		pagination: responsePayload?.pagination ?? {
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
		console.error(
			'Failed to fetch vacation balance:',
			response.error,
			'Status:',
			response.status,
		);
		return null;
	}

	const responsePayload = getApiResponseData(response);
	const payload = responsePayload?.data as VacationBalancePayload | undefined;
	return payload ? normalizeVacationBalance(payload) : null;
}

// ============================================================================
// Incapacity Functions
// ============================================================================

export type IncapacityDocument = EmployeeIncapacityDocument;

export interface IncapacityRecord extends EmployeeIncapacity {
	employeeName: string | null;
	employeeLastName: string | null;
	documents: IncapacityDocument[];
}

export interface IncapacityCreateInput {
	employeeId: string;
	caseId: string;
	type: IncapacityType;
	satTipoIncapacidad?: SatTipoIncapacidad;
	startDateKey: string;
	endDateKey: string;
	daysAuthorized: number;
	certificateFolio?: string;
	issuedBy?: IncapacityIssuedBy;
	sequence?: IncapacitySequence;
	percentOverride?: number | null;
}

export interface IncapacityUpdateInput extends IncapacityCreateInput {
	id: string;
	status?: IncapacityStatus;
}

type IncapacityRecordPayload = Omit<IncapacityRecord, 'createdAt' | 'updatedAt' | 'documents'> & {
	createdAt: string | Date;
	updatedAt: string | Date;
	documents?: (Omit<IncapacityDocument, 'uploadedAt' | 'createdAt'> & {
		uploadedAt: string | Date;
		createdAt: string | Date;
	})[];
};

/**
 * Normalizes incapacity record payload timestamps into Date objects.
 *
 * @param payload - Raw incapacity payload
 * @returns Normalized incapacity record
 */
function normalizeIncapacityRecord(payload: IncapacityRecordPayload): IncapacityRecord {
	return {
		...payload,
		createdAt: new Date(payload.createdAt),
		updatedAt: new Date(payload.updatedAt),
		documents: (payload.documents ?? []).map((document) => ({
			...document,
			uploadedAt: new Date(document.uploadedAt),
			createdAt: new Date(document.createdAt),
		})),
	};
}

/**
 * Fetches incapacity records list for HR/admin workflows.
 *
 * @param params - Query parameters for incapacity records
 * @returns Paginated incapacity records
 * @throws Error if the API request fails
 */
export async function fetchIncapacitiesList(
	params?: IncapacityQueryParams & { organizationId?: string | null },
): Promise<PaginatedResponse<IncapacityRecord>> {
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
		search?: string;
		employeeId?: string;
		type?: IncapacityType;
		status?: IncapacityStatus;
		from?: string;
		to?: string;
	} = {
		limit: params?.limit ?? 50,
		offset: params?.offset ?? 0,
	};

	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}
	if (params?.search) {
		query.search = params.search;
	}
	if (params?.employeeId) {
		query.employeeId = params.employeeId;
	}
	if (params?.type) {
		query.type = params.type;
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

	const response = await api.incapacities.get({ $query: query });

	if (response.error) {
		console.error(
			'Failed to fetch incapacity records:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch incapacity records');
	}

	const responsePayload = getApiResponseData(response);
	const payload = (responsePayload?.data as IncapacityRecordPayload[] | undefined) ?? [];

	return {
		data: payload.map(normalizeIncapacityRecord),
		pagination: responsePayload?.pagination ?? {
			total: 0,
			limit: query.limit,
			offset: query.offset,
		},
	};
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
	countSaturdayAsWorkedForSeventhDay: boolean;
	ptuEnabled: boolean;
	ptuMode: 'DEFAULT_RULES' | 'MANUAL';
	ptuIsExempt: boolean;
	ptuExemptReason: string | null;
	employerType: 'PERSONA_MORAL' | 'PERSONA_FISICA';
	aguinaldoEnabled: boolean;
	enableDisciplinaryMeasures: boolean;
	autoDeductLunchBreak: boolean;
	lunchBreakMinutes: number;
	lunchBreakThresholdHours: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface PayrollHolidaySyncRun {
	id: string;
	organizationId: string | null;
	provider: string;
	requestedYears: number[];
	status: 'RUNNING' | 'COMPLETED' | 'FAILED';
	startedAt: Date;
	finishedAt: Date | null;
	importedCount: number;
	pendingCount: number;
	errorCount: number;
	errorPayload: Record<string, unknown> | null;
	stale: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface PayrollHolidaySyncStatus {
	lastRun: PayrollHolidaySyncRun | null;
	pendingApprovalCount: number;
	stale: boolean;
}

export interface PayrollHolidayListParams {
	organizationId?: string;
	year?: number;
	source?: HolidaySource;
	status?: HolidayStatus;
	kind?: HolidayKind;
}

export interface PayrollWarning {
	type:
		| 'OVERTIME_DAILY_EXCEEDED'
		| 'OVERTIME_WEEKLY_EXCEEDED'
		| 'OVERTIME_WEEKLY_DAYS_EXCEEDED'
		| 'BELOW_MINIMUM_WAGE'
		| 'LUNCH_BREAK_AUTO_DEDUCTED'
		| 'DEDUCTIONS_EXCEED_NET_PAY';
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

export interface PayrollIncapacitySummaryByType {
	days: number;
	subsidyDays: number;
	subsidyRate: number;
	expectedSubsidyAmount: number;
}

export interface PayrollIncapacitySummary {
	daysIncapacityTotal: number;
	expectedImssSubsidyAmount: number;
	byType: {
		EG: PayrollIncapacitySummaryByType;
		RT: PayrollIncapacitySummaryByType;
		MAT: PayrollIncapacitySummaryByType;
		LIC140BIS: PayrollIncapacitySummaryByType;
	};
}

export interface PayrollDeductionBreakdownItem {
	deductionId: string;
	type: EmployeeDeductionType;
	label: string;
	calculationMethod:
		| 'PERCENTAGE_SBC'
		| 'PERCENTAGE_NET'
		| 'PERCENTAGE_GROSS'
		| 'FIXED_AMOUNT'
		| 'VSM_FACTOR';
	frequency: 'RECURRING' | 'ONE_TIME' | 'INSTALLMENTS';
	configuredValue: number;
	baseAmount: number;
	calculatedAmount: number;
	appliedAmount: number;
	applicableDays: number;
	totalInstallments: number | null;
	completedInstallmentsBefore: number;
	completedInstallmentsAfter: number;
	remainingAmountBefore: number | null;
	remainingAmountAfter: number | null;
	statusBefore: EmployeeDeductionStatus;
	statusAfter: EmployeeDeductionStatus;
	cappedByNetPay: boolean;
	referenceNumber: string | null;
	satDeductionCode: string | null;
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
	payableOvertimeDoubleHours: number;
	payableOvertimeTripleHours: number;
	authorizedOvertimeHours: number;
	unauthorizedOvertimeHours: number;
	sundayHoursWorked: number;
	mandatoryRestDaysWorkedCount: number;
	mandatoryRestDayDateKeys: string[];
	normalPay: number;
	overtimeDoublePay: number;
	overtimeTriplePay: number;
	sundayPremiumAmount: number;
	mandatoryRestDayPremiumAmount: number;
	vacationDaysPaid: number;
	vacationPayAmount: number;
	vacationPremiumAmount: number;
	deductionsBreakdown: PayrollDeductionBreakdownItem[];
	totalDeductions: number;
	totalPay: number;
	grossPay: number;
	bases: PayrollTaxBases;
	employeeWithholdings: PayrollEmployeeWithholdings;
	employerCosts: PayrollEmployerCosts;
	informationalLines: PayrollInformationalLines;
	netPay: number;
	companyCost: number;
	incapacitySummary: PayrollIncapacitySummary;
	warnings: PayrollWarning[];
	holidayImpact?: PayrollEmployeeHolidayImpactContract;
	lunchBreakAutoDeductedDays: number;
	lunchBreakAutoDeductedMinutes: number;
}

export interface PayrollCalculationResult {
	employees: PayrollCalculationEmployee[];
	totalAmount: number;
	taxSummary: PayrollTaxSummary;
	periodStartDateKey: string;
	periodEndDateKey: string;
	timeZone?: string;
	overtimeEnforcement?: 'WARN' | 'BLOCK';
	holidayNotices?: PayrollHolidayNoticeContract[];
}

export interface PayrollRun {
	id: string;
	organizationId: string;
	organizationName?: string | null;
	periodStart: Date;
	periodEnd: Date;
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	status: 'DRAFT' | 'PROCESSED';
	totalAmount: number;
	employeeCount: number;
	holidayNotices?: PayrollHolidayNoticeContract[] | null;
	processedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface PayrollRunEmployee {
	id: string;
	payrollRunId: string;
	employeeId: string;
	employeeName: string;
	employeeCode: string;
	employeeNss?: string | null;
	employeeRfc?: string | null;
	hoursWorked: number;
	hourlyPay: number;
	totalPay: number;
	normalHours: number;
	normalPay: number;
	overtimeDoubleHours: number;
	overtimeDoublePay: number;
	overtimeTripleHours: number;
	overtimeTriplePay: number;
	authorizedOvertimeHours: number;
	unauthorizedOvertimeHours: number;
	sundayPremiumAmount: number;
	mandatoryRestDayPremiumAmount: number;
	vacationDaysPaid: number;
	vacationPayAmount: number;
	vacationPremiumAmount: number;
	lunchBreakAutoDeductedDays: number;
	lunchBreakAutoDeductedMinutes: number;
	deductionsBreakdown: PayrollDeductionBreakdownItem[];
	totalDeductions: number;
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

export interface EmployeeDeduction {
	id: string;
	organizationId: string;
	employeeId: string;
	employeeName?: string;
	type: EmployeeDeductionType;
	label: string;
	calculationMethod:
		| 'PERCENTAGE_SBC'
		| 'PERCENTAGE_NET'
		| 'PERCENTAGE_GROSS'
		| 'FIXED_AMOUNT'
		| 'VSM_FACTOR';
	value: number;
	frequency: 'RECURRING' | 'ONE_TIME' | 'INSTALLMENTS';
	totalInstallments: number | null;
	completedInstallments: number;
	totalAmount: number | null;
	remainingAmount: number | null;
	status: EmployeeDeductionStatus;
	startDateKey: string;
	endDateKey: string | null;
	referenceNumber: string | null;
	satDeductionCode: string | null;
	notes: string | null;
	createdByUserId: string;
	createdAt: Date;
	updatedAt: Date;
}

type PayrollDeductionBreakdownItemPayload = Omit<
	PayrollDeductionBreakdownItem,
	| 'configuredValue'
	| 'baseAmount'
	| 'calculatedAmount'
	| 'appliedAmount'
	| 'remainingAmountBefore'
	| 'remainingAmountAfter'
> & {
	configuredValue?: number | string;
	baseAmount?: number | string;
	calculatedAmount?: number | string;
	appliedAmount?: number | string;
	remainingAmountBefore?: number | string | null;
	remainingAmountAfter?: number | string | null;
};

export type EmployeeDeductionPayload = Omit<
	EmployeeDeduction,
	'value' | 'totalAmount' | 'remainingAmount' | 'createdAt' | 'updatedAt'
> & {
	value?: number | string;
	totalAmount?: number | string | null;
	remainingAmount?: number | string | null;
	createdAt: string | Date;
	updatedAt: string | Date;
};

/**
 * Normalizes deduction breakdown numeric fields.
 *
 * @param record - Raw deduction breakdown payload
 * @returns Normalized deduction breakdown
 */
function normalizePayrollDeductionBreakdownItem(
	record: PayrollDeductionBreakdownItemPayload,
): PayrollDeductionBreakdownItem {
	return {
		...record,
		configuredValue: Number(record.configuredValue ?? 0),
		baseAmount: Number(record.baseAmount ?? 0),
		calculatedAmount: Number(record.calculatedAmount ?? 0),
		appliedAmount: Number(record.appliedAmount ?? 0),
		remainingAmountBefore:
			record.remainingAmountBefore === null || record.remainingAmountBefore === undefined
				? null
				: Number(record.remainingAmountBefore),
		remainingAmountAfter:
			record.remainingAmountAfter === null || record.remainingAmountAfter === undefined
				? null
				: Number(record.remainingAmountAfter),
	};
}

/**
 * Normalizes employee deduction payload values.
 *
 * @param record - Raw employee deduction payload
 * @returns Normalized employee deduction record
 */
export function normalizeEmployeeDeduction(record: EmployeeDeductionPayload): EmployeeDeduction {
	return {
		...record,
		value: Number(record.value ?? 0),
		totalAmount:
			record.totalAmount === null || record.totalAmount === undefined
				? null
				: Number(record.totalAmount),
		remainingAmount:
			record.remainingAmount === null || record.remainingAmount === undefined
				? null
				: Number(record.remainingAmount),
		createdAt: new Date(record.createdAt),
		updatedAt: new Date(record.updatedAt),
	};
}

type PayrollCalculationEmployeePayload = Omit<
	PayrollCalculationEmployee,
	| 'dailyPay'
	| 'hourlyPay'
	| 'seventhDayPay'
	| 'hoursWorked'
	| 'expectedHours'
	| 'normalHours'
	| 'overtimeDoubleHours'
	| 'overtimeTripleHours'
	| 'payableOvertimeDoubleHours'
	| 'payableOvertimeTripleHours'
	| 'authorizedOvertimeHours'
	| 'unauthorizedOvertimeHours'
	| 'sundayHoursWorked'
	| 'normalPay'
	| 'overtimeDoublePay'
	| 'overtimeTriplePay'
	| 'sundayPremiumAmount'
	| 'mandatoryRestDayPremiumAmount'
	| 'vacationDaysPaid'
	| 'vacationPayAmount'
	| 'vacationPremiumAmount'
	| 'lunchBreakAutoDeductedDays'
	| 'lunchBreakAutoDeductedMinutes'
	| 'totalDeductions'
	| 'totalPay'
	| 'grossPay'
	| 'netPay'
	| 'companyCost'
	| 'deductionsBreakdown'
> & {
	dailyPay?: number | string;
	hourlyPay?: number | string;
	seventhDayPay?: number | string;
	hoursWorked?: number | string;
	expectedHours?: number | string;
	normalHours?: number | string;
	overtimeDoubleHours?: number | string;
	overtimeTripleHours?: number | string;
	payableOvertimeDoubleHours?: number | string;
	payableOvertimeTripleHours?: number | string;
	authorizedOvertimeHours?: number | string;
	unauthorizedOvertimeHours?: number | string;
	sundayHoursWorked?: number | string;
	normalPay?: number | string;
	overtimeDoublePay?: number | string;
	overtimeTriplePay?: number | string;
	sundayPremiumAmount?: number | string;
	mandatoryRestDayPremiumAmount?: number | string;
	vacationDaysPaid?: number | string;
	vacationPayAmount?: number | string;
	vacationPremiumAmount?: number | string;
	lunchBreakAutoDeductedDays?: number | string;
	lunchBreakAutoDeductedMinutes?: number | string;
	totalDeductions?: number | string;
	totalPay?: number | string;
	grossPay?: number | string;
	netPay?: number | string;
	companyCost?: number | string;
	deductionsBreakdown?: PayrollDeductionBreakdownItemPayload[];
};

/**
 * Normalizes a payroll calculation employee payload.
 *
 * @param record - Raw payroll calculation employee payload
 * @returns Normalized payroll calculation employee
 */
function normalizePayrollCalculationEmployee(
	record: PayrollCalculationEmployeePayload,
): PayrollCalculationEmployee {
	return {
		...record,
		dailyPay: Number(record.dailyPay ?? 0),
		hourlyPay: Number(record.hourlyPay ?? 0),
		seventhDayPay: Number(record.seventhDayPay ?? 0),
		hoursWorked: Number(record.hoursWorked ?? 0),
		expectedHours: Number(record.expectedHours ?? 0),
		normalHours: Number(record.normalHours ?? 0),
		overtimeDoubleHours: Number(record.overtimeDoubleHours ?? 0),
		overtimeTripleHours: Number(record.overtimeTripleHours ?? 0),
		payableOvertimeDoubleHours: Number(record.payableOvertimeDoubleHours ?? 0),
		payableOvertimeTripleHours: Number(record.payableOvertimeTripleHours ?? 0),
		authorizedOvertimeHours: Number(record.authorizedOvertimeHours ?? 0),
		unauthorizedOvertimeHours: Number(record.unauthorizedOvertimeHours ?? 0),
		sundayHoursWorked: Number(record.sundayHoursWorked ?? 0),
		normalPay: Number(record.normalPay ?? 0),
		overtimeDoublePay: Number(record.overtimeDoublePay ?? 0),
		overtimeTriplePay: Number(record.overtimeTriplePay ?? 0),
		sundayPremiumAmount: Number(record.sundayPremiumAmount ?? 0),
		mandatoryRestDayPremiumAmount: Number(record.mandatoryRestDayPremiumAmount ?? 0),
		vacationDaysPaid: Number(record.vacationDaysPaid ?? 0),
		vacationPayAmount: Number(record.vacationPayAmount ?? 0),
		vacationPremiumAmount: Number(record.vacationPremiumAmount ?? 0),
		lunchBreakAutoDeductedDays: Number(record.lunchBreakAutoDeductedDays ?? 0),
		lunchBreakAutoDeductedMinutes: Number(record.lunchBreakAutoDeductedMinutes ?? 0),
		totalDeductions: Number(record.totalDeductions ?? 0),
		totalPay: Number(record.totalPay ?? 0),
		grossPay: Number(record.grossPay ?? 0),
		netPay: Number(record.netPay ?? 0),
		companyCost: Number(record.companyCost ?? 0),
		deductionsBreakdown: (record.deductionsBreakdown ?? []).map(
			normalizePayrollDeductionBreakdownItem,
		),
	};
}

export interface OvertimeAuthorization {
	id: string;
	organizationId: string;
	employeeId: string;
	employeeName?: string;
	dateKey: string;
	authorizedHours: number;
	authorizedByUserId: string | null;
	authorizedByName?: string | null;
	status: 'PENDING' | 'ACTIVE' | 'CANCELLED';
	notes: string | null;
	createdAt: Date;
	updatedAt: Date;
}

type OvertimeAuthorizationPayload = Omit<
	OvertimeAuthorization,
	'authorizedHours' | 'createdAt' | 'updatedAt'
> & {
	authorizedHours?: number | string;
	createdAt: string | Date;
	updatedAt: string | Date;
};

/**
 * Normalizes overtime authorization payload values.
 *
 * @param record - Raw overtime authorization payload from the API
 * @returns Normalized overtime authorization record
 */
function normalizeOvertimeAuthorization(
	record: OvertimeAuthorizationPayload,
): OvertimeAuthorization {
	return {
		...record,
		authorizedHours: Number(record.authorizedHours ?? 0),
		createdAt: new Date(record.createdAt),
		updatedAt: new Date(record.updatedAt),
	};
}

// ============================================================================
// PTU / Aguinaldo Types
// ============================================================================

export interface ExtraPaymentWarning {
	type: string;
	message: string;
	severity: 'warning' | 'error';
}

export interface ExtraPaymentTaxBreakdown {
	exemptAmount: number;
	taxableAmount: number;
	withheldIsr: number;
	netAmount: number;
	withholdingMethod: 'RLISR_174' | 'STANDARD';
}

export type PtuRunStatus = 'DRAFT' | 'PROCESSED' | 'CANCELLED';
export type AguinaldoRunStatus = 'DRAFT' | 'PROCESSED' | 'CANCELLED';

export interface PtuRun {
	id: string;
	organizationId: string;
	fiscalYear: number;
	paymentDate: Date;
	taxableIncome: number;
	ptuPercentage: number;
	includeInactive: boolean;
	status: PtuRunStatus;
	totalAmount: number;
	employeeCount: number;
	taxSummary?: Record<string, unknown> | null;
	settingsSnapshot?: Record<string, unknown> | null;
	processedAt: Date | null;
	cancelledAt: Date | null;
	cancelReason: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface PtuRunEmployee {
	id: string;
	ptuRunId: string;
	employeeId: string;
	employeeName?: string;
	employeeCode?: string;
	employeeNss?: string | null;
	employeeRfc?: string | null;
	isEligible: boolean;
	eligibilityReasons: string[];
	daysCounted: number;
	dailyQuota: number;
	annualSalaryBase: number;
	ptuByDays: number;
	ptuBySalary: number;
	ptuPreCap: number;
	capThreeMonths: number;
	capAvgThreeYears: number;
	capFinal: number;
	ptuFinal: number;
	exemptAmount: number;
	taxableAmount: number;
	withheldIsr: number;
	netAmount: number;
	warnings: ExtraPaymentWarning[];
	createdAt: Date;
	updatedAt: Date;
}

export interface AguinaldoRun {
	id: string;
	organizationId: string;
	calendarYear: number;
	paymentDate: Date;
	includeInactive: boolean;
	status: AguinaldoRunStatus;
	totalAmount: number;
	employeeCount: number;
	taxSummary?: Record<string, unknown> | null;
	settingsSnapshot?: Record<string, unknown> | null;
	processedAt: Date | null;
	cancelledAt: Date | null;
	cancelReason: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface AguinaldoRunEmployee {
	id: string;
	aguinaldoRunId: string;
	employeeId: string;
	employeeName?: string;
	employeeCode?: string;
	employeeNss?: string | null;
	employeeRfc?: string | null;
	isEligible: boolean;
	eligibilityReasons: string[];
	daysCounted: number;
	dailySalaryBase: number;
	aguinaldoDaysPolicy: number;
	yearDays: number;
	grossAmount: number;
	exemptAmount: number;
	taxableAmount: number;
	withheldIsr: number;
	netAmount: number;
	warnings: ExtraPaymentWarning[];
	createdAt: Date;
	updatedAt: Date;
}

export interface PtuCalculationResult {
	run: PtuRun;
	employees: PtuRunEmployee[];
	warnings: ExtraPaymentWarning[];
}

export interface AguinaldoCalculationResult {
	run: AguinaldoRun;
	employees: AguinaldoRunEmployee[];
	warnings: ExtraPaymentWarning[];
}

export interface PtuEmployeeOverride {
	employeeId: string;
	daysCounted?: number;
	dailyQuota?: number;
	annualSalaryBase?: number;
	eligibilityOverride?: 'DEFAULT' | 'INCLUDE' | 'EXCLUDE';
}

export interface AguinaldoEmployeeOverride {
	employeeId: string;
	daysCounted?: number;
	dailySalaryBase?: number;
	aguinaldoDaysPolicy?: number;
}

export interface PtuHistoryRecord {
	id: string;
	organizationId: string;
	employeeId: string;
	fiscalYear: number;
	amount: number;
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
	| 'countSaturdayAsWorkedForSeventhDay'
	| 'ptuEnabled'
	| 'ptuMode'
	| 'ptuIsExempt'
	| 'ptuExemptReason'
	| 'employerType'
	| 'aguinaldoEnabled'
	| 'enableDisciplinaryMeasures'
> & {
	riskWorkRate?: number | string | null;
	statePayrollTaxRate?: number | string | null;
	aguinaldoDays?: number | string | null;
	vacationPremiumRate?: number | string | null;
	absorbImssEmployeeShare?: boolean | null;
	absorbIsr?: boolean | null;
	enableSeventhDayPay?: boolean | null;
	countSaturdayAsWorkedForSeventhDay?: boolean | null;
	ptuEnabled?: boolean | null;
	ptuMode?: 'DEFAULT_RULES' | 'MANUAL' | null;
	ptuIsExempt?: boolean | null;
	ptuExemptReason?: string | null;
	employerType?: 'PERSONA_MORAL' | 'PERSONA_FISICA' | null;
	aguinaldoEnabled?: boolean | null;
	enableDisciplinaryMeasures?: boolean | null;
	autoDeductLunchBreak?: boolean | null;
	lunchBreakMinutes?: number | string | null;
	lunchBreakThresholdHours?: number | string | null;
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
		countSaturdayAsWorkedForSeventhDay: Boolean(
			payload.countSaturdayAsWorkedForSeventhDay ?? false,
		),
		ptuEnabled: Boolean(payload.ptuEnabled ?? false),
		ptuMode: payload.ptuMode ?? 'DEFAULT_RULES',
		ptuIsExempt: Boolean(payload.ptuIsExempt ?? false),
		ptuExemptReason: payload.ptuExemptReason ?? null,
		employerType: payload.employerType ?? 'PERSONA_MORAL',
		aguinaldoEnabled: Boolean(payload.aguinaldoEnabled ?? true),
		enableDisciplinaryMeasures: Boolean(payload.enableDisciplinaryMeasures ?? true),
		autoDeductLunchBreak: Boolean(payload.autoDeductLunchBreak ?? false),
		lunchBreakMinutes: normalizeNumber(payload.lunchBreakMinutes, 60),
		lunchBreakThresholdHours: normalizeNumber(payload.lunchBreakThresholdHours, 6),
	};
}

type PayrollHolidayEntryPayload = Omit<
	HolidayCalendarEntry,
	'approvedAt' | 'rejectedAt' | 'createdAt' | 'updatedAt'
> & {
	approvedAt?: string | Date | null;
	rejectedAt?: string | Date | null;
	createdAt: string | Date;
	updatedAt: string | Date;
};

type PayrollHolidaySyncRunPayload = Omit<
	PayrollHolidaySyncRun,
	'startedAt' | 'finishedAt' | 'createdAt' | 'updatedAt'
> & {
	startedAt: string | Date;
	finishedAt?: string | Date | null;
	createdAt: string | Date;
	updatedAt: string | Date;
};

/**
 * Normalizes holiday entry payload date fields.
 *
 * @param payload - Raw holiday payload
 * @returns Normalized holiday entry
 */
function normalizePayrollHolidayEntry(payload: PayrollHolidayEntryPayload): HolidayCalendarEntry {
	return {
		...payload,
		approvedAt: payload.approvedAt ? new Date(payload.approvedAt) : null,
		rejectedAt: payload.rejectedAt ? new Date(payload.rejectedAt) : null,
		createdAt: new Date(payload.createdAt),
		updatedAt: new Date(payload.updatedAt),
	};
}

/**
 * Normalizes holiday sync run payload date and numeric fields.
 *
 * @param payload - Raw sync run payload
 * @returns Normalized sync run
 */
function normalizePayrollHolidaySyncRun(
	payload: PayrollHolidaySyncRunPayload,
): PayrollHolidaySyncRun {
	return {
		...payload,
		startedAt: new Date(payload.startedAt),
		finishedAt: payload.finishedAt ? new Date(payload.finishedAt) : null,
		importedCount: Number(payload.importedCount ?? 0),
		pendingCount: Number(payload.pendingCount ?? 0),
		errorCount: Number(payload.errorCount ?? 0),
		createdAt: new Date(payload.createdAt),
		updatedAt: new Date(payload.updatedAt),
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

	const payload = getApiResponseData(response);
	return normalizePayrollSettings(payload?.data as PayrollSettingsPayload | undefined);
}

/**
 * Fetches payroll holiday entries with optional filters.
 *
 * @param params - Optional holiday filters
 * @returns Holiday entries
 */
export async function fetchPayrollHolidays(
	params?: PayrollHolidayListParams,
): Promise<HolidayCalendarEntry[]> {
	const query: PayrollHolidayListParams = {};
	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}
	if (typeof params?.year === 'number') {
		query.year = params.year;
	}
	if (params?.source) {
		query.source = params.source;
	}
	if (params?.status) {
		query.status = params.status;
	}
	if (params?.kind) {
		query.kind = params.kind;
	}

	const response = await api['payroll-settings'].holidays.get({
		$query: query,
	});

	if (response.error) {
		console.error(
			'Failed to fetch payroll holidays:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch payroll holidays');
	}

	const payload = getApiResponseData(response);
	const rows = (payload?.data as PayrollHolidayEntryPayload[] | undefined) ?? [];
	return rows.map(normalizePayrollHolidayEntry);
}

/**
 * Creates custom payroll holiday entries.
 *
 * @param params - Custom holiday inputs
 * @returns Created holiday entries
 */
export async function createPayrollHolidayCustom(params: {
	dateKey: string;
	name: string;
	kind?: HolidayKind;
	recurrence?: 'ONE_TIME' | 'ANNUAL';
	legalReference?: string | null;
	organizationId?: string;
}): Promise<HolidayCalendarEntry[]> {
	const response = await api['payroll-settings'].holidays.custom.post({
		organizationId: params.organizationId,
		dateKey: params.dateKey,
		name: params.name,
		kind: params.kind,
		recurrence: params.recurrence,
		legalReference: params.legalReference ?? null,
	});

	if (response.error) {
		console.error(
			'Failed to create payroll holiday:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to create payroll holiday');
	}

	const payload = getApiResponseData(response);
	const rows = (payload?.data as PayrollHolidayEntryPayload[] | undefined) ?? [];
	return rows.map(normalizePayrollHolidayEntry);
}

/**
 * Updates or deactivates a holiday entry.
 *
 * @param id - Holiday identifier
 * @param params - Update payload
 * @returns Updated holiday entry
 */
export async function updatePayrollHoliday(
	id: string,
	params: {
		reason: string;
		name?: string;
		kind?: HolidayKind;
		dateKey?: string;
		active?: boolean;
		legalReference?: string | null;
	},
): Promise<HolidayCalendarEntry> {
	const response = await api['payroll-settings'].holidays[id].patch({
		reason: params.reason,
		name: params.name,
		kind: params.kind,
		dateKey: params.dateKey,
		active: params.active,
		legalReference: params.legalReference,
	});

	if (response.error) {
		console.error(
			'Failed to update payroll holiday:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to update payroll holiday');
	}

	const payload = getApiResponseData(response);
	const row = payload?.data as PayrollHolidayEntryPayload | undefined;
	if (!row) {
		throw new Error('Failed to update payroll holiday: empty response');
	}
	return normalizePayrollHolidayEntry(row);
}

/**
 * Imports payroll holidays from CSV content.
 *
 * @param params - Import payload
 * @returns Import report
 */
export async function importPayrollHolidaysCsv(params: {
	csvContent: string;
	organizationId?: string;
}): Promise<{
	appliedRows: number;
	rejectedRows: number;
	errors: Array<{ line: number; reason: string }>;
}> {
	const response = await api['payroll-settings'].holidays.import.csv.post({
		organizationId: params.organizationId,
		csvContent: params.csvContent,
	});

	if (response.error) {
		console.error(
			'Failed to import payroll holidays CSV:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to import payroll holidays CSV');
	}

	const payload = getApiResponseData(response);
	const data = payload?.data as
		| {
				appliedRows: number;
				rejectedRows: number;
				errors: Array<{ line: number; reason: string }>;
		  }
		| undefined;
	if (!data) {
		throw new Error('Failed to import payroll holidays CSV: empty response');
	}
	return {
		appliedRows: Number(data.appliedRows ?? 0),
		rejectedRows: Number(data.rejectedRows ?? 0),
		errors: data.errors ?? [],
	};
}

/**
 * Exports payroll holidays using current filters.
 *
 * @param params - Optional export filters
 * @returns CSV payload
 */
export async function exportPayrollHolidaysCsv(params?: PayrollHolidayListParams): Promise<{
	fileName: string;
	csvContent: string;
	count: number;
}> {
	const query: PayrollHolidayListParams = {};
	if (params?.organizationId) {
		query.organizationId = params.organizationId;
	}
	if (typeof params?.year === 'number') {
		query.year = params.year;
	}
	if (params?.source) {
		query.source = params.source;
	}
	if (params?.status) {
		query.status = params.status;
	}
	if (params?.kind) {
		query.kind = params.kind;
	}

	const response = await api['payroll-settings'].holidays.export.csv.get({
		$query: query,
	});

	if (response.error) {
		console.error(
			'Failed to export payroll holidays CSV:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to export payroll holidays CSV');
	}

	const payload = getApiResponseData(response);
	const data = payload?.data as
		| { fileName: string; csvContent: string; count: number | string }
		| undefined;
	if (!data) {
		throw new Error('Failed to export payroll holidays CSV: empty response');
	}
	return {
		fileName: data.fileName,
		csvContent: data.csvContent,
		count: Number(data.count ?? 0),
	};
}

/**
 * Triggers manual payroll holiday synchronization.
 *
 * @param params - Sync payload
 * @returns Sync result
 */
export async function syncPayrollHolidays(params?: {
	organizationId?: string;
	year?: number;
	years?: number[];
}): Promise<{
	run: PayrollHolidaySyncRun;
	importedCount: number;
	pendingCount: number;
	errorCount: number;
}> {
	const response = await api['payroll-settings'].holidays.sync.post({
		organizationId: params?.organizationId,
		year: params?.year,
		years: params?.years,
	});

	if (response.error) {
		console.error(
			'Failed to sync payroll holidays:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to sync payroll holidays');
	}

	const payload = getApiResponseData(response);
	const data = payload?.data as
		| {
				run: PayrollHolidaySyncRunPayload;
				importedCount: number | string;
				pendingCount: number | string;
				errorCount: number | string;
		  }
		| undefined;
	if (!data?.run) {
		throw new Error('Failed to sync payroll holidays: empty response');
	}
	return {
		run: normalizePayrollHolidaySyncRun(data.run),
		importedCount: Number(data.importedCount ?? 0),
		pendingCount: Number(data.pendingCount ?? 0),
		errorCount: Number(data.errorCount ?? 0),
	};
}

/**
 * Approves pending entries from a provider sync run.
 *
 * @param runId - Sync run identifier
 * @param reason - Decision reason
 * @returns Approval summary
 */
export async function approvePayrollHolidaySyncRun(
	runId: string,
	reason: string,
): Promise<{ runId: string; approvedCount: number }> {
	const response = await api['payroll-settings'].holidays.sync[runId].approve.post({
		reason,
	});

	if (response.error) {
		console.error(
			'Failed to approve payroll holiday sync run:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to approve payroll holiday sync run');
	}

	const payload = getApiResponseData(response);
	const data = payload?.data as { runId: string; approvedCount: number | string } | undefined;
	if (!data) {
		throw new Error('Failed to approve payroll holiday sync run: empty response');
	}
	return {
		runId: data.runId,
		approvedCount: Number(data.approvedCount ?? 0),
	};
}

/**
 * Rejects pending entries from a provider sync run.
 *
 * @param runId - Sync run identifier
 * @param reason - Decision reason
 * @returns Rejection summary
 */
export async function rejectPayrollHolidaySyncRun(
	runId: string,
	reason: string,
): Promise<{ runId: string; rejectedCount: number }> {
	const response = await api['payroll-settings'].holidays.sync[runId].reject.post({
		reason,
	});

	if (response.error) {
		console.error(
			'Failed to reject payroll holiday sync run:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to reject payroll holiday sync run');
	}

	const payload = getApiResponseData(response);
	const data = payload?.data as { runId: string; rejectedCount: number | string } | undefined;
	if (!data) {
		throw new Error('Failed to reject payroll holiday sync run: empty response');
	}
	return {
		runId: data.runId,
		rejectedCount: Number(data.rejectedCount ?? 0),
	};
}

/**
 * Fetches holiday sync status for the active organization.
 *
 * @param organizationId - Optional organization identifier
 * @returns Sync status
 */
export async function fetchPayrollHolidaySyncStatus(
	organizationId?: string,
): Promise<PayrollHolidaySyncStatus> {
	const response = await api['payroll-settings'].holidays.sync.status.get({
		$query: organizationId ? { organizationId } : undefined,
	});

	if (response.error) {
		console.error(
			'Failed to fetch payroll holiday sync status:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch payroll holiday sync status');
	}

	const payload = getApiResponseData(response);
	const data = payload?.data as
		| {
				lastRun?: PayrollHolidaySyncRunPayload | null;
				pendingApprovalCount?: number | string;
				stale?: boolean;
		  }
		| undefined;
	return {
		lastRun: data?.lastRun ? normalizePayrollHolidaySyncRun(data.lastRun) : null,
		pendingApprovalCount: Number(data?.pendingApprovalCount ?? 0),
		stale: Boolean(data?.stale ?? false),
	};
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

	const payload = getApiResponseData(response);
	if (!payload?.data) {
		throw new Error('Failed to calculate payroll');
	}
	const data = payload.data as PayrollCalculationResult & {
		employees?: PayrollCalculationEmployeePayload[];
	};
	return {
		...data,
		employees: (data.employees ?? []).map(normalizePayrollCalculationEmployee),
	};
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

	const payload =
		(getApiResponseData(response)?.data as unknown as
			| { run: PayrollRun; calculation: PayrollCalculationResult }
			| undefined) ?? undefined;
	if (!payload) {
		throw new Error('Failed to process payroll: empty response');
	}
	const runTotalAmount =
		typeof payload.run.totalAmount === 'string'
			? Number(payload.run.totalAmount)
			: payload.run.totalAmount;
	return {
		run: { ...payload.run, totalAmount: runTotalAmount ?? 0 },
		calculation: {
			...payload.calculation,
			employees: (payload.calculation.employees as PayrollCalculationEmployeePayload[]).map(
				normalizePayrollCalculationEmployee,
			),
		},
	};
}

/**
 * Fetches overtime authorizations with optional filters and pagination.
 *
 * @param params - Organization, filter, and pagination params
 * @returns Paginated overtime authorization response
 * @throws Error when the API request fails
 */
export async function fetchOvertimeAuthorizationsList(
	params?: OvertimeAuthorizationQueryParams,
): Promise<PaginatedResponse<OvertimeAuthorization>> {
	if (!params?.organizationId) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit: clampPaginationLimit(params?.limit, 20),
				offset: clampPaginationOffset(params?.offset),
			},
		};
	}

	const query: {
		limit: number;
		offset: number;
		employeeId?: string;
		startDate?: string;
		endDate?: string;
		status?: OvertimeAuthorizationQueryParams['status'];
	} = {
		limit: clampPaginationLimit(params.limit, 20),
		offset: clampPaginationOffset(params.offset),
	};

	if (params.employeeId) {
		query.employeeId = params.employeeId;
	}
	if (params.startDate) {
		query.startDate = params.startDate;
	}
	if (params.endDate) {
		query.endDate = params.endDate;
	}
	if (params.status) {
		query.status = params.status;
	}

	const response = await api.organizations[params.organizationId]['overtime-authorizations'].get({
		$query: query,
	});

	if (response.error) {
		console.error(
			'Failed to fetch overtime authorizations:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch overtime authorizations');
	}

	const payload = getApiResponseData(response);
	const rows = (payload?.data as OvertimeAuthorizationPayload[] | undefined) ?? [];

	return {
		data: rows.map(normalizeOvertimeAuthorization),
		pagination: payload?.pagination ?? {
			total: 0,
			limit: query.limit,
			offset: query.offset,
		},
	};
}

/**
 * Fetches deductions for a single employee.
 *
 * @param params - Organization, employee, and optional filter params
 * @returns Employee deductions list
 */
export async function fetchEmployeeDeductionsList(
	params?: EmployeeDeductionListQueryParams,
): Promise<EmployeeDeduction[]> {
	if (!params?.organizationId || !params.employeeId) {
		return [];
	}

	const response = await api.organizations[params.organizationId].employees[
		params.employeeId
	].deductions.get({
		$query: {
			status: params.status,
			type: params.type,
		},
	});

	if (response.error) {
		console.error(
			'Failed to fetch employee deductions:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch employee deductions');
	}

	const payload = getApiResponseData(response);
	const rows = (payload?.data as EmployeeDeductionPayload[] | undefined) ?? [];
	return rows.map(normalizeEmployeeDeduction);
}

/**
 * Fetches organization-wide deductions with optional filters.
 *
 * @param params - Organization and filter params
 * @returns Paginated deductions response
 */
export async function fetchOrganizationDeductionsList(
	params?: OrganizationDeductionListQueryParams,
): Promise<PaginatedResponse<EmployeeDeduction>> {
	if (!params?.organizationId) {
		return {
			data: [],
			pagination: {
				total: 0,
				limit: clampPaginationLimit(params?.limit, 20),
				offset: clampPaginationOffset(params?.offset),
			},
		};
	}

	const query = {
		limit: clampPaginationLimit(params.limit, 20),
		offset: clampPaginationOffset(params.offset),
		employeeId: params.employeeId,
		status: params.status,
		type: params.type,
	};
	const response = await api.organizations[params.organizationId].deductions.get({
		$query: query,
	});

	if (response.error) {
		console.error(
			'Failed to fetch organization deductions:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch organization deductions');
	}

	const payload = getApiResponseData(response);
	const rows = (payload?.data as EmployeeDeductionPayload[] | undefined) ?? [];
	return {
		data: rows.map(normalizeEmployeeDeduction),
		pagination: payload?.pagination ?? {
			total: 0,
			limit: query.limit,
			offset: query.offset,
		},
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
		(getApiResponseData(response)?.data as
			| (PayrollRun & { totalAmount?: number | string })[]
			| undefined) ?? [];
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

	const payload =
		(getApiResponseData(response)?.data as unknown as
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
						authorizedOvertimeHours?: number | string;
						unauthorizedOvertimeHours?: number | string;
						sundayPremiumAmount?: number | string;
						mandatoryRestDayPremiumAmount?: number | string;
						vacationDaysPaid?: number | string;
						vacationPayAmount?: number | string;
						vacationPremiumAmount?: number | string;
						lunchBreakAutoDeductedDays?: number | string;
						lunchBreakAutoDeductedMinutes?: number | string;
						totalDeductions?: number | string;
						deductionsBreakdown?: PayrollDeductionBreakdownItemPayload[];
						periodStart: string | Date;
						periodEnd: string | Date;
						createdAt: string | Date;
						updatedAt: string | Date;
					})[];
			  }
			| undefined) ?? undefined;
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
		authorizedOvertimeHours: Number(employee.authorizedOvertimeHours ?? 0),
		unauthorizedOvertimeHours: Number(employee.unauthorizedOvertimeHours ?? 0),
		sundayPremiumAmount: Number(employee.sundayPremiumAmount ?? 0),
		mandatoryRestDayPremiumAmount: Number(employee.mandatoryRestDayPremiumAmount ?? 0),
		vacationDaysPaid: Number(employee.vacationDaysPaid ?? 0),
		vacationPayAmount: Number(employee.vacationPayAmount ?? 0),
		vacationPremiumAmount: Number(employee.vacationPremiumAmount ?? 0),
		lunchBreakAutoDeductedDays: Number(employee.lunchBreakAutoDeductedDays ?? 0),
		lunchBreakAutoDeductedMinutes: Number(employee.lunchBreakAutoDeductedMinutes ?? 0),
		totalDeductions: Number(employee.totalDeductions ?? 0),
		deductionsBreakdown: (employee.deductionsBreakdown ?? []).map(
			normalizePayrollDeductionBreakdownItem,
		),
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
// PTU / Aguinaldo Functions
// ============================================================================

type PtuRunPayload = Omit<
	PtuRun,
	| 'paymentDate'
	| 'processedAt'
	| 'cancelledAt'
	| 'createdAt'
	| 'updatedAt'
	| 'taxableIncome'
	| 'ptuPercentage'
	| 'totalAmount'
	| 'employeeCount'
> & {
	paymentDate: string | Date;
	processedAt?: string | Date | null;
	cancelledAt?: string | Date | null;
	createdAt: string | Date;
	updatedAt: string | Date;
	taxableIncome?: number | string;
	ptuPercentage?: number | string;
	totalAmount?: number | string;
	employeeCount?: number | string;
};

type PtuRunEmployeePayload = Omit<
	PtuRunEmployee,
	| 'daysCounted'
	| 'dailyQuota'
	| 'annualSalaryBase'
	| 'ptuByDays'
	| 'ptuBySalary'
	| 'ptuPreCap'
	| 'capThreeMonths'
	| 'capAvgThreeYears'
	| 'capFinal'
	| 'ptuFinal'
	| 'exemptAmount'
	| 'taxableAmount'
	| 'withheldIsr'
	| 'netAmount'
	| 'createdAt'
	| 'updatedAt'
> & {
	daysCounted?: number | string;
	dailyQuota?: number | string;
	annualSalaryBase?: number | string;
	ptuByDays?: number | string;
	ptuBySalary?: number | string;
	ptuPreCap?: number | string;
	capThreeMonths?: number | string;
	capAvgThreeYears?: number | string;
	capFinal?: number | string;
	ptuFinal?: number | string;
	exemptAmount?: number | string;
	taxableAmount?: number | string;
	withheldIsr?: number | string;
	netAmount?: number | string;
	createdAt: string | Date;
	updatedAt: string | Date;
};

type AguinaldoRunPayload = Omit<
	AguinaldoRun,
	| 'paymentDate'
	| 'processedAt'
	| 'cancelledAt'
	| 'createdAt'
	| 'updatedAt'
	| 'totalAmount'
	| 'employeeCount'
> & {
	paymentDate: string | Date;
	processedAt?: string | Date | null;
	cancelledAt?: string | Date | null;
	createdAt: string | Date;
	updatedAt: string | Date;
	totalAmount?: number | string;
	employeeCount?: number | string;
};

type AguinaldoRunEmployeePayload = Omit<
	AguinaldoRunEmployee,
	| 'daysCounted'
	| 'dailySalaryBase'
	| 'aguinaldoDaysPolicy'
	| 'yearDays'
	| 'grossAmount'
	| 'exemptAmount'
	| 'taxableAmount'
	| 'withheldIsr'
	| 'netAmount'
	| 'createdAt'
	| 'updatedAt'
> & {
	daysCounted?: number | string;
	dailySalaryBase?: number | string;
	aguinaldoDaysPolicy?: number | string;
	yearDays?: number | string;
	grossAmount?: number | string;
	exemptAmount?: number | string;
	taxableAmount?: number | string;
	withheldIsr?: number | string;
	netAmount?: number | string;
	createdAt: string | Date;
	updatedAt: string | Date;
};

/**
 * Normalizes PTU run payloads with numeric strings into typed values.
 *
 * @param record - Raw PTU run payload
 * @returns Normalized PTU run
 */
function normalizePtuRun(record: PtuRunPayload): PtuRun {
	return {
		...record,
		paymentDate: new Date(record.paymentDate),
		taxableIncome: Number(record.taxableIncome ?? 0),
		ptuPercentage: Number(record.ptuPercentage ?? 0),
		totalAmount: Number(record.totalAmount ?? 0),
		employeeCount: Number(record.employeeCount ?? 0),
		processedAt: record.processedAt ? new Date(record.processedAt) : null,
		cancelledAt: record.cancelledAt ? new Date(record.cancelledAt) : null,
		createdAt: new Date(record.createdAt),
		updatedAt: new Date(record.updatedAt),
	};
}

/**
 * Normalizes PTU run employee payloads with numeric strings into typed values.
 *
 * @param record - Raw PTU run employee payload
 * @returns Normalized PTU run employee
 */
function normalizePtuRunEmployee(record: PtuRunEmployeePayload): PtuRunEmployee {
	return {
		...record,
		daysCounted: Number(record.daysCounted ?? 0),
		dailyQuota: Number(record.dailyQuota ?? 0),
		annualSalaryBase: Number(record.annualSalaryBase ?? 0),
		ptuByDays: Number(record.ptuByDays ?? 0),
		ptuBySalary: Number(record.ptuBySalary ?? 0),
		ptuPreCap: Number(record.ptuPreCap ?? 0),
		capThreeMonths: Number(record.capThreeMonths ?? 0),
		capAvgThreeYears: Number(record.capAvgThreeYears ?? 0),
		capFinal: Number(record.capFinal ?? 0),
		ptuFinal: Number(record.ptuFinal ?? 0),
		exemptAmount: Number(record.exemptAmount ?? 0),
		taxableAmount: Number(record.taxableAmount ?? 0),
		withheldIsr: Number(record.withheldIsr ?? 0),
		netAmount: Number(record.netAmount ?? 0),
		createdAt: new Date(record.createdAt),
		updatedAt: new Date(record.updatedAt),
	};
}

/**
 * Normalizes Aguinaldo run payloads with numeric strings into typed values.
 *
 * @param record - Raw Aguinaldo run payload
 * @returns Normalized Aguinaldo run
 */
function normalizeAguinaldoRun(record: AguinaldoRunPayload): AguinaldoRun {
	return {
		...record,
		paymentDate: new Date(record.paymentDate),
		totalAmount: Number(record.totalAmount ?? 0),
		employeeCount: Number(record.employeeCount ?? 0),
		processedAt: record.processedAt ? new Date(record.processedAt) : null,
		cancelledAt: record.cancelledAt ? new Date(record.cancelledAt) : null,
		createdAt: new Date(record.createdAt),
		updatedAt: new Date(record.updatedAt),
	};
}

/**
 * Normalizes Aguinaldo run employee payloads with numeric strings into typed values.
 *
 * @param record - Raw Aguinaldo run employee payload
 * @returns Normalized Aguinaldo run employee
 */
function normalizeAguinaldoRunEmployee(record: AguinaldoRunEmployeePayload): AguinaldoRunEmployee {
	return {
		...record,
		daysCounted: Number(record.daysCounted ?? 0),
		dailySalaryBase: Number(record.dailySalaryBase ?? 0),
		aguinaldoDaysPolicy: Number(record.aguinaldoDaysPolicy ?? 0),
		yearDays: Number(record.yearDays ?? 0),
		grossAmount: Number(record.grossAmount ?? 0),
		exemptAmount: Number(record.exemptAmount ?? 0),
		taxableAmount: Number(record.taxableAmount ?? 0),
		withheldIsr: Number(record.withheldIsr ?? 0),
		netAmount: Number(record.netAmount ?? 0),
		createdAt: new Date(record.createdAt),
		updatedAt: new Date(record.updatedAt),
	};
}

export async function calculatePtu(params: {
	fiscalYear: number;
	paymentDateKey: string;
	taxableIncome: number;
	ptuPercentage?: number;
	includeInactive?: boolean;
	smgDailyOverride?: number;
	organizationId?: string;
	employeeOverrides?: PtuEmployeeOverride[];
}): Promise<PtuCalculationResult> {
	const response = await api.ptu.calculate.post({
		fiscalYear: params.fiscalYear,
		paymentDateKey: params.paymentDateKey,
		taxableIncome: params.taxableIncome,
		ptuPercentage: params.ptuPercentage,
		includeInactive: params.includeInactive,
		smgDailyOverride: params.smgDailyOverride,
		organizationId: params.organizationId,
		employeeOverrides: params.employeeOverrides,
	});

	if (response.error) {
		console.error('Failed to calculate PTU:', response.error, 'Status:', response.status);
		throw new Error('Failed to calculate PTU');
	}

	const payload = getApiResponseData(response)?.data as
		| {
				run: PtuRunPayload;
				employees: PtuRunEmployeePayload[];
				warnings?: ExtraPaymentWarning[];
		  }
		| undefined;
	if (!payload) {
		throw new Error('Failed to calculate PTU');
	}

	return {
		run: normalizePtuRun(payload.run),
		employees: payload.employees.map(normalizePtuRunEmployee),
		warnings: payload.warnings ?? [],
	};
}

export async function createPtuRun(params: {
	fiscalYear: number;
	paymentDateKey: string;
	taxableIncome: number;
	ptuPercentage?: number;
	includeInactive?: boolean;
	smgDailyOverride?: number;
	organizationId?: string;
	employeeOverrides?: PtuEmployeeOverride[];
}): Promise<PtuCalculationResult> {
	const response = await api.ptu.runs.post({
		fiscalYear: params.fiscalYear,
		paymentDateKey: params.paymentDateKey,
		taxableIncome: params.taxableIncome,
		ptuPercentage: params.ptuPercentage,
		includeInactive: params.includeInactive,
		smgDailyOverride: params.smgDailyOverride,
		organizationId: params.organizationId,
		employeeOverrides: params.employeeOverrides,
	});

	if (response.error) {
		console.error('Failed to create PTU run:', response.error, 'Status:', response.status);
		throw new Error('Failed to create PTU run');
	}

	const payload = getApiResponseData(response)?.data as
		| {
				run: PtuRunPayload;
				employees: PtuRunEmployeePayload[];
				warnings?: ExtraPaymentWarning[];
		  }
		| undefined;
	if (!payload) {
		throw new Error('Failed to create PTU run');
	}

	return {
		run: normalizePtuRun(payload.run),
		employees: payload.employees.map(normalizePtuRunEmployee),
		warnings: payload.warnings ?? [],
	};
}

export async function updatePtuRun(
	runId: string,
	params: {
		fiscalYear?: number;
		paymentDateKey?: string;
		taxableIncome?: number;
		ptuPercentage?: number;
		includeInactive?: boolean;
		smgDailyOverride?: number;
		organizationId?: string;
		employeeOverrides?: PtuEmployeeOverride[];
	},
): Promise<PtuCalculationResult> {
	const response = await api.ptu.runs[runId].put({
		fiscalYear: params.fiscalYear,
		paymentDateKey: params.paymentDateKey,
		taxableIncome: params.taxableIncome,
		ptuPercentage: params.ptuPercentage,
		includeInactive: params.includeInactive,
		smgDailyOverride: params.smgDailyOverride,
		organizationId: params.organizationId,
		employeeOverrides: params.employeeOverrides,
	});

	if (response.error) {
		console.error('Failed to update PTU run:', response.error, 'Status:', response.status);
		throw new Error('Failed to update PTU run');
	}

	const payload = getApiResponseData(response)?.data as
		| {
				run: PtuRunPayload;
				employees: PtuRunEmployeePayload[];
				warnings?: ExtraPaymentWarning[];
		  }
		| undefined;
	if (!payload) {
		throw new Error('Failed to update PTU run');
	}

	return {
		run: normalizePtuRun(payload.run),
		employees: payload.employees.map(normalizePtuRunEmployee),
		warnings: payload.warnings ?? [],
	};
}

export async function processPtuRun(runId: string): Promise<boolean> {
	const response = await api.ptu.runs[runId].process.post();
	if (response.error) {
		console.error('Failed to process PTU run:', response.error, 'Status:', response.status);
		throw new Error('Failed to process PTU run');
	}
	return true;
}

export async function cancelPtuRun(runId: string, reason: string): Promise<boolean> {
	const response = await api.ptu.runs[runId].cancel.post({ reason });
	if (response.error) {
		console.error('Failed to cancel PTU run:', response.error, 'Status:', response.status);
		throw new Error('Failed to cancel PTU run');
	}
	return true;
}

export async function fetchPtuRuns(params?: {
	organizationId?: string;
	fiscalYear?: number;
	limit?: number;
	offset?: number;
}): Promise<PtuRun[]> {
	const query = {
		limit: params?.limit ?? 50,
		offset: params?.offset ?? 0,
		...(params?.organizationId ? { organizationId: params.organizationId } : {}),
		...(typeof params?.fiscalYear === 'number' ? { fiscalYear: params.fiscalYear } : {}),
	};

	const response = await api.ptu.runs.get({
		$query: query,
	});

	if (response.error) {
		console.error('Failed to fetch PTU runs:', response.error, 'Status:', response.status);
		throw new Error('Failed to fetch PTU runs');
	}

	const runs = (getApiResponseData(response)?.data as PtuRunPayload[] | undefined) ?? [];
	return runs.map(normalizePtuRun);
}

export async function fetchPtuRunDetail(
	runId: string,
): Promise<{ run: PtuRun; employees: PtuRunEmployee[] } | null> {
	const response = await api.ptu.runs[runId].get();

	if (response.error) {
		console.error(
			'Failed to fetch PTU run detail:',
			response.error,
			'Status:',
			response.status,
		);
		return null;
	}

	const payload = getApiResponseData(response)?.data as
		| { run: PtuRunPayload; employees: PtuRunEmployeePayload[] }
		| undefined;
	if (!payload) {
		return null;
	}

	return {
		run: normalizePtuRun(payload.run),
		employees: payload.employees.map(normalizePtuRunEmployee),
	};
}

export async function calculateAguinaldo(params: {
	calendarYear: number;
	paymentDateKey: string;
	includeInactive?: boolean;
	smgDailyOverride?: number;
	organizationId?: string;
	employeeOverrides?: AguinaldoEmployeeOverride[];
}): Promise<AguinaldoCalculationResult> {
	const response = await api.aguinaldo.calculate.post({
		calendarYear: params.calendarYear,
		paymentDateKey: params.paymentDateKey,
		includeInactive: params.includeInactive,
		smgDailyOverride: params.smgDailyOverride,
		organizationId: params.organizationId,
		employeeOverrides: params.employeeOverrides,
	});

	if (response.error) {
		console.error('Failed to calculate Aguinaldo:', response.error, 'Status:', response.status);
		throw new Error('Failed to calculate Aguinaldo');
	}

	const payload = getApiResponseData(response)?.data as
		| {
				run: AguinaldoRunPayload;
				employees: AguinaldoRunEmployeePayload[];
				warnings?: ExtraPaymentWarning[];
		  }
		| undefined;
	if (!payload) {
		throw new Error('Failed to calculate Aguinaldo');
	}

	return {
		run: normalizeAguinaldoRun(payload.run),
		employees: payload.employees.map(normalizeAguinaldoRunEmployee),
		warnings: payload.warnings ?? [],
	};
}

export async function createAguinaldoRun(params: {
	calendarYear: number;
	paymentDateKey: string;
	includeInactive?: boolean;
	smgDailyOverride?: number;
	organizationId?: string;
	employeeOverrides?: AguinaldoEmployeeOverride[];
}): Promise<AguinaldoCalculationResult> {
	const response = await api.aguinaldo.runs.post({
		calendarYear: params.calendarYear,
		paymentDateKey: params.paymentDateKey,
		includeInactive: params.includeInactive,
		smgDailyOverride: params.smgDailyOverride,
		organizationId: params.organizationId,
		employeeOverrides: params.employeeOverrides,
	});

	if (response.error) {
		console.error(
			'Failed to create Aguinaldo run:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to create Aguinaldo run');
	}

	const payload = getApiResponseData(response)?.data as
		| {
				run: AguinaldoRunPayload;
				employees: AguinaldoRunEmployeePayload[];
				warnings?: ExtraPaymentWarning[];
		  }
		| undefined;
	if (!payload) {
		throw new Error('Failed to create Aguinaldo run');
	}

	return {
		run: normalizeAguinaldoRun(payload.run),
		employees: payload.employees.map(normalizeAguinaldoRunEmployee),
		warnings: payload.warnings ?? [],
	};
}

export async function updateAguinaldoRun(
	runId: string,
	params: {
		calendarYear?: number;
		paymentDateKey?: string;
		includeInactive?: boolean;
		smgDailyOverride?: number;
		organizationId?: string;
		employeeOverrides?: AguinaldoEmployeeOverride[];
	},
): Promise<AguinaldoCalculationResult> {
	const response = await api.aguinaldo.runs[runId].put({
		calendarYear: params.calendarYear,
		paymentDateKey: params.paymentDateKey,
		includeInactive: params.includeInactive,
		smgDailyOverride: params.smgDailyOverride,
		organizationId: params.organizationId,
		employeeOverrides: params.employeeOverrides,
	});

	if (response.error) {
		console.error(
			'Failed to update Aguinaldo run:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to update Aguinaldo run');
	}

	const payload = getApiResponseData(response)?.data as
		| {
				run: AguinaldoRunPayload;
				employees: AguinaldoRunEmployeePayload[];
				warnings?: ExtraPaymentWarning[];
		  }
		| undefined;
	if (!payload) {
		throw new Error('Failed to update Aguinaldo run');
	}

	return {
		run: normalizeAguinaldoRun(payload.run),
		employees: payload.employees.map(normalizeAguinaldoRunEmployee),
		warnings: payload.warnings ?? [],
	};
}

export async function processAguinaldoRun(runId: string): Promise<boolean> {
	const response = await api.aguinaldo.runs[runId].process.post();
	if (response.error) {
		console.error(
			'Failed to process Aguinaldo run:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to process Aguinaldo run');
	}
	return true;
}

export async function cancelAguinaldoRun(runId: string, reason: string): Promise<boolean> {
	const response = await api.aguinaldo.runs[runId].cancel.post({ reason });
	if (response.error) {
		console.error(
			'Failed to cancel Aguinaldo run:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to cancel Aguinaldo run');
	}
	return true;
}

export async function fetchAguinaldoRuns(params?: {
	organizationId?: string;
	calendarYear?: number;
	limit?: number;
	offset?: number;
}): Promise<AguinaldoRun[]> {
	const query = {
		limit: params?.limit ?? 50,
		offset: params?.offset ?? 0,
		...(params?.organizationId ? { organizationId: params.organizationId } : {}),
		...(typeof params?.calendarYear === 'number' ? { calendarYear: params.calendarYear } : {}),
	};

	const response = await api.aguinaldo.runs.get({
		$query: query,
	});

	if (response.error) {
		console.error(
			'Failed to fetch Aguinaldo runs:',
			response.error,
			'Status:',
			response.status,
		);
		throw new Error('Failed to fetch Aguinaldo runs');
	}

	const runs = (getApiResponseData(response)?.data as AguinaldoRunPayload[] | undefined) ?? [];
	return runs.map(normalizeAguinaldoRun);
}

export async function fetchAguinaldoRunDetail(
	runId: string,
): Promise<{ run: AguinaldoRun; employees: AguinaldoRunEmployee[] } | null> {
	const response = await api.aguinaldo.runs[runId].get();

	if (response.error) {
		console.error(
			'Failed to fetch Aguinaldo run detail:',
			response.error,
			'Status:',
			response.status,
		);
		return null;
	}

	const payload = getApiResponseData(response)?.data as
		| { run: AguinaldoRunPayload; employees: AguinaldoRunEmployeePayload[] }
		| undefined;
	if (!payload) {
		return null;
	}

	return {
		run: normalizeAguinaldoRun(payload.run),
		employees: payload.employees.map(normalizeAguinaldoRunEmployee),
	};
}

export async function fetchEmployeePtuHistory(employeeId: string): Promise<PtuHistoryRecord[]> {
	const response = await api.employees[employeeId]['ptu-history'].get();

	if (response.error) {
		console.error('Failed to fetch PTU history:', response.error, 'Status:', response.status);
		throw new Error('Failed to fetch PTU history');
	}

	const payload =
		(getApiResponseData(response)?.data as
			| Array<
					PtuHistoryRecord & {
						amount?: number | string;
						createdAt: string | Date;
						updatedAt: string | Date;
					}
			  >
			| undefined) ?? [];
	return payload.map((record) => ({
		...record,
		amount: Number(record.amount ?? 0),
		createdAt: new Date(record.createdAt),
		updatedAt: new Date(record.updatedAt),
	}));
}

export async function upsertEmployeePtuHistory(
	employeeId: string,
	params: { fiscalYear: number; amount: number },
): Promise<PtuHistoryRecord> {
	const response = await api.employees[employeeId]['ptu-history'].post({
		fiscalYear: params.fiscalYear,
		amount: params.amount,
	});

	if (response.error) {
		console.error('Failed to upsert PTU history:', response.error, 'Status:', response.status);
		throw new Error('Failed to upsert PTU history');
	}

	const payload = getApiResponseData(response)?.data as
		| (PtuHistoryRecord & {
				amount?: number | string;
				createdAt: string | Date;
				updatedAt: string | Date;
		  })
		| undefined;
	if (!payload) {
		throw new Error('Failed to upsert PTU history');
	}

	return {
		...payload,
		amount: Number(payload.amount ?? 0),
		createdAt: new Date(payload.createdAt),
		updatedAt: new Date(payload.updatedAt),
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

	const employeesPayload = getApiResponseData(employeesRes);
	const devicesPayload = getApiResponseData(devicesRes);
	const locationsPayload = getApiResponseData(locationsRes);
	const organizationsPayload = getApiResponseData(organizationsRes);
	const attendancePayload = getApiResponseData(attendanceRes);

	return {
		employees: employeesPayload?.pagination?.total ?? 0,
		devices: devicesPayload?.pagination?.total ?? 0,
		locations: locationsPayload?.pagination?.total ?? 0,
		organizations: organizationsPayload?.length ?? 0,
		attendance: attendancePayload?.pagination?.total ?? 0,
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

	const payload = getApiResponseData(response);
	return (payload ?? []) as ApiKey[];
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

	const payload = getApiResponseData(response);
	return (payload ?? []) as Organization[];
}

/**
 * Fetches the list of all organizations (superuser only).
 *
 * @param params - Optional query parameters for pagination, search, and sorting
 * @returns A promise resolving to the organizations response
 * @throws Error if the API request fails
 */
export async function fetchAllOrganizations(
	params?: OrganizationAllQueryParams,
): Promise<OrganizationsAllResponse> {
	const query: {
		limit: number;
		offset: number;
		search?: string;
		sortBy?: OrganizationAllQueryParams['sortBy'];
		sortDir?: OrganizationAllQueryParams['sortDir'];
	} = {
		limit: params?.limit ?? 50,
		offset: params?.offset ?? 0,
	};

	if (params?.search?.trim()) {
		query.search = params.search.trim();
	}
	if (params?.sortBy) {
		query.sortBy = params.sortBy;
	}
	if (params?.sortDir) {
		query.sortDir = params.sortDir;
	}

	const response = await api.organization.all.get({ $query: query });

	if (response.error) {
		throw new Error('Failed to fetch organizations');
	}

	const payload = getApiResponseData(response);
	return {
		organizations: (payload?.organizations ?? []) as Organization[],
		total: payload?.total ?? 0,
	};
}

// ============================================================================
// Organization Member Functions
// ============================================================================

export interface OrganizationMembersResponse {
	members: OrganizationMember[];
	total: number;
}

export async function fetchOrganizationMembers(params: {
	organizationId: string | null;
	limit?: number;
	offset?: number;
	search?: string;
}): Promise<OrganizationMembersResponse> {
	if (!params.organizationId) {
		return { members: [], total: 0 };
	}

	const query: {
		organizationId: string;
		limit: number;
		offset: number;
		search?: string;
	} = {
		organizationId: params.organizationId,
		limit: params.limit ?? 100,
		offset: params.offset ?? 0,
	};

	if (params.search?.trim()) {
		query.search = params.search.trim();
	}

	const response = await api.organization.members.get({ $query: query });

	if (response.error) {
		throw new Error('Failed to fetch organization members');
	}

	const payload = getApiResponseData(response);
	return {
		members: (payload?.members ?? []) as OrganizationMember[],
		total: payload?.total ?? 0,
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

	const payload = getApiResponseData(response);
	return (payload?.users ?? []) as User[];
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
	reason?: string | null;
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
		search?: string;
	} = {
		limit: params?.limit ?? 100,
		offset: params?.offset ?? 0,
		organizationId: params.organizationId,
	};

	if (params?.search?.trim()) {
		query.search = params.search.trim();
	}

	const response = await api['schedule-templates'].get({ $query: query });

	if (response.error) {
		throw new Error('Failed to fetch schedule templates');
	}

	const payload = getApiResponseData(response);
	return {
		data: (payload?.data ?? []) as ScheduleTemplate[],
		pagination: payload?.pagination ?? { total: 0, limit: 100, offset: 0 },
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

	const payload = getApiResponseData(response);
	return (payload?.data as ScheduleTemplate) ?? null;
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

	const payload = getApiResponseData(response);
	return {
		data: (payload?.data ?? []) as ScheduleException[],
		pagination: payload?.pagination ?? { total: 0, limit: 100, offset: 0 },
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

	const payload = getApiResponseData(response);
	return (payload?.data ?? []) as CalendarEmployee[];
}
