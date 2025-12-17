'use server';

import { headers } from 'next/headers';

import { createServerApiClient } from '@/lib/server-api';

export interface UpdatePayrollSettingsInput {
	weekStartDay: number;
	overtimeEnforcement?: 'WARN' | 'BLOCK';
	additionalMandatoryRestDays?: string[];
	timeZone?: string;
	organizationId?: string;
}

export interface CalculatePayrollInput {
	periodStartDateKey: string;
	periodEndDateKey: string;
	paymentFrequency?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	organizationId?: string;
}

export type ProcessPayrollInput = CalculatePayrollInput;

export interface MutationResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

async function getCookieHeader(): Promise<string> {
	const requestHeaders = await headers();
	return requestHeaders.get('cookie') ?? '';
}

/**
 * Updates payroll settings for the active organization.
 *
 * @param input - Week start day and optional organization override
 * @returns Mutation result with saved settings
 */
export async function updatePayrollSettingsAction(
	input: UpdatePayrollSettingsInput,
): Promise<MutationResult> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api['payroll-settings'].put({
			weekStartDay: input.weekStartDay,
			overtimeEnforcement: input.overtimeEnforcement,
			additionalMandatoryRestDays: input.additionalMandatoryRestDays,
			timeZone: input.timeZone,
			organizationId: input.organizationId,
		});

		if (response.error) {
			return { success: false, error: 'Failed to update payroll settings' };
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to update payroll settings:', error);
		return { success: false, error: 'Failed to update payroll settings' };
	}
}

/**
 * Calculates payroll preview via server action.
 *
 * @param input - Period and payment frequency information
 * @returns Mutation result with calculation data
 */
export async function calculatePayrollAction(
	input: CalculatePayrollInput,
): Promise<MutationResult> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.payroll.calculate.post({
			periodStartDateKey: input.periodStartDateKey,
			periodEndDateKey: input.periodEndDateKey,
			paymentFrequency: input.paymentFrequency,
			organizationId: input.organizationId,
		});

		if (response.error) {
			return { success: false, error: 'Failed to calculate payroll' };
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to calculate payroll:', error);
		return { success: false, error: 'Failed to calculate payroll' };
	}
}

/**
 * Processes payroll and records a run via server action.
 *
 * @param input - Period and payment frequency information
 * @returns Mutation result with persisted run and calculation
 */
export async function processPayrollAction(input: ProcessPayrollInput): Promise<MutationResult> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.payroll.process.post({
			periodStartDateKey: input.periodStartDateKey,
			periodEndDateKey: input.periodEndDateKey,
			paymentFrequency: input.paymentFrequency,
			organizationId: input.organizationId,
		});

		if (response.error) {
			return { success: false, error: 'Failed to process payroll' };
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to process payroll:', error);
		return { success: false, error: 'Failed to process payroll' };
	}
}
