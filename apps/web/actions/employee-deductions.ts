'use server';

import { headers } from 'next/headers';

import type { EmployeeDeduction } from '@/lib/client-functions';
import { createServerApiClient } from '@/lib/server-api';

export interface MutationResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

export interface CreateEmployeeDeductionInput {
	organizationId: string;
	employeeId: string;
	type: EmployeeDeduction['type'];
	label: string;
	calculationMethod: EmployeeDeduction['calculationMethod'];
	value: number;
	frequency: EmployeeDeduction['frequency'];
	totalInstallments?: number;
	totalAmount?: number;
	remainingAmount?: number;
	startDateKey: string;
	endDateKey?: string;
	referenceNumber?: string;
	satDeductionCode?: string;
	notes?: string;
}

export interface UpdateEmployeeDeductionInput {
	organizationId: string;
	employeeId: string;
	id: string;
	label?: string;
	value?: number;
	frequency?: EmployeeDeduction['frequency'];
	totalInstallments?: number | null;
	totalAmount?: number | null;
	remainingAmount?: number | null;
	status?: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
	startDateKey?: string;
	endDateKey?: string | null;
	referenceNumber?: string | null;
	satDeductionCode?: string | null;
	notes?: string | null;
}

/**
 * Extracts a readable API error message from a mutation response.
 *
 * @param error - Unknown response error payload
 * @param fallbackMessage - Fallback message when the payload has no detail
 * @returns Human-readable error message
 */
function getApiErrorMessage(error: unknown, fallbackMessage: string): string {
	if (!error || typeof error !== 'object') {
		return fallbackMessage;
	}

	const directMessage = (error as { message?: unknown }).message;
	if (typeof directMessage === 'string' && directMessage.trim()) {
		return directMessage;
	}

	const nestedMessage = (
		error as {
			value?: {
				error?: {
					message?: unknown;
				};
			};
		}
	).value?.error?.message;
	if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
		return nestedMessage;
	}

	return fallbackMessage;
}

/**
 * Resolves the forwarded cookie header for authenticated server actions.
 *
 * @returns Cookie header string
 */
async function getCookieHeader(): Promise<string> {
	const requestHeaders = await headers();
	return requestHeaders.get('cookie') ?? '';
}

/**
 * Creates a new employee deduction.
 *
 * @param input - Deduction creation payload
 * @returns Mutation result with API response payload
 */
export async function createEmployeeDeductionAction(
	input: CreateEmployeeDeductionInput,
): Promise<MutationResult> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.organizations[input.organizationId].employees[
			input.employeeId
		].deductions.post({
			type: input.type,
			label: input.label.trim(),
			calculationMethod: input.calculationMethod,
			value: input.value,
			frequency: input.frequency,
			totalInstallments: input.totalInstallments,
			totalAmount: input.totalAmount,
			remainingAmount: input.remainingAmount,
			startDateKey: input.startDateKey,
			endDateKey: input.endDateKey?.trim() ? input.endDateKey.trim() : undefined,
			referenceNumber: input.referenceNumber?.trim()
				? input.referenceNumber.trim()
				: undefined,
			satDeductionCode: input.satDeductionCode?.trim()
				? input.satDeductionCode.trim()
				: undefined,
			notes: input.notes?.trim() ? input.notes.trim() : undefined,
		});

		if (response.error) {
			return {
				success: false,
				error: getApiErrorMessage(response.error, 'No se pudo crear el descuento'),
			};
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to create employee deduction:', error);
		return { success: false, error: 'No se pudo crear el descuento' };
	}
}

/**
 * Updates an existing employee deduction.
 *
 * @param input - Deduction update payload
 * @returns Mutation result with API response payload
 */
export async function updateEmployeeDeductionAction(
	input: UpdateEmployeeDeductionInput,
): Promise<MutationResult> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.organizations[input.organizationId].employees[
			input.employeeId
		].deductions[input.id].put({
			label: input.label?.trim(),
			value: input.value,
			frequency: input.frequency,
			totalInstallments: input.totalInstallments,
			totalAmount: input.totalAmount,
			remainingAmount: input.remainingAmount,
			status: input.status,
			startDateKey: input.startDateKey,
			endDateKey:
				typeof input.endDateKey === 'string'
					? input.endDateKey.trim() || null
					: input.endDateKey,
			referenceNumber:
				typeof input.referenceNumber === 'string'
					? input.referenceNumber.trim() || null
					: input.referenceNumber,
			satDeductionCode:
				typeof input.satDeductionCode === 'string'
					? input.satDeductionCode.trim() || null
					: input.satDeductionCode,
			notes: typeof input.notes === 'string' ? input.notes.trim() || null : input.notes,
		});

		if (response.error) {
			return {
				success: false,
				error: getApiErrorMessage(response.error, 'No se pudo actualizar el descuento'),
			};
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to update employee deduction:', error);
		return { success: false, error: 'No se pudo actualizar el descuento' };
	}
}
