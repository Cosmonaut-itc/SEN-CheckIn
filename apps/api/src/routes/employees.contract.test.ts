import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import { calculateVacationAccrual, getServiceYearNumber } from '../services/vacations.js';
import {
	createTestClient,
	getAdminSession,
	getSeedData,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';
import { setupRekognitionMocks } from '../test-utils/contract-mocks.js';
import { addDaysToDateKey, toDateKeyUtc } from '../utils/date-key.js';
import { roundCurrency } from '../utils/money.js';

setupRekognitionMocks();

type VacationRequestDayPayload = {
	dateKey: string;
	countsAsVacationDay: boolean;
	serviceYearNumber: number | null;
};

type VacationRequestSummaryPayload = {
	totalDays: number;
	vacationDays: number;
};

type VacationRequestPayload = {
	id: string;
	status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
	days: VacationRequestDayPayload[];
	summary: VacationRequestSummaryPayload;
};

/**
 * Ensures a value matches the vacation request response shape.
 *
 * @param value - Unknown payload to validate
 * @returns Parsed vacation request payload
 * @throws Error when the payload is invalid
 */
function requireVacationRequestPayload(value: unknown): VacationRequestPayload {
	if (!value || typeof value !== 'object') {
		throw new Error('Expected vacation request payload to be an object.');
	}
	const record = value as {
		id?: unknown;
		status?: unknown;
		days?: unknown;
		summary?: unknown;
	};
	if (typeof record.id !== 'string' || !record.id) {
		throw new Error('Expected vacation request id in response.');
	}
	const status = record.status;
	if (
		status !== 'DRAFT' &&
		status !== 'SUBMITTED' &&
		status !== 'APPROVED' &&
		status !== 'REJECTED' &&
		status !== 'CANCELLED'
	) {
		throw new Error('Expected vacation request status in response.');
	}
	if (!Array.isArray(record.days)) {
		throw new Error('Expected vacation request days array in response.');
	}
	const days: VacationRequestDayPayload[] = record.days.map((day, index) => {
		if (!day || typeof day !== 'object') {
			throw new Error(`Expected vacation request day ${index} to be an object.`);
		}
		const dayRecord = day as {
			dateKey?: unknown;
			countsAsVacationDay?: unknown;
			serviceYearNumber?: unknown;
		};
		if (typeof dayRecord.dateKey !== 'string') {
			throw new Error(`Expected vacation request day ${index} to include dateKey.`);
		}
		if (typeof dayRecord.countsAsVacationDay !== 'boolean') {
			throw new Error(
				`Expected vacation request day ${index} to include countsAsVacationDay.`,
			);
		}
		const serviceYearNumber = dayRecord.serviceYearNumber;
		if (!(serviceYearNumber === null || typeof serviceYearNumber === 'number')) {
			throw new Error(`Expected vacation request day ${index} to include serviceYearNumber.`);
		}
		return {
			dateKey: dayRecord.dateKey,
			countsAsVacationDay: dayRecord.countsAsVacationDay,
			serviceYearNumber,
		};
	});

	if (!record.summary || typeof record.summary !== 'object') {
		throw new Error('Expected vacation request summary in response.');
	}
	const summaryRecord = record.summary as {
		totalDays?: unknown;
		vacationDays?: unknown;
	};
	if (
		typeof summaryRecord.totalDays !== 'number' ||
		typeof summaryRecord.vacationDays !== 'number'
	) {
		throw new Error('Expected vacation request summary totals in response.');
	}

	return {
		id: record.id,
		status,
		days,
		summary: {
			totalDays: summaryRecord.totalDays,
			vacationDays: summaryRecord.vacationDays,
		},
	};
}

describe('employee routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;
	let baseEmployeeId: string;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();

		const createResponse = await client.employees.post({
			code: `EMP-${randomUUID().slice(0, 8)}`,
			firstName: 'Empleado',
			lastName: 'Contrato',
			nss: '12345678901',
			rfc: 'CONM901211ABC',
			email: `empleado.${Date.now()}@example.com`,
			phone: '+52 55 1234 5678',
			jobPositionId: seed.jobPositionId,
			locationId: seed.locationId,
			organizationId: seed.organizationId,
			scheduleTemplateId: seed.scheduleTemplateId,
			status: 'ACTIVE',
			dailyPay: 450,
			paymentFrequency: 'BIWEEKLY',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		const createPayload = requireResponseData(createResponse);
		const createdEmployee = createPayload.data;
		if (!createdEmployee) {
			throw new Error('Expected employee record in create response.');
		}
		if (!createdEmployee.id) {
			throw new Error('Expected employee ID in create response.');
		}
		baseEmployeeId = createdEmployee.id;
	});

	afterAll(async () => {
		if (!baseEmployeeId) {
			return;
		}

		const employeeRoutes = requireRoute(client.employees[baseEmployeeId], 'Employee route');
		await employeeRoutes.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});
	});

	it('lists employees with pagination', async () => {
		const response = await client.employees.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
	});

	it('returns employee detail with schedule', async () => {
		const employeeRoutes = requireRoute(client.employees[baseEmployeeId], 'Employee route');
		const response = await employeeRoutes.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		const employeeRecord = payload.data;
		if (!employeeRecord) {
			throw new Error('Expected employee record in detail response.');
		}
		expect(employeeRecord.id).toBe(baseEmployeeId);
		expect(Array.isArray(employeeRecord.schedule)).toBe(true);
		expect(employeeRecord.nss).toBe('12345678901');
		expect(employeeRecord.rfc).toBe('CONM901211ABC');
	});

	it('updates an employee record', async () => {
		const employeeRoutes = requireRoute(client.employees[baseEmployeeId], 'Employee route');
		const response = await employeeRoutes.put({
			department: 'Operaciones',
			nss: '98765432109',
			rfc: 'CONM901211XYZ',
			hireDate: new Date('2024-02-01'),
			dailyPay: 500,
			paymentFrequency: 'MONTHLY',
			employmentType: 'PERMANENT',
			isTrustEmployee: true,
			isDirectorAdminGeneralManager: false,
			isDomesticWorker: false,
			isPlatformWorker: true,
			platformHoursYear: 320,
			ptuEligibilityOverride: 'INCLUDE',
			aguinaldoDaysOverride: 20,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		const employeeRecord = payload.data;
		if (!employeeRecord) {
			throw new Error('Expected employee record in update response.');
		}
		expect(employeeRecord.department).toBe('Operaciones');
		expect(employeeRecord.nss).toBe('98765432109');
		expect(employeeRecord.rfc).toBe('CONM901211XYZ');
		expect(employeeRecord.employmentType).toBe('PERMANENT');
		expect(employeeRecord.isTrustEmployee).toBe(true);
		expect(employeeRecord.isPlatformWorker).toBe(true);
		expect(Number(employeeRecord.platformHoursYear)).toBe(320);
		expect(employeeRecord.ptuEligibilityOverride).toBe('INCLUDE');
		expect(employeeRecord.aguinaldoDaysOverride).toBe(20);
	});

	it('manages PTU history records for an employee', async () => {
		const employeeRoutes = requireRoute(client.employees[baseEmployeeId], 'Employee route');
		const historyRoutes = requireRoute(
			employeeRoutes['ptu-history'],
			'Employee PTU history route',
		);

		const createResponse = await historyRoutes.post({
			fiscalYear: 2024,
			amount: 12000,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(200);
		const createPayload = requireResponseData(createResponse);
		const createdRecord = createPayload.data;
		if (!createdRecord) {
			throw new Error('Expected PTU history record in create response.');
		}
		expect(createdRecord.fiscalYear).toBe(2024);
		expect(Number(createdRecord.amount)).toBe(12000);

		const listResponse = await historyRoutes.get({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(listResponse.status).toBe(200);
		const listPayload = requireResponseData(listResponse);
		expect(Array.isArray(listPayload.data)).toBe(true);

		const updateResponse = await historyRoutes.put({
			fiscalYear: 2024,
			amount: 15000,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(updateResponse.status).toBe(200);
		const updatePayload = requireResponseData(updateResponse);
		const updatedRecord = updatePayload.data;
		if (!updatedRecord) {
			throw new Error('Expected PTU history record in update response.');
		}
		expect(Number(updatedRecord.amount)).toBe(15000);
	});

	it('returns insights for an employee', async () => {
		const employeeRoutes = requireRoute(client.employees[baseEmployeeId], 'Employee route');
		const insightsRoute = requireRoute(employeeRoutes.insights, 'Employee insights route');
		const response = await insightsRoute.get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		const insights = payload.data;
		if (!insights) {
			throw new Error('Expected insights data for employee.');
		}
		expect(insights.employeeId).toBe(baseEmployeeId);
	});

	it('returns audit events for an employee', async () => {
		const employeeRoutes = requireRoute(client.employees[baseEmployeeId], 'Employee route');
		const auditRoute = requireRoute(employeeRoutes.audit, 'Employee audit route');
		const response = await auditRoute.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 10, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
	});

	it('rejects termination when hire date is missing', async () => {
		let employeeId: string | null = null;
		try {
			const createResponse = await client.employees.post({
				code: `EMP-${randomUUID().slice(0, 8)}`,
				firstName: 'Sin',
				lastName: 'Ingreso',
				email: `sin.ingreso.${Date.now()}@example.com`,
				phone: '+52 55 2222 1111',
				jobPositionId: seed.jobPositionId,
				locationId: seed.locationId,
				organizationId: seed.organizationId,
				scheduleTemplateId: seed.scheduleTemplateId,
				status: 'ACTIVE',
				dailyPay: 450,
				paymentFrequency: 'MONTHLY',
				$headers: { cookie: adminSession.cookieHeader },
			});

			expect(createResponse.status).toBe(201);
			const createdEmployee = requireResponseData(createResponse).data;
			if (!createdEmployee?.id) {
				throw new Error('Expected employee record for termination validation test.');
			}
			employeeId = createdEmployee.id;

			const employeeRoutes = requireRoute(client.employees[employeeId], 'Employee route');
			const terminationRoute = requireRoute(
				employeeRoutes.termination,
				'Employee termination route',
			);
			const previewRoute = requireRoute(
				terminationRoute.preview,
				'Employee termination preview route',
			);

			const response = await previewRoute.post({
				terminationDateKey: '2026-01-15',
				terminationReason: 'voluntary_resignation',
				contractType: 'indefinite',
				unpaidDays: 0,
				otherDue: 0,
				vacationBalanceDays: 0,
				dailySalaryIndemnizacion: 600,
				$headers: { cookie: adminSession.cookieHeader },
			});

			expect(response.status).toBe(400);
			const errorPayload = requireErrorResponse(response, 'missing hire date');
			expect(errorPayload.error.message).toBe('Employee hire date is required');
			expect(errorPayload.error.code).toBe('MISSING_HIRE_DATE');
		} finally {
			if (employeeId) {
				const employeeRoutes = requireRoute(client.employees[employeeId], 'Employee route');
				await employeeRoutes.delete({
					$headers: { cookie: adminSession.cookieHeader },
				});
			}
		}
	});

	it('rejects termination when last day worked exceeds termination date', async () => {
		let employeeId: string | null = null;
		try {
			const createResponse = await client.employees.post({
				code: `EMP-${randomUUID().slice(0, 8)}`,
				firstName: 'Fechas',
				lastName: 'Invalidas',
				email: `fechas.invalidas.${Date.now()}@example.com`,
				phone: '+52 55 2222 3333',
				jobPositionId: seed.jobPositionId,
				locationId: seed.locationId,
				organizationId: seed.organizationId,
				scheduleTemplateId: seed.scheduleTemplateId,
				status: 'ACTIVE',
				hireDate: new Date('2024-01-01'),
				dailyPay: 450,
				paymentFrequency: 'MONTHLY',
				$headers: { cookie: adminSession.cookieHeader },
			});

			expect(createResponse.status).toBe(201);
			const createdEmployee = requireResponseData(createResponse).data;
			if (!createdEmployee?.id) {
				throw new Error('Expected employee record for termination date validation test.');
			}
			employeeId = createdEmployee.id;

			const employeeRoutes = requireRoute(client.employees[employeeId], 'Employee route');
			const terminationRoute = requireRoute(
				employeeRoutes.termination,
				'Employee termination route',
			);
			const previewRoute = requireRoute(
				terminationRoute.preview,
				'Employee termination preview route',
			);

			const response = await previewRoute.post({
				terminationDateKey: '2026-01-15',
				lastDayWorkedDateKey: '2026-01-20',
				terminationReason: 'voluntary_resignation',
				contractType: 'indefinite',
				unpaidDays: 0,
				otherDue: 0,
				vacationBalanceDays: 0,
				dailySalaryIndemnizacion: 600,
				$headers: { cookie: adminSession.cookieHeader },
			});

			expect(response.status).toBe(400);
			const errorPayload = requireErrorResponse(response, 'invalid last day worked');
			expect(errorPayload.error.message).toBe('Validation failed');
			expect(errorPayload.error.code).toBe('VALIDATION_ERROR');
		} finally {
			if (employeeId) {
				const employeeRoutes = requireRoute(client.employees[employeeId], 'Employee route');
				await employeeRoutes.delete({
					$headers: { cookie: adminSession.cookieHeader },
				});
			}
		}
	});

	it('rejects termination when termination date precedes hire date', async () => {
		let employeeId: string | null = null;
		try {
			const createResponse = await client.employees.post({
				code: `EMP-${randomUUID().slice(0, 8)}`,
				firstName: 'Fecha',
				lastName: 'Anterior',
				email: `fecha.anterior.${Date.now()}@example.com`,
				phone: '+52 55 2222 4444',
				jobPositionId: seed.jobPositionId,
				locationId: seed.locationId,
				organizationId: seed.organizationId,
				scheduleTemplateId: seed.scheduleTemplateId,
				status: 'ACTIVE',
				hireDate: new Date('2025-06-01'),
				dailyPay: 450,
				paymentFrequency: 'MONTHLY',
				$headers: { cookie: adminSession.cookieHeader },
			});

			expect(createResponse.status).toBe(201);
			const createdEmployee = requireResponseData(createResponse).data;
			if (!createdEmployee?.id) {
				throw new Error('Expected employee record for termination date validation test.');
			}
			employeeId = createdEmployee.id;

			const employeeRoutes = requireRoute(client.employees[employeeId], 'Employee route');
			const terminationRoute = requireRoute(
				employeeRoutes.termination,
				'Employee termination route',
			);
			const previewRoute = requireRoute(
				terminationRoute.preview,
				'Employee termination preview route',
			);

			const response = await previewRoute.post({
				terminationDateKey: '2025-05-31',
				terminationReason: 'voluntary_resignation',
				contractType: 'indefinite',
				unpaidDays: 0,
				otherDue: 0,
				vacationBalanceDays: 0,
				dailySalaryIndemnizacion: 600,
				$headers: { cookie: adminSession.cookieHeader },
			});

			expect(response.status).toBe(400);
			const errorPayload = requireErrorResponse(
				response,
				'termination date before hire date',
			);
			expect(errorPayload.error.message).toBe('Termination date cannot be before hire date');
			expect(errorPayload.error.code).toBe('INVALID_TERMINATION_DATE');
		} finally {
			if (employeeId) {
				const employeeRoutes = requireRoute(client.employees[employeeId], 'Employee route');
				await employeeRoutes.delete({
					$headers: { cookie: adminSession.cookieHeader },
				});
			}
		}
	});

	it('rejects termination when last day worked precedes hire date', async () => {
		let employeeId: string | null = null;
		try {
			const createResponse = await client.employees.post({
				code: `EMP-${randomUUID().slice(0, 8)}`,
				firstName: 'Ultimo',
				lastName: 'Dia',
				email: `ultimo.dia.${Date.now()}@example.com`,
				phone: '+52 55 2222 5555',
				jobPositionId: seed.jobPositionId,
				locationId: seed.locationId,
				organizationId: seed.organizationId,
				scheduleTemplateId: seed.scheduleTemplateId,
				status: 'ACTIVE',
				hireDate: new Date('2025-06-01'),
				dailyPay: 450,
				paymentFrequency: 'MONTHLY',
				$headers: { cookie: adminSession.cookieHeader },
			});

			expect(createResponse.status).toBe(201);
			const createdEmployee = requireResponseData(createResponse).data;
			if (!createdEmployee?.id) {
				throw new Error('Expected employee record for last day worked validation test.');
			}
			employeeId = createdEmployee.id;

			const employeeRoutes = requireRoute(client.employees[employeeId], 'Employee route');
			const terminationRoute = requireRoute(
				employeeRoutes.termination,
				'Employee termination route',
			);
			const previewRoute = requireRoute(
				terminationRoute.preview,
				'Employee termination preview route',
			);

			const response = await previewRoute.post({
				terminationDateKey: '2025-06-15',
				lastDayWorkedDateKey: '2025-05-31',
				terminationReason: 'voluntary_resignation',
				contractType: 'indefinite',
				unpaidDays: 0,
				otherDue: 0,
				vacationBalanceDays: 0,
				dailySalaryIndemnizacion: 600,
				$headers: { cookie: adminSession.cookieHeader },
			});

			expect(response.status).toBe(400);
			const errorPayload = requireErrorResponse(response, 'last day worked before hire date');
			expect(errorPayload.error.message).toBe('Last day worked cannot be before hire date');
			expect(errorPayload.error.code).toBe('INVALID_LAST_DAY_WORKED_DATE');
		} finally {
			if (employeeId) {
				const employeeRoutes = requireRoute(client.employees[employeeId], 'Employee route');
				await employeeRoutes.delete({
					$headers: { cookie: adminSession.cookieHeader },
				});
			}
		}
	});

	it('previews and confirms an employee termination', async () => {
		const createResponse = await client.employees.post({
			code: `EMP-${randomUUID().slice(0, 8)}`,
			firstName: 'Finiquito',
			lastName: 'Contrato',
			email: `finiquito.${Date.now()}@example.com`,
			phone: '+52 55 5555 1212',
			jobPositionId: seed.jobPositionId,
			locationId: seed.locationId,
			organizationId: seed.organizationId,
			scheduleTemplateId: seed.scheduleTemplateId,
			status: 'ACTIVE',
			hireDate: new Date('2024-01-01'),
			dailyPay: 500,
			paymentFrequency: 'MONTHLY',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		const createPayload = requireResponseData(createResponse);
		const createdEmployee = createPayload.data;
		if (!createdEmployee?.id) {
			throw new Error('Expected employee record for termination test.');
		}

		const employeeRoutes = requireRoute(client.employees[createdEmployee.id], 'Employee route');
		const terminationRoute = requireRoute(
			employeeRoutes.termination,
			'Employee termination route',
		);
		const previewRoute = requireRoute(
			terminationRoute.preview,
			'Employee termination preview route',
		);

		const previewResponse = await previewRoute.post({
			terminationDateKey: '2026-01-15',
			terminationReason: 'voluntary_resignation',
			contractType: 'indefinite',
			unpaidDays: 2,
			otherDue: 100,
			vacationBalanceDays: 5,
			dailySalaryIndemnizacion: 600,
			terminationNotes: 'Salida voluntaria',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(previewResponse.status).toBe(200);
		const previewPayload = requireResponseData(previewResponse);
		expect(previewPayload.data.breakdown.finiquito.salaryDue).toBe(1000);

		const terminateResponse = await terminationRoute.post({
			terminationDateKey: '2026-01-15',
			terminationReason: 'voluntary_resignation',
			contractType: 'indefinite',
			unpaidDays: 2,
			otherDue: 100,
			vacationBalanceDays: 5,
			dailySalaryIndemnizacion: 600,
			terminationNotes: 'Salida voluntaria',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(terminateResponse.status).toBe(200);
		const terminatePayload = requireResponseData(terminateResponse);
		expect(terminatePayload.data.employee.status).toBe('INACTIVE');
		expect(terminatePayload.data.employee.terminationDateKey).toBe('2026-01-15');
		expect(terminatePayload.data.settlement.calculation.breakdown.finiquito.salaryDue).toBe(
			1000,
		);

		const settlementRoute = requireRoute(
			terminationRoute.settlement,
			'Employee termination settlement route',
		);
		const settlementResponse = await settlementRoute.get({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(settlementResponse.status).toBe(200);
		const settlementPayload = requireResponseData(settlementResponse);
		expect(settlementPayload.data.employeeId).toBe(createdEmployee.id);

		const duplicateResponse = await terminationRoute.post({
			terminationDateKey: '2026-01-15',
			terminationReason: 'voluntary_resignation',
			contractType: 'indefinite',
			unpaidDays: 2,
			otherDue: 100,
			vacationBalanceDays: 5,
			dailySalaryIndemnizacion: 600,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(duplicateResponse.status).toBe(409);

		await employeeRoutes.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});
	});

	it('returns latest payroll run details for an employee', async () => {
		let employeeId: string | null = null;
		try {
			const createResponse = await client.employees.post({
				code: `EMP-${randomUUID().slice(0, 8)}`,
				firstName: 'Nomina',
				lastName: 'Latest',
				email: `nomina.latest.${Date.now()}@example.com`,
				phone: '+52 55 9999 1111',
				jobPositionId: seed.jobPositionId,
				locationId: seed.locationId,
				organizationId: seed.organizationId,
				scheduleTemplateId: seed.scheduleTemplateId,
				status: 'ACTIVE',
				hireDate: new Date('2024-01-01'),
				dailyPay: 420,
				paymentFrequency: 'MONTHLY',
				$headers: { cookie: adminSession.cookieHeader },
			});

			expect(createResponse.status).toBe(201);
			const createdEmployee = requireResponseData(createResponse).data;
			if (!createdEmployee?.id) {
				throw new Error('Expected employee record for payroll latest test.');
			}
			const resolvedEmployeeId = createdEmployee.id;
			employeeId = resolvedEmployeeId;

			const todayKey = toDateKeyUtc(new Date());
			const startKey = addDaysToDateKey(todayKey, -7);

			const processResponse = await client.payroll.process.post({
				periodStartDateKey: startKey,
				periodEndDateKey: todayKey,
				paymentFrequency: 'MONTHLY',
				$headers: { cookie: adminSession.cookieHeader },
			});

			expect(processResponse.status).toBe(200);
			const processPayload = requireResponseData(processResponse);
			const runId = (processPayload.data as { run?: { id?: string } }).run?.id;
			if (!runId) {
				throw new Error('Expected payroll run id for payroll latest test.');
			}

			const employeeRoutes = requireRoute(
				client.employees[resolvedEmployeeId],
				'Employee route',
			);
			const payrollLatestRoute = requireRoute(
				employeeRoutes.payroll.latest,
				'Employee payroll latest route',
			);
			const latestResponse = await payrollLatestRoute.get({
				$headers: { cookie: adminSession.cookieHeader },
			});

			expect(latestResponse.status).toBe(200);
			const latestPayload = requireResponseData(latestResponse);
			if (!latestPayload.data) {
				throw new Error('Expected latest payroll data payload.');
			}
			expect(latestPayload.data.payrollRunId).toBe(runId);
			expect(latestPayload.data.taxBreakdown).toBeDefined();
		} finally {
			if (employeeId) {
				const employeeRoutes = requireRoute(client.employees[employeeId], 'Employee route');
				await employeeRoutes.delete({
					$headers: { cookie: adminSession.cookieHeader },
				});
			}
		}
	});

	it('does not subtract future approved vacation days from termination payout', async () => {
		let employeeId: string | null = null;
		try {
			const hireDate = new Date('2024-01-01T00:00:00Z');
			const dailyPay = 500;

			const createEmployeeResponse = await client.employees.post({
				code: `EMP-${randomUUID().slice(0, 8)}`,
				firstName: 'Vacaciones',
				lastName: 'Finiquito',
				email: `vacaciones.finiquito.${Date.now()}@example.com`,
				phone: '+52 55 5555 9999',
				jobPositionId: seed.jobPositionId,
				locationId: seed.locationId,
				organizationId: seed.organizationId,
				scheduleTemplateId: seed.scheduleTemplateId,
				status: 'ACTIVE',
				hireDate,
				dailyPay,
				paymentFrequency: 'MONTHLY',
				$headers: { cookie: adminSession.cookieHeader },
			});

			expect(createEmployeeResponse.status).toBe(201);
			const createdEmployee = requireResponseData(createEmployeeResponse).data;
			if (!createdEmployee?.id) {
				throw new Error('Expected employee record for vacation/termination test.');
			}
			employeeId = createdEmployee.id;

			const startDateKey = '2026-12-07';
			const endDateKey = '2026-12-11';

			const createRequestResponse = await client.vacations.requests.post({
				employeeId,
				startDateKey,
				endDateKey,
				status: 'SUBMITTED',
				requestedNotes: 'Vacaciones futuras',
				$headers: { cookie: adminSession.cookieHeader },
			});

			expect(createRequestResponse.status).toBe(200);
			const createdRequest = requireVacationRequestPayload(
				requireResponseData(createRequestResponse).data,
			);

			const adminRequestRoutes = requireRoute(
				client.vacations.requests[createdRequest.id],
				'Vacation admin request route',
			);
			const approveRoute = requireRoute(
				adminRequestRoutes.approve,
				'Vacation request approve route',
			);
			const approveResponse = await approveRoute.post({
				decisionNotes: 'Aprobado',
				$headers: { cookie: adminSession.cookieHeader },
			});

			expect(approveResponse.status).toBe(200);
			const approvedRequest = requireVacationRequestPayload(
				requireResponseData(approveResponse).data,
			);
			expect(approvedRequest.status).toBe('APPROVED');

			const terminationDateKey = '2026-10-01';
			const terminationServiceYear = getServiceYearNumber(hireDate, terminationDateKey) ?? 0;
			expect(terminationServiceYear).toBeGreaterThan(0);

			const approvedVacationDays = approvedRequest.days.filter(
				(day) => day.countsAsVacationDay,
			);
			expect(approvedVacationDays.length).toBeGreaterThan(0);
			expect(approvedVacationDays.every((day) => day.dateKey > terminationDateKey)).toBe(
				true,
			);
			expect(
				approvedVacationDays.every(
					(day) => day.serviceYearNumber === terminationServiceYear,
				),
			).toBe(true);

			const employeeRoutes = requireRoute(client.employees[employeeId], 'Employee route');
			const terminationRoute = requireRoute(
				employeeRoutes.termination,
				'Employee termination route',
			);
			const previewRoute = requireRoute(
				terminationRoute.preview,
				'Employee termination preview route',
			);

			const previewResponse = await previewRoute.post({
				terminationDateKey,
				terminationReason: 'voluntary_resignation',
				contractType: 'indefinite',
				unpaidDays: 0,
				otherDue: 0,
				vacationBalanceDays: null,
				dailySalaryIndemnizacion: 600,
				terminationNotes: 'Prueba balance vacaciones',
				$headers: { cookie: adminSession.cookieHeader },
			});

			expect(previewResponse.status).toBe(200);
			const previewPayload = requireResponseData(previewResponse);
			const settlement = previewPayload.data;

			const serviceYearNumber = getServiceYearNumber(hireDate, terminationDateKey) ?? 0;
			const accrual = calculateVacationAccrual({
				hireDate,
				serviceYearNumber,
				asOfDateKey: terminationDateKey,
			});
			const expectedVacationBalanceDays = Math.max(0, accrual.accruedDays);
			const expectedVacationPay = roundCurrency(
				roundCurrency(dailyPay) * expectedVacationBalanceDays,
			);

			expect(settlement.inputsUsed.vacationBalanceDays).toBeCloseTo(
				expectedVacationBalanceDays,
				6,
			);
			expect(settlement.breakdown.finiquito.vacationPay).toBe(expectedVacationPay);
		} finally {
			if (employeeId) {
				const employeeRoutes = requireRoute(client.employees[employeeId], 'Employee route');
				await employeeRoutes.delete({
					$headers: { cookie: adminSession.cookieHeader },
				});
			}
		}
	});

	it('manages rekognition enrollment for an employee', async () => {
		const employeeRoutes = requireRoute(client.employees[baseEmployeeId], 'Employee route');
		const enrollFaceRoute = requireRoute(
			employeeRoutes['enroll-face'],
			'Employee enroll-face route',
		);
		const createUserRoute = requireRoute(
			employeeRoutes['create-rekognition-user'],
			'Employee create-rekognition-user route',
		);
		const deleteUserRoute = requireRoute(
			employeeRoutes['rekognition-user'],
			'Employee rekognition-user route',
		);
		const noUserResponse = await enrollFaceRoute.post({
			image: Buffer.from('test').toString('base64'),
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(noUserResponse.status).toBe(400);
		const noUserPayload = noUserResponse.error?.value as
			| { errorCode?: string; message?: string }
			| undefined;
		expect(noUserPayload?.errorCode).toBe('REKOGNITION_USER_MISSING');
		expect(noUserPayload?.message).toBe(
			'Employee does not have a Rekognition user. Create one first.',
		);

		const createUserResponse = await createUserRoute.post({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createUserResponse.status).toBe(200);
		const createUserPayload = requireResponseData(createUserResponse);
		expect(createUserPayload.success).toBe(true);

		const duplicateResponse = await createUserRoute.post({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(duplicateResponse.status).toBe(409);
		const duplicatePayload = duplicateResponse.error?.value as
			| { errorCode?: string; message?: string }
			| undefined;
		expect(duplicatePayload?.errorCode).toBe('REKOGNITION_USER_EXISTS');
		expect(duplicatePayload?.message).toBe('Employee already has a Rekognition user');

		const enrollResponse = await enrollFaceRoute.post({
			image: Buffer.from('enroll').toString('base64'),
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(enrollResponse.status).toBe(200);
		const enrollPayload = requireResponseData(enrollResponse);
		expect(enrollPayload.success).toBe(true);

		const deleteResponse = await deleteUserRoute.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(deleteResponse.status).toBe(200);
		const deletePayload = requireResponseData(deleteResponse);
		expect(deletePayload.success).toBe(true);
	});

	it('deletes an employee record', async () => {
		const createResponse = await client.employees.post({
			code: `EMP-${randomUUID().slice(0, 8)}`,
			firstName: 'Eliminar',
			lastName: 'Empleado',
			email: `delete.${Date.now()}@example.com`,
			phone: '+52 55 9999 0000',
			jobPositionId: seed.jobPositionId,
			locationId: seed.locationId,
			organizationId: seed.organizationId,
			scheduleTemplateId: seed.scheduleTemplateId,
			status: 'ACTIVE',
			dailyPay: 380,
			paymentFrequency: 'WEEKLY',
			$headers: { cookie: adminSession.cookieHeader },
		});

		const createPayload = requireResponseData(createResponse);
		const createdEmployee = createPayload.data;
		if (!createdEmployee) {
			throw new Error('Expected employee record in delete setup response.');
		}
		const employeeId = createdEmployee.id;
		if (!employeeId) {
			throw new Error('Expected employee ID in delete setup response.');
		}
		const employeeRoutes = requireRoute(client.employees[employeeId], 'Employee route');
		const deleteResponse = await employeeRoutes.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(deleteResponse.status).toBe(200);
	});
});
