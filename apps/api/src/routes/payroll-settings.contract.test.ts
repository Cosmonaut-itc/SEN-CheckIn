import { beforeAll, describe, expect, it } from 'bun:test';

import { createTestClient, getAdminSession } from '../test-utils/contract-helpers.js';

describe('payroll settings routes (contract)', () => {
	let client: Awaited<ReturnType<typeof createTestClient>>;
	let adminSession: Awaited<ReturnType<typeof getAdminSession>>;

	beforeAll(async () => {
		client = createTestClient();
		adminSession = await getAdminSession();
	});

	it('returns payroll settings for the active organization', async () => {
		const response = await client['payroll-settings'].get({
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		expect(response.data?.data?.organizationId).toBeDefined();
	});

	it('updates payroll settings for the active organization', async () => {
		const response = await client['payroll-settings'].put({
			weekStartDay: 2,
			overtimeEnforcement: 'WARN',
			enableSeventhDayPay: true,
			$headers: { cookie: adminSession.cookieHeader },
		});

		expect(response.status).toBe(200);
		expect(response.data?.data?.weekStartDay).toBe(2);
	});
});
