'use server';

/**
 * Server actions for employee CRUD operations.
 *
 * These actions are called from client components via useMutation
 * and execute on the server with full access to the API.
 *
 * All actions forward the caller's session cookies to the API
 * for proper authentication.
 *
 * @module actions/employees
 */

import type { EmployeeScheduleEntry, EmployeeStatus } from '@/lib/client-functions';
import { createServerApiClient } from '@/lib/server-api';
import type {
	EmployeeTerminationPreviewInput,
	EmployeeTerminationSettlement,
	EmploymentContractType,
	TerminationReason,
} from '@sen-checkin/types';
import { headers } from 'next/headers';

/**
 * Input data for creating a new employee.
 */
export interface CreateEmployeeInput {
	/** Unique employee code */
	code: string;
	/** Employee's first name */
	firstName: string;
	/** Employee's last name */
	lastName: string;
	/** Employee NSS (Número de Seguridad Social) */
	nss?: string;
	/** Employee RFC (Registro Federal de Contribuyentes) */
	rfc?: string;
	/** Employee's email address */
	email?: string;
	/** Employee's phone number */
	phone?: string;
	/** Job position ID (required for new employees) */
	jobPositionId: string;
	/** Location ID (required for new employees) */
	locationId: string;
	/** Employee's department */
	department?: string;
	/** Employee's status */
	status: EmployeeStatus;
	/** Employee hire date (YYYY-MM-DD) */
	hireDate?: string;
	/** Daily pay rate (salario diario) */
	dailyPay: number;
	/** Payment frequency */
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	/** Optional SBC daily override */
	sbcDailyOverride?: number;
	/** Employment type for PTU eligibility */
	employmentType?: 'PERMANENT' | 'EVENTUAL';
	/** Trust employee flag */
	isTrustEmployee?: boolean;
	/** Director/admin/general manager flag */
	isDirectorAdminGeneralManager?: boolean;
	/** Domestic worker flag */
	isDomesticWorker?: boolean;
	/** Platform worker flag */
	isPlatformWorker?: boolean;
	/** Annual platform hours */
	platformHoursYear?: number;
	/** PTU eligibility override */
	ptuEligibilityOverride?: 'DEFAULT' | 'INCLUDE' | 'EXCLUDE';
	/** Aguinaldo days override */
	aguinaldoDaysOverride?: number | null;
	/** Employee shift type */
	shiftType?: 'DIURNA' | 'NOCTURNA' | 'MIXTA';
	/** Optional linked user ID */
	userId?: string;
	/** Weekly schedule entries */
	schedule?: EmployeeScheduleEntry[];
}

/**
 * Input data for updating an existing employee.
 */
export interface UpdateEmployeeInput {
	/** The employee ID to update */
	id: string;
	/** Employee's first name */
	firstName: string;
	/** Employee's last name */
	lastName: string;
	/** Employee NSS (Número de Seguridad Social) */
	nss?: string | null;
	/** Employee RFC (Registro Federal de Contribuyentes) */
	rfc?: string | null;
	/** Employee's email address */
	email?: string;
	/** Employee's phone number */
	phone?: string;
	/** Job position ID (optional for updates, but non-nullable when present) */
	jobPositionId?: string;
	/** Location ID (required for updates) */
	locationId: string;
	/** Employee's department */
	department?: string;
	/** Employee's status */
	status: EmployeeStatus;
	/** Employee hire date (YYYY-MM-DD) */
	hireDate?: string | null;
	/** Daily pay rate (salario diario) */
	dailyPay?: number;
	/** Payment frequency */
	paymentFrequency?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	/** Optional SBC daily override */
	sbcDailyOverride?: number | null;
	/** Employment type for PTU eligibility */
	employmentType?: 'PERMANENT' | 'EVENTUAL';
	/** Trust employee flag */
	isTrustEmployee?: boolean;
	/** Director/admin/general manager flag */
	isDirectorAdminGeneralManager?: boolean;
	/** Domestic worker flag */
	isDomesticWorker?: boolean;
	/** Platform worker flag */
	isPlatformWorker?: boolean;
	/** Annual platform hours */
	platformHoursYear?: number;
	/** PTU eligibility override */
	ptuEligibilityOverride?: 'DEFAULT' | 'INCLUDE' | 'EXCLUDE';
	/** Aguinaldo days override */
	aguinaldoDaysOverride?: number | null;
	/** Employee shift type */
	shiftType?: 'DIURNA' | 'NOCTURNA' | 'MIXTA';
	/** Optional linked user ID (null to unlink) */
	userId?: string | null;
	/** Weekly schedule entries */
	schedule?: EmployeeScheduleEntry[];
}

/**
 * Result of a mutation operation.
 */
export interface MutationResult<T = unknown> {
	/** Whether the operation was successful */
	success: boolean;
	/** The data returned from the operation */
	data?: T;
	/** Error message if the operation failed */
	error?: string;
}

/**
 * Creates a new employee.
 *
 * @param input - The employee data to create
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await createEmployee({
 *   code: 'EMP001',
 *   firstName: 'John',
 *   lastName: 'Doe',
 *   jobPositionId: 'job-position-uuid',
 *   status: 'ACTIVE',
 * });
 * ```
 */
