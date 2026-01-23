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

		const response = await api.employees.post({
			code: input.code,
			firstName: input.firstName,
			lastName: input.lastName,
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

		const response = await api.employees[input.id].put({
			firstName: input.firstName,
			lastName: input.lastName,
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
				input.sbcDailyOverride === null ? null : input.sbcDailyOverride ?? undefined,
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
