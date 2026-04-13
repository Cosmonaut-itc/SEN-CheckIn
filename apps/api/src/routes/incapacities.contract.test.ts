import { beforeAll, describe, expect, it } from 'bun:test';
import { format } from 'date-fns';

import { addDaysToDateKey } from '../utils/date-key.js';
import {
	createTestClient,
	getAdminSession,
	getSeedData,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

type ScheduleExceptionRow = {
	exceptionDate: string | Date;
	reason: string | null;
};

/**
 * Converts a date value into a YYYY-MM-DD key.
 *
 * @param value - Date value from the API
 * @returns Date key string
 */
function toDateKey(value: string | Date): string {
	const date = value instanceof Date ? value : new Date(value);
	return format(date, 'yyyy-MM-dd');
}

/**
 * Builds a map of schedule exception reasons by date key.
 *
 * @param exceptions - Schedule exception rows
 * @returns Map of date key to reason
 */
function buildReasonMap(exceptions: ScheduleExceptionRow[]): Map<string, string | null> {
	return new Map(exceptions.map((row) => [toDateKey(row.exceptionDate), row.reason ?? null]));
}

describe('incapacity routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
	});

	it('lists incapacity records', async () => {
		const response = await client.incapacities.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: { limit: 5, offset: 0 },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
	});

	it('creates, updates, and cancels incapacity records while syncing vacations', async () => {
		const vacationStart = '2030-02-11';
		const vacationEnd = addDaysToDateKey(vacationStart, 2);

		const createVacationResponse = await client.vacations.requests.post({
			employeeId: seed.employeeId,
			startDateKey: vacationStart,
			endDateKey: vacationEnd,
			status: 'SUBMITTED',
			requestedNotes: 'Solicitud para incapacidad',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createVacationResponse.status).toBe(200);
		const vacationPayload = requireResponseData(createVacationResponse);
		const vacationRequest = vacationPayload.data;
		if (!vacationRequest?.id) {
			throw new Error('Expected vacation request ID.');
		}

		const requestRoutes = requireRoute(
			client.vacations.requests[vacationRequest.id],
			'Vacation request route',
		);
		const approveRoute = requireRoute(requestRoutes.approve, 'Vacation approve route');
		const approveResponse = await approveRoute.post({
			decisionNotes: 'Aprobada para pruebas',
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(approveResponse.status).toBe(200);

		const scheduleBefore = await client['schedule-exceptions'].get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				employeeId: seed.employeeId,
				fromDate: new Date(`${vacationStart}T00:00:00Z`),
				toDate: new Date(`${vacationEnd}T23:59:59Z`),
				limit: 10,
				offset: 0,
			},
		});
		expect(scheduleBefore.status).toBe(200);
		const scheduleBeforePayload = requireResponseData(scheduleBefore);
		const scheduleBeforeMap = buildReasonMap(
			scheduleBeforePayload.data as ScheduleExceptionRow[],
		);
		expect(scheduleBeforeMap.get(vacationStart)).toBe('Vacaciones');

		const createIncapacityResponse = await client.incapacities.post({
			employeeId: seed.employeeId,
			caseId: 'INC-CASE-2030',
			type: 'EG',
			startDateKey: addDaysToDateKey(vacationStart, 1),
			endDateKey: vacationEnd,
			daysAuthorized: 2,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createIncapacityResponse.status).toBe(200);
		const incapacityPayload = requireResponseData(createIncapacityResponse);
		const incapacityRecord = incapacityPayload.data;
		if (!incapacityRecord?.id) {
			throw new Error('Expected incapacity record ID.');
		}

		const scheduleAfterCreate = await client['schedule-exceptions'].get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				employeeId: seed.employeeId,
				fromDate: new Date(`${vacationStart}T00:00:00Z`),
				toDate: new Date(`${vacationEnd}T23:59:59Z`),
				limit: 10,
				offset: 0,
			},
		});
		expect(scheduleAfterCreate.status).toBe(200);
		const scheduleAfterCreatePayload = requireResponseData(scheduleAfterCreate);
		const scheduleAfterCreateMap = buildReasonMap(
			scheduleAfterCreatePayload.data as ScheduleExceptionRow[],
		);
		expect(scheduleAfterCreateMap.get(vacationStart)).toBe('Vacaciones');
		expect(scheduleAfterCreateMap.get(addDaysToDateKey(vacationStart, 1))).toContain(
			'Incapacidad IMSS',
		);
		expect(scheduleAfterCreateMap.get(vacationEnd)).toContain('Incapacidad IMSS');

		const listAfterCreate = await client.vacations.requests.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				limit: 5,
				offset: 0,
				employeeId: seed.employeeId,
				from: vacationStart,
				to: vacationEnd,
			},
		});
		expect(listAfterCreate.status).toBe(200);
		const listAfterCreatePayload = requireResponseData(listAfterCreate);
		const updatedRequest = listAfterCreatePayload.data.find(
			(request) => request.id === vacationRequest.id,
		);
		if (!updatedRequest) {
			throw new Error('Expected updated vacation request.');
		}
		const dayMap = new Map(updatedRequest.days.map((day) => [day.dateKey, day]));
		expect(dayMap.get(vacationStart)?.countsAsVacationDay).toBe(true);
		expect(dayMap.get(addDaysToDateKey(vacationStart, 1))?.dayType).toBe('INCAPACITY');
		expect(dayMap.get(addDaysToDateKey(vacationStart, 1))?.countsAsVacationDay).toBe(false);

		const incapacityRoutes = requireRoute(
			client.incapacities[incapacityRecord.id],
			'Incapacity detail route',
		);
		const updateResponse = await incapacityRoutes.put({
			startDateKey: vacationStart,
			endDateKey: vacationEnd,
			daysAuthorized: 3,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(updateResponse.status).toBe(200);

		const scheduleAfterUpdate = await client['schedule-exceptions'].get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				employeeId: seed.employeeId,
				fromDate: new Date(`${vacationStart}T00:00:00Z`),
				toDate: new Date(`${vacationEnd}T23:59:59Z`),
				limit: 10,
				offset: 0,
			},
		});
		const scheduleAfterUpdatePayload = requireResponseData(scheduleAfterUpdate);
		const scheduleAfterUpdateMap = buildReasonMap(
			scheduleAfterUpdatePayload.data as ScheduleExceptionRow[],
		);
		expect(scheduleAfterUpdateMap.get(vacationStart)).toContain('Incapacidad IMSS');
		expect(scheduleAfterUpdateMap.get(addDaysToDateKey(vacationStart, 1))).toContain(
			'Incapacidad IMSS',
		);
		expect(scheduleAfterUpdateMap.get(vacationEnd)).toContain('Incapacidad IMSS');

		const cancelRoute = requireRoute(incapacityRoutes.cancel, 'Incapacity cancel route');
		const cancelResponse = await cancelRoute.post({
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(cancelResponse.status).toBe(200);

		const scheduleAfterCancel = await client['schedule-exceptions'].get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				employeeId: seed.employeeId,
				fromDate: new Date(`${vacationStart}T00:00:00Z`),
				toDate: new Date(`${vacationEnd}T23:59:59Z`),
				limit: 10,
				offset: 0,
			},
		});
		const scheduleAfterCancelPayload = requireResponseData(scheduleAfterCancel);
		const scheduleAfterCancelMap = buildReasonMap(
			scheduleAfterCancelPayload.data as ScheduleExceptionRow[],
		);
		expect(scheduleAfterCancelMap.get(vacationStart)).toBe('Vacaciones aprobadas');
		expect(scheduleAfterCancelMap.get(addDaysToDateKey(vacationStart, 1))).toBe(
			'Vacaciones aprobadas',
		);
		expect(scheduleAfterCancelMap.get(vacationEnd)).toBe('Vacaciones aprobadas');

		const listAfterCancel = await client.vacations.requests.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				limit: 5,
				offset: 0,
				employeeId: seed.employeeId,
				from: vacationStart,
				to: vacationEnd,
			},
		});
		const listAfterCancelPayload = requireResponseData(listAfterCancel);
		const revertedRequest = listAfterCancelPayload.data.find(
			(request) => request.id === vacationRequest.id,
		);
		if (!revertedRequest) {
			throw new Error('Expected reverted vacation request.');
		}
		const revertedDayMap = new Map(revertedRequest.days.map((day) => [day.dateKey, day]));
		expect(revertedDayMap.get(vacationStart)?.dayType).not.toBe('INCAPACITY');
		expect(revertedDayMap.get(addDaysToDateKey(vacationStart, 1))?.dayType).not.toBe(
			'INCAPACITY',
		);
	});

	it('allows vacation requests over active incapacities without consuming those days', async () => {
		const startDateKey = '2031-05-01';
		const endDateKey = addDaysToDateKey(startDateKey, 2);

		const createResponse = await client.incapacities.post({
			employeeId: seed.employeeId,
			caseId: 'INC-OVERLAP-2031',
			type: 'EG',
			startDateKey,
			endDateKey,
			daysAuthorized: 3,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect(createResponse.status).toBe(200);

		const vacationResponse = await client.vacations.requests.post({
			employeeId: seed.employeeId,
			startDateKey,
			endDateKey,
			status: 'SUBMITTED',
			requestedNotes: 'Intento con incapacidad',
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(vacationResponse.status).toBe(200);
		const vacationPayload = requireResponseData(vacationResponse);
		const request = vacationPayload.data;
		if (!request) {
			throw new Error('Expected vacation request payload.');
		}
		expect(request.summary?.totalDays).toBe(3);
		expect(request.summary?.vacationDays).toBe(0);
		for (const day of request.days) {
			expect(day.dayType).toBe('INCAPACITY');
			expect(day.countsAsVacationDay).toBe(false);
		}
	});

	it('presigns incapacity documents when bucket is configured or returns a configuration error', async () => {
		const createResponse = await client.incapacities.post({
			employeeId: seed.employeeId,
			caseId: 'INC-DOC-2032',
			type: 'EG',
			startDateKey: '2032-06-01',
			endDateKey: '2032-06-02',
			daysAuthorized: 2,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(200);
		const payload = requireResponseData(createResponse);
		if (!payload.data?.id) {
			throw new Error('Expected incapacity record ID for presign test.');
		}

		const incapacityRoutes = requireRoute(
			client.incapacities[payload.data.id],
			'Incapacity detail route',
		);
		const presignRoute = requireRoute(
			incapacityRoutes.documents?.presign,
			'Incapacity document presign route',
		);

		const presignResponse = await presignRoute.post({
			fileName: 'incapacidad.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1024,
			$headers: { cookie: adminSession.cookieHeader },
		});
		expect([200, 400]).toContain(presignResponse.status);
		if (presignResponse.status === 400) {
			const errorPayload = requireErrorResponse(presignResponse, 'incapacity presign');
			expect(errorPayload.error.code).toBe('INCAPACITY_BUCKET_NOT_CONFIGURED');
			return;
		}

		const presignPayload = requireResponseData(presignResponse);
		expect(typeof presignPayload.data?.url).toBe('string');
		expect(typeof presignPayload.data?.documentId).toBe('string');
		expect(typeof presignPayload.data?.objectKey).toBe('string');
		expect(typeof presignPayload.data?.fields).toBe('object');
	});
});
