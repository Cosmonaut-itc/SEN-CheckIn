import { beforeAll, describe, expect, it } from 'bun:test';
import { addDays } from 'date-fns';

import { createTestClient, getAdminSession, getSeedData } from '../test-utils/contract-helpers.js';

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
		expect(Array.isArray(response.data?.data)).toBe(true);
	});

	it('assigns schedule templates to employees', async () => {
		const response = await client.scheduling['assign-template'].post({
			templateId: seed.scheduleTemplateId,
			employeeIds: [seed.employeeId],
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		expect(response.data?.updated).toBeGreaterThan(0);
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
		expect(response.data?.data?.validation).toBeDefined();
	});
});