export async function createEmployee(input: CreateEmployeeInput): Promise<MutationResult> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);
		const hireDate = input.hireDate ? new Date(input.hireDate) : undefined;
		const resolvedUserId = input.userId?.trim();

		const resolvedNss = input.nss?.trim();
		const resolvedRfc = input.rfc?.trim();
		const response = await api.employees.post({
			code: input.code,
			firstName: input.firstName,
			lastName: input.lastName,
			nss: resolvedNss || undefined,
			rfc: resolvedRfc || undefined,
			email: input.email || undefined,
			phone: input.phone || undefined,
			jobPositionId: input.jobPositionId,
			locationId: input.locationId,
			department: input.department || undefined,
			status: input.status,
			hireDate,
			dailyPay: input.dailyPay,
			paymentFrequency: input.paymentFrequency,
			sbcDailyOverride: input.sbcDailyOverride ?? undefined,
			employmentType: input.employmentType ?? undefined,
			isTrustEmployee: input.isTrustEmployee ?? undefined,
			isDirectorAdminGeneralManager: input.isDirectorAdminGeneralManager ?? undefined,
			isDomesticWorker: input.isDomesticWorker ?? undefined,
			isPlatformWorker: input.isPlatformWorker ?? undefined,
			platformHoursYear: input.platformHoursYear ?? undefined,
			ptuEligibilityOverride: input.ptuEligibilityOverride ?? undefined,
			aguinaldoDaysOverride: input.aguinaldoDaysOverride ?? undefined,
			shiftType: input.shiftType ?? 'DIURNA',
			userId: resolvedUserId ? resolvedUserId : undefined,
			schedule: input.schedule?.map((entry) => ({
				dayOfWeek: entry.dayOfWeek,
				startTime: entry.startTime,
				endTime: entry.endTime,
				isWorkingDay: entry.isWorkingDay,
			})),
		});

		if (response.error) {
			return {
				success: false,
				error: 'Failed to create employee',
			};
		}

		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		console.error('Failed to create employee:', error);
		return {
			success: false,
			error: 'Failed to create employee',
		};
	}
}

/**
 * Updates an existing employee.
 *
 * @param input - The employee data to update
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await updateEmployee({
 *   id: 'employee-id',
 *   code: 'EMP001',
 *   firstName: 'John',
 *   lastName: 'Doe',
 *   status: 'ACTIVE',
 * });
 * ```
 */
export async function updateEmployee(input: UpdateEmployeeInput): Promise<MutationResult> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);
		const resolvedUserId =
			input.userId === undefined ? undefined : input.userId?.trim() || null;
		const resolvedHireDate =
			input.hireDate === undefined
				? undefined
				: input.hireDate === null
					? null
					: new Date(input.hireDate);
		const resolvedNss =
			input.nss === undefined ? undefined : input.nss?.trim() ? input.nss.trim() : null;
		const resolvedRfc =
			input.rfc === undefined ? undefined : input.rfc?.trim() ? input.rfc.trim() : null;

		const response = await api.employees[input.id].put({
			firstName: input.firstName,
			lastName: input.lastName,
			nss: resolvedNss,
			rfc: resolvedRfc,
			email: input.email || undefined,
			phone: input.phone || undefined,
			jobPositionId: input.jobPositionId || undefined,
			locationId: input.locationId,
			department: input.department || undefined,
			status: input.status,
			hireDate: resolvedHireDate,
			dailyPay: input.dailyPay,
			paymentFrequency: input.paymentFrequency,
			sbcDailyOverride:
				input.sbcDailyOverride === null ? null : (input.sbcDailyOverride ?? undefined),
			employmentType: input.employmentType ?? undefined,
			isTrustEmployee: input.isTrustEmployee ?? undefined,
			isDirectorAdminGeneralManager: input.isDirectorAdminGeneralManager ?? undefined,
			isDomesticWorker: input.isDomesticWorker ?? undefined,
			isPlatformWorker: input.isPlatformWorker ?? undefined,
			platformHoursYear: input.platformHoursYear ?? undefined,
			ptuEligibilityOverride: input.ptuEligibilityOverride ?? undefined,
			aguinaldoDaysOverride:
				input.aguinaldoDaysOverride === null
					? null
					: (input.aguinaldoDaysOverride ?? undefined),
			shiftType: input.shiftType,
			userId: resolvedUserId === undefined ? undefined : resolvedUserId,
			schedule: input.schedule?.map((entry) => ({
				dayOfWeek: entry.dayOfWeek,
				startTime: entry.startTime,
				endTime: entry.endTime,
				isWorkingDay: entry.isWorkingDay,
			})),
		});

		if (response.error) {
			return {
				success: false,
				error: 'Failed to update employee',
			};
		}

		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		console.error('Failed to update employee:', error);
		return {
			success: false,
			error: 'Failed to update employee',
		};
	}
}

