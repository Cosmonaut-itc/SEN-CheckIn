'use server';

import { headers } from 'next/headers';

import { getApiResponseData } from '@/lib/api-response';
import { createServerApiClient } from '@/lib/server-api';
import type {
	EmployeeFiscalProfile,
	PayrollFiscalPreflightResult,
	SaveEmployeeFiscalProfileInput,
	OrganizationFiscalProfile,
	SaveOrganizationFiscalProfileInput,
} from '@/lib/fiscal-profiles';

export interface FiscalProfileActionResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

type DataEnvelope<T> = {
	data?: T | null;
};

/**
 * Reads the incoming cookie header for server-side API calls.
 *
 * @returns Cookie header value or an empty string
 */
async function getCookieHeader(): Promise<string> {
	const requestHeaders = await headers();
	return requestHeaders.get('cookie') ?? '';
}

/**
 * Extracts a standardized API error message from an Eden response.
 *
 * @param response - Eden response wrapper
 * @returns API error message when present
 */
function extractApiErrorMessage(response: unknown): string | null {
	const errorValue = (response as { error?: { value?: unknown } | null }).error?.value;
	if (!errorValue || typeof errorValue !== 'object') {
		return null;
	}

	const nestedError = (errorValue as { error?: unknown }).error;
	if (!nestedError || typeof nestedError !== 'object') {
		return null;
	}

	const message = (nestedError as { message?: unknown }).message;
	return typeof message === 'string' ? message : null;
}

/**
 * Reads the nested data value used by the API response envelope.
 *
 * @param response - Eden response wrapper
 * @returns Nested payload or null when the response has no payload
 */
function readEnvelopeData<T>(response: unknown): T | null {
	const payload = getApiResponseData<DataEnvelope<T>>(response as DataEnvelope<DataEnvelope<T>>);
	return payload?.data ?? null;
}

/**
 * Reads an organization fiscal profile through the server API client.
 *
 * @param organizationId - Organization identifier
 * @returns Action result with the organization fiscal profile or null
 */
export async function getOrganizationFiscalProfileAction(
	organizationId: string,
): Promise<FiscalProfileActionResult<OrganizationFiscalProfile | null>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.organizations[organizationId]['fiscal-profile'].get();

		if (response.error) {
			return {
				success: false,
				error:
					extractApiErrorMessage(response) ??
					'No se pudo cargar el perfil fiscal de la organización',
			};
		}

		return {
			success: true,
			data: readEnvelopeData<OrganizationFiscalProfile>(response),
		};
	} catch (error) {
		console.error('[fiscal-profiles:get-organization] Failed:', error);
		return {
			success: false,
			error: 'No se pudo cargar el perfil fiscal de la organización',
		};
	}
}

/**
 * Saves an organization fiscal profile through the server API client.
 *
 * @param input - Organization identifier and fiscal profile fields
 * @returns Action result with the saved organization fiscal profile or null
 */
export async function saveOrganizationFiscalProfileAction(
	input: SaveOrganizationFiscalProfileInput,
): Promise<FiscalProfileActionResult<OrganizationFiscalProfile | null>> {
	try {
		const { organizationId, ...profile } = input;
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.organizations[organizationId]['fiscal-profile'].put(profile);

		if (response.error) {
			return {
				success: false,
				error:
					extractApiErrorMessage(response) ??
					'No se pudo guardar el perfil fiscal de la organización',
			};
		}

		return {
			success: true,
			data: readEnvelopeData<OrganizationFiscalProfile>(response),
		};
	} catch (error) {
		console.error('[fiscal-profiles:save-organization] Failed:', error);
		return {
			success: false,
			error: 'No se pudo guardar el perfil fiscal de la organización',
		};
	}
}

/**
 * Reads an employee fiscal profile through the server API client.
 *
 * @param employeeId - Employee identifier
 * @returns Action result with the employee fiscal profile or null
 */
export async function getEmployeeFiscalProfileAction(
	employeeId: string,
): Promise<FiscalProfileActionResult<EmployeeFiscalProfile | null>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.employees[employeeId]['fiscal-profile'].get();

		if (response.error) {
			return {
				success: false,
				error:
					extractApiErrorMessage(response) ??
					'No se pudo cargar el perfil fiscal del empleado',
			};
		}

		return {
			success: true,
			data: readEnvelopeData<EmployeeFiscalProfile>(response),
		};
	} catch (error) {
		console.error('[fiscal-profiles:get-employee] Failed:', error);
		return {
			success: false,
			error: 'No se pudo cargar el perfil fiscal del empleado',
		};
	}
}

/**
 * Saves an employee fiscal profile through the server API client.
 *
 * @param input - Employee identifier and fiscal profile fields
 * @returns Action result with the saved employee fiscal profile or null
 */
export async function saveEmployeeFiscalProfileAction(
	input: SaveEmployeeFiscalProfileInput,
): Promise<FiscalProfileActionResult<EmployeeFiscalProfile | null>> {
	try {
		const { employeeId, ...profile } = input;
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.employees[employeeId]['fiscal-profile'].put(profile);

		if (response.error) {
			return {
				success: false,
				error:
					extractApiErrorMessage(response) ??
					'No se pudo guardar el perfil fiscal del empleado',
			};
		}

		return {
			success: true,
			data: readEnvelopeData<EmployeeFiscalProfile>(response),
		};
	} catch (error) {
		console.error('[fiscal-profiles:save-employee] Failed:', error);
		return {
			success: false,
			error: 'No se pudo guardar el perfil fiscal del empleado',
		};
	}
}

/**
 * Reads fiscal preflight validation for a payroll run through the server API client.
 *
 * @param runId - Payroll run identifier
 * @returns Action result with fiscal preflight validation data
 */
export async function getPayrollFiscalPreflightAction(
	runId: string,
): Promise<FiscalProfileActionResult<PayrollFiscalPreflightResult>> {
	try {
		const api = createServerApiClient(await getCookieHeader());
		const response = await api.payroll.runs[runId]['fiscal-preflight'].get({ $query: {} });

		if (response.error) {
			return {
				success: false,
				error:
					extractApiErrorMessage(response) ??
					'No se pudo cargar la validación fiscal de la nómina',
			};
		}

		const data = readEnvelopeData<PayrollFiscalPreflightResult>(response);
		if (!data) {
			return {
				success: false,
				error: 'La validación fiscal de la nómina no devolvió datos',
			};
		}

		return {
			success: true,
			data,
		};
	} catch (error) {
		console.error('[fiscal-profiles:get-preflight] Failed:', error);
		return {
			success: false,
			error: 'No se pudo cargar la validación fiscal de la nómina',
		};
	}
}
