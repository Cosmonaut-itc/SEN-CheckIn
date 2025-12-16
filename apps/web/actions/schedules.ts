'use server';

/**
 * Server actions for scheduling (templates, exceptions, assignments).
 */

import { headers } from 'next/headers';
import { createServerApiClient } from '@/lib/server-api';

export type ShiftType = 'DIURNA' | 'NOCTURNA' | 'MIXTA';
export type ScheduleExceptionType = 'DAY_OFF' | 'MODIFIED' | 'EXTRA_DAY';

export interface ScheduleTemplateDayInput {
	dayOfWeek: number;
	startTime: string;
	endTime: string;
	isWorkingDay?: boolean;
}

export interface CreateScheduleTemplateInput {
	name: string;
	description?: string | null;
	shiftType: ShiftType;
	organizationId?: string;
	days: ScheduleTemplateDayInput[];
}

export interface UpdateScheduleTemplateInput {
	id: string;
	name?: string;
	description?: string | null;
	shiftType?: ShiftType;
	organizationId?: string;
	days?: ScheduleTemplateDayInput[];
}

export interface CreateScheduleExceptionInput {
	employeeId: string;
	exceptionDate: Date;
	exceptionType: ScheduleExceptionType;
	startTime?: string;
	endTime?: string;
	reason?: string | null;
}

export interface UpdateScheduleExceptionInput {
	id: string;
	exceptionDate?: Date;
	exceptionType?: ScheduleExceptionType;
	startTime?: string | null;
	endTime?: string | null;
	reason?: string | null;
}

export interface MutationResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * Retrieves cookie header from the current request.
 *
 * @returns Cookie header string
 */
async function getCookieHeader(): Promise<string> {
	const requestHeaders = await headers();
	return requestHeaders.get('cookie') ?? '';
}

/**
 * Creates a new schedule template.
 *
 * @param input - Template creation payload
 * @returns Mutation result with created template
 */
export async function createScheduleTemplate(
	input: CreateScheduleTemplateInput,
): Promise<MutationResult> {
	try {
		const cookieHeader = await getCookieHeader();
		const api = createServerApiClient(cookieHeader);

		const response = await api['schedule-templates'].post({
			name: input.name,
			description: input.description ?? undefined,
			shiftType: input.shiftType,
			organizationId: input.organizationId,
			days: input.days.map((day) => ({
				dayOfWeek: day.dayOfWeek,
				startTime: day.startTime,
				endTime: day.endTime,
				isWorkingDay: day.isWorkingDay ?? true,
			})),
		});

		if (response.error) {
			return { success: false, error: 'Failed to create schedule template' };
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to create schedule template:', error);
		return { success: false, error: 'Failed to create schedule template' };
	}
}

/**
 * Updates an existing schedule template.
 *
 * @param input - Template update payload
 * @returns Mutation result with updated template
 */
export async function updateScheduleTemplate(
	input: UpdateScheduleTemplateInput,
): Promise<MutationResult> {
	try {
		const cookieHeader = await getCookieHeader();
		const api = createServerApiClient(cookieHeader);

		const response = await api['schedule-templates'][input.id].put({
			name: input.name,
			description: input.description,
			shiftType: input.shiftType,
			organizationId: input.organizationId,
			days: input.days?.map((day) => ({
				dayOfWeek: day.dayOfWeek,
				startTime: day.startTime,
				endTime: day.endTime,
				isWorkingDay: day.isWorkingDay ?? true,
			})),
		});

		if (response.error) {
			return { success: false, error: 'Failed to update schedule template' };
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to update schedule template:', error);
		return { success: false, error: 'Failed to update schedule template' };
	}
}

/**
 * Deletes a schedule template.
 *
 * @param id - Template identifier
 * @returns Mutation result
 */
export async function deleteScheduleTemplate(id: string): Promise<MutationResult> {
	try {
		const cookieHeader = await getCookieHeader();
		const api = createServerApiClient(cookieHeader);

		const response = await api['schedule-templates'][id].delete();
		if (response.error) {
			return { success: false, error: 'Failed to delete schedule template' };
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to delete schedule template:', error);
		return { success: false, error: 'Failed to delete schedule template' };
	}
}

/**
 * Creates a schedule exception for an employee.
 *
 * @param input - Exception creation payload
 * @returns Mutation result with created exception
 */
export async function createScheduleException(
	input: CreateScheduleExceptionInput,
): Promise<MutationResult> {
	try {
		const cookieHeader = await getCookieHeader();
		const api = createServerApiClient(cookieHeader);

		const response = await api['schedule-exceptions'].post({
			employeeId: input.employeeId,
			exceptionDate: input.exceptionDate,
			exceptionType: input.exceptionType,
			startTime: input.startTime,
			endTime: input.endTime,
			reason: input.reason ?? undefined,
		});

		if (response.error) {
			return { success: false, error: 'Failed to create schedule exception' };
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to create schedule exception:', error);
		return { success: false, error: 'Failed to create schedule exception' };
	}
}

/**
 * Updates an existing schedule exception.
 *
 * @param input - Exception update payload
 * @returns Mutation result with updated exception
 */
export async function updateScheduleException(
	input: UpdateScheduleExceptionInput,
): Promise<MutationResult> {
	try {
		const cookieHeader = await getCookieHeader();
		const api = createServerApiClient(cookieHeader);

		const response = await api['schedule-exceptions'][input.id].put({
			exceptionDate: input.exceptionDate,
			exceptionType: input.exceptionType,
			startTime: input.startTime ?? undefined,
			endTime: input.endTime ?? undefined,
			reason: input.reason,
		});

		if (response.error) {
			return { success: false, error: 'Failed to update schedule exception' };
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to update schedule exception:', error);
		return { success: false, error: 'Failed to update schedule exception' };
	}
}

/**
 * Deletes a schedule exception.
 *
 * @param id - Exception identifier
 * @returns Mutation result
 */
export async function deleteScheduleException(id: string): Promise<MutationResult> {
	try {
		const cookieHeader = await getCookieHeader();
		const api = createServerApiClient(cookieHeader);

		const response = await api['schedule-exceptions'][id].delete();
		if (response.error) {
			return { success: false, error: 'Failed to delete schedule exception' };
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to delete schedule exception:', error);
		return { success: false, error: 'Failed to delete schedule exception' };
	}
}

/**
 * Assigns a schedule template to employees.
 *
 * @param templateId - Template identifier
 * @param employeeIds - Employee identifiers to assign
 * @returns Mutation result
 */
export async function assignTemplateToEmployees(
	templateId: string,
	employeeIds: string[],
): Promise<MutationResult> {
	try {
		const cookieHeader = await getCookieHeader();
		const api = createServerApiClient(cookieHeader);

		const response = await api.scheduling['assign-template'].post({
			templateId,
			employeeIds,
		});

		if (response.error) {
			return { success: false, error: 'Failed to assign schedule template' };
		}

		return { success: true, data: response.data };
	} catch (error) {
		console.error('Failed to assign schedule template:', error);
		return { success: false, error: 'Failed to assign schedule template' };
	}
}