/**
 * Deletes an employee.
 *
 * @param id - The employee ID to delete
 * @returns A promise resolving to the mutation result
 *
 * @example
 * ```ts
 * const result = await deleteEmployee('employee-id');
 * ```
 */
export async function deleteEmployee(id: string): Promise<MutationResult> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api.employees[id].delete();

		if (response.error) {
			return {
				success: false,
				error: 'Failed to delete employee',
			};
		}

		return {
			success: true,
		};
	} catch (error) {
		console.error('Failed to delete employee:', error);
		return {
			success: false,
			error: 'Failed to delete employee',
		};
	}
}

/**
 * Input data for termination preview/confirmation.
 */
export interface EmployeeTerminationActionInput extends EmployeeTerminationPreviewInput {
	/** Employee identifier */
	employeeId: string;
}

/**
 * Persisted termination settlement response payload.
 */
export interface EmployeeTerminationResult {
	/** Saved settlement record */
	settlement: {
		id: string;
		employeeId: string;
		organizationId: string | null;
		calculation: EmployeeTerminationSettlement;
		totalsGross: number;
		finiquitoTotalGross: number;
		liquidacionTotalGross: number;
		createdAt: string | Date;
	};
	/** Updated employee summary */
	employee: {
		id: string;
		status: EmployeeStatus;
		terminationDateKey: string | null;
		lastDayWorkedDateKey: string | null;
		terminationReason: TerminationReason | null;
		contractType: EmploymentContractType | null;
		terminationNotes: string | null;
	};
}

type EmployeeTerminationSettlementApi = Omit<
	EmployeeTerminationResult['settlement'],
	'totalsGross' | 'finiquitoTotalGross' | 'liquidacionTotalGross'
> & {
	totalsGross: string;
	finiquitoTotalGross: string;
	liquidacionTotalGross: string;
};

/**
 * Normalizes numeric string totals from the settlement record.
 *
 * @param settlement - Raw settlement payload from the API
 * @returns Settlement payload with numeric totals
 */
function normalizeSettlementTotals(
	settlement: EmployeeTerminationSettlementApi,
): EmployeeTerminationResult['settlement'] {
	return {
		...settlement,
		totalsGross: Number(settlement.totalsGross ?? 0),
		finiquitoTotalGross: Number(settlement.finiquitoTotalGross ?? 0),
		liquidacionTotalGross: Number(settlement.liquidacionTotalGross ?? 0),
	};
}

/**
 * Requests a termination settlement preview for an employee.
 *
 * @param input - Termination preview inputs
 * @returns A promise resolving to the preview result
 */
export async function previewEmployeeTermination(
	input: EmployeeTerminationActionInput,
): Promise<MutationResult<EmployeeTerminationSettlement>> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api.employees[input.employeeId].termination.preview.post({
			terminationDateKey: input.terminationDateKey,
			lastDayWorkedDateKey: input.lastDayWorkedDateKey ?? undefined,
			terminationReason: input.terminationReason,
			contractType: input.contractType,
			unpaidDays: input.unpaidDays,
			otherDue: input.otherDue,
			vacationBalanceDays: input.vacationBalanceDays ?? undefined,
			dailySalaryIndemnizacion: input.dailySalaryIndemnizacion ?? undefined,
			terminationNotes: input.terminationNotes ?? undefined,
		});

		if (response.error) {
			return {
				success: false,
				error: 'Failed to preview termination',
			};
		}

		const payload = response.data ?? null;
		if (!payload || 'error' in payload) {
			return {
				success: false,
				error: 'Failed to preview termination',
			};
		}

		return {
			success: true,
			data: payload.data,
		};
	} catch (error) {
		console.error('Failed to preview termination:', error);
		return {
			success: false,
			error: 'Failed to preview termination',
		};
	}
}

/**
 * Confirms an employee termination and persists the settlement.
 *
 * @param input - Termination inputs
 * @returns A promise resolving to the persisted settlement result
 */
export async function terminateEmployee(
	input: EmployeeTerminationActionInput,
): Promise<MutationResult<EmployeeTerminationResult>> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api.employees[input.employeeId].termination.post({
			terminationDateKey: input.terminationDateKey,
			lastDayWorkedDateKey: input.lastDayWorkedDateKey ?? undefined,
			terminationReason: input.terminationReason,
			contractType: input.contractType,
			unpaidDays: input.unpaidDays,
			otherDue: input.otherDue,
			vacationBalanceDays: input.vacationBalanceDays ?? undefined,
			dailySalaryIndemnizacion: input.dailySalaryIndemnizacion ?? undefined,
			terminationNotes: input.terminationNotes ?? undefined,
		});

		if (response.error) {
			return {
				success: false,
				error: 'Failed to terminate employee',
			};
		}

		const payload = response.data ?? null;
		if (!payload || 'error' in payload) {
			return {
				success: false,
				error: 'Failed to terminate employee',
			};
		}

		return {
			success: true,
			data: {
				...payload.data,
				settlement: normalizeSettlementTotals(payload.data.settlement),
			},
		};
	} catch (error) {
		console.error('Failed to terminate employee:', error);
		return {
			success: false,
			error: 'Failed to terminate employee',
		};
	}
}
