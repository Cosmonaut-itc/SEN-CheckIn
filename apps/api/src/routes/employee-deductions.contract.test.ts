import { beforeAll, describe, expect, it } from 'bun:test';

import {
	createTestClient,
	getAdminSession,
	getSeedData,
	getUserSession,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

type RouteResponse<T> = Promise<{ status: number; data?: T; error?: { value?: unknown } | null }>;

type EmployeeDeductionsRoute = {
	post: (args: Record<string, unknown>) => RouteResponse<{
		data: { id: string; type: string; value: number; status: string };
	}>;
	get: (args: Record<string, unknown>) => RouteResponse<{ data: Array<{ id: string }> }>;
	[id: string]: unknown;
};

type EmployeeDeductionDetailRoute = {
	put: (args: Record<string, unknown>) => RouteResponse<{
		data: { status: string; notes: string | null };
	}>;
};

type OrganizationDeductionsRoute = {
	get: (args: Record<string, unknown>) => RouteResponse<{ data: Array<{ id: string }> }>;
};

/**
 * Resolves the organization-scoped employee deductions route from the typed client.
 *
 * @param client - Eden client
 * @param organizationId - Organization identifier
 * @param employeeId - Employee identifier
 * @returns Route object
 */
function getEmployeeDeductionsRoute(
	client: Awaited<ReturnType<typeof createTestClient>>,
	organizationId: string,
	employeeId: string,
): EmployeeDeductionsRoute | undefined {
	const organizations = client.organizations as unknown as Record<string, unknown>;
	const organizationRoute = organizations[organizationId] as Record<string, unknown> | undefined;
	const employeesRoute = organizationRoute?.employees as Record<string, unknown> | undefined;
	const employeeRoute = employeesRoute?.[employeeId] as Record<string, unknown> | undefined;
	return employeeRoute?.deductions as EmployeeDeductionsRoute | undefined;
}

/**
 * Resolves the organization-wide deductions route from the typed client.
 *
 * @param client - Eden client
 * @param organizationId - Organization identifier
 * @returns Route object
 */
function getOrganizationDeductionsRoute(
	client: Awaited<ReturnType<typeof createTestClient>>,
	organizationId: string,
): OrganizationDeductionsRoute | undefined {
	const organizations = client.organizations as unknown as Record<string, unknown>;
	const organizationRoute = organizations[organizationId] as Record<string, unknown> | undefined;
	return organizationRoute?.deductions as OrganizationDeductionsRoute | undefined;
}

describe('employee deduction routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let userSession: Awaited<ReturnType<typeof getUserSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		userSession = await getUserSession();
		seed = await getSeedData();
	});

	it('creates, lists, updates, and lists deductions organization-wide', async () => {
		const employeeRoute = requireRoute(
			getEmployeeDeductionsRoute(client, seed.organizationId, seed.employeeId),
			'Employee deductions route',
		);

		const createResponse = await employeeRoute.post({
			type: 'INFONAVIT',
			label: 'Credito INFONAVIT contrato',
			calculationMethod: 'PERCENTAGE_SBC',
			value: 10.25,
			frequency: 'RECURRING',
			startDateKey: '2026-03-01',
			referenceNumber: 'INF-C-001',
			satDeductionCode: '001',
			notes: 'Alta inicial',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		const createdPayload = requireResponseData(createResponse);
		const createdDeduction = createdPayload.data;
		expect(createdDeduction.type).toBe('INFONAVIT');
		expect(createdDeduction.value).toBe(10.25);
		expect(createdDeduction.status).toBe('ACTIVE');

		const listResponse = await employeeRoute.get({
			$query: { status: 'ACTIVE', type: 'INFONAVIT' },
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(listResponse.status).toBe(200);
		const employeeDeductions = requireResponseData(listResponse).data;
		expect(Array.isArray(employeeDeductions)).toBe(true);
		expect(employeeDeductions.some((item: { id: string }) => item.id === createdDeduction.id)).toBe(
			true,
		);

		const updateRoute = requireRoute(
			employeeRoute[createdDeduction.id] as EmployeeDeductionDetailRoute | undefined,
			'Single employee deduction route',
		);
		const updateResponse = await updateRoute.put({
			status: 'PAUSED',
			notes: 'Pausa temporal',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(updateResponse.status).toBe(200);
		const updatedDeduction = requireResponseData(updateResponse).data;
		expect(updatedDeduction.status).toBe('PAUSED');
		expect(updatedDeduction.notes).toBe('Pausa temporal');

		const organizationRoute = requireRoute(
			getOrganizationDeductionsRoute(client, seed.organizationId),
			'Organization deductions route',
		);
		const organizationListResponse = await organizationRoute.get({
			$query: { limit: 10, offset: 0, employeeId: seed.employeeId, status: 'PAUSED' },
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(organizationListResponse.status).toBe(200);
		const organizationDeductions = requireResponseData(organizationListResponse).data;
		expect(Array.isArray(organizationDeductions)).toBe(true);
		expect(
			organizationDeductions.some((item: { id: string }) => item.id === createdDeduction.id),
		).toBe(true);
	});

	it('rejects deduction creation for non-admin members', async () => {
		const employeeRoute = requireRoute(
			getEmployeeDeductionsRoute(client, seed.organizationId, seed.employeeId),
			'Employee deductions route',
		);

		const response = await employeeRoute.post({
			type: 'OTHER',
			label: 'Descuento no autorizado',
			calculationMethod: 'FIXED_AMOUNT',
			value: 200,
			frequency: 'ONE_TIME',
			startDateKey: '2026-03-01',
			$headers: { cookie: userSession.cookieHeader },
		});

		expect(response.status).toBe(403);
		const errorPayload = requireErrorResponse(response, 'employee deduction create');
		expect(errorPayload.error.message).toBe('Only owner/admin can manage employee deductions');
	});
});
