import { beforeAll, describe, expect, it } from 'bun:test';
import { addDays, format } from 'date-fns';

import {
	createTestClient,
	getAdminSession,
	getSeedData,
	requireErrorResponse,
	requireResponseData,
	requireRoute,
} from '../test-utils/contract-helpers.js';

describe('scheduling routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;
	let seed: Awaited<ReturnType<typeof getSeedData>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
		seed = await getSeedData();
	});

	it('returns calendar schedules for a date range', async () => {
		const response = await client.scheduling.calendar.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				startDate: new Date(),
				endDate: addDays(new Date(), 7),
			},
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(Array.isArray(payload.data)).toBe(true);
	});

	it('includes exception reasons in calendar entries', async () => {
		const exceptionDate = addDays(new Date(), 14);
		const reason = 'Ausencia justificada';
		const createResponse = await client['schedule-exceptions'].post({
			employeeId: seed.employeeId,
			exceptionDate,
			exceptionType: 'DAY_OFF',
			reason,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(createResponse.status).toBe(201);
		const createPayload = requireResponseData(createResponse);
		const createdException = createPayload.data;
		if (!createdException) {
			throw new Error('Expected schedule exception record in create response.');
		}
		const exceptionId = createdException.id;
		if (!exceptionId) {
			throw new Error('Expected schedule exception ID in create response.');
		}

		const calendarResponse = await client.scheduling.calendar.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				startDate: exceptionDate,
				endDate: exceptionDate,
			},
		});

		expect(calendarResponse.status).toBe(200);
		const calendarPayload = requireResponseData(calendarResponse);
		const employeeEntry = calendarPayload.data.find(
			(entry) => entry.employeeId === seed.employeeId,
		);
		if (!employeeEntry) {
			throw new Error('Expected calendar entry for the seeded employee.');
		}

		const dateKey = format(exceptionDate, 'yyyy-MM-dd');
		const dayEntry = employeeEntry.days.find((day) => day.date === dateKey);
		if (!dayEntry) {
			throw new Error(`Expected calendar day entry for ${dateKey}.`);
		}

		expect(dayEntry.source).toBe('exception');
		expect(dayEntry.exceptionType).toBe('DAY_OFF');
		expect(dayEntry.reason).toBe(reason);

		const scheduleExceptionRoute = requireRoute(
			client['schedule-exceptions'][exceptionId],
			'Schedule exception route',
		);
		const deleteResponse = await scheduleExceptionRoute.delete({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(deleteResponse.status).toBe(200);
	});

	it('rejects invalid calendar date ranges', async () => {
		const response = await client.scheduling.calendar.get({
			$headers: { cookie: adminSession.cookieHeader },
			$query: {
				startDate: addDays(new Date(), 3),
				endDate: new Date(),
			},
		});

		expect(response.status).toBe(400);
		const errorPayload = requireErrorResponse(response, 'invalid calendar range');
		expect(errorPayload.error.message).toBe('startDate must be on or before endDate');
		expect(errorPayload.error.code).toBe('VALIDATION_ERROR');
	});

	it('assigns schedule templates to employees', async () => {
		const response = await client.scheduling['assign-template'].post({
			templateId: seed.scheduleTemplateId,
			employeeIds: [seed.employeeId],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.updated).toBeGreaterThan(0);
	});

	it('validates schedules without saving', async () => {
		const response = await client.scheduling.validate.post({
			shiftType: 'DIURNA',
			days: [
				{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isWorkingDay: true },
				{ dayOfWeek: 2, startTime: '09:00', endTime: '17:00', isWorkingDay: true },
				{ dayOfWeek: 3, startTime: '09:00', endTime: '17:00', isWorkingDay: true },
				{ dayOfWeek: 4, startTime: '09:00', endTime: '17:00', isWorkingDay: true },
				{ dayOfWeek: 5, startTime: '09:00', endTime: '17:00', isWorkingDay: true },
				{ dayOfWeek: 0, startTime: '00:00', endTime: '00:00', isWorkingDay: false },
			],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		const payload = requireResponseData(response);
		expect(payload.data?.validation).toBeDefined();
	});
});
